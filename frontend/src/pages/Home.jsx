import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '../context/AuthContext';

// ─── Floating particle ──────────────────────────────────────────────────────
function Particle({ style }) {
  return (
    <motion.div
      className="absolute rounded-full pointer-events-none"
      style={style}
      animate={{ y: [0, -20, 0], opacity: [0.3, 0.8, 0.3] }}
      transition={{ duration: 4 + Math.random() * 4, repeat: Infinity, delay: Math.random() * 3 }}
    />
  );
}

const PARTICLES = Array.from({ length: 18 }, (_, i) => ({
  id: i,
  style: {
    width:  3 + (i % 4) * 2,
    height: 3 + (i % 4) * 2,
    top:  `${10 + (i * 28 + i * 11) % 80}%`,
    left: `${5 + (i * 17 + i * 7) % 90}%`,
    background: `rgba(${139 - i * 3},${92 + i * 2},${246 - i * 4},0.3)`,
  },
}));

// ─── Feature card ────────────────────────────────────────────────────────────
function FeatureCard({ icon, title, badge, description, delay }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ delay, duration: 0.5 }}
      className="glass-hover p-6 space-y-4 group"
    >
      <div className="flex items-start justify-between">
        <div
          className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl"
          style={{ background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.2)' }}
        >
          {icon}
        </div>
        <span
          className="text-xs font-semibold px-2.5 py-1 rounded-lg"
          style={{ background: 'rgba(139,92,246,0.1)', color: '#a78bfa', border: '1px solid rgba(139,92,246,0.2)' }}
        >
          {badge}
        </span>
      </div>
      <div>
        <h3 className="text-slate-100 font-bold text-lg">{title}</h3>
        <p className="text-slate-500 text-sm mt-2 leading-relaxed">{description}</p>
      </div>
    </motion.div>
  );
}

// ─── Step ────────────────────────────────────────────────────────────────────
function Step({ num, title, description, delay }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      whileInView={{ opacity: 1, x: 0 }}
      viewport={{ once: true }}
      transition={{ delay, duration: 0.4 }}
      className="flex gap-4"
    >
      <div className="shrink-0 w-8 h-8 rounded-full bg-brand-600 flex items-center justify-center text-white text-sm font-bold mt-0.5">
        {num}
      </div>
      <div>
        <p className="text-slate-200 font-semibold">{title}</p>
        <p className="text-slate-500 text-sm mt-1">{description}</p>
      </div>
    </motion.div>
  );
}

// ─── Stat ────────────────────────────────────────────────────────────────────
function Stat({ value, label }) {
  return (
    <div className="text-center">
      <p className="text-3xl font-black font-mono gradient-text">{value}</p>
      <p className="text-slate-500 text-sm mt-1">{label}</p>
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────
export default function Home() {
  const { isAuthenticated } = useAuth();

  return (
    <div className="relative overflow-hidden">
      {/* Background particles */}
      {PARTICLES.map((p) => <Particle key={p.id} style={p.style} />)}

      {/* ── Hero ── */}
      <section className="relative min-h-[88vh] flex flex-col items-center justify-center px-4 py-24 text-center">
        {/* Glow blobs */}
        <div
          className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] rounded-full pointer-events-none"
          style={{ background: 'radial-gradient(ellipse, rgba(139,92,246,0.12) 0%, transparent 70%)', filter: 'blur(40px)' }}
        />

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          className="relative max-w-4xl"
        >
          {/* Label */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.1, duration: 0.4 }}
            className="inline-flex items-center gap-2 mb-8 px-4 py-2 rounded-full text-sm font-medium"
            style={{ background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.25)', color: '#a78bfa' }}
          >
            <span className="w-2 h-2 rounded-full bg-brand-400 animate-pulse" />
            Multimodal deepfake forensics
          </motion.div>

          {/* Headline */}
          <h1 className="text-6xl sm:text-7xl font-black tracking-tight leading-[1.05] mb-6">
            <span className="text-white">Expose</span>
            <br />
            <span className="gradient-text">synthetic media</span>
            <br />
            <span className="text-white">at the source.</span>
          </h1>

          <p className="text-lg text-slate-400 max-w-2xl mx-auto leading-relaxed mb-10">
            MAVEN combines <strong className="text-slate-300">frequency-domain FFT analysis</strong>,{' '}
            <strong className="text-slate-300">physiological liveness detection</strong>, and{' '}
            <strong className="text-slate-300">audio-visual lip-sync verification</strong>{' '}
            to detect deepfakes with forensic precision.
          </p>

          {/* CTAs */}
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Link
              to={isAuthenticated ? '/upload' : '/auth?tab=signup'}
              className="btn-primary text-base px-8 py-3"
            >
              Analyse a video
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </Link>
            <a
              href="#how-it-works"
              className="btn-secondary text-base px-8 py-3"
            >
              How it works
            </a>
          </div>
        </motion.div>

        {/* Scroll arrow */}
        <motion.div
          className="absolute bottom-8"
          animate={{ y: [0, 8, 0] }}
          transition={{ duration: 2, repeat: Infinity }}
        >
          <svg className="w-5 h-5 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </motion.div>
      </section>

      {/* ── Stats band ── */}
      <section className="py-12">
        <div className="max-w-4xl mx-auto px-4">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="glass grid grid-cols-2 sm:grid-cols-4 gap-6 p-8"
          >
            <Stat value="3" label="Detection layers" />
            <Stat value="30fps" label="Frame analysis" />
            <Stat value="40%" label="Liveness weight" />
            <Stat value="3-way" label="Score fusion" />
          </motion.div>
        </div>
      </section>

      {/* ── Detection layers ── */}
      <section id="features" className="py-20 px-4">
        <div className="max-w-6xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-14"
          >
            <p className="label-sm mb-3">Detection methodology</p>
            <h2 className="text-4xl font-black text-white">Three forensic layers</h2>
            <p className="text-slate-500 mt-4 max-w-xl mx-auto text-sm leading-relaxed">
              Each layer targets a different class of deepfake manipulation — together they provide
              overlapping coverage that's hard to fool.
            </p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <FeatureCard
              icon="📡"
              title="Frequency-Domain Analysis"
              badge="FFT · 30%"
              description="2D Fast Fourier Transform detects GAN/diffusion high-frequency noise fingerprints invisible to the human eye. Per-frame spectral artifact scoring with temporal consistency checks."
              delay={0}
            />
            <FeatureCard
              icon="👁️"
              title="Visual Liveness Detection"
              badge="rPPG · 40% · Soon"
              description="Remote photoplethysmography extracts pulse signals from forehead skin patches. Combined with eye-blink frequency and regularity analysis to detect physiologically impossible behavior."
              delay={0.1}
            />
            <FeatureCard
              icon="🎧"
              title="Audio-Visual Lip-Sync"
              badge="Sync · 30%"
              description="Cross-correlation of lip-movement sequences against MFCC audio features detects phoneme-to-lip mismatches — the telltale sign of dubbing-based and audio-swap deepfakes."
              delay={0.2}
            />
          </div>
        </div>
      </section>

      {/* ── How it works ── */}
      <section id="how-it-works" className="py-20 px-4">
        <div className="max-w-5xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              className="space-y-8"
            >
              <div>
                <p className="label-sm mb-3">How it works</p>
                <h2 className="text-4xl font-black text-white">Upload. Analyse. Know.</h2>
              </div>
              <div className="space-y-6">
                <Step num={1} title="Upload your video" description="Drag & drop or browse — MP4, WebM, MOV, and MKV up to 500 MB supported." delay={0} />
                <Step num={2} title="Parallel ML analysis" description="Three Python microservices run simultaneously — FFT, liveness, and lip-sync — returning scores within seconds." delay={0.1} />
                <Step num={3} title="Weighted verdict" description="Scores are fused with calibrated weights into a single REAL / UNCERTAIN / FAKE verdict with a confidence percentage." delay={0.2} />
                <Step num={4} title="Detailed breakdown" description="Explore per-layer scores, suspicious frames, flagged lip-sync segments, and interactive charts." delay={0.3} />
              </div>
            </motion.div>

            {/* Fake terminal / preview */}
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              className="glass rounded-2xl overflow-hidden"
            >
              <div className="flex items-center gap-2 px-4 py-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <div className="w-3 h-3 rounded-full bg-red-500/60" />
                <div className="w-3 h-3 rounded-full bg-amber-500/60" />
                <div className="w-3 h-3 rounded-full bg-emerald-500/60" />
                <span className="ml-2 text-xs text-slate-600 font-mono">maven-result.json</span>
              </div>
              <pre className="p-5 text-xs font-mono leading-relaxed overflow-x-auto" style={{ color: '#94a3b8' }}>
{`{
  `}<span style={{ color: '#a78bfa' }}>"verdict"</span>{`: `}<span style={{ color: '#f87171' }}>"FAKE"</span>{`,
  `}<span style={{ color: '#a78bfa' }}>"confidence"</span>{`: `}<span style={{ color: '#fbbf24' }}>0.8234</span>{`,
  `}<span style={{ color: '#a78bfa' }}>"breakdown"</span>{`: {
    `}<span style={{ color: '#818cf8' }}>"fft"</span>{`: {
      `}<span style={{ color: '#94a3b8' }}>"rawScore"</span>{`: `}<span style={{ color: '#fbbf24' }}>0.87</span>{`,
      `}<span style={{ color: '#94a3b8' }}>"verdict"</span>{`: `}<span style={{ color: '#f87171' }}>"FAKE"</span>{`
    },
    `}<span style={{ color: '#818cf8' }}>"lipsync"</span>{`: {
      `}<span style={{ color: '#94a3b8' }}>"syncScore"</span>{`: `}<span style={{ color: '#fbbf24' }}>0.12</span>{`,
      `}<span style={{ color: '#94a3b8' }}>"verdict"</span>{`: `}<span style={{ color: '#f87171' }}>"OUT_OF_SYNC"</span>{`
    },
    `}<span style={{ color: '#818cf8' }}>"liveness"</span>{`: `}<span style={{ color: '#64748b' }}>"Coming soon…"</span>{`
  }
}`}
              </pre>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="py-24 px-4">
        <div className="max-w-3xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="glass p-12 rounded-3xl relative overflow-hidden"
          >
            <div
              className="absolute inset-0 pointer-events-none"
              style={{ background: 'radial-gradient(ellipse at 50% 0%, rgba(139,92,246,0.12) 0%, transparent 70%)' }}
            />
            <h2 className="text-4xl font-black text-white mb-4 relative">
              Ready to detect deepfakes?
            </h2>
            <p className="text-slate-400 mb-8 relative">
              Upload a video and get a forensic verdict in seconds.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3 relative">
              <Link to={isAuthenticated ? '/upload' : '/auth?tab=signup'} className="btn-primary text-base px-8 py-3">
                {isAuthenticated ? 'Analyse a video' : 'Create free account'}
              </Link>
              {!isAuthenticated && (
                <Link to="/auth" className="btn-ghost text-slate-400">
                  Sign in instead
                </Link>
              )}
            </div>
          </motion.div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="py-8 px-4 text-center">
        <div className="divider mb-8" />
        <p className="text-xs text-slate-700">
          MAVEN — Multimodal Audio-Visual Examination Network · Built for forensic precision
        </p>
      </footer>
    </div>
  );
}
