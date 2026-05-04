const BASE = import.meta.env.VITE_API_BASE_URL

async function req(path) {
  const res = await fetch(`${BASE}${path}`)
  if (!res.ok) throw new Error(`Request failed: ${res.status}`)
  return res.json()
}

async function post(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `Request failed: ${res.status}`)
  return data
}

export const getBikes       = (params = {}) => req('/bikes?' + new URLSearchParams(params))
export const getBike        = (id)           => req(`/bikes/${id}`)
export const getCategories  = ()             => req('/categories')
export const getSizes       = ()             => req('/sizes')
export const getShippingRates = ()           => req('/shipping-rates')
export const createOrder    = (body)         => post('/checkout', body)
export const lookupOrder    = (email, num)   =>
  req(`/orders?email=${encodeURIComponent(email)}&order_number=${encodeURIComponent(num)}`)
