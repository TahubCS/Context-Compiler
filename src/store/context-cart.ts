import { create } from "zustand"
import { persist } from "zustand/middleware"

export type CartItem = {
  id: string
  repositoryId: string
  filePath: string
  chunkIndex: number
  language: string | null
  content: string
  score: number
}

type ContextCartStore = {
  items: CartItem[]
  add: (item: CartItem) => void
  remove: (id: string) => void
  clear: () => void
  has: (id: string) => boolean
}

export const useContextCart = create<ContextCartStore>()(
  persist(
    (set, get) => ({
      items: [],
      add: (item) =>
        set((state) => {
          if (state.items.some((i) => i.id === item.id)) return state
          return { items: [...state.items, item] }
        }),
      remove: (id) => set((state) => ({ items: state.items.filter((i) => i.id !== id) })),
      clear: () => set({ items: [] }),
      has: (id) => get().items.some((i) => i.id === id),
    }),
    { name: "context-cart" }
  )
)
