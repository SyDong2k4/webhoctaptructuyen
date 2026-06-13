import React, { useState, useEffect, useContext } from 'react'
import { useNavigate } from 'react-router-dom'
import { AppContext } from '../../context/AppContext'
import axios from 'axios'
import { toast } from 'react-toastify'

const AdminDashboard = () => {
  const [stats, setStats] = useState({})
  const [loading, setLoading] = useState(true)
  const { backendUrl, getToken } = useContext(AppContext)
  const navigate = useNavigate()

  const fetchStats = async () => {
    try {
      const token = await getToken()
      const { data } = await axios.get(backendUrl + '/api/admin/stats', {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (data.success) {
        setStats(data.stats)
      } else {
        toast.error(data.message)
      }
    } catch (error) {
      toast.error(error.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchStats()
  }, [])

  if (loading) {
    return (
      <div className='flex justify-center items-center h-64'>
        <div className='w-16 h-16 border-4 border-gray-300 border-t-blue-400 rounded-full animate-spin'></div>
      </div>
    )
  }

  const statCards = [
    {
      title: 'Total Users',
      value: stats.totalUsers || 0,
      color: 'bg-blue-500',
      icon: '👥'
    },
    {
      title: 'Total Courses',
      value: stats.totalCourses || 0,
      color: 'bg-green-500',
      icon: '📚'
    },
    {
      title: 'Total Educators',
      value: stats.totalEducators || 0,
      color: 'bg-purple-500',
      icon: '👨‍🏫'
    },
    {
      title: 'Pending Approvals',
      value: stats.pendingApprovals || 0,
      color: 'bg-yellow-500',
      icon: '⏳'
    }
  ]

  return (
    <div className='p-6'>
      <h1 className='text-2xl font-bold mb-6'>Admin Dashboard</h1>
      
      <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8'>
        {statCards.map((stat, index) => (
          <div
            key={index}
            className='bg-white rounded-lg shadow p-6 border-l-4 border-blue-500'
          >
            <div className='flex items-center justify-between'>
              <div>
                <p className='text-sm font-medium text-gray-600'>{stat.title}</p>
                <p className='text-2xl font-bold text-gray-900'>{stat.value}</p>
              </div>
              <span className='text-2xl'>{stat.icon}</span>
            </div>
          </div>
        ))}
      </div>

      <div className='grid grid-cols-1 lg:grid-cols-2 gap-6'>
        <div className='bg-white rounded-lg shadow p-6'>
          <h3 className='text-lg font-semibold mb-4'>Recent Activities</h3>
          <div className='space-y-3'>
            <div className='flex items-center justify-between py-2 border-b'>
              <span className='text-sm'>New user registration</span>
              <span className='text-xs text-gray-500'>2 hours ago</span>
            </div>
            <div className='flex items-center justify-between py-2 border-b'>
              <span className='text-sm'>Course published</span>
              <span className='text-xs text-gray-500'>5 hours ago</span>
            </div>
          </div>
        </div>

        <div className='bg-white rounded-lg shadow p-6'>
          <h3 className='text-lg font-semibold mb-4'>Quick Actions</h3>
          <div className='space-y-2'>
            <button
              type='button'
              onClick={() => navigate('/admin/users')}
              className='w-full text-left px-4 py-2 bg-blue-50 text-blue-700 rounded hover:bg-blue-100 transition-colors'
            >
              Manage Users
            </button>
            <button
              type='button'
              onClick={() => navigate('/admin/courses')}
              className='w-full text-left px-4 py-2 bg-green-50 text-green-700 rounded hover:bg-green-100 transition-colors'
            >
              Review Courses
            </button>
            <button
              type='button'
              onClick={() => navigate('/admin/approvals')}
              className='w-full text-left px-4 py-2 bg-yellow-50 text-yellow-700 rounded hover:bg-yellow-100 transition-colors'
            >
              Pending Approvals
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default AdminDashboard