import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const ICONS = {
  success: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
  ),
  error: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  warning: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
    </svg>
  ),
  info: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
};

const STYLES = {
  success: 'bg-emerald-500/10 border-emerald-500/25 text-emerald-400',
  error:   'bg-red-500/10 border-red-500/25 text-red-400',
  warning: 'bg-amber-500/10 border-amber-500/25 text-amber-400',
  info:    'bg-brand-500/10 border-brand-500/25 text-brand-400',
};

/**
 * Alert component
 * @param {'success'|'error'|'warning'|'info'} type
 * @param {string}   message
 * @param {boolean}  show
 * @param {Function} onClose
 */
export default function Alert({ type = 'info', message, show = true, onClose }) {
  if (!message) return null;

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, y: -8, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -8, scale: 0.97 }}
          transition={{ duration: 0.2 }}
          className={`flex items-start gap-3 px-4 py-3 rounded-xl border text-sm ${STYLES[type]}`}
        >
          <span className="mt-0.5 shrink-0">{ICONS[type]}</span>
          <span className="flex-1 leading-relaxed">{message}</span>
          {onClose && (
            <button
              onClick={onClose}
              className="shrink-0 opacity-60 hover:opacity-100 transition-opacity"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
