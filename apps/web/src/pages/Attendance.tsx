import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import {
    MapPin,
    Clock,
    AlertCircle,
    CheckCircle,
    Navigation,
    Compass,
    UserCheck,
    Users,
    Map
} from 'lucide-react'

interface AttendanceRecord {
    id: number
    profile_id: string
    check_in_time: string
    check_in_latitude: number | null
    check_in_longitude: number | null
    check_in_address: string | null
    check_out_time: string | null
    check_out_latitude: number | null
    check_out_longitude: number | null
    check_out_address: string | null
    notes: string | null
    created_at: string
    profiles?: {
        name: string
        role: string
    }
}

export const Attendance: React.FC = () => {
    const { profile } = useAuth()
    const [history, setHistory] = useState<AttendanceRecord[]>([])
    const [adminHistory, setAdminHistory] = useState<AttendanceRecord[]>([])
    const [autoLocations, setAutoLocations] = useState<any[]>([])
    const [activeRecord, setActiveRecord] = useState<AttendanceRecord | null>(null)
    const [loading, setLoading] = useState(true)
    const [actionLoading, setActionLoading] = useState(false)
    const [errorMsg, setErrorMsg] = useState('')
    const [successMsg, setSuccessMsg] = useState('')
    const [locationText, setLocationText] = useState('')
    const [gpsPermission, setGpsPermission] = useState<'checking' | 'granted' | 'prompt' | 'denied' | 'unsupported'>('checking')

    // Form input
    const [note, setNote] = useState('')

    const isAdminOrManager = profile?.role === 'ADMIN' || profile?.role === 'MANAGER'

    useEffect(() => {
        if (!navigator.geolocation) {
            setGpsPermission('unsupported')
            return
        }
        if (navigator.permissions) {
            navigator.permissions.query({ name: 'geolocation' as PermissionName }).then((result) => {
                setGpsPermission(result.state)
                result.onchange = () => {
                    setGpsPermission(result.state)
                }

                // If prompt status, request position silently once to trigger browser popup
                if (result.state === 'prompt') {
                    navigator.geolocation.getCurrentPosition(
                        () => setGpsPermission('granted'),
                        (err) => console.warn('Silently checking initial geolocation permission:', err),
                        { enableHighAccuracy: false, timeout: 5000 }
                    )
                }
            }).catch(() => {
                setGpsPermission('prompt')
            })
        } else {
            setGpsPermission('prompt')
        }
    }, [])

    useEffect(() => {
        if (profile?.id) {
            fetchUserAttendance()
            if (isAdminOrManager) {
                fetchAdminLogs()
            }
        }
    }, [profile?.id])

    const fetchUserAttendance = async () => {
        setLoading(true)
        setErrorMsg('')
        try {
            // Get user's own logs
            const { data, error } = await supabase
                .from('team_attendance')
                .select('*')
                .eq('profile_id', profile?.id)
                .order('check_in_time', { ascending: false })

            if (error) throw error

            setHistory(data || [])

            // Find current active check-in (no checkout time yet)
            const active = (data || []).find(r => r.check_out_time === null)
            setActiveRecord(active || null)
        } catch (err: any) {
            console.error('Error fetching attendance:', err)
            setErrorMsg('Failed to load attendance logs.')
        } finally {
            setLoading(false)
        }
    }

    const fetchAdminLogs = async () => {
        try {
            const { data, error } = await supabase
                .from('team_attendance')
                .select(`
                    *,
                    profiles ( name, role )
                `)
                .order('check_in_time', { ascending: false })
                .limit(100)

            if (error) throw error
            setAdminHistory(data || [])

            const { data: autoData, error: autoErr } = await supabase
                .from('user_locations')
                .select(`
                    *,
                    profiles ( name, role )
                `)
                .order('created_at', { ascending: false })
                .limit(100)

            if (autoErr) throw autoErr
            setAutoLocations(autoData || [])
        } catch (err) {
            console.error('Error fetching admin logs:', err)
        }
    }

    // Get current coordinates using wrapper
    const getCoordinates = (): Promise<GeolocationPosition> => {
        return new Promise((resolve, reject) => {
            if (!navigator.geolocation) {
                reject(new Error('Geolocation is not supported by your browser.'))
                return
            }
            setLocationText('Acquiring sat location...')
            navigator.geolocation.getCurrentPosition(
                (pos) => resolve(pos),
                (err) => reject(err),
                { enableHighAccuracy: true, timeout: 10000 }
            )
        })
    }

    // Call OSM Nominatim reverse geocode API
    const reverseGeocode = async (lat: number, lng: number): Promise<string> => {
        try {
            const response = await fetch(
                `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`,
                {
                    headers: {
                        'User-Agent': 'TejasHardwarePWA/1.0 (contact: tejas.hardware.nepal)'
                    }
                }
            )
            if (!response.ok) throw new Error('OSM reverse geocoding request failed')
            const data = await response.json()
            return data.display_name || `${lat.toFixed(6)}, ${lng.toFixed(6)}`
        } catch (err) {
            console.error('Reverse geocoding failed:', err)
            return `${lat.toFixed(6)}, ${lng.toFixed(6)}` // Fallback to raw coords representation
        }
    }

    const handleCheckIn = async () => {
        setActionLoading(true)
        setErrorMsg('')
        setSuccessMsg('')
        try {
            let lat: number | null = null
            let lng: number | null = null
            let addr: string | null = null

            try {
                const pos = await getCoordinates()
                lat = pos.coords.latitude
                lng = pos.coords.longitude
                setLocationText('Identifying address location...')
                addr = await reverseGeocode(lat, lng)
                setLocationText(`Location: ${addr}`)
            } catch (geoErr: any) {
                console.warn('Geolocation failed, saving check-in without coordinates:', geoErr)
                setLocationText('Location unavailable')
            }

            const { error } = await supabase
                .from('team_attendance')
                .insert({
                    profile_id: profile?.id,
                    check_in_latitude: lat,
                    check_in_longitude: lng,
                    check_in_address: addr,
                    notes: note.trim() || null
                })
                .select()
                .single()

            if (error) throw error

            setSuccessMsg('Successfully checked in! Location recorded.')
            setNote('')
            fetchUserAttendance()
            if (isAdminOrManager) fetchAdminLogs()
        } catch (err: any) {
            console.error('Check in error:', err)
            setErrorMsg(err.message || 'Verification failed. Could not record log.')
        } finally {
            setActionLoading(false)
        }
    }

    const handleCheckOut = async () => {
        if (!activeRecord) return

        setActionLoading(true)
        setErrorMsg('')
        setSuccessMsg('')
        try {
            let lat: number | null = null
            let lng: number | null = null
            let addr: string | null = null

            try {
                const pos = await getCoordinates()
                lat = pos.coords.latitude
                lng = pos.coords.longitude
                setLocationText('Identifying address location...')
                addr = await reverseGeocode(lat, lng)
                setLocationText(`Location: ${addr}`)
            } catch (geoErr: any) {
                console.warn('Geolocation failed, saving check-out without coordinates:', geoErr)
                setLocationText('Location unavailable')
            }

            const { error } = await supabase
                .from('team_attendance')
                .update({
                    check_out_time: new Date().toISOString(),
                    check_out_latitude: lat,
                    check_out_longitude: lng,
                    check_out_address: addr
                })
                .eq('id', activeRecord.id)

            if (error) throw error

            setSuccessMsg('Successfully checked out! Thank you.')
            fetchUserAttendance()
            if (isAdminOrManager) fetchAdminLogs()
        } catch (err: any) {
            console.error('Check out error:', err)
            setErrorMsg(err.message || 'Transaction failed. Could not record checkout.')
        } finally {
            setActionLoading(false)
        }
    }

    const openMapLink = (lat: number, lng: number) => {
        window.open(`https://www.google.com/maps?q=${lat},${lng}`, '_blank')
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between pb-4 border-b border-slate-900">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-slate-100 sm:text-3xl font-outfit">Team GPS Attendance</h1>
                    <p className="text-sm text-slate-400">Log work hours and verify field visits with secure tracking</p>
                </div>
            </div>

            {/* Error & Success banner */}
            {errorMsg && (
                <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-400 flex items-center gap-2">
                    <AlertCircle className="h-5 w-5 text-rose-500 shrink-0" />
                    <span>{errorMsg}</span>
                </div>
            )}
            {successMsg && (
                <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-450 flex items-center gap-2">
                    <CheckCircle className="h-5 w-5 text-emerald-500 shrink-0" />
                    <span>{successMsg}</span>
                </div>
            )}

            {/* Main grid control: Check In / Out Widget */}
            <div className="grid gap-6 md:grid-cols-3">
                <div className="md:col-span-1 space-y-6">
                    <div className={`rounded-2xl border border-slate-800 p-6 space-y-5 bg-white ${activeRecord ? 'accent-card-rose' : 'accent-card-amber'}`}>
                        <div className="flex items-center gap-2">
                            <Compass className="h-5 w-5 text-amber-600" />
                            <h2 className="text-base font-bold text-slate-200">Duty Tracker</h2>
                        </div>

                        {activeRecord ? (
                            <div className="space-y-4">
                                <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-center space-y-2">
                                    <Clock className="h-8 w-8 text-rose-600 mx-auto animate-pulse" />
                                    <p className="text-xs text-rose-700 font-bold uppercase tracking-wider">Status: Checked In</p>
                                    <p className="text-sm font-semibold text-slate-200">
                                        Since {new Date(activeRecord.check_in_time).toLocaleTimeString()}
                                    </p>
                                    {locationText ? (
                                        <p className="text-[10px] text-slate-650 font-mono leading-normal bg-slate-900 p-2 rounded-lg border border-slate-200">{locationText}</p>
                                    ) : activeRecord.check_in_address ? (
                                        <p className="text-[10px] text-slate-600 font-sans italic leading-normal">📍 In: {activeRecord.check_in_address}</p>
                                    ) : null}
                                </div>
                                <button
                                    onClick={handleCheckOut}
                                    disabled={actionLoading}
                                    className="w-full py-3 bg-rose-600 hover:bg-rose-700 active:scale-95 hover:-translate-y-0.5 text-white font-bold rounded-xl transition-all duration-300 text-sm shadow-md flex items-center justify-center gap-2 cursor-pointer"
                                >
                                    <Navigation className="h-4.5 w-4.5 rotate-45" />
                                    <span>Check Out Duty</span>
                                </button>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-center space-y-1.5">
                                    <UserCheck className="h-8 w-8 text-amber-600 mx-auto" />
                                    <p className="text-xs text-amber-700 font-bold uppercase tracking-wider">Status: Off Duty</p>
                                    <p className="text-xs text-slate-600">Ready to initiate location check-in.</p>
                                </div>

                                <div>
                                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-widest mb-1.5">Check-In Notes / Destination</label>
                                    <input
                                        type="text"
                                        placeholder="e.g. Visiting Bhaktapur client"
                                        value={note}
                                        onChange={(e) => setNote(e.target.value)}
                                        className="w-full px-3 py-2.5 rounded-xl bg-slate-900 border border-slate-200 text-slate-200 placeholder-slate-400 focus:border-amber-500 outline-none text-sm"
                                    />
                                </div>

                                <button
                                    onClick={handleCheckIn}
                                    disabled={actionLoading}
                                    className="w-full py-3 bg-amber-600 hover:bg-amber-700 active:scale-95 hover:-translate-y-0.5 text-white font-bold rounded-xl transition-all duration-300 text-sm shadow-md flex items-center justify-center gap-2 cursor-pointer"
                                >
                                    <MapPin className="h-4.5 w-4.5" />
                                    <span>Check In Location</span>
                                </button>
                                {locationText && <p className="text-center text-[10px] text-slate-650 font-mono bg-slate-900 p-2 rounded-lg border border-slate-200 leading-normal">{locationText}</p>}

                                {gpsPermission === 'denied' && (
                                    <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-[11px] text-rose-600 flex items-center gap-2 leading-relaxed">
                                        <AlertCircle className="h-4.5 w-4.5 text-rose-500 shrink-0" />
                                        <span>GPS coordinates blocked. Please enable location permissions in browser settings for seamless logs.</span>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                {/* Personal History Logs */}
                <div className="md:col-span-2">
                    <div className="rounded-2xl border border-slate-805 bg-white p-6 space-y-4 shadow-sm accent-card-blue">
                        <div className="flex items-center gap-2">
                            <Clock className="h-5 w-5 text-blue-600" />
                            <h2 className="text-base font-bold text-slate-200">My Logging History</h2>
                        </div>

                        {loading ? (
                            <div className="py-12 text-center text-xs text-slate-500">Loading tracking history...</div>
                        ) : history.length === 0 ? (
                            <div className="py-12 text-center text-xs text-slate-550 border border-dashed border-slate-850 rounded-xl">
                                No check-in records recorded under this profile.
                            </div>
                        ) : (
                            <div className="flow-root">
                                <ul className="-mb-8">
                                    {history.map((rec, recIdx) => (
                                        <li key={rec.id}>
                                            <div className="relative pb-8">
                                                {recIdx !== history.length - 1 ? (
                                                    <span className="absolute top-4 left-4 -ml-px h-full w-0.5 bg-slate-800" aria-hidden="true" />
                                                ) : null}
                                                <div className="relative flex space-x-3">
                                                    <div>
                                                        <span className="h-8 w-8 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center text-amber-500">
                                                            <MapPin className="h-4 w-4" />
                                                        </span>
                                                    </div>
                                                    <div className="flex-1 min-w-0 pt-1 flex justify-between space-x-4">
                                                        <div>
                                                            <p className="text-xs text-slate-300">
                                                                Checked In:{' '}
                                                                <strong className="text-slate-100">
                                                                    {new Date(rec.check_in_time).toLocaleString('en-IN')}
                                                                </strong>
                                                                {rec.notes && <span className="text-slate-500"> — "{rec.notes}"</span>}
                                                            </p>
                                                            <div className="mt-1 space-y-1 text-slate-500">
                                                                {rec.check_in_latitude && rec.check_in_longitude ? (
                                                                    <div>
                                                                        <button
                                                                            onClick={() => openMapLink(rec.check_in_latitude!, rec.check_in_longitude!)}
                                                                            className="text-blue-600 hover:text-blue-700 font-semibold hover:underline flex items-center gap-0.5 text-[10px] transition-colors duration-200"
                                                                        >
                                                                            <Map className="h-3 w-3" />
                                                                            <span>Check-in Map GPS</span>
                                                                        </button>
                                                                        {rec.check_in_address && (
                                                                            <p className="text-[10px] text-slate-500 mt-0.5 font-sans leading-relaxed">
                                                                                📍 In: {rec.check_in_address}
                                                                            </p>
                                                                        )}
                                                                    </div>
                                                                ) : (
                                                                    <span className="text-[10px]">GPS location skipped</span>
                                                                )}

                                                                {rec.check_out_address && (
                                                                    <p className="text-[10px] text-slate-400 font-sans leading-relaxed">
                                                                        📍 Out: {rec.check_out_address}
                                                                    </p>
                                                                )}
                                                            </div>
                                                        </div>
                                                        <div className="text-right text-xs text-slate-450">
                                                            {rec.check_out_time ? (
                                                                <div>
                                                                    <p className="font-semibold text-slate-200">
                                                                        Out: {new Date(rec.check_out_time).toLocaleTimeString()}
                                                                    </p>
                                                                    {rec.check_out_latitude && (
                                                                        <button
                                                                            onClick={() => openMapLink(rec.check_out_latitude!, rec.check_out_longitude!)}
                                                                            className="text-[9px] text-blue-650 hover:text-blue-800 font-semibold underline mt-0.5"
                                                                        >
                                                                            Checkout Pin
                                                                        </button>
                                                                    )}
                                                                </div>
                                                            ) : (
                                                                <span className="text-[10px] uppercase font-bold tracking-wider text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-250">Active</span>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Admin Dashboard Attendance List */}
            {isAdminOrManager && (
                <div className="rounded-2xl border border-slate-805 bg-white p-6 space-y-4 shadow-sm accent-card-blue">
                    <div className="flex items-center gap-2 pb-2 border-b border-slate-200">
                        <Users className="h-5 w-5 text-blue-600" />
                        <h2 className="text-base font-bold text-slate-200">Team Attendance Logs (Admin Master Panel)</h2>
                    </div>

                    {adminHistory.length === 0 ? (
                        <div className="py-8 text-center text-xs text-slate-500">No logs on record yet.</div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full border-collapse text-left text-xs text-slate-650">
                                <thead className="bg-blue-50/50 text-blue-700 border-b border-blue-105 uppercase text-[9px] font-extrabold tracking-wider">
                                    <tr>
                                        <th className="px-4 py-3">Member</th>
                                        <th className="px-4 py-3">Checked In</th>
                                        <th className="px-4 py-3">GPS Check-in</th>
                                        <th className="px-4 py-3">Checked Out</th>
                                        <th className="px-4 py-3">GPS Checkout</th>
                                        <th className="px-4 py-3">Notes</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-800/80">
                                    {adminHistory.map((log) => (
                                        <tr key={log.id} className="hover:bg-slate-900/30 transition-colors">
                                            <td className="px-4 py-3">
                                                <div className="font-semibold text-slate-200">{log.profiles?.name || 'Staff Member'}</div>
                                                <div className="text-[10px] text-slate-550 uppercase">{log.profiles?.role}</div>
                                            </td>
                                            <td className="px-4 py-3 text-slate-205 font-medium">
                                                {new Date(log.check_in_time).toLocaleString('en-IN')}
                                            </td>
                                            <td className="px-4 py-3">
                                                {log.check_in_latitude ? (
                                                    <div className="space-y-1">
                                                        <button
                                                            onClick={() => openMapLink(log.check_in_latitude!, log.check_in_longitude!)}
                                                            className="px-2 py-1 bg-white border border-blue-600 hover:bg-blue-50 rounded text-blue-600 active:scale-95 transition-all duration-200 flex items-center gap-1 font-semibold text-[10px] cursor-pointer shadow-sm"
                                                        >
                                                            <MapPin className="h-3 w-3" />
                                                            <span>View Map</span>
                                                        </button>
                                                        {log.check_in_address && (
                                                            <div className="text-[9px] text-slate-500 max-w-[185px] leading-snug break-words" title={log.check_in_address}>
                                                                {log.check_in_address}
                                                            </div>
                                                        )}
                                                    </div>
                                                ) : (
                                                    <span className="text-slate-400">Unavailable</span>
                                                )}
                                            </td>
                                            <td className="px-4 py-3">
                                                {log.check_out_time ? (
                                                    <span>{new Date(log.check_out_time).toLocaleString('en-IN')}</span>
                                                ) : (
                                                    <span className="text-amber-700 bg-amber-50 uppercase tracking-widest text-[9px] font-bold px-1.5 py-0.5 rounded border border-amber-200">On Duty</span>
                                                )}
                                            </td>
                                            <td className="px-4 py-3">
                                                {log.check_out_latitude ? (
                                                    <div className="space-y-1">
                                                        <button
                                                            onClick={() => openMapLink(log.check_out_latitude!, log.check_out_longitude!)}
                                                            className="px-2 py-1 bg-white border border-blue-600 hover:bg-blue-50 rounded text-blue-600 active:scale-95 transition-all duration-200 flex items-center gap-1 font-semibold text-[10px] cursor-pointer shadow-sm"
                                                        >
                                                            <MapPin className="h-3 w-3" />
                                                            <span>View Map</span>
                                                        </button>
                                                        {log.check_out_address && (
                                                            <div className="text-[9px] text-slate-500 max-w-[185px] leading-snug break-words" title={log.check_out_address}>
                                                                {log.check_out_address}
                                                            </div>
                                                        )}
                                                    </div>
                                                ) : (
                                                    <span className="text-slate-450">{log.check_out_time ? 'Unavailable' : 'Active'}</span>
                                                )}
                                            </td>
                                            <td className="px-4 py-3 text-slate-400 max-w-[200px] truncate" title={log.notes || ''}>
                                                {log.notes || '—'}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}

            {isAdminOrManager && (
                <div className="rounded-2xl border border-slate-805 bg-white p-6 space-y-4 shadow-sm accent-card-emerald mt-6">
                    <div className="flex items-center gap-2 pb-2 border-b border-slate-200">
                        <MapPin className="h-5 w-5 text-emerald-600" />
                        <h2 className="text-base font-bold text-slate-200">App Open Locations (Auto Tracked)</h2>
                    </div>

                    {autoLocations.length === 0 ? (
                        <div className="py-8 text-center text-xs text-slate-500">No auto-tracked logs found.</div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full border-collapse text-left text-xs text-slate-650">
                                <thead className="bg-emerald-50/50 text-emerald-700 border-b border-emerald-105 uppercase text-[9px] font-extrabold tracking-wider">
                                    <tr>
                                        <th className="px-4 py-3">Member</th>
                                        <th className="px-4 py-3">Timestamp</th>
                                        <th className="px-4 py-3">GPS Location</th>
                                        <th className="px-4 py-3">Event</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-800/80">
                                    {autoLocations.map((log) => (
                                        <tr key={log.id} className="hover:bg-slate-900/30 transition-colors">
                                            <td className="px-4 py-3">
                                                <div className="font-semibold text-slate-200">{log.profiles?.name || 'Staff Member'}</div>
                                                <div className="text-[10px] text-slate-550 uppercase">{log.profiles?.role}</div>
                                            </td>
                                            <td className="px-4 py-3 text-slate-205 font-medium">
                                                {new Date(log.created_at).toLocaleString('en-IN')}
                                            </td>
                                            <td className="px-4 py-3">
                                                {log.latitude ? (
                                                    <div className="space-y-1">
                                                        <button
                                                            onClick={() => openMapLink(log.latitude, log.longitude)}
                                                            className="px-2 py-1 bg-white border border-emerald-600 hover:bg-emerald-50 rounded text-emerald-600 active:scale-95 transition-all duration-200 flex items-center gap-1 font-semibold text-[10px] cursor-pointer shadow-sm"
                                                        >
                                                            <MapPin className="h-3 w-3" />
                                                            <span>View Map</span>
                                                        </button>
                                                        {log.address && (
                                                            <div className="text-[9px] text-slate-500 max-w-[200px] leading-snug break-words" title={log.address}>
                                                                {log.address}
                                                            </div>
                                                        )}
                                                    </div>
                                                ) : (
                                                    <span className="text-slate-400">Unavailable</span>
                                                )}
                                            </td>
                                            <td className="px-4 py-3 text-slate-400">
                                                <span className="bg-amber-100 text-amber-800 text-[10px] font-bold px-2 py-1 rounded inline-flex items-center gap-1">
                                                    <Navigation className="h-3 w-3" />
                                                    {log.event_type}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}
