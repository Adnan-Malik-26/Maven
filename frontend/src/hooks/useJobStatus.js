import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

export function useJobStatus(jobId) {
  const [status, setStatus] = useState('PROCESSING')

  useEffect(() => {
    if (!jobId) return

    // Fetch current status immediately
    supabase
      .from('analysis_jobs')
      .select('status')
      .eq('id', jobId)
      .single()
      .then(({ data }) => {
        if (data) setStatus(data.status)
      })

    // Subscribe to real-time updates
    const channel = supabase
      .channel(`job-status-${jobId}`)
      .on(
        'postgres_changes',
        {
          event:  'UPDATE',
          schema: 'public',
          table:  'analysis_jobs',
          filter: `id=eq.${jobId}`,
        },
        (payload) => {
          setStatus(payload.new.status)
        }
      )
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [jobId])

  return status
}
