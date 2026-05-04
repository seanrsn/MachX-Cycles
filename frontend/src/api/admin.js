import { api } from './client'

// ── Dashboard ─────────────────────────────────────────────────────────────────
export const getDashboard = () => api.get('/admin/dashboard')

// ── Settings ──────────────────────────────────────────────────────────────────
export const getSettings    = ()      => api.get('/admin/settings')
export const updateSettings = (body)  => api.put('/admin/settings', body)

// ── Bikes ─────────────────────────────────────────────────────────────────────
export const getBikes  = (params = {}) => api.get('/admin/bikes?' + new URLSearchParams(params))
export const getBike   = (id)          => api.get(`/admin/bikes/${id}`)
export const createBike = (body)       => api.post('/admin/bikes', body)
export const updateBike = (id, body)   => api.put(`/admin/bikes/${id}`, body)
export const deleteBike = (id)         => api.delete(`/admin/bikes/${id}`)

// ── Images ────────────────────────────────────────────────────────────────────
export const getUploadUrl  = (bikeId, body)   => api.post(`/admin/bikes/${bikeId}/images`, body)
export const deleteImage   = (bikeId, imgId)  => api.delete(`/admin/bikes/${bikeId}/images/${imgId}`)

// ── Orders ────────────────────────────────────────────────────────────────────
export const getOrders  = (params = {}) => api.get('/admin/orders?' + new URLSearchParams(params))
export const getOrder   = (id)          => api.get(`/admin/orders/${id}`)
export const updateOrder = (id, body)   => api.patch(`/admin/orders/${id}`, body)

// ── Promotions ────────────────────────────────────────────────────────────────
export const getPromotions    = ()        => api.get('/admin/promotions')
export const createPromotion  = (body)    => api.post('/admin/promotions', body)
export const updatePromotion  = (id, body)=> api.put(`/admin/promotions/${id}`, body)
export const deletePromotion  = (id)      => api.delete(`/admin/promotions/${id}`)
