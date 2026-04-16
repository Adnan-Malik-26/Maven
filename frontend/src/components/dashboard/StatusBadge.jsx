import React from 'react';
import { motion } from 'framer-motion';

const STATUS_CONFIG = {
  PROCESSING: {
    label: 'Processing',
    cls: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    dot: 'bg-blue-400 animate-pulse',
  },
  COMPLETED: {
    label: 'Completed',
    cls: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    dot: 'bg-emerald-400',
  },
  FAILED: {
    label: 'Failed',
    cls: 'bg-red-500/10 text-red-400 border-red-500/20',
    dot: 'bg-red-400',
  },
};

export default function StatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] ?? {
    label: status ?? 'Unknown',
    cls: 'bg-slate-500/10 text-slate-400 border-slate-500/20',
    dot: 'bg-slate-400',
  };

  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border ${cfg.cls}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}
