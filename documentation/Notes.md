# Project just 4 lines
MAVEN is a deepfake detection web app that analyzes videos through three parallel ML layers: FFT frequency analysis, rPPG/blink liveness detection, and Wav2Lip audio-visual sync scoring.
It's built with a React frontend, Node.js/Express backend, three Python FastAPI ML microservices, Supabase for auth/storage/database, and Socket.io for real-time job status updates.
Users upload a video, the backend fans it out to all three ML services simultaneously, aggregates their scores into a weighted verdict (REAL/FAKE/UNCERTAIN), and displays a breakdown with a radar chart, sync timeline, and FFT heatmap.
The stack runs fully containerized via Docker Compose with GPU support for the liveness and lipsync services, deployed across Vercel (frontend), Railway (backend), and EC2 g4dn.xlarge (GPU inference).


# Scalability
What's missing for real scale:
A job queue (BullMQ/Redis) sitting between the backend and ML services is the single most important missing piece. It would let you control concurrency, retry failed jobs, and scale ML workers independently. Without it, this architecture handles maybe 5–10 concurrent users gracefully before degrading.



# Current Projects and what maven does different
Here's a thorough breakdown of the competitive landscape and how MAVEN stands apart:

---

## The Competitors

**Enterprise/Commercial:**

**Reality Defender** uses an ensemble of hundreds of simultaneous platform-agnostic techniques and is recognized by Gartner as the leading deepfake detection company. It's enterprise-first, targeting banks, governments, and media companies.

*Sensity AI* takes a multi-layered approach analyzing visuals, file structure, metadata, and audio signals, delivering forensic-grade reports designed for judicial and government environments.

**DuckDuckGoose** claims ~96% accuracy with sub-second analysis time and offers both real-time video and audio detection via DeepDetector and Waver tools.

**Intel's FakeCatcher** uses rPPG (the same blood-flow signal MAVEN uses) but runs it at the hardware level in real-time on live video streams.

**Deepware Scanner** analyzes face distortions in video but doesn't analyze audio tracks at all — single-modal only.

---

## What MAVEN Does Differently

**1. Full forensic transparency, not a black box**
Every competitor gives you a score or a verdict. MAVEN gives you *why* — a radar chart breaking down FFT, liveness, and lip-sync scores independently, a visual sync timeline showing *exactly* which seconds are out of sync, and an FFT heatmap. No commercial tool exposes this level of per-layer explainability to the end user.

**2. Three fundamentally different signal types fused together**
Most tools use visual artifact detection only, or visual + audio. MAVEN uniquely combines three orthogonal forensic signals — frequency-domain artifacts (FFT), physiological signals (rPPG heartbeat + blink patterns), and audio-visual synchronization (Wav2Lip). A deepfake would have to fool all three simultaneously to slip through.

**3. rPPG as a first-class detection layer**
Intel's FakeCatcher pioneered this, but it's a proprietary hardware solution. MAVEN implements CHROM-based rPPG in open-source Python, making it one of the very few open, accessible implementations of heartbeat-based liveness detection for deepfake forensics.

**4. Open, self-hostable, and free**
Enterprise-first pricing and architecture of tools like Reality Defender may not suit small startups, journalists, researchers, or individuals. MAVEN is fully open-source and self-hostable — you own your data, nothing leaves your infrastructure.

**5. Capstone-grade technical depth vs. API wrappers**
Most newer "detection tools" are wrappers around third-party APIs. MAVEN trains its own EfficientNet-B0 on FFT spectra, implements CHROM rPPG from the original 2013 paper, and fine-tunes Wav2Lip's sync discriminator — it's genuinely building the science, not consuming it.

---

**The honest gap:** MAVEN can't match the dataset scale, model ensembles, or real-time processing of Reality Defender or Sensity AI. But for a capstone project with full source transparency and three-layer forensic explainability, it's doing something none of the commercial tools bother to do — showing its work.
