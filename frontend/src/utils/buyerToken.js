// Anonymous browser-side identity for the checkout flow.
// Used by the backend to recognize "this same buyer is back" — independent of
// what email they enter. Generated once per browser, persists forever in
// localStorage. Clearing storage just gets you a new token (and forfeits the
// ability to reclaim a prior reservation, which the soft TTL releases anyway).

const KEY = 'machx_buyer_token'

export function getBuyerToken() {
  let t
  try {
    t = localStorage.getItem(KEY)
  } catch {
    return ''  // localStorage blocked (private mode, etc.) — fall back to anon
  }
  if (!t) {
    t = (typeof crypto !== 'undefined' && crypto.randomUUID)
      ? crypto.randomUUID()
      : (Date.now().toString(36) + Math.random().toString(36).slice(2, 12))
    try { localStorage.setItem(KEY, t) } catch { /* ignore */ }
  }
  return t
}
