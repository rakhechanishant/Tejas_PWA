import { supabase } from './supabase';

export interface BillingConfig {
    prefix: 'BILL' | 'INV' | 'DN' | 'CN';
    year: number;
}

export class BillingService {
    private static KEY_PREFIX = 'tejas_seq_';

    /**
     * Retrieves or initializes the next seed index from local storage.
     */
    private static getNextSequenceIndex(config: BillingConfig): number {
        const key = `${this.KEY_PREFIX}${config.prefix}_${config.year}`;
        const stored = localStorage.getItem(key);
        const nextIdx = stored ? parseInt(stored, 10) + 1 : 1;
        localStorage.setItem(key, nextIdx.toString());
        return nextIdx;
    }

    /**
     * Rollback the sequence if a transaction fails.
     */
    public static rollbackSequence(config: BillingConfig): void {
        const key = `${this.KEY_PREFIX}${config.prefix}_${config.year}`;
        const stored = localStorage.getItem(key);
        if (stored) {
            const current = parseInt(stored, 10);
            if (current > 0) {
                localStorage.setItem(key, (current - 1).toString());
            }
        }
    }

    /**
     * Generates a unique Bill Number.
     * Format: BILL-YYYY-NNN (e.g. BILL-2026-001)
     */
    public static async generateBillNumber(year: number = 2026): Promise<string> {
        let attempts = 0;
        while (attempts < 10) {
            const sequence = this.getNextSequenceIndex({ prefix: 'BILL', year });
            const paddedSequence = String(sequence).padStart(3, '0');
            const billNumber = `BILL-${year}-${paddedSequence}`;

            // Check if bill_number already exists in orders
            const { data, error } = await supabase
                .from('orders')
                .select('id')
                .eq('bill_number', billNumber)
                .maybeSingle();

            if (!error && !data) {
                return billNumber;
            }
            attempts++;
        }
        throw new Error('Collision Limit reached: Check sequence count or database entries.');
    }

    /**
     * Generates a unique Invoice Number.
     * Format: INV-YYYY-NNN (e.g. INV-2026-001)
     */
    public static async generateInvoiceNumber(year: number = 2026): Promise<string> {
        let attempts = 0;
        while (attempts < 10) {
            const sequence = this.getNextSequenceIndex({ prefix: 'INV', year });
            const paddedSequence = String(sequence).padStart(3, '0');
            const invoiceNumber = `INV-${year}-${paddedSequence}`;

            // Check if invoice_number already exists in orders
            const { data, error } = await supabase
                .from('orders')
                .select('id')
                .eq('invoice_number', invoiceNumber)
                .maybeSingle();

            if (!error && !data) {
                return invoiceNumber;
            }
            attempts++;
        }
        throw new Error('Collision Limit reached: Check sequence count or database entries.');
    }
}
