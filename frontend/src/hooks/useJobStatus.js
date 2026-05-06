import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import API from '../services/api'

export function useJobStatus(jobId) {
  const [status, setStatus] = useState('PROCESSING')

  useEffect(() => {
    if (!jobId) return
    let stopped = false

    const fetchStatus = async () => {
      try {
        const response = await API.get(`/api/analysis/jobs/${jobId}/status`)

        if (stopped) return

        if (response.data?.job?.status) {
          setStatus(response.data.job.status)
        }
      } catch (error) {
        console.error(error)
      }
    }

    // Fetch current status immediately
    fetchStatus()

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

    const pollId = setInterval(fetchStatus, 3000)

    return () => {
      stopped = true
      clearInterval(pollId)
      supabase.removeChannel(channel)
    }
  }, [jobId])

  return status
}
