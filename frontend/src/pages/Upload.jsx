import React, { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import DropZone from '../components/upload/DropZone';
import UploadProgress from '../components/upload/UploadProgress';
import { useAnalysis } from '../hooks/useAnalysis';
import { useRealtime } from '../hooks/useRealtime';
import Alert from '../components/common/Alert';

const TIPS = [
  'Videos with a clearly visible face yield the most accurate results.',
  'Longer clips (10–60 seconds) give the liveness detector more signal to work with.',
  'Clear audio improves lip-sync detection accuracy significantly.',
  'The FFT layer works even on silent or low-quality videos.',
];

export default function Upload() {
  const navigate = useNavigate();
  const { submit, progress, uploading, error: uploadError, reset } = useAnalysis();

  const [file,      setFile]      = useState(null);
  const [phase,     setPhase]     = useState('idle');  // idle | uploading | submitted | done
  const [jobId,     setJobId]     = useState(null);
  const [jobStatus, setJobStatus] = useState(null);
  const [tipIndex]                = useState(() => Math.floor(Math.random() * TIPS.length));

  // ── Real-time job status ────────────────────────────────────────────────
  useRealtime(jobId, useCallback((updatedJob) => {
    setJobStatus(updatedJob.status);
    if (updatedJob.status === 'COMPLETED') {
      setPhase('done');
      setTimeout(() => navigate(`/result/${updatedJob.id}`), 2000);
    }
  }, [navigate]));

  // ── Handlers ────────────────────────────────────────────────────────────
  const handleFile = (f) => {
    setFile(f);
    reset();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!file) return;
    setPhase('uploading');
    try {
      const { jobId: id } = await submit(file);
      setJobId(id);
      setJobStatus('PROCESSING');
      setPhase('submitted');
    } catch (_) {
      setPhase('idle');
    }
  };

  const handleReset = () => {
    setFile(null);
    setPhase('idle');
    setJobId(null);
    setJobStatus(null);
    reset();
  };

  const isSubmitting = phase === 'uploading' || phase === 'submitted';
  const isDone = phase === 'done';

  return (
    <div className="min-h-[calc(100vh-56px)] py-12 px-4">
      <div className="max-w-2xl mx-auto">

        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-10"
        >
          <p className="label-sm mb-2">New analysis</p>
          <h1 className="text-3xl font-black text-white">Upload a video</h1>
          <p className="text-slate-500 text-sm mt-2">
            We'll run FFT frequency analysis and lip-sync detection in parallel and return a verdict.
          </p>
        </motion.div>

        <AnimatePresence mode="wait">
          {/* ── IDLE / UPLOAD FORM ── */}
          {(phase === 'idle' || phase === 'uploading') && (
            <motion.form
              key="form"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              onSubmit={handleSubmit}
              className="space-y-6"
            >
              <div className="glass p-6">
                <DropZone onFile={handleFile} disabled={uploading} />

                {/* Upload progress bar (only during actual upload) */}
                <AnimatePresence>
                  {uploading && (
                    <motion.div
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      className="mt-5"
                    >
                      <div className="h-1.5 bg-white/[0.05] rounded-full overflow-hidden">
                        <motion.div
                          className="h-full rounded-full"
                          style={{ background: 'linear-gradient(90deg, #7c3aed, #8b5cf6)' }}
                          animate={{ width: `${progress}%` }}
                          transition={{ duration: 0.3 }}
                        />
                      </div>
                      <p className="text-xs text-slate-500 mt-2 text-right font-mono">{progress}%</p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Error */}
              <Alert type="error" message={uploadError} />

              {/* Tip */}
              <div
                className="flex items-start gap-3 px-4 py-3 rounded-xl text-sm"
                style={{ background: 'rgba(139,92,246,0.06)', border: '1px solid rgba(139,92,246,0.15)' }}
              >
                <span className="text-brand-400 shrink-0 mt-0.5">💡</span>
                <p className="text-slate-400">{TIPS[tipIndex]}</p>
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={!file || uploading}
                className="btn-primary w-full py-3 text-base"
              >
                {uploading ? (
                  <span className="flex items-center gap-2">
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    Uploading…
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18" />
                    </svg>
                    Start analysis
                  </span>
                )}
              </button>
            </motion.form>
          )}

          {/* ── PROCESSING / DONE STATE ── */}
          {(phase === 'submitted' || phase === 'done') && (
            <motion.div
              key="processing"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="glass p-8 space-y-6"
            >
              <UploadProgress progress={100} status={jobStatus} jobId={jobId} />

              {isDone && (
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="text-center text-sm text-slate-500"
                >
                  Redirecting to results…
                </motion.p>
              )}

              {!isDone && (
                <button onClick={handleReset} className="btn-ghost w-full text-slate-600 text-xs">
                  Cancel and start over
                </button>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Detection layer badges */}
        {phase === 'idle' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="mt-8 grid grid-cols-3 gap-3 text-center text-xs text-slate-500"
          >
            {[
              { icon: '📡', label: 'FFT Artifacts', active: true },
              { icon: '🎧', label: 'Lip-Sync',      active: true },
              { icon: '👁️', label: 'Liveness',      active: false, soon: true },
            ].map((l) => (
              <div
                key={l.label}
                className="flex flex-col items-center gap-1.5 px-2 py-3 rounded-xl"
                style={{
                  background: l.active ? 'rgba(139,92,246,0.06)' : 'rgba(255,255,255,0.02)',
                  border: `1px solid ${l.active ? 'rgba(139,92,246,0.2)' : 'rgba(255,255,255,0.05)'}`,
                }}
              >
                <span className="text-xl">{l.icon}</span>
                <span className={l.active ? 'text-slate-400' : 'text-slate-700'}>{l.label}</span>
                {l.soon && <span className="text-[10px] text-brand-600 font-semibold">Coming soon</span>}
              </div>
            ))}
          </motion.div>
        )}
      </div>
    </div>
  );
}
