import { useAuthStore } from '../store/authStore'

const BASE = import.meta.env.VITE_API_BASE_URL

async function request(method, path, body = null) {
  const token = useAuthStore.getState().idToken
  const headers = { 'Content-Type': 'application/json' }
  if (token) headers['Authorization'] = `Bearer ${token}`

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })

  // API Gateway + Cognito returns 401 on missing/invalid token, 403 on expired
  // or denied. Treat both as "log them out and send to /login" — only matters
  // for /admin/* calls (public endpoints don't require auth and won't 401/403).
  if ((res.status === 401 || res.status === 403) && path.startsWith('/admin')) {
    useAuthStore.getState().logout()
    sessionStorage.setItem('mx_session_expired', '1')
    window.location.href = '/login'
    throw new Error('Session expired')
  }

  const data = await res.json().catch(() => ({}))

  if (!res.ok) {
    throw new Error(data.error || `Request failed: ${res.status}`)
  }

  return data
}

export const api = {
  get:    (path)        => request('GET',    path),
  post:   (path, body)  => request('POST',   path, body),
  put:    (path, body)  => request('PUT',    path, body),
  patch:  (path, body)  => request('PATCH',  path, body),
  delete: (path)        => request('DELETE', path),
}
