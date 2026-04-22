import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { RefreshCw, Upload, LayoutDashboard } from 'lucide-react'
import { clsx } from 'clsx'
import { getJobs } from '../services/api'
import { connectSocket, disconnectSocket, getSocket } from '../services/socket'
import JobCard from '../components/dashboard/JobCard'
import Loader from '../components/common/Loader'
import { supabase } from '../lib/supabaseClient'

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center space-y-5">
      <div className="w-20 h-20 rounded-2xl bg-slate-100 dark:bg-dark-surface flex items-center justify-center">
        <LayoutDashboard size={32} className="text-slate-300 dark:text-slate-600" />
      </div>
      <div>
        <p className="text-lg font-semibold text-slate-900 dark:text-white">No analyses yet</p>
        <p className="text-sm text-slate-500 mt-1">Upload your first video to get started.</p>
      </div>
      <Link to="/upload" className="btn-primary">
        <Upload size={16} /> Analyze a Video
      </Link>
    </div>
  )
}

export default function Dashboard() {
  const [jobs,    setJobs]    = useState([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState('')

  const fetchJobs = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await getJobs()
      setJobs(data.jobs ?? data ?? [])
    } catch {
      setError('Failed to load analyses.')
    } finally {
      setLoading(false)
    }
  }, [])

  // Socket.io: listen for analysis_complete events
  useEffect(() => {
    connectSocket()
    const socket = getSocket()

    socket.on('analysis_complete', ({ jobId, verdict }) => {
      setJobs(prev => prev.map(j =>
        j.id === jobId ? { ...j, status: 'COMPLETED', verdict } : j
      ))
    })
    socket.on('analysis_failed', ({ jobId }) => {
      setJobs(prev => prev.map(j =>
        j.id === jobId ? { ...j, status: 'FAILED' } : j
      ))
    })

    return () => {
      socket.off('analysis_complete')
      socket.off('analysis_failed')
      disconnectSocket()
    }
  }, [])

  // Supabase Realtime for all processing jobs
  useEffect(() => {
    fetchJobs()
  }, [fetchJobs])

  useEffect(() => {
    const processingIds = jobs.filter(j => j.status === 'PROCESSING').map(j => j.id)
    if (!processingIds.length) return

    const channel = supabase
      .channel('dashboard-jobs')
      .on('postgres_changes', {
        event:  'UPDATE',
        schema: 'public',
        table:  'analysis_jobs',
      }, (payload) => {
        setJobs(prev => prev.map(j =>
          j.id === payload.new.id ? { ...j, ...payload.new } : j
        ))
      })
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [jobs.map(j => j.id).join(',')])

  const handleDeleted = (id) => setJobs(prev => prev.filter(j => j.id !== id))

  return (
    <div className="min-h-[calc(100vh-64px)] px-6 py-10">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
              Your Analyses
              {!loading && jobs.length > 0 && (
                <span className="ml-2.5 text-sm font-medium px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400">
                  {jobs.length}
                </span>
              )}
            </h1>
            <p className="text-sm text-slate-500 mt-0.5">Real-time status updates</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={fetchJobs}
              disabled={loading}
              className="btn-ghost gap-2 text-sm"
            >
              <RefreshCw size={14} className={clsx(loading && 'animate-spin')} />
              Refresh
            </button>
            <Link to="/upload" className="btn-primary text-sm py-2 px-4">
              <Upload size={14} /> New Analysis
            </Link>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="card p-4 border-red-200 dark:border-red-500/30 text-red-600 dark:text-red-400 text-sm">
            {error}
          </div>
        )}

        {/* Content */}
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader variant="dots" />
          </div>
        ) : jobs.length === 0 ? (
          <EmptyState />
        ) : (
          <motion.div
            layout
            className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4"
          >
            <AnimatePresence>
              {jobs.map(job => (
                <JobCard key={job.id} job={job} onDeleted={handleDeleted} />
              ))}
            </AnimatePresence>
          </motion.div>
        )}
      </div>
    </div>
  )
}
