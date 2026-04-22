import { clsx } from 'clsx'

function Spinner({ size }) {
  const sz = { sm: 'w-4 h-4', md: 'w-6 h-6', lg: 'w-10 h-10' }[size] ?? 'w-6 h-6'
  return (
    <div className={clsx('rounded-full border-2 border-blue-500/20 border-t-blue-500 animate-spin', sz)} />
  )
}

function Dots() {
  return (
    <div className="flex items-center gap-1.5">
      {[0, 1, 2].map(i => (
        <span
          key={i}
          className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"
          style={{ animationDelay: `${i * 0.15}s` }}
        />
      ))}
    </div>
  )
}

function Skeleton({ width = 'w-full', height = 'h-4' }) {
  return (
    <div className={clsx('rounded-lg bg-slate-200 dark:bg-dark-surface animate-shimmer', width, height)} />
  )
}

export default function Loader({ variant = 'spinner', size = 'md', width, height }) {
  if (variant === 'dots')    return <Dots />
  if (variant === 'skeleton') return <Skeleton width={width} height={height} />
  return <Spinner size={size} />
}
