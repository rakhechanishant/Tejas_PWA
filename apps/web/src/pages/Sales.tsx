import React, { useEffect, useState, useMemo, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { numberToWords, formatNPR, formatDate, formatDateTime } from '../lib/billingUtils'
import {
    Plus, Printer, Search, RefreshCw, AlertCircle, X, Trash2, Save, Receipt
} from 'lucide-react'

// ─── TYPES ───────────────────────────────────────────────────────────────────
interface Party {
    id: number
    Parties_name: string
    address: string | null
    pan_no: string | null
    contact_number: string | null
}

interface Product {
    id: number
    product_name: string
    ref_code: string | null
    mrp: number | null
    unit: string
    image_url: string | null
    specification: string | null
    company: string | null
    category: string | null
}

interface SaleItem {
    id: string
    product_id: number | null
    ref_code: string
    particulars: string
    qty: number
    unit: string
    rate: number
    less_pct: number
    amount: number
}

interface SalesInvoice {
    id: number
    invoice_number: string
    invoice_date: string
    party_id: number | null
    party_address: string | null
    party_vat: string | null
    ref_number: string | null
    payment_mode: string
    subtotal: number
    discount: number
    taxable_amount: number
    vat_rate: number
    vat_amount: number
    net_total: number
    remarks: string | null
    status: string
    created_at: string
    parties?: { Parties_name: string; address: string | null; pan_no: string | null; contact_number: string | null } | null
    sales_invoice_items?: SaleItemDB[]
}

interface SaleItemDB {
    id: number
    product_id: number | null
    ref_code: string | null
    particulars: string
    qty: number
    unit: string
    rate: number
    less_pct: number
    amount: number
    sort_order: number
}

// ─── PRINT TEMPLATE ──────────────────────────────────────────────────────────
const PrintTemplate = ({ inv }: { inv: SalesInvoice }) => {
    const items = inv.sales_invoice_items || []
    const printedOn = formatDateTime(new Date().toISOString())
    const partyName = inv.parties?.Parties_name || '—'
    const partyAddr = inv.party_address || inv.parties?.address || ''
    const partyVat = inv.party_vat || inv.parties?.pan_no || ''

    const renderDigitBoxes = (val: string | null) => {
        if (!val) return <span style={{ fontStyle: 'italic', color: '#888' }}>—</span>
        const cleaned = val.replace(/[^0-9A-Za-z]/g, '')
        return (
            <span style={{ display: 'inline-flex', gap: '2px', verticalAlign: 'middle' }}>
                {cleaned.split('').map((char, index) => (
                    <span key={index} style={{
                        border: '1px solid #000',
                        width: '14px',
                        height: '14px',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '9px',
                        fontWeight: 'bold',
                        fontFamily: 'monospace',
                        color: '#000',
                        backgroundColor: '#fff'
                    }}>
                        {char}
                    </span>
                ))}
            </span>
        )
    }

    return (
        <div id="sales-print-area" style={{ fontFamily: 'Arial, sans-serif', fontSize: '11px', color: '#000', padding: '20px', maxWidth: '780px', margin: '0 auto', backgroundColor: '#fff' }}>
            {/* Header Layout */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #000', paddingBottom: '10px', marginBottom: '10px' }}>
                {/* Logo on the left */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: '110px', textAlign: 'center' }}>
                    <div style={{ fontSize: '18px', fontWeight: 900, letterSpacing: '4px', lineHeight: '1', fontFamily: '"Outfit", sans-serif', color: '#000' }}>TEJAS</div>
                    <svg width="50" height="25" viewBox="0 0 60 30" style={{ marginTop: '4px', color: '#000' }}>
                        <path d="M 5,12 C 9,12 12,10 16,7 C 20,4 23,4 26,7 C 28,8.5 29,11 32,12.5 C 35,14 39,14 42,15.5 C 45,17 48,19 51,20 C 54,21 58.5,21.5 61,20 L 64,22 L 60,25 C 55.5,25.5 51,25 48,24 C 43.5,22.5 40.5,20 37.5,19 C 34.5,18.2 31.5,18.2 28.5,18.2 C 24,18.2 19.5,19.5 15,19 C 11.2,18.2 8.2,16.2 7.5,12 Z M 14,4.5 L 27.5,9 L 26,12 L 12.5,7.5 Z M 61,20 L 67.5,16.5 L 66,21 Z M 60,25 L 66,23 L 63,26.5 Z" fill="currentColor" />
                    </svg>
                </div>

                {/* Company Info */}
                <div style={{ textAlign: 'center', flex: 1, padding: '0 10px' }}>
                    <div style={{ fontSize: '18px', fontWeight: 900, letterSpacing: '1px', marginBottom: '2px' }}>TEJAS IMPEX PVT. LTD.</div>
                    <div style={{ fontSize: '10px', color: '#333' }}>Teku -12, Kathmandu, Nepal</div>
                    <div style={{ fontSize: '10px', color: '#333' }}>Phone: 9820151570 | Email: tejasimpex2023@gmail.com</div>
                </div>

                {/* PAN Number on the right */}
                <div style={{ textAlign: 'right', fontSize: '10px' }}>
                    <div style={{ marginBottom: '4px' }}><strong>PAN No.</strong></div>
                    <div>{renderDigitBoxes("610493742")}</div>
                </div>
            </div>

            {/* Document Title */}
            <div style={{ textAlign: 'center', fontSize: '14px', fontWeight: 900, borderBottom: '1px solid #000', paddingBottom: '4px', marginBottom: '10px', letterSpacing: '1px' }}>
                TAX INVOICE
            </div>

            {/* Party & Invoice Meta Grid */}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px', gap: '20px', fontSize: '10px' }}>
                <div style={{ flex: 1 }}>
                    <div style={{ marginBottom: '4px' }}><strong>Party Name:</strong> {partyName}</div>
                    {partyAddr && (
                        <div style={{ marginBottom: '4px', whiteSpace: 'pre-line' }}><strong>Address:</strong> {partyAddr}</div>
                    )}
                    {inv.parties?.contact_number && (
                        <div style={{ marginBottom: '4px' }}><strong>Phone No:</strong> {inv.parties.contact_number}</div>
                    )}
                    {partyVat && (
                        <div style={{ marginTop: '6px' }}>
                            <strong style={{ marginRight: '6px' }}>VAT No / PAN:</strong>
                            {renderDigitBoxes(partyVat)}
                        </div>
                    )}
                    {inv.ref_number && <div style={{ marginTop: '4px' }}><strong>Ref / PO No:</strong> {inv.ref_number}</div>}
                </div>
                <div style={{ textAlign: 'right', minWidth: '220px', lineHeight: '1.4' }}>
                    <div><strong>Invoice No:</strong> {inv.invoice_number}</div>
                    <div><strong>Invoice Date:</strong> {formatDate(inv.invoice_date)}</div>
                    <div><strong>Printed On:</strong> {printedOn}</div>
                    <div><strong>Payment Mode:</strong> {inv.payment_mode}</div>
                </div>
            </div>

            {/* Item Table */}
            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '10px', fontSize: '10px' }}>
                <thead>
                    <tr style={{ backgroundColor: '#f2f2f2' }}>
                        {['SNo.', 'Ref Code', 'Particulars', 'Qty', 'Unit', 'Rate', 'Less%', 'Amount'].map(h => (
                            <th key={h} style={{ border: '1px solid #000', padding: '5px 6px', fontSize: '10px', fontWeight: 'bold', textAlign: h === 'Particulars' ? 'left' : 'center' }}>{h}</th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {items.map((item, i) => (
                        <tr key={item.id}>
                            <td style={{ border: '1px solid #000', padding: '4px 6px', textAlign: 'center' }}>{i + 1}</td>
                            <td style={{ border: '1px solid #000', padding: '4px 6px', textAlign: 'center', fontFamily: 'monospace' }}>{item.ref_code || '—'}</td>
                            <td style={{ border: '1px solid #000', padding: '4px 6px' }}>{item.particulars}</td>
                            <td style={{ border: '1px solid #000', padding: '4px 6px', textAlign: 'center' }}>{item.qty.toFixed(2)}</td>
                            <td style={{ border: '1px solid #000', padding: '4px 6px', textAlign: 'center' }}>{item.unit}</td>
                            <td style={{ border: '1px solid #000', padding: '4px 6px', textAlign: 'right' }}>{item.rate.toFixed(2)}</td>
                            <td style={{ border: '1px solid #000', padding: '4px 6px', textAlign: 'center' }}>{item.less_pct > 0 ? `-${item.less_pct.toFixed(0)}%` : '—'}</td>
                            <td style={{ border: '1px solid #000', padding: '4px 6px', textAlign: 'right' }}>{item.amount.toFixed(2)}</td>
                        </tr>
                    ))}
                    {/* Blank filler rows */}
                    {Array.from({ length: Math.max(0, 8 - items.length) }).map((_, i) => (
                        <tr key={`empty-${i}`} style={{ height: '22px' }}>
                            <td style={{ border: '1px solid #000', textAlign: 'center' }}>{items.length + i + 1}</td>
                            <td style={{ border: '1px solid #000' }}>&nbsp;</td>
                            <td style={{ border: '1px solid #000' }}>&nbsp;</td>
                            <td style={{ border: '1px solid #000' }}>&nbsp;</td>
                            <td style={{ border: '1px solid #000' }}>&nbsp;</td>
                            <td style={{ border: '1px solid #000' }}>&nbsp;</td>
                            <td style={{ border: '1px solid #000' }}>&nbsp;</td>
                            <td style={{ border: '1px solid #000' }}>&nbsp;</td>
                        </tr>
                    ))}
                    <tr style={{ fontWeight: 'bold' }}>
                        <td colSpan={7} style={{ border: '1px solid #000', padding: '5px 6px', textAlign: 'right', backgroundColor: '#f9f9f9' }}>Sub Total</td>
                        <td style={{ border: '1px solid #000', padding: '5px 6px', textAlign: 'right', backgroundColor: '#f9f9f9' }}>{inv.subtotal.toFixed(2)}</td>
                    </tr>
                </tbody>
            </table>

            {/* Totals & Remarks Section */}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px', gap: '15px' }}>
                <div style={{ flex: 1, border: '1px solid #000', padding: '8px', borderRadius: '4px' }}>
                    <div style={{ fontSize: '9px', fontWeight: 'bold', textTransform: 'uppercase', color: '#555', marginBottom: '4px' }}>Remarks & Notes</div>
                    <div style={{ fontSize: '10px', whiteSpace: 'pre-wrap' }}>{inv.remarks || 'No remarks.'}</div>
                </div>
                <table style={{ minWidth: '240px', borderCollapse: 'collapse', fontSize: '10px' }}>
                    <tbody>
                        {inv.discount > 0 && (
                            <tr>
                                <td style={{ border: '1px solid #000', padding: '4px 8px', fontWeight: 'bold' }}>Discount</td>
                                <td style={{ border: '1px solid #000', padding: '4px 8px', textAlign: 'right' }}>{inv.discount.toFixed(2)}</td>
                            </tr>
                        )}
                        <tr>
                            <td style={{ border: '1px solid #000', padding: '4px 8px', fontWeight: 'bold', backgroundColor: '#f9f9f9' }}>Taxable Amount</td>
                            <td style={{ border: '1px solid #000', padding: '4px 8px', textAlign: 'right', backgroundColor: '#f9f9f9' }}>{inv.taxable_amount.toFixed(2)}</td>
                        </tr>
                        <tr>
                            <td style={{ border: '1px solid #000', padding: '4px 8px', fontWeight: 'bold' }}>VAT {inv.vat_rate}%</td>
                            <td style={{ border: '1px solid #000', padding: '4px 8px', textAlign: 'right' }}>{inv.vat_amount.toFixed(2)}</td>
                        </tr>
                        <tr style={{ fontWeight: 'bold', backgroundColor: '#f2f2f2' }}>
                            <td style={{ border: '1px solid #000', padding: '6px 8px', fontSize: '11px' }}>Net Total</td>
                            <td style={{ border: '1px solid #000', padding: '6px 8px', textAlign: 'right', fontSize: '11px' }}>{inv.net_total.toFixed(2)}</td>
                        </tr>
                    </tbody>
                </table>
            </div>

            {/* Amount In Words */}
            <div style={{ border: '1px solid #000', padding: '6px 8px', marginBottom: '12px', fontSize: '10px', backgroundColor: '#fafafa' }}>
                <strong>Amount in words: </strong>Nepalese Rupees {numberToWords(inv.net_total)} Only
            </div>

            {/* Terms and Signatures */}
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px', gap: '20px', marginTop: '15px' }}>
                <div style={{ flex: 1 }}>
                    <strong style={{ borderBottom: '1px solid #000', paddingBottom: '1px' }}>Declaration / Terms:</strong>
                    <ol style={{ margin: '5px 0', paddingLeft: '12px', lineHeight: '1.3', color: '#333' }}>
                        <li>I.E. & O.E.</li>
                        <li>Interest shall be charged @ 10% if payment is not received within credit period.</li>
                        <li>Goods sold will be taken back only within 7 days of this invoice.</li>
                        <li><strong>Bank Details:</strong> TEJAS IMPEX PRIVATE LIMITED<br />Branch: TEKU BRANCH | Current A/c No: 01000105201299</li>
                    </ol>
                </div>
                <div style={{ textAlign: 'center', minWidth: '180px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', height: '90px' }}>
                    <div style={{ fontSize: '10px', fontWeight: 'bold' }}>For TEJAS IMPEX PVT. LTD.</div>

                    {/* Stamp Placeholder visual */}
                    <div style={{ alignSelf: 'center', border: '1px dashed #aaa', borderRadius: '50%', width: '45px', height: '45px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#bbb', fontSize: '8px' }}>
                        STAMP
                    </div>

                    <div style={{ borderTop: '1px solid #000', paddingTop: '3px' }}>
                        <div style={{ fontSize: '9px' }}>Authorised Signatory</div>
                    </div>
                </div>
            </div>

            <div style={{ textAlign: 'center', marginTop: '15px', fontSize: '8px', color: '#666', borderTop: '1px solid #eee', paddingTop: '5px' }}>
                Printed by system on {new Date().toLocaleDateString()} at {new Date().toLocaleTimeString()}
            </div>
        </div>
    )
}

// ─── INVOICE FORM ─────────────────────────────────────────────────────────────
const newRow = (): SaleItem => ({
    id: Math.random().toString(36).slice(2),
    product_id: null, ref_code: '', particulars: '', qty: 1,
    unit: 'Pcs', rate: 0, less_pct: 0, amount: 0
})

const calcAmount = (qty: number, rate: number, less_pct: number) =>
    qty * rate * (1 - less_pct / 100)

interface InvoiceFormProps {
    parties: Party[]
    products: Product[]
    onClose: () => void
    onSaved: () => void
    createdBy: string
}

const InvoiceForm: React.FC<InvoiceFormProps> = ({ parties, products, onClose, onSaved, createdBy }) => {
    const [partyId, setPartyId] = useState<number | ''>('')
    const [partyAddress, setPartyAddress] = useState('')
    const [partyVat, setPartyVat] = useState('')
    const [refNumber, setRefNumber] = useState('')
    const [paymentMode, setPaymentMode] = useState('Cash/Cheque/Credit/Others')
    const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().split('T')[0])
    const [vatRate, setVatRate] = useState(13)
    const [remarks, setRemarks] = useState('')
    const [items, setItems] = useState<SaleItem[]>([newRow()])
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState('')
    const [productSearch, setProductSearch] = useState<{ [key: string]: string }>({})
    const [productDropdown, setProductDropdown] = useState<{ [key: string]: boolean }>({})

    const subtotal = items.reduce((s, i) => s + i.amount, 0)
    const vatAmount = Math.round(subtotal * vatRate) / 100
    const netTotal = subtotal + vatAmount

    const handlePartyChange = (id: number) => {
        const p = parties.find(p => p.id === id)
        if (p) {
            setPartyId(id)
            setPartyAddress(p.address || '')
            setPartyVat(p.pan_no || '')
        }
    }

    const updateItem = (rowId: string, field: keyof SaleItem, value: any) => {
        setItems(prev => prev.map(row => {
            if (row.id !== rowId) return row
            const updated = { ...row, [field]: value }
            if (['qty', 'rate', 'less_pct'].includes(field)) {
                updated.amount = calcAmount(
                    field === 'qty' ? +value : +row.qty,
                    field === 'rate' ? +value : +row.rate,
                    field === 'less_pct' ? +value : +row.less_pct
                )
            }
            return updated
        }))
    }

    const selectProduct = (rowId: string, product: Product) => {
        setItems(prev => prev.map(row => {
            if (row.id !== rowId) return row
            const rate = product.mrp ?? 0
            return { ...row, product_id: product.id, ref_code: product.ref_code || '', particulars: product.product_name, unit: product.unit || 'Pcs', rate, amount: calcAmount(row.qty, rate, row.less_pct) }
        }))
        setProductSearch(p => ({ ...p, [rowId]: product.product_name }))
        setProductDropdown(p => ({ ...p, [rowId]: false }))
    }

    const filteredProducts = useCallback((search: string) => {
        const q = search.trim().toLowerCase()
        if (!q) return products.slice(0, 50)
        const keywords = q.split(/\s+/)
        return products.filter(p => {
            const name = (p.product_name || '').toLowerCase()
            const ref = (p.ref_code || '').toLowerCase()
            const spec = (p.specification || '').toLowerCase()
            const brand = (p.company || '').toLowerCase()
            const cat = (p.category || '').toLowerCase()
            return keywords.every(kw =>
                name.includes(kw) ||
                ref.includes(kw) ||
                spec.includes(kw) ||
                brand.includes(kw) ||
                cat.includes(kw)
            )
        }).slice(0, 50)
    }, [products])

    const handleSave = async () => {
        if (!partyId) { setError('Please select a customer party'); return }
        const validItems = items.filter(i => i.particulars.trim())
        if (validItems.length === 0) { setError('Add at least one item'); return }
        setSaving(true); setError('')
        try {
            const { data, error: rpcErr } = await supabase.rpc('create_sales_invoice', {
                p_party_id: partyId,
                p_party_address: partyAddress || null,
                p_party_vat: partyVat || null,
                p_ref_number: refNumber || null,
                p_payment_mode: paymentMode,
                p_invoice_date: invoiceDate,
                p_vat_rate: vatRate,
                p_remarks: remarks || null,
                p_items: validItems.map((item, idx) => ({
                    product_id: item.product_id, ref_code: item.ref_code, particulars: item.particulars,
                    qty: item.qty, unit: item.unit, rate: item.rate, less_pct: item.less_pct, sort_order: idx
                })),
                p_created_by: createdBy
            })
            if (rpcErr) throw rpcErr
            if (data && !data.success) throw new Error(data.error || 'Save failed')
            onSaved()
        } catch (err: any) {
            setError(err.message || 'Failed to save invoice')
        } finally { setSaving(false) }
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-2 overflow-y-auto">
            <div className="relative w-full max-w-5xl rounded-2xl border border-slate-800 bg-slate-900 shadow-2xl my-4">
                <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
                    <div className="flex items-center gap-3">
                        <div className="h-9 w-9 rounded-xl bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20">
                            <Receipt className="h-4.5 w-4.5 text-emerald-400" />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-neutral-900">New Sales Invoice</h2>
                            <p className="text-xs text-slate-500">Stock OUT — tax invoice for customer</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="rounded-xl p-2 text-neutral-600 hover:text-neutral-900 hover:bg-slate-800 transition-colors">
                        <X className="h-5 w-5" />
                    </button>
                </div>

                <div className="p-6 space-y-5">
                    {error && (
                        <div className="flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-400">
                            <AlertCircle className="h-4 w-4 shrink-0" /> {error}
                        </div>
                    )}

                    {/* Meta */}
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        <div className="space-y-1.5">
                            <label className="label-xs">Customer Party *</label>
                            <select value={partyId} onChange={e => handlePartyChange(Number(e.target.value))} className="field w-full">
                                <option value="">— Select Party —</option>
                                {parties.map(p => <option key={p.id} value={p.id}>{p.Parties_name}</option>)}
                            </select>
                        </div>
                        <div className="space-y-1.5 sm:col-span-2">
                            <label className="label-xs">Party Address</label>
                            <input className="field w-full" placeholder="Kathmandu, Nepal" value={partyAddress} onChange={e => setPartyAddress(e.target.value)} />
                        </div>
                        <div className="space-y-1.5">
                            <label className="label-xs">Party VAT No.</label>
                            <input className="field w-full" placeholder="500xxxxxxx" value={partyVat} onChange={e => setPartyVat(e.target.value)} />
                        </div>
                        <div className="space-y-1.5">
                            <label className="label-xs">Invoice Date</label>
                            <input type="date" className="field w-full" value={invoiceDate} onChange={e => setInvoiceDate(e.target.value)} />
                        </div>
                        <div className="space-y-1.5">
                            <label className="label-xs">Ref Number</label>
                            <input className="field w-full" placeholder="Optional" value={refNumber} onChange={e => setRefNumber(e.target.value)} />
                        </div>
                        <div className="space-y-1.5">
                            <label className="label-xs">Payment Mode</label>
                            <select className="field w-full" value={paymentMode} onChange={e => setPaymentMode(e.target.value)}>
                                {['Cash', 'Cheque', 'Credit', 'Bank Transfer', 'Cash/Cheque/Credit/Others'].map(m => <option key={m}>{m}</option>)}
                            </select>
                        </div>
                        <div className="space-y-1.5">
                            <label className="label-xs">VAT Rate %</label>
                            <input type="number" className="field w-full" value={vatRate} onChange={e => setVatRate(+e.target.value)} min={0} max={100} />
                        </div>
                    </div>

                    {/* Items */}
                    <div>
                        <div className="flex items-center justify-between mb-3">
                            <h3 className="text-sm font-bold text-neutral-700">Items</h3>
                            <button onClick={() => setItems(p => [...p, newRow()])} className="flex items-center gap-1.5 text-xs font-medium text-amber-400 hover:text-amber-300">
                                <Plus className="h-3.5 w-3.5" /> Add Row
                            </button>
                        </div>
                        <div className="md:overflow-visible overflow-x-auto rounded-xl border border-slate-800">
                            <table className="w-full text-xs">
                                <thead>
                                    <tr className="border-b border-slate-800 bg-slate-950/60">
                                        {['#', 'Product / Search', 'Ref Code', 'Qty', 'Unit', 'Rate', 'Less%', 'Amount', ''].map(h => (
                                            <th key={h} className="px-3 py-2.5 text-left font-semibold text-neutral-600 uppercase tracking-wide whitespace-nowrap">{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {items.map((item, idx) => (
                                        <tr key={item.id} className="border-b border-slate-800/60 hover:bg-slate-800/20">
                                            <td className="px-3 py-2 text-slate-500">{idx + 1}</td>
                                            <td className="px-2 py-1.5 relative min-w-[200px]">
                                                <input
                                                    className="field w-full text-xs"
                                                    placeholder="Search product..."
                                                    value={productSearch[item.id] !== undefined ? productSearch[item.id] : item.particulars}
                                                    onChange={e => {
                                                        setProductSearch(p => ({ ...p, [item.id]: e.target.value }))
                                                        setProductDropdown(p => ({ ...p, [item.id]: true }))
                                                        updateItem(item.id, 'particulars', e.target.value)
                                                    }}
                                                    onFocus={() => {
                                                        setProductDropdown(p => ({ ...p, [item.id]: true }))
                                                        if (productSearch[item.id] === undefined) {
                                                            setProductSearch(p => ({ ...p, [item.id]: '' }))
                                                        }
                                                    }}
                                                    onBlur={() => setTimeout(() => setProductDropdown(p => ({ ...p, [item.id]: false })), 250)}
                                                />
                                                {productDropdown[item.id] && (
                                                    <div className="absolute top-full left-0 z-50 mt-1 w-[460px] max-h-[500px] overflow-y-auto rounded-xl border border-slate-700 bg-slate-900 shadow-2xl scrollbar-thin scrollbar-thumb-slate-800">
                                                        {filteredProducts(productSearch[item.id] ?? '').map(p => (
                                                            <button key={p.id} onMouseDown={() => selectProduct(item.id, p)}
                                                                className="w-full text-left px-3 py-2 hover:bg-slate-800 border-b border-slate-800/60 last:border-b-0 flex items-start gap-2.5 transition-colors text-neutral-900">
                                                                <div className="h-10 w-10 rounded-lg bg-slate-950/80 border border-slate-800 flex items-center justify-center p-1 shrink-0">
                                                                    {p.image_url ? (
                                                                        <img src={p.image_url} alt={p.product_name} className="h-full w-full object-contain" />
                                                                    ) : (
                                                                        <Plus className="h-4 w-4 text-slate-650" />
                                                                    )}
                                                                </div>
                                                                <div className="flex-1 min-w-0">
                                                                    <div className="flex items-center justify-between gap-1">
                                                                        <span className="font-bold text-xs text-neutral-900 truncate block">{p.product_name}</span>
                                                                        <span className="text-[10px] font-mono font-bold text-amber-500 bg-slate-950/60 px-1.5 py-0.2 rounded border border-slate-800 shrink-0">
                                                                            {p.ref_code || 'No Ref'}
                                                                        </span>
                                                                    </div>
                                                                    <div className="flex items-center gap-1.5 mt-0.5 text-[10px] text-neutral-600">
                                                                        <span className="px-1.5 py-0.2 bg-slate-950 text-[9px] rounded text-neutral-600 font-medium">{p.company || 'Generic'}</span>
                                                                        <span>•</span>
                                                                        <span>{p.category || 'No Category'}</span>
                                                                    </div>
                                                                    {p.specification && (
                                                                        <p className="mt-0.5 text-[9px] text-neutral-600 line-clamp-1 italic">
                                                                            {p.specification}
                                                                        </p>
                                                                    )}
                                                                </div>
                                                                <div className="text-right shrink-0">
                                                                    <span className="text-[9px] text-slate-500 uppercase block leading-none font-semibold">MRP</span>
                                                                    <span className="text-xs font-extrabold text-amber-500">{p.mrp ? `रु ${p.mrp.toLocaleString('en-NP')}` : 'N/A'}</span>
                                                                </div>
                                                            </button>
                                                        ))}
                                                        {filteredProducts(productSearch[item.id] ?? '').length === 0 && (
                                                            <div className="px-3 py-4 text-center text-slate-500">No products found</div>
                                                        )}
                                                    </div>
                                                )}
                                            </td>
                                            <td className="px-2 py-1.5 min-w-[80px]">
                                                <input className="field w-full text-xs font-mono" value={item.ref_code} onChange={e => updateItem(item.id, 'ref_code', e.target.value)} placeholder="Ref" />
                                            </td>
                                            <td className="px-2 py-1.5 min-w-[70px]">
                                                <input type="number" className="field w-full text-xs text-right" value={item.qty} min={0.01} step={0.01} onChange={e => updateItem(item.id, 'qty', +e.target.value)} />
                                            </td>
                                            <td className="px-2 py-1.5 min-w-[80px]">
                                                <select className="field w-full text-xs" value={item.unit} onChange={e => updateItem(item.id, 'unit', e.target.value)}>
                                                    {['Pcs', 'Box', 'Carton', 'Set', 'Pair', 'Kg', 'Mtr', 'Ltr'].map(u => <option key={u}>{u}</option>)}
                                                </select>
                                            </td>
                                            <td className="px-2 py-1.5 min-w-[90px]">
                                                <input type="number" className="field w-full text-xs text-right" value={item.rate} min={0} step={0.01} onChange={e => updateItem(item.id, 'rate', +e.target.value)} />
                                            </td>
                                            <td className="px-2 py-1.5 min-w-[70px]">
                                                <input type="number" className="field w-full text-xs text-right" value={item.less_pct} min={0} max={100} step={0.5} onChange={e => updateItem(item.id, 'less_pct', +e.target.value)} />
                                            </td>
                                            <td className="px-3 py-2 text-right font-semibold text-emerald-400 whitespace-nowrap">{formatNPR(item.amount)}</td>
                                            <td className="px-2 py-1.5">
                                                <button onClick={() => setItems(p => p.filter(r => r.id !== item.id))} disabled={items.length === 1}
                                                    className="text-slate-600 hover:text-rose-400 transition-colors disabled:opacity-30">
                                                    <Trash2 className="h-3.5 w-3.5" />
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Totals */}
                    <div className="flex flex-col sm:flex-row gap-4 justify-between">
                        <div className="flex-1 space-y-1.5">
                            <label className="label-xs">Remarks</label>
                            <textarea className="field w-full resize-none" rows={3} value={remarks} onChange={e => setRemarks(e.target.value)} placeholder="Optional notes..." />
                        </div>
                        <div className="min-w-[240px] space-y-1.5 rounded-xl border border-slate-800 bg-slate-950/40 p-4">
                            <div className="flex justify-between text-sm text-neutral-600"><span>Sub Total:</span><span className="font-bold text-neutral-900">{formatNPR(subtotal)}</span></div>
                            <div className="flex justify-between text-sm text-neutral-600"><span>VAT {vatRate}%:</span><span className="font-bold text-emerald-400">{formatNPR(vatAmount)}</span></div>
                            <div className="flex justify-between text-base font-extrabold border-t border-slate-800 pt-2 mt-2 text-neutral-900"><span>Net Total:</span><span className="text-amber-400">{formatNPR(netTotal)}</span></div>
                            <div className="text-[10px] text-slate-500 pt-1 italic">{numberToWords(netTotal)}</div>
                        </div>
                    </div>

                    <div className="flex justify-end gap-3 border-t border-slate-800 pt-4">
                        <button onClick={onClose} className="px-6 py-2.5 rounded-xl border border-slate-700 text-neutral-600 hover:text-neutral-900 hover:bg-slate-800 text-sm font-medium transition-colors">
                            Cancel
                        </button>
                        <button onClick={handleSave} disabled={saving}
                            className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-neutral-900 text-sm font-bold transition-colors disabled:opacity-50">
                            <Save className="h-4 w-4" />
                            {saving ? 'Saving…' : 'Save Invoice'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}

// ─── MAIN SALES PAGE ──────────────────────────────────────────────────────────
interface ParsedNotes {
    notes: string;
    discounts: {
        type: 'NONE' | 'OVERALL' | 'PRODUCT';
        overallPct?: number;
        items?: Record<number, number>;
    } | null;
}

const parseOrderNotesAndDiscounts = (rawNotes: string | null): ParsedNotes => {
    if (!rawNotes) return { notes: '', discounts: null }
    try {
        const match = rawNotes.match(/(.*?)\s*\|\|DISCOUNTS:(.*?)\|\|/)
        if (match) {
            return {
                notes: match[1].trim(),
                discounts: JSON.parse(match[2])
            }
        }
        const plainMatch = rawNotes.match(/\|\|DISCOUNTS:(.*?)\|\|/)
        if (plainMatch) {
            return {
                notes: rawNotes.replace(/\|\|DISCOUNTS:.*?\|\|/, '').trim(),
                discounts: JSON.parse(plainMatch[1])
            }
        }
    } catch (e) {
        console.error('Error parsing order notes/discounts JSON:', e)
    }
    return { notes: rawNotes.trim(), discounts: null }
}

export const Sales: React.FC = () => {
    const { profile } = useAuth()
    const [invoices, setInvoices] = useState<SalesInvoice[]>([])
    const [parties, setParties] = useState<Party[]>([])
    const [products, setProducts] = useState<Product[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')
    const [showForm, setShowForm] = useState(false)
    const [search, setSearch] = useState('')
    const [printInv, setPrintInv] = useState<SalesInvoice | null>(null)

    // Filter states
    const [selectedPartyId, setSelectedPartyId] = useState<number | 'ALL'>('ALL')
    const [dateFilter, setDateFilter] = useState<'ALL' | 'TODAY' | 'YESTERDAY' | 'WEEK'>('ALL')
    const [typeFilter, setTypeFilter] = useState<'ALL' | 'DIRECT' | 'ORDER'>('ALL')

    const fetchAll = async () => {
        setLoading(true); setError('')
        try {
            const [invRes, ordersRes, partiesRes, productsRes] = await Promise.all([
                supabase.from('sales_invoices').select(`*, parties(Parties_name, address, pan_no, contact_number), sales_invoice_items(*)`).order('created_at', { ascending: false }),
                supabase.from('orders').select(`id, order_number, created_at, status, bill_number, invoice_number, billing_remarks, notes, party_id, parties(Parties_name, address, pan_no, contact_number), order_items(*, products(*))`).not('bill_number', 'is', null).neq('status', 'CANCELLED'),
                supabase.from('parties').select('id, Parties_name, address, pan_no, contact_number').order('Parties_name'),
                supabase.from('products').select('id, product_name, ref_code, mrp, unit, image_url, specification, company, category').order('product_name')
            ])
            if (invRes.error) throw invRes.error
            if (ordersRes.error) throw ordersRes.error
            if (partiesRes.error) throw partiesRes.error
            if (productsRes.error) throw productsRes.error

            const rawInvoices = invRes.data || []
            const rawOrders = ordersRes.data || []

            const existingInvoiceNumbers = new Set(rawInvoices.map(inv => inv.invoice_number))
            const existingRefs = new Set(rawInvoices.filter(inv => inv.ref_number).map(inv => inv.ref_number))

            const virtualInvoices: SalesInvoice[] = []

            for (const ord of rawOrders) {
                if (existingInvoiceNumbers.has(ord.invoice_number) || existingRefs.has(ord.order_number)) {
                    continue
                }

                const parsed = parseOrderNotesAndDiscounts(ord.notes)
                const discountType = parsed.discounts?.type || 'NONE'
                const overallPct = parsed.discounts?.overallPct || 0

                let subtotal = 0;
                const items = (ord.order_items || []).map((oi: any) => {
                    const product = oi.products || {};
                    let rate = oi.unit_price;
                    let lessPct = 0;
                    if (discountType === 'PRODUCT') {
                        lessPct = parsed.discounts?.items?.[oi.product_id] || 0;
                        rate = product.mrp !== null && product.mrp !== undefined ? product.mrp : oi.unit_price;
                    }
                    const lineAmt = oi.quantity * rate * (1.0 - lessPct / 100.0);
                    subtotal += lineAmt;

                    return {
                        id: oi.id,
                        invoice_id: -ord.id,
                        product_id: oi.product_id,
                        ref_code: product.ref_code || '',
                        particulars: product.product_name || 'Generic Item',
                        qty: oi.quantity,
                        unit: product.unit || 'Pcs',
                        rate: rate,
                        less_pct: lessPct,
                        amount: lineAmt,
                        sort_order: 0
                    }
                })

                let discountAmount = 0;
                if (discountType === 'OVERALL') {
                    discountAmount = Math.round(subtotal * (overallPct / 100.0) * 100) / 100;
                }

                const taxableAmount = subtotal - discountAmount;
                const vatAmount = Math.round(taxableAmount * 0.13 * 100) / 100;
                const netTotal = taxableAmount + vatAmount;

                virtualInvoices.push({
                    id: -ord.id,
                    invoice_number: ord.invoice_number || `V-SI-${ord.id}`,
                    invoice_date: ord.created_at.split('T')[0],
                    party_id: ord.party_id,
                    party_address: ord.parties?.address || '',
                    party_vat: ord.parties?.pan_no || '',
                    ref_number: ord.order_number,
                    payment_mode: 'Credit',
                    subtotal: subtotal,
                    discount: discountAmount,
                    taxable_amount: taxableAmount,
                    vat_rate: 13,
                    vat_amount: vatAmount,
                    net_total: netTotal,
                    remarks: ord.billing_remarks || 'System virtual order sync',
                    status: 'ACTIVE',
                    created_by: ord.billed_by || '',
                    created_at: ord.created_at,
                    parties: ord.parties,
                    sales_invoice_items: items
                })
            }

            const combinedInvoices = [...rawInvoices, ...virtualInvoices].sort((a, b) => {
                return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
            })

            setInvoices(combinedInvoices)
            setParties(partiesRes.data || [])
            setProducts(productsRes.data || [])
        } catch (err: any) {
            setError(err.message || 'Failed to load data')
        } finally { setLoading(false) }
    }

    useEffect(() => { fetchAll() }, [])

    const handlePrint = (inv: SalesInvoice) => {
        setPrintInv(inv)
        setTimeout(() => {
            const content = document.getElementById('sales-print-area')
            if (!content) return
            const win = window.open('', '_blank', 'width=900,height=700')
            if (!win) return
            win.document.write(`<html><head><title>Invoice - ${inv.invoice_number}</title><style>body{margin:0;padding:0;font-family:Arial,sans-serif;}@media print{body{margin:0;}}</style></head><body>${content.outerHTML}<script>window.onload=()=>{window.print();window.onafterprint=()=>window.close()}<\/script></body></html>`)
            win.document.close()
        }, 300)
    }

    const filtered = useMemo(() => {
        let list = invoices

        // Search
        const q = search.toLowerCase()
        if (q) {
            list = list.filter(inv =>
                inv.invoice_number.toLowerCase().includes(q) ||
                (inv.parties?.Parties_name?.toLowerCase().includes(q))
            )
        }

        // Party filter
        if (selectedPartyId !== 'ALL') {
            list = list.filter(inv => inv.party_id === selectedPartyId)
        }

        // Invoice type filter
        if (typeFilter === 'DIRECT') {
            list = list.filter(inv => !inv.ref_number)
        } else if (typeFilter === 'ORDER') {
            list = list.filter(inv => !!inv.ref_number)
        }

        // Date filter
        if (dateFilter !== 'ALL') {
            const todayStr = new Date().toISOString().split('T')[0]

            if (dateFilter === 'TODAY') {
                list = list.filter(inv => inv.invoice_date === todayStr)
            } else if (dateFilter === 'YESTERDAY') {
                const yesterday = new Date()
                yesterday.setDate(yesterday.getDate() - 1)
                const yesterdayStr = yesterday.toISOString().split('T')[0]
                list = list.filter(inv => inv.invoice_date === yesterdayStr)
            } else if (dateFilter === 'WEEK') {
                const weekAgo = new Date()
                weekAgo.setDate(weekAgo.getDate() - 7)
                list = list.filter(inv => new Date(inv.invoice_date) >= weekAgo)
            }
        }

        return list
    }, [invoices, search, selectedPartyId, dateFilter, typeFilter])

    return (
        <div className="space-y-6">
            {printInv && <div className="hidden"><PrintTemplate inv={printInv} /></div>}

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h1 className="text-3xl font-extrabold tracking-tight text-neutral-900 font-outfit">Sales Invoices</h1>
                    <p className="text-sm text-neutral-600">Stock OUT — tax invoices to customers. Inventory updated automatically.</p>
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={fetchAll} title="Refresh" className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-800 bg-slate-900 hover:bg-slate-800 text-neutral-600 hover:text-neutral-900 transition-colors">
                        <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                    </button>
                    <button onClick={() => setShowForm(true)}
                        className="flex items-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 px-4 py-2.5 text-sm font-bold text-neutral-900 transition-colors">
                        <Plus className="h-4 w-4" /> New Sales Invoice
                    </button>
                </div>
            </div>

            {error && (
                <div className="flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-400">
                    <AlertCircle className="h-4 w-4 shrink-0" /> {error}
                </div>
            )}

            <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                <input
                    className="block w-full rounded-xl border border-slate-800 bg-slate-950/80 py-3 pl-10 pr-4 text-neutral-900 placeholder-slate-500 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                    placeholder="Search by invoice number or party..."
                    value={search} onChange={e => setSearch(e.target.value)}
                />
            </div>

            {/* Filters Row */}
            <div className="grid gap-3 grid-cols-1 sm:grid-cols-3 bg-slate-950/40 p-4 rounded-xl border border-slate-800/80">
                <div className="space-y-1">
                    <label className="text-[10px] font-bold text-neutral-600 uppercase tracking-wider">Party Filter</label>
                    <select
                        value={selectedPartyId}
                        onChange={e => setSelectedPartyId(e.target.value === 'ALL' ? 'ALL' : Number(e.target.value))}
                        className="field w-full text-xs"
                    >
                        <option value="ALL">All Parties</option>
                        {parties.map(p => (
                            <option key={p.id} value={p.id}>{p.Parties_name}</option>
                        ))}
                    </select>
                </div>
                <div className="space-y-1">
                    <label className="text-[10px] font-bold text-neutral-600 uppercase tracking-wider">Date Filter</label>
                    <select
                        value={dateFilter}
                        onChange={e => setDateFilter(e.target.value as any)}
                        className="field w-full text-xs"
                    >
                        <option value="ALL">All Dates</option>
                        <option value="TODAY">Today's Invoices</option>
                        <option value="YESTERDAY">Yesterday's Invoices</option>
                        <option value="WEEK">Last 7 Days</option>
                    </select>
                </div>
                <div className="space-y-1">
                    <label className="text-[10px] font-bold text-neutral-600 uppercase tracking-wider">Invoice Type</label>
                    <select
                        value={typeFilter}
                        onChange={e => setTypeFilter(e.target.value as any)}
                        className="field w-full text-xs"
                    >
                        <option value="ALL">All Invoices</option>
                        <option value="DIRECT">Direct Invoices</option>
                        <option value="ORDER">Order-Linked Invoices</option>
                    </select>
                </div>
            </div>

            {loading ? (
                <div className="space-y-3">{[...Array(5)].map((_, i) => <div key={i} className="h-14 animate-pulse rounded-xl bg-slate-900/40 border border-slate-800" />)}</div>
            ) : filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center p-16 text-center rounded-2xl border border-slate-800 bg-slate-900/20">
                    <Receipt className="h-12 w-12 text-slate-600 mb-3" />
                    <h3 className="text-lg font-bold text-neutral-600">No sales invoices yet</h3>
                    <p className="text-xs text-slate-500 mt-1">Click "New Sales Invoice" to issue your first tax invoice.</p>
                </div>
            ) : (
                <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-900/40">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-slate-800 bg-slate-950/60">
                                {['Invoice No.', 'Date', 'Customer', 'Items', 'Subtotal', 'VAT', 'Net Total', 'Status', 'Actions'].map(h => (
                                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-neutral-600">{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.map(inv => (
                                <tr key={inv.id} className="border-b border-slate-800/40 hover:bg-slate-800/20 transition-colors">
                                    <td className="px-4 py-3 font-mono text-neutral-900 font-bold whitespace-nowrap">
                                        <span className="text-amber-400">{inv.invoice_number}</span>
                                        {inv.ref_number && (
                                            <span className="ml-2 inline-flex items-center rounded bg-blue-500/10 px-1.5 py-0.5 text-[9px] font-semibold text-blue-400 border border-blue-500/20">
                                                Order: {inv.ref_number}
                                            </span>
                                        )}
                                        {inv.id < 0 && (
                                            <span className="ml-1.5 inline-flex items-center rounded bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-bold text-amber-400 border border-amber-500/20">
                                                Order-Only
                                            </span>
                                        )}
                                    </td>
                                    <td className="px-4 py-3 text-neutral-700">{formatDate(inv.invoice_date)}</td>
                                    <td className="px-4 py-3 text-neutral-900 max-w-[180px] truncate">{inv.parties?.Parties_name || '—'}</td>
                                    <td className="px-4 py-3 text-center text-neutral-600">{inv.sales_invoice_items?.length ?? 0}</td>
                                    <td className="px-4 py-3 text-right text-neutral-700">{formatNPR(inv.subtotal)}</td>
                                    <td className="px-4 py-3 text-right text-emerald-400">{formatNPR(inv.vat_amount)}</td>
                                    <td className="px-4 py-3 text-right font-bold text-neutral-900">{formatNPR(inv.net_total)}</td>
                                    <td className="px-4 py-3">
                                        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase ${inv.status === 'ACTIVE' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'}`}>
                                            {inv.status}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3">
                                        <button onClick={() => handlePrint(inv)}
                                            className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:text-neutral-900 hover:bg-slate-700 transition-colors">
                                            <Printer className="h-3 w-3" /> Print
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {showForm && (
                <InvoiceForm
                    parties={parties}
                    products={products}
                    createdBy={profile?.id || ''}
                    onClose={() => setShowForm(false)}
                    onSaved={() => { setShowForm(false); fetchAll() }}
                />
            )}
        </div>
    )
}
