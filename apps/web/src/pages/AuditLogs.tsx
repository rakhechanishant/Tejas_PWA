import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import {
    Activity,
    Calendar,
    Search,
    ShieldAlert,
    X,
    Database
} from 'lucide-react'

interface AuditLog {
    id: number
    table_name: string
    record_id: number
    action: 'INSERT' | 'UPDATE' | 'DELETE'
    old_data: any
    new_data: any
    changed_by: string | null
    changed_at: string
    profiles?: {
        name: string
        role: string
    }
}

export const AuditLogs: React.FC = () => {
    const { profile } = useAuth()
    const [logs, setLogs] = useState<AuditLog[]>([])
    const [loading, setLoading] = useState(true)
    const [errorMsg, setErrorMsg] = useState('')
    const [searchQuery, setSearchQuery] = useState('')
    const [tableFilter, setTableFilter] = useState('ALL')
    const [actionFilter, setActionFilter] = useState<any>('ALL')
    const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null)

    const isAuthorized = profile?.role === 'ADMIN' || profile?.role === 'MANAGER'

    useEffect(() => {
        if (isAuthorized) {
            fetchAuditLogs()
        }
    }, [profile])

    const fetchAuditLogs = async () => {
        setLoading(true)
        setErrorMsg('')
        try {
            const { data, error } = await supabase
                .from('audit_logs')
                .select(`
                    *,
                    profiles ( name, role )
                `)
                .order('changed_at', { ascending: false })
                .limit(200)

            if (error) throw error
            setLogs(data || [])
        } catch (err: any) {
            console.error('Error fetching audit logs:', err)
            setErrorMsg('Failed to load audit logs. ' + (err.message || ''))
        } finally {
            setLoading(false)
        }
    }

    if (!isAuthorized) {
        return (
            <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
                <div className="h-14 w-14 rounded-full bg-rose-500/10 flex items-center justify-center text-rose-500 border border-rose-500/20">
                    <ShieldAlert className="h-7 w-7" />
                </div>
                <h3 className="text-lg font-bold text-neutral-800">Access Denied</h3>
                <p className="text-sm text-slate-500 max-w-sm">
                    You do not have permissions to access the database audit trail. This module is restricted to administrators and managers.
                </p>
            </div>
        )
    }

    // Unique table names for filter dropdown
    const tableNames = Array.from(new Set(logs.map(l => l.table_name)))

    const filteredLogs = logs.filter(log => {
        const query = searchQuery.trim().toLowerCase()
        const matchesSearch = !query ||
            log.table_name.toLowerCase().includes(query) ||
            String(log.record_id).includes(query) ||
            (log.profiles?.name || '').toLowerCase().includes(query)

        const matchesTable = tableFilter === 'ALL' || log.table_name === tableFilter
        const matchesAction = actionFilter === 'ALL' || log.action === actionFilter

        return matchesSearch && matchesTable && matchesAction
    })

    const getActionBadgeClass = (action: string) => {
        switch (action) {
            case 'INSERT': return 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
            case 'UPDATE': return 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
            case 'DELETE': return 'bg-rose-500/10 text-rose-455 border border-rose-500/20'
            default: return 'bg-slate-950 text-neutral-600 border border-slate-800'
        }
    }

    // A helper to render nicely formatted comparison of JSON keys
    const renderJSONDiff = (log: AuditLog) => {
        const keys = Array.from(new Set([
            ...Object.keys(log.old_data || {}),
            ...Object.keys(log.new_data || {})
        ])).sort()

        return (
            <div className="overflow-x-auto text-[11px] font-mono leading-relaxed max-h-[300px]">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="border-b border-slate-800 text-slate-500">
                            <th className="py-1.5 px-2">Property</th>
                            <th className="py-1.5 px-2">Old Value</th>
                            <th className="py-1.5 px-2">New Value</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-805">
                        {keys.map(k => {
                            const oldVal = JSON.stringify(log.old_data?.[k])
                            const newVal = JSON.stringify(log.new_data?.[k])
                            const isChanged = oldVal !== newVal

                            return (
                                <tr key={k} className={isChanged ? 'bg-amber-500/5' : 'opacity-80'}>
                                    <td className="py-1.5 px-2 font-semibold text-neutral-700">{k}</td>
                                    <td className="py-1.5 px-2 text-rose-400 max-w-[200px] truncate">{oldVal !== undefined ? oldVal : '-'}</td>
                                    <td className="py-1.5 px-2 text-emerald-450 max-w-[200px] truncate">{newVal !== undefined ? newVal : '-'}</td>
                                </tr>
                            )
                        })}
                    </tbody>
                </table>
            </div>
        )
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between pb-4 border-b border-slate-900">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-neutral-900 sm:text-3xl font-outfit">Audit Trails</h1>
                    <p className="text-sm text-neutral-600">View real-time event logs of inserts, edits, and deletions on key structures</p>
                </div>
            </div>

            {errorMsg && (
                <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-400 flex items-center gap-2">
                    <ShieldAlert className="h-5 w-5 text-rose-500 shrink-0" />
                    <span>{errorMsg}</span>
                </div>
            )}

            {/* Filter Search controls */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 items-center">
                <div className="relative col-span-1 sm:col-span-2">
                    <span className="absolute inset-y-0 left-0 flex items-center pl-3">
                        <Search className="h-4.5 w-4.5 text-slate-500" />
                    </span>
                    <input
                        type="text"
                        placeholder="Search table name, record ID, or staff..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-neutral-800 placeholder-slate-550 focus:border-amber-505 outline-none text-sm transition-all"
                    />
                </div>

                {/* Table Filter */}
                <div>
                    <select
                        value={tableFilter}
                        onChange={(e) => setTableFilter(e.target.value)}
                        className="w-full px-3 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-neutral-800 outline-none text-sm"
                    >
                        <option value="ALL">All Tables</option>
                        {tableNames.map(t => (
                            <option key={t} value={t}>{t}</option>
                        ))}
                    </select>
                </div>

                {/* Action Filter */}
                <div>
                    <select
                        value={actionFilter}
                        onChange={(e) => setActionFilter(e.target.value)}
                        className="w-full px-3 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-neutral-800 outline-none text-sm"
                    >
                        <option value="ALL">All Actions (Any)</option>
                        <option value="INSERT">INSERT</option>
                        <option value="UPDATE">UPDATE</option>
                        <option value="DELETE">DELETE</option>
                    </select>
                </div>
            </div>

            {/* Logs List Table */}
            {loading ? (
                <div className="flex flex-col items-center justify-center py-20 text-slate-500 gap-3">
                    <div className="h-8 w-8 animate-spin rounded-full border-4 border-amber-500 border-t-transparent" />
                    <p className="text-sm">Retrieving audit Trail logs...</p>
                </div>
            ) : filteredLogs.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-800 p-12 text-center text-slate-500">
                    <Database className="h-12 w-12 mx-auto mb-4 text-slate-600" />
                    <h3 className="text-base font-semibold text-neutral-700">No Audits Found</h3>
                    <p className="mt-1 text-sm text-slate-550">No events found matching your query criteria.</p>
                </div>
            ) : (
                <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-900/10">
                    <table className="w-full border-collapse text-left text-sm">
                        <thead className="bg-slate-900/60 text-neutral-600 uppercase text-[9px] font-bold tracking-wider">
                            <tr>
                                <th className="px-5 py-3">Timestamp</th>
                                <th className="px-5 py-3">Table Affected</th>
                                <th className="px-5 py-3 text-center">Action</th>
                                <th className="px-5 py-3 text-right">Row Reference</th>
                                <th className="px-5 py-3">User Executed</th>
                                <th className="px-5 py-3 text-center">Payload</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/80">
                            {filteredLogs.map((log) => (
                                <tr key={log.id} className="hover:bg-slate-900/40 transition-colors">
                                    <td className="px-5 py-3 text-neutral-600 text-xs">
                                        <div className="flex items-center gap-1">
                                            <Calendar className="h-3.5 w-3.5 text-slate-550" />
                                            <span>{new Date(log.changed_at).toLocaleString('en-IN')}</span>
                                        </div>
                                    </td>
                                    <td className="px-5 py-3 font-semibold text-neutral-800 font-mono text-xs">
                                        {log.table_name}
                                    </td>
                                    <td className="px-5 py-3 text-center">
                                        <span className={`px-2 py-0.5 rounded text-[9px] font-extrabold tracking-wider ${getActionBadgeClass(log.action)}`}>
                                            {log.action}
                                        </span>
                                    </td>
                                    <td className="px-5 py-3 text-right text-neutral-700 font-mono text-xs">
                                        #{log.record_id}
                                    </td>
                                    <td className="px-5 py-3">
                                        <div className="font-medium text-neutral-800">{log.profiles?.name || 'Automated Engine'}</div>
                                        <div className="text-[9px] text-slate-550 font-semibold">{log.profiles?.role || 'SYSTEM'}</div>
                                    </td>
                                    <td className="px-5 py-3 text-center">
                                        <button
                                            onClick={() => setSelectedLog(log)}
                                            className="px-2.5 py-1 bg-slate-900 border border-slate-800 hover:border-slate-700 text-neutral-700 hover:text-neutral-900 rounded-lg text-xs font-semibold"
                                        >
                                            Inspect Diff
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Modal for Details / Diff */}
            {selectedLog && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
                    <div className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl flex flex-col max-h-[85vh]">
                        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/20">
                            <div>
                                <h3 className="text-base font-bold text-neutral-900">Audit Payload Inspector</h3>
                                <p className="text-xs text-slate-550 font-mono">Log ID #{selectedLog.id} | Table: {selectedLog.table_name}</p>
                            </div>
                            <button
                                onClick={() => setSelectedLog(null)}
                                className="text-slate-450 hover:text-neutral-900 transition-colors"
                            >
                                <X className="h-6 w-6" />
                            </button>
                        </div>

                        <div className="p-6 overflow-y-auto space-y-5">
                            {/* Metadata */}
                            <div className="grid grid-cols-2 gap-4 bg-slate-950/30 p-4 rounded-xl border border-slate-800/60 text-xs">
                                <div>
                                    <p className="text-slate-500 uppercase tracking-widest text-[9px] font-bold">Action Type</p>
                                    <span className={`inline-block mt-1.5 px-2 py-0.5 rounded text-[10px] font-extrabold tracking-wider ${getActionBadgeClass(selectedLog.action)}`}>
                                        {selectedLog.action}
                                    </span>
                                </div>
                                <div className="text-right">
                                    <p className="text-slate-500 uppercase tracking-widest text-[9px] font-bold">Affected Record ID</p>
                                    <p className="mt-1.5 font-semibold text-neutral-800 font-mono text-sm">#{selectedLog.record_id}</p>
                                </div>
                                <div className="pt-2 border-t border-slate-800/80">
                                    <p className="text-slate-500 uppercase tracking-widest text-[9px] font-bold">Timestamp</p>
                                    <p className="mt-1 font-medium text-neutral-700">{new Date(selectedLog.changed_at).toLocaleString()}</p>
                                </div>
                                <div className="pt-2 border-t border-slate-800/80 text-right">
                                    <p className="text-slate-500 uppercase tracking-widest text-[9px] font-bold">Operator</p>
                                    <p className="mt-1 font-medium text-neutral-800">{selectedLog.profiles?.name || 'System Auto'}</p>
                                </div>
                            </div>

                            {/* Diff comparison view */}
                            <div className="space-y-2">
                                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-450 flex items-center gap-1.5">
                                    <Activity className="h-4 w-4" />
                                    <span>JSON Field mutations</span>
                                </h4>
                                <div className="bg-slate-950/30 border border-slate-800/80 rounded-xl p-4">
                                    {renderJSONDiff(selectedLog)}
                                </div>
                            </div>
                        </div>

                        <div className="px-6 py-4 border-t border-slate-800 bg-slate-950/30 flex justify-end">
                            <button
                                onClick={() => setSelectedLog(null)}
                                className="px-4 py-2 bg-slate-900 border border-slate-800 hover:bg-slate-850 rounded-xl text-neutral-700 hover:text-neutral-900 transition-all text-sm font-semibold"
                            >
                                Close Inspector
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
