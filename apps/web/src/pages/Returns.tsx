import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import {
    Search,
    Undo2,
    Calendar,
    Printer,
    AlertCircle,
    Info,
    X,
    FileText
} from 'lucide-react'

interface ReturnItem {
    id: number
    product_id: number
    quantity_returned: number
    refund_amount: number
    products?: {
        product_name: string
        ref_code: string
    }
}

interface SalesReturn {
    id: number
    order_id: number
    party_id: number
    total_refund: number
    status: string
    notes: string | null
    created_by: string
    created_at: string
    parties?: {
        Parties_name: string
        contact_number?: string
        city?: string
    }
    orders?: {
        order_number: string
        total_amount: number
    }
    profiles?: {
        name: string
    }
    return_items?: ReturnItem[]
}

export const Returns: React.FC = () => {
    const [returnsList, setReturnsList] = useState<SalesReturn[]>([])
    const [searchQuery, setSearchQuery] = useState('')
    const [loading, setLoading] = useState(true)
    const [errorMsg, setErrorMsg] = useState('')
    const [selectedReturn, setSelectedReturn] = useState<SalesReturn | null>(null)
    const [detailedLoading, setDetailedLoading] = useState(false)

    useEffect(() => {
        fetchReturns()
    }, [])

    const fetchReturns = async () => {
        setLoading(true)
        setErrorMsg('')
        try {
            const { data, error } = await supabase
                .from('returns')
                .select(`
                    *,
                    parties ( Parties_name, contact_number, city ),
                    orders ( order_number, total_amount ),
                    profiles:created_by ( name )
                `)
                .order('created_at', { ascending: false })

            if (error) throw error
            setReturnsList(data || [])
        } catch (err: any) {
            console.error('Error fetching returns:', err)
            setErrorMsg('Failed to load returns list. ' + (err.message || ''))
        } finally {
            setLoading(false)
        }
    }

    const fetchReturnItems = async (returnObj: SalesReturn) => {
        setDetailedLoading(true)
        try {
            const { data, error } = await supabase
                .from('return_items')
                .select(`
                    id,
                    product_id,
                    quantity_returned,
                    refund_amount,
                    products ( product_name, ref_code )
                `)
                .eq('return_id', returnObj.id)

            if (error) throw error

            const mappedItems = (data || []).map((item: any) => ({
                id: item.id,
                product_id: item.product_id,
                quantity_returned: item.quantity_returned,
                refund_amount: item.refund_amount,
                products: Array.isArray(item.products) ? item.products[0] : item.products
            }))

            setSelectedReturn({
                ...returnObj,
                return_items: mappedItems
            })
        } catch (err: any) {
            console.error('Error fetching return items:', err)
            alert('Failed to load itemized details.')
        } finally {
            setDetailedLoading(false)
        }
    }

    const filteredReturns = returnsList.filter(ret => {
        const query = searchQuery.toLowerCase().trim()
        if (!query) return true

        const partyName = ret.parties?.Parties_name?.toLowerCase() || ''
        const orderNum = ret.orders?.order_number?.toLowerCase() || ''
        const returnId = `ret-${ret.id}`
        const notes = ret.notes?.toLowerCase() || ''

        return partyName.includes(query) ||
            orderNum.includes(query) ||
            returnId.includes(query) ||
            notes.includes(query)
    })

    const handlePrintDebitNote = (ret: SalesReturn) => {
        if (!ret.return_items) return

        const printWindow = window.open('', '_blank', 'width=900,height=700')
        if (printWindow) {
            const itemsHtml = ret.return_items.map(item => `
                <tr style="border-bottom: 1px solid #e2e8f0;">
                    <td style="padding: 12px; text-align: left;">
                        <span style="font-weight: 600; color: #1e293b;">${item.products?.product_name || 'Product'}</span><br/>
                        <small style="color: #64748b;">SKU: ${item.products?.ref_code || 'N/A'}</small>
                    </td>
                    <td style="padding: 12px; text-align: right; color: #334155;">${item.quantity_returned}</td>
                    <td style="padding: 12px; text-align: right; color: #0f172a; font-weight: 500;">रु ${Number(item.refund_amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                </tr>
            `).join('')

            printWindow.document.write(`
                <html>
                    <head>
                        <title>Debit Note - RET-${ret.id}</title>
                        <style>
                            body { font-family: 'Inter', system-ui, sans-serif; padding: 40px; color: #0f172a; background: #fff; margin: 0; }
                            .header { display: flex; justify-content: space-between; border-bottom: 2px solid #f1f5f9; padding-bottom: 20px; margin-bottom: 20px; }
                            .company-info h1 { margin: 0; font-size: 24px; color: #d97706; text-transform: uppercase; letter-spacing: 1px; }
                            .company-info p { margin: 4px 0; font-size: 13px; color: #475569; }
                            .note-title h2 { margin: 0; font-size: 20px; color: #1e293b; text-align: right; }
                            .note-details { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; font-size: 13px; color: #334155; margin-bottom: 30px; }
                            .note-details strong { color: #0f172a; }
                            table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
                            th { background: #f8fafc; padding: 12px; text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: #475569; border-bottom: 1px solid #e2e8f0; }
                            .totals { text-align: right; font-size: 14px; margin-top: 20px; }
                            .totals-row { display: flex; justify-content: flex-end; gap: 20px; margin-bottom: 6px; }
                            .grand-total { font-size: 18px; font-weight: 700; color: #0f172a; border-top: 2px solid #f1f5f9; padding-top: 10px; margin-top: 10px; }
                            .footer { margin-top: 60px; font-size: 11px; color: #94a3b8; text-align: center; border-top: 1px solid #f1f5f9; padding-top: 20px; }
                            @media print { body { padding: 0; } }
                        </style>
                    </head>
                    <body>
                        <div class="header">
                            <div class="company-info">
                                <h1>Tejas Impex</h1>
                                <p>Kathmandu, Nepal</p>
                                <p>Phone: +977-1-XXXXXXX | Email: info@tejasimpex.com.np</p>
                            </div>
                            <div class="note-title">
                                <h2>DEBIT NOTE</h2>
                                <p style="margin: 6px 0 0 0; font-size: 13px; color: #64748b;"><strong>Debit Note No:</strong> DN-2026-${String(ret.id).padStart(3, '0')}</p>
                                <p style="margin: 4px 0 0 0; font-size: 13px; color: #64748b;"><strong>Date:</strong> ${new Date(ret.created_at).toLocaleDateString('en-IN')}</p>
                            </div>
                        </div>

                        <div class="note-details">
                            <div>
                                <p style="margin: 0 0 8px 0; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: #64748b; font-weight: 600;">Customer Details</p>
                                <strong>${ret.parties?.Parties_name}</strong><br/>
                                ${ret.parties?.city ? `${ret.parties.city}, Nepal<br/>` : ''}
                                ${ret.parties?.contact_number ? `Phone: ${ret.parties.contact_number}` : ''}
                            </div>
                            <div style="text-align: right;">
                                <p style="margin: 0 0 8px 0; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: #64748b; font-weight: 600;">Originating Reference</p>
                                <strong>Order Number:</strong> ${ret.orders?.order_number || 'N/A'}<br/>
                                <strong>Processed By:</strong> ${ret.profiles?.name || 'Authorized Staff'}<br/>
                            </div>
                        </div>

                        <table>
                            <thead>
                                <tr>
                                    <th style="width: 60%;">Product Information</th>
                                    <th style="width: 20%; text-align: right;">Qty Returned</th>
                                    <th style="width: 20%; text-align: right;">Refund Amount</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${itemsHtml}
                            </tbody>
                        </table>

                        <div class="totals">
                            <div class="totals-row">
                                <span style="color: #64748b;">Subtotal:</span>
                                <span style="font-weight: 600; width: 120px; display: inline-block;">रु ${Number(ret.total_refund).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                            </div>
                            <div class="totals-row grand-total">
                                <span>Adjusted Total Credit:</span>
                                <span style="width: 120px; display: inline-block;">रु ${Number(ret.total_refund).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                            </div>
                        </div>

                        ${ret.notes ? `
                            <div style="margin-top: 30px; padding: 15px; background: #f8fafc; border-radius: 8px; border-left: 4px solid #cbd5e1; font-size: 12px; color: #475569;">
                                <strong>Remarks / Explanation:</strong><br/>
                                <span style="white-space: pre-wrap;">${ret.notes}</span>
                            </div>
                        ` : ''}

                        <div class="footer">
                            <p>This is a computer-generated document. No signature is required.</p>
                            <p>© 2026 Tejas Impex. All rights reserved.</p>
                        </div>
                        <script>
                            window.onload = () => {
                                window.print();
                                window.onafterprint = () => window.close();
                            };
                        </script>
                    </body>
                </html>
            `)
            printWindow.document.close()
        }
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between pb-4 border-b border-slate-900">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-slate-100 sm:text-3xl font-outfit">Returns Management</h1>
                    <p className="text-sm text-slate-400">View and track customer product returns and store credits</p>
                </div>
            </div>

            {/* Error banner */}
            {errorMsg && (
                <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-400 flex items-center gap-2">
                    <AlertCircle className="h-5 w-5 text-rose-500 shrink-0" />
                    <span>{errorMsg}</span>
                </div>
            )}

            {/* Filter Search */}
            <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
                <div className="relative w-full sm:max-w-md">
                    <span className="absolute inset-y-0 left-0 flex items-center pl-3">
                        <Search className="h-5 w-5 text-slate-500" />
                    </span>
                    <input
                        type="text"
                        placeholder="Search by customer name, order number, reference..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-205 placeholder-slate-505 focus:border-amber-500/50 focus:ring-1 focus:ring-amber-505 outline-none transition-all text-sm"
                    />
                </div>
                <button
                    onClick={fetchReturns}
                    disabled={loading}
                    className="w-full sm:w-auto px-4 py-2.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-xl text-slate-350 hover:text-white transition-colors text-sm font-semibold flex items-center justify-center gap-2"
                >
                    Reload Returns
                </button>
            </div>

            {/* Main Content List */}
            {loading ? (
                <div className="flex flex-col items-center justify-center py-20 text-slate-500 gap-3">
                    <div className="h-8 w-8 animate-spin rounded-full border-4 border-amber-500 border-t-transparent" />
                    <p className="text-sm">Loading returns history...</p>
                </div>
            ) : filteredReturns.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-800 p-12 text-center text-slate-500">
                    <Undo2 className="h-12 w-12 mx-auto mb-4 text-slate-600" />
                    <h3 className="text-base font-semibold text-slate-300">No Returns Found</h3>
                    <p className="mt-1 text-sm text-slate-550">Matches will show up here after sales returns are processed in Orders.</p>
                </div>
            ) : (
                <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-900/10">
                    <table className="w-full border-collapse text-left text-sm">
                        <thead className="bg-slate-900/60 text-slate-400 uppercase text-[10px] font-bold tracking-wider">
                            <tr>
                                <th className="px-6 py-4">Return ID</th>
                                <th className="px-6 py-4">Customer</th>
                                <th className="px-6 py-4">Order Ref</th>
                                <th className="px-6 py-4">Date</th>
                                <th className="px-6 py-4 text-right">Adjustment Credit</th>
                                <th className="px-6 py-4 text-center">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/80">
                            {filteredReturns.map((ret) => (
                                <tr key={ret.id} className="hover:bg-slate-900/40 transition-colors">
                                    <td className="px-6 py-4 font-mono text-xs text-amber-500">
                                        RET-{String(ret.id).padStart(4, '0')}
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="font-semibold text-slate-200">{ret.parties?.Parties_name}</div>
                                        <div className="text-[11px] text-slate-500">{ret.parties?.city || 'Nepal'}</div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="text-slate-300 font-medium">{ret.orders?.order_number || 'N/A'}</div>
                                    </td>
                                    <td className="px-6 py-4 text-slate-400">
                                        <div className="flex items-center gap-1.5 text-xs">
                                            <Calendar className="h-3.5 w-3.5 text-slate-500" />
                                            <span>{new Date(ret.created_at).toLocaleDateString('en-IN')}</span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-right font-medium text-emerald-400">
                                        रु {Number(ret.total_refund).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                    </td>
                                    <td className="px-6 py-4 text-center">
                                        <button
                                            onClick={() => fetchReturnItems(ret)}
                                            className="px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-slate-300 hover:text-white transition-colors text-xs font-semibold"
                                        >
                                            View Details
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Modal for Details */}
            {selectedReturn && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
                    <div className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl flex flex-col max-h-[85vh]">
                        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/20">
                            <div>
                                <h3 className="text-base font-bold text-slate-100">Sales Return Detailed View</h3>
                                <p className="text-xs text-slate-500 font-mono">RET-{String(selectedReturn.id).padStart(4, '0')}</p>
                            </div>
                            <button
                                onClick={() => setSelectedReturn(null)}
                                className="text-slate-450 hover:text-white transition-colors"
                            >
                                <X className="h-6 w-6" />
                            </button>
                        </div>

                        <div className="p-6 overflow-y-auto space-y-6">
                            {/* Metadata snippet */}
                            <div className="grid grid-cols-2 gap-4 bg-slate-950/30 p-4 rounded-xl border border-slate-800/60 text-xs">
                                <div>
                                    <p className="text-slate-500 uppercase tracking-widest text-[9px] font-bold">Party / Customer</p>
                                    <p className="mt-1 font-semibold text-slate-200">{selectedReturn.parties?.Parties_name}</p>
                                </div>
                                <div className="text-right">
                                    <p className="text-slate-500 uppercase tracking-widest text-[9px] font-bold">Originating Order</p>
                                    <p className="mt-1 font-semibold text-slate-200">{selectedReturn.orders?.order_number || 'N/A'}</p>
                                </div>
                                <div className="pt-2 border-t border-slate-800/80">
                                    <p className="text-slate-500 uppercase tracking-widest text-[9px] font-bold">Issued At</p>
                                    <p className="mt-1 font-medium text-slate-350">{new Date(selectedReturn.created_at).toLocaleString()}</p>
                                </div>
                                <div className="pt-2 border-t border-slate-800/80 text-right">
                                    <p className="text-slate-500 uppercase tracking-widest text-[9px] font-bold">Processed By</p>
                                    <p className="mt-1 font-medium text-slate-350">{selectedReturn.profiles?.name || 'Staff'}</p>
                                </div>
                            </div>

                            {/* Itemized details list */}
                            <div className="space-y-3">
                                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-450 flex items-center gap-1">
                                    <FileText className="h-4 w-4" />
                                    <span>Returned Items</span>
                                </h4>

                                {detailedLoading ? (
                                    <div className="py-8 text-center text-xs text-slate-500">Loading itemized lines...</div>
                                ) : (
                                    <div className="rounded-xl border border-slate-800 overflow-hidden divide-y divide-slate-805 bg-slate-950/15">
                                        {(selectedReturn.return_items || []).map((item) => (
                                            <div key={item.id} className="p-4 flex items-center justify-between text-sm hover:bg-slate-900/30 transition-colors">
                                                <div>
                                                    <div className="font-semibold text-slate-200">{item.products?.product_name || 'Product'}</div>
                                                    <div className="text-[11px] text-slate-550 mt-0.5">SKU: {item.products?.ref_code || 'N/A'}</div>
                                                </div>
                                                <div className="text-right">
                                                    <div className="text-slate-300 font-medium">{item.quantity_returned} Units</div>
                                                    <div className="text-emerald-400 font-semibold mt-0.5">रु {Number(item.refund_amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
                                                </div>
                                            </div>
                                        ))}

                                        <div className="p-4 bg-slate-900/60 flex justify-between font-bold text-slate-100 text-sm border-t border-slate-800">
                                            <span>Total Refund Credit</span>
                                            <span className="text-emerald-400">रु {Number(selectedReturn.total_refund).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {selectedReturn.notes && (
                                <div className="p-4 rounded-xl bg-slate-950/40 border border-slate-800/80 text-xs">
                                    <p className="font-bold text-slate-400 mb-1 flex items-center gap-1">
                                        <Info className="h-3.5 w-3.5 text-slate-500" />
                                        <span>Remarks / Explanation</span>
                                    </p>
                                    <p className="text-slate-300 whitespace-pre-wrap leading-relaxed">{selectedReturn.notes}</p>
                                </div>
                            )}
                        </div>

                        <div className="px-6 py-4 border-t border-slate-800 bg-slate-950/30 flex justify-end gap-3">
                            <button
                                onClick={() => setSelectedReturn(null)}
                                className="px-4 py-2 border border-slate-800 hover:border-slate-700 bg-slate-900 rounded-xl text-slate-300 hover:text-white transition-colors text-sm font-semibold"
                            >
                                Close
                            </button>
                            <button
                                onClick={() => handlePrintDebitNote(selectedReturn)}
                                disabled={detailedLoading}
                                className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl transition-colors text-sm font-bold flex items-center gap-1.5"
                            >
                                <Printer className="h-4.5 w-4.5" />
                                <span>Print Debit Note</span>
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
