import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { X, Loader2, Save, UserCheck, Phone, Hash, Home } from 'lucide-react'

// Define the Party structure
interface Party {
    id?: number
    party_code?: string
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
    total_due?: number
    is_active?: boolean
}

interface PartyFormProps {
    party?: Party | null // If present, edit mode; otherwise creative mode
    onClose: () => void
    onSaveSuccess: () => void
}

export const PartyForm: React.FC<PartyFormProps> = ({
    party,
    onClose,
    onSaveSuccess
}) => {
    const isEditMode = !!party
    const [loading, setLoading] = useState(false)
    const [errorMsg, setErrorMsg] = useState('')

    // Form Fields State
    const [name, setName] = useState('')
    const [phone, setPhone] = useState('')
    const [pan, setPan] = useState('')
    const [address, setAddress] = useState('')
    const [contactPerson, setContactPerson] = useState('')
    const [designation, setDesignation] = useState('')
    const [partyType, setPartyType] = useState('Hardware')
    const [province, setProvince] = useState('')
    const [district, setDistrict] = useState('')
    const [city, setCity] = useState('')
    const [salesPerson, setSalesPerson] = useState('')
    const [creditLimit, setCreditLimit] = useState(0)

    // Initialize fields on Edit mode
    useEffect(() => {
        if (party) {
            setName(party.name || '')
            setPhone(party.phone || '')
            setPan(party.pan || '')
            setAddress(party.address || '')
            setContactPerson(party.contact_person || '')
            setDesignation(party.designation || '')
            setPartyType(party.party_type || 'Hardware')
            setProvince(party.province || '')
            setDistrict(party.district || '')
            setCity(party.city || '')
            setSalesPerson(party.sales_person || '')
            setCreditLimit(party.credit_limit || 0)
        }
    }, [party])

    /**
     * Helper: Extracts abbreviation for Name Code following the consonant algorithm.
     */
    const getShortPrefix = (rawName: string): string => {
        if (!rawName) return 'XXX'

        // Remove common suffixes
        const suffixRegex = /\b(PVT|LTD|PRIVATE|LIMITED|ENTERPRISES?|INTERNATIONAL|TRADING|HARDWARE|SUPPLIERS?|COMPANY|CO|AND|THE)\b/gi
        let clean = rawName.replace(suffixRegex, '').toUpperCase().trim()

        // Remove non-alphabetic characters
        const consonants = clean.replace(/[AEIOU\s\W\d]/gi, '')
        if (consonants.length >= 3) {
            return consonants.slice(0, 3)
        }

        const alpha = clean.replace(/[^A-Z]/gi, '')
        if (alpha.length >= 3) {
            return alpha.slice(0, 3)
        }

        return alpha.padEnd(3, 'X')
    }

    /**
     * Helper: Generates a unique party code by reading database prefixes.
     */
    const generateUniquePartyCode = async (partyName: string): Promise<string> => {
        const prefix = getShortPrefix(partyName)
        const codePrefix = `TEJAS-${prefix}-`

        try {
            // Query database for custom party codes matching prefix
            const { data, error } = await supabase
                .from('parties')
                .select('party_code')
                .like('party_code', `${codePrefix}%`)

            if (error) {
                throw error
            }

            let maxSeqNum = 0
            if (data && data.length > 0) {
                data.forEach(item => {
                    const parts = item.party_code.split('-')
                    const seqStr = parts[parts.length - 1]
                    const seqVal = parseInt(seqStr, 10)
                    if (!isNaN(seqVal) && seqVal > maxSeqNum) {
                        maxSeqNum = seqVal
                    }
                })
            }

            const nextSeq = maxSeqNum + 1
            const paddedSeq = nextSeq.toString().padStart(4, '0')
            return `${codePrefix}${paddedSeq}`
        } catch (err) {
            console.error('Failed to generate automatic party code:', err)
            // Fallback random code
            return `${codePrefix}${Math.floor(1000 + Math.random() * 9000)}`
        }
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setErrorMsg('')

        // Form validations
        if (!name.trim()) {
            setErrorMsg('Party Name is mandatory.')
            return
        }

        if (phone && !/^\d{7,10}$/.test(phone.trim())) {
            setErrorMsg('Invalid phone number. Ensure it represents 7 to 10 decimal digits.')
            return
        }

        if (pan && !/^\d{9}$/.test(pan.trim())) {
            setErrorMsg('Invalid PAN number. Must represent exactly 9 numeric digits.')
            return
        }

        setLoading(true)

        try {
            if (isEditMode && party) {
                // Update Action
                const { error } = await supabase
                    .from('parties')
                    .update({
                        Parties_name: name.trim(),
                        contact_number: phone.trim() || null,
                        pan_no: pan.trim() || null,
                        address: address.trim() || null,
                        contact_person: contactPerson.trim() || null,
                        contact_person_designation: designation.trim() || null,
                        type: partyType,
                        province: province.trim() || null,
                        district: district.trim() || null,
                        city: city.trim() || null,
                        sales_person: salesPerson.trim() || null,
                        credit_limit: creditLimit
                    })
                    .eq('id', party.id)

                if (error) throw error
            } else {
                // Generate code and Insert Action
                const generatedCode = await generateUniquePartyCode(name)
                const { error } = await supabase
                    .from('parties')
                    .insert([
                        {
                            party_code: generatedCode,
                            Parties_name: name.trim(),
                            contact_number: phone.trim() || null,
                            pan_no: pan.trim() || null,
                            address: address.trim() || null,
                            contact_person: contactPerson.trim() || null,
                            contact_person_designation: designation.trim() || null,
                            type: partyType,
                            province: province.trim() || null,
                            district: district.trim() || null,
                            city: city.trim() || null,
                            sales_person: salesPerson.trim() || null,
                            credit_limit: creditLimit,
                            total_due: 0,
                            is_active: true
                        }
                    ])

                if (error) throw error
            }

            onSaveSuccess()
        } catch (err: any) {
            console.error('Error saving party details:', err)
            setErrorMsg(err.message || 'Write database command failed.')
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm overflow-y-auto">
            <div className="relative w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-3xl p-6 md:p-8 shadow-2xl my-8">
                {/* Header */}
                <div className="flex items-center justify-between pb-4 border-b border-slate-800">
                    <div>
                        <h2 className="text-xl font-bold font-outfit text-white">
                            {isEditMode ? `Edit Party: ${party?.party_code}` : 'Register New Party'}
                        </h2>
                        <p className="text-xs text-slate-400 mt-0.5">
                            Input customer details and register local/global accounts.
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="text-slate-400 hover:text-white rounded-lg p-1.5 hover:bg-slate-800 transition-colors"
                    >
                        <X className="h-5 w-5" />
                    </button>
                </div>

                {errorMsg && (
                    <div className="mt-4 p-4 rounded-xl border border-rose-500/20 bg-rose-500/10 text-rose-400 text-xs">
                        {errorMsg}
                    </div>
                )}

                {/* Form body */}
                <form onSubmit={handleSubmit} className="mt-6 space-y-5">
                    {/* Main Info Row */}
                    <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-1">
                            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Party / Store Name *</label>
                            <div className="relative">
                                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                                    <UserCheck className="h-4 w-4 text-slate-500" />
                                </div>
                                <input
                                    type="text"
                                    required
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    placeholder="e.g. Bajrang Hardware Store"
                                    className="block w-full rounded-xl border border-slate-800 bg-slate-950 py-2.5 pr-3 pl-9 text-xs text-white focus:border-amber-500 focus:outline-none"
                                />
                            </div>
                        </div>

                        <div className="space-y-1">
                            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Contact Number</label>
                            <div className="relative">
                                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                                    <Phone className="h-4 w-4 text-slate-500" />
                                </div>
                                <input
                                    type="text"
                                    value={phone}
                                    onChange={(e) => setPhone(e.target.value)}
                                    placeholder="e.g. 9841XXXXXX or 014XXXX"
                                    className="block w-full rounded-xl border border-slate-800 bg-slate-950 py-2.5 pr-3 pl-9 text-xs text-white focus:border-amber-500 focus:outline-none"
                                />
                            </div>
                        </div>
                    </div>

                    <div className="grid gap-4 md:grid-cols-3">
                        <div className="space-y-1">
                            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">PAN Number (9 Digits)</label>
                            <div className="relative">
                                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                                    <Hash className="h-4 w-4 text-slate-500" />
                                </div>
                                <input
                                    type="text"
                                    value={pan}
                                    onChange={(e) => setPan(e.target.value)}
                                    placeholder="e.g. 609876543"
                                    className="block w-full rounded-xl border border-slate-800 bg-slate-950 py-2.5 pr-3 pl-9 text-xs text-white focus:border-amber-500 focus:outline-none"
                                />
                            </div>
                        </div>

                        <div className="space-y-1">
                            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Party Type</label>
                            <select
                                value={partyType}
                                onChange={(e) => setPartyType(e.target.value)}
                                className="block w-full rounded-xl border border-slate-800 bg-slate-950 py-2.5 px-3 text-xs text-white focus:border-amber-500 focus:outline-none"
                            >
                                <option value="Hardware">Hardware Store</option>
                                <option value="Wholesaler">Wholesaler</option>
                                <option value="Retailer">Retailer</option>
                                <option value="Contractor">Contractor / Builder</option>
                                <option value="General">General Client</option>
                            </select>
                        </div>

                        <div className="space-y-1">
                            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Credit Limit (रु)</label>
                            <input
                                type="number"
                                min="0"
                                value={creditLimit}
                                onChange={(e) => setCreditLimit(Number(e.target.value))}
                                placeholder="200000"
                                className="block w-full rounded-xl border border-slate-800 bg-slate-950 py-2.5 px-3 text-xs text-white focus:border-amber-500 focus:outline-none"
                            />
                        </div>
                    </div>

                    {/* Contact Person Details */}
                    <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-1">
                            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Contact Person Name</label>
                            <input
                                type="text"
                                value={contactPerson}
                                onChange={(e) => setContactPerson(e.target.value)}
                                placeholder="e.g. Mr. Ram Gurung"
                                className="block w-full rounded-xl border border-slate-800 bg-slate-950 py-2.5 px-3 text-xs text-white focus:border-amber-500 focus:outline-none"
                            />
                        </div>

                        <div className="space-y-1">
                            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Designation</label>
                            <input
                                type="text"
                                value={designation}
                                onChange={(e) => setDesignation(e.target.value)}
                                placeholder="e.g. Proprietor / Manager"
                                className="block w-full rounded-xl border border-slate-800 bg-slate-950 py-2.5 px-3 text-xs text-white focus:border-amber-500 focus:outline-none"
                            />
                        </div>
                    </div>

                    <div className="space-y-1">
                        <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Consolidated Address</label>
                        <div className="relative">
                            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                                <Home className="h-4 w-4 text-slate-500" />
                            </div>
                            <input
                                type="text"
                                value={address}
                                onChange={(e) => setAddress(e.target.value)}
                                placeholder="e.g. Ward 4, New Road, Pokhara"
                                className="block w-full rounded-xl border border-slate-800 bg-slate-950 py-2.5 pr-3 pl-9 text-xs text-white focus:border-amber-500 focus:outline-none"
                            />
                        </div>
                    </div>

                    {/* Regional details */}
                    <div className="grid gap-4 md:grid-cols-4">
                        <div className="space-y-1">
                            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Province</label>
                            <input
                                type="text"
                                value={province}
                                onChange={(e) => setProvince(e.target.value)}
                                placeholder="e.g. Gandaki"
                                className="block w-full rounded-xl border border-slate-800 bg-slate-950 py-2.5 px-3 text-xs text-white focus:border-amber-500 focus:outline-none"
                            />
                        </div>

                        <div className="space-y-1">
                            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">District</label>
                            <input
                                type="text"
                                value={district}
                                onChange={(e) => setDistrict(e.target.value)}
                                placeholder="e.g. Kaski"
                                className="block w-full rounded-xl border border-slate-800 bg-slate-950 py-2.5 px-3 text-xs text-white focus:border-amber-500 focus:outline-none"
                            />
                        </div>

                        <div className="space-y-1">
                            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">City</label>
                            <input
                                type="text"
                                value={city}
                                onChange={(e) => setCity(e.target.value)}
                                placeholder="e.g. Pokhara"
                                className="block w-full rounded-xl border border-slate-800 bg-slate-950 py-2.5 px-3 text-xs text-white focus:border-amber-500 focus:outline-none"
                            />
                        </div>

                        <div className="space-y-1">
                            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Sales Representative</label>
                            <input
                                type="text"
                                value={salesPerson}
                                onChange={(e) => setSalesPerson(e.target.value)}
                                placeholder="e.g. Tejas Staff"
                                className="block w-full rounded-xl border border-slate-800 bg-slate-950 py-2.5 px-3 text-xs text-white focus:border-amber-500 focus:outline-none"
                            />
                        </div>
                    </div>

                    {/* Footer Submit Buttons */}
                    <div className="pt-6 border-t border-slate-800 flex justify-end gap-3">
                        <button
                            type="button"
                            disabled={loading}
                            onClick={onClose}
                            className="px-5 py-2.5 rounded-xl border border-slate-850 hover:bg-slate-800 hover:text-white transition-all text-xs font-semibold text-slate-400 disabled:opacity-50"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={loading}
                            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-amber-500 text-white hover:bg-amber-400 font-bold transition-all text-xs disabled:opacity-50"
                        >
                            {loading ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                                <>
                                    <Save className="h-4 w-4" />
                                    {isEditMode ? 'Update Record' : 'Register Store'}
                                </>
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    )
}
