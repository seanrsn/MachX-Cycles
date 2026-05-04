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

  if (res.status === 401) {
    useAuthStore.getState().logout()
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
