import { useCallback, useState } from 'react'
import { motion } from 'framer-motion'
import { UploadCloud, FileVideo, X, AlertCircle } from 'lucide-react'
import { clsx } from 'clsx'

const ACCEPTED_TYPES = ['video/mp4', 'video/webm', 'video/quicktime']
const MAX_SIZE_MB = 100

function formatBytes(bytes) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function validate(file) {
  if (!ACCEPTED_TYPES.includes(file.type)) {
    return 'Unsupported format. Please upload MP4, WebM, or MOV.'
  }
  if (file.size > MAX_SIZE_MB * 1024 * 1024) {
    return `File too large. Maximum size is ${MAX_SIZE_MB} MB.`
  }
  return null
}

export default function DropZone({ onFile }) {
  const [dragging, setDragging] = useState(false)
  const [file, setFile]         = useState(null)
  const [error, setError]       = useState(null)

  const handleFile = useCallback((f) => {
    const err = validate(f)
    if (err) {
      setError(err)
      setFile(null)
      onFile(null)
    } else {
      setError(null)
      setFile(f)
      onFile(f)
    }
  }, [onFile])

  const onDrop = (e) => {
    e.preventDefault()
    setDragging(false)
    const f = e.dataTransfer.files?.[0]
    if (f) handleFile(f)
  }

  const onInputChange = (e) => {
    const f = e.target.files?.[0]
    if (f) handleFile(f)
  }

  const clear = (e) => {
    e.stopPropagation()
    setFile(null)
    setError(null)
    onFile(null)
  }

  return (
    <div className="space-y-3">
      <label
        className={clsx(
          'relative block rounded-2xl border-2 border-dashed cursor-pointer transition-all duration-200',
          !file && !error && !dragging && 'border-slate-300 dark:border-dark-border hover:border-blue-400 dark:hover:border-blue-500',
          dragging && 'border-blue-400 bg-blue-50 dark:bg-blue-500/10 scale-[1.01]',
          error   && 'border-red-400 bg-red-50 dark:bg-red-500/10',
          file    && !error && 'border-green-400 bg-green-50 dark:bg-green-500/10',
        )}
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        <input
          type="file"
          accept={ACCEPTED_TYPES.join(',')}
          className="sr-only"
          onChange={onInputChange}
        />

        {file ? (
          <div className="flex items-center gap-4 p-6">
            <div className="w-12 h-12 rounded-xl bg-green-100 dark:bg-green-500/20 flex items-center justify-center shrink-0">
              <FileVideo size={22} className="text-green-600 dark:text-green-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-slate-900 dark:text-slate-50 truncate">{file.name}</p>
              <p className="text-sm text-slate-500">{formatBytes(file.size)}</p>
            </div>
            <button
              onClick={clear}
              className="p-2 hover:bg-slate-100 dark:hover:bg-dark-surface rounded-lg transition-colors text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            >
              <X size={18} />
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
            <motion.div
              animate={dragging ? { scale: 1.1 } : { scale: 1 }}
              transition={{ type: 'spring', stiffness: 300 }}
              className={clsx(
                'w-16 h-16 rounded-2xl flex items-center justify-center mb-4',
                dragging ? 'bg-blue-100 dark:bg-blue-500/20' : 'bg-slate-100 dark:bg-dark-surface'
              )}
            >
              <UploadCloud size={32} className={dragging ? 'text-blue-500' : 'text-slate-400'} />
            </motion.div>
            <p className="text-lg font-semibold text-slate-900 dark:text-slate-50 mb-1">
              {dragging ? 'Drop it here' : 'Drop your video here'}
            </p>
            <p className="text-sm text-slate-500 mb-4">or click to browse files</p>
            <p className="text-xs text-slate-400">MP4, WebM, MOV · Max 100 MB</p>
          </div>
        )}
      </label>

      {error && (
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400"
        >
          <AlertCircle size={14} /> {error}
        </motion.div>
      )}
    </div>
  )
}
