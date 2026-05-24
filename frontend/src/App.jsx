import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { ThemeProvider } from './context/ThemeContext'
import { AuthProvider } from './context/AuthContext'
import Navbar from './components/common/Navbar'
import ProtectedRoute from './components/common/ProtectedRoute'
import Home from './pages/Home'
import Auth from './pages/Auth'
import Analyze from './pages/Analyze'
import Library from './pages/Library'
import Result from './pages/Result'

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <Navbar />
          <Routes>
            <Route path="/"         element={<Home />} />
            <Route path="/auth"     element={<Auth />} />
            <Route path="/analyze"  element={
              <ProtectedRoute><Analyze /></ProtectedRoute>
            } />
            <Route path="/library"  element={
              <ProtectedRoute><Library /></ProtectedRoute>
            } />
            <Route path="/result/:jobId" element={
              <ProtectedRoute><Result /></ProtectedRoute>
            } />
            {/* Legacy redirects */}
            <Route path="/upload"    element={<Navigate to="/analyze"  replace />} />
            <Route path="/dashboard" element={<Navigate to="/library"  replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  )
}
