import React from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import StatusBadge from './StatusBadge';
import { Skeleton } from '../common/Loader';

function formatDate(isoString) {
  if (!isoString) return '—';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true,
  }).format(new Date(isoString));
}

function truncatePath(path) {
  if (!path) return '—';
  // Extract filename from URL or path
  const parts = path.split('/');
  return parts[parts.length - 1] || path;
}

function JobRow({ job, index }) {
  const navigate = useNavigate();

  const handleClick = () => {
    if (job.status === 'COMPLETED') {
      navigate(`/result/${job.id}`);
    }
  };

  return (
    <motion.tr
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04 }}
      onClick={handleClick}
      className={`border-b border-white/[0.04] transition-colors ${
        job.status === 'COMPLETED'
          ? 'cursor-pointer hover:bg-white/[0.03]'
          : 'cursor-default'
      }`}
    >
      {/* Filename */}
      <td className="px-4 py-3.5">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-brand-600/20 border border-brand-500/20 flex items-center justify-center shrink-0">
            <svg className="w-4 h-4 text-brand-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M15 10l4.553-2.069A1 1 0 0121 8.82V15.18a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          </div>
          <div>
            <p className="text-sm text-slate-200 font-medium truncate max-w-[200px]">
              {truncatePath(job.video_path)}
            </p>
            <p className="text-xs text-slate-500 font-mono">{job.id?.slice(0, 8)}…</p>
          </div>
        </div>
      </td>

      {/* Status */}
      <td className="px-4 py-3.5">
        <StatusBadge status={job.status} />
      </td>

      {/* Date */}
      <td className="px-4 py-3.5 text-sm text-slate-400 whitespace-nowrap">
        {formatDate(job.created_at)}
      </td>

      {/* Action */}
      <td className="px-4 py-3.5">
        {job.status === 'COMPLETED' ? (
          <span className="text-xs text-brand-400 font-medium flex items-center gap-1">
            View result
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </span>
        ) : job.status === 'FAILED' ? (
          <span className="text-xs text-red-400/70">{job.error_message || 'Analysis failed'}</span>
        ) : (
          <span className="text-xs text-blue-400/70 flex items-center gap-1.5">
            <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Analysing…
          </span>
        )}
      </td>
    </motion.tr>
  );
}

function SkeletonRow() {
  return (
    <tr className="border-b border-white/[0.04]">
      <td className="px-4 py-3.5">
        <div className="flex items-center gap-2.5">
          <Skeleton className="w-8 h-8 rounded-lg" />
          <div className="space-y-1.5">
            <Skeleton className="w-32 h-3" />
            <Skeleton className="w-20 h-2.5" />
          </div>
        </div>
      </td>
      <td className="px-4 py-3.5"><Skeleton className="w-20 h-5 rounded-lg" /></td>
      <td className="px-4 py-3.5"><Skeleton className="w-28 h-3" /></td>
      <td className="px-4 py-3.5"><Skeleton className="w-16 h-3" /></td>
    </tr>
  );
}

export default function JobTable({ jobs, loading }) {
  return (
    <div className="glass overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-white/[0.06]">
              {['File', 'Status', 'Submitted', 'Action'].map((h) => (
                <th key={h} className="px-4 py-3 text-left label-sm font-semibold">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} />)
            ) : jobs.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-16 text-center text-slate-500 text-sm">
                  No analyses yet.{' '}
                  <a href="/upload" className="text-brand-400 hover:underline">Upload a video</a> to get started.
                </td>
              </tr>
            ) : (
              jobs.map((job, i) => <JobRow key={job.id} job={job} index={i} />)
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
