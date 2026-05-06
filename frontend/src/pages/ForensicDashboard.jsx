import React, { useState, useEffect, useRef, useCallback } from 'react';

// ─── Mock data ────────────────────────────────────────────────────────────────

const MOCK_LOGS = [
  '[SYSTEM] Initializing MAVEN forensic pipeline v2.4.1',
  '[SYSTEM] Loading model registry...',
  '[FFT] ViT classifier ready · dima806/deepfake_vs_real_image_detection',
  '[FFT] DFDC EfficientNet B7 NS ready · selimsef (255 MB)',
  '[FFT] Sampling 30 key frames from source...',
  '[FFT] Running dual-model inference · CPU mode',
  '[FFT] Frequency artifacts detected in 18–22 kHz band',
  '[FFT] ViT score: 0.91 | DFDC score: 0.85 → blended: 0.88',
  '[LIPSYNC] SyncNet discriminator loaded · lipsync_expert.pth',
  '[LIPSYNC] Extracting mel spectrogram · n_mels=80 hop=200',
  '[LIPSYNC] Analyzing 307 audio-visual windows...',
  '[LIPSYNC] Desynchronization detected · SyncNet conf: 0.06',
  '[LIVENESS] Running rPPG + blink analysis...',
  '[LIVENESS] rPPG signal: anomalous | Blinks detected: 0',
  '[LIVENESS] Anti-spoofing score below biological threshold',
  '[ORCHESTRATOR] Aggregating · FFT=0.88 LIPSYNC=0.94 LIVENESS=0.79',
  '[ORCHESTRATOR] Final verdict: FAKE (confidence: 0.91)',
  '[ORCHESTRATOR] Analysis complete in 1847 ms',
];

const MOCK_RESULT = {
  verdict: 'FAKE',
  confidence: 0.91,
  fft:      { score: 0.88, label: 'Artifact Detected' },
  lipsync:  { score: 0.94, label: 'Desync Detected' },
  liveness: { score: 0.79, label: 'Spoof Signal' },
  processing_time_ms: 1847,
};

const MOCK_HISTORY = [
  { id: 'JOB-2847', file: 'interview_clip.mp4',  verdict: 'FAKE',      conf: 0.91, ts: '14:23:01' },
  { id: 'JOB-2846', file: 'speech_excerpt.mp4',  verdict: 'REAL',      conf: 0.87, ts: '13:45:22' },
  { id: 'JOB-2845', file: 'news_segment.mp4',    verdict: 'UNCERTAIN', conf: 0.54, ts: '12:08:44' },
  { id: 'JOB-2844', file: 'testimony.mp4',        verdict: 'FAKE',      conf: 0.96, ts: '11:32:15' },
  { id: 'JOB-2843', file: 'deposition.mp4',       verdict: 'REAL',      conf: 0.92, ts: '10:17:38' },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const fmt = {
  bytes: (b) => b < 1048576 ? `${(b / 1024).toFixed(1)} KB` : `${(b / 1048576).toFixed(1)} MB`,
  pct:   (n) => `${Math.round(n * 100)}%`,
  score: (n) => (n * 100).toFixed(0),
  ts:    ()  => new Date().toISOString().slice(11, 19),
};

const verdictColor = (v) => ({
  FAKE:      'var(--danger)',
  REAL:      'var(--ok)',
  UNCERTAIN: 'var(--warn)',
}[v] ?? 'var(--text2)');

const scoreColor = (s) =>
  s > 0.7 ? 'var(--danger)' : s > 0.45 ? 'var(--warn)' : 'var(--ok)';

// ─── CSS injection ────────────────────────────────────────────────────────────

const CSS = `
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}

:root{
  --bg:    #0a0c0f;
  --bg2:   #0e1219;
  --bg3:   #111720;
  --bg4:   #151c26;
  --b:     rgba(255,255,255,.06);
  --b2:    rgba(255,255,255,.11);
  --b3:    rgba(255,255,255,.18);
  --text:  #dde4ee;
  --text2: #637080;
  --text3: #333d4a;
  --accent:#00e5ff;
  --a2:    rgba(0,229,255,.12);
  --a3:    rgba(0,229,255,.06);
  --danger:#ff3b5c;
  --d2:    rgba(255,59,92,.15);
  --warn:  #ffaa00;
  --w2:    rgba(255,170,0,.15);
  --ok:    #00ff88;
  --ok2:   rgba(0,255,136,.12);
  --mono:  'JetBrains Mono',monospace;
  --head:  'Orbitron',monospace;
  --r:     6px;
}

[data-theme="light"]{
  --bg:   #f0f4f8;
  --bg2:  #e4eaf3;
  --bg3:  #ffffff;
  --bg4:  #f8fafc;
  --b:    rgba(0,0,0,.07);
  --b2:   rgba(0,0,0,.12);
  --b3:   rgba(0,0,0,.20);
  --text: #0f1c2e;
  --text2:#4a5568;
  --text3:#94a3b8;
  --accent:#0055cc;
  --a2:   rgba(0,85,204,.10);
  --a3:   rgba(0,85,204,.05);
  --danger:#c8294a;
  --d2:   rgba(200,41,74,.10);
  --warn: #a05e00;
  --w2:   rgba(160,94,0,.10);
  --ok:   #067a50;
  --ok2:  rgba(6,122,80,.10);
}

html,body{height:100%;background:var(--bg);font-family:var(--mono);color:var(--text);overflow:hidden}
#root{height:100%}

@keyframes scan{0%{top:-40px}100%{top:calc(100% + 40px)}}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.25}}
@keyframes fadeUp{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
@keyframes drawArc{from{stroke-dashoffset:var(--full)}to{stroke-dashoffset:var(--target)}}
@keyframes gridPulse{0%,100%{opacity:.04}50%{opacity:.09}}
@keyframes cursor{0%,100%{opacity:1}50%{opacity:0}}
@keyframes slideIn{from{opacity:0;transform:translateX(-6px)}to{opacity:1;transform:translateX(0)}}
@keyframes barAnim{0%,100%{transform:scaleY(1)}50%{transform:scaleY(var(--scale))}}

::-webkit-scrollbar{width:3px}
::-webkit-scrollbar-track{background:transparent}
::-webkit-scrollbar-thumb{background:var(--b3);border-radius:2px}

button{cursor:pointer;border:none;background:none;font-family:var(--mono);color:var(--text)}
input[type=file]{display:none}

.maven-root{
  display:grid;
  grid-template-rows:48px 1fr 156px;
  height:100vh;
  background:var(--bg);
}

/* ── TOPBAR ──────────────────────────────────────────────────────── */
.topbar{
  display:flex;align-items:center;gap:0;
  padding:0 20px;
  background:var(--bg2);
  border-bottom:1px solid var(--b2);
  position:relative;z-index:10;
}
.topbar::after{
  content:'';position:absolute;bottom:0;left:0;right:0;height:1px;
  background:linear-gradient(90deg,transparent,var(--accent),transparent);
  opacity:.3;
}
.logo{
  font-family:var(--head);
  font-size:15px;font-weight:900;letter-spacing:.25em;
  color:var(--accent);
  text-shadow:0 0 20px var(--accent);
  padding-right:32px;
  user-select:none;
}
.logo span{color:var(--text2);font-weight:400}
.nav-tabs{display:flex;align-items:center;gap:4px;flex:1}
.nav-tab{
  padding:5px 14px;
  font-size:10px;font-weight:600;letter-spacing:.12em;
  color:var(--text2);
  border:1px solid transparent;border-radius:var(--r);
  transition:all .15s;text-transform:uppercase;
}
.nav-tab:hover{color:var(--text);background:var(--b)}
.nav-tab.active{
  color:var(--accent);border-color:var(--b2);
  background:var(--a3);
}
.status-pills{display:flex;align-items:center;gap:8px;margin-right:16px}
.pill{
  display:flex;align-items:center;gap:6px;
  padding:4px 10px;font-size:10px;font-weight:500;
  background:var(--bg3);border:1px solid var(--b2);border-radius:20px;
  color:var(--text2);letter-spacing:.06em;
}
.pill-dot{
  width:6px;height:6px;border-radius:50%;
  background:var(--ok);box-shadow:0 0 6px var(--ok);
  animation:pulse 2s ease-in-out infinite;
}
.pill-dot.dead{background:var(--danger);box-shadow:0 0 6px var(--danger)}
.theme-btn{
  width:34px;height:34px;display:flex;align-items:center;justify-content:center;
  background:var(--bg3);border:1px solid var(--b2);border-radius:var(--r);
  color:var(--text2);font-size:15px;transition:all .15s;
}
.theme-btn:hover{color:var(--accent);border-color:var(--accent)}

/* ── WORKSPACE ───────────────────────────────────────────────────── */
.workspace{
  display:grid;
  grid-template-columns:30% 70%;
  overflow:hidden;
}

/* ── LEFT PANEL ──────────────────────────────────────────────────── */
.left-panel{
  display:flex;flex-direction:column;gap:12px;
  padding:16px;
  background:var(--bg2);
  border-right:1px solid var(--b2);
  overflow:hidden;
}
.panel-label{
  font-size:9px;font-weight:700;letter-spacing:.18em;
  color:var(--text3);text-transform:uppercase;
  padding-bottom:6px;border-bottom:1px solid var(--b);
}
.upload-zone{
  flex:1;
  display:flex;flex-direction:column;align-items:center;justify-content:center;
  border:1px dashed var(--b2);border-radius:var(--r);
  background:var(--bg3);position:relative;overflow:hidden;
  transition:border-color .2s,background .2s;
  cursor:pointer;min-height:0;
}
.upload-zone:hover,.upload-zone.dragover{
  border-color:var(--accent);background:var(--a3);
}
.upload-zone.has-file{border-style:solid;border-color:var(--b2)}
.scan-line{
  position:absolute;left:0;right:0;height:2px;
  background:linear-gradient(90deg,transparent,var(--accent),transparent);
  animation:scan 2.8s linear infinite;
  pointer-events:none;opacity:.6;
}
.upload-icon{font-size:28px;margin-bottom:10px;opacity:.4}
.upload-hint{font-size:10px;color:var(--text2);text-align:center;line-height:1.7;letter-spacing:.04em}
.upload-hint strong{color:var(--accent);display:block;font-size:11px;margin-bottom:4px}
.file-preview{
  width:100%;height:100%;
  display:flex;flex-direction:column;align-items:center;justify-content:center;
  gap:8px;padding:12px;
}
.preview-thumb{
  width:100%;max-height:120px;object-fit:cover;
  border-radius:4px;border:1px solid var(--b2);
}
.preview-name{
  font-size:10px;color:var(--text);word-break:break-all;text-align:center;
  max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;
}
.file-meta{
  display:grid;grid-template-columns:1fr 1fr;gap:6px;
}
.meta-cell{
  background:var(--bg3);border:1px solid var(--b);border-radius:var(--r);
  padding:8px;
}
.meta-key{font-size:8px;color:var(--text3);letter-spacing:.12em;text-transform:uppercase;margin-bottom:3px}
.meta-val{font-size:11px;color:var(--text);font-weight:500}
.run-btn{
  width:100%;padding:12px;
  font-family:var(--head);font-size:11px;font-weight:700;letter-spacing:.18em;
  text-transform:uppercase;
  background:var(--accent);color:#000;
  border-radius:var(--r);
  transition:all .15s;
  position:relative;overflow:hidden;
}
.run-btn::before{
  content:'';position:absolute;inset:0;
  background:linear-gradient(135deg,rgba(255,255,255,.15),transparent);
}
.run-btn:hover{box-shadow:0 0 20px rgba(0,229,255,.4);transform:translateY(-1px)}
.run-btn:active{transform:translateY(0)}
.run-btn:disabled{
  background:var(--bg4);color:var(--text3);
  box-shadow:none;transform:none;cursor:not-allowed;
}
.run-btn:disabled::before{display:none}
.progress-wrap{height:2px;background:var(--b2);border-radius:1px;overflow:hidden;margin-top:4px}
.progress-bar{
  height:100%;background:var(--accent);border-radius:1px;
  transition:width .3s ease;
  box-shadow:0 0 8px var(--accent);
}

/* ── MAIN AREA ───────────────────────────────────────────────────── */
.main-area{
  display:flex;flex-direction:column;
  overflow:hidden;background:var(--bg);
  position:relative;
}

/* ── IDLE ────────────────────────────────────────────────────────── */
.idle-state{
  flex:1;display:flex;flex-direction:column;
  align-items:center;justify-content:center;gap:16px;
  position:relative;overflow:hidden;
}
.grid-bg{
  position:absolute;inset:0;
  background-image:
    linear-gradient(var(--b) 1px,transparent 1px),
    linear-gradient(90deg,var(--b) 1px,transparent 1px);
  background-size:40px 40px;
  animation:gridPulse 4s ease-in-out infinite;
}
.idle-label{
  font-family:var(--head);font-size:13px;font-weight:700;
  letter-spacing:.3em;color:var(--text3);text-transform:uppercase;
  position:relative;
}
.idle-cursor{
  display:inline-block;width:8px;height:14px;
  background:var(--accent);margin-left:6px;vertical-align:middle;opacity:.7;
  animation:cursor 1.1s step-end infinite;
}
.idle-sub{font-size:9px;color:var(--text3);letter-spacing:.18em;position:relative}

/* ── RESULTS ─────────────────────────────────────────────────────── */
.results-area{
  flex:1;display:flex;flex-direction:column;gap:12px;
  padding:16px;overflow:hidden;
  animation:fadeUp .35s ease;
}

.verdict-banner{
  padding:16px 24px;
  border-radius:var(--r);
  border:1px solid;
  display:flex;align-items:center;justify-content:space-between;
  flex-shrink:0;
}
.verdict-label{
  font-family:var(--head);font-size:22px;font-weight:900;
  letter-spacing:.15em;
}
.verdict-meta{text-align:right}
.verdict-conf{font-size:28px;font-weight:700;line-height:1}
.verdict-sub{font-size:9px;color:var(--text2);letter-spacing:.12em;margin-top:3px}
.verdict-time{font-size:9px;color:var(--text3);letter-spacing:.08em;margin-top:2px}

.scores-row{
  display:grid;grid-template-columns:repeat(3,1fr);gap:12px;
  flex-shrink:0;
}
.score-card{
  background:var(--bg3);border:1px solid var(--b2);border-radius:var(--r);
  padding:14px;display:flex;align-items:center;gap:14px;
  animation:slideIn .4s ease;
}
.score-card:nth-child(2){animation-delay:.07s}
.score-card:nth-child(3){animation-delay:.14s}
.score-radial{position:relative;flex-shrink:0}
.score-radial svg{display:block}
.score-pct{
  position:absolute;inset:0;display:flex;align-items:center;justify-content:center;
  font-size:13px;font-weight:700;
}
.score-info{flex:1;min-width:0}
.score-service{font-size:9px;color:var(--text3);letter-spacing:.15em;text-transform:uppercase;margin-bottom:4px}
.score-name{font-size:12px;font-weight:600;color:var(--text);margin-bottom:3px}
.score-tag{
  display:inline-block;font-size:9px;letter-spacing:.1em;
  padding:2px 8px;border-radius:3px;font-weight:600;
}

.waveform-strip{
  background:var(--bg3);border:1px solid var(--b2);border-radius:var(--r);
  padding:10px 14px;flex-shrink:0;
}
.wave-header{
  display:flex;justify-content:space-between;align-items:center;
  margin-bottom:8px;
}
.wave-label{font-size:9px;color:var(--text3);letter-spacing:.15em;text-transform:uppercase}
.wave-badge{font-size:9px;color:var(--danger);letter-spacing:.08em}
.wave-bars{display:flex;align-items:flex-end;gap:1.5px;height:40px}
.wave-bar{
  flex:1;border-radius:1px 1px 0 0;
  background:var(--accent);opacity:.6;
  transform-origin:bottom;
  animation:barAnim var(--dur) ease-in-out infinite;
}

.raw-section{
  background:var(--bg3);border:1px solid var(--b2);border-radius:var(--r);
  flex-shrink:0;overflow:hidden;
}
.raw-toggle{
  width:100%;display:flex;align-items:center;justify-content:space-between;
  padding:10px 14px;
  font-size:9px;letter-spacing:.15em;text-transform:uppercase;color:var(--text2);
  border-bottom:1px solid transparent;transition:border-color .15s;
}
.raw-toggle:hover{border-bottom-color:var(--b)}
.raw-toggle .chevron{transition:transform .2s}
.raw-toggle .chevron.open{transform:rotate(180deg)}
.raw-json{
  padding:12px 14px;max-height:120px;overflow-y:auto;
  font-size:10px;line-height:1.7;color:var(--text2);
  white-space:pre;
}

/* ── LOG BAR ─────────────────────────────────────────────────────── */
.log-bar{
  background:var(--bg2);
  border-top:1px solid var(--b2);
  display:flex;flex-direction:column;
  position:relative;
}
.log-bar::before{
  content:'';position:absolute;top:0;left:0;right:0;height:1px;
  background:linear-gradient(90deg,transparent,var(--accent),transparent);
  opacity:.25;
}
.log-header{
  display:flex;align-items:center;gap:10px;
  padding:6px 14px;border-bottom:1px solid var(--b);flex-shrink:0;
}
.log-title{font-size:9px;letter-spacing:.18em;text-transform:uppercase;color:var(--text3)}
.log-status{
  font-size:9px;padding:2px 8px;border-radius:3px;
  background:var(--ok2);color:var(--ok);letter-spacing:.08em;font-weight:600;
}
.log-status.analyzing{background:var(--w2);color:var(--warn)}
.log-body{flex:1;overflow-y:auto;padding:6px 14px;display:flex;flex-direction:column;gap:2px}
.log-line{
  font-size:10px;color:var(--text2);line-height:1.5;
  animation:fadeUp .2s ease;
}
.log-line .ts{color:var(--text3);margin-right:10px;user-select:none}
.log-line .tag-fft{color:#7dd3fc}
.log-line .tag-lip{color:#c4b5fd}
.log-line .tag-liv{color:#86efac}
.log-line .tag-orch{color:var(--accent)}
.log-line .tag-sys{color:var(--text3)}
.log-line .tag-verdict{color:var(--danger);font-weight:600}

/* ── HISTORY TAB ─────────────────────────────────────────────────── */
.history-area{
  flex:1;display:flex;flex-direction:column;gap:0;
  overflow:hidden;padding:16px;animation:fadeUp .3s ease;
}
.hist-table{
  flex:1;overflow-y:auto;
  border:1px solid var(--b2);border-radius:var(--r);
  background:var(--bg3);
}
.hist-row{
  display:grid;grid-template-columns:100px 1fr 100px 80px 60px;
  gap:0;padding:10px 16px;align-items:center;
  border-bottom:1px solid var(--b);font-size:10px;
  transition:background .15s;
}
.hist-row:last-child{border-bottom:none}
.hist-row:hover{background:var(--b)}
.hist-row.header{color:var(--text3);font-size:9px;letter-spacing:.12em;text-transform:uppercase;background:var(--bg4)}
.hist-badge{
  display:inline-flex;padding:2px 8px;border-radius:3px;
  font-size:9px;font-weight:700;letter-spacing:.08em;
}
.hist-time{color:var(--text3)}

/* ── SETTINGS TAB ────────────────────────────────────────────────── */
.settings-area{
  flex:1;display:flex;flex-direction:column;gap:16px;
  overflow-y:auto;padding:16px;animation:fadeUp .3s ease;
}
.settings-section{
  background:var(--bg3);border:1px solid var(--b2);border-radius:var(--r);
  padding:14px;
}
.settings-title{
  font-size:9px;letter-spacing:.18em;text-transform:uppercase;
  color:var(--text3);margin-bottom:12px;
}
.setting-row{
  display:flex;align-items:center;justify-content:space-between;
  padding:8px 0;border-bottom:1px solid var(--b);font-size:10px;
}
.setting-row:last-child{border-bottom:none}
.setting-key{color:var(--text2);letter-spacing:.06em}
.setting-val{
  color:var(--accent);font-weight:500;
  padding:3px 10px;background:var(--a3);
  border:1px solid var(--a2);border-radius:4px;
}
.setting-val.ok{color:var(--ok);background:var(--ok2);border-color:rgba(0,255,136,.2)}
.threshold-row{
  display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;
  margin-top:8px;
}
.threshold-cell{
  background:var(--bg4);border:1px solid var(--b);border-radius:var(--r);
  padding:10px;text-align:center;
}
.threshold-val{font-size:16px;font-weight:700;color:var(--accent)}
.threshold-key{font-size:9px;color:var(--text3);letter-spacing:.1em;margin-top:2px}
`;

// ─── Sub-components ──────────────────────────────────────────────────────────

function StyleInjector({ theme }) {
  useEffect(() => {
    const el = document.createElement('style');
    el.textContent = CSS;
    document.head.appendChild(el);
    return () => document.head.removeChild(el);
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  return null;
}

function ServicePill({ name, alive = true }) {
  return (
    <div className="pill">
      <div className={`pill-dot${alive ? '' : ' dead'}`} />
      {name}
    </div>
  );
}

function TopBar({ theme, onThemeToggle, activeTab, onTabChange }) {
  const tabs = ['Dashboard', 'Analysis', 'History', 'Settings'];
  return (
    <div className="topbar">
      <div className="logo">MVN<span>·</span>FORENSICS</div>
      <div className="nav-tabs">
        {tabs.map((t) => (
          <button
            key={t}
            className={`nav-tab${activeTab === t ? ' active' : ''}`}
            onClick={() => onTabChange(t)}
          >{t}</button>
        ))}
      </div>
      <div className="status-pills">
        <ServicePill name="FFT" />
        <ServicePill name="LIPSYNC" />
        <ServicePill name="LIVENESS" />
      </div>
      <button className="theme-btn" onClick={onThemeToggle} title="Toggle theme">
        {theme === 'dark' ? '☀' : '◑'}
      </button>
    </div>
  );
}

function RadialScore({ score, color, size = 80 }) {
  const r = size / 2 - 7;
  const C = 2 * Math.PI * r;
  const [offset, setOffset] = useState(C);
  const cx = size / 2, cy = size / 2;

  useEffect(() => {
    const t = setTimeout(() => setOffset(C * (1 - score)), 200);
    return () => clearTimeout(t);
  }, [score, C]);

  return (
    <div className="score-radial">
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--b2)" strokeWidth={5} />
        <circle
          cx={cx} cy={cy} r={r} fill="none"
          stroke={color} strokeWidth={5} strokeLinecap="round"
          strokeDasharray={C}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 1.1s cubic-bezier(.34,1.56,.64,1)' }}
        />
      </svg>
      <div className="score-pct" style={{ color }}>
        {fmt.score(score)}
      </div>
    </div>
  );
}

function ScoreCard({ service, name, score, label }) {
  const color = scoreColor(score);
  return (
    <div className="score-card">
      <RadialScore score={score} color={color} />
      <div className="score-info">
        <div className="score-service">{service}</div>
        <div className="score-name">{name}</div>
        <span className="score-tag"
          style={{ background: color + '20', color }}
        >{label}</span>
      </div>
    </div>
  );
}

function WaveformStrip({ verdict }) {
  const bars = Array.from({ length: 64 }, (_, i) => {
    const base = 0.15 + Math.abs(Math.sin(i * 0.31 + 1.2)) * 0.3;
    const spike = (i > 22 && i < 38) ? 0.55 : 0;
    return Math.min(1, base + spike);
  });
  return (
    <div className="waveform-strip">
      <div className="wave-header">
        <span className="wave-label">FFT Spectrum · Frequency Domain</span>
        <span className="wave-badge">⚠ ANOMALY 18–22 kHz</span>
      </div>
      <div className="wave-bars">
        {bars.map((h, i) => {
          const isSpike = i > 22 && i < 38;
          return (
            <div key={i} className="wave-bar"
              style={{
                height: `${h * 100}%`,
                background: isSpike ? 'var(--danger)' : 'var(--accent)',
                opacity: isSpike ? 0.9 : 0.5,
                '--scale': (0.5 + Math.random() * 0.5).toFixed(2),
                '--dur': `${0.8 + Math.random() * 0.8}s`,
                animationDelay: `${(i * 0.02).toFixed(2)}s`,
              }}
            />
          );
        })}
      </div>
    </div>
  );
}

function RawEvidence({ data }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="raw-section">
      <button className="raw-toggle" onClick={() => setOpen((v) => !v)}>
        <span>Raw Evidence · JSON Response</span>
        <span className="chevron" style={{ transform: open ? 'rotate(180deg)' : 'none' }}>▾</span>
      </button>
      {open && (
        <div className="raw-json">
          {JSON.stringify(data, null, 2)}
        </div>
      )}
    </div>
  );
}

function VerdictBanner({ verdict, confidence, ms }) {
  const color = verdictColor(verdict);
  return (
    <div className="verdict-banner"
      style={{
        background: color + '12',
        borderColor: color + '40',
      }}
    >
      <div>
        <div style={{ fontSize: 10, letterSpacing: '.18em', color: 'var(--text3)', marginBottom: 6, textTransform: 'uppercase' }}>
          Forensic Verdict
        </div>
        <div className="verdict-label" style={{ color }}>{verdict}</div>
      </div>
      <div className="verdict-meta">
        <div className="verdict-conf" style={{ color }}>{fmt.pct(confidence)}</div>
        <div className="verdict-sub">CONFIDENCE</div>
        <div className="verdict-time">{ms} ms · {fmt.ts()}</div>
      </div>
    </div>
  );
}

function ResultsPanel({ result }) {
  return (
    <div className="results-area">
      <VerdictBanner verdict={result.verdict} confidence={result.confidence} ms={result.processing_time_ms} />
      <div className="scores-row">
        <ScoreCard service="FFT ANALYSIS" name="Frequency Domain" score={result.fft.score} label={result.fft.label} />
        <ScoreCard service="LIP SYNC" name="Audio-Visual" score={result.lipsync.score} label={result.lipsync.label} />
        <ScoreCard service="LIVENESS" name="Anti-Spoofing" score={result.liveness.score} label={result.liveness.label} />
      </div>
      <WaveformStrip verdict={result.verdict} />
      <RawEvidence data={result} />
    </div>
  );
}

function IdleState() {
  return (
    <div className="idle-state">
      <div className="grid-bg" />
      <div style={{ position: 'relative', textAlign: 'center' }}>
        <div style={{
          fontSize: 48, marginBottom: 20, opacity: .12,
          fontFamily: 'var(--head)', letterSpacing: '.1em', color: 'var(--accent)',
        }}>MVN</div>
        <div className="idle-label">
          Awaiting Forensic Input
          <span className="idle-cursor" />
        </div>
        <div className="idle-sub" style={{ marginTop: 8 }}>
          Upload a video or image file to begin analysis
        </div>
      </div>
    </div>
  );
}

function UploadPanel({ file, preview, meta, isDragging, onDragOver, onDragLeave, onDrop, onFileChange, onRunAnalysis, isAnalyzing, progress }) {
  const inputRef = useRef();
  return (
    <div className="left-panel">
      <div className="panel-label">Source Input</div>

      <div
        className={`upload-zone${isDragging ? ' dragover' : ''}${file ? ' has-file' : ''}`}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onClick={() => !file && inputRef.current?.click()}
        style={{ cursor: file ? 'default' : 'pointer' }}
      >
        <div className="scan-line" />
        <input ref={inputRef} type="file" accept="video/*,image/*" onChange={onFileChange} />

        {file ? (
          <div className="file-preview">
            {preview && (
              file.type.startsWith('image')
                ? <img src={preview} className="preview-thumb" alt="preview" />
                : <video src={preview} className="preview-thumb" muted playsInline />
            )}
            <div className="preview-name">{file.name}</div>
            <button
              onClick={(e) => { e.stopPropagation(); onFileChange(null); }}
              style={{ fontSize: 9, color: 'var(--text3)', letterSpacing: '.1em', marginTop: 4 }}
            >[ CLEAR ]</button>
          </div>
        ) : (
          <>
            <div className="upload-icon">⬡</div>
            <div className="upload-hint">
              <strong>Drop file here</strong>
              or click to browse<br />
              <span style={{ fontSize: 9, color: 'var(--text3)' }}>MP4 · MOV · AVI · PNG · JPG</span>
            </div>
          </>
        )}
      </div>

      {file && meta && (
        <div className="file-meta">
          <div className="meta-cell">
            <div className="meta-key">Size</div>
            <div className="meta-val">{meta.size}</div>
          </div>
          <div className="meta-cell">
            <div className="meta-key">Type</div>
            <div className="meta-val">{file.type.split('/')[1]?.toUpperCase() || '—'}</div>
          </div>
          {meta.duration && (
            <div className="meta-cell" style={{ gridColumn: '1/-1' }}>
              <div className="meta-key">Duration</div>
              <div className="meta-val">{meta.duration}</div>
            </div>
          )}
        </div>
      )}

      <button
        className="run-btn"
        disabled={!file || isAnalyzing}
        onClick={onRunAnalysis}
      >
        {isAnalyzing ? '▶ ANALYZING...' : '▶ RUN FORENSIC ANALYSIS'}
      </button>

      <div className="progress-wrap">
        <div className="progress-bar" style={{ width: `${progress}%` }} />
      </div>
    </div>
  );
}

function LogPanel({ logs, isAnalyzing }) {
  const bodyRef = useRef();
  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [logs]);

  const colorTag = (line) => {
    if (line.startsWith('[FFT]'))          return 'tag-fft';
    if (line.startsWith('[LIPSYNC]'))       return 'tag-lip';
    if (line.startsWith('[LIVENESS]'))      return 'tag-liv';
    if (line.startsWith('[ORCHESTRATOR]'))  return line.includes('FAKE') || line.includes('REAL') ? 'tag-verdict' : 'tag-orch';
    return 'tag-sys';
  };

  return (
    <div className="log-bar">
      <div className="log-header">
        <span className="log-title">Processing Log</span>
        <span className={`log-status${isAnalyzing ? ' analyzing' : ''}`}>
          {isAnalyzing ? '● ANALYZING' : '○ IDLE'}
        </span>
        <span style={{ marginLeft: 'auto', fontSize: 9, color: 'var(--text3)' }}>
          {logs.length} events
        </span>
      </div>
      <div className="log-body" ref={bodyRef}>
        {logs.length === 0 && (
          <div style={{ fontSize: 10, color: 'var(--text3)', padding: '4px 0' }}>
            — awaiting analysis —
          </div>
        )}
        {logs.map((line, i) => (
          <div key={i} className="log-line">
            <span className="ts">{fmt.ts()}</span>
            <span className={colorTag(line)}>{line}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function HistoryTab() {
  const vColor = (v) => ({
    FAKE: { bg: 'var(--d2)', color: 'var(--danger)' },
    REAL: { bg: 'var(--ok2)', color: 'var(--ok)' },
    UNCERTAIN: { bg: 'var(--w2)', color: 'var(--warn)' },
  }[v]);

  return (
    <div className="history-area">
      <div className="panel-label" style={{ marginBottom: 10 }}>Recent Analyses</div>
      <div className="hist-table">
        <div className="hist-row header">
          <div>Job ID</div><div>File</div><div>Verdict</div><div>Confidence</div><div>Time</div>
        </div>
        {MOCK_HISTORY.map((h) => {
          const c = vColor(h.verdict);
          return (
            <div key={h.id} className="hist-row">
              <div style={{ color: 'var(--accent)', fontSize: 9 }}>{h.id}</div>
              <div style={{ color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.file}</div>
              <div>
                <span className="hist-badge" style={{ background: c.bg, color: c.color }}>{h.verdict}</span>
              </div>
              <div style={{ color: 'var(--text)' }}>{fmt.pct(h.conf)}</div>
              <div className="hist-time">{h.ts}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SettingsTab() {
  return (
    <div className="settings-area">
      <div className="settings-section">
        <div className="settings-title">Service Endpoints</div>
        {[
          ['FFT Service', 'http://localhost:8001/analyze'],
          ['LipSync Service', 'http://localhost:8003/analyze'],
          ['Liveness Service', 'http://localhost:8002/analyze'],
          ['Backend Orchestrator', 'http://localhost:4000/api'],
        ].map(([k, v]) => (
          <div key={k} className="setting-row">
            <span className="setting-key">{k}</span>
            <span className="setting-val ok">{v}</span>
          </div>
        ))}
      </div>
      <div className="settings-section">
        <div className="settings-title">Verdict Thresholds</div>
        <div className="threshold-row">
          <div className="threshold-cell">
            <div className="threshold-val" style={{ color: 'var(--ok)' }}>&lt; 0.38</div>
            <div className="threshold-key">REAL</div>
          </div>
          <div className="threshold-cell">
            <div className="threshold-val" style={{ color: 'var(--warn)' }}>0.38–0.60</div>
            <div className="threshold-key">UNCERTAIN</div>
          </div>
          <div className="threshold-cell">
            <div className="threshold-val" style={{ color: 'var(--danger)' }}>&gt; 0.60</div>
            <div className="threshold-key">FAKE</div>
          </div>
        </div>
      </div>
      <div className="settings-section">
        <div className="settings-title">Model Registry</div>
        {[
          ['ViT Classifier', 'dima806/deepfake_vs_real_image_detection', '~96% acc'],
          ['DFDC EfficientNet', 'selimsef · B7 NS (Kaggle winner)', '~91% acc'],
          ['SyncNet', 'Wav2Lip lipsync_expert.pth', '—'],
          ['rPPG', 'CHROM algorithm + blink detection', '—'],
        ].map(([k, v, a]) => (
          <div key={k} className="setting-row">
            <span className="setting-key">{k}</span>
            <span style={{ fontSize: 9, color: 'var(--text2)', textAlign: 'right' }}>
              {v} {a && <span style={{ color: 'var(--ok)' }}>&nbsp;{a}</span>}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ForensicDashboard() {
  const [theme, setTheme]           = useState('dark');
  const [activeTab, setActiveTab]   = useState('Dashboard');
  const [file, setFile]             = useState(null);
  const [preview, setPreview]       = useState(null);
  const [meta, setMeta]             = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [progress, setProgress]     = useState(0);
  const [result, setResult]         = useState(null);
  const [logs, setLogs]             = useState([]);

  // Resolve file metadata
  const processFile = useCallback(async (f) => {
    if (!f) { setFile(null); setPreview(null); setMeta(null); return; }
    setFile(f);
    setResult(null);
    const url = URL.createObjectURL(f);
    setPreview(url);
    const size = fmt.bytes(f.size);
    let duration = null;
    if (f.type.startsWith('video/')) {
      duration = await new Promise((res) => {
        const v = document.createElement('video');
        v.src = url;
        v.onloadedmetadata = () => {
          const s = Math.round(v.duration);
          res(`${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`);
        };
        v.onerror = () => res(null);
      });
    }
    setMeta({ size, duration });
  }, []);

  const handleDragOver  = (e) => { e.preventDefault(); setIsDragging(true); };
  const handleDragLeave = ()  => setIsDragging(false);
  const handleDrop = (e) => { e.preventDefault(); setIsDragging(false); processFile(e.dataTransfer.files[0]); };
  const handleFileChange = (e) => processFile(e?.target?.files?.[0] ?? null);

  const runAnalysis = async () => {
    if (!file || isAnalyzing) return;
    setIsAnalyzing(true);
    setResult(null);
    setLogs([]);
    setProgress(0);
    setActiveTab('Dashboard');

    // Stream logs with realistic timing
    const delays = [120,180,140,160,200,900,250,180,160,280,400,200,160,220,180,300,350,200];
    let prog = 0;
    for (let i = 0; i < MOCK_LOGS.length; i++) {
      await sleep(delays[i] ?? 150);
      setLogs((p) => [...p, MOCK_LOGS[i]]);
      prog = Math.round(((i + 1) / MOCK_LOGS.length) * 100);
      setProgress(prog);
    }

    await sleep(200);
    setResult(MOCK_RESULT);
    setIsAnalyzing(false);
  };

  const showAnalysis = activeTab === 'Dashboard' || activeTab === 'Analysis';

  return (
    <>
      <StyleInjector theme={theme} />
      <div className="maven-root">
        <TopBar
          theme={theme}
          onThemeToggle={() => setTheme((t) => t === 'dark' ? 'light' : 'dark')}
          activeTab={activeTab}
          onTabChange={setActiveTab}
        />

        <div className="workspace">
          {/* Left panel always visible */}
          <UploadPanel
            file={file}
            preview={preview}
            meta={meta}
            isDragging={isDragging}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onFileChange={handleFileChange}
            onRunAnalysis={runAnalysis}
            isAnalyzing={isAnalyzing}
            progress={progress}
          />

          {/* Main area — tab-switched */}
          <div className="main-area">
            {showAnalysis && (result ? <ResultsPanel result={result} /> : <IdleState />)}
            {activeTab === 'History'  && <HistoryTab />}
            {activeTab === 'Settings' && <SettingsTab />}
          </div>
        </div>

        <LogPanel logs={logs} isAnalyzing={isAnalyzing} />
      </div>
    </>
  );
}
