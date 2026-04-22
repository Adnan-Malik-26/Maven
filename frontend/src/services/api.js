import axios from 'axios'
import { supabase } from '../lib/supabaseClient'

const API = axios.create({
  baseURL: import.meta.env.VITE_BACKEND_URL,
})

API.interceptors.request.use(async (config) => {
  const { data: { session } } = await supabase.auth.getSession()
  if (session?.access_token) {
    config.headers.Authorization = `Bearer ${session.access_token}`
  }
  return config
})

export const submitVideo = (formData, onProgress) =>
  API.post('/api/analysis/submit', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress: (e) => {
      if (onProgress && e.total) {
        onProgress(Math.round((e.loaded / e.total) * 100))
      }
    },
  })

export const getJobs   = ()      => API.get('/api/analysis/jobs')
export const getJob    = (id)    => API.get(`/api/analysis/jobs/${id}`)
export const getResult = (jobId) => API.get(`/api/results/${jobId}`)
export const deleteJob = (id)    => API.delete(`/api/analysis/jobs/${id}`)

export default API
