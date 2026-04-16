import { useState, useCallback } from 'react';
import { analysisApi } from '../services/api';

/**
 * Hook for submitting a video and tracking upload progress.
 *
 * Returns:
 *   submit(file) → Promise<{ jobId }>
 *   progress     : number 0-100
 *   uploading    : boolean
 *   error        : string | null
 */
export function useAnalysis() {
  const [progress,  setProgress]  = useState(0);
  const [uploading, setUploading] = useState(false);
  const [error,     setError]     = useState(null);

  const submit = useCallback(async (file) => {
    setError(null);
    setProgress(0);
    setUploading(true);

    try {
      const { data } = await analysisApi.submitVideo(file, (evt) => {
        if (evt.total) {
          setProgress(Math.round((evt.loaded / evt.total) * 100));
        }
      });
      return { jobId: data.jobId };
    } catch (err) {
      const msg = err.response?.data?.message || err.message || 'Upload failed';
      setError(msg);
      throw new Error(msg);
    } finally {
      setUploading(false);
    }
  }, []);

  const reset = useCallback(() => {
    setProgress(0);
    setError(null);
  }, []);

  return { submit, progress, uploading, error, reset };
}
