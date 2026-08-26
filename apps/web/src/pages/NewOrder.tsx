import React, { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useCartStore, type Party, type Product } from '../store/useCartStore'
import { useCatalogStore } from '../store/useCatalogStore'
import { useDebounce } from '../lib/useDebounce'
import { db } from '../lib/db'
import {
    Search,
    User,
    Package,
    ShoppingCart,
    Trash2,
    ArrowLeft,
    CheckCircle,
    Wifi,
    WifiOff,
    FileText,
    Layers,
    Info,
    X
} from 'lucide-react'

export const NewOrder: React.FC = () => {
    const navigate = useNavigate()
    const { profile } = useAuth()
    const {
        selectedParty,
        items,
        discountType,
        overallDiscountPct,
        setParty,
        addItem,
        removeItem,
        updateQuantity,
        updateDiscount,
        setDiscountType,
        setOverallDiscountPct,
        clearCart,
        getTotals
    } = useCartStore()

    const [step, setStep] = useState(1)
    const [isOnline, setIsOnline] = useState(navigator.onLine)
    const [submitting, setSubmitting] = useState(false)
    const [errorMsg, setErrorMsg] = useState('')
    const [successMsg, setSuccessMsg] = useState('')
    const [selectedDetailProduct, setSelectedDetailProduct] = useState<Product | null>(null)

    // Step 1: Customer Selection States
    const [parties, setParties] = useState<Party[]>([])
    const [partyLoading, setPartyLoading] = useState(false)
    const [partyQuery, setPartyQuery] = useState('')

    // Step 2: Product selection States
    const { products, loading: productLoading, fetchProducts } = useCatalogStore();
    const [productQuery, setProductQuery] = useState('')
    const debouncedProductQuery = useDebounce(productQuery, 300);
    const [selectedCompany, setSelectedCompany] = useState<string>('ALL')
    const [selectedCategory, setSelectedCategory] = useState<string>('ALL')
    const [qtyInputs, setQtyInputs] = useState<Record<number, string>>({}); // ID to qty string mapping

    // Step 3: Notes
    const [notes, setNotes] = useState('')

    // Listen to network status changes
    useEffect(() => {
        const handleOnline = () => setIsOnline(true)
        const handleOffline = () => setIsOnline(false)
        window.addEventListener('online', handleOnline)
        window.addEventListener('offline', handleOffline)
        return () => {
            window.removeEventListener('online', handleOnline)
            window.removeEventListener('offline', handleOffline)
        }
    }, [])

    // Fetch parties for Step 1
    useEffect(() => {
        if (step === 1 && parties.length === 0) {
            fetchParties()
        }
    }, [step])

    // Fetch products for Step 2
    useEffect(() => {
        if (step === 2 && products.length === 0) {
            fetchProducts()
        }
    }, [step])

    const fetchParties = async () => {
        setPartyLoading(true)
        try {
            const { data, error } = await supabase
                .from('parties')
                .select('*')
                .eq('is_active', true)
                .order('Parties_name', { ascending: true })

            if (error) throw error

            const mapped: Party[] = (data || []).map((row: any) => ({
                id: row.id,
                party_code: row.party_code,
                name: row.Parties_name,
                phone: row.contact_number,
                pan: row.pan_no,
                address: row.address,
                contact_person: row.contact_person,
                designation: row.contact_person_designation,
                party_type: row.type,
                province: row.province,
                district: row.district,
                city: row.city,
                sales_person: row.sales_person,
                credit_limit: Number(row.credit_limit || 0),
                total_due: Number(row.total_due || 0),
                is_active: !!row.is_active
            }))

            setParties(mapped)
        } catch (err: any) {
            console.error('Error fetching parties:', err)
            setErrorMsg(err.message || 'Failed to fetch parties.')
        } finally {
            setPartyLoading(false)
        }
    }

    useEffect(() => {
        fetchProducts()
    }, [fetchProducts])

    // Filters
    const filteredParties = useMemo(() => {
        const query = partyQuery.trim().toLowerCase()
        if (!query) return parties
        return parties.filter(p =>
            p.name.toLowerCase().includes(query) ||
            p.party_code.toLowerCase().includes(query) ||
            (p.city && p.city.toLowerCase().includes(query))
        )
    }, [parties, partyQuery])

    const companies = useMemo(() => {
        const list = new Set(['Tiger', 'Deli', ...products.map(p => p.company).filter(Boolean) as string[]])
        return ['ALL', ...Array.from(list)]
    }, [products])

    const categories = useMemo(() => {
        const list = new Set(['Hand tools', 'Power tools', 'Accessories', ...products.map(p => p.category).filter(Boolean) as string[]])
        return ['ALL', ...Array.from(list)]
    }, [products])

    const filteredProducts = useMemo(() => {
        const query = debouncedProductQuery.trim().toLowerCase()
        return products.filter(p => {
            const matchesSearch = !query ||
                p.product_name.toLowerCase().includes(query) ||
                (p.ref_code && p.ref_code.toLowerCase().includes(query))

            const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
            const matchesCompany = selectedCompany === 'ALL' || (p.company && normalize(p.company) === normalize(selectedCompany));
            const matchesCategory = selectedCategory === 'ALL' || (p.category && normalize(p.category) === normalize(selectedCategory));

            return matchesSearch && matchesCompany && matchesCategory
        })
    }, [products, debouncedProductQuery, selectedCompany, selectedCategory])

    const { subtotal, itemDiscounts, overallDiscount, totalItems, finalTotal } = getTotals()

    // Helper to serialize notes and discounts for zero-DDL schema compatibility
    const serializeNotesWithDiscounts = (notesText: string, discountTypeVal: string, overallDiscountPctVal: number, cartItems: typeof items) => {
        const discountData = {
            type: discountTypeVal,
            overallPct: overallDiscountPctVal,
            items: cartItems.reduce((acc, item) => {
                if (item.discountPct && item.discountPct > 0) {
                    acc[item.product.id] = item.discountPct
                }
                return acc
            }, {} as Record<number, number>)
        }
        return `${notesText.trim()} ||DISCOUNTS:${JSON.stringify(discountData)}||`
    }

    // Order Submission Handler
    const handleSubmitOrder = async () => {
        if (!selectedParty) {
            setErrorMsg('Please select a customer first.')
            setStep(1)
            return
        }
        if (items.length === 0) {
            setErrorMsg('Your order cart is empty.')
            setStep(2)
            return
        }
        if (!profile?.id) {
            setErrorMsg('User profile missing. Please log in again.')
            return
        }

        setSubmitting(true)
        setErrorMsg('')
        setSuccessMsg('')

        const serializedNotes = serializeNotesWithDiscounts(notes, discountType, overallDiscountPct, items)

        const orderData = {
            party_id: selectedParty.id,
            party_name: selectedParty.name,
            items: items,
            discountType: discountType,
            overallDiscountPct: overallDiscountPct,
            notes: serializedNotes,
            created_at: new Date().toISOString()
        }

        try {
            if (isOnline) {
                // Submit directly to Supabase via RPC
                const { data: responseData, error: orderError } = await supabase.rpc('submit_order', {
                    p_party_id: orderData.party_id,
                    p_items: orderData.items.map(item => {
                        const price = item.product.mrp || 0
                        let discountPct = 0
                        if (discountType === 'PRODUCT') discountPct = item.discountPct || 0
                        else if (discountType === 'OVERALL') discountPct = overallDiscountPct || 0
                        const finalUnitPrice = price * (1 - discountPct / 100)
                        return {
                            product_id: item.product.id,
                            quantity: item.quantity,
                            unit_price: Math.round(finalUnitPrice * 100) / 100
                        }
                    }),
                    p_created_by: profile.id,
                    p_notes: serializedNotes,
                    p_assigned_to: null,
                    p_billed_by: null
                })

                if (orderError) throw orderError

                const res = typeof responseData === 'string' ? JSON.parse(responseData) : responseData
                if (!res || !res.success) {
                    throw new Error(res?.message || 'Order submission failed')
                }

                setSuccessMsg(`Order ${res.order_number} submitted successfully!`)
                clearCart()
                setTimeout(() => navigate('/orders'), 1500)
            } else {
                // Offline flow: Save locally in Dexie database
                await db.offline_orders.add({
                    party_id: orderData.party_id,
                    party_name: orderData.party_name,
                    items: orderData.items,
                    discountType: orderData.discountType,
                    overallDiscountPct: orderData.overallDiscountPct,
                    notes: orderData.notes,
                    created_at: orderData.created_at,
                    synced: 0
                })

                setSuccessMsg('Offline Mode: Order saved locally. It will auto-sync when connection is restored.')
                clearCart()
                setTimeout(() => navigate('/orders'), 2500)
            }
        } catch (err: any) {
            console.error('Error submitting order:', err)
            setErrorMsg(err.message || 'Submission failed. Saving draft locally.')
            // Fallback to offline storage in case of API failure
            try {
                await db.offline_orders.add({
                    party_id: orderData.party_id,
                    party_name: orderData.party_name,
                    items: orderData.items,
                    discountType: orderData.discountType,
                    overallDiscountPct: orderData.overallDiscountPct,
                    notes: orderData.notes,
                    created_at: orderData.created_at,
                    synced: 0
                })
                setSuccessMsg('Draft saved offline successfully due to error.')
                clearCart()
                setTimeout(() => navigate('/orders'), 2500)
            } catch (localErr) {
                setErrorMsg('Failed to save order both online and offline.')
            }
        } finally {
            setSubmitting(false)
        }
    }

    return (
        <div className="space-y-6 max-w-4xl mx-auto pb-12">
            {/* Top Navigation Row */}
            <div className="flex items-center justify-between pb-4 border-b border-slate-900">
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => {
                            if (step > 1) setStep(step - 1)
                            else navigate('/orders')
                        }}
                        className="rounded-xl bg-slate-900 border border-slate-800 p-2.5 text-neutral-600 hover:text-neutral-900 hover:bg-slate-850 transition-colors"
                    >
                        <ArrowLeft className="h-4 w-4" />
                    </button>
                    <div>
                        <h1 className="text-xl font-extrabold text-neutral-900 tracking-tight">Place New Order</h1>
                        <p className="text-xs text-slate-500">Create new wholesale sales orders</p>
                    </div>
                </div>

                {/* Connection Status Icon */}
                <div className={`flex items-center gap-2 py-1 px-3 rounded-full text-xs font-semibold border ${isOnline
                    ? 'bg-emerald-950/40 text-emerald-500 border-emerald-900/50'
                    : 'bg-rose-950/40 text-rose-500 border-rose-900/50 animate-pulse'
                    }`}>
                    {isOnline ? (
                        <>
                            <Wifi className="h-3.5 w-3.5" />
                            <span>Online</span>
                        </>
                    ) : (
                        <>
                            <WifiOff className="h-3.5 w-3.5" />
                            <span>Offline Mode</span>
                        </>
                    )}
                </div>
            </div>

            {/* Stepper Progress Indicator */}
            <div className="flex items-center justify-between max-w-lg mx-auto py-5">
                {[
                    { number: 1, label: 'Customer', icon: User },
                    { number: 2, label: 'Add Items', icon: Package },
                    { number: 3, label: 'Review', icon: ShoppingCart },
                ].map((s, idx) => (
                    <React.Fragment key={s.number}>
                        {idx > 0 && (
                            <div className={`h-1 flex-1 mx-4 rounded-full ${step >= s.number ? 'bg-blue-600' : 'bg-slate-200'
                                }`} />
                        )}
                        <div
                            onClick={() => {
                                // Allow jumping back, or jumping forward if requirements are met
                                if (s.number === 1) setStep(1)
                                if (s.number === 2 && selectedParty) setStep(2)
                                if (s.number === 3 && selectedParty && items.length > 0) setStep(3)
                            }}
                            className={`flex flex-col items-center cursor-pointer ${step === s.number ? 'text-blue-600' : step > s.number ? 'text-slate-500' : 'text-neutral-600'
                                }`}
                        >
                            <div className={`h-11 w-11 sm:h-12 sm:w-12 rounded-full border-2 flex items-center justify-center font-bold transition-all ${step === s.number
                                ? 'bg-blue-600 text-white border-blue-600 shadow-lg shadow-blue-500/30 ring-4 ring-blue-50'
                                : step > s.number
                                    ? 'bg-blue-50 text-blue-600 border-blue-200'
                                    : 'bg-white text-neutral-600 border-slate-200 hover:border-slate-300'
                                }`}>
                                <s.icon className="h-5 w-5" />
                            </div>
                            <span className="text-[11px] sm:text-xs font-bold uppercase tracking-widest mt-2">{s.label}</span>
                        </div>
                    </React.Fragment>
                ))}
            </div>

            {errorMsg && (
                <div className="rounded-xl border border-rose-900 bg-rose-950/20 p-4 text-xs font-semibold text-rose-455">
                    {errorMsg}
                </div>
            )}
            {successMsg && (
                <div className="rounded-xl border border-emerald-990 bg-emerald-950/20 p-4 text-xs font-semibold text-emerald-455 flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 shrink-0 text-emerald-500" />
                    {successMsg}
                </div>
            )}

            {/* STEP 1: PARTY / CUSTOMER SELECT */}
            {step === 1 && (
                <div className="space-y-4">
                    <div className="relative">
                        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                        <input
                            type="text"
                            placeholder="Search registered customers by name, code, city..."
                            value={partyQuery}
                            onChange={(e) => setPartyQuery(e.target.value)}
                            className="w-full bg-slate-900 border border-slate-200 rounded-2xl pl-10 pr-4 py-3 text-xs placeholder:text-neutral-600 text-neutral-800 focus:outline-none focus:border-blue-600 focus:bg-white transition-all shadow-sm"
                        />
                    </div>

                    {selectedParty && (
                        <div className="rounded-2xl border border-blue-200 bg-blue-50/15 p-4 flex flex-wrap items-center justify-between gap-4 shadow-sm">
                            <div className="flex gap-3">
                                <div className="h-10 w-10 rounded-xl bg-blue-100 border border-blue-200 flex items-center justify-center text-blue-600">
                                    <User className="h-5 w-5" />
                                </div>
                                <div>
                                    <div className="flex items-center gap-2">
                                        <h3 className="text-sm font-bold text-neutral-800">{selectedParty.name}</h3>
                                        <span className="text-[9px] font-bold font-mono py-0.5 px-2 rounded-full bg-slate-850 text-slate-600 border border-slate-200">
                                            {selectedParty.party_code}
                                        </span>
                                    </div>
                                    <p className="text-xs text-slate-500 mt-0.5">{selectedParty.city}, {selectedParty.province || ''}</p>
                                </div>
                            </div>
                            <div className="flex gap-4">
                                <div className="text-right">
                                    <span className="text-[9px] text-slate-505 uppercase block font-semibold">Total Due</span>
                                    <span className="text-sm font-extrabold text-neutral-800">रु {selectedParty.total_due.toLocaleString()}</span>
                                </div>
                                <button
                                    onClick={() => setParty(null)}
                                    className="text-xs font-bold text-blue-600 hover:text-blue-700 hover:underline self-center"
                                >
                                    Change
                                </button>
                            </div>
                        </div>
                    )}

                    <div className="rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden">
                        <div className="border-b border-slate-200 px-4 py-3 bg-slate-900 flex items-center justify-between">
                            <span className="text-xs font-bold text-neutral-800">Registered Accounts ({filteredParties.length})</span>
                            {partyLoading && <span className="text-xs text-slate-500 animate-pulse">Loading list...</span>}
                        </div>

                        <div className="divide-y divide-slate-100 max-h-[350px] overflow-y-auto">
                            {filteredParties.length === 0 ? (
                                <div className="p-8 text-center text-xs text-slate-500">
                                    No customer records matched your query terms.
                                </div>
                            ) : (
                                filteredParties.map((p) => {
                                    const isSelected = selectedParty?.id === p.id
                                    return (
                                        <div
                                            key={p.id}
                                            onClick={() => {
                                                setParty(p)
                                                setStep(2) // Auto jump to Step 2
                                            }}
                                            className={`p-4 flex items-center justify-between cursor-pointer hover:bg-slate-900 transition-colors ${isSelected ? 'bg-blue-50/40' : ''
                                                }`}
                                        >
                                            <div className="flex gap-3 min-w-0 pr-4">
                                                <div className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 border ${isSelected ? 'bg-blue-105 border-blue-200 text-blue-600' : 'bg-slate-900 border-slate-200 text-slate-500'
                                                    }`}>
                                                    <User className="h-4 w-4" />
                                                </div>
                                                <div className="min-w-0">
                                                    <h4 className="text-xs font-bold text-neutral-800 truncate">{p.name}</h4>
                                                    <p className="text-[10px] text-slate-500 truncate mt-0.5">
                                                        {p.party_code} • {p.city || 'No City'}
                                                    </p>
                                                </div>
                                            </div>

                                            <div className="text-right shrink-0">
                                                <span className="text-[9px] text-slate-500 block">Dues</span>
                                                <span className="text-xs font-extrabold text-neutral-800">रु {p.total_due.toLocaleString()}</span>
                                            </div>
                                        </div>
                                    )
                                })
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* STEP 2: CART SELECT (PRODUCTS GRID WITH COUNTERS) */}
            {step === 2 && (
                <div className="space-y-4">
                    {/* Filters Toolbar */}
                    <div className="grid gap-4 sm:grid-cols-3 mb-4 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
                        <div className="relative sm:col-span-1">
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-600" />
                            <input
                                type="text"
                                placeholder="Search products..."
                                value={productQuery}
                                onChange={(e) => setProductQuery(e.target.value)}
                                className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-11 pr-4 py-3 text-sm text-slate-800 placeholder:text-neutral-600 focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-50 transition-all font-medium"
                            />
                        </div>

                        {/* Standard Dropdown for Brands */}
                        <div className="relative">
                            <select
                                value={selectedCompany}
                                onChange={(e) => setSelectedCompany(e.target.value)}
                                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-medium text-slate-700 focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-50 transition-all appearance-none cursor-pointer"
                            >
                                <option value="ALL">All Brands</option>
                                {companies.map(c => c !== 'ALL' && <option key={c} value={c}>{c}</option>)}
                            </select>
                            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-slate-500">
                                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                            </div>
                        </div>

                        {/* Standard Dropdown for Categories */}
                        <div className="relative">
                            <select
                                value={selectedCategory}
                                onChange={(e) => setSelectedCategory(e.target.value)}
                                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-medium text-slate-700 focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-50 transition-all appearance-none cursor-pointer"
                            >
                                <option value="ALL">All Categories</option>
                                {categories.map(c => c !== 'ALL' && <option key={c} value={c}>{c}</option>)}
                            </select>
                            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-slate-500">
                                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                            </div>
                        </div>
                    </div>

                    <div className="grid gap-4 md:grid-cols-3">
                        {/* Core Products selector catalog (col-span-2) */}
                        <div className="md:col-span-2 space-y-3">
                            <div className="rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden">
                                <div className="border-b border-slate-200 px-4 py-3 bg-slate-900 flex items-center justify-between text-xs">
                                    <span className="font-bold text-neutral-800">Catalog Products ({filteredProducts.length})</span>
                                    {productLoading && <span className="text-slate-500 animate-pulse">Syncing catalog...</span>}
                                </div>

                                <div className="p-4 overflow-y-auto max-h-[600px] bg-slate-900/30">
                                    {filteredProducts.length === 0 ? (
                                        <div className="p-8 text-center text-xs text-slate-500">
                                            No products match the chosen filters.
                                        </div>
                                    ) : (
                                        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                                            {filteredProducts.map((p) => {
                                                const cartQty = items.find(item => item.product.id === p.id)?.quantity || 0
                                                const localQtyInput = qtyInputs[p.id] || "1"
                                                return (
                                                    <div key={p.id} className="group relative rounded-2xl glass-card p-4 hover:scale-[1.01] transition-all flex flex-col justify-between cursor-pointer border border-slate-800 bg-slate-900/40">
                                                        <div>
                                                            <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-slate-950/60 border border-slate-850 flex items-center justify-center mb-3">
                                                                {p.image_url ? (
                                                                    <img src={p.image_url} alt={p.product_name} className="h-full w-full object-contain" loading="lazy" />
                                                                ) : (
                                                                    <span className="text-[8px] font-mono text-slate-600">NO IMAGE</span>
                                                                )}
                                                            </div>
                                                            <div className="flex items-center justify-between gap-1 mb-1">
                                                                <span className="text-[8px] font-bold uppercase tracking-wider py-0.5 px-2 rounded-full bg-slate-850 text-neutral-600">
                                                                    {p.company || 'Generic'}
                                                                </span>
                                                                {p.ref_code && <span className="text-[9px] font-mono font-bold text-amber-500">{p.ref_code}</span>}
                                                            </div>
                                                            <div className="flex items-center justify-between mt-1 gap-2">
                                                                <h4 className="text-xs font-bold text-neutral-900 group-hover:text-neutral-900 leading-snug">{p.product_name}</h4>
                                                                <Info onClick={() => setSelectedDetailProduct(p)} className="h-4 w-4 text-neutral-600 hover:text-blue-500 cursor-pointer shrink-0" />
                                                            </div>
                                                            <div className="flex gap-2">
                                                                <div className="text-[9px] text-slate-500 mt-1">{p.category}</div>
                                                                <div className="text-[9px] text-slate-500 mt-1">Unit: {p.unit}</div>
                                                            </div>
                                                        </div>
                                                        <div className="mt-3 pt-3 border-t border-slate-850 flex flex-col gap-2">
                                                            <div className="flex justify-between items-center">
                                                                <span className="text-xs font-bold text-amber-500">रु {p.mrp ? p.mrp.toLocaleString() : 'N/A'}</span>
                                                                {cartQty > 0 && <span className="text-[9px] font-bold bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded">In Cart: {cartQty}</span>}
                                                            </div>

                                                            <div className="flex items-center gap-1.5 justify-between bg-slate-950 rounded-xl p-1 border border-slate-800">
                                                                <div className="flex items-center">
                                                                    <button onClick={() => setQtyInputs(prev => ({ ...prev, [p.id]: String(Math.max(1, parseInt(localQtyInput || "1") - 1)) }))} className="w-7 h-7 bg-slate-900 border border-slate-700 rounded-lg text-neutral-700 font-bold hover:bg-slate-800">-</button>
                                                                    <input
                                                                        type="number"
                                                                        min="1"
                                                                        className="w-10 bg-transparent text-center text-xs text-neutral-800 font-bold focus:outline-none"
                                                                        value={localQtyInput}
                                                                        onChange={(e) => setQtyInputs(prev => ({ ...prev, [p.id]: e.target.value }))}
                                                                    />
                                                                    <button onClick={() => setQtyInputs(prev => ({ ...prev, [p.id]: String(parseInt(localQtyInput || "0") + 1) }))} className="w-7 h-7 bg-slate-900 border border-slate-700 rounded-lg text-neutral-700 font-bold hover:bg-slate-800">+</button>
                                                                </div>
                                                                <button onClick={() => {
                                                                    addItem(p, parseInt(localQtyInput || "1"));
                                                                }} className="flex-1 bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-[10px] uppercase py-1.5 rounded-lg transition-colors">
                                                                    {cartQty > 0 ? "Update" : "Add"}
                                                                </button>
                                                            </div>
                                                        </div>
                                                    </div>
                                                )
                                            })}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Cart Summary Panel (col-span-1) */}
                        <div className="space-y-4">
                            <div className="rounded-2xl border border-slate-205 bg-slate-900/40 p-4 shadow-sm">
                                <div className="flex justify-between items-center pb-3 border-b border-slate-205">
                                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5 font-outfit">
                                        <ShoppingCart className="h-4 w-4 text-blue-600" /> Basket
                                    </h3>
                                    <button
                                        onClick={clearCart}
                                        disabled={items.length === 0}
                                        className="text-[10px] text-rose-600 hover:text-rose-700 font-bold uppercase disabled:opacity-50 cursor-pointer"
                                    >
                                        Clear
                                    </button>
                                </div>

                                <div className="divide-y divide-slate-100 max-h-[220px] overflow-y-auto mt-2">
                                    {items.length === 0 ? (
                                        <div className="py-8 text-center text-xs text-slate-500 font-semibold flex flex-col items-center justify-center gap-1">
                                            <ShoppingCart className="h-6 w-6 stroke-1 text-neutral-600" />
                                            <span>Cart is empty</span>
                                        </div>
                                    ) : (
                                        items.map((item) => (
                                            <div key={item.product.id} className="py-2.5 flex flex-col gap-1 text-xs">
                                                <div className="flex items-center justify-between">
                                                    <div className="min-w-0 pr-2">
                                                        <span className="font-semibold text-neutral-800 block truncate">{item.product.product_name}</span>
                                                        <div className="flex items-center gap-2 mt-1">
                                                            <button onClick={() => updateQuantity(item.product.id, item.quantity - 1)} className="text-neutral-600 bg-slate-900 border border-slate-700 rounded px-1.5 hover:bg-slate-800 font-bold">-</button>
                                                            <input
                                                                type="number"
                                                                min="0"
                                                                className="w-12 bg-slate-900 border border-slate-700 text-neutral-800 text-[10px] font-bold text-center py-0.5 rounded focus:outline-none focus:border-blue-500"
                                                                value={item.quantity}
                                                                onChange={(e) => updateQuantity(item.product.id, Number(e.target.value) || 0)}
                                                            />
                                                            <button onClick={() => updateQuantity(item.product.id, item.quantity + 1)} className="text-neutral-600 bg-slate-900 border border-slate-700 rounded px-1.5 hover:bg-slate-800 font-bold">+</button>
                                                            <span className="text-[10px] text-slate-500 font-mono font-bold ml-1">
                                                                × रु {item.product.mrp?.toLocaleString() || '0'}
                                                            </span>
                                                        </div>
                                                    </div>
                                                    <button
                                                        onClick={() => removeItem(item.product.id)}
                                                        className="text-slate-450 hover:text-rose-605 p-1 rounded-lg hover:bg-rose-50 border border-transparent hover:border-rose-100 transition-colors cursor-pointer"
                                                    >
                                                        <Trash2 className="h-3.5 w-3.5" />
                                                    </button>
                                                </div>

                                                {/* Inline Item Discount */}
                                                {discountType === 'PRODUCT' && (
                                                    <div className="flex items-center gap-1.5 mt-1 bg-blue-50/30 p-1.5 rounded-lg border border-blue-105">
                                                        <span className="text-[10px] text-slate-600 font-bold">Item Disc:</span>
                                                        <input
                                                            type="number"
                                                            min="0"
                                                            max="100"
                                                            value={item.discountPct || 0}
                                                            onChange={(e) => updateDiscount(item.product.id, Number(e.target.value))}
                                                            className="w-12 bg-white border border-slate-205 rounded px-1.5 py-0.5 text-[10px] text-neutral-800 text-center font-bold focus:outline-none focus:border-blue-600"
                                                        />
                                                        <span className="text-[10px] text-slate-500 font-bold">%</span>
                                                    </div>
                                                )}
                                            </div>
                                        ))
                                    )}
                                </div>

                                {/* Discount Scheme Selector Panel */}
                                {items.length > 0 && (
                                    <div className="pt-3 border-t border-slate-205 mt-3 space-y-2">
                                        <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">Discount Scheme</label>
                                        <div className="grid grid-cols-3 gap-1">
                                            {(['NONE', 'PRODUCT', 'OVERALL'] as const).map((type) => (
                                                <button
                                                    key={type}
                                                    type="button"
                                                    onClick={() => setDiscountType(type)}
                                                    className={`py-1 text-[9px] font-bold rounded-lg border transition-all cursor-pointer ${discountType === type
                                                        ? 'bg-blue-50 border-blue-200 text-blue-600'
                                                        : 'bg-white border-slate-205 hover:bg-slate-900 text-slate-500'
                                                        }`}
                                                >
                                                    {type === 'NONE' ? 'None' : type === 'PRODUCT' ? 'Item Pct' : 'Overall Pct'}
                                                </button>
                                            ))}
                                        </div>

                                        {discountType === 'OVERALL' && (
                                            <div className="flex items-center justify-between gap-2 mt-2 bg-blue-50/30 p-2 rounded-xl border border-blue-105">
                                                <span className="text-[10px] text-slate-655 font-bold">% Discount Off:</span>
                                                <div className="flex items-center gap-1">
                                                    <input
                                                        type="number"
                                                        min="0"
                                                        max="100"
                                                        value={overallDiscountPct}
                                                        onChange={(e) => setOverallDiscountPct(Number(e.target.value))}
                                                        className="w-14 bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs text-neutral-800 text-right font-bold focus:outline-none focus:border-blue-600"
                                                    />
                                                    <span className="text-xs text-slate-500 font-bold">%</span>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}

                                <div className="pt-3 border-t border-slate-205 mt-2 space-y-1 bg-slate-900 p-2.5 rounded-xl text-xs">
                                    <div className="flex justify-between items-center text-slate-605">
                                        <span>Total Positions:</span>
                                        <span className="font-semibold text-neutral-800">{items.length}</span>
                                    </div>
                                    <div className="flex justify-between items-center text-slate-605">
                                        <span>Total Quantity:</span>
                                        <span className="font-semibold text-neutral-800">{totalItems}</span>
                                    </div>
                                    <div className="flex justify-between items-center text-slate-605">
                                        <span>Base Subtotal:</span>
                                        <span className="font-semibold text-neutral-800 font-mono font-bold">रु {subtotal.toLocaleString()}</span>
                                    </div>
                                    {discountType === 'PRODUCT' && itemDiscounts > 0 && (
                                        <div className="flex justify-between items-center text-rose-600 font-bold">
                                            <span>Item Discounts:</span>
                                            <span className="font-semibold text-rose-750 font-mono">- रु {itemDiscounts.toLocaleString()}</span>
                                        </div>
                                    )}
                                    {discountType === 'OVERALL' && overallDiscount > 0 && (
                                        <div className="flex justify-between items-center text-rose-600 font-bold">
                                            <span>Overall Disc ({overallDiscountPct}%):</span>
                                            <span className="font-semibold text-rose-750 font-mono">- रु {overallDiscount.toLocaleString()}</span>
                                        </div>
                                    )}
                                    <div className="flex justify-between items-center pt-2 border-t border-slate-205 text-sm font-extrabold text-blue-600">
                                        <span>Net Payable:</span>
                                        <span className="font-mono">रु {finalTotal.toLocaleString()}</span>
                                    </div>
                                </div>

                                <button
                                    onClick={() => setStep(3)}
                                    disabled={items.length === 0}
                                    className="btn-primary-blue w-full mt-4 py-3 text-white font-extrabold text-xs uppercase shadow-lg shadow-blue-600/10 cursor-pointer"
                                >
                                    Proceed to Review
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* STEP 3: FINAL REVIEW & SUBMIT */}
            {step === 3 && (
                <div className="grid gap-6 md:grid-cols-3">
                    {/* Left Column: summary elements */}
                    <div className="md:col-span-2 space-y-4">
                        {/* Customer Header Review Card */}
                        {selectedParty && (
                            <div className="rounded-2xl border border-slate-205 bg-white p-5 space-y-3 shadow-sm">
                                <div className="flex items-center gap-2 text-xs font-bold text-slate-500 uppercase tracking-widest">
                                    <User className="h-4 w-4 text-blue-600" /> Customer Information
                                </div>
                                <div className="pl-6 border-l-2 border-blue-500">
                                    <h3 className="text-base font-extrabold text-neutral-800">{selectedParty.name}</h3>
                                    <div className="grid grid-cols-2 gap-4 mt-3 text-xs">
                                        <div>
                                            <span className="text-slate-500 block">Party Code</span>
                                            <span className="font-mono text-slate-700 font-bold">{selectedParty.party_code}</span>
                                        </div>
                                        {selectedParty.phone && (
                                            <div>
                                                <span className="text-slate-500 block">Contact Phone</span>
                                                <span className="text-slate-700 font-bold">{selectedParty.phone}</span>
                                            </div>
                                        )}
                                        {selectedParty.pan && (
                                            <div>
                                                <span className="text-slate-500 block">PAN Number</span>
                                                <span className="text-slate-700 font-mono font-bold">{selectedParty.pan}</span>
                                            </div>
                                        )}
                                        {selectedParty.city && (
                                            <div>
                                                <span className="text-slate-500 block">Address Location</span>
                                                <span className="text-slate-700 font-medium">{selectedParty.city}, {selectedParty.address || ''}</span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Order Items Summary List */}
                        <div className="rounded-2xl border border-slate-205 bg-white p-5 shadow-sm">
                            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
                                <h3 className="text-xs font-bold text-slate-705 uppercase tracking-wider flex items-center gap-2 font-outfit">
                                    <Package className="h-4 w-4 text-blue-600" /> Order Lines Summary
                                </h3>
                                <button
                                    onClick={() => setStep(2)}
                                    className="text-xs text-blue-600 font-bold hover:text-blue-700 hover:underline cursor-pointer"
                                >
                                    Modify Cart
                                </button>
                            </div>

                            <div className="divide-y divide-slate-100 max-h-[300px] overflow-y-auto mt-2">
                                {items.map((item) => {
                                    const itemDisc = discountType === 'PRODUCT' ? (item.discountPct || 0) : 0
                                    const itemSub = (item.product.mrp || 0) * item.quantity * (1 - itemDisc / 100)
                                    return (
                                        <div key={item.product.id} className="py-3 flex items-center justify-between text-xs hover:bg-slate-900/50 px-2 rounded-lg transition-colors">
                                            <div className="min-w-0 pr-4">
                                                <div className="flex items-center gap-2">
                                                    <span className="font-bold text-neutral-800">{item.product.product_name}</span>
                                                    {item.product.ref_code && (
                                                        <span className="text-[9px] font-mono py-0.2 px-1.5 rounded bg-slate-850 text-slate-600 border border-slate-200 font-bold">
                                                            {item.product.ref_code}
                                                        </span>
                                                    )}
                                                    {itemDisc > 0 && (
                                                        <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-blue-50 text-blue-600 border border-blue-100 animate-pulse">
                                                            {itemDisc}% off
                                                        </span>
                                                    )}
                                                </div>
                                                <span className="text-[10px] text-slate-500 block mt-1">
                                                    Quantity: <span className="font-bold text-slate-700">{item.quantity} {item.product.unit || 'pcs'}</span> • MRP rate: <span className="font-mono">रु {item.product.mrp?.toLocaleString() || '0'}</span>
                                                </span>
                                            </div>
                                            <div className="text-right font-extrabold text-neutral-800 font-mono">
                                                रु {itemSub.toLocaleString()}
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        </div>

                        {/* Notes and documentation box */}
                        <div className="rounded-2xl border border-slate-205 bg-white p-5 space-y-3 shadow-sm">
                            <label className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2 font-outfit">
                                <FileText className="h-4 w-4 text-slate-500" /> Special Shipping instructions / Notes
                            </label>
                            <textarea
                                value={notes}
                                onChange={(e) => setNotes(e.target.value)}
                                rows={3}
                                placeholder="Add shipping instructions, packaging notes, dispatch preferences, pricing remarks..."
                                className="w-full bg-slate-900 border border-slate-205 rounded-xl p-3 text-xs placeholder:text-neutral-600 text-neutral-800 focus:outline-none focus:border-blue-500 focus:bg-white transition-all"
                            />
                        </div>
                    </div>

                    {/* Right Column: Pricing aggregates box and triggers */}
                    <div className="space-y-4">
                        <div className="rounded-2xl border border-slate-205 bg-slate-900/50 p-5 space-y-4 shadow-md">
                            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 font-outfit">Receipt Summary</h3>

                            <div className="space-y-2 text-xs">
                                <div className="flex justify-between text-slate-500">
                                    <span>Total Positions:</span>
                                    <span className="font-semibold text-neutral-800">{items.length}</span>
                                </div>
                                <div className="flex justify-between text-slate-500">
                                    <span>Total Quantity:</span>
                                    <span className="font-semibold text-neutral-800">{totalItems} units</span>
                                </div>
                                <div className="flex justify-between text-slate-500">
                                    <span>Base Value:</span>
                                    <span className="font-semibold text-neutral-800 font-mono">रु {subtotal.toLocaleString()}</span>
                                </div>
                                {discountType === 'PRODUCT' && itemDiscounts > 0 && (
                                    <div className="flex justify-between text-rose-600 font-bold">
                                        <span>Product-wise Discounts:</span>
                                        <span className="font-semibold text-rose-700 font-mono">- रु {itemDiscounts.toLocaleString()}</span>
                                    </div>
                                )}
                                {discountType === 'OVERALL' && overallDiscount > 0 && (
                                    <div className="flex justify-between text-rose-600 font-bold">
                                        <span>Overall Discount ({overallDiscountPct}%):</span>
                                        <span className="font-semibold text-rose-700 font-mono">- रु {overallDiscount.toLocaleString()}</span>
                                    </div>
                                )}
                                <div className="flex justify-between text-slate-500">
                                    <span>Shipping / Delivery:</span>
                                    <span className="font-extrabold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">FREE</span>
                                </div>
                                <div className="border-t border-slate-205 pt-3 flex justify-between text-base font-black text-blue-600">
                                    <span>Net Payable:</span>
                                    <span className="font-mono">रु {finalTotal.toLocaleString()}</span>
                                </div>
                            </div>

                            {/* Alert for Offline submission */}
                            {!isOnline && (
                                <div className="rounded-xl bg-orange-50 border border-orange-200 p-3 text-[10px] text-orange-700 font-bold flex items-start gap-2 leading-relaxed">
                                    <WifiOff className="h-4 w-4 text-orange-600 shrink-0 mt-0.5" />
                                    <span>Offline Mode is active. Clicking submit will save this order into local storage and sync later.</span>
                                </div>
                            )}

                            <button
                                onClick={handleSubmitOrder}
                                disabled={submitting || items.length === 0}
                                className={`w-full py-4 text-center text-xs font-black uppercase rounded-2xl shadow-lg transition-all focus:outline-none cursor-pointer flex items-center justify-center gap-2 ${submitting
                                    ? 'bg-slate-200 text-neutral-600 cursor-not-allowed'
                                    : isOnline
                                        ? 'btn-primary-blue text-white shadow-blue-600/10'
                                        : 'bg-emerald-650 hover:bg-emerald-700 text-white shadow-emerald-600/10 active:scale-95'
                                    }`}
                            >
                                {submitting ? (
                                    <>
                                        <Layers className="h-4 w-4 animate-spin text-neutral-600" />
                                        <span>Submitting...</span>
                                    </>
                                ) : isOnline ? (
                                    <span>Finalize & Submit Order</span>
                                ) : (
                                    <span>Save Offline Draft</span>
                                )}
                            </button>

                            <button
                                onClick={() => setStep(2)}
                                className="w-full py-2.5 text-center text-slate-500 hover:text-slate-700 font-bold text-xs hover:bg-slate-105 rounded-xl transition-all cursor-pointer border border-transparent hover:border-slate-200"
                            >
                                Back to Selection
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Product Detail Modal/Drawer Overlay (Amazon Style) */}
            {selectedDetailProduct && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-955/40 p-4 backdrop-blur-sm">
                    <div className="relative w-full max-w-2xl rounded-3xl border border-slate-205 bg-white p-6 shadow-2xl max-h-[90vh] overflow-y-auto animate-in fade-in zoom-in-95 duration-200 font-outfit">
                        <button
                            onClick={() => setSelectedDetailProduct(null)}
                            className="absolute right-4 top-4 rounded-xl bg-slate-850 hover:bg-slate-200 p-2 text-slate-500 hover:text-neutral-800 border border-slate-200 transition-colors cursor-pointer"
                        >
                            <X className="h-5 w-5" />
                        </button>

                        <div className="grid gap-6 md:grid-cols-2 mt-4">
                            {/* Visual Asset Container */}
                            <div className="relative aspect-square w-full rounded-2xl bg-slate-900 flex items-center justify-center p-6 border border-slate-200 shadow-inner">
                                {selectedDetailProduct.image_url ? (
                                    <img
                                        src={selectedDetailProduct.image_url}
                                        alt={selectedDetailProduct.product_name}
                                        className="max-h-full max-w-full object-contain"
                                        onError={(e) => {
                                            e.currentTarget.style.display = 'none'
                                            const fallback = e.currentTarget.parentElement?.querySelector('.modal-fallback')
                                            if (fallback) fallback.classList.remove('hidden')
                                        }}
                                    />
                                ) : null}
                                <div className={`modal-fallback flex flex-col items-center justify-center text-neutral-600 ${selectedDetailProduct.image_url ? 'hidden' : ''}`}>
                                    <Layers className="h-16 w-16 text-neutral-700 mb-2" />
                                    <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-neutral-600">No Image Available</span>
                                </div>
                            </div>

                            {/* Detail Specs Frame */}
                            <div className="flex flex-col justify-between space-y-4">
                                <div>
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className="text-[9px] font-bold uppercase tracking-wider py-0.5 px-2.5 rounded-full bg-slate-850 text-slate-700 border border-slate-200">
                                            {selectedDetailProduct.company || 'Generic'}
                                        </span>
                                        {selectedDetailProduct.ref_code && (
                                            <span className="text-xs font-mono font-extrabold py-1 px-3 rounded-xl bg-blue-50 text-blue-600 border border-blue-100">
                                                Ref No: {selectedDetailProduct.ref_code}
                                            </span>
                                        )}
                                    </div>

                                    <h2 className="mt-3 text-xl font-extrabold text-neutral-800 tracking-tight leading-snug">{selectedDetailProduct.product_name}</h2>
                                    <p className="text-xs text-slate-505 font-semibold mt-1">
                                        Category: <span className="font-bold text-slate-705">{selectedDetailProduct.category}</span> {selectedDetailProduct.sub_category ? `• ${selectedDetailProduct.sub_category}` : ''}
                                    </p>
                                </div>

                                {/* MRP card */}
                                <div className="rounded-xl border border-slate-200 bg-slate-900 p-4">
                                    <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest block font-mono">Maximum Retail Price</span>
                                    <div className="flex items-baseline gap-1 mt-1 font-outfit">
                                        <span className="text-2xl font-black text-blue-600 font-mono">
                                            {selectedDetailProduct.mrp ? `रु ${selectedDetailProduct.mrp.toLocaleString('en-NP', { minimumFractionDigits: 2 })}` : 'N/A'}
                                        </span>
                                        <span className="text-xs text-slate-550 font-semibold">/ {selectedDetailProduct.unit || 'pcs'}</span>
                                    </div>
                                </div>

                                <div className="rounded-xl bg-slate-850/50 border border-slate-205 p-3">
                                    <span className="text-[8px] font-bold text-slate-500 uppercase tracking-wide block">Order Unit</span>
                                    <span className="text-sm font-bold text-neutral-800 mt-0.5 block">
                                        {selectedDetailProduct.unit || 'pcs'}
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* Packaging rules & series tables */}
                        <div className="mt-6 space-y-4">
                            {selectedDetailProduct.specification && (
                                <div className="rounded-xl bg-slate-900 border border-slate-200 p-4 font-outfit">
                                    <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Technical Description & Specs</h4>
                                    <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-line bg-white p-3 rounded-lg border border-slate-205 font-medium">
                                        {selectedDetailProduct.specification}
                                    </p>
                                </div>
                            )}

                            {/* Standard Packaging Rules Grid */}
                            <div className="rounded-xl border border-slate-200 bg-slate-900 p-4 shadow-sm font-outfit">
                                <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-3">Logistic Packaging Configurations</h4>
                                <div className="grid grid-cols-3 gap-4 text-center">
                                    <div className="border-r border-slate-200">
                                        <span className="text-[9px] font-bold text-slate-500 uppercase block font-outfit">Pcs / Packet</span>
                                        <span className="text-lg font-extrabold text-neutral-800 mt-1 block font-mono">
                                            {selectedDetailProduct.packing_pcs || '—'}
                                        </span>
                                    </div>
                                    <div className="border-r border-slate-200">
                                        <span className="text-[9px] font-bold text-slate-550 uppercase block font-outfit">Pcs / Box</span>
                                        <span className="text-lg font-extrabold text-neutral-800 mt-1 block font-mono">
                                            {selectedDetailProduct.packing_bx || '—'}
                                        </span>
                                    </div>
                                    <div>
                                        <span className="text-[9px] font-bold text-slate-555 uppercase block font-outfit">Pcs / Carton</span>
                                        <span className="text-lg font-extrabold text-neutral-800 mt-1 block font-mono">
                                            {selectedDetailProduct.packing_car || '—'}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
