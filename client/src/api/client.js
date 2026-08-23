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

// Refresh tokens are single-use and rotated server-side: presenting the
// same one twice revokes *all* of the user's sessions as a reuse-attack
// defense. So every caller (a 401 retry here, AuthContext's mount-time
// restore, React StrictMode double-invoking that effect in dev) must share
// one in-flight request rather than each firing their own.
let refreshPromise = null

export function silentRefresh() {
  refreshPromise ??= api
    .post('/auth/refresh')
    .then((res) => {
      setAccessToken(res.data.accessToken)
      return res.data
    })
    .finally(() => {
      refreshPromise = null
    })
  return refreshPromise
}

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config
    const isRefreshCall = original?.url?.includes('/auth/refresh')
    if (error.response?.status !== 401 || original._retry || isRefreshCall) {
      return Promise.reject(error)
    }
    original._retry = true

    try {
      const { accessToken: token } = await silentRefresh()
      original.headers.Authorization = `Bearer ${token}`
      return api(original)
    } catch (refreshError) {
      setAccessToken(null)
      return Promise.reject(refreshError)
    }
  }
)
