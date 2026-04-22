import { useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Layers } from 'lucide-react'
import DropZone from '../components/upload/DropZone'
import UploadProgress from '../components/upload/UploadProgress'
import { submitVideo } from '../services/api'

export default function Upload() {
  const navigate = useNavigate()
  const [file,     setFile]     = useState(null)
  const [progress, setProgress] = useState(0)
  const [status,   setStatus]   = useState('')
  const [uploading, setUploading] = useState(false)
  const [error,    setError]    = useState('')

  const handleFile = useCallback((f) => { setFile(f); setError('') }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!file) return
    setUploading(true)
    setError('')
    setProgress(0)
    setStatus('Uploading…')

    try {
      const fd = new FormData()
      fd.append('video', file)
      const { data } = await submitVideo(fd, (pct) => setProgress(pct))
      setStatus('Starting analysis…')
      setProgress(100)
      setTimeout(() => navigate(`/result/${data.jobId ?? data.job_id}`), 600)
    } catch (err) {
      setError(err?.response?.data?.message ?? 'Upload failed. Please try again.')
      setUploading(false)
      setProgress(0)
      setStatus('')
    }
  }

  return (
    <div className="min-h-[calc(100vh-64px)] flex items-center justify-center px-6 py-12">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-2xl space-y-8"
      >
        {/* Header */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400 text-sm font-medium">
            <Layers size={14} /> Forensic Analysis
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
            Analyze a Video
          </h1>
          <p className="text-slate-500 dark:text-slate-400">
            Upload a video file to run deepfake forensic analysis across three AI detection layers.
          </p>
        </div>

        {/* Upload card */}
        <div className="card p-6 space-y-6">
          <DropZone onFile={handleFile} />

          {error && (
            <p className="text-sm text-red-600 dark:text-red-400 flex items-center gap-1.5">
              ⚠ {error}
            </p>
          )}

          {uploading && (
            <UploadProgress progress={progress} status={status} />
          )}

          <button
            onClick={handleSubmit}
            disabled={!file || uploading}
            className="btn-primary w-full py-4 text-base"
          >
            {uploading ? (
              <>
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Analyzing…
              </>
            ) : 'Analyze Video'}
          </button>
        </div>

        {/* Info */}
        <div className="grid grid-cols-3 gap-4 text-center">
          {[
            { v: '3', l: 'AI Layers' },
            { v: '<90s', l: 'Analysis Time' },
            { v: '100MB', l: 'Max File Size' },
          ].map(s => (
            <div key={s.l} className="card p-4">
              <p className="text-xl font-black text-slate-900 dark:text-white">{s.v}</p>
              <p className="text-xs text-slate-500 mt-0.5">{s.l}</p>
            </div>
          ))}
        </div>
      </motion.div>
    </div>
  )
}
