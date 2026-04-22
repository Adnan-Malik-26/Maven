import { motion, AnimatePresence } from 'framer-motion'
import { Sun, Moon } from 'lucide-react'
import { useTheme } from '../../context/ThemeContext'

export default function ThemeToggle() {
  const { theme, toggle } = useTheme()
  const isDark = theme === 'dark'

  return (
    <button
      onClick={toggle}
      aria-label={`Switch to ${isDark ? 'light' : 'dark'} mode`}
      className="relative w-9 h-9 rounded-lg flex items-center justify-center hover:bg-slate-100 dark:hover:bg-dark-surface transition-colors overflow-hidden"
    >
      <AnimatePresence mode="wait" initial={false}>
        {isDark ? (
          <motion.span
            key="moon"
            initial={{ rotate: -90, scale: 0, opacity: 0 }}
            animate={{ rotate: 0,   scale: 1, opacity: 1 }}
            exit={{   rotate:  90, scale: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute text-slate-400"
          >
            <Moon size={16} />
          </motion.span>
        ) : (
          <motion.span
            key="sun"
            initial={{ rotate: 90, scale: 0, opacity: 0 }}
            animate={{ rotate: 0,  scale: 1, opacity: 1 }}
            exit={{   rotate: -90, scale: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute text-amber-500"
          >
            <Sun size={16} />
          </motion.span>
        )}
      </AnimatePresence>
    </button>
  )
}
