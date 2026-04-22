import { motion } from 'framer-motion'
import { clsx } from 'clsx'

export default function UploadProgress({ progress, status }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="text-slate-600 dark:text-slate-400 font-medium">{status}</span>
        <span className="font-mono text-blue-600 dark:text-blue-400 font-semibold">{progress}%</span>
      </div>
      <div className="w-full h-2 bg-slate-100 dark:bg-dark-surface rounded-full overflow-hidden">
        <motion.div
          className="h-full bg-gradient-to-r from-blue-500 to-violet-500 rounded-full"
          initial={{ width: 0 }}
          animate={{ width: `${progress}%` }}
          transition={{ ease: 'easeOut' }}
        />
      </div>
      {progress === 100 && status !== 'Uploading…' && (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-xs text-slate-500 text-center"
        >
          {status}
        </motion.p>
      )}
    </div>
  )
}
