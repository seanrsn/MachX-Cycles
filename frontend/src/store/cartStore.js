import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export const useCartStore = create(
  persist(
    (set, get) => ({
      items: [], // [{ variantId, bikeId, bikeName, variantLabel, price, imageUrl, quantity }]

      addItem: (item) => set(state => {
        const existing = state.items.find(i => i.variantId === item.variantId)
        if (existing) {
          return { items: state.items.map(i => i.variantId === item.variantId ? { ...i, quantity: i.quantity + (item.quantity || 1) } : i) }
        }
        return { items: [...state.items, { ...item, quantity: item.quantity || 1 }] }
      }),

      removeItem: (variantId) => set(state => ({ items: state.items.filter(i => i.variantId !== variantId) })),

      updateQuantity: (variantId, qty) => set(state => {
        if (qty <= 0) return { items: state.items.filter(i => i.variantId !== variantId) }
        return { items: state.items.map(i => i.variantId === variantId ? { ...i, quantity: qty } : i) }
      }),

      clearCart: () => set({ items: [] }),
    }),
    { name: 'machx-cart' }
  )
)

// Selectors (use in components)
export const selectItemCount = s => s.items.reduce((sum, i) => sum + i.quantity, 0)
export const selectSubtotal  = s => s.items.reduce((sum, i) => sum + i.price * i.quantity, 0)
