import { useEffect, useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowLeft, Activity, Heart, Mic, Copy, Download, ChevronDown, XCircle } from 'lucide-react'
import { clsx } from 'clsx'
import { getResult } from '../services/api'
import { useJobStatus } from '../hooks/useJobStatus'
import VerdictCard from '../components/results/VerdictCard'
import ScoreBreakdown from '../components/results/ScoreBreakdown'
import SyncTimeline from '../components/results/SyncTimeline'
import FrameScoreChart from '../components/results/FrameScoreChart'
import LivenessStats from '../components/results/LivenessStats'
import Loader from '../components/common/Loader'

// ── Processing state ──────────────────────────────────────────────────────
function ProcessingState() {
  return (
    <div className="min-h-[calc(100vh-64px)] flex items-center justify-center">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="text-center space-y-8 max-w-sm"
      >
        {/* Triple rings */}
        <div className="relative w-24 h-24 mx-auto">
          {[0, 1, 2].map(i => (
            <span
              key={i}
              className="absolute inset-0 rounded-full border-2 border-blue-500/30 animate-ping"
              style={{ animationDelay: `${i * 0.4}s`, animationDuration: '1.8s' }}
            />
          ))}
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader variant="spinner" size="md" />
          </div>
        </div>

        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Analyzing your video…</h2>
          <p className="text-slate-500 text-sm mt-2">Typically 30–90 seconds</p>
        </div>

        <div className="space-y-3 text-sm text-left">
          {[
            { icon: Activity, label: 'Frequency analysis',    color: 'text-blue-500' },
            { icon: Heart,    label: 'Liveness detection',    color: 'text-violet-500' },
            { icon: Mic,      label: 'Lip-sync verification', color: 'text-purple-500' },
          ].map(({ icon: Icon, label, color }, i) => (
            <div key={label} className="flex items-center gap-3 card px-4 py-3">
              <Icon size={16} className={color} />
              <span className="text-slate-700 dark:text-slate-300 flex-1">{label}</span>
              <span className="flex gap-0.5">
                {[0, 1, 2].map(j => (
                  <span
                    key={j}
                    className={clsx('w-1.5 h-1.5 rounded-full animate-pulse', color === 'text-blue-500' ? 'bg-blue-500' : color === 'text-violet-500' ? 'bg-violet-500' : 'bg-purple-500')}
                    style={{ animationDelay: `${(i * 3 + j) * 0.2}s` }}
                  />
                ))}
              </span>
            </div>
          ))}
        </div>
      </motion.div>
    </div>
  )
}

// ── Failed state ──────────────────────────────────────────────────────────
function FailedState() {
  return (
    <div className="min-h-[calc(100vh-64px)] flex items-center justify-center px-6">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="card border-red-200 dark:border-red-500/30 p-10 text-center max-w-sm space-y-4"
      >
        <XCircle size={40} className="text-red-500 mx-auto" />
        <h2 className="text-xl font-bold text-slate-900 dark:text-white">Analysis Failed</h2>
        <p className="text-sm text-slate-500">An error occurred while processing your video.</p>
        <Link to="/upload" className="btn-primary w-full justify-center">Try Again</Link>
      </motion.div>
    </div>
  )
}

// ── Accordion ─────────────────────────────────────────────────────────────
function Accordion({ title, badge, children }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="card overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between p-5 text-left hover:bg-slate-50 dark:hover:bg-dark-surface transition-colors"
      >
        <span className="font-semibold text-slate-900 dark:text-white text-sm flex items-center gap-2">
          {title}
          {badge && (
            <span className="px-2 py-0.5 rounded-full bg-slate-100 dark:bg-dark-surface text-slate-500 text-xs font-mono">{badge}</span>
          )}
        </span>
        <ChevronDown size={16} className={clsx('text-slate-400 transition-transform duration-200', open && 'rotate-180')} />
      </button>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="px-5 pb-5 border-t border-slate-100 dark:border-dark-border pt-4"
        >
          {children}
        </motion.div>
      )}
    </div>
  )
}

// ── Main result page ──────────────────────────────────────────────────────
export default function Result() {
  const { jobId }  = useParams()
  const navigate   = useNavigate()
  const jobStatus  = useJobStatus(jobId)

  const [result,  setResult]  = useState(null)
  const [loading, setLoading] = useState(false)
  const [copied,  setCopied]  = useState(false)

  useEffect(() => {
    if (jobStatus !== 'COMPLETED') return
    setLoading(true)
    getResult(jobId)
      .then(({ data }) => setResult(data.result ?? data))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [jobStatus, jobId])

  if (jobStatus === 'PROCESSING') return <ProcessingState />
  if (jobStatus === 'FAILED')     return <FailedState />
  if (loading || !result)         return (
    <div className="min-h-[calc(100vh-64px)] flex items-center justify-center">
      <Loader variant="spinner" size="lg" />
    </div>
  )

  const fft      = result.details?.fftResult      ?? {}
  const liveness = result.details?.livenessResult ?? {}
  const lipsync  = result.details?.lipsyncResult  ?? {}

  const layers = [
    {
      label: 'FFT Frequency',
      icon:  Activity,
      score: 1 - (result.fft_score ?? 0),
      description: `${fft.total_frames_analyzed ?? 0} frames analyzed · ${fft.suspicious_frames?.length ?? 0} suspicious frames`,
    },
    {
      label: 'Physiological Liveness',
      icon:  Heart,
      score: result.liveness_score ?? 0,
      description: liveness.rppg?.pulse_present ? `HR ~${liveness.rppg.estimated_hr_bpm?.toFixed(0)} BPM · ${liveness.blink?.blink_count ?? 0} blinks` : 'No pulse signal detected',
    },
    {
      label: 'Audio-Visual Sync',
      icon:  Mic,
      score: result.sync_score ?? 0,
      description: `${lipsync.windows_analyzed ?? 0} windows scored · verdict: ${lipsync.verdict ?? '—'}`,
    },
  ]

  const copyLink = () => {
    navigator.clipboard.writeText(window.location.href)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const downloadReport = () => {
    const lines = [
      'MAVEN Forensic Analysis Report',
      '================================',
      `Job ID:     ${jobId}`,
      `Verdict:    ${result.verdict}`,
      `Confidence: ${((result.confidence ?? 0) * 100).toFixed(1)}%`,
      '',
      'Score Breakdown:',
      `  FFT Score:      ${((1 - (result.fft_score ?? 0)) * 100).toFixed(1)}% authentic`,
      `  Liveness Score: ${((result.liveness_score ?? 0) * 100).toFixed(1)}% alive`,
      `  Sync Score:     ${((result.sync_score ?? 0) * 100).toFixed(1)}% in-sync`,
      '',
      `Generated: ${new Date().toISOString()}`,
    ]
    const blob = new Blob([lines.join('\n')], { type: 'text/plain' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `maven-report-${jobId.slice(0, 8)}.txt`
    a.click()
  }

  return (
    <div className="min-h-[calc(100vh-64px)] px-6 py-10">
      <div className="max-w-3xl mx-auto space-y-6">

        {/* Back */}
        <button onClick={() => navigate(-1)} className="btn-ghost gap-1.5 text-sm -ml-2">
          <ArrowLeft size={15} /> Back
        </button>

        {/* Verdict */}
        <VerdictCard verdict={result.verdict} confidence={result.confidence} />

        {/* Score breakdown + radar */}
        <ScoreBreakdown result={result} layers={layers} />

        {/* Liveness stats */}
        {(liveness.rppg || liveness.blink) && (
          <LivenessStats rppg={liveness.rppg} blink={liveness.blink} />
        )}

        {/* Frame score chart */}
        {fft.frame_scores?.length > 0 && (
          <FrameScoreChart frameScores={fft.frame_scores} />
        )}

        {/* Sync timeline */}
        {lipsync.flagged_segments?.length > 0 && (
          <SyncTimeline
            segments={lipsync.flagged_segments}
            totalDuration={lipsync.windows_analyzed ? lipsync.windows_analyzed / 25 : 30}
          />
        )}

        {/* FFT heatmap */}
        {result.spectrum_url && (
          <div className="card p-6 space-y-3">
            <h3 className="section-title text-lg">FFT Spectrum Heatmap</h3>
            <img src={result.spectrum_url} alt="FFT heatmap" className="w-full rounded-xl" />
            <p className="text-xs text-slate-400">High-frequency energy distribution across analyzed frames</p>
          </div>
        )}

        {/* Suspicious frames accordion */}
        {fft.suspicious_frames?.length > 0 && (
          <Accordion title="Suspicious Frames" badge={fft.suspicious_frames.length}>
            <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto">
              {fft.suspicious_frames.map((f, i) => (
                <span key={i} className="font-mono text-xs bg-slate-100 dark:bg-dark-surface text-slate-600 dark:text-slate-400 px-2 py-1 rounded">
                  #{f}
                </span>
              ))}
            </div>
          </Accordion>
        )}

        {/* Share / Export */}
        <div className="flex items-center gap-3 pt-2">
          <button onClick={copyLink} className="btn-secondary text-sm py-2 gap-2">
            <Copy size={14} /> {copied ? 'Copied!' : 'Copy Result Link'}
          </button>
          <button onClick={downloadReport} className="btn-secondary text-sm py-2 gap-2">
            <Download size={14} /> Download Report
          </button>
        </div>

      </div>
    </div>
  )
}
