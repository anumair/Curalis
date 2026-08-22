import axios from 'axios'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000'

export const api = axios.create({
  baseURL: `${API_BASE_URL}/api`,
  withCredentials: true, // refresh token travels as an httpOnly cookie
})

let accessToken = null
export function setAccessToken(token) {
  accessToken = token
}

api.interceptors.request.use((config) => {
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`
  }
  return config
})

// On a 401, try exactly one silent refresh, then replay the original
// request. Concurrent 401s share the same in-flight refresh so a burst of
// requests doesn't fire the refresh endpoint multiple times.
let refreshPromise = null

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config
    if (error.response?.status !== 401 || original._retry) {
      return Promise.reject(error)
    }
    original._retry = true

    refreshPromise ??= api
      .post('/auth/refresh')
      .then((res) => {
        setAccessToken(res.data.accessToken)
        return res.data.accessToken
      })
      .finally(() => {
        refreshPromise = null
      })

    try {
      const token = await refreshPromise
      original.headers.Authorization = `Bearer ${token}`
      return api(original)
    } catch (refreshError) {
      setAccessToken(null)
      return Promise.reject(refreshError)
    }
  }
)
