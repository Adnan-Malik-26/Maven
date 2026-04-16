import React, { useCallback, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const ACCEPTED_TYPES  = ['video/mp4', 'video/webm', 'video/quicktime', 'video/avi', 'video/x-matroska'];
const MAX_SIZE_MB     = 500;
const MAX_SIZE_BYTES  = MAX_SIZE_MB * 1024 * 1024;

function prettySize(bytes) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function DropZone({ onFile, disabled = false }) {
  const [isDragging, setIsDragging] = useState(false);
  const [error,      setError]      = useState(null);
  const [preview,    setPreview]    = useState(null); // { name, size, type }

  const validate = (file) => {
    if (!ACCEPTED_TYPES.includes(file.type)) {
      return `File type "${file.type}" is not supported. Please upload an MP4, WebM, MOV, or MKV.`;
    }
    if (file.size > MAX_SIZE_BYTES) {
      return `File is too large (${prettySize(file.size)}). Maximum size is ${MAX_SIZE_MB} MB.`;
    }
    return null;
  };

  const handleFile = useCallback((file) => {
    const err = validate(file);
    if (err) { setError(err); setPreview(null); return; }
    setError(null);
    setPreview({ name: file.name, size: file.size, type: file.type });
    onFile(file);
  }, [onFile]);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setIsDragging(false);
    if (disabled) return;
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }, [disabled, handleFile]);

  const handleDragOver = (e) => { e.preventDefault(); if (!disabled) setIsDragging(true); };
  const handleDragLeave = () => setIsDragging(false);

  const handleInputChange = (e) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  const clearPreview = (e) => {
    e.stopPropagation();
    setPreview(null);
    setError(null);
    onFile(null);
  };

  return (
    <div>
      <label
        htmlFor="video-upload"
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={`relative flex flex-col items-center justify-center rounded-2xl border-2 border-dashed p-12 cursor-pointer transition-all duration-300 ${
          disabled
            ? 'opacity-40 cursor-not-allowed border-white/10'
            : isDragging
            ? 'border-brand-500 bg-brand-500/8 scale-[1.01]'
            : preview
            ? 'border-emerald-500/40 bg-emerald-500/5'
            : 'border-white/10 hover:border-brand-500/50 hover:bg-brand-500/5'
        }`}
        style={{ minHeight: 260 }}
      >
        <input
          id="video-upload"
          type="file"
          accept={ACCEPTED_TYPES.join(',')}
          className="hidden"
          onChange={handleInputChange}
          disabled={disabled}
        />

        <AnimatePresence mode="wait">
          {preview ? (
            /* ── File selected state ── */
            <motion.div
              key="preview"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="flex flex-col items-center gap-4 text-center"
            >
              <div
                className="w-16 h-16 rounded-2xl flex items-center justify-center"
                style={{ background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.3)' }}
              >
                <svg className="w-8 h-8 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M15 10l4.553-2.069A1 1 0 0121 8.82V15.18a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              </div>
              <div>
                <p className="text-slate-100 font-semibold truncate max-w-xs">{preview.name}</p>
                <p className="text-slate-500 text-sm mt-0.5">{prettySize(preview.size)}</p>
              </div>
              <button
                type="button"
                onClick={clearPreview}
                className="text-xs text-slate-500 hover:text-slate-300 underline transition-colors"
              >
                Choose a different file
              </button>
            </motion.div>
          ) : (
            /* ── Empty state ── */
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center gap-5 text-center"
            >
              {/* Animated upload icon */}
              <motion.div
                animate={{ y: [0, -6, 0] }}
                transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
                className="relative"
              >
                <div
                  className="w-20 h-20 rounded-3xl flex items-center justify-center"
                  style={{ background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.2)' }}
                >
                  <svg className="w-10 h-10 text-brand-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                      d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                </div>
                {isDragging && (
                  <motion.div
                    layoutId="dragRing"
                    className="absolute inset-0 rounded-3xl border-2 border-brand-500"
                    animate={{ scale: [1, 1.1, 1], opacity: [1, 0.5, 1] }}
                    transition={{ duration: 1, repeat: Infinity }}
                  />
                )}
              </motion.div>

              <div>
                <p className="text-slate-200 font-semibold text-lg">
                  {isDragging ? 'Drop your video here' : 'Drop a video file here'}
                </p>
                <p className="text-slate-500 text-sm mt-1">
                  or <span className="text-brand-400 hover:text-brand-300 transition-colors">click to browse</span>
                </p>
              </div>

              <div
                className="flex flex-wrap justify-center gap-2 text-xs text-slate-600"
              >
                {['MP4', 'WebM', 'MOV', 'MKV', 'AVI'].map((ext) => (
                  <span
                    key={ext}
                    className="px-2 py-0.5 rounded-md"
                    style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}
                  >
                    .{ext.toLowerCase()}
                  </span>
                ))}
                <span className="text-slate-700">· Max {MAX_SIZE_MB} MB</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </label>

      {/* Error message */}
      <AnimatePresence>
        {error && (
          <motion.p
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="mt-3 text-sm text-red-400 flex items-center gap-2"
          >
            <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {error}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}
