import React, { useState, useEffect, useMemo, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import {
    Search,
    BookOpen,
    Plus,
    Calendar,
    AlertCircle,
    CheckCircle,
    X,
    Filter,
    Clock
} from 'lucide-react'

interface Party {
    id: number
    party_code: string
    name: string
    contact_number?: string
    city?: string
    total_due: number
}

interface Cheque {
    id: number
    party_id: number
    cheque_number: string
    bank_name: string
    amount: number
    due_date: string
    status: 'PENDING' | 'CLEARED' | 'BOUNCED'
    notes: string | null
    created_by: string
    created_at: string
    parties?: {
        Parties_name: string
        contact_number?: string
    }
}

export const Cheques: React.FC = () => {
    const { profile } = useAuth()
    const [cheques, setCheques] = useState<Cheque[]>([])
    const [parties, setParties] = useState<Party[]>([])
    const [loading, setLoading] = useState(true)
    const [actionLoading, setActionLoading] = useState(false)
    const [errorMsg, setErrorMsg] = useState('')
    const [successMsg, setSuccessMsg] = useState('')

    // Search and filters
    const [searchQuery, setSearchQuery] = useState('')
    const [statusFilter, setStatusFilter] = useState<'ALL' | 'PENDING' | 'CLEARED' | 'BOUNCED'>('ALL')

    // Modal state for registration
    const [showAddModal, setShowAddModal] = useState(false)
    const [selectedParty, setSelectedParty] = useState<Party | null>(null)
    const [partyQuery, setPartyQuery] = useState('')
    const [isPartyDropdownOpen, setIsPartyDropdownOpen] = useState(false)
    const partyDropdownRef = useRef<HTMLDivElement>(null)

    // Form states
    const [chequeNumber, setChequeNumber] = useState('')
    const [bankName, setBankName] = useState('')
    const [amount, setAmount] = useState('')
    const [dueDate, setDueDate] = useState('')
    const [notes, setNotes] = useState('')

    useEffect(() => {
        fetchCheques()
        fetchParties()

        const handleClickOutside = (event: MouseEvent) => {
            if (partyDropdownRef.current && !partyDropdownRef.current.contains(event.target as Node)) {
                setIsPartyDropdownOpen(false)
            }
        }
        document.addEventListener('mousedown', handleClickOutside)
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [])

    const fetchCheques = async () => {
        setLoading(true)
        setErrorMsg('')
        try {
            const { data, error } = await supabase
                .from('cheques')
                .select(`
                    *,
                    parties ( Parties_name, contact_number )
                `)
                .order('due_date', { ascending: true })

            if (error) throw error
            setCheques(data || [])
        } catch (err: any) {
            console.error('Error fetching cheques:', err)
            setErrorMsg('Failed to load cheques register.')
        } finally {
            setLoading(false)
        }
    }

    const fetchParties = async () => {
        try {
            const { data, error } = await supabase
                .from('parties')
                .select('*')
                .eq('is_active', true)
                .order('Parties_name', { ascending: true })

            if (error) throw error
            const mapped = (data || []).map((row: any) => ({
                id: row.id,
                party_code: row.party_code,
                name: row.Parties_name,
                contact_number: row.contact_number,
                city: row.city,
                total_due: Number(row.total_due || 0)
            }))
            setParties(mapped)
        } catch (err) {
            console.error('Error fetching parties:', err)
        }
    }

    const handleCreateCheque = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!selectedParty) {
            alert('Please select a customer first.')
            return
        }
        if (!chequeNumber || !bankName || !amount || !dueDate) {
            alert('Please fill out all required fields.')
            return
        }

        setActionLoading(true)
        setErrorMsg('')
        setSuccessMsg('')
        try {
            const { error } = await supabase
                .from('cheques')
                .insert({
                    party_id: selectedParty.id,
                    cheque_number: chequeNumber.trim(),
                    bank_name: bankName.trim(),
                    amount: Number(amount),
                    due_date: dueDate,
                    status: 'PENDING',
                    notes: notes.trim() || null,
                    created_by: profile?.id
                })

            if (error) throw error

            setSuccessMsg('Cheque registered successfully!')
            setShowAddModal(false)
            // Reset form
            setSelectedParty(null)
            setChequeNumber('')
            setBankName('')
            setAmount('')
            setDueDate('')
            setNotes('')
            setPartyQuery('')

            fetchCheques()
        } catch (err: any) {
            console.error('Error registering cheque:', err)
            setErrorMsg(err.message || 'Error occurred while saving cheque record.')
        } finally {
            setActionLoading(false)
        }
    }

    const handleUpdateStatus = async (chequeId: number, nextStatus: 'CLEARED' | 'BOUNCED') => {
        if (!confirm(`Are you sure you want to mark this cheque as ${nextStatus}?`)) return

        setActionLoading(true)
        setErrorMsg('')
        setSuccessMsg('')
        try {
            const { error } = await supabase
                .from('cheques')
                .update({
                    status: nextStatus,
                    updated_at: new Date().toISOString()
                })
                .eq('id', chequeId)

            if (error) throw error
            setSuccessMsg(`Cheque status updated to ${nextStatus}.`)
            fetchCheques()
        } catch (err: any) {
            console.error('Error updating cheque:', err)
            setErrorMsg('Failed to update status. ' + (err.message || ''))
        } finally {
            setActionLoading(false)
        }
    }

    const filteredParties = useMemo(() => {
        const query = partyQuery.trim().toLowerCase()
        if (!query) return parties.slice(0, 10)
        return parties.filter(p =>
            p.name.toLowerCase().includes(query) ||
            p.party_code.toLowerCase().includes(query)
        )
    }, [parties, partyQuery])

    const filteredCheques = cheques.filter(ch => {
        // Search filter
        const query = searchQuery.toLowerCase().trim()
        const matchSearch = !query ||
            ch.cheque_number.toLowerCase().includes(query) ||
            ch.bank_name.toLowerCase().includes(query) ||
            ch.parties?.Parties_name.toLowerCase().includes(query)

        // Status filter
        const matchStatus = statusFilter === 'ALL' || ch.status === statusFilter

        return matchSearch && matchStatus
    })

    // Compute upcoming alert notices (PENDING cheques due in <= 3 days)
    const dueChequeAlerts = useMemo(() => {
        const today = new Date()
        today.setHours(0, 0, 0, 0)

        const limitDate = new Date()
        limitDate.setDate(today.getDate() + 3)
        limitDate.setHours(23, 59, 59, 999)

        return cheques.filter(ch => {
            if (ch.status !== 'PENDING') return false
            const itemDate = new Date(ch.due_date)
            return itemDate >= today && itemDate <= limitDate
        })
    }, [cheques])

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between pb-4 border-b border-slate-900">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-neutral-900 sm:text-3xl font-outfit">Cheque Register</h1>
                    <p className="text-sm text-neutral-600">Manage post-dated customer cheques, cleared transactions, and bounce actions</p>
                </div>
                <button
                    onClick={() => setShowAddModal(true)}
                    className="w-full sm:w-auto px-4 py-2.5 bg-amber-500 hover:bg-amber-600 active:bg-amber-700 text-white font-bold rounded-xl transition-colors text-sm flex items-center justify-center gap-2 shadow-lg"
                >
                    <Plus className="h-5 w-5" />
                    <span>Register New Cheque</span>
                </button>
            </div>

            {/* Notifications Alert Banner Area */}
            {dueChequeAlerts.length > 0 && (
                <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-5 space-y-3">
                    <div className="flex items-center gap-2 text-amber-500">
                        <AlertCircle className="h-5 w-5 shrink-0" />
                        <h3 className="text-sm font-bold uppercase tracking-wider">Cheque Alerts: Upcoming Due Dates (3 Days)</h3>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {dueChequeAlerts.map(alertCh => (
                            <div key={alertCh.id} className="bg-slate-950/40 p-4 rounded-xl border border-amber-500/20 text-xs flex flex-col justify-between">
                                <div>
                                    <div className="flex justify-between items-start">
                                        <span className="font-semibold text-neutral-800 truncate pr-2">{alertCh.parties?.Parties_name}</span>
                                        <span className="text-amber-500 font-bold shrink-0">रु {alertCh.amount.toLocaleString('en-IN')}</span>
                                    </div>
                                    <p className="text-slate-500 mt-1">Bank: {alertCh.bank_name} | No: {alertCh.cheque_number}</p>
                                </div>
                                <div className="mt-3 pt-2 border-t border-slate-900 flex justify-between items-center text-[10px] text-neutral-600">
                                    <span className="flex items-center gap-1">
                                        <Clock className="h-3.5 w-3.5 text-amber-500/70" />
                                        Due {new Date(alertCh.due_date).toLocaleDateString('en-IN')}
                                    </span>
                                    <span className="px-2 py-0.5 rounded bg-amber-400/10 text-amber-500 font-semibold border border-amber-400/20">PENDING</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Messages */}
            {errorMsg && (
                <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-400 flex items-center gap-2">
                    <AlertCircle className="h-5 w-5 text-rose-500 shrink-0" />
                    <span>{errorMsg}</span>
                </div>
            )}
            {successMsg && (
                <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-400 flex items-center gap-2">
                    <CheckCircle className="h-5 w-5 text-emerald-500 shrink-0" />
                    <span>{successMsg}</span>
                </div>
            )}

            {/* Filters panel */}
            <div className="flex flex-col lg:flex-row gap-4 items-center justify-between">
                <div className="relative w-full lg:max-w-md">
                    <span className="absolute inset-y-0 left-0 flex items-center pl-3">
                        <Search className="h-5 w-5 text-slate-500" />
                    </span>
                    <input
                        type="text"
                        placeholder="Search bank name, cheque number, or customer..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-neutral-800 placeholder-slate-505 focus:border-amber-500/50 focus:ring-1 focus:ring-amber-505 outline-none transition-all text-sm"
                    />
                </div>
                <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
                    <span className="text-xs text-slate-450 font-semibold flex items-center gap-1">
                        <Filter className="h-4 w-4 text-slate-505" />
                        <span>Filter Status:</span>
                    </span>
                    <div className="flex p-0.5 bg-slate-900 border border-slate-800 rounded-xl">
                        {(['ALL', 'PENDING', 'CLEARED', 'BOUNCED'] as const).map((st) => (
                            <button
                                key={st}
                                onClick={() => setStatusFilter(st)}
                                className={`px-4 py-1.5 rounded-lg text-xs font-semibold uppercase tracking-wider transition-all
                                    ${statusFilter === st
                                        ? 'bg-amber-500 text-white shadow'
                                        : 'text-neutral-600 hover:text-neutral-900'
                                    }`}
                            >
                                {st}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* List Table */}
            {loading ? (
                <div className="flex flex-col items-center justify-center py-20 text-slate-500 gap-3">
                    <div className="h-8 w-8 animate-spin rounded-full border-4 border-amber-500 border-t-transparent" />
                    <p className="text-sm">Loading cheque records...</p>
                </div>
            ) : filteredCheques.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-800 p-12 text-center text-slate-500">
                    <BookOpen className="h-12 w-12 mx-auto mb-4 text-slate-600" />
                    <h3 className="text-base font-semibold text-neutral-700">No Cheques Registered</h3>
                    <p className="mt-1 text-sm text-slate-550">Matches will display here. Click "Register New Cheque" to make an entry.</p>
                </div>
            ) : (
                <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-900/10">
                    <table className="w-full border-collapse text-left text-sm">
                        <thead className="bg-slate-900/60 text-neutral-600 uppercase text-[10px] font-bold tracking-wider">
                            <tr>
                                <th className="px-6 py-4">Cheque Details</th>
                                <th className="px-6 py-4">Customer Name</th>
                                <th className="px-6 py-4">Due Date</th>
                                <th className="px-6 py-4 text-right">Amount</th>
                                <th className="px-6 py-4 text-center">Status</th>
                                <th className="px-6 py-4 text-center">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/80">
                            {filteredCheques.map((ch) => {
                                let statusClasses = 'bg-slate-950/40 text-neutral-600 border border-slate-800'
                                if (ch.status === 'CLEARED') statusClasses = 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                if (ch.status === 'BOUNCED') statusClasses = 'bg-rose-500/10 text-rose-450 border border-rose-505/20'

                                return (
                                    <tr key={ch.id} className="hover:bg-slate-900/40 transition-colors">
                                        <td className="px-6 py-4">
                                            <div className="font-semibold text-neutral-800">{ch.bank_name}</div>
                                            <div className="text-[11px] text-slate-500 mt-0.5">No: {ch.cheque_number}</div>
                                        </td>
                                        <td className="px-6 py-4 text-neutral-700">
                                            <div className="font-medium text-neutral-800">{ch.parties?.Parties_name || 'N/A'}</div>
                                            {ch.parties?.contact_number && <div className="text-[10px] text-slate-550">{ch.parties.contact_number}</div>}
                                        </td>
                                        <td className="px-6 py-4 text-neutral-700">
                                            <div className="flex items-center gap-1.5 text-xs">
                                                <Calendar className="h-4 w-4 text-slate-500" />
                                                <span>{new Date(ch.due_date).toLocaleDateString('en-IN')}</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-right font-bold text-neutral-900">
                                            रु {ch.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                        </td>
                                        <td className="px-6 py-4 text-center">
                                            <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${statusClasses}`}>
                                                {ch.status}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4">
                                            {ch.status === 'PENDING' ? (
                                                <div className="flex items-center justify-center gap-2">
                                                    <button
                                                        onClick={() => handleUpdateStatus(ch.id, 'CLEARED')}
                                                        className="px-2.5 py-1 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-xs font-bold transition-all shadow-sm"
                                                    >
                                                        Clear
                                                    </button>
                                                    <button
                                                        onClick={() => handleUpdateStatus(ch.id, 'BOUNCED')}
                                                        className="px-2.5 py-1 bg-rose-500 hover:bg-rose-600 text-white rounded-lg text-xs font-bold transition-all shadow-sm"
                                                    >
                                                        Bounce
                                                    </button>
                                                </div>
                                            ) : (
                                                <p className="text-slate-550 text-xs text-center">Settled</p>
                                            )}
                                        </td>
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            {/* modal form register cheque */}
            {showAddModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
                    <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl flex flex-col">
                        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/20">
                            <div>
                                <h3 className="text-base font-bold text-neutral-900">Register Customer Cheque</h3>
                                <p className="text-xs text-slate-500">Record a post-dated check linked to account dues</p>
                            </div>
                            <button
                                onClick={() => setShowAddModal(false)}
                                className="text-slate-450 hover:text-neutral-900 transition-colors"
                            >
                                <X className="h-6 w-6" />
                            </button>
                        </div>

                        <form onSubmit={handleCreateCheque} className="p-6 space-y-4">
                            {/* Party Auto Select */}
                            <div className="relative" ref={partyDropdownRef}>
                                <label className="block text-xs font-semibold text-neutral-600 uppercase tracking-widest mb-1.5">Select Customer *</label>
                                <div className="relative">
                                    <span className="absolute inset-y-0 left-0 flex items-center pl-3">
                                        <Search className="h-4.5 w-4.5 text-slate-500" />
                                    </span>
                                    <input
                                        type="text"
                                        placeholder={selectedParty ? selectedParty.name : "Type customer name / code..."}
                                        value={partyQuery}
                                        onChange={(e) => {
                                            setPartyQuery(e.target.value)
                                            setIsPartyDropdownOpen(true)
                                        }}
                                        onFocus={() => setIsPartyDropdownOpen(true)}
                                        className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-955 border border-slate-800 text-neutral-800 placeholder-slate-550 focus:border-amber-500 outline-none text-sm transition-all"
                                    />
                                    {selectedParty && (
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setSelectedParty(null)
                                                setPartyQuery('')
                                            }}
                                            className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-500 hover:text-neutral-900"
                                        >
                                            <X className="h-4 w-4" />
                                        </button>
                                    )}
                                </div>

                                {isPartyDropdownOpen && filteredParties.length > 0 && (
                                    <div className="absolute z-50 w-full mt-1.5 max-h-60 overflow-y-auto rounded-xl border border-slate-800 bg-slate-900 shadow-2xl py-1 text-sm">
                                        {filteredParties.map(p => (
                                            <button
                                                key={p.id}
                                                type="button"
                                                onClick={() => {
                                                    setSelectedParty(p)
                                                    setIsPartyDropdownOpen(false)
                                                    setPartyQuery('')
                                                }}
                                                className="w-full text-left px-4 py-2 text-neutral-800 hover:bg-slate-800 hover:text-neutral-900 flex items-center justify-between"
                                            >
                                                <span>{p.name}</span>
                                                <span className="text-[10px] text-slate-500 font-mono">{p.party_code}</span>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Row: Bank Name & Cheque Number */}
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-semibold text-neutral-600 uppercase tracking-widest mb-1.5">Bank Name *</label>
                                    <input
                                        type="text"
                                        placeholder="e.g. NIC Asia Bank"
                                        required
                                        value={bankName}
                                        onChange={(e) => setBankName(e.target.value)}
                                        className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-neutral-800 placeholder-slate-600 focus:border-amber-500 focus:ring-0 outline-none text-sm"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-neutral-600 uppercase tracking-widest mb-1.5">Cheque Number *</label>
                                    <input
                                        type="text"
                                        placeholder="e.g. CHQ384910"
                                        required
                                        value={chequeNumber}
                                        onChange={(e) => setChequeNumber(e.target.value)}
                                        className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-neutral-800 placeholder-slate-600 focus:border-amber-500 focus:ring-0 outline-none text-sm"
                                    />
                                </div>
                            </div>

                            {/* Row: Amount & Due Date */}
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-semibold text-neutral-600 uppercase tracking-widest mb-1.5">Due/Clearance Date *</label>
                                    <input
                                        type="date"
                                        required
                                        value={dueDate}
                                        onChange={(e) => setDueDate(e.target.value)}
                                        className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-neutral-800 focus:border-amber-500 focus:ring-0 outline-none text-sm"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-neutral-600 uppercase tracking-widest mb-1.5">Cheque Amount *</label>
                                    <div className="relative">
                                        <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-500 text-xs">रु</span>
                                        <input
                                            type="number"
                                            step="0.01"
                                            placeholder="0.00"
                                            required
                                            value={amount}
                                            onChange={(e) => setAmount(e.target.value)}
                                            className="w-full pl-8 pr-3 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-neutral-800 placeholder-slate-600 focus:border-amber-500 focus:ring-0 outline-none text-sm"
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Notes */}
                            <div>
                                <label className="block text-xs font-semibold text-neutral-600 uppercase tracking-widest mb-1.5 font-outfit">Memo / Notes</label>
                                <textarea
                                    rows={2}
                                    placeholder="Enter references, remarks..."
                                    value={notes}
                                    onChange={(e) => setNotes(e.target.value)}
                                    className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-neutral-800 placeholder-slate-600 focus:border-amber-500 focus:ring-0 outline-none text-sm resize-none"
                                />
                            </div>

                            {/* Actions submit */}
                            <div className="flex justify-end gap-3 pt-3 border-t border-slate-800">
                                <button
                                    type="button"
                                    onClick={() => setShowAddModal(false)}
                                    className="px-4 py-2.5 border border-slate-805 hover:bg-slate-800 rounded-xl text-neutral-600 hover:text-neutral-900 transition-all text-sm font-semibold"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={actionLoading}
                                    className="px-4 py-2.5 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-xl transition-all text-sm shadow-md"
                                >
                                    {actionLoading ? 'Saving...' : 'Register Cheque'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    )
}
