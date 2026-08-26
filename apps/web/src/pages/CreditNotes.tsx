import React, { useEffect, useState, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { numberToWords, formatNPR, formatDate } from '../lib/billingUtils'
import { Plus, Printer, Search, RefreshCw, AlertCircle, X, Trash2, Save, Undo2 } from 'lucide-react'

interface Party { id: number; Parties_name: string; address: string | null; pan_no: string | null; contact_number: string | null }
interface SalesInvoice { id: number; invoice_number: string; parties?: { Parties_name: string } | null }
interface CNItem { id: string; product_id: number | null; ref_code: string; particulars: string; qty: number; unit: string; rate: number; amount: number }
interface CreditNote {
    id: number; note_number: string; note_date: string; party_id: number | null
    original_invoice_no: string | null; subtotal: number; vat_rate: number; vat_amount: number
    net_total: number; reason: string | null; status: string; created_at: string
    parties?: { Parties_name: string; address?: string | null; pan_no?: string | null; contact_number?: string | null } | null
    credit_note_items?: { id: number; ref_code: string | null; particulars: string; qty: number; unit: string; rate: number; amount: number }[]
}

const newRow = (): CNItem => ({ id: Math.random().toString(36).slice(2), product_id: null, ref_code: '', particulars: '', qty: 1, unit: 'Pcs', rate: 0, amount: 0 })

// ─── PRINT TEMPLATE ───────────────────────────────────────────────────────────
const PrintNote = ({ note }: { note: CreditNote }) => {
    const items = note.credit_note_items || []
    const partyName = note.parties?.Parties_name || '—'

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
        <div id="credit-print-area" style={{ fontFamily: 'Arial, sans-serif', fontSize: '11px', color: '#000', padding: '20px', maxWidth: '780px', margin: '0 auto', backgroundColor: '#fff' }}>
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
                CREDIT NOTE (Sales Return)
            </div>

            {/* Party & Notes Meta Grid */}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px', gap: '20px', fontSize: '10px' }}>
                <div style={{ flex: 1 }}>
                    <div style={{ marginBottom: '4px' }}><strong>Customer Name:</strong> {partyName}</div>
                    {note.parties?.address && (
                        <div style={{ marginBottom: '4px', whiteSpace: 'pre-line' }}><strong>Address:</strong> {note.parties.address}</div>
                    )}
                    {note.parties?.contact_number && (
                        <div style={{ marginBottom: '4px' }}><strong>Phone No:</strong> {note.parties.contact_number}</div>
                    )}
                    {note.parties?.pan_no && (
                        <div style={{ marginTop: '6px' }}>
                            <strong style={{ marginRight: '6px' }}>VAT No / PAN:</strong>
                            {renderDigitBoxes(note.parties.pan_no)}
                        </div>
                    )}
                    {note.original_invoice_no && <div style={{ marginBottom: '4px', marginTop: '6px' }}><strong>Original Invoice No:</strong> {note.original_invoice_no}</div>}
                    {note.reason && <div style={{ marginBottom: '4px', whiteSpace: 'pre-wrap' }}><strong>Reason:</strong> {note.reason}</div>}
                </div>
                <div style={{ textAlign: 'right', minWidth: '220px', lineHeight: '1.4' }}>
                    <div><strong>Credit Note No:</strong> {note.note_number}</div>
                    <div><strong>Date:</strong> {formatDate(note.note_date)}</div>
                    <div><strong>Printed On:</strong> {new Date().toLocaleDateString('en-GB')}</div>
                </div>
            </div>

            {/* Item Table */}
            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '10px', fontSize: '10px' }}>
                <thead>
                    <tr style={{ backgroundColor: '#f2f2f2' }}>
                        {['SNo.', 'Ref Code', 'Particulars', 'Qty', 'Unit', 'Rate', 'Amount'].map(h => (
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
                            <td style={{ border: '1px solid #000', padding: '4px 6px', textAlign: 'right' }}>{item.amount.toFixed(2)}</td>
                        </tr>
                    ))}
                    {/* Blank filler rows */}
                    {Array.from({ length: Math.max(0, 6 - items.length) }).map((_, i) => (
                        <tr key={`empty-${i}`} style={{ height: '22px' }}>
                            <td style={{ border: '1px solid #000', textAlign: 'center' }}>{items.length + i + 1}</td>
                            <td style={{ border: '1px solid #000' }}>&nbsp;</td>
                            <td style={{ border: '1px solid #000' }}>&nbsp;</td>
                            <td style={{ border: '1px solid #000' }}>&nbsp;</td>
                            <td style={{ border: '1px solid #000' }}>&nbsp;</td>
                            <td style={{ border: '1px solid #000' }}>&nbsp;</td>
                            <td style={{ border: '1px solid #000' }}>&nbsp;</td>
                        </tr>
                    ))}
                    <tr style={{ fontWeight: 'bold' }}>
                        <td colSpan={6} style={{ border: '1px solid #000', padding: '4px 6px', textAlign: 'right', backgroundColor: '#f9f9f9' }}>Taxable Amount</td>
                        <td style={{ border: '1px solid #000', padding: '4px 6px', textAlign: 'right', backgroundColor: '#f9f9f9' }}>{note.subtotal.toFixed(2)}</td>
                    </tr>
                    <tr>
                        <td colSpan={6} style={{ border: '1px solid #000', padding: '4px 6px', textAlign: 'right' }}>VAT {note.vat_rate}%</td>
                        <td style={{ border: '1px solid #000', padding: '4px 6px', textAlign: 'right' }}>{note.vat_amount.toFixed(2)}</td>
                    </tr>
                    <tr style={{ fontWeight: 'bold', backgroundColor: '#f2f2f2' }}>
                        <td colSpan={6} style={{ border: '1px solid #000', padding: '5px 6px', fontSize: '11px', textAlign: 'right' }}>Net Total</td>
                        <td style={{ border: '1px solid #000', padding: '5px 6px', fontSize: '11px', textAlign: 'right' }}>{note.net_total.toFixed(2)}</td>
                    </tr>
                </tbody>
            </table>

            {/* Amount In Words */}
            <div style={{ border: '1px solid #000', padding: '6px 8px', marginBottom: '15px', fontSize: '10px', backgroundColor: '#fafafa' }}>
                <strong>Amount in words: </strong>Nepalese Rupees {numberToWords(note.net_total)} Only
            </div>

            {/* Signatures */}
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px', marginTop: '20px' }}>
                <div style={{ border: '1px dashed #aaa', borderRadius: '50%', width: '45px', height: '45px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#bbb', fontSize: '8px' }}>
                    STAMP
                </div>
                <div style={{ textAlign: 'center', borderTop: '1px solid #000', paddingTop: '3px', minWidth: '160px' }}>
                    <div style={{ fontSize: '10px', fontWeight: 'bold' }}>For TEJAS IMPEX PVT. LTD.</div>
                    <div style={{ marginTop: '30px', fontSize: '9px' }}>Authorised Signatory</div>
                </div>
            </div>

            <div style={{ textAlign: 'center', marginTop: '15px', fontSize: '8px', color: '#666', borderTop: '1px solid #eee', paddingTop: '5px' }}>
                System-generated Credit Note printout
            </div>
        </div>
    )
}

// ─── FORM ─────────────────────────────────────────────────────────────────────
interface FormProps { parties: Party[]; invoices: SalesInvoice[]; onClose: () => void; onSaved: () => void; createdBy: string }

const CreditForm: React.FC<FormProps> = ({ parties, invoices, onClose, onSaved, createdBy }) => {
    const [partyId, setPartyId] = useState<number | ''>('')
    const [invoiceId, setInvoiceId] = useState<number | ''>('')
    const [origInvNo, setOrigInvNo] = useState('')
    const [noteDate, setNoteDate] = useState(new Date().toISOString().split('T')[0])
    const [vatRate, setVatRate] = useState(13)
    const [reason, setReason] = useState('')
    const [items, setItems] = useState<CNItem[]>([newRow()])
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState('')

    const subtotal = items.reduce((s, i) => s + i.amount, 0)
    const vatAmount = Math.round(subtotal * vatRate) / 100
    const netTotal = subtotal + vatAmount

    const updateItem = (rowId: string, field: keyof CNItem, val: any) => {
        setItems(prev => prev.map(r => {
            if (r.id !== rowId) return r
            const u = { ...r, [field]: val }
            if (['qty', 'rate'].includes(field)) u.amount = (field === 'qty' ? +val : +r.qty) * (field === 'rate' ? +val : +r.rate)
            return u
        }))
    }

    const handleSave = async () => {
        if (!partyId) { setError('Select a customer party'); return }
        const validItems = items.filter(i => i.particulars.trim())
        if (!validItems.length) { setError('Add at least one item'); return }
        setSaving(true); setError('')
        try {
            const selectedParty = parties.find(p => p.id === partyId)
            const partyAddress = selectedParty?.address || null

            const { data, error: e } = await supabase.rpc('create_credit_note', {
                p_party_id: partyId,
                p_party_address: partyAddress,
                p_sales_invoice_id: invoiceId || null,
                p_original_inv_no: origInvNo || null,
                p_note_date: noteDate,
                p_vat_rate: vatRate,
                p_reason: reason || null,
                p_items: validItems.map((i, idx) => ({ product_id: i.product_id, ref_code: i.ref_code, particulars: i.particulars, qty: i.qty, unit: i.unit, rate: i.rate, sort_order: idx })),
                p_created_by: createdBy
            })
            if (e) throw e
            if (data && !data.success) throw new Error(data.error)
            onSaved()
        } catch (err: any) { setError(err.message) } finally { setSaving(false) }
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-2 overflow-y-auto">
            <div className="relative w-full max-w-4xl rounded-2xl border border-slate-800 bg-slate-900 shadow-2xl my-4">
                <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
                    <div className="flex items-center gap-3">
                        <div className="h-9 w-9 rounded-xl bg-purple-500/10 flex items-center justify-center border border-purple-500/20">
                            <Undo2 className="h-4 w-4 text-purple-400" />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-white">New Credit Note</h2>
                            <p className="text-xs text-slate-500">Sales Return — stock will be increased</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="rounded-xl p-2 text-neutral-600 hover:text-neutral-900 hover:bg-slate-800"><X className="h-5 w-5" /></button>
                </div>
                <div className="p-6 space-y-5">
                    {error && <div className="flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-400"><AlertCircle className="h-4 w-4" />{error}</div>}
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        <div className="space-y-1.5">
                            <label className="label-xs">Customer Party *</label>
                            <select value={partyId} onChange={e => setPartyId(Number(e.target.value))} className="field w-full">
                                <option value="">— Select Party —</option>
                                {parties.map(p => <option key={p.id} value={p.id}>{p.Parties_name}</option>)}
                            </select>
                        </div>
                        <div className="space-y-1.5">
                            <label className="label-xs">Original Invoice</label>
                            <select value={invoiceId} onChange={e => { const inv = invoices.find(i => i.id === +e.target.value); if (inv) { setInvoiceId(inv.id); setOrigInvNo(inv.invoice_number) } }} className="field w-full">
                                <option value="">— Select Invoice (optional) —</option>
                                {invoices.map(inv => <option key={inv.id} value={inv.id}>{inv.invoice_number} — {inv.parties?.Parties_name || '—'}</option>)}
                            </select>
                        </div>
                        <div className="space-y-1.5">
                            <label className="label-xs">Original Invoice No.</label>
                            <input className="field w-full" value={origInvNo} onChange={e => setOrigInvNo(e.target.value)} placeholder="SI-2026-0001" />
                        </div>
                        <div className="space-y-1.5">
                            <label className="label-xs">Note Date</label>
                            <input type="date" className="field w-full" value={noteDate} onChange={e => setNoteDate(e.target.value)} />
                        </div>
                        <div className="space-y-1.5">
                            <label className="label-xs">VAT Rate %</label>
                            <input type="number" className="field w-full" value={vatRate} onChange={e => setVatRate(+e.target.value)} min={0} max={100} />
                        </div>
                        <div className="space-y-1.5 sm:col-span-3">
                            <label className="label-xs">Reason for Return</label>
                            <input className="field w-full" value={reason} onChange={e => setReason(e.target.value)} placeholder="Customer complaint, damaged goods, etc." />
                        </div>
                    </div>

                    <div>
                        <div className="flex items-center justify-between mb-3">
                            <h3 className="text-sm font-bold text-neutral-700">Returned Items</h3>
                            <button onClick={() => setItems(p => [...p, newRow()])} className="flex items-center gap-1.5 text-xs font-medium text-amber-400 hover:text-amber-300"><Plus className="h-3.5 w-3.5" /> Add Row</button>
                        </div>
                        <div className="overflow-x-auto rounded-xl border border-slate-800">
                            <table className="w-full text-xs">
                                <thead>
                                    <tr className="border-b border-slate-800 bg-slate-950/60">
                                        {['#', 'Particulars', 'Ref Code', 'Qty', 'Unit', 'Rate', 'Amount', ''].map(h => (
                                            <th key={h} className="px-3 py-2.5 text-left font-semibold text-neutral-600 uppercase">{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {items.map((item, idx) => (
                                        <tr key={item.id} className="border-b border-slate-800/60">
                                            <td className="px-3 py-2 text-slate-500">{idx + 1}</td>
                                            <td className="px-2 py-1.5 min-w-[200px]"><input className="field w-full text-xs" placeholder="Item description" value={item.particulars} onChange={e => updateItem(item.id, 'particulars', e.target.value)} /></td>
                                            <td className="px-2 py-1.5 min-w-[80px]"><input className="field w-full text-xs font-mono" placeholder="Ref" value={item.ref_code} onChange={e => updateItem(item.id, 'ref_code', e.target.value)} /></td>
                                            <td className="px-2 py-1.5 min-w-[70px]"><input type="number" className="field w-full text-xs text-right" value={item.qty} min={0.01} step={0.01} onChange={e => updateItem(item.id, 'qty', +e.target.value)} /></td>
                                            <td className="px-2 py-1.5 min-w-[80px]">
                                                <select className="field w-full text-xs" value={item.unit} onChange={e => updateItem(item.id, 'unit', e.target.value)}>
                                                    {['Pcs', 'Box', 'Carton', 'Set', 'Pair', 'Kg', 'Mtr', 'Ltr'].map(u => <option key={u}>{u}</option>)}
                                                </select>
                                            </td>
                                            <td className="px-2 py-1.5 min-w-[90px]"><input type="number" className="field w-full text-xs text-right" value={item.rate} min={0} step={0.01} onChange={e => updateItem(item.id, 'rate', +e.target.value)} /></td>
                                            <td className="px-3 py-2 text-right font-semibold text-purple-400">{formatNPR(item.amount)}</td>
                                            <td className="px-2 py-1.5">
                                                <button onClick={() => setItems(p => p.filter(r => r.id !== item.id))} disabled={items.length === 1} className="text-slate-600 hover:text-rose-400 disabled:opacity-30"><Trash2 className="h-3.5 w-3.5" /></button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <div className="flex justify-end gap-4">
                        <div className="min-w-[240px] space-y-1.5 rounded-xl border border-slate-800 bg-slate-950/40 p-4">
                            <div className="flex justify-between text-sm text-neutral-600"><span>Taxable:</span><span className="font-bold text-neutral-900">{formatNPR(subtotal)}</span></div>
                            <div className="flex justify-between text-sm text-neutral-600"><span>VAT {vatRate}%:</span><span className="font-bold text-purple-400">{formatNPR(vatAmount)}</span></div>
                            <div className="flex justify-between text-base font-extrabold border-t border-slate-800 pt-2 mt-2 text-white"><span>Net Total:</span><span className="text-amber-400">{formatNPR(netTotal)}</span></div>
                        </div>
                    </div>

                    <div className="flex justify-end gap-3 border-t border-slate-800 pt-4">
                        <button onClick={onClose} className="px-6 py-2.5 rounded-xl border border-slate-700 text-neutral-600 hover:text-neutral-900 hover:bg-slate-800 text-sm font-medium">Cancel</button>
                        <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-sm font-bold disabled:opacity-50">
                            <Save className="h-4 w-4" />{saving ? 'Saving…' : 'Save Credit Note'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────
export const CreditNotes: React.FC = () => {
    const { profile } = useAuth()
    const [notes, setNotes] = useState<CreditNote[]>([])
    const [parties, setParties] = useState<Party[]>([])
    const [invoices, setInvoices] = useState<SalesInvoice[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')
    const [showForm, setShowForm] = useState(false)
    const [search, setSearch] = useState('')
    const [printNote, setPrintNote] = useState<CreditNote | null>(null)

    const fetchAll = async () => {
        setLoading(true); setError('')
        try {
            const [nr, pr, ir] = await Promise.all([
                supabase.from('credit_notes').select('*, parties(Parties_name, address, pan_no, contact_number), credit_note_items(*)').order('created_at', { ascending: false }),
                supabase.from('parties').select('id, Parties_name, address, pan_no, contact_number').order('Parties_name'),
                supabase.from('sales_invoices').select('id, invoice_number, parties(Parties_name)').order('created_at', { ascending: false })
            ])
            if (nr.error) throw nr.error
            setNotes(nr.data || []); setParties(pr.data || []); setInvoices((ir.data as any) || [])
        } catch (err: any) { setError(err.message) } finally { setLoading(false) }
    }

    useEffect(() => { fetchAll() }, [])

    const handlePrint = (note: CreditNote) => {
        setPrintNote(note)
        setTimeout(() => {
            const c = document.getElementById('credit-print-area')
            if (!c) return
            const w = window.open('', '_blank', 'width=900,height=700')
            if (!w) return
            w.document.write(`<html><head><title>Credit Note - ${note.note_number}</title><style>body{margin:0;font-family:Arial,sans-serif;}</style></head><body>${c.outerHTML}<script>window.onload=()=>{window.print();window.onafterprint=()=>window.close()}<\/script></body></html>`)
            w.document.close()
        }, 300)
    }

    const filtered = useMemo(() => {
        const q = search.toLowerCase()
        return !q ? notes : notes.filter(n => n.note_number.toLowerCase().includes(q) || (n.parties?.Parties_name?.toLowerCase().includes(q)))
    }, [notes, search])

    return (
        <div className="space-y-6">
            {printNote && <div className="hidden"><PrintNote note={printNote} /></div>}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h1 className="text-3xl font-extrabold tracking-tight text-white font-outfit">Credit Notes</h1>
                    <p className="text-sm text-neutral-600">Sales Returns — issued when customers return goods.</p>
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={fetchAll} className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-800 bg-slate-900 hover:bg-slate-800 text-neutral-600 hover:text-neutral-900 transition-colors">
                        <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                    </button>
                    <button onClick={() => setShowForm(true)} className="flex items-center gap-2 rounded-xl bg-purple-600 hover:bg-purple-500 px-4 py-2.5 text-sm font-bold text-white transition-colors">
                        <Plus className="h-4 w-4" /> New Credit Note
                    </button>
                </div>
            </div>
            {error && <div className="flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-400"><AlertCircle className="h-4 w-4" />{error}</div>}
            <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                <input className="block w-full rounded-xl border border-slate-800 bg-slate-950/80 py-3 pl-10 pr-4 text-white placeholder-slate-500 focus:border-purple-500 focus:ring-1 focus:ring-purple-500 focus:outline-none" placeholder="Search by note number or party..." value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            {loading ? (
                <div className="space-y-3">{[...Array(4)].map((_, i) => <div key={i} className="h-14 animate-pulse rounded-xl bg-slate-900/40 border border-slate-800" />)}</div>
            ) : filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center p-16 text-center rounded-2xl border border-slate-800 bg-slate-900/20">
                    <Undo2 className="h-12 w-12 text-slate-600 mb-3" />
                    <h3 className="text-lg font-bold text-neutral-600">No credit notes yet</h3>
                    <p className="text-xs text-slate-500 mt-1">Click "New Credit Note" to record a sales return.</p>
                </div>
            ) : (
                <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-900/40">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-slate-800 bg-slate-950/60">
                                {['Note No.', 'Date', 'Party', 'Orig. Invoice', 'Net Total', 'Status', 'Actions'].map(h => (
                                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-neutral-600">{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.map(n => (
                                <tr key={n.id} className="border-b border-slate-800/40 hover:bg-slate-800/20">
                                    <td className="px-4 py-3 font-mono text-purple-400 font-bold">{n.note_number}</td>
                                    <td className="px-4 py-3 text-neutral-700">{formatDate(n.note_date)}</td>
                                    <td className="px-4 py-3 text-neutral-900 max-w-[180px] truncate">{n.parties?.Parties_name || '—'}</td>
                                    <td className="px-4 py-3 text-neutral-600 font-mono text-xs">{n.original_invoice_no || '—'}</td>
                                    <td className="px-4 py-3 text-right font-bold text-white">{formatNPR(n.net_total)}</td>
                                    <td className="px-4 py-3">
                                        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase ${n.status === 'ACTIVE' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'}`}>{n.status}</span>
                                    </td>
                                    <td className="px-4 py-3">
                                        <button onClick={() => handlePrint(n)} className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:text-neutral-900 hover:bg-slate-700">
                                            <Printer className="h-3 w-3" /> Print
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
            {showForm && <CreditForm parties={parties} invoices={invoices} createdBy={profile?.id || ''} onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); fetchAll() }} />}
        </div>
    )
}
