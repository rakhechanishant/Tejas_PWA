import React, { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { db } from '../lib/db'
import { useLiveQuery } from 'dexie-react-hooks'
import { BillingService } from '../lib/billingService'
import { ReturnService } from '../lib/returnService'
import { getPrintLayoutCSS, renderSalesBillHTML, renderDebitNoteHTML } from '../lib/printTemplates'
import {
    Plus,
    WifiOff,
    RefreshCw,
    Calendar,
    Layers,
    X,
    User,
    Package,
    FileText,
    CheckCircle2,
    XCircle,
    AlertCircle,
    Info
} from 'lucide-react'

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

export const Orders: React.FC = () => {
    const location = useLocation()
    const { profile } = useAuth()
    const navigate = useNavigate()

    // --- Returns State ---
    const [showReturnModal, setShowReturnModal] = useState(false)
    const [returnQuantities, setReturnQuantities] = useState<Record<number, number>>({})
    const [returnNotes, setReturnNotes] = useState('')
    const [liveOrders, setLiveOrders] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [syncing, setSyncing] = useState(false)
    const [returnContext, setReturnContext] = useState<{ to: string, ledger: string | null } | null>(null)
    const [isOnline, setIsOnline] = useState(navigator.onLine)
    const [syncMsg, setSyncMsg] = useState('')

    // Phase 4 additions: State control hooks
    const [activeTab, setActiveTab] = useState<'all' | 'pending' | 'pending_fulfillment' | 'completed'>('all')
    const [selectedDetailedOrder, setSelectedDetailedOrder] = useState<any | null>(null)
    const [profiles, setProfiles] = useState<any[]>([])
    const [acting, setActing] = useState(false)
    const [billNumber, setBillNumber] = useState<string>('')
    const [invoiceNumber, setInvoiceNumber] = useState<string>('')
    const [billingRemarks, setBillingRemarks] = useState<string>('')
    const [fulfillmentRemarksInput, setFulfillmentRemarksInput] = useState<string>('')
    const [isBilledGenerated, setIsBilledGenerated] = useState(false)

    // Payment Integration inside Order Details
    const [orderPayments, setOrderPayments] = useState<any[]>([])
    const [loadingOrderPayments, setLoadingOrderPayments] = useState(false)
    const [quickPayAmount, setQuickPayAmount] = useState('')
    const [quickPayMethod, setQuickPayMethod] = useState('CASH')
    const [quickPayReference, setQuickPayReference] = useState('')
    const [quickPayNotes, setQuickPayNotes] = useState('')
    const [showQuickPayForm, setShowQuickPayForm] = useState(false)

    useEffect(() => {
        if (selectedDetailedOrder?.id) {
            fetchOrderPayments(selectedDetailedOrder.id)
            setQuickPayAmount(selectedDetailedOrder.due_amount?.toString() || '')
            setQuickPayMethod('CASH')
            setQuickPayReference('')
            setQuickPayNotes('')
            setShowQuickPayForm(false)
            setBillNumber(selectedDetailedOrder.bill_number || '')
            setInvoiceNumber(selectedDetailedOrder.invoice_number || '')
            setBillingRemarks(selectedDetailedOrder.billing_remarks || '')
            setIsBilledGenerated(!!(selectedDetailedOrder.bill_number && selectedDetailedOrder.invoice_number))
        } else {
            setOrderPayments([])
            setBillNumber('')
            setInvoiceNumber('')
            setBillingRemarks('')
            setIsBilledGenerated(false)
        }
    }, [selectedDetailedOrder?.id])

    // Parameter-based deep linking: automatically open details modal for ?openOrder=ID
    useEffect(() => {
        const params = new URLSearchParams(location.search)
        const openOrderIdStr = params.get('openOrder')
        if (openOrderIdStr && liveOrders.length > 0) {
            const orderIdVal = parseInt(openOrderIdStr, 10)
            if (!isNaN(orderIdVal)) {
                const foundOrder = liveOrders.find(o => o.id === orderIdVal)
                if (foundOrder) {
                    setSelectedDetailedOrder(foundOrder)
                }
            }
        }
    }, [location.search, liveOrders])

    const fetchOrderPayments = async (orderId: number) => {
        setLoadingOrderPayments(true)
        try {
            const { data, error } = await supabase
                .from('payments')
                .select(`
                    id,
                    amount,
                    method,
                    reference,
                    payment_date,
                    notes,
                    profiles ( name )
                `)
                .eq('order_id', orderId)
                .order('created_at', { ascending: false })

            if (error) throw error
            setOrderPayments(data || [])
        } catch (err) {
            console.error('Error fetching order payments:', err)
        } finally {
            setLoadingOrderPayments(false)
        }
    }

    // Fetch local pending offline orders from Dexie
    const offlineOrders = useLiveQuery(
        () => db.offline_orders.where('synced').equals(0).toArray()
    ) || []

    // Network status listener
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

    // Trigger auto-sync when network gets online
    useEffect(() => {
        if (isOnline && offlineOrders.length > 0 && !syncing) {
            triggerBackgroundSync()
        }
    }, [isOnline, offlineOrders.length])

    useEffect(() => {
        if (profile?.id) {
            fetchLiveOrders()
            fetchProfiles()
        }
    }, [profile?.id])

    // Auto-open modal if requested via URL
    useEffect(() => {
        const params = new URLSearchParams(location.search)
        const openOrderId = params.get('openOrder')
        const returnToMenu = params.get('returnTo')
        const returnLedger = params.get('returnLedger')

        if (openOrderId && liveOrders.length > 0) {
            const ord = liveOrders.find((o) => String(o.id) === openOrderId || o.order_number === openOrderId)
            if (ord && selectedDetailedOrder?.id !== ord.id) {
                setSelectedDetailedOrder(ord)
                if (returnToMenu) {
                    setReturnContext({ to: returnToMenu, ledger: returnLedger })
                }
                // clear URL so refreshing doesn't replay it
                navigate(location.pathname, { replace: true })
            }
        }
    }, [location.search, liveOrders, navigate, selectedDetailedOrder?.id])

    const fetchProfiles = async () => {
        try {
            const { data, error } = await supabase
                .from('profiles')
                .select('id, name, role')
                .eq('is_active', true)
            if (error) throw error
            setProfiles(data || [])
        } catch (err) {
            console.error('Error fetching team profiles:', err)
        }
    }

    const fetchLiveOrders = async () => {
        if (!profile?.id) return
        setLoading(true)
        try {
            // Join parties to get customer name
            const { data, error } = await supabase
                .from('orders')
                .select(`
                    id,
                    order_number,
                    party_id,
                    status,
                    total_amount,
                    due_amount,
                    amount_paid,
                    notes,
                    created_by,
                    assigned_to,
                    bill_number,
                    invoice_number,
                    billing_remarks,
                    billed_at,
                    billed_by,
                    fulfillment_remarks,
                    packed_at,
                    dispatched_at,
                    delivered_at,
                    created_at,
                    parties (
                        id,
                        party_code,
                        Parties_name,
                        contact_number,
                        pan_no,
                        address,
                        city
                    ),
                    order_items (
                        id,
                        quantity,
                        unit_price,
                        subtotal,
                        product_id,
                        products (
                            id,
                            product_name,
                            ref_code,
                            unit,
                            mrp
                        )
                    ),
                    returns (
                        id,
                        total_refund,
                        created_at,
                        return_items (
                            product_id,
                            quantity_returned,
                            refund_amount
                        )
                    )
                `)
                .order('created_at', { ascending: false })

            if (error) throw error
            setLiveOrders(data || [])
        } catch (err: any) {
            console.error('Error fetching live orders:', err)
        } finally {
            setLoading(false)
        }
    }

    const triggerBackgroundSync = async () => {
        if (offlineOrders.length === 0 || syncing || !profile?.id) return
        setSyncing(true)
        setSyncMsg('Synchronizing offline drafts...')
        let successCount = 0

        try {
            for (const order of offlineOrders) {
                const discType = order.discountType || 'NONE'
                const overallPct = order.overallDiscountPct || 0

                // Serialize discount details into order notes
                const itemsDiscountList = order.items.map(item => ({
                    id: item.product.id,
                    discountPct: item.discountPct || 0
                }))

                const discountData = {
                    type: discType,
                    overallPct: overallPct,
                    items: itemsDiscountList.reduce((acc, item) => {
                        if (item.discountPct > 0) acc[item.id] = item.discountPct;
                        return acc;
                    }, {} as Record<number, number>)
                }
                const parsed = parseOrderNotesAndDiscounts(order.notes)
                const plainNotes = parsed.notes
                const serializedNotes = `${plainNotes.trim()} ||DISCOUNTS:${JSON.stringify(discountData)}||`.trim()

                // Submit order to Supabase via RPC
                const { data: responseData, error: orderError } = await supabase.rpc('submit_order', {
                    p_party_id: order.party_id,
                    p_items: order.items.map(item => {
                        const price = item.product.mrp || 0
                        let discountPct = 0
                        if (discType === 'PRODUCT') discountPct = item.discountPct || 0
                        else if (discType === 'OVERALL') discountPct = overallPct || 0
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

                // Mark synced in Dexie (simply delete it to clean the queue)
                if (order.id !== undefined) {
                    await db.offline_orders.delete(order.id)
                    successCount++
                }
            }

            setSyncMsg(`Synced ${successCount} order(s) successfully!`)
            setTimeout(() => setSyncMsg(''), 3000)
            fetchLiveOrders()
        } catch (err: any) {
            console.error('Error during auto-sync:', err)
            setSyncMsg(`Sync failed: ${err.message || 'Unknown error'}`)
            setTimeout(() => setSyncMsg(''), 6000)
        } finally {
            setSyncing(false)
        }
    }

    const getCardBorder = (status: string) => {
        switch (status) {
            case 'CONFIRMED':
                return 'border-l-4 border-l-amber-500'
            case 'PENDING_FULFILLMENT':
                return 'border-l-4 border-l-blue-600'
            case 'PACKED':
                return 'border-l-4 border-l-emerald-500'
            default:
                return 'border-l-4 border-l-slate-350'
        }
    }

    const getStatusStyles = (status: string) => {
        switch (status) {
            case 'CONFIRMED':
                return 'bg-amber-50 text-amber-705 border-amber-200'
            case 'PENDING_FULFILLMENT':
                return 'bg-blue-50 text-blue-700 border-blue-200'
            case 'PACKED':
                return 'bg-emerald-50 text-emerald-707 border-emerald-200'
            case 'CANCELLED':
                return 'bg-rose-50 text-rose-700 border-rose-200'
            default:
                return 'bg-slate-900 text-slate-650 border-slate-200'
        }
    }

    const showPendingTab = profile?.role === 'ADMIN' || profile?.role === 'MANAGER'
    const filteredLiveOrders = liveOrders.filter((ord) => {
        if (activeTab === 'pending') {
            return ord.status === 'CONFIRMED'
        }
        if (activeTab === 'pending_fulfillment') {
            return ord.status === 'PENDING_FULFILLMENT'
        }
        if (activeTab === 'completed') {
            return ord.status === 'PACKED'
        }
        return true
    })

    const handleProcessReturn = async () => {
        if (!profile?.id || !selectedDetailedOrder) return
        if (Object.keys(returnQuantities).length === 0 || Object.values(returnQuantities).every(q => q === 0)) {
            alert("Please specify at least one item to return.")
            return
        }

        setActing(true)
        try {
            const { discounts } = parseOrderNotesAndDiscounts(selectedDetailedOrder.notes)

            const payloadItems = (selectedDetailedOrder.order_items || [])
                .map((item: any) => {
                    const qty = returnQuantities[item.product_id] || 0
                    if (qty <= 0) return null

                    // Compute Net Price for this item based on parsed notes
                    const itemDiscPct = discounts?.items?.[item.product_id] || 0
                    const overallDiscPct = discounts?.overallPct || 0
                    const mrp = Number(item.unit_price)

                    let netPrice = mrp
                    if (itemDiscPct > 0) netPrice = netPrice - (netPrice * (itemDiscPct / 100))
                    if (overallDiscPct > 0) netPrice = netPrice - (netPrice * (overallDiscPct / 100))

                    return {
                        product_id: item.product_id,
                        quantity_returned: qty,
                        refund_amount: Number((netPrice * qty).toFixed(2))
                    }
                })
                .filter(Boolean) as any[]

            if (payloadItems.length === 0) {
                alert("No valid items to return.")
                return
            }

            const res = await ReturnService.processReturn({
                orderId: selectedDetailedOrder.id,
                partyId: selectedDetailedOrder.party_id,
                items: payloadItems,
                recordedBy: profile.id,
                notes: returnNotes.trim() || undefined,
                originalDue: Number(selectedDetailedOrder.due_amount)
            })

            if (res.success) {
                alert(`Sales return processed successfully! Debit Note Issued: ${res.debitNoteNumber}`)

                // Auto-print Debit Note
                const printWindow = window.open('', '_blank', 'width=900,height=700')
                if (printWindow) {
                    const detailItems = payloadItems.map(pi => {
                        const matchedItem = selectedDetailedOrder.order_items.find((oi: any) => oi.product_id === pi.product_id)
                        return {
                            product_name: matchedItem?.products?.product_name || 'Product',
                            quantity_returned: pi.quantity_returned,
                            refund_amount: pi.refund_amount
                        }
                    })

                    const html = renderDebitNoteHTML(
                        selectedDetailedOrder,
                        res.debitNoteNumber,
                        detailItems,
                        returnNotes.trim()
                    )
                    const css = getPrintLayoutCSS()

                    printWindow.document.write(`
                        <html>
                            <head>
                                <title>Debit Note - ${res.debitNoteNumber}</title>
                                <style>${css}</style>
                            </head>
                            <body>
                                ${html}
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

                setShowReturnModal(false)
                setSelectedDetailedOrder(null)
                setReturnQuantities({})
                setReturnNotes('')
                fetchLiveOrders()
            }
        } catch (err: any) {
            console.error(err)
            alert('Error processing return: ' + (err.message || 'Operation failed'))
        } finally {
            setActing(false)
        }
    }

    const getProfileName = (id: string | null) => {
        if (!id) return 'Unassigned'
        const p = profiles.find((prof) => prof.id === id)
        return p ? `${p.name} (${p.role})` : 'Unknown Staff'
    }

    return (
        <div className="space-y-6">
            {/* Header controls strip */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-slate-900">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-slate-100 sm:text-3xl">Order Management</h1>
                    <p className="text-sm text-slate-400">Record sales orders, manage offline database, and track deliveries</p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                    <button
                        onClick={fetchLiveOrders}
                        className="rounded-xl bg-white border border-blue-600 p-2.5 text-blue-600 hover:bg-blue-50 active:scale-95 transition-all duration-200 cursor-pointer shadow-sm"
                        title="Reload live feeds"
                    >
                        <RefreshCw className={`h-4.5 w-4.5 ${loading ? 'animate-spin' : ''}`} />
                    </button>

                    <Link
                        to="/orders/new"
                        className="btn-primary-blue flex items-center gap-2 py-2.5 px-4 font-bold text-xs uppercase rounded-xl shadow-md"
                    >
                        <Plus className="h-4 w-4 stroke-[3]" />
                        Place New Order
                    </Link>
                </div>
            </div>

            {/* Offline sync status toast */}
            {syncMsg && (
                <div role="status" className="rounded-xl border border-amber-800 bg-amber-955/20 px-4 py-3 text-xs font-bold text-amber-500 flex items-center gap-2 animate-pulse">
                    <RefreshCw className="h-4 w-4 animate-spin shrink-0" />
                    <span>{syncMsg}</span>
                </div>
            )}

            {/* DUAL CORES: Offline Draft Queue */}
            {offlineOrders.length > 0 && (
                <div className="space-y-3">
                    <div className="flex items-center justify-between">
                        <h2 className="text-xs font-black uppercase text-rose-500 tracking-wider flex items-center gap-2">
                            <WifiOff className="h-4 w-4" /> Pending Offline Sync ({offlineOrders.length})
                        </h2>
                        {isOnline ? (
                            <button
                                onClick={triggerBackgroundSync}
                                disabled={syncing}
                                className="text-xs bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300 py-1 px-3 rounded-lg font-semibold flex items-center gap-1.5 transition-colors"
                            >
                                <RefreshCw className={`h-3 w-3 ${syncing ? 'animate-spin' : ''}`} />
                                Sync Now
                            </button>
                        ) : (
                            <span className="text-[10px] text-slate-500 font-medium">Reconnect to sync automatically</span>
                        )}
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        {offlineOrders.map((order) => {
                            // Calculate subtotal
                            const subtotal = order.items.reduce((sum, item) => sum + (item.product.mrp || 0) * item.quantity, 0)
                            let totalAmount = subtotal
                            const discType = order.discountType || 'NONE'
                            const overallPct = order.overallDiscountPct || 0

                            if (discType === 'PRODUCT') {
                                const discountSum = order.items.reduce((sum, item) => {
                                    const pct = item.discountPct || 0
                                    return sum + (item.product.mrp || 0) * item.quantity * (pct / 100)
                                }, 0)
                                totalAmount = subtotal - discountSum
                            } else if (discType === 'OVERALL') {
                                totalAmount = subtotal * (1 - overallPct / 100)
                            }
                            return (
                                <div key={order.id} className="rounded-2xl border border-rose-900/40 bg-rose-955/5 p-5 relative overflow-hidden backdrop-blur-sm">
                                    <div className="flex justify-between items-start gap-2">
                                        <div className="min-w-0">
                                            <h3 className="text-sm font-bold text-slate-200 truncate">{order.party_name}</h3>
                                            <div className="flex items-center gap-1.5 mt-1 text-[10px] text-slate-500 font-semibold font-mono">
                                                <Calendar className="h-3 w-3 text-slate-600" />
                                                <span>{new Date(order.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                            </div>
                                        </div>
                                        <span className="text-xs font-black py-0.5 px-2 bg-rose-500/10 text-rose-500 border border-rose-900/30 rounded-lg">
                                            OFFLINE
                                        </span>
                                    </div>

                                    {/* Items previews */}
                                    <div className="mt-4 border-t border-slate-850/40 pt-3 text-[11px] text-slate-450 space-y-1">
                                        {order.items.map((item, idx) => {
                                            const hasItemDisc = discType === 'PRODUCT' && (item.discountPct || 0) > 0
                                            return (
                                                <div key={idx} className="flex justify-between">
                                                    <span className="truncate pr-4">
                                                        {item.product.product_name}
                                                        {hasItemDisc && (
                                                            <span className="text-[10px] text-amber-500 font-bold ml-1.5">
                                                                ({item.discountPct}% off)
                                                            </span>
                                                        )}
                                                    </span>
                                                    <span className="font-semibold text-slate-350 shrink-0">×{item.quantity}</span>
                                                </div>
                                            )
                                        })}
                                    </div>

                                    <div className="mt-4 pt-3 border-t border-slate-850/50 flex flex-col gap-1">
                                        {discType !== 'NONE' && (
                                            <div className="flex justify-between items-baseline text-[10px]">
                                                <span className="text-slate-500 font-semibold">Discount ({discType === 'PRODUCT' ? 'Item' : 'Overall'}):</span>
                                                <span className="text-amber-500 font-bold">
                                                    {discType === 'PRODUCT' ? 'Product-wise' : `${overallPct}%`}
                                                </span>
                                            </div>
                                        )}
                                        <div className="flex justify-between items-baseline">
                                            <span className="text-[10px] uppercase text-slate-500 font-extrabold tracking-wider">Est. Total</span>
                                            <span className="text-base font-extrabold text-amber-500">रु {totalAmount.toLocaleString()}</span>
                                        </div>
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                </div>
            )}

            {/* LIVE REGISTERED ORDERS LIST */}
            <div className="space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-850 pb-2">
                    <h2 className="text-xs font-black uppercase text-slate-500 tracking-wider flex items-center gap-2">
                        <Layers className="h-4 w-4" /> Live Order Registry feeds
                    </h2>

                    {/* Tabs Filter */}
                    <div className="flex gap-4 flex-wrap border-b border-slate-200 pb-2">
                        <button
                            onClick={() => setActiveTab('all')}
                            className={`text-xs font-bold transition-all relative pb-2 ${activeTab === 'all' ? 'text-blue-600 font-extrabold' : 'text-slate-500 hover:text-slate-850'}`}
                        >
                            All Transactions ({liveOrders.length})
                            {activeTab === 'all' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 rounded-full" />}
                        </button>
                        {showPendingTab && (
                            <button
                                onClick={() => setActiveTab('pending')}
                                className={`text-xs font-bold transition-all relative pb-2 ${activeTab === 'pending' ? 'text-blue-600 font-extrabold' : 'text-slate-500 hover:text-slate-850'}`}
                            >
                                Awaiting Billing ({liveOrders.filter(o => o.status === 'CONFIRMED').length})
                                {activeTab === 'pending' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 rounded-full" />}
                            </button>
                        )}
                        <button
                            onClick={() => setActiveTab('pending_fulfillment')}
                            className={`text-xs font-bold transition-all relative pb-2 ${activeTab === 'pending_fulfillment' ? 'text-blue-600 font-extrabold' : 'text-slate-500 hover:text-slate-850'}`}
                        >
                            Pending Pack ({liveOrders.filter(o => o.status === 'PENDING_FULFILLMENT').length})
                            {activeTab === 'pending_fulfillment' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 rounded-full" />}
                        </button>
                        <button
                            onClick={() => setActiveTab('completed')}
                            className={`text-xs font-bold transition-all relative pb-2 ${activeTab === 'completed' ? 'text-blue-600 font-extrabold' : 'text-slate-500 hover:text-slate-850'}`}
                        >
                            Completed ({liveOrders.filter(o => o.status === 'PACKED').length})
                            {activeTab === 'completed' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 rounded-full" />}
                        </button>
                    </div>
                </div>

                {loading ? (
                    <div className="flex flex-col items-center justify-center p-12 text-slate-500 gap-2 border border-slate-850 bg-slate-900/15 rounded-2xl">
                        <RefreshCw className="h-8 w-8 animate-spin stroke-1 text-slate-700" />
                        <span className="text-xs font-medium animate-pulse">Retrieving orders list...</span>
                    </div>
                ) : filteredLiveOrders.length === 0 ? (
                    <div className="flex flex-col items-center justify-center p-12 text-center rounded-2xl border border-slate-850 bg-slate-900/5">
                        <Layers className="h-10 w-10 text-slate-705 mb-2.5" />
                        <h3 className="text-sm font-bold text-slate-350">No orders logged</h3>
                        <p className="text-xs text-slate-500 max-w-sm mt-1">
                            {activeTab === 'pending'
                                ? 'No orders currently awaiting billing details.'
                                : activeTab === 'completed'
                                    ? 'No completed orders logged yet.'
                                    : 'Select Place New Order above to submit your first team transaction record.'}
                        </p>
                    </div>
                ) : (
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        {filteredLiveOrders.map((ord) => {
                            const { notes: cleanNotes, discounts } = parseOrderNotesAndDiscounts(ord.notes)
                            const discType = discounts?.type || 'NONE'
                            const overallPct = discounts?.overallPct || 0

                            return (
                                <div
                                    key={ord.id}
                                    onClick={() => setSelectedDetailedOrder(ord)}
                                    className={`rounded-2xl bg-white border border-slate-200/80 p-5 hover:border-blue-400 hover:shadow-md cursor-pointer transition-all duration-300 hover:-translate-y-0.5 flex flex-col justify-between shadow-sm relative overflow-hidden group ${getCardBorder(ord.status)}`}
                                >
                                    <div>
                                        <div className="flex justify-between items-start gap-2">
                                            <div className="min-w-0">
                                                <h3 className="text-sm font-bold text-slate-200 truncate">{ord.parties?.Parties_name || 'Unknown Party'}</h3>
                                                <div className="flex items-center gap-1.5 mt-1 text-[10px] text-slate-500 font-semibold font-mono">
                                                    <Calendar className="h-3 w-3 text-slate-400" />
                                                    <span>{new Date(ord.created_at).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                                                </div>
                                            </div>

                                            <span className={`text-[9px] font-bold tracking-wider py-0.5 px-2.5 rounded-lg border ${getStatusStyles(ord.status)}`}>
                                                {ord.status}
                                            </span>
                                        </div>

                                        {cleanNotes && (
                                            <p className="mt-3 text-[11px] text-slate-600 italic bg-slate-900 p-2 rounded-lg border border-slate-100 line-clamp-2">
                                                "{cleanNotes}"
                                            </p>
                                        )}

                                        {discType !== 'NONE' && (
                                            <div className="mt-2.5 flex flex-wrap gap-1">
                                                <span className="text-[9px] font-bold tracking-wider py-0.5 px-2 rounded bg-amber-50 text-amber-700 border border-amber-200">
                                                    {discType === 'PRODUCT' ? 'Product-wise' : `Overall ${overallPct}% Off Scheme`}
                                                </span>
                                            </div>
                                        )}
                                    </div>

                                    <div className="mt-5 pt-3 border-t border-slate-100 flex justify-between items-baseline font-mono">
                                        <div className="text-[9px] uppercase tracking-wider text-slate-400">
                                            {ord.order_number || `Pending ID (#${ord.id})`}
                                        </div>
                                        <div className="text-base font-extrabold text-blue-600">
                                            रु {Number(ord.total_amount).toLocaleString()}
                                        </div>
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                )}
            </div>

            {/* ORDER DETAILS MODAL OVERLAY */}
            {selectedDetailedOrder && (
                <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm overflow-y-auto">
                    <div className="relative w-full max-w-4xl bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
                        {/* Modal Header */}
                        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-blue-50/20">
                            <div className="flex items-center gap-2">
                                <Layers className="h-5 w-5 text-blue-600" />
                                <h2 className="text-lg font-bold text-slate-200">Order Dispatch & Approval Ledger</h2>
                            </div>
                            <button
                                onClick={() => {
                                    if (returnContext?.to) {
                                        navigate(returnContext.ledger ? `${returnContext.to}?ledger=${returnContext.ledger}` : returnContext.to)
                                    } else {
                                        setSelectedDetailedOrder(null)
                                        setBillNumber('')
                                        setInvoiceNumber('')
                                        setBillingRemarks('')
                                        setFulfillmentRemarksInput('')
                                    }
                                }}
                                className="rounded-xl p-1.5 text-slate-500 hover:text-slate-850 hover:bg-slate-850 transition-colors"
                            >
                                <X className="h-5 w-5" />
                            </button>
                        </div>

                        {/* Modal Content */}
                        <div className="flex-1 overflow-y-auto p-6 space-y-6">
                            {/* Upper Details Grid */}
                            <div className="grid gap-6 md:grid-cols-2">
                                {/* Party Card */}
                                <div className="rounded-2xl bg-blue-50/5 border border-blue-100 p-5 space-y-3">
                                    <div className="flex items-center gap-2 border-b border-slate-100 pb-2">
                                        <User className="h-4 w-4 text-blue-605/80" />
                                        <h3 className="text-xs font-black uppercase text-slate-450 tracking-wider">Customer Profile</h3>
                                    </div>
                                    <div>
                                        <h4 className="text-sm font-extrabold text-slate-850">{selectedDetailedOrder.parties?.Parties_name}</h4>
                                        <span className="inline-block mt-1 font-mono text-[9px] font-bold text-blue-600 py-0.5 px-2 bg-blue-50 border border-blue-200 rounded">
                                            {selectedDetailedOrder.parties?.party_code || 'No Code'}
                                        </span>
                                    </div>
                                    <div className="text-xs space-y-1.5 text-slate-600 font-medium">
                                        <p><span className="text-slate-420">Address:</span> {selectedDetailedOrder.parties?.address || 'N/A'}</p>
                                        <p><span className="text-slate-420">Phone:</span> {selectedDetailedOrder.parties?.contact_number || 'N/A'}</p>
                                        <p><span className="text-slate-420">PAN No:</span> {selectedDetailedOrder.parties?.pan_no || 'N/A'}</p>
                                    </div>
                                </div>

                                {/* Order Metadata Card */}
                                <div className="rounded-2xl bg-blue-50/5 border border-blue-100 p-5 space-y-3">
                                    <div className="flex items-center gap-2 border-b border-slate-100 pb-2">
                                        <Info className="h-4 w-4 text-blue-605/80" />
                                        <h3 className="text-xs font-black uppercase text-slate-450 tracking-wider">Transaction Info</h3>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4 text-xs font-medium text-slate-600">
                                        <div>
                                            <span className="text-slate-400 block text-[9px] uppercase font-bold">Registry Code</span>
                                            <span className="text-slate-850 font-bold block mt-0.5 font-mono">{selectedDetailedOrder.order_number || `Draft #${selectedDetailedOrder.id}`}</span>
                                        </div>
                                        <div>
                                            <span className="text-slate-400 block text-[9px] uppercase font-bold">Status</span>
                                            <span className={`inline-block mt-1 text-[9px] font-bold tracking-wider py-0.5 px-2 rounded-lg border ${getStatusStyles(selectedDetailedOrder.status)}`}>
                                                {selectedDetailedOrder.status}
                                            </span>
                                        </div>
                                        <div>
                                            <span className="text-slate-400 block text-[9px] uppercase font-bold">Salesperson</span>
                                            <span className="text-slate-200 block mt-0.5">{getProfileName(selectedDetailedOrder.created_by)}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Order Items Section */}
                            <div className="space-y-3">
                                <div className="flex items-center gap-2">
                                    <Package className="h-4 w-4 text-slate-450" />
                                    <h3 className="text-xs font-black uppercase text-slate-450 tracking-wider">Ordered Items Registry</h3>
                                </div>
                                <div className="overflow-hidden border border-slate-200 rounded-2xl bg-white shadow-sm">
                                    <table className="w-full text-left border-collapse text-xs">
                                        <thead>
                                            <tr className="border-b border-slate-200 bg-blue-50/40 text-blue-700 font-bold uppercase tracking-wider">
                                                <th className="py-2.5 px-4 font-extrabold">Item & SKU Reference</th>
                                                <th className="py-2.5 px-4 text-right font-extrabold">Quantity</th>
                                                <th className="py-2.5 px-4 text-right font-extrabold">MRP (रु)</th>
                                                <th className="py-2.5 px-4 text-right font-extrabold">Net Price (रु)</th>
                                                <th className="py-2.5 px-4 text-right font-extrabold">Subtotal (रु)</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100 text-slate-600">
                                            {(() => {
                                                const returnedCounts: Record<number, number> = {}
                                                selectedDetailedOrder.returns?.forEach((ret: any) => {
                                                    ret.return_items?.forEach((ri: any) => {
                                                        returnedCounts[ri.product_id] = (returnedCounts[ri.product_id] || 0) + ri.quantity_returned
                                                    })
                                                })

                                                return (selectedDetailedOrder.order_items || []).map((item: any, idx: number) => {
                                                    const parseNotesAndDiscounts = (rawNotes: string | null) => {
                                                        if (!rawNotes) return null
                                                        const match = rawNotes.match(/\|\|DISCOUNTS:(.*?)\|\|/)
                                                        if (match) {
                                                            try { return JSON.parse(match[1]) } catch (e) { return null }
                                                        }
                                                        return null
                                                    }
                                                    const discountsObj = parseNotesAndDiscounts(selectedDetailedOrder.notes)
                                                    const itemDiscPct = discountsObj?.items?.[item.product_id] || 0
                                                    const isProductwise = discountsObj?.type === 'PRODUCT'

                                                    return (
                                                        <tr key={idx} className="hover:bg-slate-900 transition-colors">
                                                            <td className="py-3 px-4 font-semibold text-slate-200">
                                                                <div>{item.products?.product_name || 'Legacy Product'}</div>
                                                                <div className="text-[10px] text-slate-450 font-mono mt-0.5">{item.products?.ref_code || `Code #${item.product_id}`}</div>
                                                            </td>
                                                            <td className="py-3 px-4 text-right font-extrabold font-mono text-slate-700">
                                                                <div>{item.quantity} {item.products?.unit || 'PCS'}</div>
                                                                {returnedCounts[item.product_id] > 0 && (
                                                                    <div className="text-[10px] text-rose-600 mt-1 font-bold">
                                                                        (-{returnedCounts[item.product_id]} Ret)
                                                                    </div>
                                                                )}
                                                            </td>
                                                            <td className="py-3 px-4 text-right font-medium font-mono text-slate-400">
                                                                {Number(item.products?.mrp || item.unit_price).toLocaleString()}
                                                            </td>
                                                            <td className="py-3 px-4 text-right font-bold font-mono text-slate-700">
                                                                {Number(item.unit_price).toLocaleString()}
                                                                {isProductwise && itemDiscPct > 0 && (
                                                                    <span className="text-[9px] text-amber-600 font-bold block">
                                                                        ({itemDiscPct}% off)
                                                                    </span>
                                                                )}
                                                            </td>
                                                            <td className="py-3 px-4 text-right font-black font-mono text-blue-600 text-sm">
                                                                रु {Number(item.subtotal).toLocaleString()}
                                                            </td>
                                                        </tr>
                                                    )
                                                })
                                            })()}
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                            {/* Total Breakdown and Special Notes */}
                            <div className="grid gap-6 md:grid-cols-2">
                                {/* Notes card */}
                                <div className="rounded-2xl border border-slate-850 p-5 bg-slate-950/20 flex flex-col justify-between">
                                    <div>
                                        <div className="flex items-center gap-2 mb-2 text-slate-500">
                                            <FileText className="h-4 w-4" />
                                            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Sales Note & Shipping instructions</span>
                                        </div>
                                        <p className="text-xs text-slate-350 leading-relaxed italic">
                                            {(() => {
                                                const raw = selectedDetailedOrder.notes || ''
                                                const match = raw.match(/(.*?)\s*\|\|DISCOUNTS:(.*?)\|\|/)
                                                return match ? match[1].trim() || 'No custom instruction logged.' : raw.trim() || 'No custom instruction logged.'
                                            })()}
                                        </p>
                                    </div>

                                    {/* Fulfillment Lifecycle Trace Log */}
                                    <div className="mt-4 border-t border-slate-800 pt-3 text-[11px] text-slate-350 space-y-2 bg-slate-955/25 bg-slate-950/40 p-4 rounded-xl border border-slate-850">
                                        <span className="font-extrabold uppercase text-[10px] block mb-2 text-amber-500 tracking-wider">Fulfillment Lifecycle Trace Log</span>
                                        <div className="space-y-3 font-medium">
                                            {/* Order Created */}
                                            <div className="flex items-start gap-2">
                                                <div className="h-2 w-2 rounded-full bg-emerald-500 mt-1 shrink-0" />
                                                <div>
                                                    <span className="text-slate-205 font-bold">Order Created</span>
                                                    <p className="text-[10px] text-slate-500">
                                                        By {getProfileName(selectedDetailedOrder.created_by)} on {new Date(selectedDetailedOrder.created_at).toLocaleString()}
                                                    </p>
                                                </div>
                                            </div>

                                            {/* Billing Submitted */}
                                            <div className="flex items-start gap-2">
                                                <div className={`h-2 w-2 rounded-full mt-1 shrink-0 ${selectedDetailedOrder.billed_at ? 'bg-emerald-500' : 'bg-slate-700'}`} />
                                                <div>
                                                    <span className={`font-bold ${selectedDetailedOrder.billed_at ? 'text-slate-205' : 'text-slate-500'}`}>Accountant Billing & Financial Check</span>
                                                    {selectedDetailedOrder.billed_at ? (
                                                        <div className="text-[10px] text-slate-400 space-y-0.5 mt-0.5 bg-slate-900/40 p-2 rounded-lg border border-slate-850">
                                                            {selectedDetailedOrder.invoice_number && <p><span className="text-slate-500">Invoice No:</span> {selectedDetailedOrder.invoice_number}</p>}
                                                            {selectedDetailedOrder.bill_number && <p><span className="text-slate-500">Bill No:</span> {selectedDetailedOrder.bill_number}</p>}
                                                            {selectedDetailedOrder.billing_remarks && <p><span className="text-slate-500">Billing Remarks:</span> {selectedDetailedOrder.billing_remarks}</p>}
                                                            <p className="text-[9px] text-slate-500">By {getProfileName(selectedDetailedOrder.billed_by)} on {new Date(selectedDetailedOrder.billed_at).toLocaleString()}</p>
                                                        </div>
                                                    ) : (
                                                        <p className="text-[10px] text-slate-500">Awaiting Invoice billing details</p>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Packed */}
                                            <div className="flex items-start gap-2">
                                                <div className={`h-2 w-2 rounded-full mt-1 shrink-0 ${selectedDetailedOrder.packed_at ? 'bg-emerald-500' : 'bg-slate-700'}`} />
                                                <div>
                                                    <span className={`font-bold ${selectedDetailedOrder.packed_at ? 'text-slate-205' : 'text-slate-500'}`}>Package Packaging & Verification</span>
                                                    {selectedDetailedOrder.packed_at ? (
                                                        <p className="text-[10px] text-slate-500">
                                                            Completed on {new Date(selectedDetailedOrder.packed_at).toLocaleString()}
                                                        </p>
                                                    ) : (
                                                        <p className="text-[10px] text-slate-500">Awaiting packaging completion</p>
                                                    )}
                                                </div>
                                            </div>
                                        </div>

                                        {selectedDetailedOrder.fulfillment_remarks && (
                                            <div className="mt-3 border-t border-slate-800 pt-2 text-[10px]">
                                                <span className="text-slate-500 uppercase font-black tracking-wider block mb-1">Interactive Remarks Feed</span>
                                                <p className="italic text-slate-400 bg-slate-900/60 p-2.5 rounded-lg border border-slate-850 whitespace-pre-line">
                                                    {selectedDetailedOrder.fulfillment_remarks}
                                                </p>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Calculation Total Drawer Card */}
                                <div className="rounded-2xl border border-slate-200 p-5 bg-slate-900/40 text-xs font-semibold space-y-2.5 font-outfit shadow-sm">
                                    {(() => {
                                        const { discounts: discountsObj } = parseOrderNotesAndDiscounts(selectedDetailedOrder.notes)
                                        const discType = discountsObj?.type || 'NONE'
                                        const overallPct = discountsObj?.overallPct || 0

                                        // Calculate subtotal before any discounts
                                        const originalSubtotal = (selectedDetailedOrder.order_items || []).reduce((sum: number, item: any) => {
                                            return sum + (item.products?.mrp || item.unit_price) * item.quantity
                                        }, 0)

                                        const totalAmt = Number(selectedDetailedOrder.total_amount)
                                        const totalDiscounts = originalSubtotal - totalAmt

                                        return (
                                            <>
                                                <div className="flex justify-between text-slate-500 font-medium">
                                                    <span>Subtotal before scheme discounts:</span>
                                                    <span className="font-mono text-slate-700 font-bold">रु {originalSubtotal.toLocaleString()}</span>
                                                </div>
                                                {discType !== 'NONE' && (
                                                    <div className="flex justify-between text-amber-700 font-semibold">
                                                        <span>Scheme Applied ({discType === 'PRODUCT' ? 'Product-wise' : `Overall ${overallPct}%`}):</span>
                                                        <span className="font-mono font-bold">- रु {totalDiscounts.toLocaleString()}</span>
                                                    </div>
                                                )}
                                                <div className="flex justify-between border-t border-slate-200 pt-2 text-sm text-slate-200 font-extrabold">
                                                    <span>Net Sales Price:</span>
                                                    <span className="text-blue-600 font-mono">रु {totalAmt.toLocaleString()}</span>
                                                </div>
                                                <div className="flex justify-between border-t border-slate-100 pt-2 text-slate-500 font-normal">
                                                    <span>Outstanding Dues (Udhar):</span>
                                                    <span className="font-mono text-slate-700 font-semibold">रु {Number(selectedDetailedOrder.due_amount).toLocaleString()}</span>
                                                </div>
                                                <div className="flex justify-between text-slate-500 font-normal">
                                                    <span>Recorded Paid (Cash/Bank):</span>
                                                    <span className="font-mono text-slate-700 font-semibold">रु {Number(selectedDetailedOrder.amount_paid).toLocaleString()}</span>
                                                </div>
                                                {(Number(selectedDetailedOrder.amount_paid) > totalAmt) && (
                                                    <div className="flex justify-between border-t border-emerald-200 pt-2 text-emerald-700 font-black">
                                                        <span>Excess Paid (Credited to Party Ledger):</span>
                                                        <span className="font-mono bg-emerald-50 px-2 py-0.5 rounded border border-emerald-250">
                                                            + रु {(Number(selectedDetailedOrder.amount_paid) - totalAmt).toLocaleString()}
                                                        </span>
                                                    </div>
                                                )}
                                            </>
                                        )
                                    })()}
                                </div>
                            </div>

                            {/* Order Payment Clearance Ledger */}
                            <div className="rounded-2xl border border-slate-200 p-5 bg-slate-900/15 text-xs space-y-3">
                                <div className="flex justify-between items-center border-b border-slate-100 pb-2">
                                    <div className="flex items-center gap-2">
                                        <span className="text-blue-600 font-extrabold text-[10px] uppercase tracking-wider">Payment Ledger Trace</span>
                                    </div>
                                    {Number(selectedDetailedOrder.due_amount) > 0 && !showQuickPayForm && (
                                        <button
                                            onClick={() => setShowQuickPayForm(true)}
                                            className="py-1 px-2.5 rounded bg-blue-600 hover:bg-blue-700 text-white font-black text-[9px] uppercase tracking-wider active:scale-95 transition-all duration-200 cursor-pointer shadow-sm"
                                        >
                                            Record Payment
                                        </button>
                                    )}
                                </div>

                                {showQuickPayForm ? (
                                    <div className="space-y-3 p-3 rounded-xl bg-slate-900 border border-slate-200 shadow-inner">
                                        <div>
                                            <label className="block text-[9px] font-black uppercase text-slate-500 tracking-wider mb-1">
                                                Payment Amount (रु)
                                            </label>
                                            <input
                                                type="number"
                                                value={quickPayAmount}
                                                onChange={(e) => setQuickPayAmount(e.target.value)}
                                                max={selectedDetailedOrder.due_amount}
                                                className="w-full rounded bg-white border border-slate-200 p-1.5 text-slate-200 text-xs font-bold font-mono focus:border-blue-600 focus:outline-none"
                                            />
                                        </div>
                                        <div className="grid grid-cols-2 gap-2">
                                            <div>
                                                <label className="block text-[9px] font-black uppercase text-slate-500 tracking-wider mb-1">
                                                    Method
                                                </label>
                                                <select
                                                    value={quickPayMethod}
                                                    onChange={(e) => setQuickPayMethod(e.target.value)}
                                                    className="w-full rounded bg-white border border-slate-200 p-1.5 text-slate-200 text-xs font-semibold focus:border-blue-600 focus:outline-none"
                                                >
                                                    <option value="CASH">CASH</option>
                                                    <option value="BANK_TRANSFER">BANK TRANSFER</option>
                                                    <option value="CHEQUE">CHEQUE</option>
                                                    <option value="ESEWA">ESEWA</option>
                                                    <option value="KHALTI">KHALTI</option>
                                                    <option value="UPI">UPI</option>
                                                </select>
                                            </div>
                                            <div>
                                                <label className="block text-[9px] font-black uppercase text-slate-500 tracking-wider mb-1">
                                                    Reference ID
                                                </label>
                                                <input
                                                    type="text"
                                                    value={quickPayReference}
                                                    onChange={(e) => setQuickPayReference(e.target.value)}
                                                    placeholder="Optional"
                                                    className="w-full rounded bg-white border border-slate-200 p-1.5 text-slate-200 text-xs font-semibold focus:border-blue-600 focus:outline-none"
                                                />
                                            </div>
                                        </div>
                                        <div>
                                            <label className="block text-[9px] font-black uppercase text-slate-500 tracking-wider mb-1">
                                                Notes / Remarks
                                            </label>
                                            <input
                                                type="text"
                                                value={quickPayNotes}
                                                onChange={(e) => setQuickPayNotes(e.target.value)}
                                                placeholder="Optional remarks"
                                                className="w-full rounded bg-white border border-slate-200 p-1.5 text-slate-200 text-xs font-semibold focus:border-blue-600 focus:outline-none"
                                            />
                                        </div>
                                        <div className="flex gap-2">
                                            <button
                                                onClick={async () => {
                                                    const amt = parseFloat(quickPayAmount)
                                                    if (isNaN(amt) || amt <= 0) {
                                                        alert('Enter a valid amount')
                                                        return
                                                    }
                                                    if (amt > selectedDetailedOrder.due_amount) {
                                                        alert('Amount exceeds order outstanding due')
                                                        return
                                                    }
                                                    if (!profile?.id) {
                                                        alert('Re-authenticate to record payment')
                                                        return
                                                    }
                                                    setActing(true)
                                                    try {
                                                        const { error } = await supabase.rpc('record_payment', {
                                                            p_order_id: selectedDetailedOrder.id,
                                                            p_party_id: selectedDetailedOrder.party_id,
                                                            p_amount: amt,
                                                            p_method: quickPayMethod,
                                                            p_recorded_by: profile.id,
                                                            p_reference: quickPayReference.trim() || null,
                                                            p_notes: quickPayNotes.trim() || null,
                                                            p_payment_date: new Date().toISOString().split('T')[0]
                                                        })
                                                        if (error) throw error
                                                        alert('Payment recorded successfully!')

                                                        // Reload detailed order object
                                                        const { data: updatedOrder, error: fetchErr } = await supabase
                                                            .from('orders')
                                                            .select(`
                                                                     id,
                                                                     order_number,
                                                                     party_id,
                                                                     status,
                                                                     total_amount,
                                                                     due_amount,
                                                                     amount_paid,
                                                                     notes,
                                                                     created_at,
                                                                     created_by,
                                                                     billed_by,
                                                                     billed_at,
                                                                     invoice_number,
                                                                     bill_number,
                                                                     billing_remarks,
                                                                     packed_by,
                                                                     packed_at,
                                                                     dispatched_by,
                                                                     dispatched_at,
                                                                     delivered_by,
                                                                     delivered_at,
                                                                     fulfillment_remarks,
                                                                     parties ( id, party_code, Parties_name, contact_number, pan_no, address ),
                                                                     order_items ( id, product_id, quantity, unit_price, subtotal, products ( id, product_name, ref_code, unit, mrp ) ),
                                                                     returns ( id, total_refund, created_at, return_items ( product_id, quantity_returned, refund_amount ) )
                                                                 `)
                                                            .eq('id', selectedDetailedOrder.id)
                                                            .single()

                                                        if (!fetchErr && updatedOrder) {
                                                            setSelectedDetailedOrder(updatedOrder)
                                                        } else {
                                                            setSelectedDetailedOrder(null)
                                                        }
                                                        fetchLiveOrders()
                                                    } catch (err: any) {
                                                        alert('Payment failed: ' + err.message)
                                                    } finally {
                                                        setActing(false)
                                                    }
                                                }}
                                                className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 text-white font-black rounded-lg text-[10px] uppercase tracking-wider active:scale-95 transition-all duration-200 cursor-pointer shadow-sm"
                                            >
                                                Save Payment
                                            </button>
                                            <button
                                                onClick={() => setShowQuickPayForm(false)}
                                                className="px-3 py-2 bg-white border border-slate-200 hover:bg-slate-900 text-slate-700 font-bold rounded-lg text-[10px] uppercase tracking-wider text-center active:scale-95 transition-all duration-200 cursor-pointer"
                                            >
                                                Cancel
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="space-y-2">
                                        {loadingOrderPayments ? (
                                            <p className="text-slate-505">Checking payment receipts...</p>
                                        ) : orderPayments.length === 0 ? (
                                            <p className="text-slate-505 italic">No payments recorded against this order yet.</p>
                                        ) : (
                                            <div className="divide-y divide-slate-100 max-h-36 overflow-y-auto pr-1">
                                                {orderPayments.map((p) => (
                                                    <div key={p.id} className="py-2 flex justify-between items-center text-[10px]">
                                                        <div>
                                                            <span className="font-extrabold text-emerald-700 font-mono">रु {Number(p.amount).toLocaleString()}</span>
                                                            <span className="ml-2 font-bold py-0.5 px-1 rounded bg-slate-900 border border-slate-200 text-[8px] text-slate-600 uppercase">{p.method}</span>
                                                        </div>
                                                        <div className="text-right text-slate-500 font-medium">
                                                            <span>{p.payment_date}</span>
                                                            <span className="block text-[8px]">By {p.profiles?.name || 'Staff'}</span>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* Transaction Control Actions Board */}
                            <div className="border-t border-slate-850 pt-6">
                                {acting && (
                                    <div className="flex items-center justify-center py-4 text-slate-500 gap-2 border border-slate-850 bg-slate-900/15 rounded-2xl">
                                        <RefreshCw className="h-5 w-5 animate-spin text-amber-550" />
                                        <span className="text-xs font-semibold animate-pulse">Running pipeline transactions...</span>
                                    </div>
                                )}

                                {!acting && selectedDetailedOrder.status === 'CONFIRMED' && (
                                    <div className="space-y-4">
                                        {(profile?.role === 'ADMIN' || profile?.role === 'MANAGER') ? (
                                            <div className="bg-slate-955/40 border border-slate-850 rounded-2xl p-5 space-y-4">
                                                <div className="flex justify-between items-center flex-wrap gap-2 mb-1">
                                                    <div className="flex items-center gap-2">
                                                        <AlertCircle className="h-4.5 w-4.5 text-amber-500" />
                                                        <h3 className="text-xs font-black uppercase text-slate-350 tracking-wider">Accountant Billing Entry</h3>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <button
                                                            type="button"
                                                            onClick={async () => {
                                                                try {
                                                                    const nextBill = await BillingService.generateBillNumber()
                                                                    const nextInv = await BillingService.generateInvoiceNumber()
                                                                    setBillNumber(nextBill)
                                                                    setInvoiceNumber(nextInv)
                                                                    setBillingRemarks(`Auto-generated from order #${selectedDetailedOrder.order_number}`)
                                                                    setIsBilledGenerated(true)
                                                                } catch (err: any) {
                                                                    alert("Automation Engine: " + err.message)
                                                                }
                                                            }}
                                                            className="py-1 px-2.5 rounded-lg border border-amber-500/35 hover:border-amber-400 bg-amber-500/10 hover:bg-amber-500/15 text-amber-500 text-[10px] font-black uppercase tracking-wider transition-colors"
                                                        >
                                                            Generate Auto Billing
                                                        </button>
                                                        {isBilledGenerated && (
                                                            <button
                                                                type="button"
                                                                onClick={() => {
                                                                    const printWindow = window.open('', '_blank', 'width=900,height=700')
                                                                    if (!printWindow) return
                                                                    const html = renderSalesBillHTML(
                                                                        selectedDetailedOrder,
                                                                        billNumber,
                                                                        invoiceNumber,
                                                                        selectedDetailedOrder.order_items || []
                                                                    )
                                                                    const css = getPrintLayoutCSS()
                                                                    printWindow.document.write(`
                                                                        <html>
                                                                            <head>
                                                                                <title>Tax Bill - ${invoiceNumber}</title>
                                                                                <style>${css}</style>
                                                                            </head>
                                                                            <body>
                                                                                ${html}
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
                                                                }}
                                                                className="py-1 px-2.5 rounded-lg border border-emerald-500/35 bg-emerald-500/10 hover:bg-emerald-500/15 text-emerald-500 text-[10px] font-black uppercase tracking-wider transition-colors"
                                                            >
                                                                Print Draft Bill
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>

                                                <div className="grid gap-4 md:grid-cols-3">
                                                    <div>
                                                        <label className="block text-[10px] font-black uppercase text-slate-500 tracking-wider mb-1.5">
                                                            Invoice Number
                                                        </label>
                                                        <input
                                                            type="text"
                                                            value={invoiceNumber}
                                                            onChange={(e) => setInvoiceNumber(e.target.value)}
                                                            placeholder="e.g. INV-2026-001"
                                                            className="w-full rounded-xl bg-slate-900 border border-slate-800 p-2.5 text-slate-200 text-xs font-semibold focus:border-amber-500 focus:outline-none"
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="block text-[10px] font-black uppercase text-slate-500 tracking-wider mb-1.5">
                                                            Bill Number
                                                        </label>
                                                        <input
                                                            type="text"
                                                            value={billNumber}
                                                            onChange={(e) => setBillNumber(e.target.value)}
                                                            placeholder="e.g. BILL-9921"
                                                            className="w-full rounded-xl bg-slate-900 border border-slate-800 p-2.5 text-slate-200 text-xs font-semibold focus:border-amber-500 focus:outline-none"
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="block text-[10px] font-black uppercase text-slate-500 tracking-wider mb-1.5">
                                                            Billing Remarks
                                                        </label>
                                                        <input
                                                            type="text"
                                                            value={billingRemarks}
                                                            onChange={(e) => setBillingRemarks(e.target.value)}
                                                            placeholder="Remarks / notes..."
                                                            className="w-full rounded-xl bg-slate-900 border border-slate-800 p-2.5 text-slate-200 text-xs font-semibold focus:border-amber-500 focus:outline-none"
                                                        />
                                                    </div>
                                                </div>

                                                <div className="flex flex-wrap gap-4 pt-2 border-t border-slate-900">
                                                    <button
                                                        onClick={async () => {
                                                            if (!profile?.id) return
                                                            if (!billNumber.trim() || !invoiceNumber.trim()) {
                                                                alert('Safety Validation: Bill Number and Invoice Number are mandatory before submitting.')
                                                                return
                                                            }
                                                            setActing(true)
                                                            try {
                                                                const { error } = await supabase.rpc('record_billing_info', {
                                                                    p_order_id: selectedDetailedOrder.id,
                                                                    p_bill_number: billNumber.trim(),
                                                                    p_invoice_number: invoiceNumber.trim(),
                                                                    p_billing_remarks: billingRemarks.trim() || null,
                                                                    p_billed_by: profile.id
                                                                })
                                                                if (error) throw error

                                                                // The record_billing_info RPC already transitions the status to PENDING_FULFILLMENT,
                                                                // so we do not call update_order_status here to avoid invalid transition errors.

                                                                alert('Billing info recorded! Status advanced to Pending Fulfillment.')

                                                                // Print the finalized Sales Bill immediately
                                                                const printWindow = window.open('', '_blank', 'width=900,height=700')
                                                                if (printWindow) {
                                                                    const html = renderSalesBillHTML(
                                                                        selectedDetailedOrder,
                                                                        billNumber.trim(),
                                                                        invoiceNumber.trim(),
                                                                        selectedDetailedOrder.order_items || []
                                                                    )
                                                                    const css = getPrintLayoutCSS()
                                                                    printWindow.document.write(`
                                                                        <html>
                                                                            <head>
                                                                                <title>Invoice - ${invoiceNumber.trim()}</title>
                                                                                <style>${css}</style>
                                                                            </head>
                                                                            <body>
                                                                                ${html}
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

                                                                setSelectedDetailedOrder(null)
                                                                fetchLiveOrders()
                                                            } catch (err: any) {
                                                                console.error(err)
                                                                alert('Error during billing entry: ' + (err.message || 'Operation failed'))
                                                            } finally {
                                                                setActing(false)
                                                            }
                                                        }}
                                                        className="flex-1 py-3 px-4 bg-emerald-500 hover:bg-emerald-450 text-white font-black text-xs uppercase rounded-xl transition-colors flex items-center justify-center gap-1.5"
                                                    >
                                                        <CheckCircle2 className="h-4.5 w-4.5" />
                                                        Submit Billing Info & Print Bill
                                                    </button>

                                                    <button
                                                        onClick={async () => {
                                                            if (!confirm("Are you sure you want to cancel and void this order? This cannot be undone.")) return
                                                            setActing(true)
                                                            try {
                                                                const { error } = await supabase
                                                                    .from('orders')
                                                                    .update({ status: 'CANCELLED' })
                                                                    .eq('id', selectedDetailedOrder.id)
                                                                if (error) throw error
                                                                alert('Order cancelled successfully.')
                                                                setSelectedDetailedOrder(null)
                                                                fetchLiveOrders()
                                                            } catch (err: any) {
                                                                console.error(err)
                                                                alert('Error: ' + (err.message || 'Operation failed'))
                                                            } finally {
                                                                setActing(false)
                                                            }
                                                        }}
                                                        className="py-3 px-5 bg-rose-50 border border-rose-200 text-rose-700 hover:bg-rose-100 font-extrabold text-xs uppercase rounded-xl active:scale-95 transition-all duration-200 flex items-center justify-center gap-1.5 cursor-pointer shadow-sm"
                                                    >
                                                        <XCircle className="h-4.5 w-4.5" />
                                                        Cancel Order
                                                    </button>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="bg-slate-900 border border-slate-205 rounded-xl p-4 text-xs font-semibold text-slate-500 text-center flex items-center justify-center gap-2 shadow-sm">
                                                <Info className="h-4 w-4 text-amber-600" />
                                                Awaiting accountant billing entry to start fulfillment process.
                                            </div>
                                        )}
                                    </div>
                                )}

                                {!acting && (selectedDetailedOrder.status === 'PENDING_FULFILLMENT' || selectedDetailedOrder.status === 'PACKED') && (
                                    <div className="bg-blue-50/10 border border-blue-150 rounded-2xl p-5 space-y-4 shadow-sm">
                                        <div className="flex justify-between items-center flex-wrap gap-4 border-b border-slate-100 pb-3">
                                            <div className="flex items-center gap-2">
                                                <Package className="h-4.5 w-4.5 text-blue-600" />
                                                <h3 className="text-xs font-black uppercase text-slate-200 tracking-wider font-outfit">Fulfillment Operation Workflow</h3>
                                            </div>
                                        </div>

                                        <div className="space-y-1.5">
                                            <label className="block text-[10px] font-black uppercase text-slate-500 tracking-wider">
                                                Fulfillment / Packaging Remarks
                                            </label>
                                            <input
                                                type="text"
                                                value={fulfillmentRemarksInput}
                                                onChange={(e) => setFulfillmentRemarksInput(e.target.value)}
                                                placeholder="Provide packaging comments..."
                                                className="w-full rounded-xl bg-slate-900 border border-slate-200 p-2.5 text-slate-200 text-xs font-semibold focus:outline-none focus:border-blue-600 focus:bg-white transition-all shadow-sm"
                                            />
                                        </div>

                                        <div className="flex flex-wrap gap-4 pt-2">
                                            {selectedDetailedOrder.status === 'PENDING_FULFILLMENT' && (
                                                <button
                                                    onClick={async () => {
                                                        setActing(true)
                                                        try {
                                                            const { error } = await supabase.rpc('update_order_status', {
                                                                p_order_id: selectedDetailedOrder.id,
                                                                p_status: 'PACKED',
                                                                p_remarks: fulfillmentRemarksInput.trim() || null
                                                            })
                                                            if (error) throw error
                                                            setSelectedDetailedOrder(null)
                                                            fetchLiveOrders()
                                                        } catch (err: any) {
                                                            alert('Error: ' + err.message)
                                                        } finally {
                                                            setActing(false)
                                                        }
                                                    }}
                                                    className="flex-1 py-3 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs uppercase rounded-xl active:scale-95 transition-all duration-200 flex items-center justify-center gap-1.5 cursor-pointer shadow-md shadow-emerald-600/10"
                                                >
                                                    Mark as Packed & Completed
                                                </button>
                                            )}

                                            {/* Process Sales Return Button (Only for PACKED/Completed orders) */}
                                            {selectedDetailedOrder.status === 'PACKED' && (
                                                <button
                                                    onClick={() => setShowReturnModal(true)}
                                                    className="flex-1 py-3 px-4 bg-rose-600 hover:bg-rose-700 text-white font-black text-xs uppercase rounded-xl active:scale-95 transition-all duration-200 flex items-center justify-center gap-1.5 cursor-pointer shadow-md shadow-rose-600/10"
                                                >
                                                    Process Sales Return
                                                </button>
                                            )}

                                            <button
                                                onClick={async () => {
                                                    if (!confirm("Are you sure you want to cancel and void this order? This cannot be undone.")) return
                                                    setActing(true)
                                                    try {
                                                        const { error } = await supabase.rpc('update_order_status', {
                                                            p_order_id: selectedDetailedOrder.id,
                                                            p_status: 'CANCELLED',
                                                            p_remarks: fulfillmentRemarksInput.trim() || null
                                                        })
                                                        if (error) throw error
                                                        setSelectedDetailedOrder(null)
                                                        fetchLiveOrders()
                                                    } catch (err: any) {
                                                        alert('Error: ' + err.message)
                                                    } finally {
                                                        setActing(false)
                                                    }
                                                }}
                                                className="py-3 px-5 bg-rose-50 border border-rose-200 text-rose-700 hover:bg-rose-100 font-extrabold text-xs uppercase rounded-xl active:scale-95 transition-all duration-200 flex items-center justify-center gap-1.5 cursor-pointer shadow-sm"
                                            >
                                                Cancel Order
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )
            }

            {/* PROCESS SALES RETURN MODAL */}
            {
                showReturnModal && selectedDetailedOrder && (
                    <div role="dialog" aria-modal="true" className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-md overflow-y-auto">
                        <div className="relative w-full max-w-2xl bg-slate-905 border border-rose-900/50 rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[85vh]">

                            <div className="flex items-center justify-between px-6 py-4 border-b border-rose-900/40 bg-rose-950/20">
                                <h2 className="text-sm font-black text-rose-500 uppercase tracking-widest font-outfit">
                                    Return / Refund Items
                                </h2>
                                <button
                                    onClick={() => {
                                        setShowReturnModal(false)
                                        setReturnQuantities({})
                                        setReturnNotes('')
                                    }}
                                    className="rounded-xl p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                                >
                                    <X className="h-5 w-5" />
                                </button>
                            </div>

                            <div className="p-6 overflow-y-auto space-y-6 flex-1">
                                {acting && (
                                    <div className="text-center bg-rose-500/10 text-rose-400 p-4 border border-rose-500/20 rounded-xl">
                                        Processing return transaction globally...
                                    </div>
                                )}

                                <div className="overflow-hidden border border-slate-850 rounded-2xl bg-slate-950/20">
                                    <table className="w-full text-left border-collapse text-xs">
                                        <thead>
                                            <tr className="border-b border-slate-850 bg-slate-950/40 text-slate-450 font-bold uppercase tracking-wider">
                                                <th className="py-3 px-4">Item details</th>
                                                <th className="py-3 px-4 text-center">Ordered</th>
                                                <th className="py-3 px-4 text-center">Returning</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-850/40 text-slate-300">
                                            {(selectedDetailedOrder.order_items || []).map((item: any) => {
                                                const val = returnQuantities[item.product_id] || 0
                                                return (
                                                    <tr key={item.id} className="hover:bg-slate-900/30">
                                                        <td className="py-3 px-4 text-[10px]">
                                                            <div className="font-bold text-slate-100">{item.products?.product_name}</div>
                                                            <div className="text-slate-500 font-mono mt-0.5">{item.products?.ref_code}</div>
                                                        </td>
                                                        <td className="py-3 px-4 text-center font-bold font-mono">
                                                            {item.quantity}
                                                        </td>
                                                        <td className="py-3 px-4 text-center">
                                                            <input
                                                                type="number"
                                                                min={0}
                                                                max={item.quantity}
                                                                value={val === 0 ? '' : val}
                                                                onChange={(e) => {
                                                                    const num = parseInt(e.target.value) || 0
                                                                    setReturnQuantities(prev => ({
                                                                        ...prev,
                                                                        [item.product_id]: Math.min(Math.max(0, num), item.quantity)
                                                                    }))
                                                                }}
                                                                placeholder="0"
                                                                className="w-16 bg-slate-950 border border-slate-700 p-1.5 rounded text-center text-rose-400 font-black focus:outline-none focus:border-rose-500 font-mono"
                                                            />
                                                        </td>
                                                    </tr>
                                                )
                                            })}
                                        </tbody>
                                    </table>
                                </div>

                                <div>
                                    <label className="block text-[10px] font-black uppercase text-slate-500 tracking-wider mb-2">
                                        Return Accounting Remarks (Optional)
                                    </label>
                                    <textarea
                                        value={returnNotes}
                                        onChange={(e) => setReturnNotes(e.target.value)}
                                        placeholder="Provide reason for return..."
                                        rows={2}
                                        className="w-full rounded-xl bg-slate-950 border border-slate-800 p-3 text-slate-200 text-xs font-semibold focus:outline-none focus:border-rose-500"
                                    />
                                </div>
                            </div>

                            <div className="px-6 py-4 bg-slate-900/30 border-t border-slate-850 flex justify-end">
                                <button
                                    onClick={handleProcessReturn}
                                    disabled={acting}
                                    className="px-6 py-2.5 bg-rose-500 hover:bg-rose-600 disabled:opacity-50 text-white font-black text-xs uppercase rounded-xl transition-colors shadow-lg shadow-rose-900/20"
                                >
                                    Process & Credit Ledger
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }
        </div >
    )
}
