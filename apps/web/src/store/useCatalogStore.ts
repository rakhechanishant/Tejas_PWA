import { create } from 'zustand'
import { supabase } from '../lib/supabase'
import type { Product } from './useCartStore'

interface CatalogState {
    products: Product[]
    loading: boolean
    fetched: boolean
    error: string | null
    fetchProducts: (force?: boolean) => Promise<void>
}

export const useCatalogStore = create<CatalogState>((set, get) => ({
    products: [],
    loading: false,
    fetched: false,
    error: null,
    fetchProducts: async (force = false) => {
        if (get().fetched && !force) return

        set({ loading: true, error: null })
        try {
            const { data, error } = await supabase
                .from('products')
                .select('*')
                .eq('is_active', true)
                .order('product_name', { ascending: true })

            if (error) throw error
            set({ products: data || [], fetched: true })
        } catch (err: any) {
            console.error('Catalog fetch error:', err)
            set({ error: err.message || 'Failed to fetch catalog.' })
        } finally {
            set({ loading: false })
        }
    }
}))
