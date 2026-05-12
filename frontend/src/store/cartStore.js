import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// Each bike is 1-of-1 — there's no concept of buying two of the same bike,
// so quantity is always 1 and the dedupe key is bikeId. The legacy variantId
// field is kept on items so old persisted carts still work, but it's never
// used as a key.

export const useCartStore = create(
  persist(
    (set, get) => ({
      items: [], // [{ bikeId, bikeName, price, imageUrl, quantity: 1 }]

      addItem: (item) => set(state => {
        const key = item.bikeId
        if (!key) return state  // refuse malformed items
        const existing = state.items.find(i => i.bikeId === key)
        // 1-of-1: if already in cart, no-op (quantity stays at 1).
        if (existing) return state
        return { items: [...state.items, { ...item, quantity: 1 }] }
      }),

      removeItem: (bikeId) => set(state => ({ items: state.items.filter(i => i.bikeId !== bikeId) })),

      // Kept for API compatibility, but quantity is always 1 for 1-of-1 bikes.
      // qty <= 0 still removes; anything else is clamped to 1.
      updateQuantity: (bikeId, qty) => set(state => {
        if (qty <= 0) return { items: state.items.filter(i => i.bikeId !== bikeId) }
        return { items: state.items.map(i => i.bikeId === bikeId ? { ...i, quantity: 1 } : i) }
      }),

      isInCart: (bikeId) => get().items.some(i => i.bikeId === bikeId),

      clearCart: () => set({ items: [] }),
    }),
    {
      name: 'machx-cart',
      version: 2,
      // v1 persisted carts dedup'd by variantId. v2 uses bikeId. Migrate by
      // dropping any item without a bikeId (they were variant-shaped legacy
      // items that won't checkout anyway).
      migrate: (persisted, _version) => {
        if (!persisted) return persisted
        return {
          ...persisted,
          items: (persisted.items || [])
            .filter(i => i && i.bikeId)
            .map(i => ({ ...i, quantity: 1 })),
        }
      },
    }
  )
)

// Selectors (use in components)
export const selectItemCount = s => s.items.reduce((sum, i) => sum + i.quantity, 0)
export const selectSubtotal  = s => s.items.reduce((sum, i) => sum + i.price * i.quantity, 0)
