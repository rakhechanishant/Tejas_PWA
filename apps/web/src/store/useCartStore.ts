import { create } from 'zustand'

export interface Party {
    id: number
    party_code: string
    name: string
    phone: string | null
    pan: string | null
    address: string | null
    contact_person: string | null
    designation: string | null
    party_type: string | null
    province: string | null
    district: string | null
    city: string | null
    sales_person: string | null
    credit_limit: number
    total_due: number
    is_active: boolean
}

export interface Product {
    id: number
    ref_code: string | null
    product_name: string
    category: string | null
    sub_category: string | null
    specification: string | null
    mrp: number | null
    packing_pcs: number | null
    packing_bx: number | null
    packing_car: number | null
    series: string | null
    company: string | null
    image_url: string | null
    unit: string
    is_active: boolean
}

export interface CartItem {
    product: Product
    quantity: number
    discountPct?: number // product-wise discount percentage (0-100)
}

interface CartState {
    selectedParty: Party | null
    items: CartItem[]
    discountType: 'NONE' | 'PRODUCT' | 'OVERALL'
    overallDiscountPct: number
    setParty: (party: Party | null) => void
    addItem: (product: Product, quantity?: number) => void
    removeItem: (productId: number) => void
    updateQuantity: (productId: number, quantity: number) => void
    updateDiscount: (productId: number, discountPct: number) => void
    setDiscountType: (type: 'NONE' | 'PRODUCT' | 'OVERALL') => void
    setOverallDiscountPct: (pct: number) => void
    clearCart: () => void
    getTotals: () => {
        subtotal: number
        itemDiscounts: number
        overallDiscount: number
        totalItems: number
        finalTotal: number
    }
}

export const useCartStore = create<CartState>((set, get) => ({
    selectedParty: null,
    items: [],
    discountType: 'NONE',
    overallDiscountPct: 0,

    setParty: (party) => set({ selectedParty: party }),

    addItem: (product, quantity = 1) => {
        const currentItems = get().items
        const existingItem = currentItems.find((item) => item.product.id === product.id)

        if (existingItem) {
            set({
                items: currentItems.map((item) =>
                    item.product.id === product.id
                        ? { ...item, quantity: item.quantity + quantity }
                        : item
                ),
            })
        } else {
            set({ items: [...currentItems, { product, quantity, discountPct: 0 }] })
        }
    },

    removeItem: (productId) => {
        set({
            items: get().items.filter((item) => item.product.id !== productId),
        })
    },

    updateQuantity: (productId, quantity) => {
        if (quantity <= 0) {
            get().removeItem(productId)
            return
        }
        set({
            items: get().items.map((item) =>
                item.product.id === productId ? { ...item, quantity } : item
            ),
        })
    },

    updateDiscount: (productId, discountPct) => {
        set({
            items: get().items.map((item) =>
                item.product.id === productId
                    ? { ...item, discountPct: Math.max(0, Math.min(100, discountPct)) }
                    : item
            ),
        })
    },

    setDiscountType: (type) => set({ discountType: type }),

    setOverallDiscountPct: (pct) => set({ overallDiscountPct: Math.max(0, Math.min(100, pct)) }),

    clearCart: () => set({ selectedParty: null, items: [], discountType: 'NONE', overallDiscountPct: 0 }),

    getTotals: () => {
        const items = get().items
        const discountType = get().discountType
        const overallDiscountPct = get().overallDiscountPct

        const totalItems = items.reduce((sum, item) => sum + item.quantity, 0)

        // Base value: sum of all items quantity * mrp
        const subtotal = items.reduce((sum, item) => sum + (item.product.mrp || 0) * item.quantity, 0)

        let itemDiscounts = 0
        let overallDiscount = 0
        let finalTotal = subtotal

        if (discountType === 'PRODUCT') {
            itemDiscounts = items.reduce((sum, item) => {
                const pct = item.discountPct || 0
                return sum + (item.product.mrp || 0) * item.quantity * (pct / 100)
            }, 0)
            finalTotal = subtotal - itemDiscounts
        } else if (discountType === 'OVERALL') {
            overallDiscount = subtotal * (overallDiscountPct / 100)
            finalTotal = subtotal - overallDiscount
        }

        // Avoid floating precision issues
        return {
            subtotal: Math.round(subtotal * 100) / 100,
            itemDiscounts: Math.round(itemDiscounts * 100) / 100,
            overallDiscount: Math.round(overallDiscount * 100) / 100,
            totalItems,
            finalTotal: Math.round(finalTotal * 100) / 100
        }
    },
}))
