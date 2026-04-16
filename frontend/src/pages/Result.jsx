import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { supabase } from '../lib/supabaseClient';
import { useRealtime } from '../hooks/useRealtime';
import VerdictCard from '../components/results/VerdictCard';
import ScoreBreakdown from '../components/results/ScoreBreakdown';
import SyncTimeline from '../components/results/SyncTimeline';
import BlinkStats from '../components/results/BlinkStats';
import RppgChart from '../components/results/RppgChart';
import StatusBadge from '../components/dashboard/StatusBadge';
import { Skeleton } from '../components/common/Loader';
import { MavenSpinner } from '../components/common/Loader';

// ─── Extract raw result data from DB row ────────────────────────────────────
// The aggregator stores its output in 'raw_results' JSONB col.
// We defensively look in multiple places.
function parseResultData(resultRow) {
  if (!resultRow) return null;

  // Prefer 'raw_results' (what the service actually writes)
  const raw = resultRow.raw_results ?? resultRow.details ?? {};

  return {
    verdict:    resultRow.verdict    ?? raw.verdict    ?? 'UNCERTAIN',
    confidence: resultRow.confidence ?? raw.confidence ?? null,
    breakdown:  raw.breakdown        ?? null,
    fftResult:    raw.breakdown?.fft      ? { ...raw } :
                  (resultRow.fft_score != null ? {
                    rawScore: resultRow.fft_score,
                    unifiedFakeProb: resultRow.fft_score
                  } : null),
    livenessResult: null, // service not implemented yet
    lipsyncResult:  raw.lipsyncResult ?? null,
  };
}

// ─── FFT detail card ────────────────────────────────────────────────────────
function FftCard({ fftData, breakdown }) {
  const data = fftData
    ?? (breakdown?.fft ? { artifact_score: breakdown.fft.rawScore, total_frames_analyzed: null } : null);
  if (!data) return null;

  const score = data.artifact_score ?? data.rawScore ?? breakdown?.fft?.rawScore;
  const suspicious = data.suspicious_frames ?? [];
  const totalFrames = data.total_frames_analyzed;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h4 className="text-sm font-bold text-slate-200">FFT Frequency Analysis</h4>
          <p className="text-xs text-slate-500 mt-0.5">
            High-frequency energy ratio across {totalFrames ? `${totalFrames} frames` : 'extracted frames'}
          </p>
        </div>
        {score != null && (
          <div className="text-right">
            <p className={`text-xl font-black font-mono ${score > 0.65 ? 'text-red-400' : score > 0.40 ? 'text-amber-400' : 'text-emerald-400'}`}>
              {Math.round(score * 100)}%
            </p>
            <p className="text-[10px] text-slate-500 uppercase tracking-wider">fake prob</p>
          </div>
        )}
      </div>

      {suspicious.length > 0 && (
        <div>
          <p className="label-sm mb-2">Suspicious frames ({suspicious.length})</p>
          <div className="flex flex-wrap gap-1.5">
            {suspicious.slice(0, 30).map((f) => (
              <span
                key={f}
                className="px-2 py-0.5 rounded text-xs font-mono"
                style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#f87171' }}
              >
                #{f}
              </span>
            ))}
            {suspicious.length > 30 && (
              <span className="text-xs text-slate-600 self-center">+{suspicious.length - 30} more</span>
            )}
          </div>
        </div>
      )}

      {suspicious.length === 0 && (
        <div
          className="flex items-center gap-2.5 px-4 py-3 rounded-xl"
          style={{ background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.15)' }}
        >
          <svg className="w-4 h-4 text-emerald-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          <p className="text-sm text-emerald-400">No suspicious frames detected above threshold.</p>
        </div>
      )}
    </div>
  );
}

// ─── Raw JSON viewer ────────────────────────────────────────────────────────
function RawDetails({ data }) {
  const [expanded, setExpanded] = useState(false);
  if (!data) return null;
  return (
    <div>
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-2 text-xs text-slate-600 hover:text-slate-400 transition-colors"
      >
        <svg
          className={`w-3.5 h-3.5 transition-transform ${expanded ? 'rotate-90' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        {expanded ? 'Hide' : 'Show'} raw result data
      </button>
      {expanded && (
        <motion.pre
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          className="mt-3 p-4 rounded-xl text-xs font-mono text-slate-400 overflow-auto max-h-72"
          style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.06)' }}
        >
          {JSON.stringify(data, null, 2)}
        </motion.pre>
      )}
    </div>
  );
}

// ─── Loading skeleton ────────────────────────────────────────────────────────
function ResultSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="w-full h-40" />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-4">
          <Skeleton className="w-full h-64" />
          <Skeleton className="w-full h-40" />
        </div>
        <div className="space-y-4">
          <Skeleton className="w-full h-48" />
          <Skeleton className="w-full h-48" />
        </div>
      </div>
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────
export default function Result() {
  const { jobId } = useParams();
  const navigate  = useNavigate();

  const [job,     setJob]     = useState(null);
  const [result,  setResult]  = useState(null);
  const [parsed,  setParsed]  = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');

  // ── Fetch job + result ──────────────────────────────────────────────────
  useEffect(() => {
    const fetchData = async () => {
      try {
        // Job row
        const { data: jobData, error: jobErr } = await supabase
          .from('analysis_jobs')
          .select('*')
          .eq('id', jobId)
          .single();
        if (jobErr) throw jobErr;
        setJob(jobData);

        // Result row
        const { data: resultData, error: resultErr } = await supabase
          .from('analysis_results')
          .select('*')
          .eq('job_id', jobId)
          .maybeSingle();

        if (resultErr && resultErr.code !== 'PGRST116') throw resultErr;
        setResult(resultData);
        setParsed(parseResultData(resultData));
      } catch (e) {
        setError(e.message || 'Failed to load result');
      } finally {
        setLoading(false);
      }
    };
    if (jobId) fetchData();
  }, [jobId]);

  // ── Realtime — watch for job completion ─────────────────────────────────
  useRealtime(jobId, (updatedJob) => {
    setJob((prev) => ({ ...prev, ...updatedJob }));
    if (updatedJob.status === 'COMPLETED') {
      // Re-fetch the result after completion
      supabase
        .from('analysis_results')
        .select('*')
        .eq('job_id', jobId)
        .maybeSingle()
        .then(({ data }) => {
          setResult(data);
          setParsed(parseResultData(data));
        });
    }
  });

  // ────────────────────────────────────────────────────────────────────────
  if (loading) return (
    <div className="min-h-[calc(100vh-56px)] py-10 px-4">
      <div className="max-w-6xl mx-auto"><ResultSkeleton /></div>
    </div>
  );

  if (error) return (
    <div className="min-h-[calc(100vh-56px)] flex items-center justify-center px-4">
      <div className="glass p-8 text-center max-w-md">
        <p className="text-red-400 font-semibold mb-2">Failed to load result</p>
        <p className="text-slate-500 text-sm mb-6">{error}</p>
        <Link to="/dashboard" className="btn-primary">Back to dashboard</Link>
      </div>
    </div>
  );

  const isProcessing = job?.status === 'PROCESSING';
  const isFailed     = job?.status === 'FAILED';

  return (
    <div className="min-h-[calc(100vh-56px)] py-10 px-4">
      <div className="max-w-6xl mx-auto space-y-6">

        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Link to="/dashboard" className="hover:text-slate-300 transition-colors">Dashboard</Link>
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          <span className="text-slate-400">Result</span>
          <span className="font-mono text-xs">· {jobId?.slice(0, 8)}…</span>
          <StatusBadge status={job?.status} />
        </div>

        {/* ── Still processing ── */}
        {isProcessing && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="glass p-12 flex flex-col items-center gap-5 text-center"
          >
            <MavenSpinner size={48} />
            <div>
              <p className="text-slate-200 font-semibold">Analysis in progress</p>
              <p className="text-slate-500 text-sm mt-1">This page will update automatically when results are ready.</p>
            </div>
          </motion.div>
        )}

        {/* ── Failed ── */}
        {isFailed && (
          <div className="glass p-8 text-center">
            <p className="text-red-400 font-bold text-lg mb-1">Analysis Failed</p>
            <p className="text-slate-500 text-sm mb-2">{job?.error_message || 'An unexpected error occurred during ML analysis.'}</p>
            <p className="text-xs text-slate-600 mb-6">
              The liveness microservice is not yet implemented and may have caused this failure.
            </p>
            <Link to="/upload" className="btn-primary">Try again</Link>
          </div>
        )}

        {/* ── Results ── */}
        {!isProcessing && !isFailed && parsed && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4 }}
            className="space-y-5"
          >
            {/* Verdict */}
            <VerdictCard verdict={parsed.verdict} confidence={parsed.confidence} />

            {/* Main 2-col layout */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

              {/* Left: score breakdown + FFT + sync */}
              <div className="lg:col-span-2 space-y-5">

                {/* Score breakdown */}
                {parsed.breakdown && (
                  <div className="glass p-6">
                    <ScoreBreakdown breakdown={parsed.breakdown} />
                  </div>
                )}

                {/* FFT details */}
                <div className="glass p-6">
                  <FftCard
                    fftData={result?.raw_results?.fftResult ?? result?.details?.fftResult}
                    breakdown={parsed.breakdown}
                  />
                </div>

                {/* Lip-sync timeline */}
                {(result?.raw_results?.lipsyncResult ?? result?.details?.lipsyncResult) && (
                  <div className="glass p-6">
                    <SyncTimeline
                      lipsyncResult={result.raw_results?.lipsyncResult ?? result.details?.lipsyncResult}
                    />
                  </div>
                )}

                {/* Raw data */}
                <div className="glass p-6">
                  <RawDetails data={result} />
                </div>
              </div>

              {/* Right: liveness (coming soon) */}
              <div className="space-y-5">
                {/* Liveness header */}
                <div className="glass p-5">
                  <div className="flex items-center gap-2 mb-4">
                    <span className="text-lg">👁️</span>
                    <div>
                      <p className="text-sm font-bold text-slate-200">Liveness Detection</p>
                      <p className="text-xs text-slate-500">Layer 2 · Weight: 40%</p>
                    </div>
                  </div>
                  <RppgChart />
                </div>
                <BlinkStats />

                {/* Job metadata */}
                <div className="glass p-5 space-y-3">
                  <p className="label-sm">Job info</p>
                  <div className="space-y-2 text-xs font-mono">
                    {[
                      ['Job ID',     jobId?.slice(0, 8) + '…'],
                      ['Submitted', job?.created_at ? new Date(job.created_at).toLocaleString() : '—'],
                      ['Status',    job?.status],
                    ].map(([k, v]) => (
                      <div key={k} className="flex justify-between gap-4">
                        <span className="text-slate-600">{k}</span>
                        <span className="text-slate-400 text-right truncate max-w-[120px]">{v}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex flex-wrap gap-3">
              <Link to="/upload" className="btn-primary">
                Analyse another video
              </Link>
              <Link to="/dashboard" className="btn-secondary">
                Back to dashboard
              </Link>
            </div>
          </motion.div>
        )}

        {/* No result data yet but job exists */}
        {!isProcessing && !isFailed && !parsed && (
          <div className="glass p-8 text-center">
            <p className="text-slate-400 text-sm">No result data found for this job.</p>
            <Link to="/dashboard" className="btn-ghost mt-4">Back to dashboard</Link>
          </div>
        )}
      </div>
    </div>
  );
}
