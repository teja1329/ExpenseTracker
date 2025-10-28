import { useEffect } from 'react'
import Navbar from './components/Navbar.jsx'
import { Routes, Route, Navigate } from 'react-router-dom'
import Dashboard from './pages/Dashboard.jsx'
import Expenses from './pages/Expenses.jsx'
import Profile from './pages/Profile.jsx'
import SignIn from './pages/SignIn.jsx'
import SignUp from './pages/SignUp.jsx'
import { useAuth } from './lib/auth.jsx'

export default function App() {
  const { isAuthed } = useAuth()

  // Always clear dark mode since preferences are removed
  useEffect(() => {
    document.documentElement.classList.remove('dark')
  }, [])

  return (
    <div>
      <Navbar />
      <div className="max-w-6xl mx-auto p-4">
        <Routes>
          <Route path="/signin" element={<SignIn />} />
          <Route path="/signup" element={<SignUp />} />
          <Route path="/" element={isAuthed ? <Dashboard /> : <Navigate to="/signin" />} />
          <Route path="/expenses" element={isAuthed ? <Expenses /> : <Navigate to="/signin" />} />
          <Route path="/profile" element={isAuthed ? <Profile /> : <Navigate to="/signin" />} />
        </Routes>
      </div>
    </div>
  )
}
