import Enrollment from '../models/Enrollment.js';
import Course from '../models/Course.js';
import User from '../models/User.js';
import { CourseProgress } from '../models/CourseProgress.js';
import { Purchase } from '../models/Purchase.js';
import { clerkClient } from '@clerk/clerk-sdk-node';

// Search courses by name or get all courses
export const searchCourses = async (req, res) => {
  try {
    const { query } = req.query;

    let searchFilter = { approvalStatus: 'approved' }; // Sử dụng approvalStatus thay vì status

    // Nếu có query thì tìm kiếm, không thì lấy tất cả
    if (query && query.trim().length >= 1) {
      searchFilter.courseTitle = { $regex: query, $options: 'i' }; // Sử dụng courseTitle thay vì title
    }

    const courses = await Course.find(searchFilter)
      .populate('educator', 'name email')
      .select('courseTitle educator createdAt enrolledStudents courseContent coursePrice') // Thêm các field cần thiết
      .limit(query ? 10 : 50) // Nếu tìm kiếm thì giới hạn 10, không thì 50
      .sort({ courseTitle: 1 });

    // Tính enrolledCount từ bảng Enrollment thực tế và thêm thông tin bổ sung
    const coursesWithTitle = await Promise.all(courses.map(async (course) => {
      const courseContent = Array.isArray(course.courseContent) ? course.courseContent : [];
      // Tính tổng số bài học từ courseContent
      const totalLectures = courseContent.reduce((total, chapter) => {
        return total + (chapter.chapterContent ? chapter.chapterContent.length : 0);
      }, 0);

      // Tính số học sinh thực tế từ bảng Enrollment
      const actualEnrolledCount = await Enrollment.countDocuments({
        course: course._id,
        status: 'active'
      });

      return {
        ...course.toObject(),
        title: course.courseTitle,
        level: course.coursePrice > 100000 ? 'Advanced' : course.coursePrice > 50000 ? 'Intermediate' : 'Beginner',
        enrolledCount: actualEnrolledCount, // Sử dụng số liệu thực từ Enrollment table
        totalLectures: totalLectures
      };
    }));

    res.json({ success: true, courses: coursesWithTitle });
  } catch (error) {
    console.error('Error searching courses:', error);
    res.status(500).json({ success: false, message: 'Lỗi tìm kiếm khóa học' });
  }
};

// Get enrollments for a course with pagination
export const getEnrollments = async (req, res) => {
  try {
    const { courseId } = req.params;
    const { page = 1, limit = 10, search = '', progress = 'all' } = req.query;

    // Build query for enrolled students
    let enrollmentQuery = { course: courseId, status: 'active' };

    // Get all enrollments first
    let enrollments = await Enrollment.find(enrollmentQuery)
      .populate('student', 'name email avatar')
      .sort({ enrolledAt: -1 });

    // Filter by student name/email if search provided
    if (search) {
      enrollments = enrollments.filter(enrollment => {
        const student = enrollment.student;
        if (!student) return false;
        const searchLower = search.toLowerCase();
        return (
          student.name?.toLowerCase().includes(searchLower) ||
          student.email?.toLowerCase().includes(searchLower)
        );
      });
    }

    // Get course progress for all enrollments
    const enrollmentsWithProgress = await Promise.all(
      enrollments.map(async (enrollment) => {
        const courseProgress = await CourseProgress.findOne({
          userId: enrollment.student._id,
          courseId: courseId
        });

        return {
          _id: enrollment._id,
          student: enrollment.student,
          enrolledAt: enrollment.enrolledAt,
          courseProgress: courseProgress
        };
      })
    );

    // Filter by progress if needed
    let filteredEnrollments = enrollmentsWithProgress;
    if (progress !== 'all') {
      const course = await Course.findById(courseId);
      const courseContent = Array.isArray(course?.courseContent) ? course.courseContent : [];
      const totalLectures = courseContent.reduce((acc, chapter) => 
        acc + (chapter.chapterContent?.length || 0), 0
      );

      filteredEnrollments = enrollmentsWithProgress.filter(enrollment => {
        const completedCount = enrollment.courseProgress?.lectureCompleted?.length || 0;
        const progressPercent = totalLectures > 0 ? (completedCount / totalLectures) * 100 : 0;

        if (progress === 'not-started') return progressPercent === 0;
        if (progress === 'in-progress') return progressPercent > 0 && progressPercent < 100;
        if (progress === 'completed') return progressPercent === 100;
        return true;
      });
    }

    // Pagination
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + parseInt(limit);
    const paginatedEnrollments = filteredEnrollments.slice(startIndex, endIndex);

    res.json({
      success: true,
      enrollments: paginatedEnrollments,
      totalPages: Math.ceil(filteredEnrollments.length / limit),
      currentPage: parseInt(page),
      total: filteredEnrollments.length
    });
  } catch (error) {
    console.error('Error getting enrollments:', error);
    res.status(500).json({ success: false, message: 'Lỗi tải danh sách học sinh' });
  }
};

// Search available students (not enrolled in course)
export const searchStudents = async (req, res) => {
  try {
    const { query, courseId } = req.query;

    if (!query || query.trim().length < 2) {
      return res.json({ students: [] });
    }

    // Find users matching the search query in MongoDB
    const matchingUsers = await User.find({
      $or: [
        { name: { $regex: query, $options: 'i' } },
        { email: { $regex: query, $options: 'i' } }
      ]
    })
      .select('name email avatar clerkId')
      .limit(20); // Get more initially to filter by role

    // Filter students using Clerk API to check roles
    const students = [];
    
    for (const user of matchingUsers) {
      const userRole = await getUserRoleFromClerk(user.clerkId);
      
      if (userRole === 'student') {
        students.push({
          _id: user._id,
          name: user.name,
          email: user.email,
          avatar: user.avatar
        });
      }
      
      // Limit to 10 students max
      if (students.length >= 10) break;
    }

    // Filter out students already enrolled
    const enrolledStudentIds = await Enrollment.find({ 
      course: courseId,
      status: 'active'
    }).distinct('student');

    const availableStudents = students.filter(
      student => !enrolledStudentIds.includes(student._id)
    );

    res.json({ success: true, students: availableStudents });
  } catch (error) {
    console.error('Error searching students:', error);
    res.status(500).json({ success: false, message: 'Lỗi tìm kiếm học sinh' });
  }
};

// Add student to course manually
export const addStudent = async (req, res) => {
  try {
    const { courseId, studentId } = req.body;

    // 1. Check if course exists
    const course = await Course.findById(courseId);
    if (!course) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy khóa học' });
    }

    // 2. Check if student exists
    const student = await User.findById(studentId);
    if (!student) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy học sinh' });
    }

    // 3. Verify student role (Optional - tùy logic của bạn)
    /* // Nếu bạn chắc chắn studentId lấy từ list User thì bước này có thể bỏ qua để tiết kiệm thời gian gọi API Clerk
    const userRole = await getUserRoleFromClerk(student.clerkId);
    if (userRole !== 'student') {
      return res.status(400).json({ success: false, message: 'Người dùng này không phải là học sinh' });
    }
    */

    // 4. Check if already enrolled (Kiểm tra cả trong bảng Enrollment và User cho chắc)
    const existingEnrollment = await Enrollment.findOne({
      student: studentId,
      course: courseId
    });

    // Hoặc kiểm tra nhanh trong mảng enrolledCourses của user
    if (existingEnrollment || student.enrolledCourses.includes(courseId)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Học sinh đã được ghi danh vào khóa học này rồi' 
      });
    }

    // --- BẮT ĐẦU THÊM DỮ LIỆU ---

    // 5. Create Enrollment Record
    // SỬA: Đổi type thành 'manual' để phân biệt
    const enrollment = new Enrollment({
      student: studentId,
      course: courseId,
      enrollmentType: 'manual', 
      status: 'active'
    });
    await enrollment.save();

    // 6. Create Course Progress
    const courseProgress = new CourseProgress({
      userId: studentId,
      courseId: courseId,
      completed: false,
      lectureCompleted: []
    });
    await courseProgress.save();

    // 7. Create Purchase Record (Dành cho thống kê doanh thu = 0)
    const purchase = new Purchase({
      courseId: courseId,
      userId: studentId,
      amount: 0, // Miễn phí
      status: 'completed',
      transactionId: `MANUAL_${Date.now()}`, // Tạo mã giao dịch giả
      paymentMethod: 'manual'
    });
    await purchase.save();

    // 8. QUAN TRỌNG: Cập nhật mảng enrolledCourses của User
    // Dùng $addToSet để tránh trùng lặp nếu lỡ có rồi
    await User.findByIdAndUpdate(studentId, {
        $addToSet: { enrolledCourses: courseId }
    });

    // 9. QUAN TRỌNG: Cập nhật mảng enrolledStudents của Course
    await Course.findByIdAndUpdate(courseId, {
        $addToSet: { enrolledStudents: studentId }
    });

    res.json({ 
      success: true, 
      message: 'Đã thêm học sinh vào khóa học thành công',
      enrollment 
    });

  } catch (error) {
    console.error('Error adding student:', error);
    res.status(500).json({ success: false, message: 'Lỗi thêm học sinh: ' + error.message });
  }
};
// Remove student from course
export const removeStudent = async (req, res) => {
  try {
    const { courseId, studentId } = req.body;

    // Find and delete enrollment
    const enrollment = await Enrollment.findOneAndDelete({
      student: studentId,
      course: courseId
    });

    if (!enrollment) {
      return res.status(404).json({ 
        success: false, 
        message: 'Không tìm thấy bản ghi ghi danh' 
      });
    }

    // Optional: Also remove course progress (or just mark as inactive)
    // await CourseProgress.findOneAndDelete({
    //   userId: studentId,
    //   courseId: courseId
    // });

    res.json({ 
      success: true, 
      message: 'Đã xóa học sinh khỏi khóa học thành công' 
    });
  } catch (error) {
    console.error('Error removing student:', error);
    res.status(500).json({ success: false, message: 'Lỗi xóa học sinh' });
  }
};

// Export enrollments to CSV
export const exportEnrollments = async (req, res) => {
  try {
    const { courseId } = req.params;

    // Get all enrollments for the course
    const enrollments = await Enrollment.find({ 
      course: courseId,
      status: 'active'
    })
      .populate('student', 'name email')
      .sort({ enrolledAt: -1 });

    // Get course for total lectures calculation
    const course = await Course.findById(courseId);
    const courseContent = Array.isArray(course?.courseContent) ? course.courseContent : [];
    const totalLectures = courseContent.reduce((acc, chapter) => 
      acc + (chapter.chapterContent?.length || 0), 0
    );

    // Build CSV content
    let csvContent = 'Student ID,Họ tên,Email,Ngày ghi danh,Tiến độ (%)\n';

    for (const enrollment of enrollments) {
      const courseProgress = await CourseProgress.findOne({
        userId: enrollment.student._id,
        courseId: courseId
      });

      const completedCount = courseProgress?.lectureCompleted?.length || 0;
      const progressPercent = totalLectures > 0 
        ? Math.round((completedCount / totalLectures) * 100) 
        : 0;

      csvContent += `${enrollment.student._id},${enrollment.student.name},${enrollment.student.email},${new Date(enrollment.enrolledAt).toLocaleDateString('vi-VN')},${progressPercent}\n`;
    }

    // Set headers for file download
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=enrollments_${courseId}_${Date.now()}.csv`);
    
    res.send('\uFEFF' + csvContent); // Add BOM for UTF-8
  } catch (error) {
    console.error('Error exporting enrollments:', error);
    res.status(500).json({ success: false, message: 'Lỗi xuất danh sách' });
  }
};

// Send notification to all students in a class
export const notifyClass = async (req, res) => {
  try {
    const { courseId, title, content } = req.body;

    if (!title || !content) {
      return res.status(400).json({ 
        success: false, 
        message: 'Vui lòng cung cấp tiêu đề và nội dung' 
      });
    }

    // Get all enrolled students
    const enrollments = await Enrollment.find({ 
      course: courseId,
      status: 'active'
    }).populate('student', 'email name');

    const emailList = enrollments.map(e => e.student.email);

    // TODO: Implement actual email sending here
    // For now, just simulate success
    // You can integrate with NodeMailer, SendGrid, etc.
    
    console.log('Sending notification to:', emailList);
    console.log('Title:', title);
    console.log('Content:', content);

    // Here you would typically:
    // 1. Use a queue system (Bull, BullMQ)
    // 2. Send emails in batches
    // 3. Track delivery status

    res.json({ 
      success: true, 
      message: 'Đã gửi thông báo thành công',
      count: enrollments.length 
    });
  } catch (error) {
    console.error('Error sending notification:', error);
    res.status(500).json({ success: false, message: 'Lỗi gửi thông báo' });
  }
};

// Helper function to get user role from Clerk
const getUserRoleFromClerk = async (clerkId) => {
  try {
    if (!clerkId) return 'student'; // Default fallback
    
    const clerkUser = await clerkClient.users.getUser(clerkId);
    
    // Check both public and private metadata for role
    const role = clerkUser.publicMetadata?.role || 
                 clerkUser.privateMetadata?.role || 
                 'student'; // Default to student
    
    return role;
  } catch (error) {
    console.error('Error fetching role from Clerk:', error);
    return 'student'; // Default fallback on error
  }
};
