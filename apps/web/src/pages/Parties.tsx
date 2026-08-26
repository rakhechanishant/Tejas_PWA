import React, { useEffect, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { PartyForm } from '../components/PartyForm'
import {
    Search,
    UserPlus,
    MapPin,
    Phone,
    ChevronRight,
    BookOpen,
    Edit3,
    AlertTriangle,
    RefreshCw,
    X,
    ArrowUpRight,
    ArrowDownLeft,
    FileText,
    Receipt,
    Eye,
    ChevronDown,
    Info,
    Package,
    Calendar
} from 'lucide-react'

interface Party {
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

export const Parties: React.FC = () => {
    const navigate = useNavigate()
    const [parties, setParties] = useState<Party[]>([])
    const [loading, setLoading] = useState(true)
    const [errorMsg, setErrorMsg] = useState('')

    // Search filter
    const [searchQuery, setSearchQuery] = useState('')
    const [currentPage, setCurrentPage] = useState(1)

    // Modals state
    const [showFormModal, setShowFormModal] = useState(false)
    const [selectedPartyForEdit, setSelectedPartyForEdit] = useState<Party | null>(null)

    // Selected Profile state for side drawer / detailed view modal
    const [activeProfile, setActiveProfile] = useState<Party | null>(null)

    // Drawer tabs & history data
    const [drawerTab, setDrawerTab] = useState<'info' | 'orders' | 'payments' | 'ledger'>('info')
    const [partyOrders, setPartyOrders] = useState<any[]>([])
    const [partyPayments, setPartyPayments] = useState<any[]>([])
    const [ledgerEntries, setLedgerEntries] = useState<any[]>([])
    const [loadingDrawerData, setLoadingDrawerData] = useState(false)

    // Ledger sub-view control
    const [ledgerViewType, setLedgerViewType] = useState<'chronological' | 'billwise'>('chronological')
    const [expandedBillIds, setExpandedBillIds] = useState<Record<number, boolean>>({})

    // Detail transaction inspector modal
    const [selectedInspectTx, setSelectedInspectTx] = useState<{
        type: 'order' | 'payment'
        data: any
    } | null>(null)
    const [inspectOrderItems, setInspectOrderItems] = useState<any[]>([])
    const [loadingInspectItems, setLoadingInspectItems] = useState(false)
    const [profiles, setProfiles] = useState<any[]>([])

    // Date range filters
    const [dateFilter, setDateFilter] = useState<'all' | 'this-month' | 'last-month' | 'this-quarter' | 'this-year' | 'custom'>('all')
    const [customStartDate, setCustomStartDate] = useState<string>('')
    const [customEndDate, setCustomEndDate] = useState<string>('')

    const dateBounds = useMemo(() => {
        let startBound: Date | null = null
        let endBound: Date | null = null
        const now = new Date()

        if (dateFilter === 'this-month') {
            startBound = new Date(now.getFullYear(), now.getMonth(), 1)
            endBound = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999)
        } else if (dateFilter === 'last-month') {
            startBound = new Date(now.getFullYear(), now.getMonth() - 1, 1)
            endBound = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999)
        } else if (dateFilter === 'this-quarter') {
            const currentQuarter = Math.floor(now.getMonth() / 3)
            const startMonth = currentQuarter * 3
            startBound = new Date(now.getFullYear(), startMonth, 1)
            endBound = new Date(now.getFullYear(), startMonth + 3, 0, 23, 59, 59, 999)
        } else if (dateFilter === 'this-year') {
            startBound = new Date(now.getFullYear(), 0, 1)
            endBound = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999)
        } else if (dateFilter === 'custom') {
            if (customStartDate) startBound = new Date(customStartDate + 'T00:00:00')
            if (customEndDate) endBound = new Date(customEndDate + 'T23:59:59.999')
        }

        return { startBound, endBound }
    }, [dateFilter, customStartDate, customEndDate])

    const filteredPartyOrders = useMemo(() => {
        const { startBound, endBound } = dateBounds
        return partyOrders.filter((o) => {
            const oDate = new Date(o.created_at || o.billed_at)
            if (startBound && oDate < startBound) return false
            if (endBound && oDate > endBound) return false
            return true
        })
    }, [partyOrders, dateBounds])

    const filteredPartyPayments = useMemo(() => {
        const { startBound, endBound } = dateBounds
        return partyPayments.filter((p) => {
            const pDate = new Date(p.payment_date || p.created_at)
            if (startBound && pDate < startBound) return false
            if (endBound && pDate > endBound) return false
            return true
        })
    }, [partyPayments, dateBounds])


    useEffect(() => {
        if (activeProfile?.id) {
            setDrawerTab('info')
            fetchPartyDrawerData(activeProfile.id)
        }
    }, [activeProfile?.id])

    const fetchPartyDrawerData = async (partyId: number) => {
        setLoadingDrawerData(true)
        try {
            // Fetch orders
            const { data: oData, error: oError } = await supabase
                .from('orders')
                .select(`
                    id, 
                    order_number, 
                    total_amount, 
                    amount_paid,
                    due_amount, 
                    status, 
                    notes,
                    bill_number,
                    invoice_number,
                    billing_remarks,
                    billed_at,
                    billed_by,
                    fulfillment_remarks,
                    packed_at,
                    dispatched_at,
                    delivered_at,
                    created_by,
                    created_at
                `)
                .eq('party_id', partyId)
                .order('created_at', { ascending: false })

            if (oError) throw oError

            // Fetch payments
            const { data: pData, error: pError } = await supabase
                .from('payments')
                .select(`
                    id,
                    order_id,
                    amount,
                    method,
                    reference,
                    payment_date,
                    notes,
                    created_at,
                    profiles ( name )
                `)
                .eq('party_id', partyId)
                .order('created_at', { ascending: false })

            if (pError) throw pError

            // Fetch ledger entries
            const { data: lData, error: lError } = await supabase
                .from('ledger_entries')
                .select(`
                    id,
                    transaction_type,
                    reference_id,
                    reference_type,
                    credit,
                    debit,
                    balance,
                    description,
                    transaction_date,
                    created_at
                `)
                .eq('party_id', partyId)
                .order('created_at', { ascending: false })

            if (lError) throw lError

            setPartyOrders(oData || [])
            setPartyPayments((pData || []).map((row: any) => ({
                id: row.id,
                order_id: row.order_id,
                amount: Number(row.amount || 0),
                method: row.method,
                reference: row.reference,
                payment_date: row.payment_date,
                created_at: row.created_at,
                notes: row.notes,
                recorded_by_name: row.profiles?.name || 'Staff'
            })))
            setLedgerEntries(lData || [])
        } catch (err) {
            console.error('Failed to load party history details:', err)
        } finally {
            setLoadingDrawerData(false)
        }
    }

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

    const getProfileName = (id: string | null) => {
        if (!id) return 'Unassigned / System'
        const p = profiles.find((prof) => prof.id === id)
        return p ? `${p.name} (${p.role})` : 'System Staff'
    }

    const handleInspectClick = async (type: 'order' | 'payment', item: any) => {
        let inspectItem = item
        if (item && 'reference_id' in item) {
            if (type === 'order') {
                inspectItem = partyOrders.find(o => Number(o.id) === Number(item.reference_id))
            } else {
                inspectItem = partyPayments.find(p => Number(p.id) === Number(item.reference_id))
            }
        }
        if (!inspectItem) {
            alert('Source detailed transaction information not found.')
            return
        }

        if (type === 'order') {
            setSelectedInspectTx({ type: 'order', data: inspectItem })
            setLoadingInspectItems(true)
            try {
                const { data, error } = await supabase
                    .from('order_items')
                    .select(`
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
                    `)
                    .eq('order_id', inspectItem.id)
                if (error) throw error
                setInspectOrderItems(data || [])
            } catch (err) {
                console.error('Error fetching order items for inspector:', err)
                setInspectOrderItems([])
            } finally {
                setLoadingInspectItems(false)
            }
        } else {
            setSelectedInspectTx({ type: 'payment', data: inspectItem })
        }
    }

    const ledgerItems = useMemo(() => {
        const itemsList = ledgerEntries.map((le) => {
            const type = Number(le.debit) > 0 ? 'debit' as const : 'credit' as const
            const isCancelled = le.transaction_type === 'CANCELLATION'
            const amount = Number(le.debit) > 0 ? Number(le.debit) : Number(le.credit)

            // Let's decide a title
            let title = ''
            if (le.transaction_type === 'ORDER') {
                const matchedOrder = partyOrders.find(o => Number(o.id) === Number(le.reference_id))
                title = matchedOrder?.order_number || le.description || 'Order purchase'
            } else if (le.transaction_type === 'PAYMENT') {
                const matchedPayment = partyPayments.find(p => Number(p.id) === Number(le.reference_id))
                title = matchedPayment ? `Payment (${matchedPayment.method})` : le.description || 'Payment received'
            } else if (le.transaction_type === 'CANCELLATION') {
                title = 'Cancelled Order Reversal'
            } else {
                title = le.description || le.transaction_type
            }

            return {
                id: le.id,
                date: le.transaction_date || le.created_at,
                type: type,
                title: title,
                description: le.description || '',
                amount: amount,
                running_balance: Number(le.balance),
                isCancelled: isCancelled,
                raw: le
            }
        })

        const { startBound, endBound } = dateBounds
        let openingBalance = 0
        const filteredList: any[] = []

        // In ledgerEntries, items are fetched descending (newest first). Let's sort chronological ascending first to compute opening balance
        const chunkSortedAsc = [...itemsList].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

        chunkSortedAsc.forEach((item) => {
            const itemDate = new Date(item.date)
            const isBeforeStart = startBound && itemDate < startBound
            const isAfterEnd = endBound && itemDate > endBound

            if (isBeforeStart) {
                openingBalance = item.running_balance
            }

            if (!isBeforeStart && !isAfterEnd) {
                filteredList.push(item)
            }
        })

        // Sort descending (newest on top) for chronological presentation
        const reversed = filteredList.reverse()

        // Append brought forward Balance row at the bottom of descending timeline
        if (startBound) {
            reversed.push({
                id: 'opening-balance',
                date: startBound.toISOString(),
                type: 'opening' as const,
                title: 'Opening Balance (Brought Forward)',
                description: 'Brought forward ledger balance preceding selected period',
                amount: Math.abs(openingBalance),
                isCancelled: false,
                running_balance: openingBalance,
                raw: null
            })
        }

        return reversed
    }, [ledgerEntries, partyOrders, partyPayments, dateBounds])

    useEffect(() => {
        fetchParties()
        fetchProfiles()
    }, [])

    const fetchParties = async () => {
        setLoading(true)
        setErrorMsg('')
        try {
            const { data, error } = await supabase
                .from('parties')
                .select('*')
                .order('Parties_name', { ascending: true })

            if (error) {
                throw error
            }

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
            console.error('Failed to load parties:', err)
            setErrorMsg(err.message || 'Could not load client registry records.')
        } finally {
            setLoading(false)
        }
    }

    // Real-time keystroke filtering
    const filteredParties = useMemo(() => {
        const query = searchQuery.trim().toLowerCase()
        if (!query) return parties

        return parties.filter((p) => {
            const matchesName = p.name?.toLowerCase().includes(query)
            const matchesCode = p.party_code?.toLowerCase().includes(query)
            const matchesPhone = p.phone?.toLowerCase().includes(query)
            const matchesCity = p.city?.toLowerCase().includes(query)
            const matchesAddress = p.address?.toLowerCase().includes(query)

            return matchesName || matchesCode || matchesPhone || matchesCity || matchesAddress
        })
    }, [parties, searchQuery])

    // Reset pagination to page 1 when search text changes
    useEffect(() => {
        setCurrentPage(1)
    }, [searchQuery])

    const ITEMS_PER_PAGE = 15
    const totalPages = Math.ceil(filteredParties.length / ITEMS_PER_PAGE)
    const paginatedParties = useMemo(() => {
        const start = (currentPage - 1) * ITEMS_PER_PAGE
        return filteredParties.slice(start, start + ITEMS_PER_PAGE)
    }, [filteredParties, currentPage])

    // Summary Metrics
    const summary = useMemo(() => {
        let totalDues = 0
        let totalLimits = 0
        let debtorsCount = 0

        parties.forEach((p) => {
            totalDues += Number(p.total_due || 0)
            totalLimits += Number(p.credit_limit || 0)
            if (Number(p.total_due || 0) > 0) {
                debtorsCount++
            }
        })

        return { totalDues, totalLimits, debtorsCount }
    }, [parties])

    const handleEditClick = (e: React.MouseEvent, p: Party) => {
        e.stopPropagation() // Don't trigger the detail modal
        setSelectedPartyForEdit(p)
        setShowFormModal(true)
    }

    const handleSaveSuccess = () => {
        setShowFormModal(false)
        setSelectedPartyForEdit(null)
        fetchParties()
    }

    return (
        <div className="space-y-6">
            {/* Title Bar */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between font-outfit">
                <div>
                    <h1 className="text-3xl font-extrabold tracking-tight text-neutral-800">Parties Registry</h1>
                    <p className="text-sm text-slate-500">Track Nepal store accounts, outstanding dues, credit limits, and contact profiles.</p>
                </div>

                <div className="flex gap-2">
                    <button
                        onClick={fetchParties}
                        title="Reload registry"
                        className="flex h-11 w-11 items-center justify-center rounded-xl bg-white border border-slate-200 hover:bg-slate-900 active:scale-95 transition-all text-slate-500 hover:text-slate-700 shadow-sm cursor-pointer"
                    >
                        <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                    </button>

                    <button
                        onClick={() => {
                            setSelectedPartyForEdit(null)
                            setShowFormModal(true)
                        }}
                        className="btn-primary-blue inline-flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs"
                    >
                        <UserPlus className="h-4 w-4" />
                        Add Customer
                    </button>
                </div>
            </div>

            {/* Credit Dues Summary Bar */}
            <div className="grid gap-4 sm:grid-cols-3 font-outfit">
                <div className="rounded-2xl border border-rose-100 bg-rose-50/40 p-5 shadow-sm">
                    <span className="block text-xs font-semibold text-rose-600 uppercase tracking-wider">Total Outstanding Dues</span>
                    <span className="block text-2xl font-extrabold text-rose-600 mt-1">
                        रु {summary.totalDues.toLocaleString('en-NP', { minimumFractionDigits: 2 })}
                    </span>
                </div>
                <div className="rounded-2xl border border-amber-100 bg-amber-50/40 p-5 shadow-sm">
                    <span className="block text-xs font-semibold text-amber-600 uppercase tracking-wider">Active Credit Accounts</span>
                    <span className="block text-2xl font-extrabold text-amber-600 mt-1">
                        {summary.debtorsCount} Stores
                    </span>
                </div>
                <div className="rounded-2xl border border-blue-100 bg-blue-50/40 p-5 shadow-sm">
                    <span className="block text-xs font-semibold text-blue-600 uppercase tracking-wider">Total Offered Limit</span>
                    <span className="block text-2xl font-extrabold text-blue-600 mt-1">
                        रु {summary.totalLimits.toLocaleString('en-NP', { minimumFractionDigits: 2 })}
                    </span>
                </div>
            </div>

            {/* Filter and Search Layout Control */}
            <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-sm">
                <div className="relative">
                    <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                        <Search className="h-5 w-5 text-neutral-600" />
                    </div>
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search by store name, party code, phone, address..."
                        className="block w-full rounded-xl border border-slate-200 bg-white py-3 pr-4 pl-10 text-neutral-800 placeholder-slate-400 transition-colors focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                    />
                </div>
            </div>

            {/* Error state */}
            {errorMsg && (
                <div className="flex items-center gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-rose-700 text-sm font-medium font-outfit">
                    <AlertTriangle className="h-5 w-5 text-rose-600" />
                    <span>{errorMsg}</span>
                </div>
            )}

            {/* Parties Grid */}
            {loading ? (
                <div className="space-y-3">
                    {[...Array(5)].map((_, i) => (
                        <div key={i} className="animate-pulse rounded-2xl border border-slate-200 bg-slate-900 p-5 h-20"></div>
                    ))}
                </div>
            ) : (
                <>
                    {filteredParties.length === 0 ? (
                        <div className="flex flex-col items-center justify-center p-12 text-center rounded-2xl border border-slate-200 bg-slate-900/55 font-outfit">
                            <BookOpen className="h-12 w-12 text-neutral-600 mb-3" />
                            <h3 className="text-lg font-bold text-slate-700">No customer matches</h3>
                            <p className="text-xs text-slate-500 max-w-sm mt-1">Check that you typed the spelling correctly, or register a new store account.</p>
                        </div>
                    ) : (
                        <div className="grid gap-3">
                            {paginatedParties.map((p) => {
                                const outstanding = Number(p.total_due || 0)
                                const isLimitExceeded = outstanding > Number(p.credit_limit || 0)

                                return (
                                    <div
                                        key={p.id}
                                        onClick={() => setActiveProfile(p)}
                                        className="group rounded-2xl border border-slate-200 bg-white hover:border-slate-300 p-4 transition-all hover:bg-slate-900/60 shadow-sm flex items-center justify-between cursor-pointer"
                                    >
                                        <div className="flex items-center gap-4 min-w-0">
                                            {/* Code avatar label */}
                                            <div className="hidden sm:flex h-12 w-12 rounded-xl bg-slate-900 group-hover:bg-blue-50 border border-slate-200 items-center justify-center text-slate-500 group-hover:text-blue-600 transition-colors uppercase font-bold text-[10px] text-center font-mono">
                                                {p.party_code.replace("TEJAS-", "")}
                                            </div>

                                            <div className="min-w-0 space-y-1 font-outfit">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <h3 className="text-sm font-bold text-neutral-800 group-hover:text-blue-600 transition-colors truncate">
                                                        {p.name}
                                                    </h3>
                                                    <span className="text-[9px] font-bold py-0.5 px-2 rounded-md bg-slate-850 text-slate-600 border border-slate-200">
                                                        {p.party_type || 'Retailer'}
                                                    </span>
                                                </div>

                                                {/* Details row */}
                                                <div className="flex items-center gap-3 text-xs text-slate-500 flex-wrap">
                                                    {p.phone && (
                                                        <span className="flex items-center gap-1.5 font-mono text-[11px] text-slate-600">
                                                            <Phone className="h-3.5 w-3.5 text-neutral-600" />
                                                            {p.phone}
                                                        </span>
                                                    )}
                                                    {p.city && (
                                                        <span className="flex items-center gap-1 text-slate-500 truncate">
                                                            <MapPin className="h-3.5 w-3.5 shrink-0 text-neutral-600" />
                                                            {p.city}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>

                                        {/* Dues / Credit Display */}
                                        <div className="flex items-center gap-4 shrink-0 font-outfit">
                                            <div className="text-right">
                                                <span className="block text-[9px] font-semibold text-neutral-600 uppercase tracking-wider">Due Amount</span>
                                                <span className={`text-sm font-extrabold font-outfit ${outstanding > 0
                                                    ? isLimitExceeded ? 'text-rose-600 underline decoration-wavy' : 'text-amber-600 font-bold'
                                                    : 'text-slate-500'
                                                    }`}>
                                                    रु {outstanding.toLocaleString('en-NP', { minimumFractionDigits: 2 })}
                                                </span>
                                            </div>

                                            <div className="flex items-center gap-1.5">
                                                <button
                                                    type="button"
                                                    onClick={(e) => handleEditClick(e, p)}
                                                    title="Edit Customer"
                                                    className="p-2 rounded-lg bg-slate-900 hover:bg-blue-50 border border-slate-200 hover:border-blue-200 text-slate-600 hover:text-blue-600 transition-colors cursor-pointer"
                                                >
                                                    <Edit3 className="h-3.5 w-3.5" />
                                                </button>
                                                <ChevronRight className="h-5 w-5 text-neutral-600 group-hover:text-blue-600 transition-colors hidden sm:block" />
                                            </div>
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    )}

                    {/* Pagination Selector Bar */}
                    {totalPages > 1 && (
                        <div className="mt-6 flex flex-wrap items-center justify-center gap-2 border-t border-slate-200 pt-4 font-outfit">
                            <button
                                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                                disabled={currentPage === 1}
                                className="flex h-9 items-center justify-center rounded-xl bg-white border border-slate-200 px-4 text-xs font-semibold text-slate-600 hover:bg-slate-900 disabled:opacity-40 disabled:hover:bg-white disabled:hover:text-neutral-600 transition-colors cursor-pointer"
                            >
                                Previous
                            </button>
                            {[...Array(totalPages)].map((_, idx) => {
                                const pageNum = idx + 1
                                return (
                                    <button
                                        key={pageNum}
                                        onClick={() => setCurrentPage(pageNum)}
                                        className={`flex h-9 w-9 items-center justify-center rounded-xl text-xs font-bold transition-all cursor-pointer ${currentPage === pageNum
                                            ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
                                            : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-900'
                                            }`}
                                    >
                                        {pageNum}
                                    </button>
                                )
                            })}
                            <button
                                onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                                disabled={currentPage === totalPages}
                                className="flex h-9 items-center justify-center rounded-xl bg-white border border-slate-200 px-4 text-xs font-semibold text-slate-600 hover:bg-slate-900 disabled:opacity-40 disabled:hover:bg-white disabled:hover:text-neutral-600 transition-colors cursor-pointer"
                            >
                                Next
                            </button>
                        </div>
                    )}
                </>
            )}

            {/* DRAWER / DETAILS MODAL */}
            {activeProfile && (
                <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-end bg-slate-900/40 backdrop-blur-sm p-4">
                    <div className="w-full max-w-lg h-full bg-white border-l border-slate-200 rounded-3xl p-6 md:p-8 flex flex-col justify-between shadow-2xl animate-in slide-in-from-right duration-300">
                        {/* Header info */}
                        <div className="flex flex-col h-full overflow-hidden font-outfit">
                            <div className="flex items-center justify-between pb-4 border-b border-slate-205 shrink-0">
                                <div>
                                    <span className="text-[10px] font-mono font-bold tracking-wider text-blue-600 uppercase">
                                        {activeProfile.party_code}
                                    </span>
                                    <h2 className="text-xl font-extrabold text-neutral-800 mt-1 font-outfit leading-tight truncate max-w-[320px]">
                                        {activeProfile.name}
                                    </h2>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setActiveProfile(null)}
                                    className="text-slate-500 hover:text-slate-700 rounded-lg p-1.5 hover:bg-slate-850 transition-colors cursor-pointer"
                                >
                                    <X className="h-5 w-5" />
                                </button>
                            </div>

                            {/* Section Switch Tabs */}
                            <div className="flex border-b border-slate-200 py-2 shrink-0 overflow-x-auto gap-2 scrollbar-none">
                                <button
                                    onClick={() => setDrawerTab('info')}
                                    className={`flex-shrink-0 pb-2 px-1 text-[10px] font-black uppercase tracking-wider transition-all border-b-2 cursor-pointer ${drawerTab === 'info'
                                        ? 'border-blue-600 text-blue-600 font-bold'
                                        : 'border-transparent text-slate-450 hover:text-slate-700'
                                        }`}
                                >
                                    General Info
                                </button>
                                <button
                                    onClick={() => setDrawerTab('orders')}
                                    className={`flex-shrink-0 pb-2 px-1 text-[10px] font-black uppercase tracking-wider transition-all border-b-2 cursor-pointer ${drawerTab === 'orders'
                                        ? 'border-blue-600 text-blue-600 font-bold'
                                        : 'border-transparent text-slate-450 hover:text-slate-700'
                                        }`}
                                >
                                    Orders ({filteredPartyOrders.length})
                                </button>
                                <button
                                    onClick={() => setDrawerTab('payments')}
                                    className={`flex-shrink-0 pb-2 px-1 text-[10px] font-black uppercase tracking-wider transition-all border-b-2 cursor-pointer ${drawerTab === 'payments'
                                        ? 'border-blue-600 text-blue-600 font-bold'
                                        : 'border-transparent text-slate-455 hover:text-slate-700'
                                        }`}
                                >
                                    Payments ({filteredPartyPayments.length})
                                </button>
                                <button
                                    onClick={() => setDrawerTab('ledger')}
                                    className={`flex-shrink-0 pb-2 px-1 text-[10px] font-black uppercase tracking-wider transition-all border-b-2 cursor-pointer ${drawerTab === 'ledger'
                                        ? 'border-blue-600 text-blue-600 font-bold'
                                        : 'border-transparent text-slate-450 hover:text-slate-700'
                                        }`}
                                >
                                    Ledger ({ledgerItems.length})
                                </button>
                            </div>

                            {/* Global Date Filter Box */}
                            {drawerTab !== 'info' && (
                                <div className="mt-3.5 bg-slate-900 p-3 rounded-2xl border border-slate-205 space-y-2 shrink-0 animate-in fade-in slide-in-from-top-2 duration-250 font-outfit">
                                    <div className="flex items-center justify-between gap-3">
                                        <div className="flex items-center gap-2">
                                            <Calendar className="h-3.5 w-3.5 text-blue-600 shrink-0" />
                                            <span className="text-[10px] font-bold text-slate-500 tracking-wider">
                                                TIMELINE PERIOD
                                            </span>
                                        </div>
                                        <select
                                            value={dateFilter}
                                            onChange={(e) => {
                                                setDateFilter(e.target.value as any)
                                                if (e.target.value !== 'custom') {
                                                    setCustomStartDate('')
                                                    setCustomEndDate('')
                                                }
                                            }}
                                            className="bg-white border border-slate-200 rounded-xl px-2.5 py-1 text-[10px] font-bold text-slate-700 focus:border-blue-500 focus:outline-none transition-all cursor-pointer font-outfit shadow-sm"
                                        >
                                            <option value="all">All Time</option>
                                            <option value="this-month">This Month</option>
                                            <option value="last-month">Last Month</option>
                                            <option value="this-quarter">This Quarter</option>
                                            <option value="this-year">This Year</option>
                                            <option value="custom">Custom Range</option>
                                        </select>
                                    </div>

                                    {dateFilter === 'custom' && (
                                        <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-200/60 transition-all duration-300">
                                            <div>
                                                <label className="block text-[8px] font-bold text-slate-500 uppercase tracking-wider mb-1 font-outfit">Start Date</label>
                                                <input
                                                    type="date"
                                                    value={customStartDate}
                                                    onChange={(e) => setCustomStartDate(e.target.value)}
                                                    className="w-full bg-white border border-slate-200 rounded-lg px-2 py-0.5 text-[10px] text-slate-700 focus:border-blue-550 focus:outline-none transition-colors font-mono"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-[8px] font-bold text-slate-500 uppercase tracking-wider mb-1 font-outfit">End Date</label>
                                                <input
                                                    type="date"
                                                    value={customEndDate}
                                                    onChange={(e) => setCustomEndDate(e.target.value)}
                                                    className="w-full bg-white border border-slate-200 rounded-lg px-2 py-0.5 text-[10px] text-slate-700 focus:border-blue-550 focus:outline-none transition-colors font-mono"
                                                />
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Scrollable Content section */}
                            <div className="flex-1 overflow-y-auto mt-4 pr-1 text-xs">
                                {drawerTab === 'info' && (
                                    <div className="space-y-4 font-outfit">
                                        {/* Contact Section */}
                                        <div className="bg-slate-900 p-4 rounded-2xl border border-slate-200 shadow-sm space-y-3">
                                            <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Contact Person Details</h4>
                                            <div className="grid grid-cols-2 gap-2 text-slate-700">
                                                <div>
                                                    <span className="block text-[10px] text-slate-500 font-medium">Full Name</span>
                                                    <span className="font-semibold text-neutral-800">{activeProfile.contact_person || 'N/A'}</span>
                                                </div>
                                                <div>
                                                    <span className="block text-[10px] text-slate-500 font-medium">Designation</span>
                                                    <span className="font-semibold text-neutral-800">{activeProfile.designation || 'N/A'}</span>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Account Balances */}
                                        <div className="bg-slate-900 p-4 rounded-2xl border border-slate-200 shadow-sm space-y-3">
                                            <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Financial Credit Info</h4>
                                            <div className="grid grid-cols-2 gap-2 text-slate-700">
                                                <div>
                                                    <span className="block text-[10px] text-slate-500 font-medium">Total Credit Due</span>
                                                    <span className="font-extrabold text-sm text-rose-600">
                                                        रु {activeProfile.total_due.toLocaleString('en-NP', { minimumFractionDigits: 2 })}
                                                    </span>
                                                </div>
                                                <div>
                                                    <span className="block text-[10px] text-slate-500 font-medium">Allowed Limit</span>
                                                    <span className="font-bold text-xs text-blue-600">
                                                        रु {activeProfile.credit_limit.toLocaleString('en-NP', { minimumFractionDigits: 2 })}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Specifications & Addresses */}
                                        <div className="bg-slate-900 p-4 rounded-2xl border border-slate-200 shadow-sm space-y-3">
                                            <h4 className="text-[10px] font-bold text-slate-505 uppercase tracking-wider">Demographic Profile</h4>
                                            <div className="space-y-2">
                                                <div>
                                                    <span className="block text-[10px] text-slate-500 font-medium">Consolidated Address</span>
                                                    <p className="text-slate-700 mt-0.5 leading-relaxed bg-white p-2 rounded-lg border border-slate-200 text-xs">
                                                        {activeProfile.address || 'No address logged.'}
                                                    </p>
                                                </div>

                                                <div className="grid grid-cols-3 gap-2">
                                                    <div>
                                                        <span className="block text-[10px] text-slate-500 font-medium">Province</span>
                                                        <span className="font-medium text-neutral-800">{activeProfile.province || 'N/A'}</span>
                                                    </div>
                                                    <div>
                                                        <span className="block text-[10px] text-slate-500 font-medium">District</span>
                                                        <span className="font-medium text-neutral-800">{activeProfile.district || 'N/A'}</span>
                                                    </div>
                                                    <div>
                                                        <span className="block text-[10px] text-slate-500 font-medium">City / Town</span>
                                                        <span className="font-medium text-neutral-800">{activeProfile.city || 'N/A'}</span>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Additional Settings */}
                                        <div className="bg-slate-900 p-4 rounded-2xl border border-slate-200 shadow-sm">
                                            <div className="grid grid-cols-2 gap-2 text-slate-700">
                                                <div>
                                                    <span className="block text-[10px] text-slate-500 font-medium">PAN Number</span>
                                                    <span className="font-mono font-bold text-neutral-800">{activeProfile.pan || 'N/A'}</span>
                                                </div>
                                                <div>
                                                    <span className="block text-[10px] text-slate-500 font-medium">Salesperson Assigned</span>
                                                    <span className="font-medium text-neutral-800">{activeProfile.sales_person || 'No representative assigned'}</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {drawerTab === 'orders' && (
                                    <div className="space-y-3">
                                        {loadingDrawerData ? (
                                            <div className="text-center py-8">
                                                <RefreshCw className="h-6 w-6 animate-spin text-slate-505 mx-auto mb-2" />
                                                <p className="text-slate-500 font-semibold">Syncing past orders...</p>
                                            </div>
                                        ) : filteredPartyOrders.length === 0 ? (
                                            <div className="text-center py-10 bg-slate-950/20 rounded-2xl border border-slate-855">
                                                <p className="text-slate-500">No orders found for this customer in selected period.</p>
                                            </div>
                                        ) : (
                                            filteredPartyOrders.map((o) => (
                                                <div
                                                    key={o.id}
                                                    onClick={() => handleInspectClick('order', o)}
                                                    className="bg-slate-900 p-3 rounded-2xl border border-slate-200 flex items-center justify-between cursor-pointer hover:border-slate-350 hover:bg-slate-850/50 transition-all font-outfit shadow-sm"
                                                >
                                                    <div>
                                                        <div className="flex items-center gap-1.5">
                                                            <span className="font-mono text-neutral-800 font-bold block">{o.order_number}</span>
                                                            <span className="text-[8px] font-bold px-1.5 py-0.5 rounded bg-slate-850 border border-slate-200 text-slate-600 uppercase">
                                                                {o.status}
                                                            </span>
                                                        </div>
                                                        <span className="text-[10px] text-slate-500 block mt-0.5">{new Date(o.created_at).toLocaleDateString()}</span>
                                                    </div>
                                                    <div className="text-right">
                                                        <span className="block font-black text-neutral-800 font-mono">रु {Number(o.total_amount).toLocaleString()}</span>
                                                        {Number(o.due_amount) > 0 && (
                                                            <span className="text-[10px] font-bold text-rose-600 block">Due: रु {Number(o.due_amount).toLocaleString()}</span>
                                                        )}
                                                    </div>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                )}

                                {drawerTab === 'payments' && (
                                    <div className="space-y-3 font-outfit">
                                        {loadingDrawerData ? (
                                            <div className="text-center py-8">
                                                <RefreshCw className="h-6 w-6 animate-spin text-neutral-600 mx-auto mb-2" />
                                                <p className="text-slate-500 font-semibold">Syncing payment records...</p>
                                            </div>
                                        ) : filteredPartyPayments.length === 0 ? (
                                            <div className="text-center py-10 bg-slate-900 rounded-2xl border border-slate-200">
                                                <p className="text-slate-500">No payment transaction records found in selected period.</p>
                                            </div>
                                        ) : (
                                            filteredPartyPayments.map((pay) => (
                                                <div
                                                    key={pay.id}
                                                    onClick={() => handleInspectClick('payment', pay)}
                                                    className="bg-slate-900 p-3 rounded-2xl border border-slate-200 space-y-1 cursor-pointer hover:border-slate-350 hover:bg-slate-850/50 transition-all shadow-sm"
                                                >
                                                    <div className="flex items-center justify-between">
                                                        <span className="font-bold text-emerald-600 font-mono">+ रु {pay.amount.toLocaleString()}</span>
                                                        <span className="text-[10px] font-semibold text-slate-500">{pay.payment_date}</span>
                                                    </div>
                                                    <div className="flex justify-between text-[10px] text-slate-550">
                                                        <span>Channel: <strong className="text-slate-700">{pay.method}</strong></span>
                                                        <span>Staff: <strong className="text-slate-700">{pay.recorded_by_name}</strong></span>
                                                    </div>
                                                    {pay.reference && (
                                                        <div className="font-mono text-[9px] text-slate-500">Ref: {pay.reference}</div>
                                                    )}
                                                    {pay.notes && (
                                                        <p className="mt-1 text-[10px] p-2 bg-white rounded border border-slate-200 text-slate-650 italic">
                                                            "{pay.notes}"
                                                        </p>
                                                    )}
                                                </div>
                                            ))
                                        )}
                                    </div>
                                )}

                                {drawerTab === 'ledger' && (
                                    <div className="space-y-4 font-outfit">
                                        {/* Ledger sub-view toggle and summary statistics */}
                                        <div className="bg-slate-900 p-4 rounded-xl border border-slate-200 space-y-3 shrink-0 shadow-sm">
                                            <div className="flex items-center justify-between border-b border-slate-200 pb-2.5">
                                                <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Ledger Outline</h4>
                                                <div className="flex bg-slate-850 border border-slate-200 p-0.5 rounded-lg">
                                                    <button
                                                        type="button"
                                                        onClick={() => setLedgerViewType('chronological')}
                                                        className={`px-2.5 py-1 text-[9px] font-black uppercase tracking-wider rounded-md transition-all cursor-pointer ${ledgerViewType === 'chronological'
                                                            ? 'bg-blue-600 text-white font-bold shadow-sm'
                                                            : 'text-slate-500 hover:text-neutral-800'
                                                            }`}
                                                    >
                                                        Timeline
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => setLedgerViewType('billwise')}
                                                        className={`px-2.5 py-1 text-[9px] font-black uppercase tracking-wider rounded-md transition-all cursor-pointer ${ledgerViewType === 'billwise'
                                                            ? 'bg-blue-600 text-white font-bold shadow-sm'
                                                            : 'text-slate-500 hover:text-neutral-800'
                                                            }`}
                                                    >
                                                        Bill-Wise
                                                    </button>
                                                </div>
                                            </div>
                                            <div className="grid grid-cols-3 gap-2 pt-1 font-outfit">
                                                <div>
                                                    <span className="block text-[8px] font-bold text-slate-500 uppercase tracking-wide">Sales in Period (Cr)</span>
                                                    <span className="font-extrabold text-xs text-blue-600">
                                                        रु {filteredPartyOrders.reduce((sum, o) => o.status !== 'CANCELLED' ? sum + Number(o.total_amount) : sum, 0).toLocaleString('en-NP', { minimumFractionDigits: 1 })}
                                                    </span>
                                                </div>
                                                <div>
                                                    <span className="block text-[8px] font-bold text-slate-500 uppercase tracking-wide">Recd in Period (Dr)</span>
                                                    <span className="font-extrabold text-xs text-emerald-600">
                                                        रु {filteredPartyPayments.reduce((sum, p) => sum + Number(p.amount), 0).toLocaleString('en-NP', { minimumFractionDigits: 1 })}
                                                    </span>
                                                </div>
                                                <div>
                                                    <span className="block text-[8px] font-bold text-slate-500 uppercase tracking-wide">Outstanding Balance</span>
                                                    <span className="font-extrabold text-xs text-rose-600">
                                                        रु {(ledgerItems.length > 0 ? ledgerItems[0].running_balance : activeProfile.total_due).toLocaleString('en-NP', { minimumFractionDigits: 1 })}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>

                                        {loadingDrawerData ? (
                                            <div className="text-center py-8">
                                                <RefreshCw className="h-6 w-6 animate-spin text-slate-500 mx-auto mb-2" />
                                                <p className="text-slate-500 font-semibold">Generating ledger statements...</p>
                                            </div>
                                        ) : ledgerViewType === 'chronological' ? (
                                            /* Chronological View List */
                                            ledgerItems.length === 0 ? (
                                                <div className="text-center py-10 bg-slate-900 rounded-2xl border border-slate-200">
                                                    <p className="text-slate-500 font-outfit">No ledger transactions found.</p>
                                                </div>
                                            ) : (
                                                <div className="space-y-2.5">
                                                    {ledgerItems.map((item) => {
                                                        const isDebit = item.type === 'debit'
                                                        return (
                                                            <div
                                                                key={item.id}
                                                                onClick={() => handleInspectClick(isDebit ? 'payment' : 'order', item.raw)}
                                                                className={`group bg-slate-900 p-3 rounded-2xl border border-slate-200 hover:border-slate-350 hover:bg-slate-850/50 transition-all flex items-center justify-between cursor-pointer ${item.isCancelled ? 'opacity-50' : ''
                                                                    }`}
                                                            >
                                                                <div className="flex items-start gap-2.5 font-outfit">
                                                                    <div className={`mt-0.5 p-1.5 rounded-lg ${item.isCancelled
                                                                        ? 'bg-slate-850 text-neutral-600'
                                                                        : isDebit
                                                                            ? 'bg-emerald-50 text-emerald-600 border border-emerald-100/30'
                                                                            : 'bg-blue-50 text-blue-600 border border-blue-100/30'
                                                                        }`}>
                                                                        {isDebit ? (
                                                                            <ArrowDownLeft className="h-3.5 w-3.5" />
                                                                        ) : (
                                                                            <ArrowUpRight className="h-3.5 w-3.5" />
                                                                        )}
                                                                    </div>
                                                                    <div>
                                                                        <div className="flex items-center gap-1.5 font-outfit">
                                                                            <span className="font-bold text-slate-805 text-xs font-mono">{item.title}</span>
                                                                            {item.isCancelled && (
                                                                                <span className="text-[7.5px] font-black tracking-wider uppercase bg-rose-50 text-rose-650 border border-rose-100 px-1 rounded-md">Void</span>
                                                                            )}
                                                                        </div>
                                                                        <span className="text-[10px] text-slate-600 block mt-0.5 leading-normal">{item.description}</span>
                                                                        <span className="text-[9px] text-slate-500 block mt-1 font-medium">{new Date(item.date).toLocaleDateString('en-NP', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                                                                    </div>
                                                                </div>
                                                                <div className="text-right pl-2 font-outfit">
                                                                    <span className={`block font-extrabold text-xs font-mono ${item.isCancelled
                                                                        ? 'text-neutral-600 line-through'
                                                                        : isDebit
                                                                            ? 'text-emerald-600'
                                                                            : 'text-neutral-800'
                                                                        }`}>
                                                                        {isDebit ? '-' : '+'} रु {item.amount.toLocaleString()}
                                                                    </span>
                                                                    {!item.isCancelled && (
                                                                        <span className="text-[9px] text-slate-500 font-mono font-bold block mt-0.5">Bal: रु {item.running_balance.toLocaleString()}</span>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        )
                                                    })}
                                                </div>
                                            )
                                        ) : (
                                            /* Bill-Wise Allocation View */
                                            filteredPartyOrders.length === 0 ? (
                                                <div className="text-center py-10 bg-slate-900 rounded-2xl border border-slate-200">
                                                    <p className="text-slate-500 font-outfit">No invoices or billing transactions recorded in selected period.</p>
                                                </div>
                                            ) : (
                                                <div className="space-y-3 font-outfit">
                                                    {filteredPartyOrders.map((order) => {
                                                        const isExpanded = !!expandedBillIds[order.id]
                                                        const allocatedPayments = partyPayments.filter((p) => p.order_id === order.id)
                                                        const isBilled = !!(order.bill_number || order.invoice_number)

                                                        // Badge color config standard
                                                        let statusCol = 'bg-slate-850 border-slate-200 text-slate-600'
                                                        if (order.status === 'CANCELLED') statusCol = 'bg-rose-50 border-rose-100 text-rose-605'
                                                        else if (order.due_amount <= 0) statusCol = 'bg-emerald-50 border-emerald-100 text-emerald-600'
                                                        else if (order.amount_paid > 0) statusCol = 'bg-amber-50 border-amber-205 text-amber-700'
                                                        else statusCol = 'bg-rose-50 border-rose-102 text-rose-600'

                                                        const paymentStatusText = order.status === 'CANCELLED'
                                                            ? 'CANCELLED'
                                                            : order.due_amount <= 0
                                                                ? 'FULLY PAID'
                                                                : order.amount_paid > 0
                                                                    ? 'PARTIALLY PAID'
                                                                    : 'UNPAID'

                                                        return (
                                                            <div key={order.id} className="bg-slate-900 border border-slate-200 rounded-2xl overflow-hidden hover:border-slate-350 transition-all shadow-sm">
                                                                <div
                                                                    onClick={() => setExpandedBillIds(prev => ({ ...prev, [order.id]: !prev[order.id] }))}
                                                                    className="p-3 select-none cursor-pointer flex items-center justify-between hover:bg-slate-850/50 transition-colors"
                                                                >
                                                                    <div className="flex items-start gap-2.5">
                                                                        <div className="mt-0.5 text-slate-550">
                                                                            <Package className="h-3.5 w-3.5" />
                                                                        </div>
                                                                        <div>
                                                                            <div className="flex items-center gap-1.5">
                                                                                <span className="font-bold text-neutral-800 font-mono text-xs">{order.order_number}</span>
                                                                                <span className={`text-[7px] font-black tracking-wider uppercase px-1.5 py-0.5 rounded-md border ${statusCol}`}>
                                                                                    {paymentStatusText}
                                                                                </span>
                                                                            </div>
                                                                            <span className="text-[10px] text-slate-550 block mt-0.5">
                                                                                {isBilled ? `Bill: ${order.bill_number || order.invoice_number}` : 'Draft/Order'}
                                                                            </span>
                                                                            <span className="text-[9px] text-slate-555 block mt-1">{new Date(order.created_at).toLocaleDateString()}</span>
                                                                        </div>
                                                                    </div>
                                                                    <div className="flex items-center gap-2 pl-2">
                                                                        <div className="text-right">
                                                                            <span className="block font-bold text-xs text-neutral-800 font-mono">रु {Number(order.total_amount).toLocaleString()}</span>
                                                                            {Number(order.due_amount) > 0 ? (
                                                                                <span className="text-[9px] font-bold text-rose-600 font-mono block mt-0.5">Due: {Number(order.due_amount).toLocaleString()}</span>
                                                                            ) : (
                                                                                <span className="text-[9px] font-bold text-emerald-600 block mt-0.5 font-outfit">Settled</span>
                                                                            )}
                                                                        </div>
                                                                        <ChevronDown className={`h-4 w-4 text-slate-500 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                                                                    </div>
                                                                </div>

                                                                {isExpanded && (
                                                                    <div className="bg-white border-t border-slate-200 p-3 space-y-2">
                                                                        <div className="flex justify-between items-center pb-2 border-b border-slate-100">
                                                                            <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Payments Allocated</span>
                                                                            <button
                                                                                type="button"
                                                                                onClick={(e) => {
                                                                                    e.stopPropagation()
                                                                                    handleInspectClick('order', order)
                                                                                }}
                                                                                className="inline-flex items-center gap-1 text-[9px] font-black text-blue-600 uppercase tracking-wider hover:text-blue-700 transition-colors cursor-pointer"
                                                                            >
                                                                                <Eye className="h-3 w-3" />
                                                                                Inspect Bill Details
                                                                            </button>
                                                                        </div>

                                                                        {allocatedPayments.length === 0 ? (
                                                                            <p className="text-[10px] text-slate-500 py-1.5 italic">No payment record traces mapped to this specific bill.</p>
                                                                        ) : (
                                                                            <div className="space-y-1.5 pt-1">
                                                                                {allocatedPayments.map((p) => (
                                                                                    <div
                                                                                        key={p.id}
                                                                                        onClick={() => handleInspectClick('payment', p)}
                                                                                        className="bg-slate-900 p-2 rounded-xl border border-slate-200 hover:border-slate-350 hover:bg-slate-850/50 flex items-center justify-between cursor-pointer transition-all shadow-sm"
                                                                                    >
                                                                                        <div className="flex items-center gap-2">
                                                                                            <Receipt className="h-3 w-3 text-emerald-600" />
                                                                                            <div>
                                                                                                <span className="text-[10px] font-bold text-slate-700">{p.method} Payment</span>
                                                                                                <span className="block text-[8px] text-slate-500">{new Date(p.created_at || p.payment_date).toLocaleDateString()}</span>
                                                                                            </div>
                                                                                        </div>
                                                                                        <div className="text-right">
                                                                                            <span className="text-[10px] font-black text-emerald-650 font-mono">रु {p.amount.toLocaleString()}</span>
                                                                                        </div>
                                                                                    </div>
                                                                                ))}
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        )
                                                    })}
                                                </div>
                                            )
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Quick Actions Footer */}
                        <div className="mt-6 pt-4 border-t border-slate-200 flex justify-between gap-3 shrink-0">
                            <button
                                type="button"
                                onClick={() => {
                                    const currentParty = activeProfile
                                    setActiveProfile(null)
                                    setSelectedPartyForEdit(currentParty)
                                    setShowFormModal(true)
                                }}
                                className="flex-1 inline-flex justify-center items-center gap-2 py-3 rounded-xl border border-slate-200 hover:bg-slate-900 hover:text-neutral-800 active:scale-95 text-xs font-semibold text-slate-700 transition-all shadow-sm cursor-pointer"
                            >
                                <Edit3 className="h-4 w-4" />
                                Edit Profile
                            </button>
                            {activeProfile.total_due > 0 && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        const currentPartyId = activeProfile.id
                                        setActiveProfile(null)
                                        navigate('/payments', { state: { preselectedPartyId: currentPartyId } })
                                    }}
                                    className="flex-1 inline-flex justify-center items-center gap-2 py-3 rounded-xl bg-amber-500 hover:bg-amber-600 font-bold active:scale-95 text-xs text-white transition-all font-outfit shadow-md cursor-pointer"
                                >
                                    Collect Dues
                                </button>
                            )}
                            <button
                                type="button"
                                onClick={() => setActiveProfile(null)}
                                className="px-5 py-3 rounded-xl bg-slate-850 hover:bg-slate-200 hover:text-neutral-800 text-xs font-bold text-slate-700 active:scale-95 transition-all cursor-pointer"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* TRANSACTION INSPECT MODAL */}
            {selectedInspectTx && (
                <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 backdrop-blur-sm p-4">
                    <div className="w-full max-w-lg bg-white border border-slate-200 rounded-3xl p-6 md:p-7 shadow-2xl animate-in fade-in zoom-in-95 duration-200 flex flex-col max-h-[85vh] overflow-hidden">
                        {/* Header */}
                        <div className="flex items-center justify-between pb-3.5 border-b border-slate-150 shrink-0">
                            <div className="flex items-center gap-2.5">
                                <div className={`p-2 rounded-xl bg-slate-900 border border-slate-200 ${selectedInspectTx.type === 'payment' ? 'text-emerald-600' : 'text-blue-600'
                                    }`}>
                                    {selectedInspectTx.type === 'payment' ? (
                                        <Receipt className="h-5 w-5" />
                                    ) : (
                                        <FileText className="h-5 w-5" />
                                    )}
                                </div>
                                <div>
                                    <h3 className="text-base font-extrabold text-neutral-800 font-outfit">
                                        {selectedInspectTx.type === 'payment' ? 'Payment Record Inspect' : 'Invoice Details Inspect'}
                                    </h3>
                                    <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">
                                        Type: {selectedInspectTx.type} document trace
                                    </span>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => setSelectedInspectTx(null)}
                                className="text-neutral-600 hover:text-neutral-800 rounded-lg p-1.5 hover:bg-slate-850 transition-colors cursor-pointer"
                            >
                                <X className="h-5 w-5" />
                            </button>
                        </div>

                        {/* Content Body - Scrollable */}
                        <div className="flex-1 overflow-y-auto py-4 space-y-4 text-xs scrollbar-thin scrollbar-thumb-slate-200 scrollbar-track-transparent">
                            {selectedInspectTx.type === 'payment' ? (
                                <div className="space-y-4">
                                    <div className="bg-slate-900 p-4 rounded-2xl border border-slate-200 space-y-3 font-outfit">
                                        <div className="flex items-center justify-between">
                                            <span className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Payment Stature</span>
                                            <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded-full uppercase">
                                                Cleared
                                            </span>
                                        </div>
                                        <div className="flex items-baseline gap-1.5 justify-start">
                                            <span className="text-sm font-bold text-slate-550">Received amount:</span>
                                            <span className="text-2xl font-black text-emerald-600 font-mono">
                                                रु {selectedInspectTx.data.amount.toLocaleString()}
                                            </span>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-3.5">
                                        <div className="bg-slate-900 border border-slate-200 p-3 rounded-xl space-y-1">
                                            <span className="block text-[8px] font-bold text-slate-500 uppercase tracking-widest">Payment Channel</span>
                                            <span className="font-bold text-xs text-neutral-800">{selectedInspectTx.data.method}</span>
                                        </div>
                                        <div className="bg-slate-900 border border-slate-200 p-3 rounded-xl space-y-1">
                                            <span className="block text-[8px] font-bold text-slate-500 uppercase tracking-widest">Transaction Date</span>
                                            <span className="font-semibold text-xs text-neutral-800">{new Date(selectedInspectTx.data.payment_date || selectedInspectTx.data.created_at).toLocaleDateString()}</span>
                                        </div>
                                        <div className="bg-slate-900 border border-slate-200 p-3 rounded-xl space-y-1 col-span-2">
                                            <span className="block text-[8px] font-bold text-slate-500 uppercase tracking-widest">Recorded By Staff</span>
                                            <span className="font-bold text-xs text-slate-700">{selectedInspectTx.data.recorded_by_name}</span>
                                        </div>
                                    </div>

                                    {selectedInspectTx.data.reference && (
                                        <div className="bg-slate-900 p-3 rounded-xl border border-slate-200 space-y-1">
                                            <span className="block text-[8px] font-bold text-slate-500 uppercase tracking-widest">Reference / Check Code</span>
                                            <span className="font-mono font-bold text-xs text-neutral-800 block">{selectedInspectTx.data.reference}</span>
                                        </div>
                                    )}

                                    {selectedInspectTx.data.notes && (
                                        <div className="bg-slate-900 p-3 rounded-xl border border-slate-202 space-y-1">
                                            <span className="block text-[8px] font-bold text-slate-500 uppercase tracking-widest">Staff Recording Notes</span>
                                            <p className="text-slate-650 italic text-[11px] leading-relaxed">"{selectedInspectTx.data.notes}"</p>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    {/* Order Main state */}
                                    <div className="bg-slate-900 p-4 rounded-2xl border border-slate-200 space-y-3 font-outfit">
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <span className="block text-[8px] font-bold text-slate-500 uppercase tracking-widest">Reference Order</span>
                                                <span className="font-mono text-base font-black text-neutral-800">{selectedInspectTx.data.order_number}</span>
                                            </div>
                                            <span className="text-[9px] font-bold tracking-wider uppercase bg-slate-850 border border-slate-200 text-slate-700 px-2 py-1 rounded-lg">
                                                {selectedInspectTx.data.status}
                                            </span>
                                        </div>
                                        <div className="grid grid-cols-3 gap-2 pt-1 border-t border-slate-200">
                                            <div>
                                                <span className="block text-[8px] font-bold text-slate-500 uppercase tracking-widest">Total Invoice</span>
                                                <span className="font-extrabold text-neutral-800 font-mono">रु {Number(selectedInspectTx.data.total_amount).toLocaleString()}</span>
                                            </div>
                                            <div>
                                                <span className="block text-[8px] font-bold text-slate-500 uppercase tracking-widest">Amount Paid</span>
                                                <span className="font-extrabold text-emerald-650 font-mono">रु {Number(selectedInspectTx.data.amount_paid || 0).toLocaleString()}</span>
                                            </div>
                                            <div>
                                                <span className="block text-[8px] font-bold text-slate-500 uppercase tracking-widest">Due Balance</span>
                                                <span className="font-extrabold text-rose-600 font-mono">रु {Number(selectedInspectTx.data.due_amount).toLocaleString()}</span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Billing & System Metadata */}
                                    <div className="bg-slate-900 border border-slate-200 p-3.5 rounded-xl space-y-3 font-outfit">
                                        <h4 className="text-[9px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1.5 border-b border-slate-150 pb-1.5">
                                            <Info className="h-3.5 w-3.5 text-blue-600" />
                                            Billing Details
                                        </h4>
                                        <div className="grid grid-cols-2 gap-x-2 gap-y-3">
                                            <div>
                                                <span className="block text-[8px] text-slate-500 uppercase font-bold tracking-wider">Bill/Invoice Number</span>
                                                <span className="font-semibold text-slate-700">{selectedInspectTx.data.bill_number || selectedInspectTx.data.invoice_number || 'N/A (Draft Order)'}</span>
                                            </div>
                                            <div>
                                                <span className="block text-[8px] text-slate-500 uppercase font-bold tracking-wider">Billed Date</span>
                                                <span className="font-semibold text-slate-700">{selectedInspectTx.data.billed_at ? new Date(selectedInspectTx.data.billed_at).toLocaleDateString() : 'N/A'}</span>
                                            </div>
                                            <div>
                                                <span className="block text-[8px] text-slate-500 uppercase font-bold tracking-wider">Billed By Accountant</span>
                                                <span className="font-semibold text-slate-700">{getProfileName(selectedInspectTx.data.billed_by)}</span>
                                            </div>
                                            <div>
                                                <span className="block text-[8px] text-slate-500 uppercase font-bold tracking-wider">Created By</span>
                                                <span className="font-semibold text-slate-700">{getProfileName(selectedInspectTx.data.created_by)}</span>
                                            </div>
                                        </div>
                                        {selectedInspectTx.data.billing_remarks && (
                                            <p className="text-slate-600 mt-1 italic leading-normal border-t border-slate-150 pt-2 text-[10px]">
                                                "Remarks: {selectedInspectTx.data.billing_remarks}"
                                            </p>
                                        )}
                                    </div>

                                    {/* Fulfillment Logs */}
                                    <div className="bg-slate-900 border border-slate-200 p-3.5 rounded-xl space-y-3 font-outfit">
                                        <h4 className="text-[9px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1.5 border-b border-slate-150 pb-1.5">
                                            <Package className="h-3.5 w-3.5 text-amber-600" />
                                            Fulfillment Timeline & Dispatch Logs
                                        </h4>
                                        <div className="grid grid-cols-2 gap-x-2 gap-y-3">
                                            <div>
                                                <span className="block text-[8px] text-slate-505 uppercase font-bold tracking-wider">Packed Date</span>
                                                <span className="font-semibold text-slate-700">{selectedInspectTx.data.packed_at ? new Date(selectedInspectTx.data.packed_at).toLocaleDateString() : 'Not Packed yet'}</span>
                                            </div>
                                            <div>
                                                <span className="block text-[8px] text-slate-505 uppercase font-bold tracking-wider">Dispatched Date</span>
                                                <span className="font-semibold text-slate-700">{selectedInspectTx.data.dispatched_at ? new Date(selectedInspectTx.data.dispatched_at).toLocaleDateString() : 'Not Dispatched'}</span>
                                            </div>
                                            <div className="col-span-2">
                                                <span className="block text-[8px] text-slate-505 uppercase font-bold tracking-wider">Delivered Date</span>
                                                <span className="font-semibold text-slate-700">{selectedInspectTx.data.delivered_at ? new Date(selectedInspectTx.data.delivered_at).toLocaleDateString() : 'Pending Delivery Confirmation'}</span>
                                            </div>
                                        </div>
                                        {selectedInspectTx.data.fulfillment_remarks && (
                                            <p className="text-slate-600 mt-1 italic leading-normal border-t border-slate-150 pt-2 text-[10px]">
                                                "Remarks: {selectedInspectTx.data.fulfillment_remarks}"
                                            </p>
                                        )}
                                    </div>

                                    {/* Product line items detail list */}
                                    <div className="bg-slate-900 border border-slate-200 p-3.5 rounded-xl space-y-3 font-outfit">
                                        <h4 className="text-[9px] font-black text-slate-500 uppercase tracking-widest flex items-center justify-between border-b border-slate-150 pb-1.5">
                                            <span>Invoice Line Items</span>
                                            <span>({inspectOrderItems.length} items)</span>
                                        </h4>
                                        {loadingInspectItems ? (
                                            <div className="py-6 text-center">
                                                <RefreshCw className="h-5 w-5 animate-spin mx-auto text-neutral-600 mb-1.5" />
                                                <span className="text-[10px] text-slate-500 block">Retrieving products metadata...</span>
                                            </div>
                                        ) : inspectOrderItems.length === 0 ? (
                                            <p className="text-center py-4 text-slate-500 italic">No products mapped or load failed.</p>
                                        ) : (
                                            <div className="space-y-2 max-h-[160px] overflow-y-auto pr-1">
                                                {inspectOrderItems.map((item: any) => (
                                                    <div key={item.id} className="bg-white p-2 rounded-lg border border-slate-200 flex justify-between items-center text-[10px]">
                                                        <div>
                                                            <span className="font-bold text-neutral-800 block">{item.products?.product_name || 'Unknown hardware item'}</span>
                                                            <span className="text-[8px] font-bold text-slate-500 uppercase font-mono block mt-0.5">Code: {item.products?.ref_code || 'N/A'}</span>
                                                        </div>
                                                        <div className="text-right">
                                                            <span className="block text-slate-700 font-bold">{item.quantity} {item.products?.unit || 'pcs'} × रु {Number(item.unit_price).toLocaleString()}</span>
                                                            <span className="block text-[9px] font-bold text-slate-500 font-mono mt-0.5">रु {Number(item.subtotal).toLocaleString()}</span>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>

                                    {selectedInspectTx.data.notes && (
                                        <div className="bg-slate-900 p-3 rounded-xl border border-slate-200 space-y-1">
                                            <span className="block text-[8px] font-bold text-slate-500 uppercase tracking-widest">Order Custom Notes</span>
                                            <p className="text-slate-655 italic text-[11px] leading-relaxed">"{selectedInspectTx.data.notes}"</p>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Footer Controls */}
                        <div className="mt-4 pt-3.5 border-t border-slate-150 flex justify-end shrink-0">
                            <button
                                type="button"
                                onClick={() => setSelectedInspectTx(null)}
                                className="px-5 py-2.5 rounded-xl bg-slate-850 hover:bg-slate-200 text-xs font-bold text-slate-750 active:scale-95 transition-all shadow-sm cursor-pointer"
                            >
                                Dismiss
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* FORM MODAL TRIGGER */}
            {showFormModal && (
                <PartyForm
                    party={selectedPartyForEdit}
                    onClose={() => {
                        setShowFormModal(false)
                        setSelectedPartyForEdit(null)
                    }}
                    onSaveSuccess={handleSaveSuccess}
                />
            )}
        </div>
    )
}
