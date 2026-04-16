import React from 'react';
import { motion } from 'framer-motion';

/**
 * Full-page loader shown during route transitions or auth init.
 */
export function PageLoader() {
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-[#0a0a0f] z-50">
      <MavenSpinner size={48} />
    </div>
  );
}

/**
 * Inline spinner with the MAVEN brand orbit animation.
 */
export function MavenSpinner({ size = 32 }) {
  return (
    <div className="relative" style={{ width: size, height: size }}>
      {/* Outer ring */}
      <motion.div
        className="absolute inset-0 rounded-full border-2 border-brand-500/20"
        style={{ borderTopColor: '#8b5cf6' }}
        animate={{ rotate: 360 }}
        transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
      />
      {/* Inner dot */}
      <div
        className="absolute rounded-full bg-brand-500"
        style={{
          width: size * 0.22,
          height: size * 0.22,
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
        }}
      />
    </div>
  );
}

/**
 * Skeleton block for loading placeholders.
 */
export function Skeleton({ className = '' }) {
  return (
    <div className={`shimmer-bg rounded-lg ${className}`} />
  );
}

export default MavenSpinner;
