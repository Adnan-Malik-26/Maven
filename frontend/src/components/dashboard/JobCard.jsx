import { useState } from 'react'
import { Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { FileVideo, Trash2, ArrowRight, RefreshCw } from 'lucide-react'
import { clsx } from 'clsx'
import { formatDistanceToNow } from 'date-fns'
import StatusBadge from './StatusBadge'
import { deleteJob } from '../../services/api'

function formatBytes(mb) {
  if (!mb) return '—'
  return mb < 1 ? `${(mb * 1024).toFixed(0)} KB` : `${mb.toFixed(1)} MB`
}

function VerdictPill({ verdict, confidence }) {
  const cfg = {
    FAKE:      'bg-red-50 dark:bg-red-500/15 text-red-600 dark:text-red-400 border-red-200 dark:border-red-500/30',
    REAL:      'bg-green-50 dark:bg-green-500/15 text-green-600 dark:text-green-400 border-green-200 dark:border-green-500/30',
    UNCERTAIN: 'bg-amber-50 dark:bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-500/30',
  }[verdict] ?? ''
  return (
    <span className={clsx('inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold border', cfg)}>
      {verdict} {confidence != null && `· ${(confidence * 100).toFixed(1)}%`}
    </span>
  )
}

export default function JobCard({ job, onDeleted }) {
  const [deleting,    setDeleting]    = useState(false)
  const [confirmDel,  setConfirmDel]  = useState(false)

  const created = job.created_at
    ? formatDistanceToNow(new Date(job.created_at), { addSuffix: true })
    : '—'

  const handleDelete = async () => {
    setDeleting(true)
    try {
      await deleteJob(job.id)
      onDeleted?.(job.id)
    } finally {
      setDeleting(false)
      setConfirmDel(false)
    }
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      whileHover={{ scale: 1.01 }}
      transition={{ duration: 0.2 }}
      className="card p-5 flex flex-col gap-4 hover:shadow-md dark:hover:shadow-black/30 transition-shadow"
    >
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-dark-surface flex items-center justify-center shrink-0">
          <FileVideo size={18} className="text-slate-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-slate-900 dark:text-slate-50 truncate text-sm leading-tight">
            {job.original_name ?? 'Unnamed video'}
          </p>
          <p className="text-xs text-slate-400 mt-0.5">{created} · {formatBytes(job.file_size_mb)}</p>
        </div>
      </div>

      {/* Status row */}
      <div className="flex items-center gap-2 flex-wrap">
        <StatusBadge status={job.status} />
        <AnimatePresence>
          {job.status === 'COMPLETED' && job.verdict && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ type: 'spring', stiffness: 300 }}
            >
              <VerdictPill verdict={job.verdict} confidence={job.confidence} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Processing ring */}
      {job.status === 'PROCESSING' && (
        <div className="flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500" />
          </span>
          Running forensic analysis…
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 pt-1 border-t border-slate-100 dark:border-dark-border">
        {job.status === 'COMPLETED' && (
          <Link
            to={`/result/${job.id}`}
            className="flex-1 btn-primary text-sm py-2 px-4 justify-center"
          >
            View Results <ArrowRight size={14} />
          </Link>
        )}
        {job.status === 'FAILED' && (
          <Link to="/upload" className="flex-1 btn-secondary text-sm py-2 justify-center">
            <RefreshCw size={14} /> Try Again
          </Link>
        )}

        {/* Delete */}
        <AnimatePresence mode="wait">
          {confirmDel ? (
            <motion.div
              key="confirm"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex items-center gap-1.5"
            >
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="text-xs font-medium text-red-600 dark:text-red-400 px-3 py-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors disabled:opacity-50"
              >
                {deleting ? 'Deleting…' : 'Confirm'}
              </button>
              <button
                onClick={() => setConfirmDel(false)}
                className="text-xs text-slate-500 px-2 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-dark-surface transition-colors"
              >
                Cancel
              </button>
            </motion.div>
          ) : (
            <motion.button
              key="trash"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setConfirmDel(true)}
              className="p-2 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
            >
              <Trash2 size={15} />
            </motion.button>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  )
}
