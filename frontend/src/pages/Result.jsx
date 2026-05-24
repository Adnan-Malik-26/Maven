import { useEffect, useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  ArrowLeft, Activity, Heart, Mic, Copy, Download,
  ChevronDown, XCircle, Play, AlertTriangle, CheckCircle, HelpCircle,
} from 'lucide-react'
import { clsx } from 'clsx'
import {
  RadarChart, PolarGrid, PolarAngleAxis, Radar, ResponsiveContainer, Tooltip,
  AreaChart, Area, XAxis, YAxis, CartesianGrid, ReferenceLine
} from 'recharts'
import { getResult } from '../services/api'
import { useJobStatus } from '../hooks/useJobStatus'
import Loader from '../components/common/Loader'

// ── constants ────────────────────────────────────────────────────────────────
const VERDICT = {
  FAKE: { icon: AlertTriangle, label: 'LIKELY FAKE', sub: 'Strong indicators of synthetic manipulation detected.', color: '#ef4444', bg: 'rgba(239,68,68,0.08)', border: 'rgba(239,68,68,0.35)' },
  REAL: { icon: CheckCircle, label: 'LIKELY REAL', sub: 'No significant deepfake indicators found.', color: '#10b981', bg: 'rgba(16,185,129,0.08)', border: 'rgba(16,185,129,0.35)' },
  UNCERTAIN: { icon: HelpCircle, label: 'UNCERTAIN', sub: 'Mixed signals — manual review recommended.', color: '#f59e0b', bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.35)' },
}

const scoreColor = s => s > 0.6 ? '#10b981' : s > 0.4 ? '#f59e0b' : '#ef4444'
const scoreLabel = s => s > 0.6 ? 'Authentic' : s > 0.4 ? 'Uncertain' : 'Suspicious'

// ── Loading / Error states ───────────────────────────────────────────────────
function ProcessingState() {
  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-center space-y-6">
        <div className="relative w-20 h-20 mx-auto">
          {[0, 1, 2].map(i => (
            <span key={i} className="absolute inset-0 rounded-full border-2 border-cyan-500/30 animate-ping"
              style={{ animationDelay: `${i * 0.4}s`, animationDuration: '1.8s' }} />
          ))}
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="w-8 h-8 border-2 border-cyan-500/40 border-t-cyan-400 rounded-full animate-spin" />
          </div>
        </div>
        <div>
          <p className="font-mono font-bold text-white text-lg">Analyzing…</p>
          <p className="text-xs font-mono text-slate-400 mt-1">Running 3-layer forensic pipeline</p>
        </div>
        {[{ l: 'FFT Frequency', c: 'text-sky-400' }, { l: 'Liveness Detection', c: 'text-emerald-400' }, { l: 'Lip-Sync Check', c: 'text-violet-400' }].map(({ l, c }, i) => (
          <div key={l} className="flex items-center gap-2 px-4 py-2 rounded-lg border border-dark-border bg-dark-card text-xs font-mono">
            <span className={clsx('w-1.5 h-1.5 rounded-full animate-pulse', c === 'text-sky-400' ? 'bg-sky-400' : c === 'text-emerald-400' ? 'bg-emerald-400' : 'bg-violet-400')} style={{ animationDelay: `${i * 0.4}s` }} />
            <span className={c}>{l}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function FailedState() {
  return (
    <div className="flex-1 flex items-center justify-center px-6">
      <div className="card border-red-500/30 p-10 text-center max-w-sm space-y-4">
        <XCircle size={40} className="text-red-500 mx-auto" />
        <h2 className="text-xl font-bold dark:text-white">Analysis Failed</h2>
        <p className="text-sm text-slate-400">An error occurred while processing your video.</p>
        <Link to="/analyze" className="btn-primary w-full justify-center">Try Again</Link>
      </div>
    </div>
  )
}

// ── Sub-components ───────────────────────────────────────────────────────────
function Card({ accent, children, className }) {
  return (
    <div className={clsx('rounded-xl border border-dark-border bg-dark-card overflow-hidden', className)}
      style={{ borderLeft: `3px solid ${accent}` }}>
      {children}
    </div>
  )
}

function ScoreBar({ label, icon: Icon, score, description, index }) {
  const pct = Math.round((score ?? 0) * 100)
  const color = scoreColor(score)
  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.08 }}
      className="space-y-1.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon size={13} className="text-slate-400" />
          <span className="text-xs font-mono font-semibold text-slate-300 tracking-wide">{label}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono font-bold" style={{ color }}>{scoreLabel(score)}</span>
          <span className="text-sm font-mono font-black text-white">{pct}%</span>
        </div>
      </div>
      <div className="h-1.5 rounded-full bg-dark-surface overflow-hidden">
        <motion.div initial={{ width: 0 }} animate={{ width: `${pct}%` }}
          transition={{ duration: 0.9, ease: 'easeOut', delay: 0.15 + index * 0.08 }}
          className="h-full rounded-full" style={{ background: color }} />
      </div>
      {description && <p className="text-xs font-mono text-slate-500">{description}</p>}
    </motion.div>
  )
}

function Accordion({ title, badge, accent, children }) {
  const [open, setOpen] = useState(false)
  return (
    <Card accent={accent}>
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-dark-surface/50 transition-colors">
        <span className="text-xs font-mono font-semibold text-slate-300 tracking-widest uppercase flex items-center gap-2">
          {title}
          {badge && <span className="px-2 py-0.5 rounded-full bg-red-500/10 text-red-400 border border-red-500/20 font-mono">{badge}</span>}
        </span>
        <ChevronDown size={14} className={clsx('text-slate-500 transition-transform duration-200', open && 'rotate-180')} />
      </button>
      {open && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          className="px-5 pb-5 border-t border-dark-border pt-4">
          {children}
        </motion.div>
      )}
    </Card>
  )
}

// ── Main ─────────────────────────────────────────────────────────────────────
export default function Result() {
  const { jobId } = useParams()
  const navigate = useNavigate()
  const jobStatus = useJobStatus(jobId)
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (jobStatus !== 'COMPLETED') return
    setLoading(true)
    getResult(jobId).then(setResult).catch(console.error).finally(() => setLoading(false))
  }, [jobStatus, jobId])

  if (jobStatus === 'PROCESSING') return (
    <div style={{ height: 'calc(100vh - 56px)', display: 'flex', flexDirection: 'column', background: '#09090F' }}>
      <ProcessingState />
    </div>
  )
  if (jobStatus === 'FAILED') return (
    <div style={{ height: 'calc(100vh - 56px)', display: 'flex', flexDirection: 'column', background: '#09090F' }}>
      <FailedState />
    </div>
  )
  if (loading || !result) return (
    <div style={{ height: 'calc(100vh - 56px)' }} className="flex items-center justify-center bg-dark-bg">
      <Loader variant="spinner" size="lg" />
    </div>
  )

  // ── data (unchanged) ──────────────────────────────────────────────────────
  const fft = result.details?.fftResult ?? {}
  const liveness = result.details?.livenessResult ?? {}
  const lipsync = result.details?.breakdown?.lipsync ?? {}

  const layers = [
    {
      label: 'FFT Frequency', icon: Activity, score: 1 - (result.fft_score ?? 0),
      description: `${fft.total_frames_analyzed ?? 0} frames · ${fft.suspicious_frames?.length ?? 0} suspicious`
    },
    {
      label: 'Physiological Liveness', icon: Heart, score: result.liveness_score ?? 0,
      description: liveness.rppg?.pulse_present
        ? `HR ~${liveness.rppg.estimated_hr_bpm?.toFixed(0)} BPM · ${liveness.blink?.blink_count ?? 0} blinks`
        : 'No pulse signal detected'
    },
    {
      label: 'Audio-Visual Sync', icon: Mic, score: result.sync_score ?? 0,
      description: `${lipsync.windows_analyzed ?? 0} windows · ${lipsync.verdict ?? '—'}`
    },
  ]

  const copyLink = () => {
    navigator.clipboard.writeText(window.location.href)
    setCopied(true); setTimeout(() => setCopied(false), 2000)
  }

  const downloadReport = () => {
    const lines = [
      'MAVEN Forensic Analysis Report', '================================',
      `Job ID:     ${jobId}`, `Verdict:    ${result.verdict}`,
      `Confidence: ${((result.confidence ?? 0) * 100).toFixed(1)}%`, '',
      'Score Breakdown:',
      `  FFT:      ${((1 - (result.fft_score ?? 0)) * 100).toFixed(1)}%`,
      `  Liveness: ${((result.liveness_score ?? 0) * 100).toFixed(1)}%`,
      `  Sync:     ${((result.sync_score ?? 0) * 100).toFixed(1)}%`, '',
      `Generated: ${new Date().toISOString()}`,
    ]
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/plain' }))
    a.download = `maven-report-${jobId.slice(0, 8)}.txt`; a.click()
  }

  const vcfg = VERDICT[result.verdict] ?? VERDICT.UNCERTAIN
  const VIcon = vcfg.icon

  // filename from signed URL
  const fileName = (() => {
    if (result?.original_name) return result.original_name
    try {
      const seg = decodeURIComponent(new URL(result.video_path).pathname).split('/').pop()
      return seg.replace(/^\d+-/, '') || seg
    } catch { return `Job ${jobId?.slice(0, 8)}` }
  })()

  const radarData = [
    { axis: 'FFT', value: Math.round((1 - (result.fft_score ?? 0)) * 100) },
    { axis: 'Liveness', value: Math.round((result.liveness_score ?? 0) * 100) },
    { axis: 'Lip Sync', value: Math.round((result.sync_score ?? 0) * 100) },
  ]

  const frameData = (fft.frame_scores ?? []).slice(0, 300).map((v, i) => ({ frame: i, score: v }))
  const blink = liveness.blink
  const rppg = liveness.rppg

  return (
    <div style={{ height: 'calc(100vh - 56px)', overflow: 'hidden', display: 'flex', flexDirection: 'column', background: '#09090F' }}>

      {/* Top bar */}
      <div className="shrink-0 flex items-center gap-3 px-5 h-10 border-b border-dark-border bg-dark-bg">
        <button onClick={() => navigate(-1)} className="flex items-center gap-1.5 text-xs font-mono text-slate-400 hover:text-white transition-colors">
          <ArrowLeft size={13} /> Back
        </button>
        <span className="text-dark-border">|</span>
        <span className="text-xs font-mono text-slate-500">Job <span className="text-slate-300">{jobId?.slice(0, 12)}…</span></span>
        <div className="ml-auto flex gap-2">
          <button onClick={copyLink} className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-mono text-slate-400 hover:text-white hover:bg-dark-surface border border-dark-border transition-all">
            <Copy size={11} />{copied ? 'Copied!' : 'Copy Link'}
          </button>
          <button onClick={downloadReport} className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-mono text-slate-400 hover:text-white hover:bg-dark-surface border border-dark-border transition-all">
            <Download size={11} />Report
          </button>
        </div>
      </div>

      {/* Two columns */}
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '42% 58%', overflow: 'hidden' }}>

        {/* ── LEFT: Video ─────────────────────────────────────────────── */}
        <div className="flex flex-col border-r border-dark-border overflow-hidden">

          {/* Player */}
          <div className="flex-1 bg-black relative min-h-0">
            {result.video_path ? (
              <video controls playsInline muted={false}
                className="w-full h-full object-contain"
                style={{ display: 'block', maxHeight: '100%' }}>
                <source src={result.video_path} type="video/mp4" />
                <source src={result.video_path} type="video/webm" />
                <source src={result.video_path} type="video/ogg" />
                Your browser does not support this video format.
              </video>
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                <div className="w-14 h-14 rounded-xl bg-dark-surface flex items-center justify-center">
                  <Play size={24} className="text-slate-500 ml-0.5" />
                </div>
                <p className="text-xs font-mono text-slate-500">No video preview</p>
              </div>
            )}
            {/* Status badge */}
            <div className="absolute top-3 left-3 flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono font-semibold border bg-dark-bg/80 backdrop-blur-sm border-emerald-500/30 text-emerald-400">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />Complete
            </div>
          </div>

          {/* Meta */}
          <div className="px-5 py-3 border-t border-dark-border bg-dark-card shrink-0">
            <p className="text-sm font-mono font-semibold text-white truncate">{fileName}</p>
            <p className="text-xs font-mono text-slate-500 mt-0.5">
              {result.created_at ? new Date(result.created_at).toLocaleString() : '—'}
            </p>
          </div>

          {/* Verdict summary in left col */}
          <div className="px-5 py-4 border-t border-dark-border shrink-0"
            style={{ background: vcfg.bg, borderTop: `1px solid ${vcfg.border}` }}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                  style={{ background: `${vcfg.color}20` }}>
                  <VIcon size={20} style={{ color: vcfg.color }} />
                </div>
                <div>
                  <p className="text-xs font-mono text-slate-400 mb-0.5">Forensic Verdict</p>
                  <p className="text-lg font-black font-mono tracking-wider" style={{ color: vcfg.color }}>{vcfg.label}</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-3xl font-black font-mono leading-none" style={{ color: vcfg.color }}>
                  {Math.round((result.confidence ?? 0) * 100)}%
                </p>
                <p className="text-xs font-mono text-slate-400 mt-0.5">CONFIDENCE</p>
              </div>
            </div>
            <p className="text-xs font-mono text-slate-400 mt-3">{vcfg.sub}</p>
          </div>
        </div>

        {/* ── RIGHT: Forensic Data ─────────────────────────────────────── */}
        <div style={{ overflowY: 'auto', height: '100%' }} className="px-4 py-4 flex flex-col gap-3
          [&::-webkit-scrollbar]:w-[2px]
          [&::-webkit-scrollbar-thumb]:bg-dark-border
          [&::-webkit-scrollbar-thumb]:rounded-full">

          {/* Detection Layer */}
          <Card accent="#06b6d4">
            <div className="px-5 py-4">
              <p className="text-xs font-mono font-bold tracking-widest uppercase text-slate-400 mb-4">Detection Layer Analysis</p>
              <div className="flex flex-col gap-4">
                {layers.map((l, i) => <ScoreBar key={l.label} {...l} index={i} />)}
              </div>
            </div>
          </Card>

          {/* Radar */}
          <Card accent="#a78bfa">
            <div className="px-5 py-4">
              <p className="text-xs font-mono font-bold tracking-widest uppercase text-slate-400 mb-2">Forensic Radar</p>
              <div style={{ height: 180 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart data={radarData} outerRadius="70%">
                    <PolarGrid stroke="rgba(255,255,255,.08)" />
                    <PolarAngleAxis dataKey="axis" tick={{ fontSize: 11, fill: '#64748b', fontFamily: 'JetBrains Mono,monospace' }} />
                    <Radar dataKey="value" stroke="#06b6d4" fill="#06b6d4" fillOpacity={0.15} strokeWidth={1.5} />
                    <Tooltip contentStyle={{ background: '#14141C', border: '1px solid #252535', borderRadius: 8, fontSize: 11, fontFamily: 'JetBrains Mono,monospace' }} itemStyle={{ color: '#e2e8f0' }} />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </Card>

          {/* Physiological signals */}
          {(rppg || blink) && (
            <Card accent="#10b981">
              <div className="px-5 py-4">
                <p className="text-xs font-mono font-bold tracking-widest uppercase text-slate-400 mb-4">Physiological Signals</p>
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 rounded-xl bg-dark-surface border border-dark-border">
                    <p className="text-xs font-mono text-slate-400 mb-2 flex items-center gap-1.5">
                      <Heart size={11} className="text-emerald-400" />Heart Rate (rPPG)
                    </p>
                    <p className={clsx('text-3xl font-black font-mono leading-none', rppg?.pulse_present ? 'text-emerald-400' : 'text-slate-500')}>
                      {rppg?.pulse_present && rppg?.estimated_hr_bpm ? Math.round(rppg.estimated_hr_bpm) : '—'}
                    </p>
                    <p className="text-xs font-mono text-slate-500 mt-1">BPM · {rppg?.pulse_present ? 'Detected' : 'No signal'}</p>
                    {rppg?.signal_quality && <p className="text-xs font-mono text-slate-600 mt-0.5">Quality: {(rppg.signal_quality * 100).toFixed(0)}%</p>}
                  </div>
                  <div className="p-4 rounded-xl bg-dark-surface border border-dark-border">
                    <p className="text-xs font-mono text-slate-400 mb-2">Blink Rate</p>
                    <p className={clsx('text-3xl font-black font-mono leading-none', blink?.is_normal ? 'text-emerald-400' : 'text-amber-400')}>
                      {blink?.blink_rate_per_min != null ? blink.blink_rate_per_min.toFixed(1) : '—'}
                    </p>
                    <p className="text-xs font-mono text-slate-500 mt-1">/min · {blink?.is_normal ? 'Normal range' : 'Abnormal'}</p>
                    <p className="text-xs font-mono text-slate-600 mt-0.5">{blink?.blink_count ?? 0} total blinks</p>
                  </div>
                </div>
                {rppg?.frames_analyzed && (
                  <p className="text-xs font-mono text-slate-600 mt-3">
                    rPPG: {rppg.frames_analyzed} frames · Blink: {blink?.frames_analyzed ?? 0} frames analyzed
                  </p>
                )}
              </div>
            </Card>
          )}

          {/* Frame score chart */}
          {frameData.length > 0 && (
            <Card accent="#ef4444">
              <div className="px-5 py-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-mono font-bold tracking-widest uppercase text-slate-400">Per-Frame Artifact Score</p>
                  <span className="text-xs font-mono text-slate-500">{frameData.length} frames</span>
                </div>
                <div style={{ height: 140 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={frameData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                      <defs>
                        <linearGradient id="sg" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#ef4444" stopOpacity={0.25} />
                          <stop offset="95%" stopColor="#ef4444" stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,.05)" />
                      <XAxis dataKey="frame" tick={{ fontSize: 9, fill: '#475569', fontFamily: 'JetBrains Mono,monospace' }} stroke="rgba(255,255,255,.1)" />
                      <YAxis domain={[0, 1]} tick={{ fontSize: 9, fill: '#475569', fontFamily: 'JetBrains Mono,monospace' }} stroke="rgba(255,255,255,.1)" />
                      <Tooltip contentStyle={{ background: '#14141C', border: '1px solid #252535', borderRadius: 8, fontSize: 10, fontFamily: 'JetBrains Mono,monospace' }} itemStyle={{ color: '#e2e8f0' }} />
                      <ReferenceLine y={0.55} stroke="#ef4444" strokeDasharray="4 3" strokeWidth={1}
                        label={{ value: 'Threshold', fontSize: 9, fill: '#ef4444', position: 'right' }} />
                      <Area type="monotone" dataKey="score" stroke="#ef4444" strokeWidth={1.5}
                        fill="url(#sg)" dot={false} isAnimationActive />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
                <p className="text-xs font-mono text-slate-600 mt-2">
                  Frames above 55% show high-frequency anomalies consistent with GAN artifacts.
                </p>
              </div>
            </Card>
          )}

          {/* Sync timeline */}
          {lipsync.flagged_segments?.length > 0 && (
            <Card accent="#f59e0b">
              <div className="px-5 py-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-mono font-bold tracking-widest uppercase text-slate-400">Lip-Sync Timeline</p>
                  <span className="text-xs font-mono text-red-400">{lipsync.flagged_segments.length} flagged</span>
                </div>
                {(() => {
                  const dur = lipsync.windows_analyzed ? lipsync.windows_analyzed / 25 : 30
                  const toP = s => `${((s / dur) * 100).toFixed(2)}%`
                  return (
                    <>
                      <div className="relative w-full h-6 rounded-lg overflow-hidden bg-emerald-500/10 border border-emerald-500/20">
                        {lipsync.flagged_segments.map((seg, i) => (
                          <div key={i} className="absolute top-0 h-full bg-red-500/60 rounded-sm"
                            style={{ left: toP(seg.start_sec), width: toP(seg.end_sec - seg.start_sec) }} />
                        ))}
                      </div>
                      <div className="flex justify-between text-xs font-mono text-slate-600 mt-1">
                        <span>0s</span><span>{dur.toFixed(0)}s</span>
                      </div>
                      <div className="flex gap-4 mt-2 text-xs font-mono text-slate-500">
                        <span className="flex items-center gap-1"><span className="w-3 h-2 rounded-sm bg-emerald-500/40 inline-block" />In-sync</span>
                        <span className="flex items-center gap-1"><span className="w-3 h-2 rounded-sm bg-red-500/60 inline-block" />Out-of-sync</span>
                      </div>
                    </>
                  )
                })()}
              </div>
            </Card>
          )}

          {/* FFT heatmap */}
          {result.spectrum_url && (
            <Card accent="#38bdf8">
              <div className="px-5 py-4 space-y-3">
                <p className="text-xs font-mono font-bold tracking-widest uppercase text-slate-400">FFT Spectrum Heatmap</p>
                <img src={result.spectrum_url} alt="FFT heatmap" className="w-full rounded-lg" />
                <p className="text-xs font-mono text-slate-600">High-frequency energy distribution across analyzed frames</p>
              </div>
            </Card>
          )}

          {/* Suspicious frames */}
          {fft.suspicious_frames?.length > 0 && (
            <Accordion title="Suspicious Frames" badge={fft.suspicious_frames.length} accent="#f59e0b">
              <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
                {fft.suspicious_frames.map((f, i) => (
                  <span key={i} className="font-mono text-xs bg-red-500/10 text-red-400 border border-red-500/20 px-2 py-0.5 rounded">#{f}</span>
                ))}
              </div>
            </Accordion>
          )}

          <div className="h-2 shrink-0" />
        </div>
      </div>
    </div>
  )
}
