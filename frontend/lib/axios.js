import axios from 'axios'
import { getApiBaseUrl } from './apiConfig'
import { clearStoredAuthSession } from './authSession'
import { getUnauthorizedDestination } from './authPolicy'

const api = axios.create({
  baseURL: getApiBaseUrl(),
  timeout: 15000,
  withCredentials: true,
})

// Global error handler
api.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error.response?.status === 401) {
      if (typeof window !== 'undefined') {
        clearStoredAuthSession()
        window.location.href = getUnauthorizedDestination(window.location.pathname)
      }
    }
    return Promise.reject(error)
  }
)

export default api
