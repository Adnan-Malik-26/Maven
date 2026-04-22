import { useLocation, Navigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import Loader from './Loader'

export default function ProtectedRoute({ children }) {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader variant="spinner" size="lg" />
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/auth" state={{ from: location }} replace />
  }

  return children
}
