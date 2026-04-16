import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../context/AuthContext';
import { useRealtimeDashboard } from '../hooks/useRealtime';
import JobTable from '../components/dashboard/JobTable';
import { MavenSpinner } from '../components/common/Loader';
import Alert from '../components/common/Alert';

function StatCard({ label, value, sub, color }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass p-5 space-y-1"
    >
      <p className="label-sm">{label}</p>
      <p className="text-2xl font-black font-mono" style={{ color }}>
        {value ?? '—'}
      </p>
      {sub && <p className="text-xs text-slate-600">{sub}</p>}
    </motion.div>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const [jobs,    setJobs]    = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');

  // ── Fetch job history from Supabase ─────────────────────────────────────
  const fetchJobs = useCallback(async () => {
    if (!user?.id) return;
    try {
      const { data, error: err } = await supabase
        .from('analysis_jobs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);

      if (err) throw err;
      setJobs(data ?? []);
    } catch (e) {
      setError(e.message || 'Failed to load jobs');
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => { fetchJobs(); }, [fetchJobs]);

  // ── Real-time: update individual rows in the jobs list ──────────────────
  useRealtimeDashboard(user?.id, useCallback((updatedJob) => {
    setJobs((prev) => {
      const exists = prev.find((j) => j.id === updatedJob.id);
      if (exists) {
        return prev.map((j) => j.id === updatedJob.id ? { ...j, ...updatedJob } : j);
      }
      return [updatedJob, ...prev];
    });
  }, []));

  // ── Derived stats ────────────────────────────────────────────────────────
  const total      = jobs.length;
  const completed  = jobs.filter((j) => j.status === 'COMPLETED').length;
  const processing = jobs.filter((j) => j.status === 'PROCESSING').length;
  const failed     = jobs.filter((j) => j.status === 'FAILED').length;

  const firstName = user?.user_metadata?.first_name ?? user?.email?.split('@')[0] ?? 'Analyst';

  return (
    <div className="min-h-[calc(100vh-56px)] py-10 px-4">
      <div className="max-w-6xl mx-auto space-y-8">

        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
        >
          <div>
            <p className="label-sm mb-1">Welcome back</p>
            <h1 className="text-3xl font-black text-white">
              {firstName}'s Dashboard
            </h1>
          </div>
          <Link to="/upload" className="btn-primary self-start sm:self-auto">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New analysis
          </Link>
        </motion.div>

        {/* Stats row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatCard label="Total analyses" value={total}      color="#a78bfa" />
          <StatCard label="Completed"      value={completed}  color="#34d399" sub="view results →" />
          <StatCard label="Processing"     value={processing} color="#60a5fa" sub="live updating" />
          <StatCard label="Failed"         value={failed}     color="#f87171" />
        </div>

        {/* Error */}
        <Alert type="error" message={error} />

        {/* Live indicator */}
        {processing > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex items-center gap-2 text-sm text-blue-400"
          >
            <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
            {processing} job{processing > 1 ? 's' : ''} running — this page updates in real time
          </motion.div>
        )}

        {/* Job table */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-200">Analysis history</h2>
            <button
              onClick={fetchJobs}
              disabled={loading}
              className="btn-ghost text-xs text-slate-500 flex items-center gap-1"
            >
              {loading ? <MavenSpinner size={14} /> : (
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              )}
              Refresh
            </button>
          </div>
          <JobTable jobs={jobs} loading={loading} />
        </div>

        {/* Empty state CTA */}
        {!loading && jobs.length === 0 && (
          <motion.div
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            className="glass text-center py-20 rounded-2xl"
          >
            <div
              className="w-16 h-16 rounded-2xl mx-auto mb-5 flex items-center justify-center text-3xl"
              style={{ background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.2)' }}
            >
              🔬
            </div>
            <h3 className="text-lg font-bold text-slate-200 mb-2">No analyses yet</h3>
            <p className="text-slate-500 text-sm mb-6">Upload your first video to get a deepfake forensics verdict.</p>
            <Link to="/upload" className="btn-primary">Upload a video</Link>
          </motion.div>
        )}
      </div>
    </div>
  );
}
