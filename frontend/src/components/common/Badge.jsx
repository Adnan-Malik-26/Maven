import { clsx } from 'clsx'

const variants = {
  default:  'bg-slate-100 dark:bg-dark-surface text-slate-600 dark:text-slate-400',
  blue:     'bg-blue-50 dark:bg-blue-500/15 text-blue-700 dark:text-blue-400',
  green:    'bg-green-50 dark:bg-green-500/15 text-green-700 dark:text-green-400',
  red:      'bg-red-50 dark:bg-red-500/15 text-red-700 dark:text-red-400',
  amber:    'bg-amber-50 dark:bg-amber-500/15 text-amber-700 dark:text-amber-400',
  purple:   'bg-violet-50 dark:bg-violet-500/15 text-violet-700 dark:text-violet-400',
}

export default function Badge({ children, variant = 'default', className }) {
  return (
    <span className={clsx(
      'inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium',
      variants[variant],
      className
    )}>
      {children}
    </span>
  )
}
