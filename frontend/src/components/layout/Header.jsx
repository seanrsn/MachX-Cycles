import { Menu, LogOut, User } from 'lucide-react'
import { useAuthStore } from '../../store/authStore'
import { useNavigate } from 'react-router-dom'

export default function Header({ onMenuClick }) {
  const { email, logout } = useAuthStore()
  const navigate = useNavigate()

  function handleLogout() {
    logout()
    navigate('/login')
  }

  const username = email?.split('@')[0] || 'admin'

  return (
    <header className="h-14 bg-white/80 backdrop-blur-md border-b border-gray-100 flex items-center justify-between px-4 lg:px-6 shadow-sm shadow-gray-100/50">
      <button
        onClick={onMenuClick}
        className="lg:hidden p-2 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors"
      >
        <Menu size={18} />
      </button>

      <div className="flex-1" />

      <div className="flex items-center gap-2">
        <div className="hidden sm:flex items-center gap-2 bg-gray-50 border border-gray-100 rounded-full pl-2.5 pr-3 py-1.5">
          <div className="w-5 h-5 rounded-full bg-gradient-to-br from-pink-500 to-rose-500 flex items-center justify-center">
            <User size={11} className="text-white" />
          </div>
          <span className="text-xs font-medium text-gray-600">{username}</span>
        </div>
        <button
          onClick={handleLogout}
          className="flex items-center gap-1.5 text-xs font-medium text-gray-400 hover:text-red-500 transition-colors px-3 py-2 rounded-lg hover:bg-red-50"
        >
          <LogOut size={14} />
          <span className="hidden sm:inline">Logout</span>
        </button>
      </div>
    </header>
  )
}
