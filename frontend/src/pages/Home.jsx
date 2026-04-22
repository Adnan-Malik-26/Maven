import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Activity, Heart, Mic, ArrowRight, ChevronDown, Shield } from 'lucide-react'

const fadeUp = (delay = 0) => ({
  initial:    { opacity: 0, y: 24 },
  whileInView:{ opacity: 1, y: 0 },
  viewport:   { once: true },
  transition: { duration: 0.55, ease: 'easeOut', delay },
})

const features = [
  {
    icon: Activity,
    title: 'FFT Frequency Analysis',
    desc: 'Detects GAN and diffusion artifacts as anomalous high-frequency noise fingerprints invisible to the human eye.',
    badge: 'AUC > 0.85',
    from: 'from-blue-500',
    to:   'to-blue-600',
    ring: 'ring-blue-500/20',
  },
  {
    icon: Heart,
    title: 'Physiological Liveness',
    desc: 'Extracts rPPG heartbeat signals and blink patterns — biological signals deepfakes cannot replicate.',
    badge: 'F1 > 0.80',
    from: 'from-violet-500',
    to:   'to-violet-600',
    ring: 'ring-violet-500/20',
  },
  {
    icon: Mic,
    title: 'Audio-Visual Sync',
    desc: "Uses Wav2Lip's sync discriminator to detect phoneme-to-lip-movement mismatches across every 0.2 second window.",
    badge: 'F1 > 0.87',
    from: 'from-purple-500',
    to:   'to-purple-600',
    ring: 'ring-purple-500/20',
  },
]

const steps = [
  { n: '01', title: 'Upload Video',       desc: 'Drag and drop or browse. MP4, WebM, MOV up to 100 MB.' },
  { n: '02', title: 'Parallel Analysis',  desc: '3 AI forensic layers run simultaneously in under 90 seconds.' },
  { n: '03', title: 'Score Fusion',       desc: 'Weighted verdict computation balances all three signals.' },
  { n: '04', title: 'Forensic Report',    desc: 'Explainable per-layer breakdown with frame-level precision.' },
]

const stats = [
  { value: '3',     label: 'Detection Layers'    },
  { value: '<90s',  label: 'Analysis Time'       },
  { value: '100%',  label: 'Frame-Level Precision' },
]

export default function Home() {
  return (
    <div className="min-h-screen">

      {/* ── HERO ─────────────────────────────────────────────────── */}
      <section className="relative min-h-[calc(100vh-64px)] flex flex-col items-center justify-center px-6 text-center overflow-hidden">
        {/* Orbs */}
        <div className="absolute top-0 left-0 w-[600px] h-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-blue-600/20 dark:bg-blue-600/10 blur-[120px] pointer-events-none" />
        <div className="absolute bottom-0 right-0 w-[500px] h-[500px] translate-x-1/3 translate-y-1/3 rounded-full bg-violet-600/20 dark:bg-violet-600/10 blur-[120px] pointer-events-none" />

        <motion.div
          className="relative z-10 max-w-4xl mx-auto space-y-6"
          initial="hidden"
          animate="visible"
          variants={{ visible: { transition: { staggerChildren: 0.1 } } }}
        >
          <motion.div
            variants={{ hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0 } }}
          >
            <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-blue-50 dark:bg-blue-500/10 border border-blue-100 dark:border-blue-500/20 text-blue-700 dark:text-blue-400 text-sm font-medium mb-6">
              <Shield size={13} /> Multimodal Deepfake Detection
            </span>
          </motion.div>

          <motion.h1
            variants={{ hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0 } }}
            className="text-5xl md:text-7xl font-black tracking-tight leading-[1.05]"
          >
            Detect Deepfakes.
            <br />
            <span className="gradient-text">Defend Digital Truth.</span>
          </motion.h1>

          <motion.p
            variants={{ hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0 } }}
            className="text-xl text-slate-500 dark:text-slate-400 max-w-2xl mx-auto leading-relaxed"
          >
            MAVEN analyzes videos through three parallel AI forensic layers to expose synthetic media with explainable, frame-level precision.
          </motion.p>

          <motion.div
            variants={{ hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0 } }}
            className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-2"
          >
            <Link to="/upload" className="btn-primary text-base px-8 py-4">
              Analyze a Video <ArrowRight size={18} />
            </Link>
            <a href="#how-it-works" className="btn-secondary text-base px-8 py-4">
              How It Works
            </a>
          </motion.div>
        </motion.div>

        {/* Scroll arrow */}
        <motion.a
          href="#features"
          animate={{ y: [0, 8, 0] }}
          transition={{ repeat: Infinity, duration: 2 }}
          className="absolute bottom-8 left-1/2 -translate-x-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
        >
          <ChevronDown size={24} />
        </motion.a>
      </section>

      {/* ── FEATURES ─────────────────────────────────────────────── */}
      <section id="features" className="py-24 px-6">
        <div className="max-w-6xl mx-auto">
          <motion.div {...fadeUp()} className="text-center mb-16 space-y-3">
            <h2 className="text-4xl font-bold tracking-tight">Three Layers of Forensic Truth</h2>
            <p className="section-subtitle max-w-xl mx-auto">
              Each detection layer targets signals that are fundamentally difficult to fake — covering visual, physiological, and audio domains simultaneously.
            </p>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-6">
            {features.map((f, i) => (
              <motion.div key={f.title} {...fadeUp(i * 0.12)} className="card p-6 space-y-4 hover:shadow-md dark:hover:shadow-black/30 transition-shadow group">
                <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${f.from} ${f.to} flex items-center justify-center ring-4 ${f.ring} group-hover:scale-110 transition-transform`}>
                  <f.icon size={22} className="text-white" />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-bold text-slate-900 dark:text-slate-50">{f.title}</h3>
                    <span className="text-xs font-mono bg-slate-100 dark:bg-dark-surface text-slate-500 px-2 py-0.5 rounded-full">{f.badge}</span>
                  </div>
                  <p className="text-sm text-slate-500 leading-relaxed">{f.desc}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ─────────────────────────────────────────── */}
      <section id="how-it-works" className="py-24 px-6 bg-slate-50 dark:bg-dark-surface/50">
        <div className="max-w-5xl mx-auto">
          <motion.div {...fadeUp()} className="text-center mb-16 space-y-3">
            <h2 className="text-4xl font-bold tracking-tight">How It Works</h2>
            <p className="section-subtitle">From upload to verdict in under 90 seconds.</p>
          </motion.div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {steps.map((s, i) => (
              <motion.div key={s.n} {...fadeUp(i * 0.1)} className="card p-6 space-y-3">
                <span className="text-5xl font-black text-slate-100 dark:text-slate-800 leading-none">{s.n}</span>
                <h3 className="font-bold text-slate-900 dark:text-slate-50">{s.title}</h3>
                <p className="text-sm text-slate-500 leading-relaxed">{s.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── STATS ────────────────────────────────────────────────── */}
      <section className="py-24 px-6">
        <div className="max-w-4xl mx-auto">
          <motion.div
            {...fadeUp()}
            className="rounded-2xl bg-gradient-to-br from-slate-900 to-slate-800 dark:from-dark-card dark:to-dark-surface border border-slate-800 dark:border-dark-border p-8 md:p-12"
          >
            <div className="grid grid-cols-3 gap-8 text-center">
              {stats.map((s, i) => (
                <motion.div key={s.label} {...fadeUp(i * 0.1)}>
                  <p className="text-3xl md:text-4xl font-black text-white">{s.value}</p>
                  <p className="text-sm text-slate-400 mt-1">{s.label}</p>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      {/* ── FOOTER ───────────────────────────────────────────────── */}
      <footer className="border-t border-slate-100 dark:border-dark-border py-10 px-6 text-center">
        <div className="flex items-center justify-center gap-2 mb-3">
          <div className="w-6 h-6 rounded-md bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center text-white text-xs font-black">M</div>
          <span className="font-bold text-slate-900 dark:text-white">MAVEN</span>
        </div>
        <p className="text-sm text-slate-400">Built to defend digital trust.</p>
      </footer>
    </div>
  )
}
