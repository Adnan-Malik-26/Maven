import { useState, useCallback, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Search, Library, RefreshCw, Upload, FileVideo, ArrowRight, Trash2, Clock, CheckCircle, AlertTriangle, HelpCircle } from 'lucide-react'
import { clsx } from 'clsx'
import { formatDistanceToNow } from 'date-fns'
import { getJobs, deleteJob } from '../services/api'
import { connectSocket, disconnectSocket, getSocket } from '../services/socket'
import { supabase } from '../lib/supabaseClient'

// ── helpers ───────────────────────────────────────────────────────────────────
function normalizeJobs(payload) {
  if (Array.isArray(payload))         return payload
  if (Array.isArray(payload?.jobs))   return payload.jobs
  if (Array.isArray(payload?.data))   return payload.data
  return []
}

const VERDICT_CFG = {
  FAKE:      { label:'FAKE',      bg:'bg-red-500/10',     text:'text-red-400',     border:'border-red-500/30',     icon: AlertTriangle },
  REAL:      { label:'REAL',      bg:'bg-emerald-500/10', text:'text-emerald-400', border:'border-emerald-500/30', icon: CheckCircle   },
  UNCERTAIN: { label:'UNCERTAIN', bg:'bg-amber-500/10',   text:'text-amber-400',   border:'border-amber-500/30',   icon: HelpCircle    },
}

const STATUS_CFG = {
  COMPLETED:  { label:'Completed',  dot:'bg-emerald-500' },
  PROCESSING: { label:'Analyzing',  dot:'bg-amber-500'   },
  PENDING:    { label:'Pending',    dot:'bg-slate-400'   },
  FAILED:     { label:'Failed',     dot:'bg-red-500'     },
}

const FILTERS = ['All', 'FAKE', 'REAL', 'UNCERTAIN', 'Pending']

// ── VerdictBadge ──────────────────────────────────────────────────────────────
function VerdictBadge({ verdict, confidence }) {
  const cfg = VERDICT_CFG[verdict]
  if (!cfg) return null
  const Icon = cfg.icon
  return (
    <span className={clsx('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-mono font-semibold border', cfg.bg, cfg.text, cfg.border)}>
      <Icon size={10}/>{cfg.label}{confidence != null && ` · ${Math.round(confidence*100)}%`}
    </span>
  )
}

// ── Thumbnail ─────────────────────────────────────────────────────────────────
// Extracts first frame from the signed Supabase video URL via hidden <video>+<canvas>
function Thumb({ job }) {
  const cfg      = VERDICT_CFG[job.verdict]
  const dotCfg   = STATUS_CFG[job.status] ?? STATUS_CFG.PENDING
  const [thumb, setThumb] = useState(null)

  useEffect(() => {
    const src = job.video_path
    if (!src) return
    let cancelled = false

    const vid = document.createElement('video')
    vid.crossOrigin = 'anonymous'
    vid.preload = 'metadata'
    vid.muted = true
    vid.src = src

    const capture = () => {
      if (cancelled) return
      try {
        const canvas = document.createElement('canvas')
        canvas.width  = vid.videoWidth  || 320
        canvas.height = vid.videoHeight || 180
        canvas.getContext('2d').drawImage(vid, 0, 0, canvas.width, canvas.height)
        setThumb(canvas.toDataURL('image/jpeg', 0.7))
      } catch { /* cross-origin or decode error — keep placeholder */ }
      vid.pause()
    }

    vid.addEventListener('loadeddata', () => {
      vid.currentTime = 0.5 // seek to 0.5s for a real frame
    })
    vid.addEventListener('seeked', capture)
    vid.addEventListener('error', () => { /* keep placeholder */ })
    vid.load()

    return () => { cancelled = true; vid.src = '' }
  }, [job.video_path])

  return (
    <div className={clsx(
      'relative w-full aspect-video rounded-xl border overflow-hidden flex items-center justify-center',
      'bg-slate-100 dark:bg-dark-surface',
      cfg ? cfg.border : 'border-slate-200 dark:border-dark-border'
    )}>
      {/* Real frame thumbnail */}
      {thumb ? (
        <img src={thumb} alt="" className="absolute inset-0 w-full h-full object-cover"/>
      ) : (
        <FileVideo size={28} className="text-slate-300 dark:text-slate-600"/>
      )}
      {/* Verdict color overlay */}
      {cfg && <div className={clsx('absolute inset-0 opacity-20', cfg.bg)}/>}
      {/* Status dot */}
      <span className={clsx(
        'absolute top-2 right-2 w-2 h-2 rounded-full shadow-lg z-10',
        dotCfg.dot, job.status === 'PROCESSING' && 'animate-pulse'
      )}/>
      {/* Scanline */}
      <div className="absolute inset-0 scanline-bg opacity-40 pointer-events-none z-10"/>
    </div>
  )
}

// ── JobCard ───────────────────────────────────────────────────────────────────
function LibraryCard({ job, onDeleted }) {
  const [confirmDel, setConfirmDel] = useState(false)
  const [deleting,   setDeleting]   = useState(false)

  const created = job.created_at
    ? formatDistanceToNow(new Date(job.created_at), { addSuffix: true })
    : '—'

  const handleDelete = async () => {
    setDeleting(true)
    try { await deleteJob(job.id); onDeleted?.(job.id) }
    finally { setDeleting(false); setConfirmDel(false) }
  }

  return (
    <motion.div layout initial={{opacity:0,y:12}} animate={{opacity:1,y:0}} exit={{opacity:0,scale:.95}}
      className="group flex flex-col gap-3 p-3 rounded-2xl border border-slate-200 dark:border-dark-border bg-white dark:bg-dark-card hover:border-cyan-500/40 hover:shadow-lg hover:shadow-cyan-500/5 transition-all duration-150">

      {/* Thumbnail */}
      <Thumb job={job}/>

      {/* Info */}
      <div className="flex-1 min-w-0 px-0.5">
        <p className="text-sm font-mono font-medium text-slate-900 dark:text-white truncate leading-tight">
          {job.original_name ?? 'Untitled video'}
        </p>
        <div className="flex items-center gap-1.5 mt-1 text-xs font-mono text-slate-400">
          <Clock size={10}/>{created}
        </div>
      </div>

      {/* Verdict row */}
      <div className="flex items-center justify-between gap-2 px-0.5">
        {job.verdict
          ? <VerdictBadge verdict={job.verdict} confidence={job.confidence}/>
          : <span className="text-xs font-mono text-slate-400">{STATUS_CFG[job.status]?.label ?? '—'}</span>
        }
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
          {job.status === 'COMPLETED' && (
            <Link to={`/result/${job.id}`}
              className="p-1.5 rounded-lg text-slate-400 hover:text-cyan-500 hover:bg-cyan-50 dark:hover:bg-cyan-500/10 transition-colors">
              <ArrowRight size={13}/>
            </Link>
          )}
          <AnimatePresence mode="wait">
            {confirmDel ? (
              <motion.div key="c" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}
                className="flex items-center gap-1">
                <button onClick={handleDelete} disabled={deleting}
                  className="text-xs font-mono text-red-500 px-2 py-1 rounded hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors">
                  {deleting ? '…' : 'OK'}
                </button>
                <button onClick={() => setConfirmDel(false)}
                  className="text-xs font-mono text-slate-400 px-1 py-1 rounded hover:bg-slate-100 dark:hover:bg-dark-surface transition-colors">
                  Cancel
                </button>
              </motion.div>
            ) : (
              <motion.button key="d" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}
                onClick={() => setConfirmDel(true)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors">
                <Trash2 size={13}/>
              </motion.button>
            )}
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  )
}

// ── EmptyState ────────────────────────────────────────────────────────────────
function EmptyState({ filtered }) {
  return (
    <div className="col-span-full flex flex-col items-center justify-center py-24 gap-5 text-center">
      <div className="w-20 h-20 rounded-2xl bg-slate-100 dark:bg-dark-surface flex items-center justify-center">
        <Library size={30} className="text-slate-300 dark:text-slate-600"/>
      </div>
      <div>
        <p className="font-mono font-semibold text-slate-900 dark:text-white">
          {filtered ? 'No matches found' : 'No analyses yet'}
        </p>
        <p className="text-xs font-mono text-slate-400 mt-1">
          {filtered ? 'Try a different filter or search term' : 'Upload your first video to get started'}
        </p>
      </div>
      {!filtered && (
        <Link to="/analyze" className="btn-primary text-sm">
          <Upload size={14}/> Analyze a Video
        </Link>
      )}
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function LibraryPage() {
  const [jobs,    setJobs]    = useState([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState('')
  const [search,  setSearch]  = useState('')
  const [filter,  setFilter]  = useState('All')

  const fetchJobs = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const data = await getJobs()
      setJobs(normalizeJobs(data))
    } catch { setError('Failed to load library.'); setJobs([]) }
    finally { setLoading(false) }
  }, [])

  // Socket updates
  useEffect(() => {
    connectSocket()
    const socket = getSocket()
    socket.on('analysis_complete', ({ jobId, verdict }) =>
      setJobs(p => p.map(j => j.id === jobId ? { ...j, status:'COMPLETED', verdict } : j)))
    socket.on('analysis_failed', ({ jobId }) =>
      setJobs(p => p.map(j => j.id === jobId ? { ...j, status:'FAILED' } : j)))
    return () => { socket.off('analysis_complete'); socket.off('analysis_failed'); disconnectSocket() }
  }, [])

  // Supabase realtime
  const jobIds = jobs.map(j => j.id).join(',')
  useEffect(() => {
    const processingIds = jobs.filter(j => j.status === 'PROCESSING').map(j => j.id)
    if (!processingIds.length) return
    const ch = supabase.channel('library-jobs')
      .on('postgres_changes', { event:'UPDATE', schema:'public', table:'analysis_jobs' }, p => {
        setJobs(prev => prev.map(j => j.id === p.new.id ? { ...j, ...p.new } : j))
      }).subscribe()
    return () => supabase.removeChannel(ch)
  }, [jobIds, jobs])

  useEffect(() => { fetchJobs() }, [fetchJobs])

  const handleDeleted = id => setJobs(p => p.filter(j => j.id !== id))

  // Filter + search
  const visible = jobs.filter(j => {
    const q = search.toLowerCase()
    const nameMatch = !q || (j.original_name ?? '').toLowerCase().includes(q)
    const dateMatch = !q || (j.created_at ?? '').includes(q)
    const fMatch =
      filter === 'All'     ? true :
      filter === 'Pending' ? (j.status === 'PROCESSING' || j.status === 'PENDING') :
                             j.verdict === filter
    return nameMatch && dateMatch && fMatch
  })

  return (
    <div className="min-h-[calc(100vh-56px)] flex flex-col">
      {/* Top bar */}
      <div className="sticky top-14 z-40 bg-white/90 dark:bg-dark-bg/90 backdrop-blur-xl border-b border-slate-200 dark:border-dark-border px-6 py-3">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-start sm:items-center gap-3">
          {/* Title */}
          <div className="flex items-center gap-2 shrink-0">
            <Library size={15} className="text-slate-400"/>
            <span className="mono-label">Analysis Library</span>
            {!loading && jobs.length > 0 && (
              <span className="ml-1 text-xs font-mono font-bold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-dark-surface text-slate-500">
                {jobs.length}
              </span>
            )}
          </div>

          {/* Search */}
          <div className="relative flex-1 min-w-0 max-w-sm">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/>
            <input
              type="text" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search by filename…"
              className="input pl-9 h-8 text-xs"
            />
          </div>

          {/* Filter chips */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {FILTERS.map(f => (
              <button key={f} onClick={() => setFilter(f)}
                className={clsx(
                  'px-3 py-1 rounded-full text-xs font-mono font-medium border transition-all duration-150',
                  filter === f
                    ? 'bg-cyan-500 text-black border-cyan-500 shadow-sm shadow-cyan-500/20'
                    : 'bg-transparent border-slate-200 dark:border-dark-border text-slate-500 hover:border-cyan-500/50 hover:text-slate-900 dark:hover:text-white'
                )}>
                {f}
              </button>
            ))}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 ml-auto shrink-0">
            <button onClick={fetchJobs} disabled={loading} className="btn-ghost p-2">
              <RefreshCw size={14} className={clsx(loading && 'animate-spin')}/>
            </button>
            <Link to="/analyze" className="btn-primary text-xs py-1.5 px-3.5">
              <Upload size={12}/> New
            </Link>
          </div>
        </div>
      </div>

      {/* Grid */}
      <div className="flex-1 max-w-7xl mx-auto w-full px-6 py-6">
        {error && (
          <div className="mb-4 p-3 rounded-xl border border-red-500/30 bg-red-500/10 text-red-400 text-xs font-mono">{error}</div>
        )}

        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {Array.from({length:8}).map((_,i) => (
              <div key={i} className="flex flex-col gap-3 p-3 rounded-2xl border border-slate-200 dark:border-dark-border bg-white dark:bg-dark-card animate-pulse">
                <div className="aspect-video rounded-xl bg-slate-100 dark:bg-dark-surface"/>
                <div className="h-3 rounded bg-slate-100 dark:bg-dark-surface w-3/4"/>
                <div className="h-2 rounded bg-slate-100 dark:bg-dark-surface w-1/2"/>
              </div>
            ))}
          </div>
        ) : (
          <motion.div layout className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            <AnimatePresence>
              {visible.length > 0
                ? visible.map(job => <LibraryCard key={job.id} job={job} onDeleted={handleDeleted}/>)
                : <EmptyState filtered={search !== '' || filter !== 'All'}/>
              }
            </AnimatePresence>
          </motion.div>
        )}
      </div>
    </div>
  )
}
