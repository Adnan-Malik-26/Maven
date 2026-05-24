import { useState, useCallback, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Activity, Heart, Mic, Upload, Play, X, Download, Copy, ArrowRight } from 'lucide-react'
import { clsx } from 'clsx'
import { submitVideo, getResult } from '../services/api'
import { useJobStatus } from '../hooks/useJobStatus'

// ── helpers ──────────────────────────────────────────────────────────────────
const fmt = {
  bytes: b => b < 1048576 ? `${(b/1024).toFixed(1)} KB` : `${(b/1048576).toFixed(1)} MB`,
  dur:   s => `${Math.floor(s/60)}:${String(Math.round(s)%60).padStart(2,'0')}`,
  pct:   n => `${Math.round((n??0)*100)}%`,
}

const VERDICT_CFG = {
  FAKE:      { label:'FAKE DETECTED',  color:'text-red-400',     border:'border-red-500/40',     bg:'bg-red-500/10',     glow:'shadow-red-500/20',   dot:'bg-red-500'     },
  REAL:      { label:'LIKELY REAL',    color:'text-emerald-400', border:'border-emerald-500/40', bg:'bg-emerald-500/10', glow:'shadow-emerald-500/20',dot:'bg-emerald-500' },
  UNCERTAIN: { label:'UNCERTAIN',      color:'text-amber-400',   border:'border-amber-500/40',   bg:'bg-amber-500/10',   glow:'shadow-amber-500/20',  dot:'bg-amber-500'   },
}

// ── RadialGauge ───────────────────────────────────────────────────────────────
function RadialGauge({ score, size = 72, color }) {
  const r  = size/2 - 6
  const C  = 2*Math.PI*r
  const [off, setOff] = useState(C)
  useEffect(() => { const t = setTimeout(() => setOff(C*(1-score)), 150); return () => clearTimeout(t) }, [score, C])
  return (
    <div className="relative" style={{width:size,height:size}}>
      <svg width={size} height={size} style={{transform:'rotate(-90deg)'}}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,.07)" strokeWidth={5}/>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={5}
          strokeLinecap="round" strokeDasharray={C} strokeDashoffset={off}
          style={{transition:'stroke-dashoffset 1s cubic-bezier(.34,1.56,.64,1)'}}/>
      </svg>
      <div className="absolute inset-0 flex items-center justify-center font-mono font-bold text-xs" style={{color}}>
        {Math.round(score*100)}
      </div>
    </div>
  )
}

// ── ScoreRow ──────────────────────────────────────────────────────────────────
function ScoreRow({ icon: Icon, label, score, description, colorClass, gaugeColor, delay=0 }) {
  const pct = Math.round((score??0)*100)
  return (
    <motion.div initial={{opacity:0,x:12}} animate={{opacity:1,x:0}} transition={{delay}}
      className="flex items-center gap-4 p-4 rounded-xl border border-slate-200 dark:border-dark-border bg-white dark:bg-dark-surface">
      <RadialGauge score={score??0} color={gaugeColor} size={64}/>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <Icon size={13} className={clsx('shrink-0', colorClass)}/>
          <span className="text-xs font-mono font-semibold tracking-widest uppercase text-slate-500 dark:text-slate-400">{label}</span>
        </div>
        <div className="h-1.5 rounded-full bg-slate-100 dark:bg-dark-border overflow-hidden mb-1.5">
          <motion.div initial={{width:0}} animate={{width:`${pct}%`}}
            transition={{duration:0.9,ease:'easeOut',delay:delay+0.1}}
            className="h-full rounded-full" style={{background:gaugeColor}}/>
        </div>
        {description && <p className="text-xs text-slate-400 font-mono truncate">{description}</p>}
      </div>
      <span className={clsx('text-xl font-black font-mono shrink-0', colorClass)}>{pct}%</span>
    </motion.div>
  )
}

// ── VerdictBanner ─────────────────────────────────────────────────────────────
function VerdictBanner({ verdict, confidence }) {
  const cfg = VERDICT_CFG[verdict] ?? VERDICT_CFG.UNCERTAIN
  return (
    <motion.div initial={{opacity:0,y:-8}} animate={{opacity:1,y:0}}
      className={clsx('rounded-xl border p-5 flex items-center justify-between shadow-lg', cfg.border, cfg.bg, cfg.glow)}>
      <div className="flex items-center gap-3">
        <span className={clsx('w-3 h-3 rounded-full animate-pulse-slow shadow-lg', cfg.dot)}/>
        <div>
          <p className="mono-label mb-0.5">Forensic Verdict</p>
          <p className={clsx('font-black tracking-widest text-2xl font-mono', cfg.color)}>{cfg.label}</p>
        </div>
      </div>
      <div className="text-right">
        <p className={clsx('text-4xl font-black font-mono leading-none', cfg.color)}>{fmt.pct(confidence)}</p>
        <p className="mono-label mt-1">CONFIDENCE</p>
      </div>
    </motion.div>
  )
}

// ── ResultsPanel ──────────────────────────────────────────────────────────────
function ResultsPanel({ result }) {
  const [copied, setCopied] = useState(false)
  const fft      = result.details?.fftResult      ?? {}
  const liveness = result.details?.livenessResult ?? {}
  const lipsync  = result.details?.breakdown?.lipsync ?? {}

  const layers = [
    {
      label: 'FFT Frequency', icon: Activity,
      score: 1-(result.fft_score??0),
      colorClass: 'text-sky-400', gaugeColor: '#38bdf8',
      description: `${fft.total_frames_analyzed??0} frames · ${fft.suspicious_frames?.length??0} suspicious`,
      delay: 0.05,
    },
    {
      label: 'Physiological Liveness', icon: Heart,
      score: result.liveness_score??0,
      colorClass: 'text-emerald-400', gaugeColor: '#34d399',
      description: liveness.rppg?.pulse_present
        ? `HR ~${liveness.rppg.estimated_hr_bpm?.toFixed(0)} BPM · ${liveness.blink?.blink_count??0} blinks`
        : 'No pulse signal',
      delay: 0.1,
    },
    {
      label: 'Audio-Visual Sync', icon: Mic,
      score: result.sync_score??0,
      colorClass: 'text-violet-400', gaugeColor: '#a78bfa',
      description: `${lipsync.windows_analyzed??0} windows · ${lipsync.verdict??'—'}`,
      delay: 0.15,
    },
  ]

  const downloadReport = () => {
    const lines = [
      'MAVEN Forensic Analysis Report','================================',
      `Verdict:    ${result.verdict}`,
      `Confidence: ${fmt.pct(result.confidence)}`,
      `FFT:        ${fmt.pct(1-(result.fft_score??0))} authentic`,
      `Liveness:   ${fmt.pct(result.liveness_score)} alive`,
      `Sync:       ${fmt.pct(result.sync_score)} in-sync`,
      `Generated:  ${new Date().toISOString()}`,
    ]
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([lines.join('\n')],{type:'text/plain'}))
    a.download = `maven-report-${result.id?.slice(0,8)??'report'}.txt`
    a.click()
  }

  const copyLink = () => {
    navigator.clipboard.writeText(window.location.href)
    setCopied(true); setTimeout(()=>setCopied(false),2000)
  }

  return (
    <div className="right-col-body">
      <VerdictBanner verdict={result.verdict} confidence={result.confidence}/>

      <div>
        <p className="mono-label mb-3">Detection Layer Analysis</p>
        <div className="flex flex-col gap-3">
          {layers.map(l => <ScoreRow key={l.label} {...l}/>)}
        </div>
      </div>

      {/* Suspicious frames */}
      {fft.suspicious_frames?.length > 0 && (
        <div className="p-4 rounded-xl border border-slate-200 dark:border-dark-border bg-white dark:bg-dark-surface">
          <p className="mono-label mb-2.5">Suspicious Frames <span className="ml-2 text-red-400">{fft.suspicious_frames.length}</span></p>
          <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
            {fft.suspicious_frames.map((f,i) => (
              <span key={i} className="font-mono text-xs bg-red-500/10 text-red-400 border border-red-500/20 px-2 py-0.5 rounded">#{f}</span>
            ))}
          </div>
        </div>
      )}

      {/* Liveness detail */}
      {(liveness.rppg || liveness.blink) && (
        <div className="p-4 rounded-xl border border-slate-200 dark:border-dark-border bg-white dark:bg-dark-surface">
          <p className="mono-label mb-3">Physiological Signals</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="mono-label mb-1">Heart Rate</p>
              <p className={clsx('text-2xl font-black font-mono', liveness.rppg?.pulse_present ? 'text-emerald-400':'text-slate-500')}>
                {liveness.rppg?.pulse_present && liveness.rppg?.estimated_hr_bpm
                  ? `${Math.round(liveness.rppg.estimated_hr_bpm)} BPM` : '— BPM'}
              </p>
              <p className="text-xs text-slate-400 mt-0.5 font-mono">{liveness.rppg?.pulse_present ? 'Pulse detected':'No signal'}</p>
            </div>
            <div>
              <p className="mono-label mb-1">Blink Rate</p>
              <p className={clsx('text-2xl font-black font-mono',
                liveness.blink?.is_normal ? 'text-emerald-400':'text-amber-400')}>
                {liveness.blink?.blink_rate_per_min != null ? `${liveness.blink.blink_rate_per_min.toFixed(1)}/min` : '—'}
              </p>
              <p className="text-xs text-slate-400 mt-0.5 font-mono">{liveness.blink?.is_normal ? 'Normal range':'Abnormal'}</p>
            </div>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2 pt-1">
        <button onClick={copyLink} className="btn-secondary flex-1 text-xs font-mono tracking-wide">
          <Copy size={13}/>{copied ? 'Copied!':'Copy Link'}
        </button>
        <button onClick={downloadReport} className="btn-secondary flex-1 text-xs font-mono tracking-wide">
          <Download size={13}/>Report
        </button>
      </div>
    </div>
  )
}

// ── IdleRight ─────────────────────────────────────────────────────────────────
function IdleRight() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-5 grid-texture scanline-bg">
      <div className="text-center">
        <p className="font-mono text-5xl font-black text-slate-200 dark:text-white/5 select-none mb-4">MVN</p>
        <p className="mono-label tracking-[.3em]">Awaiting Forensic Input<span className="animate-blink ml-1">_</span></p>
        <p className="text-xs text-slate-400 mt-2 font-mono">Upload a video to begin multimodal analysis</p>
      </div>
      <div className="flex gap-3">
        {[
          {l:'FFT Analysis',       c:'text-sky-400',     d:'bg-sky-500'},
          {l:'Liveness Detection', c:'text-emerald-400', d:'bg-emerald-500'},
          {l:'Lip Sync Check',     c:'text-violet-400',  d:'bg-violet-500'},
        ].map(({l,c,d}) => (
          <div key={l} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-slate-200 dark:border-dark-border bg-white dark:bg-dark-surface text-xs font-mono">
            <span className={clsx('w-1.5 h-1.5 rounded-full animate-pulse-slow', d)}/><span className={c}>{l}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Processing state ──────────────────────────────────────────────────────────
function ProcessingRight({ jobId }) {
  const status = useJobStatus(jobId)
  const navigate = useNavigate()

  useEffect(() => {
    if (status === 'COMPLETED') navigate(`/result/${jobId}`)
  }, [status, jobId, navigate])

  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-6 grid-texture scanline-bg">
      <div className="relative w-20 h-20">
        {[0,1,2].map(i => (
          <span key={i} className="absolute inset-0 rounded-full border-2 border-cyan-500/30 animate-ping"
            style={{animationDelay:`${i*0.4}s`,animationDuration:'1.8s'}}/>
        ))}
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="w-8 h-8 rounded-full border-2 border-cyan-500/40 border-t-cyan-500 animate-spin"/>
        </div>
      </div>
      <div className="text-center">
        <p className="font-mono font-bold text-slate-900 dark:text-white text-lg mb-1">Analyzing…</p>
        <p className="mono-label">Running 3-layer forensic pipeline</p>
      </div>
      <div className="flex flex-col gap-2 w-64">
        {[
          {label:'FFT Frequency Analysis',   c:'text-sky-400',     delay:'0s'},
          {label:'Liveness Detection',       c:'text-emerald-400', delay:'0.6s'},
          {label:'Lip-Sync Verification',    c:'text-violet-400',  delay:'1.2s'},
        ].map(({label,c,delay}) => (
          <div key={label} className="flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 dark:border-dark-border bg-white dark:bg-dark-surface text-xs font-mono">
            <span className={clsx('w-1.5 h-1.5 rounded-full animate-pulse',c)} style={{animationDelay:delay}}/>
            <span className={c}>{label}</span>
          </div>
        ))}
      </div>
      {status === 'FAILED' && (
        <p className="text-red-400 text-xs font-mono">Analysis failed — check service logs</p>
      )}
    </div>
  )
}

// ── Left column ───────────────────────────────────────────────────────────────
function LeftColumn({ file, preview, meta, isDragging, onDragOver, onDragLeave, onDrop,
                      onFileChange, onSubmit, uploading, progress, error }) {
  const inputRef = useRef()

  return (
    <div className="left-col border-slate-200 dark:border-dark-border flex flex-col h-full bg-white dark:bg-dark-bg">
      {/* Header */}
      <div className="px-5 py-3 border-b border-slate-200 dark:border-dark-border flex items-center gap-2 shrink-0">
        <Upload size={13} className="text-slate-400"/>
        <span className="mono-label">Source Input</span>
      </div>

      {/* Drop / Player zone */}
      <div
        className={clsx(
          'flex-1 relative flex flex-col items-center justify-center cursor-pointer transition-all duration-150 overflow-hidden min-h-0',
          !file && 'border-2 border-dashed m-4 rounded-xl',
          isDragging ? 'border-cyan-500 bg-cyan-50 dark:bg-cyan-500/5'
            : !file   ? 'border-slate-300 dark:border-dark-border hover:border-cyan-400 dark:hover:border-cyan-500/60 hover:bg-slate-50 dark:hover:bg-dark-surface/50'
            : ''
        )}
        onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}
        onClick={() => !file && inputRef.current?.click()}
      >
        {/* Scan line on dragover */}
        {isDragging && (
          <div className="absolute left-0 right-0 h-px bg-gradient-to-r from-transparent via-cyan-500 to-transparent animate-scan"/>
        )}
        <input ref={inputRef} type="file" accept="video/*" className="hidden" onChange={onFileChange}/>

        {!file ? (
          <div className="text-center p-6">
            <div className="w-16 h-16 rounded-2xl bg-slate-100 dark:bg-dark-surface flex items-center justify-center mx-auto mb-4">
              <Upload size={24} className="text-slate-300 dark:text-slate-600"/>
            </div>
            <p className="font-mono font-semibold text-slate-900 dark:text-white text-sm mb-1">Drop video here</p>
            <p className="text-xs text-slate-400 font-mono">or click to browse · MP4 · MOV · AVI</p>
          </div>
        ) : (
          <div className="w-full h-full flex flex-col">
            {preview && (
              <video
                src={preview} controls muted playsInline
                className="w-full flex-1 object-contain bg-black min-h-0"
                style={{maxHeight:'calc(100% - 80px)'}}
              />
            )}
            <div className="px-4 py-3 border-t border-slate-200 dark:border-dark-border bg-white dark:bg-dark-card shrink-0">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-900 dark:text-white truncate font-mono">{file.name}</p>
                  <p className="text-xs text-slate-400 font-mono mt-0.5">
                    {meta?.size}{meta?.duration && ` · ${meta.duration}`}
                  </p>
                </div>
                <button
                  onClick={e => { e.stopPropagation(); onFileChange(null) }}
                  className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-500/10 text-slate-400 hover:text-red-500 transition-colors shrink-0"
                >
                  <X size={14}/>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Progress */}
      {uploading && (
        <div className="mx-4 h-0.5 bg-slate-100 dark:bg-dark-border rounded-full overflow-hidden">
          <motion.div className="h-full bg-cyan-500 rounded-full"
            initial={{width:0}} animate={{width:`${progress}%`}} transition={{ease:'easeOut'}}/>
        </div>
      )}

      {/* Error */}
      {error && (
        <p className="mx-4 text-xs text-red-400 font-mono px-3 py-2 bg-red-500/10 rounded-lg border border-red-500/20">
          ⚠ {error}
        </p>
      )}

      {/* Run button */}
      <div className="p-4 shrink-0 border-t border-slate-200 dark:border-dark-border">
        <button
          onClick={onSubmit}
          disabled={!file || uploading}
          className={clsx(
            'w-full py-3 rounded-xl font-mono font-bold text-sm tracking-widest uppercase transition-all duration-150 flex items-center justify-center gap-2',
            file && !uploading
              ? 'bg-cyan-500 hover:bg-cyan-400 text-black shadow-lg shadow-cyan-500/25 hover:shadow-cyan-500/40 active:scale-[.98]'
              : 'bg-slate-100 dark:bg-dark-surface text-slate-400 cursor-not-allowed'
          )}
        >
          {uploading ? (
            <><span className="w-4 h-4 border-2 border-black/20 border-t-black rounded-full animate-spin"/>Uploading…</>
          ) : (
            <><Play size={14} fill="currentColor"/>Run Forensic Analysis</>
          )}
        </button>
      </div>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function Analyze() {
  const navigate = useNavigate()
  const [file,      setFile]      = useState(null)
  const [preview,   setPreview]   = useState(null)
  const [meta,      setMeta]      = useState(null)
  const [isDragging,setIsDragging]= useState(false)
  const [uploading, setUploading] = useState(false)
  const [progress,  setProgress]  = useState(0)
  const [error,     setError]     = useState('')
  const [pendingJobId, setPendingJobId] = useState(null)

  const processFile = useCallback(async f => {
    if (!f) { setFile(null); setPreview(null); setMeta(null); setPendingJobId(null); return }
    setFile(f); setError('')
    const url = URL.createObjectURL(f)
    setPreview(url)
    const size = fmt.bytes(f.size)
    let duration = null
    if (f.type.startsWith('video/')) {
      duration = await new Promise(res => {
        const v = document.createElement('video'); v.src = url
        v.onloadedmetadata = () => res(fmt.dur(v.duration))
        v.onerror = () => res(null)
      })
    }
    setMeta({ size, duration })
  }, [])

  const handleDragOver  = e => { e.preventDefault(); setIsDragging(true) }
  const handleDragLeave = ()  => setIsDragging(false)
  const handleDrop      = e  => { e.preventDefault(); setIsDragging(false); processFile(e.dataTransfer.files[0]) }
  const handleFileChange= e  => processFile(e?.target?.files?.[0] ?? null)

  const handleSubmit = async () => {
    if (!file || uploading) return
    setUploading(true); setError(''); setProgress(0)
    try {
      const fd = new FormData(); fd.append('video', file)
      const { data } = await submitVideo(fd, pct => setProgress(pct))
      const jobId = data.jobId ?? data.job_id
      setProgress(100)
      setPendingJobId(jobId)
    } catch (err) {
      setError(err?.response?.data?.message ?? err?.response?.data?.error ?? 'Upload failed.')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="analyze-layout dark:border-dark-border">
      <LeftColumn
        file={file} preview={preview} meta={meta}
        isDragging={isDragging}
        onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}
        onFileChange={handleFileChange} onSubmit={handleSubmit}
        uploading={uploading} progress={progress} error={error}
      />

      {/* Right column */}
      <div className="right-col bg-slate-50 dark:bg-dark-bg scanline-bg">
        {/* Right header */}
        <div className="px-5 py-3 border-b border-slate-200 dark:border-dark-border flex items-center gap-2 bg-white dark:bg-dark-bg shrink-0">
          <Activity size={13} className="text-slate-400"/>
          <span className="mono-label">Forensic Analysis Dashboard</span>
          {pendingJobId && (
            <button onClick={() => navigate(`/result/${pendingJobId}`)}
              className="ml-auto flex items-center gap-1 text-xs font-mono text-cyan-500 hover:text-cyan-400 transition-colors">
              Full Report <ArrowRight size={12}/>
            </button>
          )}
        </div>

        <AnimatePresence mode="wait">
          {pendingJobId ? (
            <ProcessingRight key="processing" jobId={pendingJobId}/>
          ) : (
            <IdleRight key="idle"/>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
