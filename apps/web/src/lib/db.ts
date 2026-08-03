import Dexie, { type Table } from 'dexie'
import { type CartItem } from '../store/useCartStore'

export interface OfflineOrder {
    id?: number
    party_id: number
    party_name: string
    items: CartItem[]
    discountType: 'NONE' | 'PRODUCT' | 'OVERALL'
    overallDiscountPct: number
    notes: string
    created_at: string
    synced: number // 0 = pending sync, 1 = synced
}

export class TejasOfflineDatabase extends Dexie {
    offline_orders!: Table<OfflineOrder>

    constructor() {
        super('tejas_offline_db')
        this.version(1).stores({
            offline_orders: '++id, party_id, synced, created_at'
        })
    }
}

export const db = new TejasOfflineDatabase()
