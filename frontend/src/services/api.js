import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

const api = axios.create({
  baseURL: API_BASE,
  timeout: 30_000,
});

// ── Request interceptor: attach Bearer token ──────────────────────────────
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('maven_access_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// ── Response interceptor: handle 401 globally ─────────────────────────────
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.clear();
      window.location.href = '/auth';
    }
    return Promise.reject(error);
  }
);

// ─────────────────────────────────────────────────────────────────────────
// Auth
// ─────────────────────────────────────────────────────────────────────────
export const authApi = {
  signup: (email, password, firstName, lastName) =>
    api.post('/auth/signup', { email, password, firstName, lastName }),

  login: (email, password) =>
    api.post('/auth/login', { email, password }),

  logout: () =>
    api.post('/auth/logout'),

  resetPassword: (email) =>
    api.post('/auth/reset-password', { email }),

  updatePassword: (newPassword) =>
    api.post('/auth/update-password', { newPassword }),
};

// ─────────────────────────────────────────────────────────────────────────
// Analysis
// ─────────────────────────────────────────────────────────────────────────
export const analysisApi = {
  /**
   * Upload a video file and trigger analysis.
   * @param {File}      file       - The video file to analyse
   * @param {Function}  onProgress - Axios upload progress callback
   * @returns {Promise<{ jobId: string }>}
   */
  submitVideo: (file, onProgress) => {
    const form = new FormData();
    form.append('video', file);
    return api.post('/analysis/submit', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: onProgress,
      timeout: 120_000, // 2 min for large uploads
    });
  },
};

export default api;
