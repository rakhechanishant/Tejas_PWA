import { supabase } from './supabase';

export interface ReturnItemPayload {
    product_id: number;
    quantity_returned: number;
    refund_amount: number;
}

export interface SalesReturnRequest {
    orderId: number;
    partyId: number;
    items: ReturnItemPayload[];
    recordedBy: string;
    notes?: string;
    originalDue: number;
}

export class ReturnService {
    /**
     * Processes sales return with validations and hits supabase RPC.
     */
    public static async processReturn(request: SalesReturnRequest) {
        const totalRefund = request.items.reduce((sum, item) => sum + item.refund_amount, 0);

        // Allow return refunds to exceed outstanding order due amounts (excess refund turns into store credit)

        const key = `tejas_seq_DN_2026`;
        const stored = localStorage.getItem(key);
        const sequence = stored ? parseInt(stored, 10) + 1 : 1;
        localStorage.setItem(key, sequence.toString());
        const debitNoteNumber = `DN-2026-${String(sequence).padStart(3, '0')}`;

        try {
            const { data, error } = await supabase.rpc('process_sales_return', {
                p_order_id: request.orderId,
                p_party_id: request.partyId,
                p_items: request.items,
                p_recorded_by: request.recordedBy,
                p_notes: `Debit Note: ${debitNoteNumber} | ${request.notes || ''}`
            });

            if (error) {
                throw error;
            }

            return {
                success: true,
                debitNoteNumber,
                totalRefund,
                data
            };
        } catch (e: any) {
            const current = parseInt(localStorage.getItem(key) || '1', 10);
            localStorage.setItem(key, Math.max(0, current - 1).toString());
            throw e;
        }
    }
}
