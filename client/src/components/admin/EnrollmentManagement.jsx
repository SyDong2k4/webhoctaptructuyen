import React, { useState, useEffect, useCallback, useContext } from 'react'
import axios from 'axios'
import { toast } from 'react-toastify'
import { AppContext } from '../../context/AppContext.jsx'

const EnrollmentManagement = () => {
  const [allCourses, setAllCourses] = useState([]) // Tất cả khóa học
  const [filteredCourses, setFilteredCourses] = useState([]) // Khóa học đã lọc
  const [selectedCourse, setSelectedCourse] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [enrollments, setEnrollments] = useState([])
  const [loading, setLoading] = useState(false)
  const [showCourseDropdown, setShowCourseDropdown] = useState(false)
  
  // Pagination
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const studentsPerPage = 10
  
  // Filters
  const [searchStudent, setSearchStudent] = useState('')
  const [progressFilter, setProgressFilter] = useState('all')
  
  // Modals
  const [showAddStudentModal, setShowAddStudentModal] = useState(false)
  const [showRemoveModal, setShowRemoveModal] = useState(false)
  const [showNotifyModal, setShowNotifyModal] = useState(false)
  const [studentToRemove, setStudentToRemove] = useState(null)
  
  // Add student modal states
  const [studentSearch, setStudentSearch] = useState('')
  const [availableStudents, setAvailableStudents] = useState([])
  const [selectedStudent, setSelectedStudent] = useState(null)
  
  // Notify modal states
  const [notifyTitle, setNotifyTitle] = useState('')
  const [notifyContent, setNotifyContent] = useState('')

  const backendUrl = import.meta.env.VITE_BACKEND_URL
  const { getToken } = useContext(AppContext)

  const getAuthToken = useCallback(async () => {
    const token = await getToken()
    if (!token || token === 'null' || token === 'undefined' || token.length < 10) {
      throw new Error('Authentication token unavailable')
    }
    return token
  }, [getToken])

  // Load all courses
  const loadAllCourses = useCallback(async () => {
    try {
      const token = await getAuthToken()
      console.log('Loading courses from:', `${backendUrl}/api/admin/enrollments/search-courses`)
      const response = await axios.get(
        `${backendUrl}/api/admin/enrollments/search-courses?query=`,
        { headers: { Authorization: `Bearer ${token}` } }
      )
      console.log('Response data:', response.data)
      const courses = response.data?.courses || []
      console.log('Courses loaded:', courses.length)
      courses.forEach(course => {
        console.log(`- ${course.title}: ${course.enrolledCount || 0} students`)
      })
      setAllCourses(courses)
      setFilteredCourses(courses)
      setShowCourseDropdown(courses.length > 0)
    } catch (error) {
      console.error('Error loading courses:', error)
      toast.error('Không thể tải danh sách khóa học')
    }
  }, [backendUrl, getAuthToken])

  // Select course and load enrollments
  const handleSelectCourse = async (course) => {
    setSelectedCourse(course)
    setSearchQuery(course.title)
    setShowCourseDropdown(false)
    setCurrentPage(1)
    await loadEnrollments(course._id, 1)
  }

  // Load enrollments for selected course
  const loadEnrollments = useCallback(async (courseId, page = 1) => {
    setLoading(true)
    try {
      const token = await getAuthToken()
      console.log('📚 Loading enrollments for courseId:', courseId)
      const response = await axios.get(
        `${backendUrl}/api/admin/enrollments/${courseId}?page=${page}&limit=${studentsPerPage}&search=${searchStudent}&progress=${progressFilter}`,
        { headers: { Authorization: `Bearer ${token}` } }
      )
      console.log('📊 Enrollments response:', response.data)
      console.log('👥 Number of enrollments found:', response.data.enrollments?.length || 0)
      setEnrollments(response.data.enrollments)
      setTotalPages(response.data.totalPages)
      setCurrentPage(page)
    } catch (error) {
      console.error('Error loading enrollments:', error)
      toast.error('Không thể tải danh sách học sinh')
    } finally {
      setLoading(false)
    }
  }, [backendUrl, searchStudent, progressFilter, studentsPerPage, getAuthToken])
  const searchAvailableStudents = useCallback(async (query) => {
    try {
      const token = await getAuthToken()
      const response = await axios.get(
        `${backendUrl}/api/admin/enrollments/search-students?query=${query}&courseId=${selectedCourse._id}`,
        { headers: { Authorization: `Bearer ${token}` } }
      )
      setAvailableStudents(response.data.students)
    } catch (error) {
      console.error('Error searching students:', error)
      toast.error('Không thể tìm kiếm học sinh')
    }
  }, [backendUrl, selectedCourse, getAuthToken])

  useEffect(() => {
    const timer = setTimeout(() => {
      if (studentSearch.trim() && selectedCourse) {
        searchAvailableStudents(studentSearch)
      } else {
        setAvailableStudents([])
      }
    }, 300)

    return () => clearTimeout(timer)
  }, [studentSearch, selectedCourse, searchAvailableStudents])



  // Add student to course
  const handleAddStudent = async () => {
    if (!selectedStudent) {
      toast.error('Vui lòng chọn học sinh')
      return
    }

    try {
      const token = await getAuthToken()
      await axios.post(
        `${backendUrl}/api/admin/enrollments/add-student`,
        {
          courseId: selectedCourse._id,
          studentId: selectedStudent._id
        },
        { headers: { Authorization: `Bearer ${token}` } }
      )
      toast.success(`Đã ghi danh thành công ${selectedStudent.name} vào khóa học`)
      setShowAddStudentModal(false)
      setStudentSearch('')
      setSelectedStudent(null)
      setAvailableStudents([])
      await loadEnrollments(selectedCourse._id, currentPage)
    } catch (error) {
      console.error('Error adding student:', error)
      toast.error(error.response?.data?.message || 'Không thể thêm học sinh')
    }
  }

  // Remove student from course
  const handleRemoveStudent = async () => {
    try {
      const token = await getAuthToken()
      await axios.delete(
        `${backendUrl}/api/admin/enrollments/remove-student`,
        {
          headers: { Authorization: `Bearer ${token}` },
          data: {
            courseId: selectedCourse._id,
            studentId: studentToRemove._id
          }
        }
      )
      toast.success(`Đã xóa ${studentToRemove.name} khỏi khóa học`)
      setShowRemoveModal(false)
      setStudentToRemove(null)
      await loadEnrollments(selectedCourse._id, currentPage)
    } catch (error) {
      console.error('Error removing student:', error)
      toast.error('Không thể xóa học sinh')
    }
  }

  // Export to CSV
  const handleExport = async () => {
    try {
      const token = await getAuthToken()
      const response = await axios.get(
        `${backendUrl}/api/admin/enrollments/export/${selectedCourse._id}`,
        {
          headers: { Authorization: `Bearer ${token}` },
          responseType: 'blob'
        }
      )
      
      const url = window.URL.createObjectURL(new Blob([response.data]))
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', `enrollments_${selectedCourse.title}_${new Date().toISOString().split('T')[0]}.csv`)
      document.body.appendChild(link)
      link.click()
      link.remove()
      toast.success('Đã xuất danh sách thành công')
    } catch (error) {
      console.error('Error exporting:', error)
      toast.error('Không thể xuất danh sách')
    }
  }

  // Send notification to class
  const handleSendNotification = async () => {
    if (!notifyTitle.trim() || !notifyContent.trim()) {
      toast.error('Vui lòng điền đầy đủ tiêu đề và nội dung')
      return
    }

    try {
      const token = await getAuthToken()
      const response = await axios.post(
        `${backendUrl}/api/admin/enrollments/notify-class`,
        {
          courseId: selectedCourse._id,
          title: notifyTitle,
          content: notifyContent
        },
        { headers: { Authorization: `Bearer ${token}` } }
      )
      toast.success(`Đã gửi thông báo đến ${response.data.count} học sinh`)
      setShowNotifyModal(false)
      setNotifyTitle('')
      setNotifyContent('')
    } catch (error) {
      console.error('Error sending notification:', error)
      toast.error('Không thể gửi thông báo')
    }
  }

  // Apply filters
  useEffect(() => {
    if (selectedCourse) {
      loadEnrollments(selectedCourse._id, 1)
    }
  }, [searchStudent, progressFilter, selectedCourse, loadEnrollments])

  // Hide course dropdown when any modal is open
  useEffect(() => {
    if (showAddStudentModal || showRemoveModal || showNotifyModal) {
      setShowCourseDropdown(false)
    }
  }, [showAddStudentModal, showRemoveModal, showNotifyModal])

  // Load all courses when component mounts
  useEffect(() => {
    loadAllCourses()
  }, [loadAllCourses])

  // Filter courses based on search query
  useEffect(() => {
    if (searchQuery.trim()) {
      const filtered = allCourses.filter(course => 
        course.title.toLowerCase().includes(searchQuery.toLowerCase())
      )
      setFilteredCourses(filtered)
      setShowCourseDropdown(true)
    } else {
      setFilteredCourses(allCourses || [])
      setShowCourseDropdown((allCourses || []).length > 0)
    }
  }, [searchQuery, allCourses])

  // Calculate progress percentage
  const calculateProgress = (enrollment) => {
    if (!enrollment.courseProgress || !selectedCourse.courseContent) return 0
    const totalLectures = selectedCourse.courseContent.reduce((acc, chapter) => acc + (chapter.chapterContent?.length || 0), 0)
    if (totalLectures === 0) return 0
    const completedLectures = enrollment.courseProgress.lectureCompleted?.length || 0
    return Math.round((completedLectures / totalLectures) * 100)
  }

  return (
    <div className='p-6 bg-gradient-to-br from-gray-50 to-gray-100 min-h-screen'>
      <div className='mb-8'>
        <h1 className='text-4xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent mb-2'>
          📚 Quản lý Ghi danh
        </h1>
        <p className='text-gray-600 text-lg'>Quản lý học sinh và theo dõi tiến độ học tập</p>
      </div>

      {/* Course Selector - Always shown */}
      <div className='bg-white p-8 rounded-2xl shadow-lg border border-gray-100 mb-8 hover:shadow-xl transition-shadow duration-300'>
        <div className='flex items-center mb-6'>
          <div className='w-12 h-12 bg-gradient-to-r from-blue-500 to-blue-600 rounded-xl flex items-center justify-center mr-4'>
            <span className='text-white text-xl'>🎯</span>
          </div>
          <div>
            <h2 className='text-xl font-bold text-gray-800'>Chọn khóa học</h2>
            <p className='text-gray-500 text-sm'>Tìm và chọn khóa học để quản lý</p>
          </div>
        </div>
        <div className='dropdown-container relative'>
          <div className='absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none z-10'>
            <span className='text-gray-400'>🔍</span>
          </div>
          <input
            type='text'
            value={searchQuery}
            onChange={(e) => {
              if (!selectedCourse) {
                setSearchQuery(e.target.value)
              }
            }}
            onFocus={() => {
              if (filteredCourses.length > 0 && !selectedCourse) {
                setShowCourseDropdown(true)
              }
            }}
            onBlur={() => {
              // Delay hiding dropdown to allow clicking on items
              setTimeout(() => {
                setShowCourseDropdown(false)
              }, 200)
            }}
            placeholder={selectedCourse ? 'Khóa học đã chọn' : 'Nhập tên khóa học để tìm kiếm...'}
            className={`w-full pl-12 ${selectedCourse ? 'pr-12' : 'pr-4'} py-4 border border-gray-200 rounded-xl focus:ring-4 focus:ring-blue-100 focus:border-blue-500 transition-all duration-200 text-lg relative ${
              selectedCourse ? 'bg-blue-50 cursor-default' : ''
            }`}
            readOnly={selectedCourse}
          />
          {selectedCourse && (
            <button
              onClick={() => {
                setSelectedCourse(null)
                setSearchQuery('')
                setEnrollments([])
                setShowCourseDropdown(false)
              }}
              className='absolute inset-y-0 right-0 pr-4 flex items-center text-gray-400 hover:text-gray-600 transition-colors'
              title='Chọn khóa học khác'
            >
              ✕
            </button>
          )}
          {showCourseDropdown && filteredCourses.length > 0 && !selectedCourse && !showAddStudentModal && !showNotifyModal && !showRemoveModal && (
            <div className='dropdown-menu w-full mt-2 bg-white border border-gray-200 rounded-xl shadow-2xl max-h-80 overflow-y-auto animate-fadeIn custom-scrollbar'>
              {filteredCourses.map((course) => (
                <div
                  key={course._id}
                  onMouseDown={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    handleSelectCourse(course)
                  }}
                  className='p-4 hover:bg-gradient-to-r hover:from-blue-50 hover:to-purple-50 cursor-pointer border-b border-gray-100 last:border-b-0 transition-all duration-200 group'
                >
                  <div className='font-semibold text-gray-800 mb-1 group-hover:text-blue-700 transition-colors'>
                    {course.title}
                  </div>
                  <div className='text-sm text-gray-500 flex items-center group-hover:text-blue-600 transition-colors'>
                    <span className='mr-2'>👨‍🏫</span>
                    Giảng viên: {course.educator?.name}
                  </div>
                  <div className='text-xs text-gray-400 mt-1 group-hover:text-blue-500 transition-colors'>
                    📈 Cấp độ: {course.level} • 👥 Học sinh: {course.enrolledCount || 0}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        
        {!selectedCourse && (
          <div className='mt-6 p-6 bg-gradient-to-r from-blue-50 to-purple-50 rounded-xl border border-blue-200'>
            <div className='text-center'>
              <span className='text-6xl mb-4 block'>🎯</span>
              <p className='text-gray-600 text-lg font-medium mb-2'>
                Vui lòng tìm và chọn một khóa học để bắt đầu quản lý
              </p>
              <p className='text-gray-500 text-sm'>
                Sử dụng thanh tìm kiếm phía trên để tìm khóa học bạn muốn quản lý
              </p>
            </div>
          </div>
        )}
        
        {selectedCourse && (
          <div className='mt-4 p-4 bg-green-50 rounded-xl border border-green-200'>
            <div className='flex items-center justify-between'>
              <div className='flex items-center'>
                <span className='text-green-600 mr-2'>✓</span>
                <span className='text-green-800 font-medium'>Khóa học đã chọn: {selectedCourse.title}</span>
              </div>
              <button
                onClick={() => {
                  setSelectedCourse(null)
                  setSearchQuery('')
                  setEnrollments([])
                  setShowCourseDropdown(false)
                }}
                className='text-green-600 hover:text-green-800 text-sm underline'
              >
                Thay đổi khóa học
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Management Section - Only shown when course is selected */}
      {selectedCourse && (
        <div className='space-y-8 animate-fadeIn'>
          {/* Context Header */}
          <div className='bg-gradient-to-r from-blue-600 via-purple-600 to-indigo-600 p-8 rounded-2xl shadow-xl mb-8 text-white relative overflow-hidden'>
            <div className='absolute top-0 right-0 w-32 h-32 bg-white opacity-10 rounded-full -translate-y-8 translate-x-8'></div>
            <div className='absolute bottom-0 left-0 w-24 h-24 bg-white opacity-5 rounded-full translate-y-4 -translate-x-4'></div>
            <div className='relative z-10'>
              <div className='flex items-center mb-4'>
                <div className='w-16 h-16 bg-white bg-opacity-20 rounded-2xl flex items-center justify-center mr-4'>
                  <span className='text-2xl'>📖</span>
                </div>
                <div>
                  <h2 className='text-3xl font-bold mb-2'>
                    {selectedCourse.title}
                  </h2>
                  <div className='flex flex-wrap gap-4 text-blue-100'>
                    <div className='flex items-center'>
                      <span className='mr-2'>👨‍🏫</span>
                      <span>Giảng viên: {selectedCourse.educator?.name}</span>
                    </div>
                    <div className='flex items-center'>
                      <span className='mr-2'>👥</span>
                      <span>Tổng số: {enrollments.length} học sinh</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className='grid grid-cols-1 md:grid-cols-3 gap-4 mb-8 relative z-10'>
            <button
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                setShowCourseDropdown(false) // Ẩn dropdown khi click
                setTimeout(() => setShowAddStudentModal(true), 100) // Delay để đảm bảo dropdown đã ẩn
              }}
              className='group bg-gradient-to-r from-blue-500 to-blue-600 text-white px-8 py-4 rounded-xl hover:from-blue-600 hover:to-blue-700 font-semibold flex items-center justify-center gap-3 shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-200'
            >
              <div className='w-8 h-8 bg-white bg-opacity-20 rounded-lg flex items-center justify-center group-hover:rotate-12 transition-transform duration-200'>
                <span className='text-lg'>➕</span>
              </div>
              <span>Thêm Học sinh</span>
            </button>
            <button
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                setShowCourseDropdown(false) // Ẩn dropdown khi click
                handleExport()
              }}
              className='group bg-gradient-to-r from-green-500 to-green-600 text-white px-8 py-4 rounded-xl hover:from-green-600 hover:to-green-700 font-semibold flex items-center justify-center gap-3 shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-200'
            >
              <div className='w-8 h-8 bg-white bg-opacity-20 rounded-lg flex items-center justify-center group-hover:rotate-12 transition-transform duration-200'>
                <span className='text-lg'>📤</span>
              </div>
              <span>Xuất Excel/CSV</span>
            </button>
            <button
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                setShowCourseDropdown(false) // Ẩn dropdown khi click
                setTimeout(() => setShowNotifyModal(true), 100) // Delay để đảm bảo dropdown đã ẩn
              }}
              className='group bg-gradient-to-r from-purple-500 to-purple-600 text-white px-8 py-4 rounded-xl hover:from-purple-600 hover:to-purple-700 font-semibold flex items-center justify-center gap-3 shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-200'
            >
              <div className='w-8 h-8 bg-white bg-opacity-20 rounded-lg flex items-center justify-center group-hover:rotate-12 transition-transform duration-200'>
                <span className='text-lg'>✉️</span>
              </div>
              <span>Gửi thông báo</span>
            </button>
          </div>

          {/* Filters */}
          <div className='bg-white p-6 rounded-2xl shadow-lg border border-gray-100 mb-8'>
            <div className='flex items-center mb-4'>
              <div className='w-10 h-10 bg-gradient-to-r from-orange-400 to-orange-500 rounded-xl flex items-center justify-center mr-3'>
                <span className='text-white'>🔍</span>
              </div>
              <h3 className='text-lg font-semibold text-gray-800'>Lọc và tìm kiếm</h3>
            </div>
            <div className='grid grid-cols-1 md:grid-cols-3 gap-4'>
              <div className='md:col-span-2'>
                <div className='relative'>
                  <div className='absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none'>
                    <span className='text-gray-400'>👤</span>
                  </div>
                  <input
                    type='text'
                    value={searchStudent}
                    onChange={(e) => setSearchStudent(e.target.value)}
                    placeholder='Tìm kiếm học sinh (tên/email)...'
                    className='w-full pl-12 pr-4 py-3 border border-gray-200 rounded-xl focus:ring-4 focus:ring-blue-100 focus:border-blue-500 transition-all duration-200'
                  />
                </div>
              </div>
              <div>
                <div className='relative'>
                  <div className='absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none'>
                    <span className='text-gray-400'>📊</span>
                  </div>
                  <select
                    value={progressFilter}
                    onChange={(e) => setProgressFilter(e.target.value)}
                    className='w-full pl-12 pr-4 py-3 border border-gray-200 rounded-xl focus:ring-4 focus:ring-blue-100 focus:border-blue-500 transition-all duration-200 bg-white'
                  >
                    <option value='all'>Tất cả tiến độ</option>
                    <option value='not-started'>Chưa bắt đầu</option>
                    <option value='in-progress'>Đang học</option>
                    <option value='completed'>Đã hoàn thành</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* Students Table */}
          <div className='bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden'>
            {loading ? (
              <div className='p-16 text-center'>
                <div className='inline-flex items-center justify-center w-16 h-16 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full mb-4'>
                  <div className='w-8 h-8 border-4 border-white border-t-transparent rounded-full animate-spin'></div>
                </div>
                <p className='text-gray-600 text-lg'>Đang tải danh sách học sinh...</p>
              </div>
            ) : enrollments.length === 0 ? (
              <div className='p-16 text-center'>
                <div className='w-24 h-24 bg-gradient-to-r from-gray-400 to-gray-500 rounded-full flex items-center justify-center mx-auto mb-6'>
                  <span className='text-3xl text-white'>📚</span>
                </div>
                <p className='text-gray-600 text-lg mb-2'>Chưa có học sinh nào ghi danh</p>
                <p className='text-gray-500'>Hãy thêm học sinh vào khóa học này</p>
              </div>
            ) : (
              <>
                <table className='w-full'>
                  <thead className='bg-gradient-to-r from-gray-50 to-gray-100 border-b-2 border-gray-200'>
                    <tr>
                      <th className='px-6 py-4 text-left text-sm font-bold text-gray-700'>STT</th>
                      <th className='px-6 py-4 text-left text-sm font-bold text-gray-700'>👤 Học sinh</th>
                      <th className='px-6 py-4 text-left text-sm font-bold text-gray-700'>📧 Email</th>
                      <th className='px-6 py-4 text-left text-sm font-bold text-gray-700'>📅 Ngày tham gia</th>
                      <th className='px-6 py-4 text-left text-sm font-bold text-gray-700'>📈 Tiến độ</th>
                      <th className='px-6 py-4 text-left text-sm font-bold text-gray-700'>⚡ Hành động</th>
                    </tr>
                  </thead>
                  <tbody className='divide-y divide-gray-200'>
                    {enrollments.map((enrollment, index) => {
                      const progress = calculateProgress(enrollment)
                      return (
                        <tr key={enrollment._id} className='hover:bg-gradient-to-r hover:from-blue-50 hover:to-purple-50 transition-all duration-200 border-b border-gray-100'>
                          <td className='px-6 py-6 text-lg font-semibold text-gray-800'>
                            <div className='w-8 h-8 bg-gradient-to-r from-blue-500 to-purple-600 rounded-lg flex items-center justify-center text-white text-sm font-bold'>
                              {(currentPage - 1) * studentsPerPage + index + 1}
                            </div>
                          </td>
                          <td className='px-6 py-6'>
                            <div className='flex items-center gap-4'>
                              <div className='relative'>
                                <div className='w-12 h-12 bg-gradient-to-r from-blue-500 to-purple-600 rounded-xl flex items-center justify-center text-white font-bold text-lg shadow-lg'>
                                  {enrollment.student?.name?.charAt(0).toUpperCase()}
                                </div>
                                <div className='absolute -top-1 -right-1 w-4 h-4 bg-green-500 rounded-full border-2 border-white'></div>
                              </div>
                              <div>
                                <div className='font-semibold text-gray-900 text-lg'>
                                  {enrollment.student?.name}
                                </div>
                                <div className='text-sm text-gray-500'>Học sinh</div>
                              </div>
                            </div>
                          </td>
                          <td className='px-6 py-6'>
                            <div className='flex items-center gap-2'>
                              <div className='w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center'>
                                <span className='text-blue-600'>📧</span>
                              </div>
                              <span className='text-gray-700 font-medium'>{enrollment.student?.email}</span>
                            </div>
                          </td>
                          <td className='px-6 py-6'>
                            <div className='flex items-center gap-2'>
                              <div className='w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center'>
                                <span className='text-green-600'>📅</span>
                              </div>
                              <span className='text-gray-700 font-medium'>
                                {new Date(enrollment.enrolledAt).toLocaleDateString('vi-VN')}
                              </span>
                            </div>
                          </td>
                          <td className='px-6 py-6'>
                            <div className='space-y-2'>
                              <div className='flex items-center justify-between'>
                                <span className='text-sm font-medium text-gray-700'>Tiến độ</span>
                                <span className='text-sm font-bold text-gray-900'>{progress}%</span>
                              </div>
                              <div className='w-full bg-gray-200 rounded-full h-3 overflow-hidden'>
                                <div
                                  className={`h-3 rounded-full transition-all duration-500 ${
                                    progress === 0 ? 'bg-gray-400' :
                                    progress < 30 ? 'bg-gradient-to-r from-red-400 to-red-500' :
                                    progress < 70 ? 'bg-gradient-to-r from-yellow-400 to-orange-500' :
                                    progress < 100 ? 'bg-gradient-to-r from-blue-400 to-blue-600' :
                                    'bg-gradient-to-r from-green-400 to-green-600'
                                  }`}
                                  style={{ width: `${progress}%` }}
                                />
                              </div>
                            </div>
                          </td>
                          <td className='px-6 py-6'>
                            <button
                              onClick={() => {
                                setStudentToRemove(enrollment.student)
                                setShowRemoveModal(true)
                              }}
                              className='group bg-red-100 hover:bg-red-200 text-red-600 hover:text-red-700 px-4 py-2 rounded-xl font-medium flex items-center gap-2 transition-all duration-200 hover:scale-105 shadow-sm hover:shadow-md'
                            >
                              <span className='group-hover:rotate-12 transition-transform duration-200'>🗑️</span>
                              <span>Xóa</span>
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className='px-8 py-6 bg-gradient-to-r from-gray-50 to-gray-100 border-t border-gray-200'>
                    <div className='flex justify-between items-center'>
                      <button
                        onClick={() => loadEnrollments(selectedCourse._id, currentPage - 1)}
                        disabled={currentPage === 1}
                        className='group flex items-center gap-2 px-6 py-3 bg-white border border-gray-300 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gradient-to-r hover:from-blue-50 hover:to-purple-50 hover:border-blue-300 transition-all duration-200 shadow-sm hover:shadow-md disabled:hover:bg-white disabled:hover:shadow-sm'
                      >
                        <span className='group-hover:-translate-x-1 transition-transform duration-200'>←</span>
                        <span className='font-medium'>Trang trước</span>
                      </button>
                      
                      <div className='flex items-center gap-2'>
                        <div className='bg-white rounded-xl px-6 py-3 border border-gray-200 shadow-sm'>
                          <span className='text-gray-600'>Trang </span>
                          <span className='font-bold text-blue-600'>{currentPage}</span>
                          <span className='text-gray-600'> / </span>
                          <span className='font-bold text-gray-800'>{totalPages}</span>
                        </div>
                      </div>
                      
                      <button
                        onClick={() => loadEnrollments(selectedCourse._id, currentPage + 1)}
                        disabled={currentPage === totalPages}
                        className='group flex items-center gap-2 px-6 py-3 bg-white border border-gray-300 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gradient-to-r hover:from-blue-50 hover:to-purple-50 hover:border-blue-300 transition-all duration-200 shadow-sm hover:shadow-md disabled:hover:bg-white disabled:hover:shadow-sm'
                      >
                        <span className='font-medium'>Trang sau</span>
                        <span className='group-hover:translate-x-1 transition-transform duration-200'>→</span>
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* Add Student Modal */}
      {showAddStudentModal && (
        <div className='fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999]'>
          <div className='bg-white rounded-lg p-6 w-full max-w-md'>
            <h3 className='text-xl font-bold mb-4'>
              Ghi danh thủ công vào khóa: {selectedCourse.title}
            </h3>
            
            <div className='mb-4 p-3 bg-blue-50 rounded-lg border border-blue-200'>
              <div className='text-sm text-blue-800 font-medium mb-1'>
                📌 Hướng dẫn thêm học sinh:
              </div>
              <div className='text-xs text-blue-600'>
                • Nhập <strong>tên</strong> hoặc <strong>email</strong> của học sinh đã có tài khoản<br/>
                • Hệ thống sẽ tìm kiếm và hiển thị danh sách phù hợp<br/>
                • Chọn học sinh từ danh sách và xác nhận ghi danh
              </div>
            </div>

            <input
              type='text'
              value={studentSearch}
              onChange={(e) => setStudentSearch(e.target.value)}
              placeholder='🔍 Nhập tên hoặc email học sinh...'
              className='w-full p-3 border border-gray-300 rounded-lg mb-4 focus:ring-2 focus:ring-blue-500 focus:border-transparent'
            />

            {studentSearch.trim() && availableStudents.length === 0 && (
              <div className='mb-4 p-3 bg-yellow-50 rounded-lg border border-yellow-200'>
                <div className='text-sm text-yellow-800'>
                  ⚠️ Không tìm thấy học sinh phù hợp. Học sinh cần phải:
                </div>
                <div className='text-xs text-yellow-600 mt-1'>
                  • Đã có tài khoản trong hệ thống<br/>
                  • Chưa đăng ký khóa học này<br/>
                  • Có vai trò là học sinh (Student)
                </div>
              </div>
            )}
            
            {availableStudents.length > 0 && (
              <div className='max-h-60 overflow-y-auto mb-4 border border-gray-200 rounded-lg'>
                {availableStudents.map((student) => (
                  <div
                    key={student._id}
                    onClick={() => setSelectedStudent(student)}
                    className={`p-3 cursor-pointer hover:bg-blue-50 border-b last:border-b-0 ${
                      selectedStudent?._id === student._id ? 'bg-blue-100' : ''
                    }`}
                  >
                    <div className='font-medium'>{student.name}</div>
                    <div className='text-sm text-gray-500'>{student.email}</div>
                  </div>
                ))}
              </div>
            )}

            {selectedStudent && (
              <div className='mb-4 p-3 bg-blue-50 rounded-lg'>
                <div className='text-sm text-gray-600'>Đã chọn:</div>
                <div className='font-medium'>{selectedStudent.name}</div>
                <div className='text-sm text-gray-500'>{selectedStudent.email}</div>
              </div>
            )}

            <div className='flex gap-2'>
              <button
                onClick={() => {
                  setShowAddStudentModal(false)
                  setStudentSearch('')
                  setSelectedStudent(null)
                  setAvailableStudents([])
                }}
                className='flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50'
              >
                Hủy bỏ
              </button>
              <button
                onClick={handleAddStudent}
                disabled={!selectedStudent}
                className='flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed'
              >
                Xác nhận Ghi danh
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Remove Student Modal */}
      {showRemoveModal && studentToRemove && (
        <div className='fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999]'>
          <div className='bg-white rounded-lg p-6 w-full max-w-md'>
            <h3 className='text-xl font-bold mb-4'>Xác nhận Hủy ghi danh</h3>
            <p className='text-gray-700 mb-6'>
              Bạn có chắc chắn muốn xóa <strong>{studentToRemove.name}</strong> khỏi khóa học{' '}
              <strong>{selectedCourse.title}</strong>? Học sinh này sẽ mất quyền truy cập vào nội dung 
              và toàn bộ tiến độ học tập sẽ bị ảnh hưởng.
            </p>
            <div className='flex gap-2'>
              <button
                onClick={() => {
                  setShowRemoveModal(false)
                  setStudentToRemove(null)
                }}
                className='flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50'
              >
                Hủy bỏ
              </button>
              <button
                onClick={handleRemoveStudent}
                className='flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700'
              >
                Xác nhận Xóa
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Notify Class Modal */}
      {showNotifyModal && (
        <div className='fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999]'>
          <div className='bg-white rounded-lg p-6 w-full max-w-lg'>
            <h3 className='text-xl font-bold mb-4'>
              Gửi thông báo đến lớp: {selectedCourse.title}
            </h3>
            <div className='mb-4'>
              <label className='block text-gray-700 font-medium mb-2'>
                Tiêu đề thông báo <span className='text-red-500'>*</span>
              </label>
              <input
                type='text'
                value={notifyTitle}
                onChange={(e) => setNotifyTitle(e.target.value)}
                placeholder='Nhập tiêu đề...'
                className='w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent'
              />
            </div>
            <div className='mb-6'>
              <label className='block text-gray-700 font-medium mb-2'>
                Nội dung <span className='text-red-500'>*</span>
              </label>
              <textarea
                value={notifyContent}
                onChange={(e) => setNotifyContent(e.target.value)}
                placeholder='Nhập nội dung thông báo...'
                rows={6}
                className='w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent'
              />
            </div>
            <div className='flex gap-2'>
              <button
                onClick={() => {
                  setShowNotifyModal(false)
                  setNotifyTitle('')
                  setNotifyContent('')
                }}
                className='flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50'
              >
                Hủy bỏ
              </button>
              <button
                onClick={handleSendNotification}
                disabled={!notifyTitle.trim() || !notifyContent.trim()}
                className='flex-1 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed'
              >
                Gửi thông báo
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default EnrollmentManagement
