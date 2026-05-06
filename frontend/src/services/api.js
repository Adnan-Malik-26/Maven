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

export const getJobs = async () => {
  const response = await API.get('/api/analysis/jobs')
  return response.data?.jobs ?? response.data?.data ?? []
}

export const getJob = async (id) => {
  const response = await API.get(`/api/analysis/jobs/${id}`)
  return response.data?.job ?? response.data?.result ?? response.data
}

export const getResult = async (jobId) => {
  const response = await API.get(`/api/results/${jobId}`)
  return response.data?.result ?? response.data
}

export const deleteJob = (id)    => API.delete(`/api/analysis/jobs/${id}`)

export default API
