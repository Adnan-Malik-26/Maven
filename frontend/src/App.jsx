import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { ThemeProvider } from './context/ThemeContext'
import { AuthProvider } from './context/AuthContext'
import Navbar from './components/common/Navbar'
import ProtectedRoute from './components/common/ProtectedRoute'
import Home from './pages/Home'
import Auth from './pages/Auth'
import Upload from './pages/Upload'
import Dashboard from './pages/Dashboard'
import Result from './pages/Result'

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <Navbar />
          <Routes>
            <Route path="/"     element={<Home />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/upload" element={
              <ProtectedRoute><Upload /></ProtectedRoute>
            } />
            <Route path="/dashboard" element={
              <ProtectedRoute><Dashboard /></ProtectedRoute>
            } />
            <Route path="/result/:jobId" element={
              <ProtectedRoute><Result /></ProtectedRoute>
            } />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  )
}
