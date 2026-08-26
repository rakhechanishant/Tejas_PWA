import React, { useEffect, useState, useMemo } from 'react'
import { useLocation, Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import {
    Search,
    Wallet,
    TrendingUp,
    Calendar,
    CheckCircle2,
    X,
    Filter,
    Plus,
    User,
    ClipboardList,
    AlertCircle,
    Info,
    RefreshCw
} from 'lucide-react'

interface Party {
    id: number
    party_code: string
    name: string
    phone: string | null
    total_due: number
    credit_limit: number
    city: string | null
}

interface PaymentLog {
    id: number
    amount: number
    method: string
    reference: string | null
    payment_date: string
    notes: string | null
    created_at: string
    party_name: string
    order_number: string
    recorded_by_name: string
}

interface OrderSelectOption {
    id: number
    order_number: string
    total_amount: number
    due_amount: number
    status: string
}

export const Payments: React.FC = () => {
    const { profile } = useAuth()
    const location = useLocation()
    const [activeViewTab, setActiveViewTab] = useState<'outstanding' | 'history'>('outstanding')
    const [loading, setLoading] = useState(true)
    const [refreshing, setRefreshing] = useState(false)
    const [errorMsg, setErrorMsg] = useState('')

    const navigate = useNavigate()
    const [selectedPaymentDetail, setSelectedPaymentDetail] = useState<PaymentLog | null>(null)

    // Registry lists
    const [parties, setParties] = useState<Party[]>([])
    const [payments, setPayments] = useState<PaymentLog[]>([])

    // Search and filters
    const [searchQuery, setSearchQuery] = useState('')
    const [selectedMethodFilter, setSelectedMethodFilter] = useState('')

    // Modal state for recording payment
    const [showModal, setShowModal] = useState(false)
    const [acting, setActing] = useState(false)

    // Customer Ledger Modal State
    const [showLedgerModal, setShowLedgerModal] = useState(false)
    const [selectedLedgerParty, setSelectedLedgerParty] = useState<Party | null>(null)
    const [ledgerEntries, setLedgerEntries] = useState<any[]>([])
    const [loadingLedger, setLoadingLedger] = useState(false)

    const fetchLedgerEntries = async (partyId: number) => {
        setLoadingLedger(true)
        try {
            const { data, error } = await supabase
                .from('ledger_entries')
                .select('*')
                .eq('party_id', partyId)
                .order('created_at', { ascending: false })
            if (error) throw error
            setLedgerEntries(data || [])
        } catch (err: any) {
            console.error('Error fetching ledger entries:', err)
            setErrorMsg(err.message || 'Error fetching customer ledger.')
        } finally {
            setLoadingLedger(false)
        }
    }

    // Form inputs
    const [selectedParty, setSelectedParty] = useState<Party | null>(null)
    const [partyFilterText, setPartyFilterText] = useState('')
    const [partySuggestions, setPartySuggestions] = useState<Party[]>([])
    const [unpaidOrders, setUnpaidOrders] = useState<OrderSelectOption[]>([])
    const [selectedOrder, setSelectedOrder] = useState<OrderSelectOption | null>(null)

    const [amountInput, setAmountInput] = useState('')
    const [methodInput, setMethodInput] = useState('CASH')
    const [referenceInput, setReferenceInput] = useState('')
    const [dateInput, setDateInput] = useState(new Date().toISOString().split('T')[0])
    const [notesInput, setNotesInput] = useState('')

    useEffect(() => {
        loadData()
    }, [])

    useEffect(() => {
        const searchParams = new URLSearchParams(location.search)
        const URLledgerId = searchParams.get('ledger')

        if (URLledgerId && parties.length > 0) {
            const found = parties.find(p => String(p.id) === URLledgerId)
            if (found) {
                setSelectedLedgerParty(found)
                fetchLedgerEntries(found.id)
                setShowLedgerModal(true)
                // Clear the param so refreshing doesn't replay it
                navigate(location.pathname, { replace: true })
            }
        }
        else if (location.state?.preselectedPartyId && parties.length > 0) {
            const found = parties.find(p => p.id === location.state.preselectedPartyId)
            // Prevent resetting state if modal is already open for this party
            if (found && (!showModal || selectedParty?.id !== found.id)) {
                setSelectedParty(found)
                setPartyFilterText(found.name)
                setShowModal(true)
            }
        }
    }, [location.search, location.state, parties, navigate, showModal, selectedParty?.id])

    const loadData = async () => {
        setLoading(true)
        setErrorMsg('')
        try {
            await Promise.all([fetchParties(), fetchPayments()])
        } catch (err: any) {
            setErrorMsg(err.message || 'Could not fetch payments registry data.')
        } finally {
            setLoading(false)
        }
    }

    const handleRefresh = async () => {
        setRefreshing(true)
        try {
            await Promise.all([fetchParties(), fetchPayments()])
        } catch (err: any) {
            console.error(err)
        } finally {
            setRefreshing(false)
        }
    }

    const fetchParties = async () => {
        // Fetch parties with credit ledger info
        const { data, error } = await supabase
            .from('parties')
            .select('id, party_code, Parties_name, contact_number, total_due, credit_limit, city')
            .order('Parties_name', { ascending: true })

        if (error) throw error

        const mapped: Party[] = (data || []).map((row: any) => ({
            id: row.id,
            party_code: row.party_code,
            name: row.Parties_name,
            phone: row.contact_number,
            total_due: Number(row.total_due || 0),
            credit_limit: Number(row.credit_limit || 0),
            city: row.city
        }))
        setParties(mapped)
    }

    const fetchPayments = async () => {
        // Fetch raw payments with auto-joins
        const { data, error } = await supabase
            .from('payments')
            .select(`
                id,
                amount,
                method,
                reference,
                payment_date,
                notes,
                created_at,
                parties ( Parties_name ),
                orders ( order_number ),
                profiles ( name )
            `)
            .order('created_at', { ascending: false })

        if (error) throw error

        const mapped: PaymentLog[] = (data || []).map((p: any) => ({
            id: p.id,
            amount: Number(p.amount || 0),
            method: p.method,
            reference: p.reference,
            payment_date: p.payment_date,
            notes: p.notes,
            created_at: p.created_at,
            party_name: p.parties?.Parties_name || 'N/A',
            order_number: p.orders?.order_number || 'N/A',
            recorded_by_name: p.profiles?.name || 'Staff'
        }))
        setPayments(mapped)
    }

    // Dynamic metrics calculation
    const metrics = useMemo(() => {
        let totalDues = 0
        let totalCollectedToday = 0
        let debtorsCount = 0

        parties.forEach(p => {
            totalDues += Number(p.total_due || 0)
            if (Number(p.total_due || 0) > 0) {
                debtorsCount++
            }
        })

        const todayStr = new Date().toISOString().split('T')[0]
        payments.forEach(p => {
            if (p.payment_date === todayStr) {
                totalCollectedToday += p.amount
            }
        })

        return { totalDues, totalCollectedToday, debtorsCount }
    }, [parties, payments])

    // Autocomplete party suggestions
    useEffect(() => {
        const query = partyFilterText.trim().toLowerCase()
        if (!query) {
            setPartySuggestions([])
            return
        }
        const filtered = parties.filter(p =>
            p.name.toLowerCase().includes(query) ||
            p.party_code.toLowerCase().includes(query)
        )
        setPartySuggestions(filtered.slice(0, 5))
    }, [partyFilterText, parties])

    // Load active unpaid orders when selectedParty changes
    useEffect(() => {
        if (!selectedParty) {
            setUnpaidOrders([])
            setSelectedOrder(null)
            return
        }

        const fetchOrders = async () => {
            try {
                const { data, error } = await supabase
                    .from('orders')
                    .select('id, order_number, total_amount, due_amount, status')
                    .eq('party_id', selectedParty.id)
                    .gt('due_amount', 0)
                    .neq('status', 'CANCELLED')
                    .order('created_at', { ascending: false })

                if (error) throw error

                const mapped: OrderSelectOption[] = (data || []).map((o: any) => ({
                    id: o.id,
                    order_number: o.order_number,
                    total_amount: Number(o.total_amount),
                    due_amount: Number(o.due_amount),
                    status: o.status
                }))

                setUnpaidOrders(mapped)
                if (mapped.length > 0) {
                    setSelectedOrder(mapped[0])
                    setAmountInput(mapped[0].due_amount.toString()) // prefill full amount
                } else {
                    setSelectedOrder(null)
                    setAmountInput('')
                }
            } catch (err) {
                console.error('Failed to load unpaid orders:', err)
            }
        }
        fetchOrders()
    }, [selectedParty])

    // Handle order select changing
    const handleOrderSelect = (orderId: string) => {
        const order = unpaidOrders.find(o => o.id.toString() === orderId)
        if (order) {
            setSelectedOrder(order)
            setAmountInput(order.due_amount.toString())
        }
    }

    // Select a party from suggestions list
    const handleSelectPartyFromList = (party: Party) => {
        setSelectedParty(party)
        setPartyFilterText(party.name)
        setPartySuggestions([])
    }

    // Submit payment handler
    const handleSavePayment = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!selectedParty) {
            alert('Please select a valid customer.')
            return
        }
        if (!selectedOrder) {
            alert('This customer has no outstanding orders to credit.')
            return
        }
        const amt = parseFloat(amountInput)
        if (isNaN(amt) || amt <= 0) {
            alert('Payment amount must be greater than zero.')
            return
        }
        if (amt > selectedOrder.due_amount) {
            alert(`Payment exceeds the order outstanding of रु ${selectedOrder.due_amount.toLocaleString()}`)
            return
        }
        if (!profile?.id) {
            alert('Security access profile mismatch. Re-authenticate and try.')
            return
        }

        setActing(true)
        try {
            const { error } = await supabase.rpc('record_payment', {
                p_order_id: selectedOrder.id,
                p_party_id: selectedParty.id,
                p_amount: amt,
                p_recorded_by: profile.id,
                p_method: methodInput,
                p_reference: referenceInput.trim() || null,
                p_notes: notesInput.trim() || null,
                p_payment_date: dateInput
            })

            if (error) throw error

            alert('Payment recorded successfully!')
            setShowModal(false)
            resetForm()
            loadData()
        } catch (err: any) {
            console.error(err)
            alert('Record payment failed: ' + (err.message || 'Operation failed'))
        } finally {
            setActing(false)
        }
    }

    const resetForm = () => {
        setSelectedParty(null)
        setPartyFilterText('')
        setPartySuggestions([])
        setUnpaidOrders([])
        setSelectedOrder(null)
        setAmountInput('')
        setMethodInput('CASH')
        setReferenceInput('')
        setDateInput(new Date().toISOString().split('T')[0])
        setNotesInput('')
    }

    // Filtered lists
    const filteredParties = useMemo(() => {
        const query = searchQuery.trim().toLowerCase()
        if (!query) return parties

        return parties.filter(p => {
            const matchesName = p.name?.toLowerCase().includes(query)
            const matchesCode = p.party_code?.toLowerCase().includes(query)
            const matchesCity = p.city?.toLowerCase().includes(query)
            return matchesName || matchesCode || matchesCity
        })
    }, [parties, searchQuery])

    const filteredPayments = useMemo(() => {
        const query = searchQuery.trim().toLowerCase()
        return payments.filter(p => {
            if (query.startsWith('payid-')) {
                const searchId = Number(query.split('-')[1])
                const matchesMethod = !selectedMethodFilter || p.method === selectedMethodFilter
                return p.id === searchId && matchesMethod
            }

            const matchesQuery = !query ||
                p.party_name.toLowerCase().includes(query) ||
                (p.order_number && p.order_number.toLowerCase().includes(query)) ||
                (p.reference && p.reference.toLowerCase().includes(query))

            const matchesMethod = !selectedMethodFilter || p.method === selectedMethodFilter

            return matchesQuery && matchesMethod
        })
    }, [payments, searchQuery, selectedMethodFilter])

    return (
        <div className="space-y-6">
            {/* Header Title Section */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h1 className="text-3xl font-extrabold tracking-tight text-neutral-900 font-outfit">Payments & Accounts</h1>
                    <p className="text-sm text-neutral-600">Record customer cash, check, and digital payments; audit transaction logs and outstanding credit books.</p>
                </div>

                <div className="flex gap-2">
                    <button
                        onClick={handleRefresh}
                        title="Reload registry"
                        disabled={refreshing}
                        className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-900 border border-slate-800 hover:bg-slate-800 transition-colors text-neutral-600 hover:text-neutral-900"
                    >
                        <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
                    </button>

                    <button
                        onClick={() => {
                            resetForm()
                            setShowModal(true)
                        }}
                        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 font-bold transition-all text-xs text-neutral-900 shadow-lg shadow-amber-500/10"
                    >
                        <Plus className="h-4 w-4" />
                        Record Payment
                    </button>
                </div>
            </div>

            {/* Metrics cards */}
            <div className="grid gap-4 sm:grid-cols-3">
                <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5 backdrop-blur-sm">
                    <div className="flex items-center justify-between text-neutral-600">
                        <span className="text-xs font-semibold uppercase tracking-wider">Total Outstanding Credit</span>
                        <TrendingUp className="h-4.5 w-4.5 text-rose-500" />
                    </div>
                    <span className="block text-xl font-extrabold text-rose-500 mt-2 font-outfit">
                        रु {metrics.totalDues.toLocaleString('en-NP', { minimumFractionDigits: 2 })}
                    </span>
                    <span className="text-[10px] text-slate-500 mt-1 block">Receivable from {metrics.debtorsCount} dealers</span>
                </div>
                <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5 backdrop-blur-sm">
                    <div className="flex items-center justify-between text-neutral-600">
                        <span className="text-xs font-semibold uppercase tracking-wider">Payments Collected Today</span>
                        <Wallet className="h-4.5 w-4.5 text-emerald-500" />
                    </div>
                    <span className="block text-xl font-outfit font-extrabold text-emerald-500 mt-2">
                        रु {metrics.totalCollectedToday.toLocaleString('en-NP', { minimumFractionDigits: 2 })}
                    </span>
                    <span className="text-[10px] text-slate-500 mt-1 block">Live transaction clearance</span>
                </div>
                <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5 backdrop-blur-sm">
                    <div className="flex items-center justify-between text-neutral-600">
                        <span className="text-xs font-semibold uppercase tracking-wider">Active Credits</span>
                        <User className="h-4.5 w-4.5 text-amber-500" />
                    </div>
                    <span className="block text-xl font-outfit font-extrabold text-amber-505 mt-2">
                        {metrics.debtorsCount} Stores
                    </span>
                    <span className="text-[10px] text-slate-500 mt-1 block">Accounts with unpaid balances</span>
                </div>
            </div>

            {/* TAB INTERFACES */}
            <div className="border-b border-slate-850 flex items-center justify-between">
                <div className="flex gap-4">
                    <button
                        onClick={() => {
                            setActiveViewTab('outstanding')
                            setSearchQuery('')
                        }}
                        className={`pb-3 font-bold text-xs uppercase tracking-wider border-b-2 transition-all ${activeViewTab === 'outstanding'
                            ? 'border-amber-500 text-amber-500'
                            : 'border-transparent text-slate-450 hover:text-neutral-800'
                            }`}
                    >
                        Customer Accounts & Ledgers
                    </button>
                    <button
                        onClick={() => {
                            setActiveViewTab('history')
                            setSearchQuery('')
                        }}
                        className={`pb-3 font-bold text-xs uppercase tracking-wider border-b-2 transition-all ${activeViewTab === 'history'
                            ? 'border-amber-500 text-amber-500'
                            : 'border-transparent text-slate-450 hover:text-neutral-800'
                            }`}
                    >
                        Payments Log & Receipts
                    </button>
                </div>
            </div>

            {/* Search and filter bar */}
            <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4 flex flex-col md:flex-row gap-3">
                <div className="relative flex-1">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Search className="h-4.5 w-4.5 text-slate-500" />
                    </div>
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder={
                            activeViewTab === 'outstanding'
                                ? "Search outstanding ledgers by name, code, town..."
                                : "Filter transaction receipts by customer name, order number, txn reference..."
                        }
                        className="bg-slate-950 border border-slate-800 rounded-xl py-2.5 pl-10 pr-4 text-neutral-900 text-xs w-full placeholder-slate-500 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
                    />
                </div>

                {activeViewTab === 'history' && (
                    <div className="flex items-center gap-2">
                        <Filter className="h-4.5 w-4.5 text-slate-500" />
                        <select
                            value={selectedMethodFilter}
                            onChange={(e) => setSelectedMethodFilter(e.target.value)}
                            className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-neutral-700 text-xs font-semibold focus:outline-none focus:border-amber-500 w-full md:w-auto"
                        >
                            <option value="">All Payment Methods</option>
                            <option value="CASH">CASH</option>
                            <option value="BANK_TRANSFER">BANK TRANSFER</option>
                            <option value="CHEQUE">CHEQUE</option>
                            <option value="ESEWA">ESEWA</option>
                            <option value="KHALTI">KHALTI</option>
                            <option value="UPI">UPI</option>
                        </select>
                    </div>
                )}
            </div>

            {/* ERROR VIEW */}
            {errorMsg && (
                <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-xs text-rose-400 flex items-center gap-2">
                    <AlertCircle className="h-5 w-5 text-rose-500" />
                    <span>{errorMsg}</span>
                </div>
            )}

            {/* DYNAMIC LIST TABLES */}
            {loading ? (
                <div className="space-y-3">
                    {[...Array(4)].map((_, i) => (
                        <div key={i} className="animate-pulse bg-slate-900/30 border border-slate-800 rounded-xl h-16 w-full"></div>
                    ))}
                </div>
            ) : activeViewTab === 'outstanding' ? (
                /* OUTSTANDING CREDIT LEDGER TAB */
                filteredParties.length === 0 ? (
                    <div className="text-center rounded-2xl border border-slate-850 p-12 bg-slate-900/10">
                        <Info className="h-10 w-10 text-slate-600 mx-auto mb-2" />
                        <p className="text-xs text-slate-500">No outstanding customer accounts found matching search.</p>
                    </div>
                ) : (
                    <div className="grid gap-3">
                        {filteredParties.map((p) => {
                            const isLimitOver = p.total_due > p.credit_limit
                            return (
                                <div
                                    key={p.id}
                                    className="group rounded-2xl border border-slate-800/80 bg-slate-900/20 p-4 hover:border-slate-700/80 transition-colors flex items-center justify-between flex-wrap gap-4"
                                >
                                    <div className="flex items-center gap-3 w-full sm:w-auto">
                                        <div className="h-10 w-10 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-center text-[10px] text-slate-450 uppercase font-extrabold shrink-0">
                                            {p.party_code.replace("TEJAS-", "")}
                                        </div>
                                        <div className="min-w-0">
                                            <h3 className="text-sm font-bold text-neutral-900 group-hover:text-neutral-900 truncate">{p.name}</h3>
                                            <div className="flex gap-2.5 items-center mt-1 text-slate-450 text-xs">
                                                <span>City: {p.city || 'N/A'}</span>
                                                <span className="h-1 w-1 bg-slate-800 rounded-full"></span>
                                                <span className="font-mono">{p.phone || 'No phone'}</span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-6 justify-between sm:justify-end w-full sm:w-auto mt-2 sm:mt-0 pt-3 sm:pt-0 border-t sm:border-0 border-slate-900">
                                        <div className="text-left sm:text-right">
                                            <span className="block text-[8px] font-bold uppercase tracking-wider text-slate-500">Outstanding Due</span>
                                            <span className={`text-sm font-black font-mono ${isLimitOver ? 'text-rose-455 underline decoration-wavy' : 'text-amber-500'}`}>
                                                रु {p.total_due.toLocaleString('en-NP', { minimumFractionDigits: 2 })}
                                            </span>
                                            <span className="block text-[8px] text-slate-500 mt-0.5">Limit: रु {p.credit_limit.toLocaleString()}</span>
                                        </div>

                                        <button
                                            onClick={() => {
                                                setSelectedLedgerParty(p)
                                                fetchLedgerEntries(p.id)
                                                setShowLedgerModal(true)
                                            }}
                                            className="px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-800 hover:bg-slate-800 text-neutral-700 hover:text-neutral-900 font-black text-[10px] uppercase tracking-wide transition-all"
                                        >
                                            View Ledger
                                        </button>
                                        <button
                                            onClick={() => {
                                                resetForm()
                                                setSelectedParty(p)
                                                setPartyFilterText(p.name)
                                                setShowModal(true)
                                            }}
                                            className="px-3.5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-450 text-neutral-900 font-black text-[10px] uppercase tracking-wide transition-all"
                                        >
                                            Collect Payment
                                        </button>
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                )
            ) : (
                /* PAYMENTS HISTORY LOG TAB */
                filteredPayments.length === 0 ? (
                    <div className="text-center rounded-2xl border border-slate-850 p-12 bg-slate-900/10">
                        <Info className="h-10 w-10 text-slate-600 mx-auto mb-2" />
                        <p className="text-xs text-slate-500">No payment transaction records logged matching filters.</p>
                    </div>
                ) : (
                    <div className="grid gap-3">
                        {filteredPayments.map((pay) => (
                            <div
                                key={pay.id}
                                className="rounded-2xl border border-slate-800/80 bg-slate-900/20 p-4 hover:border-slate-800 transition-all flex flex-col md:flex-row md:items-center justify-between gap-4"
                            >
                                <div className="space-y-1.5 flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <h3 className="text-xs font-bold text-neutral-900 uppercase tracking-wider truncate md:max-w-[200px]">
                                            {pay.party_name}
                                        </h3>
                                        <span className="text-[9px] font-black py-0.5 px-2 rounded bg-amber-500/10 text-amber-500 border border-amber-500/20 uppercase">
                                            {pay.method.replace('_', ' ')}
                                        </span>
                                        {pay.reference && (
                                            <span className="text-[10px] font-mono font-medium text-neutral-600 truncate bg-slate-905 px-1.5 py-0.5 rounded border border-slate-850">
                                                Ref: {pay.reference}
                                            </span>
                                        )}
                                    </div>

                                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-slate-450 text-xs mt-1">
                                        <span className="flex items-center gap-1">
                                            <ClipboardList className="h-3.5 w-3.5 text-slate-500 shrink-0" />
                                            Order: <span className="font-bold text-neutral-700">{pay.order_number}</span>
                                        </span>
                                        <span className="flex items-center gap-1 font-mono text-[11px]">
                                            <Calendar className="h-3.5 w-3.5 text-slate-500" />
                                            {pay.payment_date}
                                        </span>
                                        <button
                                            onClick={() => {
                                                const party = parties.find(p => p.name === pay.party_name)
                                                if (party) {
                                                    setSelectedLedgerParty(party)
                                                    fetchLedgerEntries(party.id)
                                                    setShowLedgerModal(true)
                                                }
                                            }}
                                            className="text-amber-500 hover:text-amber-400 font-extrabold ml-2 underline text-[10px] uppercase font-outfit tracking-wider"
                                            title="View this customer's full ledger"
                                        >
                                            View Ledger
                                        </button>
                                    </div>

                                    {pay.notes && (
                                        <p className="text-[11px] text-neutral-600 leading-normal mt-1 border-l-2 border-slate-800 pl-2">
                                            {pay.notes}
                                        </p>
                                    )}
                                </div>

                                <div className="flex md:flex-col items-baseline md:items-end justify-between md:justify-center border-t md:border-0 border-slate-900 pt-2 md:pt-0 shrink-0">
                                    <span className="text-sm font-black font-mono text-emerald-500">
                                        + रु {pay.amount.toLocaleString('en-NP', { minimumFractionDigits: 2 })}
                                    </span>
                                    <span className="text-[9px] text-slate-500 uppercase font-semibold mt-0.5">Logged: {pay.recorded_by_name}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                )
            )}

            {/* CUSTOMER LEDGER DETAIL MODAL */}
            {showLedgerModal && selectedLedgerParty && (
                <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm overflow-y-auto">
                    <div className="relative w-full max-w-4xl bg-slate-905 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
                        {/* Header */}
                        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-850 bg-slate-900/30">
                            <div className="flex items-center gap-2">
                                <Wallet className="h-5 w-5 text-amber-500" />
                                <div>
                                    <h2 className="text-base font-bold text-neutral-900 font-outfit">
                                        Customer Ledger: {selectedLedgerParty.name}
                                    </h2>
                                    <p className="text-xs text-neutral-600 mt-0.5">
                                        Party Code: <span className="font-mono text-neutral-700">{selectedLedgerParty.party_code}</span> • City: {selectedLedgerParty.city || 'No City'}
                                    </p>
                                </div>
                            </div>
                            <button
                                onClick={() => {
                                    setShowLedgerModal(false)
                                    setSelectedLedgerParty(null)
                                    setLedgerEntries([])
                                }}
                                className="rounded-xl p-1.5 text-slate-450 hover:text-neutral-900 hover:bg-slate-800 transition-colors"
                            >
                                <X className="h-5 w-5" />
                            </button>
                        </div>

                        {/* Content */}
                        <div className="flex-1 overflow-y-auto p-6 space-y-6">
                            {/* Summary Cards */}
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
                                    <span className="text-[10px] uppercase font-bold text-slate-500 block">Total Due Balance</span>
                                    <span className="text-lg font-black font-mono text-amber-550 mt-1 block">
                                        रु {selectedLedgerParty.total_due.toLocaleString('en-NP', { minimumFractionDigits: 2 })}
                                    </span>
                                </div>
                                <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
                                    <span className="text-[10px] uppercase font-bold text-slate-500 block">Credit Limit</span>
                                    <span className="text-lg font-black font-mono text-neutral-800 mt-1 block">
                                        रु {selectedLedgerParty.credit_limit.toLocaleString('en-NP', { minimumFractionDigits: 2 })}
                                    </span>
                                </div>
                                <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
                                    <span className="text-[10px] uppercase font-bold text-slate-500 block">Available Credit</span>
                                    <span className={`text-lg font-black font-mono mt-1 block ${selectedLedgerParty.credit_limit - selectedLedgerParty.total_due >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                                        रु {(selectedLedgerParty.credit_limit - selectedLedgerParty.total_due).toLocaleString('en-NP', { minimumFractionDigits: 2 })}
                                    </span>
                                </div>
                            </div>

                            {/* Ledger Table */}
                            <div className="border border-slate-850 rounded-2xl overflow-hidden bg-slate-950/20">
                                <div className="overflow-x-auto">
                                    {loadingLedger ? (
                                        <div className="py-12 text-center text-xs text-slate-450 flex items-center justify-center gap-2">
                                            <RefreshCw className="h-4.5 w-4.5 animate-spin text-amber-500" />
                                            <span>Loading account ledger entries...</span>
                                        </div>
                                    ) : ledgerEntries.length === 0 ? (
                                        <div className="py-12 text-center text-xs text-slate-450 flex items-center justify-center gap-2">
                                            <Info className="h-4.5 w-4.5 text-amber-500" />
                                            No ledger entries (invoices/receipts) logged for this customer.
                                        </div>
                                    ) : (
                                        <table className="w-full text-left border-collapse text-xs">
                                            <thead>
                                                <tr className="bg-slate-900/50 border-b border-slate-850 text-neutral-600 font-bold uppercase tracking-wider text-[10px]">
                                                    <th className="p-4">Date</th>
                                                    <th className="p-4">Type</th>
                                                    <th className="p-4">Reference</th>
                                                    <th className="p-4">Description</th>
                                                    <th className="p-4 text-right">Credit (+)</th>
                                                    <th className="p-4 text-right">Debit (-)</th>
                                                    <th className="p-4 text-right">Running Balance</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-850/60 font-medium">
                                                {ledgerEntries.map((entry) => {
                                                    const creditVal = Number(entry.credit || 0)
                                                    const debitVal = Number(entry.debit || 0)
                                                    const balanceVal = Number(entry.balance || 0)
                                                    const isOrder = entry.reference_type === 'order'
                                                    const isPayment = entry.reference_type === 'payment'
                                                    const isReturn = entry.reference_type === 'order_return'

                                                    return (
                                                        <tr key={entry.id} className="hover:bg-slate-900/30 text-neutral-700">
                                                            <td className="p-4 font-mono text-[11px]">
                                                                {entry.transaction_date || new Date(entry.created_at).toISOString().split('T')[0]}
                                                            </td>
                                                            <td className="p-4">
                                                                <span className={`px-2 py-0.5 rounded font-bold text-[9px] uppercase tracking-wide border ${isOrder
                                                                    ? 'bg-amber-500/10 text-amber-500 border-amber-500/20'
                                                                    : isPayment
                                                                        ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
                                                                        : isReturn
                                                                            ? 'bg-rose-500/10 text-rose-500 border-rose-500/20'
                                                                            : 'bg-slate-800 text-neutral-600 border-slate-700'
                                                                    }`}>
                                                                    {entry.transaction_type}
                                                                </span>
                                                            </td>
                                                            <td className="p-4 font-mono">
                                                                {isOrder && entry.reference_id ? (
                                                                    <Link
                                                                        to={`/orders?openOrder=${entry.reference_id}&returnTo=/payments&returnLedger=${selectedLedgerParty.id}`}
                                                                        className="text-amber-500 hover:text-amber-400 font-extrabold hover:underline"
                                                                        title="Click to view full order details"
                                                                    >
                                                                        View Order
                                                                    </Link>
                                                                ) : isPayment ? (
                                                                    <button
                                                                        onClick={async () => {
                                                                            // find full payment object in payments to show details modal
                                                                            const pLog = payments.find(p => String(p.id) === entry.reference_id)
                                                                            if (pLog) {
                                                                                setSelectedPaymentDetail(pLog)
                                                                            } else {
                                                                                try {
                                                                                    const { data, error } = await supabase.from('payments').select(`
                                                                                        id, amount, method, reference, payment_date, notes, created_at,
                                                                                        parties ( Parties_name ), orders ( order_number ), profiles ( name )
                                                                                    `).eq('id', entry.reference_id).single()
                                                                                    if (error) throw error
                                                                                    if (data) {
                                                                                        setSelectedPaymentDetail({
                                                                                            id: data.id,
                                                                                            amount: Number(data.amount || 0),
                                                                                            method: data.method,
                                                                                            reference: data.reference,
                                                                                            payment_date: data.payment_date,
                                                                                            notes: data.notes,
                                                                                            created_at: data.created_at,
                                                                                            party_name: (data.parties as any)?.Parties_name || (data.parties as any)?.[0]?.Parties_name || 'N/A',
                                                                                            order_number: (data.orders as any)?.order_number || (data.orders as any)?.[0]?.order_number || 'N/A',
                                                                                            recorded_by_name: (data.profiles as any)?.name || (data.profiles as any)?.[0]?.name || 'Staff'
                                                                                        })
                                                                                    }
                                                                                } catch (e) {
                                                                                    console.error('Failed dynamic fetch:', e)
                                                                                    alert('Could not fully retrieve payment details from server.')
                                                                                }
                                                                            }
                                                                        }}
                                                                        className="text-emerald-500 hover:text-emerald-450 font-extrabold hover:underline font-mono text-left"
                                                                        title="Locate clearance receipt details"
                                                                    >
                                                                        View Pay Log
                                                                    </button>
                                                                ) : isReturn ? (
                                                                    <span className="text-rose-500 font-extrabold max-w-[120px] truncate block" title={String(entry.reference_id)}>
                                                                        Ret Ref: {String(entry.reference_id).split('-')[0] || entry.reference_id}
                                                                    </span>
                                                                ) : (
                                                                    <span className="text-slate-500">—</span>
                                                                )}
                                                            </td>
                                                            <td className="p-4 max-w-[260px] truncate" title={entry.description}>
                                                                {entry.description || 'N/A'}
                                                            </td>
                                                            <td className="p-4 text-right font-mono font-bold text-neutral-900">
                                                                {creditVal > 0 ? `रु ${creditVal.toLocaleString()}` : ''}
                                                            </td>
                                                            <td className="p-4 text-right font-mono font-bold text-emerald-500">
                                                                {debitVal > 0 ? `रु ${debitVal.toLocaleString()}` : ''}
                                                            </td>
                                                            <td className="p-4 text-right font-mono font-bold text-amber-550">
                                                                रु {balanceVal.toLocaleString()}
                                                            </td>
                                                        </tr>
                                                    )
                                                })}
                                            </tbody>
                                        </table>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Action Footer */}
                        <div className="px-6 py-4 bg-slate-900/30 border-t border-slate-850 flex justify-between items-center">
                            <span className="text-[10px] font-bold text-slate-550 uppercase">
                                Tejas Impex Accounts Ledger Core
                            </span>
                            <div className="flex gap-3">
                                <button
                                    onClick={() => {
                                        setShowLedgerModal(false)
                                        setSelectedLedgerParty(null)
                                        setLedgerEntries([])
                                    }}
                                    className="px-4 py-2.5 bg-slate-900 border border-slate-800 hover:bg-slate-800 text-neutral-700 font-bold text-xs uppercase rounded-xl transition-colors"
                                >
                                    Close Ledger
                                </button>
                                <button
                                    onClick={() => {
                                        const p = selectedLedgerParty
                                        setShowLedgerModal(false)
                                        setSelectedLedgerParty(null)
                                        setLedgerEntries([])

                                        resetForm()
                                        setSelectedParty(p)
                                        setPartyFilterText(p.name)
                                        setShowModal(true)
                                    }}
                                    className="px-5 py-2.5 bg-emerald-500 hover:bg-emerald-450 text-neutral-900 font-black text-xs uppercase rounded-xl transition-colors flex items-center gap-1.5"
                                >
                                    <CheckCircle2 className="h-4.5 w-4.5" />
                                    Collect Payment Receipt
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* RECORD PAYMENT DRAWER MODAL */}
            {showModal && (
                <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm overflow-y-auto">
                    <div className="relative w-full max-w-xl bg-slate-905 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
                        {/* Header */}
                        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-850 bg-slate-900/30">
                            <div className="flex items-center gap-2">
                                <Wallet className="h-5 w-5 text-amber-500" />
                                <h2 className="text-base font-bold text-neutral-900 font-outfit">Log Customer Payment</h2>
                            </div>
                            <button
                                onClick={() => {
                                    setShowModal(false)
                                    resetForm()
                                }}
                                className="rounded-xl p-1.5 text-slate-450 hover:text-neutral-900 hover:bg-slate-800 transition-colors"
                            >
                                <X className="h-5 w-5" />
                            </button>
                        </div>

                        {/* Modal Form Scrollable */}
                        <form onSubmit={handleSavePayment} className="flex-1 overflow-y-auto p-6 space-y-4">
                            {/* Party AutoSuggest */}
                            <div className="relative">
                                <label className="block text-[10px] font-black uppercase text-slate-500 tracking-wider mb-1.5">
                                    Customer / Store Registry *
                                </label>
                                <div className="relative">
                                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                        <User className="h-4.5 w-4.5 text-slate-500" />
                                    </div>
                                    <input
                                        type="text"
                                        value={partyFilterText}
                                        onChange={(e) => {
                                            setPartyFilterText(e.target.value)
                                            if (selectedParty) {
                                                setSelectedParty(null)
                                                setUnpaidOrders([])
                                                setSelectedOrder(null)
                                                setAmountInput('')
                                            }
                                        }}
                                        placeholder="Start typing customer or store name..."
                                        className="bg-slate-950 border border-slate-800 rounded-xl py-2.5 pl-10 pr-4 text-neutral-900 text-xs w-full placeholder-slate-500 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
                                    />
                                    {selectedParty && (
                                        <div className="absolute inset-y-0 right-0 pr-3 flex items-center">
                                            <span className="text-[9px] font-bold py-0.5 px-2 bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 rounded">
                                                Locked
                                            </span>
                                        </div>
                                    )}
                                </div>

                                {/* Autocomplete popup options */}
                                {partySuggestions.length > 0 && (
                                    <div className="absolute left-0 right-0 mt-1 z-55 bg-slate-900 border border-slate-800 rounded-xl shadow-xl overflow-hidden divide-y divide-slate-850/60 max-h-56 overflow-y-auto">
                                        {partySuggestions.map((p) => (
                                            <div
                                                key={p.id}
                                                onClick={() => handleSelectPartyFromList(p)}
                                                className="px-4 py-2.5 hover:bg-slate-800 cursor-pointer text-xs flex justify-between items-center"
                                            >
                                                <div>
                                                    <span className="font-bold text-neutral-800">{p.name}</span>
                                                    <span className="text-[10px] text-slate-450 block">{p.city || 'No City'}</span>
                                                </div>
                                                <span className="text-[10px] font-bold text-amber-550 font-mono">
                                                    Due: रु {p.total_due.toLocaleString()}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Active Unpaid Orders Dropdown */}
                            {selectedParty && (
                                <div>
                                    <label className="block text-[10px] font-black uppercase text-slate-500 tracking-wider mb-1.5">
                                        Outstanding Invoice / Order *
                                    </label>
                                    {unpaidOrders.length === 0 ? (
                                        <div className="rounded-xl border border-slate-850 p-4 text-xs font-semibold text-slate-450 text-center flex items-center justify-center gap-2">
                                            <Info className="h-4.5 w-4.5 text-amber-500" />
                                            Zero outstanding credit orders found for this customer.
                                        </div>
                                    ) : (
                                        <select
                                            value={selectedOrder?.id.toString() || ''}
                                            onChange={(e) => handleOrderSelect(e.target.value)}
                                            className="rounded-xl bg-slate-950 border border-slate-800 p-2.5 text-neutral-800 text-xs font-semibold focus:border-amber-500 focus:outline-none w-full"
                                        >
                                            {unpaidOrders.map((o) => (
                                                <option key={o.id} value={o.id}>
                                                    {o.order_number} ({o.status}) — Due: रु {o.due_amount.toLocaleString()} (Total: रु {o.total_amount.toLocaleString()})
                                                </option>
                                            ))}
                                        </select>
                                    )}
                                </div>
                            )}

                            {/* Double grid inputs */}
                            {selectedOrder && (
                                <>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-[10px] font-black uppercase text-slate-500 tracking-wider mb-1.5">
                                                Unpaid Balance (Order)
                                            </label>
                                            <div className="rounded-xl bg-slate-900 border border-slate-850 p-2.5 text-slate-450 text-xs font-mono font-bold">
                                                रु {selectedOrder.due_amount.toLocaleString()}
                                            </div>
                                        </div>

                                        <div>
                                            <label className="block text-[10px] font-black uppercase text-slate-500 tracking-wider mb-1.5">
                                                Payment Amount (रु) *
                                            </label>
                                            <input
                                                type="number"
                                                step="0.01"
                                                value={amountInput}
                                                onChange={(e) => setAmountInput(e.target.value)}
                                                max={selectedOrder.due_amount}
                                                placeholder="e.g. 50000"
                                                required
                                                className="w-full rounded-xl bg-slate-950 border border-slate-800 p-2.5 text-neutral-800 text-xs font-bold focus:border-amber-500 focus:outline-none"
                                            />
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-[10px] font-black uppercase text-slate-500 tracking-wider mb-1.5">
                                                Clearance Channel *
                                            </label>
                                            <select
                                                value={methodInput}
                                                onChange={(e) => setMethodInput(e.target.value)}
                                                className="rounded-xl bg-slate-950 border border-slate-800 p-2.5 text-neutral-800 text-xs font-semibold focus:border-amber-500 focus:outline-none w-full"
                                            >
                                                <option value="CASH">CASH (Physical Clearing)</option>
                                                <option value="BANK_TRANSFER">BANK TRANSFER (Swift/Bank Ledger)</option>
                                                <option value="CHEQUE">COMPANY CHEQUE (Clearance Delay)</option>
                                                <option value="ESEWA">ESEWA (Digital Channel)</option>
                                                <option value="KHALTI">KHALTI (Digital Channel)</option>
                                                <option value="UPI">UPI (Digital Channel)</option>
                                            </select>
                                        </div>

                                        <div>
                                            <label className="block text-[10px] font-black uppercase text-slate-500 tracking-wider mb-1.5">
                                                Payment Date
                                            </label>
                                            <div className="relative">
                                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                                    <Calendar className="h-4.5 w-4.5 text-slate-500" />
                                                </div>
                                                <input
                                                    type="date"
                                                    value={dateInput}
                                                    onChange={(e) => setDateInput(e.target.value)}
                                                    required
                                                    className="w-full rounded-xl bg-slate-950 border border-slate-800 py-2.5 pl-10 pr-4 text-neutral-800 text-xs font-bold focus:border-amber-500 focus:outline-none"
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    <div>
                                        <label className="block text-[10px] font-black uppercase text-slate-500 tracking-wider mb-1.5">
                                            Transaction ID / Cheque Number (Optional)
                                        </label>
                                        <input
                                            type="text"
                                            value={referenceInput}
                                            onChange={(e) => setReferenceInput(e.target.value)}
                                            placeholder="e.g. TXN-882198B or Cheque # 992812"
                                            className="w-full rounded-xl bg-slate-950 border border-slate-800 p-2.5 text-neutral-800 text-xs font-semibold focus:border-amber-500 focus:outline-none"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-[10px] font-black uppercase text-slate-500 tracking-wider mb-1.5">
                                            Accounting Remarks / Notes (Optional)
                                        </label>
                                        <textarea
                                            value={notesInput}
                                            onChange={(e) => setNotesInput(e.target.value)}
                                            placeholder="Audit details, deposit account etc..."
                                            rows={2}
                                            className="w-full rounded-xl bg-slate-955 border border-slate-800 p-2.5 text-neutral-800 text-xs font-semibold focus:border-amber-500 focus:outline-none"
                                        />
                                    </div>
                                </>
                            )}

                            {/* Actions footer */}
                            <div className="pt-4 border-t border-slate-850 flex justify-end gap-3.5">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setShowModal(false)
                                        resetForm()
                                    }}
                                    className="px-4 py-2.5 bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-250 font-bold text-xs uppercase rounded-xl transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={acting || !selectedOrder}
                                    className="px-5 py-2.5 bg-emerald-500 hover:bg-emerald-450 text-white font-black text-xs uppercase rounded-xl transition-colors flex items-center gap-1.5 disabled:opacity-40"
                                >
                                    {acting ? 'Recording...' : (
                                        <>
                                            <CheckCircle2 className="h-4.5 w-4.5" />
                                            Submit Clearance Receipt
                                        </>
                                    )}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* PAYMENT DETAILS POPUP MODAL */}
            {selectedPaymentDetail && (
                <div role="dialog" aria-modal="true" className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-sm overflow-y-auto">
                    <div className="relative w-full max-w-lg bg-slate-905 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl flex flex-col">
                        {/* Header */}
                        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-850 bg-slate-900/30">
                            <div className="flex items-center gap-2">
                                <Wallet className="h-5 w-5 text-emerald-500" />
                                <h2 className="text-base font-bold text-neutral-900 font-outfit">Payment Clearance Receipt</h2>
                            </div>
                            <button
                                onClick={() => setSelectedPaymentDetail(null)}
                                className="rounded-xl p-1.5 text-slate-450 hover:text-neutral-900 hover:bg-slate-800 transition-colors"
                            >
                                <X className="h-5 w-5" />
                            </button>
                        </div>

                        {/* Content */}
                        <div className="p-6 space-y-6">
                            {/* Hero Amount */}
                            <div className="text-center bg-slate-950/40 rounded-2xl p-6 border border-emerald-900/30">
                                <span className="block text-[10px] font-black uppercase text-slate-500 tracking-wider mb-1">Received Amount</span>
                                <span className="block text-4xl font-black font-mono text-emerald-500 mb-2">रु {selectedPaymentDetail.amount.toLocaleString()}</span>
                                <span className="inline-block bg-emerald-500/10 text-emerald-500 border border-emerald-500/30 rounded-lg px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider">
                                    {selectedPaymentDetail.method}
                                </span>
                            </div>

                            {/* Details Grid */}
                            <div className="grid grid-cols-2 gap-4 text-xs font-semibold">
                                <div className="bg-slate-900/20 p-4 rounded-xl border border-slate-850">
                                    <span className="block text-[9px] uppercase tracking-wider text-slate-500 mb-1 font-bold">Party / Customer</span>
                                    <span className="text-neutral-800 block">{selectedPaymentDetail.party_name}</span>
                                </div>
                                <div className="bg-slate-900/20 p-4 rounded-xl border border-slate-850">
                                    <span className="block text-[9px] uppercase tracking-wider text-slate-500 mb-1 font-bold">Date Logged</span>
                                    <span className="text-neutral-800 block">{selectedPaymentDetail.payment_date || new Date(selectedPaymentDetail.created_at).toLocaleDateString()}</span>
                                </div>
                                <div className="bg-slate-900/20 p-4 rounded-xl border border-slate-850">
                                    <span className="block text-[9px] uppercase tracking-wider text-slate-500 mb-1 font-bold">Ref / Cheque No</span>
                                    <span className="text-neutral-700 block font-mono">{selectedPaymentDetail.reference || 'N/A'}</span>
                                </div>
                                <div className="bg-slate-900/20 p-4 rounded-xl border border-slate-850">
                                    <span className="block text-[9px] uppercase tracking-wider text-slate-500 mb-1 font-bold">Accounting User</span>
                                    <span className="text-neutral-800 block">{selectedPaymentDetail.recorded_by_name}</span>
                                </div>
                            </div>

                            {/* Notes */}
                            <div className="bg-slate-950/40 p-4 rounded-xl border border-slate-850">
                                <span className="block text-[10px] font-black uppercase text-slate-500 tracking-wider mb-2">Remarks / Notes</span>
                                <p className="text-xs text-neutral-700 italic leading-relaxed">
                                    {selectedPaymentDetail.notes || 'No remarks provided.'}
                                </p>
                            </div>
                        </div>

                        {/* Footer */}
                        <div className="px-6 py-4 bg-slate-900/30 border-t border-slate-850 flex justify-end">
                            <button
                                onClick={() => setSelectedPaymentDetail(null)}
                                className="px-5 py-2.5 bg-slate-800 hover:bg-slate-750 text-neutral-800 font-black text-xs uppercase rounded-xl transition-colors"
                            >
                                Close Document
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
