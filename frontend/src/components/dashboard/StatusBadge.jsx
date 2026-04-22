import { clsx } from 'clsx'
import { CheckCircle, XCircle, Loader } from 'lucide-react'

const configs = {
  PROCESSING: {
    label: 'Analyzing…',
    icon: Loader,
    className: 'bg-amber-50 dark:bg-amber-500/15 text-amber-700 dark:text-amber-400',
    spin: true,
  },
  COMPLETED: {
    label: 'Completed',
    icon: CheckCircle,
    className: 'bg-green-50 dark:bg-green-500/15 text-green-700 dark:text-green-400',
    spin: false,
  },
  FAILED: {
    label: 'Failed',
    icon: XCircle,
    className: 'bg-red-50 dark:bg-red-500/15 text-red-700 dark:text-red-400',
    spin: false,
  },
}

export default function StatusBadge({ status }) {
  const cfg = configs[status] ?? configs.PROCESSING
  const Icon = cfg.icon

  return (
    <span className={clsx('inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium', cfg.className)}>
      <Icon size={12} className={clsx(cfg.spin && 'animate-spin')} />
      {cfg.label}
    </span>
  )
}
