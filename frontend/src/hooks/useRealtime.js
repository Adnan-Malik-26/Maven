import { useEffect, useRef } from 'react';
import { supabase } from '../lib/supabaseClient';

/**
 * Subscribe to real-time updates for a specific analysis job.
 *
 * @param {string|null} jobId     - The job UUID to watch (unsubscribes when null)
 * @param {Function}    onUpdate  - Callback called with the updated row
 */
export function useRealtime(jobId, onUpdate) {
  const cbRef = useRef(onUpdate);
  useEffect(() => { cbRef.current = onUpdate; }, [onUpdate]);

  useEffect(() => {
    if (!jobId) return;

    const channel = supabase
      .channel(`job-${jobId}`)
      .on(
        'postgres_changes',
        {
          event:  '*',
          schema: 'public',
          table:  'analysis_jobs',
          filter: `id=eq.${jobId}`,
        },
        (payload) => {
          cbRef.current?.(payload.new);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [jobId]);
}

/**
 * Subscribe to all of a user's jobs (for the dashboard).
 *
 * @param {string|null} userId   - The authenticated user's UUID
 * @param {Function}    onUpdate - Callback called with the updated row
 */
export function useRealtimeDashboard(userId, onUpdate) {
  const cbRef = useRef(onUpdate);
  useEffect(() => { cbRef.current = onUpdate; }, [onUpdate]);

  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel(`dashboard-${userId}`)
      .on(
        'postgres_changes',
        {
          event:  '*',
          schema: 'public',
          table:  'analysis_jobs',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          cbRef.current?.(payload.new);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);
}
