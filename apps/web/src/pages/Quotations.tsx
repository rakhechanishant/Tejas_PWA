import React, { useState, useEffect, useMemo, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import {
    Search,
    User,
    Package,
    Trash2,
    Printer,
    Copy,
    Download,
    CheckCircle,
    Calculator,
    Plus,
    Minus,
    X,
    Send,
    AlertCircle,
    ChevronDown,
    Info,
    Calendar,
    ArrowLeft,
    Eye
} from 'lucide-react'
import { type Product } from '../store/useCartStore'
import { jsPDF } from 'jspdf'
import html2canvas from 'html2canvas-pro'

interface Party {
    id: number
    party_code: string
    name: string
    contact_number?: string
    city?: string
    total_due: number
}



interface QuotationItem {
    product: Product
    quantity: number
    unitPrice: number
    discountPct: number // Local line item discount pct
}

export const Quotations: React.FC = () => {
    const { profile } = useAuth()
    const [viewMode, setViewMode] = useState<'list' | 'create'>('list')
    const [quotationsList, setQuotationsList] = useState<any[]>([])
    const [loadingList, setLoadingList] = useState(false)
    const [actionLoading, setActionLoading] = useState(false)

    // Loaded quotation metadata when viewing/editing
    const [currentQuotationId, setCurrentQuotationId] = useState<number | null>(null)
    const [currentQuotationStatus, setCurrentQuotationStatus] = useState<string | null>(null)
    const [currentQuotationNumber, setCurrentQuotationNumber] = useState<string | null>(null)

    const [parties, setParties] = useState<Party[]>([])
    const [products, setProducts] = useState<Product[]>([])
    const [loadingParties, setLoadingParties] = useState(false)
    const [loadingProducts, setLoadingProducts] = useState(false)
    const [errorMsg, setErrorMsg] = useState('')
    const [successMsg, setSuccessMsg] = useState('')
    const [sharingLoading, setSharingLoading] = useState(false)

    // Party selection states
    const [selectedParty, setSelectedParty] = useState<Party | null>(null)
    const [customPartyName, setCustomPartyName] = useState('')
    const [isGuest, setIsGuest] = useState(false)
    const [partyQuery, setPartyQuery] = useState('')
    const [isPartyDropdownOpen, setIsPartyDropdownOpen] = useState(false)
    const partyDropdownRef = useRef<HTMLDivElement>(null)

    // Product selection & filtering states
    const [productQuery, setProductQuery] = useState('')
    const [selectedBrand, setSelectedBrand] = useState('ALL')
    const [selectedCategory, setSelectedCategory] = useState('ALL')
    const [selectedDetailProduct, setSelectedDetailProduct] = useState<Product | null>(null)

    // Quotation items
    const [items, setItems] = useState<QuotationItem[]>([])
    const [overallDiscountType, setOverallDiscountType] = useState<'NONE' | 'PERCENT' | 'FLAT'>('NONE')
    const [overallDiscountValue, setOverallDiscountValue] = useState<number>(0)

    // Referencing invoice block for screenshots / printing
    const printAreaRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        fetchParties()
        fetchProducts()
        fetchQuotations()

        // Handle click outside to close dropdown
        const handleClickOutside = (event: MouseEvent) => {
            if (partyDropdownRef.current && !partyDropdownRef.current.contains(event.target as Node)) {
                setIsPartyDropdownOpen(false)
            }
        }
        document.addEventListener('mousedown', handleClickOutside)
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [])

    const fetchQuotations = async () => {
        setLoadingList(true)
        setErrorMsg('')
        try {
            const { data, error } = await supabase
                .from('quotations')
                .select(`
                    *,
                    parties (
                        id,
                        party_code,
                        Parties_name,
                        contact_number,
                        city
                    ),
                    profiles (
                        name
                    )
                `)
                .order('created_at', { ascending: false })

            if (error) throw error
            setQuotationsList(data || [])
        } catch (err: any) {
            console.error('Error fetching quotations:', err)
            setErrorMsg('Failed to load quotation history: ' + (err.message || ''))
        } finally {
            setLoadingList(false)
        }
    }

    const loadQuotationIntoEstimator = async (q: any) => {
        setActionLoading(true)
        setErrorMsg('')
        setSuccessMsg('')
        try {
            // Fetch items
            const { data: dItems, error: itemsError } = await supabase
                .from('quotation_items')
                .select(`
                    *,
                    products (
                        id,
                        product_name,
                        ref_code,
                        company,
                        category,
                        unit,
                        mrp,
                        image_url
                    )
                `)
                .eq('quotation_id', q.id)
                .order('sort_order', { ascending: true })

            if (itemsError) throw itemsError

            // Map database items back to QuotationItem list
            const mappedItems: QuotationItem[] = (dItems || []).map((row: any) => ({
                product: row.products,
                quantity: Number(row.quantity),
                unitPrice: Number(row.unit_price),
                discountPct: 0
            }))

            // Look up the selected customer in our parties list
            const matchedParty = parties.find(p => p.id === q.party_id)
            if (matchedParty) {
                setSelectedParty(matchedParty)
                setIsGuest(false)
            } else {
                setSelectedParty(null)
                setIsGuest(true)
                setCustomPartyName(q.parties?.Parties_name || 'Retail Client')
            }

            setItems(mappedItems)

            // Reconstruct discount pct/flat from amount
            const subtotalBeforeDiscount = mappedItems.reduce((acc, it) => acc + (it.quantity * it.unitPrice), 0)
            const savedTotal = Number(q.total_amount)
            const discountAmt = Math.max(0, subtotalBeforeDiscount - savedTotal)

            if (discountAmt > 0 && subtotalBeforeDiscount > 0) {
                setOverallDiscountType('FLAT')
                setOverallDiscountValue(discountAmt)
            } else {
                setOverallDiscountType('NONE')
                setOverallDiscountValue(0)
            }

            setCurrentQuotationId(q.id)
            setCurrentQuotationStatus(q.status)
            setCurrentQuotationNumber(q.quotation_number)
            setViewMode('create')
        } catch (err: any) {
            console.error('Error loading quotation:', err)
            setErrorMsg('Failed to inspect details: ' + (err.message || ''))
        } finally {
            setActionLoading(false)
        }
    }

    const handleSaveQuotation = async (status: 'DRAFT' | 'APPROVED') => {
        if (!selectedParty) {
            setErrorMsg('Please select a registered customer to save the quotation.')
            return
        }
        if (items.length === 0) {
            setErrorMsg('Cannot save an empty quotation.')
            return
        }

        setActionLoading(true)
        setErrorMsg('')
        setSuccessMsg('')
        try {
            if (currentQuotationId) {
                const { error: uError } = await supabase
                    .from('quotations')
                    .update({
                        status: status,
                        total_amount: totals.netPayable,
                        notes: customPartyName ? `Detail check: ${customPartyName}` : null,
                        updated_at: new Date().toISOString()
                    })
                    .eq('id', currentQuotationId)

                if (uError) throw uError

                const { error: delError } = await supabase
                    .from('quotation_items')
                    .delete()
                    .eq('quotation_id', currentQuotationId)

                if (delError) throw delError

                const itemInserts = items.map((it, idx) => ({
                    quotation_id: currentQuotationId,
                    product_id: it.product.id,
                    quantity: it.quantity,
                    unit_price: it.unitPrice,
                    subtotal: it.quantity * it.unitPrice * (1 - it.discountPct / 100),
                    sort_order: idx
                }))

                const { error: insError } = await supabase
                    .from('quotation_items')
                    .insert(itemInserts)

                if (insError) throw insError

                setSuccessMsg(`Quotation updated successfully!`)
            } else {
                const { data: qData, error: qError } = await supabase
                    .from('quotations')
                    .insert({
                        party_id: selectedParty.id,
                        status: status,
                        total_amount: totals.netPayable,
                        notes: customPartyName ? `Detail check: ${customPartyName}` : null,
                        created_by: profile?.id
                    })
                    .select()
                    .single()

                if (qError) throw qError

                const itemInserts = items.map((it, idx) => ({
                    quotation_id: qData.id,
                    product_id: it.product.id,
                    quantity: it.quantity,
                    unit_price: it.unitPrice,
                    subtotal: it.quantity * it.unitPrice * (1 - it.discountPct / 100),
                    sort_order: idx
                }))

                const { error: insError } = await supabase
                    .from('quotation_items')
                    .insert(itemInserts)

                if (insError) throw insError

                setSuccessMsg(`Quotation ${qData.quotation_number} saved as ${status}!`)
            }

            resetCreator()
            setViewMode('list')
            fetchQuotations()
        } catch (err: any) {
            console.error('Error saving quotation:', err)
            setErrorMsg('Failed to save quotation: ' + (err.message || ''))
        } finally {
            setActionLoading(false)
        }
    }

    const resetCreator = () => {
        setItems([])
        setSelectedParty(null)
        setCustomPartyName('')
        setOverallDiscountType('NONE')
        setOverallDiscountValue(0)
        setCurrentQuotationId(null)
        setCurrentQuotationStatus(null)
        setCurrentQuotationNumber(null)
    }

    const handleConvertQuotation = async () => {
        if (!currentQuotationId) return
        setActionLoading(true)
        setErrorMsg('')
        setSuccessMsg('')
        try {
            const { data: rpcRes, error } = await supabase.rpc('convert_quotation', {
                p_quotation_id: currentQuotationId,
                p_created_by: profile?.id
            })

            if (error) throw error

            setSuccessMsg(`Successfully converted quotation! Created active Order: ${rpcRes.order_number}`)
            setCurrentQuotationStatus('CONVERTED')
            fetchQuotations()
        } catch (err: any) {
            console.error('Conversion error:', err)
            setErrorMsg('Failed to convert quotation: ' + (err.message || ''))
        } finally {
            setActionLoading(false)
        }
    }

    const handleCancelQuotation = async () => {
        if (!currentQuotationId) return
        setActionLoading(true)
        setErrorMsg('')
        setSuccessMsg('')
        try {
            const { error } = await supabase
                .from('quotations')
                .update({
                    status: 'CANCELLED',
                    updated_at: new Date().toISOString()
                })
                .eq('id', currentQuotationId)

            if (error) throw error

            setSuccessMsg('Quotation cancelled success!')
            setCurrentQuotationStatus('CANCELLED')
            fetchQuotations()
        } catch (err: any) {
            console.error('Cancel error:', err)
            setErrorMsg('Failed to cancel quotation: ' + (err.message || ''))
        } finally {
            setActionLoading(false)
        }
    }

    const handleApproveQuotation = async () => {
        if (!currentQuotationId) return
        setActionLoading(true)
        setErrorMsg('')
        setSuccessMsg('')
        try {
            const { error } = await supabase
                .from('quotations')
                .update({
                    status: 'APPROVED',
                    updated_at: new Date().toISOString()
                })
                .eq('id', currentQuotationId)

            if (error) throw error

            setSuccessMsg('Quotation approved successfully!')
            setCurrentQuotationStatus('APPROVED')
            fetchQuotations()
        } catch (err: any) {
            console.error('Approve error:', err)
            setErrorMsg('Failed to approve quotation: ' + (err.message || ''))
        } finally {
            setActionLoading(false)
        }
    }

    const fetchParties = async () => {
        setLoadingParties(true)
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
                contact_number: row.contact_number,
                city: row.city,
                total_due: Number(row.total_due || 0)
            }))
            setParties(mapped)
        } catch (err: any) {
            console.error('Error fetching parties:', err)
            setErrorMsg('Failed to load customers.')
        } finally {
            setLoadingParties(false)
        }
    }

    const fetchProducts = async () => {
        setLoadingProducts(true)
        try {
            const { data, error } = await supabase
                .from('products')
                .select('*')
                .eq('is_active', true)
                .order('product_name', { ascending: true })

            if (error) throw error
            setProducts(data || [])
        } catch (err: any) {
            console.error('Error fetching products:', err)
            setErrorMsg('Failed to load product catalog.')
        } finally {
            setLoadingProducts(false)
        }
    }

    // Filter lists
    const filteredParties = useMemo(() => {
        const query = partyQuery.trim().toLowerCase()
        if (!query) return parties.slice(0, 10)
        return parties.filter(p =>
            p.name.toLowerCase().includes(query) ||
            p.party_code.toLowerCase().includes(query) ||
            (p.city && p.city.toLowerCase().includes(query))
        )
    }, [parties, partyQuery])

    const brands = useMemo(() => {
        const list = new Set(products.map(p => p.company).filter(Boolean) as string[])
        return ['ALL', ...Array.from(list)]
    }, [products])

    const categories = useMemo(() => {
        const list = new Set(products.map(p => p.category).filter(Boolean) as string[])
        return ['ALL', ...Array.from(list)]
    }, [products])

    const filteredProducts = useMemo(() => {
        const query = productQuery.trim().toLowerCase()
        return products.filter(p => {
            const matchesSearch = !query ||
                p.product_name.toLowerCase().includes(query) ||
                (p.ref_code && p.ref_code.toLowerCase().includes(query))
            const matchesBrand = selectedBrand === 'ALL' || p.company === selectedBrand
            const matchesCategory = selectedCategory === 'ALL' || p.category === selectedCategory
            return matchesSearch && matchesBrand && matchesCategory
        })
    }, [products, productQuery, selectedBrand, selectedCategory])

    // Calculation formulas
    const totals = useMemo(() => {
        let subtotal = 0
        let totalItems = 0

        items.forEach(it => {
            const itemSub = it.quantity * it.unitPrice
            const lineDis = itemSub * (it.discountPct / 100)
            subtotal += (itemSub - lineDis)
            totalItems += it.quantity
        })

        let finalDiscountValue = 0
        if (overallDiscountType === 'PERCENT') {
            finalDiscountValue = subtotal * (overallDiscountValue / 100)
        } else if (overallDiscountType === 'FLAT') {
            finalDiscountValue = overallDiscountValue
        }

        const netPayable = Math.max(0, subtotal - finalDiscountValue)

        return {
            subtotal,
            totalItems,
            discount: finalDiscountValue,
            netPayable
        }
    }, [items, overallDiscountType, overallDiscountValue])

    // Handlers for items
    const addProductToQuote = (product: Product) => {
        const existingIndex = items.findIndex(it => it.product.id === product.id)
        if (existingIndex > -1) {
            const updated = [...items]
            updated[existingIndex].quantity += 1
            setItems(updated)
        } else {
            setItems([...items, {
                product,
                quantity: 1,
                unitPrice: product.mrp || 0,
                discountPct: 0
            }])
        }
        showToast('Product added to estimate list')
    }

    const updateItemQty = (productId: number, val: number) => {
        const updated = items.map(it => {
            if (it.product.id === productId) {
                return { ...it, quantity: Math.max(1, val) }
            }
            return it
        })
        setItems(updated)
    }

    const updateItemDiscount = (productId: number, val: number) => {
        const updated = items.map(it => {
            if (it.product.id === productId) {
                return { ...it, discountPct: Math.min(100, Math.max(0, val)) }
            }
            return it
        })
        setItems(updated)
    }

    const removeItemFromQuote = (productId: number) => {
        setItems(items.filter(it => it.product.id !== productId))
    }

    const showToast = (msg: string) => {
        setSuccessMsg(msg)
        setTimeout(() => setSuccessMsg(''), 2000)
    }

    // Get Party Name display
    const getPartyName = () => {
        if (isGuest) return customPartyName.trim() || 'General Customer (Guest)'
        return selectedParty?.name || 'Walk-in Customer'
    }

    // Share via WhatsApp
    const compileWhatsAppText = () => {
        const partyName = getPartyName()
        let text = `*📄 TEJAS IMPEX — QUOTATION ESTIMATE*\n`
        text += `*Customer:* ${partyName}\n`
        if (selectedParty?.party_code) {
            text += `*Party Code:* ${selectedParty.party_code}\n`
        }
        text += `*Date:* ${new Date().toLocaleDateString('en-IN')}\n`
        text += `-------------------------------------------\n`

        items.forEach((it, idx) => {
            const lineTotal = it.quantity * it.unitPrice * (1 - it.discountPct / 100)
            const p = it.product
            const companyName = p.company ? ` [${p.company.toUpperCase()}]` : ''
            const modelNum = p.ref_code ? ` (Model: ${p.ref_code})` : ''
            text += `*${idx + 1}. ${p.product_name}*${modelNum}${companyName}\n`
            text += `   🔸 Qty: ${it.quantity} ${p.unit} × रु ${it.unitPrice.toLocaleString()}`
            if (it.discountPct > 0) {
                text += ` (Less ${it.discountPct}%)`
            }
            text += ` = *रु ${lineTotal.toLocaleString()}*\n`
        })

        text += `-------------------------------------------\n`
        text += `*💳 Subtotal:* रु ${totals.subtotal.toLocaleString()}\n`
        if (totals.discount > 0) {
            const typeStr = overallDiscountType === 'PERCENT' ? `(${overallDiscountValue}%)` : `(Flat)`
            text += `*🎉 Discount ${typeStr}:* - रु ${totals.discount.toLocaleString()}\n`
        }
        text += `*💰 Grand Total:* *रु ${totals.netPayable.toLocaleString()}*\n\n`
        text += `_Estimate is valid for 7 days. Prices include local taxes where applicable._\n`
        text += `*🙏 Thank you for your inquiry!*`

        return text
    }

    const handleSendWhatsApp = () => {
        if (items.length === 0) {
            setErrorMsg('Estimate list is empty. Add products first.')
            return
        }
        const textMsg = compileWhatsAppText()
        const encoded = encodeURIComponent(textMsg)
        const phone = selectedParty?.contact_number || ''
        const cleanPhone = phone.replace(/[^0-9]/g, '')
        // WhatsApp URL layout
        const waUrl = cleanPhone
            ? `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encoded}`
            : `https://api.whatsapp.com/send?text=${encoded}`

        window.open(waUrl, '_blank')
    }

    const handleSharePDF = async () => {
        if (items.length === 0) {
            setErrorMsg('Estimate list is empty. Add products first.')
            return
        }
        setSharingLoading(true)
        setErrorMsg('')
        try {
            const element = printAreaRef.current
            if (!element) throw new Error('Quotation invoice preview element not found')

            // Temporarily load visible classes context offscreen for canvas capture
            const originalClasses = element.className
            element.className = "bg-white text-black p-10 rounded-none max-w-4xl font-sans"
            element.style.position = 'fixed'
            element.style.top = '0'
            element.style.left = '-9999px'
            element.style.display = 'block'
            element.style.width = '800px'

            const canvas = await html2canvas(element, {
                scale: 2,
                useCORS: true,
                logging: false,
                backgroundColor: '#ffffff'
            })

            element.className = originalClasses
            element.style.position = ''
            element.style.top = ''
            element.style.left = ''
            element.style.display = ''
            element.style.width = ''

            const imgData = canvas.toDataURL('image/png')
            const pdf = new jsPDF({
                orientation: 'portrait',
                unit: 'px',
                format: [canvas.width / 2, canvas.height / 2]
            })
            pdf.addImage(imgData, 'PNG', 0, 0, canvas.width / 2, canvas.height / 2)
            const pdfBlob = pdf.output('blob')

            const partyName = getPartyName().replace(/[^a-zA-Z0-9]/g, '_')
            const filename = `Quotation_${partyName}_${new Date().toISOString().slice(0, 10)}.pdf`
            const pdfFile = new File([pdfBlob], filename, { type: 'application/pdf' })

            if (navigator.share && navigator.canShare && navigator.canShare({ files: [pdfFile] })) {
                await navigator.share({
                    files: [pdfFile],
                    title: `Quotation for ${getPartyName()}`,
                    text: `Please find attached the quotation estimate from Tejas Impex.`
                })
                showToast('Quotation PDF Shared successfully!')
            } else {
                pdf.save(filename)

                // Fallback to text message WhatsApp share
                const textMsg = compileWhatsAppText()
                const encoded = encodeURIComponent(textMsg)
                const phone = selectedParty?.contact_number || ''
                const cleanPhone = phone.replace(/[^0-9]/g, '')
                const waUrl = cleanPhone
                    ? `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encoded}`
                    : `https://api.whatsapp.com/send?text=${encoded}`

                window.open(waUrl, '_blank')
                showToast('PDF downloaded! Opening text fallback in WhatsApp.')
            }
        } catch (err: any) {
            console.error('Error sharing PDF:', err)
            setErrorMsg('Failed to share PDF: ' + (err.message || ''))
        } finally {
            setSharingLoading(false)
        }
    }

    // Copy Draft message text
    const handleCopyClipboard = () => {
        if (items.length === 0) {
            setErrorMsg('Estimate list is empty. Add products first.')
            return
        }
        const textMsg = compileWhatsAppText()
        navigator.clipboard.writeText(textMsg)
        showToast('Estimate copied to clipboard!')
    }

    // Native Print layout
    const handlePrint = () => {
        if (items.length === 0) {
            setErrorMsg('Estimate list is empty. Add products first.')
            return
        }
        window.print()
    }

    // Attractive Excel HTML Export
    const handleDownloadCSV = () => {
        if (items.length === 0) {
            setErrorMsg('Estimate list is empty. Add products first.')
            return
        }
        const partyName = getPartyName()

        let htmlContent = `
        <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
        <head>
            <meta charset="utf-8" />
            <style>
                table { border-collapse: collapse; font-family: Calibri, Arial, sans-serif; }
                th { background-color: #f59e0b; color: white; font-weight: bold; border: 1px solid #d1d5db; padding: 8px; text-align: left; }
                td { border: 1px solid #d1d5db; padding: 6px; }
                h2 { margin-bottom: 0; padding-bottom: 0; color: #1e293b; }
                p { margin-top: 5px; color: #475569; }
                .text-right { text-align: right; }
                .font-bold { font-weight: bold; }
                .bg-light { background-color: #f8fafc; }
                .amount-cell { text-align: right; font-family: Consolas, monospace; }
                .total-row { background-color: #fef3c7; font-weight: bold; }
            </style>
        </head>
        <body>
            <h2>TEJAS IMPEX - QUOTATION ESTIMATE</h2>
            <p>Customer: <b>${partyName}</b><br/>Date: ${new Date().toLocaleDateString('en-IN')}</p>
            <table>
                <thead>
                    <tr>
                        <th>S.No.</th>
                        <th>SKU / Model</th>
                        <th style="width: 250px;">Product Name</th>
                        <th>Brand</th>
                        <th class="text-right">Qty</th>
                        <th>Unit</th>
                        <th class="text-right">Rate (रु)</th>
                        <th class="text-right">Discount</th>
                        <th class="text-right">Item Total (रु)</th>
                    </tr>
                </thead>
                <tbody>
        `

        items.forEach((it, idx) => {
            const lineTotal = it.quantity * it.unitPrice * (1 - it.discountPct / 100)
            htmlContent += `
                    <tr>
                        <td>${idx + 1}</td>
                        <td>${it.product.ref_code || ''}</td>
                        <td>${it.product.product_name}</td>
                        <td>${it.product.company || 'Generic'}</td>
                        <td class="text-right">${it.quantity}</td>
                        <td>${it.product.unit || 'PCS'}</td>
                        <td class="amount-cell">${it.unitPrice.toLocaleString('en-IN')}</td>
                        <td class="text-right">${it.discountPct > 0 ? it.discountPct + '%' : '-'}</td>
                        <td class="amount-cell bg-light font-bold">${lineTotal.toLocaleString('en-IN')}</td>
                    </tr>
            `
        })

        // Subtotals & Totals
        htmlContent += `
                    <tr><td colspan="9"></td></tr>
                    <tr class="total-row">
                        <td colspan="7"></td>
                        <td class="text-right">Subtotal:</td>
                        <td class="amount-cell">${totals.subtotal.toLocaleString('en-IN')}</td>
                    </tr>
        `
        if (totals.discount > 0) {
            htmlContent += `
                    <tr>
                        <td colspan="7"></td>
                        <td class="text-right">Discount:</td>
                        <td class="amount-cell" style="color:red">- ${totals.discount.toLocaleString('en-IN')}</td>
                    </tr>
            `
        }
        htmlContent += `
                    <tr class="total-row" style="background-color: #f59e0b; color: white;">
                        <td colspan="7"></td>
                        <td class="text-right" style="font-size: 1.1em;">Grand Total:</td>
                        <td class="amount-cell" style="font-size: 1.1em;">रु ${totals.netPayable.toLocaleString('en-IN')}</td>
                    </tr>
                </tbody>
            </table>
            <p style="font-size: 11px; color:#64748b; margin-top:20px;">Estimate is valid for 7 days. Generated automatically.</p>
        </body>
        </html>
        `

        const blob = new Blob([htmlContent], { type: 'application/vnd.ms-excel;charset=utf-8;' })
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.setAttribute('download', `Quotation_${partyName.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.xls`)
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        showToast('Estimate Exported as Excel!')
    }

    return (
        <div className="space-y-8 max-w-7xl mx-auto px-4 lg:px-8 pb-16">
            {/* ─── PRINT ONLY STYLESHEET ─── */}
            <style dangerouslySetInnerHTML={{
                __html: `
        @media print {
          @page {
            size: auto;
            margin: 0mm;
          }
          body {
            margin: 1cm;
          }
          body * {
            visibility: hidden;
            background: white !important;
            color: black !important;
          }
          #print-invoice-sheet, #print-invoice-sheet * {
            visibility: visible;
          }
          #print-invoice-sheet {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            border: none !important;
            padding: 12mm 15mm !important;
            box-shadow: none !important;
            background: white !important;
            color: black !important;
            box-sizing: border-box !important;
          }
          .no-print {
            display: none !important;
          }
        }
      `}} />

            {/* View Mode Switching Tabs (History vs New Estimator) */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-2 no-print">
                <div className="flex gap-4">
                    <button
                        onClick={() => { setViewMode('list'); resetCreator(); fetchQuotations(); }}
                        className={`pb-2 text-base font-bold border-b-2 transition-all flex items-center gap-2 ${viewMode === 'list'
                            ? 'border-amber-500 text-amber-500'
                            : 'border-transparent text-slate-400 hover:text-slate-200'
                            }`}
                    >
                        <Calendar className="h-5 w-5" />
                        <span>Quotation History</span>
                    </button>
                    <button
                        onClick={() => { setViewMode('create'); resetCreator(); }}
                        className={`pb-2 text-base font-bold border-b-2 transition-all flex items-center gap-2 ${viewMode === 'create'
                            ? 'border-amber-500 text-amber-500'
                            : 'border-transparent text-slate-400 hover:text-slate-200'
                            }`}
                    >
                        <Calculator className="h-5 w-5" />
                        <span>Quotation Builder</span>
                    </button>
                </div>
                {viewMode === 'list' && (
                    <button
                        onClick={() => { setViewMode('create'); resetCreator(); }}
                        className="py-2 px-4 btn-primary-blue text-xs rounded-xl inline-flex items-center gap-1.5"
                    >
                        <Plus className="h-4 w-4" />
                        <span>New Quotation</span>
                    </button>
                )}
            </div>

            {successMsg && (
                <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm font-semibold text-emerald-400 flex items-center gap-2 no-print">
                    <CheckCircle className="h-4 w-4 shrink-0 text-emerald-500" />
                    <span>{successMsg}</span>
                </div>
            )}

            {errorMsg && (
                <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm font-semibold text-rose-400 flex items-center gap-2 no-print">
                    <AlertCircle className="h-4 w-4 shrink-0 text-rose-500" />
                    <span>{errorMsg}</span>
                    <button onClick={() => setErrorMsg('')} className="ml-auto text-slate-400 hover:text-white">
                        <X className="h-4 w-4" />
                    </button>
                </div>
            )}

            {viewMode === 'list' ? (
                /* History List Frame */
                <div className="space-y-4 no-print">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between pb-2">
                        <div>
                            <h1 className="text-2xl font-extrabold text-slate-100 tracking-tight font-outfit">Quotation Register</h1>
                            <p className="text-sm text-slate-500">Track estimates, manage approvals, and convert them to orders instantly</p>
                        </div>
                    </div>

                    {loadingList ? (
                        <div className="flex flex-col items-center justify-center py-20 text-slate-500 gap-3">
                            <div className="h-8 w-8 animate-spin rounded-full border-4 border-amber-500 border-t-transparent" />
                            <p className="text-sm">Loading quotation history...</p>
                        </div>
                    ) : quotationsList.length === 0 ? (
                        <div className="rounded-2xl border border-dashed border-slate-800 p-12 text-center text-slate-550 bg-slate-900/10">
                            <Calculator className="h-12 w-12 mx-auto mb-4 text-slate-700" />
                            <h3 className="text-sm font-bold text-slate-350">No Quotations Found</h3>
                            <p className="text-xs text-slate-500 mt-1">Start by clicking "New Quotation" to draft a price estimate.</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto rounded-2xl border border-slate-805 bg-slate-900/10">
                            <table className="w-full border-collapse text-left text-sm">
                                <thead className="bg-slate-950/45 text-slate-405 uppercase text-xs font-bold tracking-wider">
                                    <tr>
                                        <th className="px-5 py-3.5">Date</th>
                                        <th className="px-5 py-3.5">Quotation ID</th>
                                        <th className="px-5 py-3.5">Customer</th>
                                        <th className="px-5 py-3.5">Status</th>
                                        <th className="px-5 py-3.5 text-right">Total Amount</th>
                                        <th className="px-5 py-3.5 text-center">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-800/80">
                                    {quotationsList.map((q) => (
                                        <tr key={q.id} className="hover:bg-slate-900/20 transition-colors">
                                            <td className="px-5 py-3.5 text-slate-400">
                                                {new Date(q.created_at).toLocaleDateString('en-IN')}
                                            </td>
                                            <td className="px-5 py-3.5 font-semibold text-slate-100 font-mono">
                                                {q.quotation_number}
                                            </td>
                                            <td className="px-5 py-3.5">
                                                <div className="font-semibold text-slate-205">{q.parties?.Parties_name}</div>
                                                <div className="text-xs text-slate-555 font-mono">{q.parties?.party_code}</div>
                                            </td>
                                            <td className="px-5 py-3">
                                                <span className={`px-2.5 py-1 rounded text-[11px] font-extrabold tracking-widest ${q.status === 'DRAFT' ? 'bg-slate-850 text-slate-400 border border-slate-800' :
                                                    q.status === 'APPROVED' ? 'bg-emerald-500/10 text-emerald-450 border border-emerald-500/20' :
                                                        q.status === 'CONVERTED' ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20' :
                                                            'bg-rose-500/10 text-rose-455 border border-rose-500/20'
                                                    }`}>
                                                    {q.status}
                                                </span>
                                            </td>
                                            <td className="px-5 py-3.5 text-right font-mono font-bold text-slate-205">
                                                रु {Number(q.total_amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                            </td>
                                            <td className="px-5 py-3 text-center">
                                                <button
                                                    onClick={() => loadQuotationIntoEstimator(q)}
                                                    className="px-3 py-1.5 bg-slate-900 border border-slate-850 hover:border-slate-700 text-slate-300 hover:text-white rounded-lg text-sm font-bold flex items-center gap-1.5 mx-auto"
                                                >
                                                    <Eye className="h-3.5 w-3.5 text-amber-500" />
                                                    <span>Inspect</span>
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            ) : (
                /* Interactive Quotation Editor */
                <div className="space-y-6">
                    {/* Saved Quotation Indicator Toolbar */}
                    {currentQuotationId && (
                        <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 no-print">
                            <div>
                                <span className="text-[10px] font-bold text-slate-505 uppercase tracking-wider font-mono">Viewing Saved Quotation</span>
                                <h4 className="text-sm font-extrabold text-slate-200 mt-0.5">{currentQuotationNumber} ({currentQuotationStatus})</h4>
                            </div>
                            <div className="flex flex-wrap gap-2 shrink-0">
                                {currentQuotationStatus === 'DRAFT' && (
                                    <>
                                        <button
                                            onClick={handleApproveQuotation}
                                            disabled={actionLoading}
                                            className="py-1.5 px-3 bg-emerald-500 hover:bg-emerald-600 text-white font-bold rounded-lg text-xs transition-colors shrink-0"
                                        >
                                            Approve Estimate
                                        </button>
                                        <button
                                            onClick={() => handleSaveQuotation('DRAFT')}
                                            disabled={actionLoading}
                                            className="py-1.5 px-3 bg-slate-850 hover:bg-slate-800 text-slate-300 font-semibold rounded-lg text-xs border border-slate-800 transition-all shrink-0"
                                        >
                                            Update Draft Details
                                        </button>
                                    </>
                                )}
                                {currentQuotationStatus === 'APPROVED' && (
                                    <button
                                        onClick={handleConvertQuotation}
                                        disabled={actionLoading}
                                        className="py-1.5 px-3 bg-amber-500 hover:bg-amber-600 text-slate-955 font-extrabold rounded-lg text-xs transition-colors shrink-0"
                                    >
                                        Convert to active Order
                                    </button>
                                )}
                                {(currentQuotationStatus === 'DRAFT' || currentQuotationStatus === 'APPROVED') && (
                                    <button
                                        onClick={handleCancelQuotation}
                                        disabled={actionLoading}
                                        className="py-1.5 px-3 bg-rose-505/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-455 font-bold rounded-lg text-xs transition-colors shrink-0"
                                    >
                                        Cancel Quotation
                                    </button>
                                )}
                                <button
                                    onClick={() => { setViewMode('list'); resetCreator(); }}
                                    className="py-1.5 px-3 bg-slate-900 border border-slate-800 hover:bg-slate-850 text-slate-400 hover:text-white rounded-lg text-xs font-semibold flex items-center gap-1"
                                >
                                    <ArrowLeft className="h-3.5 w-3.5" />
                                    <span>Back to History</span>
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Header Panel */}
                    <div className="flex items-center justify-between pb-4 border-b border-slate-900 no-print">
                        <div className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-500">
                                <Calculator className="h-5 w-5" />
                            </div>
                            <div>
                                <h1 className="text-xl font-extrabold text-slate-105 tracking-tight font-outfit">
                                    {currentQuotationId ? `Estimate Detail Inspector` : `Quotation Estimator`}
                                </h1>
                                <p className="text-xs text-slate-500">Formulate price quotes, discounts, and dispatch estimates on the fly</p>
                            </div>
                        </div>
                        <div className="flex gap-2 shrink-0">
                            {currentQuotationStatus === 'CONVERTED' ? (
                                <span className="px-3 py-2 rounded-xl text-xs font-extrabold bg-amber-500/15 border border-amber-500/20 text-amber-500">
                                    Converted to active Order
                                </span>
                            ) : currentQuotationStatus === 'CANCELLED' ? (
                                <span className="px-3 py-2 rounded-xl text-xs font-extrabold bg-rose-500/10 border border-rose-500/25 text-rose-400">
                                    Quotation Cancelled
                                </span>
                            ) : (
                                <>
                                    {items.length > 0 && !currentQuotationId && (
                                        <>
                                            <button
                                                onClick={() => handleSaveQuotation('DRAFT')}
                                                disabled={actionLoading}
                                                className="py-2 px-4 bg-slate-800 hover:bg-slate-700 text-slate-350 font-bold rounded-xl text-xs border border-slate-750 transition-colors"
                                            >
                                                Save Draft
                                            </button>
                                            <button
                                                onClick={() => handleSaveQuotation('APPROVED')}
                                                disabled={actionLoading}
                                                className="py-2 px-4 bg-amber-500 hover:bg-amber-600 text-white font-extrabold rounded-xl text-xs transition-colors"
                                            >
                                                Save & Approve
                                            </button>
                                        </>
                                    )}
                                    {items.length > 0 && (
                                        <button
                                            onClick={() => {
                                                resetCreator()
                                                if (currentQuotationId) setViewMode('list')
                                            }}
                                            className="py-2 px-4 rounded-xl border border-rose-500/30 hover:bg-rose-500/10 text-xs font-semibold text-rose-400 transition-colors"
                                        >
                                            {currentQuotationId ? 'Close Details' : 'Reset Quote'}
                                        </button>
                                    )}
                                </>
                            )}
                        </div>
                    </div>

                    {successMsg && (
                        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-xs font-semibold text-emerald-400 flex items-center gap-2 no-print">
                            <CheckCircle className="h-4 w-4 shrink-0 text-emerald-500" />
                            <span>{successMsg}</span>
                        </div>
                    )}

                    {errorMsg && (
                        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-xs font-semibold text-rose-400 flex items-center gap-2 no-print">
                            <AlertCircle className="h-4 w-4 shrink-0 text-rose-500" />
                            <span>{errorMsg}</span>
                            <button onClick={() => setErrorMsg('')} className="ml-auto text-slate-400 hover:text-white">
                                <X className="h-4 w-4" />
                            </button>
                        </div>
                    )}

                    {/* Top row: Setup & Catalog side-by-side */}
                    <div className="grid gap-6 md:grid-cols-2 no-print">

                        {/* Section 1: Customer Selection */}
                        <div className="rounded-2xl border border-slate-800/80 bg-slate-900/40 p-5 space-y-4 backdrop-blur-sm relative">
                            <h3 className="text-sm font-extrabold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                                <User className="h-5 w-5 text-amber-500" /> Customer / Party Setup
                            </h3>

                            {/* Toggle Party Mode */}
                            <div className="grid grid-cols-2 gap-1 bg-slate-950 p-1 rounded-xl border border-slate-850">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setIsGuest(false)
                                        setCustomPartyName('')
                                    }}
                                    className={`py-2 text-sm font-bold rounded-lg transition-all ${!isGuest
                                        ? 'bg-amber-500/10 border border-amber-500/20 text-amber-500'
                                        : 'text-slate-400 hover:text-slate-200'
                                        }`}
                                >
                                    Registered Party
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setIsGuest(true)
                                        setSelectedParty(null)
                                    }}
                                    className={`py-2 text-sm font-bold rounded-lg transition-all ${isGuest
                                        ? 'bg-amber-500/10 border border-amber-500/20 text-amber-500'
                                        : 'text-slate-400 hover:text-slate-200'
                                        }`}
                                >
                                    Guest / Retail Mode
                                </button>
                            </div>

                            {/* Registered Party Selection */}
                            {!isGuest ? (
                                <div className="space-y-3" ref={partyDropdownRef}>
                                    <label className="text-xs font-bold uppercase tracking-wider text-slate-500 block">Registered Customer</label>
                                    <div className="relative">
                                        <button
                                            type="button"
                                            onClick={() => setIsPartyDropdownOpen(!isPartyDropdownOpen)}
                                            className="w-full bg-slate-950 border border-slate-850 rounded-xl px-4 py-3 flex items-center justify-between text-sm text-slate-200 focus:outline-none focus:border-amber-500/40 transition-all text-left"
                                        >
                                            {selectedParty ? (
                                                <div className="min-w-0 pr-2">
                                                    <div className="flex items-center gap-2">
                                                        <span className="font-extrabold text-slate-200 truncate">{selectedParty.name}</span>
                                                        <span className="text-xs font-bold font-mono px-1.5 py-0.5 rounded bg-slate-900 text-slate-450 border border-slate-800">
                                                            {selectedParty.party_code}
                                                        </span>
                                                    </div>
                                                    <p className="text-xs text-slate-500 truncate mt-0.5">
                                                        {selectedParty.city || 'No Location'} • {selectedParty.contact_number || 'No contact'}
                                                    </p>
                                                </div>
                                            ) : (
                                                <span className="text-slate-500 font-medium">Choose Registered Customer...</span>
                                            )}
                                            <div className="flex items-center gap-2 shrink-0">
                                                {selectedParty && (
                                                    <button
                                                        type="button"
                                                        onClick={(e) => {
                                                            e.stopPropagation()
                                                            setSelectedParty(null)
                                                        }}
                                                        className="p-1 rounded-lg hover:bg-slate-900 text-slate-400 hover:text-rose-500 transition-colors"
                                                        title="Clear Customer"
                                                    >
                                                        <X className="h-4 w-4" />
                                                    </button>
                                                )}
                                                <ChevronDown className={`h-4 w-4 text-slate-500 transition-transform duration-200 ${isPartyDropdownOpen ? 'rotate-180' : ''}`} />
                                            </div>
                                        </button>

                                        {isPartyDropdownOpen && (
                                            <div className="absolute left-0 mt-2 w-full bg-slate-950 border border-slate-800 rounded-xl shadow-2xl z-50 p-2 space-y-2">
                                                <div className="relative">
                                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500" />
                                                    <input
                                                        type="text"
                                                        placeholder="Type to filter customer registry..."
                                                        value={partyQuery}
                                                        onChange={(e) => setPartyQuery(e.target.value)}
                                                        className="w-full bg-slate-900 border border-slate-800 rounded-lg pl-9 pr-3 py-2.5 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-amber-500/20"
                                                        autoFocus
                                                    />
                                                </div>
                                                <div className="divide-y divide-slate-850 max-h-[220px] overflow-y-auto rounded-lg border border-slate-850 bg-slate-950">
                                                    {loadingParties && (
                                                        <div className="p-3 text-center text-xs text-slate-500 animate-pulse">Loading party records...</div>
                                                    )}
                                                    {!loadingParties && filteredParties.length === 0 && (
                                                        <div className="p-3 text-center text-xs text-slate-550">No parties found</div>
                                                    )}
                                                    {!loadingParties && filteredParties.map(p => (
                                                        <div
                                                            key={p.id}
                                                            onClick={() => {
                                                                setSelectedParty(p)
                                                                setIsPartyDropdownOpen(false)
                                                                setPartyQuery('')
                                                            }}
                                                            className={`p-3 hover:bg-slate-900 cursor-pointer flex items-center justify-between text-sm transition-colors rounded-md ${selectedParty?.id === p.id ? 'bg-amber-500/10 text-amber-500' : 'text-slate-350'
                                                                }`}
                                                        >
                                                            <div className="min-w-0 pr-2">
                                                                <span className="font-semibold text-slate-200 block truncate">{p.name}</span>
                                                                <span className="text-xs text-slate-500 block truncate mt-0.5">
                                                                    {p.party_code} • {p.city || 'No Location'}
                                                                </span>
                                                            </div>
                                                            <div className="text-right shrink-0">
                                                                <span className="text-xs text-slate-400 block font-mono">रु {p.total_due.toLocaleString()}</span>
                                                                {p.total_due > 0 && (
                                                                    <span className="text-[10px] text-rose-500 bg-rose-500/5 px-1.5 py-0.5 rounded border border-rose-500/10 font-bold uppercase mt-0.5 inline-block">Due</span>
                                                                )}
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ) : (
                                <div className="space-y-1">
                                    <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Guest Name / Details</label>
                                    <input
                                        type="text"
                                        placeholder="e.g. Shyam hardware center"
                                        value={customPartyName}
                                        onChange={(e) => setCustomPartyName(e.target.value)}
                                        className="w-full bg-slate-905 border border-slate-850 rounded-xl px-3 py-2.5 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-amber-500/40"
                                    />
                                </div>
                            )}
                        </div>

                        {/* Section 2: Catalog Selector */}
                        <div className="rounded-2xl border border-slate-800/80 bg-slate-900/40 p-5 space-y-4 backdrop-blur-sm">
                            <div className="flex justify-between items-center">
                                <h3 className="text-sm font-extrabold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                                    <Package className="h-5 w-5 text-amber-500" /> Catalog Products
                                </h3>
                                <button
                                    onClick={() => {
                                        setProductQuery('')
                                        setSelectedBrand('ALL')
                                        setSelectedCategory('ALL')
                                    }}
                                    className="text-xs font-bold text-slate-500 hover:text-slate-300"
                                >
                                    Reset Filters
                                </button>
                            </div>

                            {/* Product filters */}
                            <div className="space-y-2">
                                <div className="relative">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500" />
                                    <input
                                        type="text"
                                        placeholder="Search by SKU, series name..."
                                        value={productQuery}
                                        onChange={(e) => setProductQuery(e.target.value)}
                                        className="w-full bg-slate-950 border border-slate-850 rounded-xl pl-9 pr-3 py-2.5 text-sm text-slate-200 placeholder:text-slate-655 focus:outline-none focus:border-amber-500/40"
                                    />
                                </div>

                                <div className="grid grid-cols-2 gap-1.5">
                                    <select
                                        value={selectedBrand}
                                        onChange={(e) => setSelectedBrand(e.target.value)}
                                        className="bg-slate-950 border border-slate-850 rounded-xl px-3 py-2 text-sm text-slate-400 focus:outline-none"
                                    >
                                        <option value="ALL">All Brands</option>
                                        {brands.map(b => b !== 'ALL' && <option key={b} value={b}>{b}</option>)}
                                    </select>

                                    <select
                                        value={selectedCategory}
                                        onChange={(e) => setSelectedCategory(e.target.value)}
                                        className="bg-slate-950 border border-slate-850 rounded-xl px-3 py-2 text-sm text-slate-400 focus:outline-none"
                                    >
                                        <option value="ALL">All Categories</option>
                                        {categories.map(c => c !== 'ALL' && <option key={c} value={c}>{c}</option>)}
                                    </select>
                                </div>
                            </div>

                            {/* List block */}
                            <div className="divide-y divide-slate-850 max-h-[600px] overflow-y-auto rounded-xl border border-slate-850 bg-slate-950/65">
                                {loadingProducts && (
                                    <div className="p-4 text-center text-sm text-slate-500 animate-pulse">Syncing items catalog...</div>
                                )}
                                {!loadingProducts && filteredProducts.length === 0 && (
                                    <div className="p-4 text-center text-sm text-slate-500">No items matched query.</div>
                                )}
                                {!loadingProducts && filteredProducts.map(p => {
                                    const quantityInQuote = items.find(it => it.product.id === p.id)?.quantity || 0
                                    return (
                                        <div
                                            key={p.id}
                                            className="p-3.5 flex items-center justify-between gap-3 hover:bg-slate-900/60 transition-colors"
                                        >
                                            <div className="min-w-0 pr-2 flex-grow">
                                                <span className="text-[10px] font-bold font-mono px-1.5 py-0.5 rounded bg-slate-850 text-slate-450 border border-slate-800 uppercase">
                                                    {p.company || 'Generic'}
                                                </span>
                                                <div
                                                    onClick={() => setSelectedDetailProduct(p)}
                                                    className="flex items-center gap-1.5 mt-1.5 cursor-pointer group/title"
                                                >
                                                    <span className="text-sm font-bold text-slate-200 truncate group-hover/title:text-amber-500 transition-colors">
                                                        {p.product_name}
                                                    </span>
                                                    <Info className="h-3.5 w-3.5 text-slate-500 group-hover/title:text-amber-500 shrink-0" />
                                                </div>
                                                <div className="flex gap-2 items-center text-xs text-slate-500 mt-1">
                                                    <span className="text-amber-500 font-bold">रु {p.mrp?.toLocaleString()}</span>
                                                    <span>•</span>
                                                    <span>{p.unit}</span>
                                                    {p.ref_code && (
                                                        <>
                                                            <span>•</span>
                                                            <span className="text-xs font-mono font-semibold text-slate-400">{p.ref_code}</span>
                                                        </>
                                                    )}
                                                </div>
                                            </div>
                                            <button
                                                onClick={() => addProductToQuote(p)}
                                                className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 transition-all duration-300 text-sm font-bold active:scale-95 ${quantityInQuote > 0
                                                    ? 'bg-blue-50 border-2 border-blue-200 hover:bg-blue-100 hover:border-blue-300 text-blue-600 shadow-sm'
                                                    : 'bg-blue-600 hover:bg-blue-700 hover:shadow-lg hover:shadow-blue-500/10 text-white hover:-translate-y-0.5'
                                                    }`}
                                            >
                                                {quantityInQuote > 0 ? quantityInQuote : <Plus className="h-4 w-4" />}
                                            </button>
                                        </div>
                                    )
                                })}
                            </div>
                        </div>
                    </div>

                    {/* Bottom Row: Draft Estimation Panel (Full-Width) */}
                    <div className="w-full mt-6 space-y-6">
                        <div className="rounded-2xl border border-slate-800/80 bg-slate-900/40 p-5 space-y-6 backdrop-blur-sm">

                            {/* Sheet title header */}
                            <div className="flex items-center justify-between pb-3 border-b border-slate-850">
                                <div>
                                    <h3 className="text-base font-bold text-slate-200">Draft Estimation Panel</h3>
                                    <p className="text-xs text-slate-500">Lines listing pricing rates and invoice totals</p>
                                </div>
                                <span className="text-xs font-semibold bg-slate-950 text-amber-550 border border-slate-850 px-3 py-1.5 rounded-lg">
                                    Items Selected: {items.length} (Sum Qty: {totals.totalItems})
                                </span>
                            </div>

                            {/* Line items list grid */}
                            <div className="divide-y divide-slate-850/60 max-h-[450px] overflow-y-auto overflow-x-hidden pr-2">
                                {items.length === 0 ? (
                                    <div className="py-12 text-center text-sm text-slate-500 font-semibold flex flex-col items-center justify-center gap-2">
                                        <Calculator className="h-10 w-10 text-slate-200 stroke-1" />
                                        <span>No products added to quote. Add items from the side catalog.</span>
                                    </div>
                                ) : (
                                    items.map((it, idx) => {
                                        const itemSub = it.quantity * it.unitPrice
                                        const itemDiscount = itemSub * (it.discountPct / 100)
                                        const lineTotal = itemSub - itemDiscount
                                        return (
                                            <div key={it.product.id} className="py-3.5 flex flex-col md:flex-row md:items-center justify-between gap-3 text-sm">
                                                {/* Left: Item identity */}
                                                <div className="flex items-center gap-3 min-w-0 flex-1">
                                                    <span className="text-slate-500 font-bold text-xs bg-slate-950 px-2.5 py-1 rounded border border-slate-855 shrink-0 font-mono">
                                                        #{idx + 1}
                                                    </span>
                                                    <div className="min-w-0">
                                                        <div className="flex items-center gap-1.5 flex-wrap">
                                                            {it.product.ref_code && (
                                                                <span className="text-xs font-mono font-bold px-1.5 py-0.5 rounded bg-slate-850 text-slate-400 border border-slate-800 uppercase">
                                                                    {it.product.ref_code}
                                                                </span>
                                                            )}
                                                            {it.product.company && (
                                                                <span className="text-xs font-bold text-amber-500 border border-amber-500/15 px-2 py-0.5 bg-amber-500/5 rounded uppercase">
                                                                    {it.product.company}
                                                                </span>
                                                            )}
                                                        </div>
                                                        <span className="font-bold text-slate-200 mt-1 block truncate">
                                                            {it.product.product_name}
                                                        </span>
                                                    </div>
                                                </div>

                                                {/* Right: Quantity, Discount price actions */}
                                                <div className="flex flex-wrap items-center gap-4 shrink-0 justify-between md:justify-end">
                                                    {/* Qty count control */}
                                                    <div className="flex items-center gap-1 bg-slate-950 border border-slate-850 rounded-lg p-1">
                                                        <button
                                                            onClick={() => updateItemQty(it.product.id, it.quantity - 1)}
                                                            className="h-6 w-6 bg-blue-50 border border-blue-105 rounded flex items-center justify-center text-xs text-blue-600 hover:bg-blue-600 hover:text-white hover:border-blue-600 transition-colors duration-200 active:scale-90"
                                                        >
                                                            <Minus className="h-2.5 w-2.5" />
                                                        </button>
                                                        <input
                                                            type="number"
                                                            min="1"
                                                            value={it.quantity}
                                                            onChange={(e) => updateItemQty(it.product.id, Number(e.target.value))}
                                                            className="w-12 bg-transparent text-center font-bold text-sm text-slate-100 focus:outline-none"
                                                        />
                                                        <button
                                                            onClick={() => updateItemQty(it.product.id, it.quantity + 1)}
                                                            className="h-6 w-6 bg-blue-50 border border-blue-105 rounded flex items-center justify-center text-xs text-blue-600 hover:bg-blue-600 hover:text-white hover:border-blue-600 transition-colors duration-200 active:scale-90"
                                                        >
                                                            <Plus className="h-2.5 w-2.5" />
                                                        </button>
                                                    </div>

                                                    {/* Interactive discount pct */}
                                                    <div className="flex items-center gap-1.5 bg-slate-955 border border-slate-850 rounded-lg py-1.5 px-3 text-xs font-semibold text-slate-400">
                                                        <span>Disc:</span>
                                                        <input
                                                            type="number"
                                                            min="0"
                                                            max="100"
                                                            value={it.discountPct}
                                                            onChange={(e) => updateItemDiscount(it.product.id, Number(e.target.value))}
                                                            className="w-8 bg-transparent text-center text-slate-100 font-bold focus:outline-none"
                                                        />
                                                        <span>%</span>
                                                    </div>

                                                    {/* Net row subtotal */}
                                                    <div className="text-right min-w-[80px]">
                                                        {it.discountPct > 0 ? (
                                                            <>
                                                                <span className="text-xs text-slate-500 line-through block">रु {itemSub.toLocaleString()}</span>
                                                                <span className="font-extrabold text-amber-500 select-all block">रु {lineTotal.toLocaleString()}</span>
                                                            </>
                                                        ) : (
                                                            <span className="font-extrabold text-slate-200 select-all block">रु {lineTotal.toLocaleString()}</span>
                                                        )}
                                                    </div>

                                                    {/* Remove item button */}
                                                    <button
                                                        onClick={() => removeItemFromQuote(it.product.id)}
                                                        className="text-slate-500 hover:text-rose-500 p-1.5 bg-slate-950 hover:bg-rose-500/10 border border-slate-850 rounded-lg transition-colors"
                                                    >
                                                        <Trash2 className="h-3.5 w-3.5" />
                                                    </button>
                                                </div>
                                            </div>
                                        )
                                    })
                                )}
                            </div>

                            {/* Calculations Summary Card */}
                            {items.length > 0 && (
                                <div className="pt-4 border-t border-slate-850 grid gap-4 md:grid-cols-2">

                                    {/* Overall Discount Input schemes */}
                                    <div className="space-y-3 p-3.5 rounded-xl bg-slate-950/60 border border-slate-850">
                                        <label className="text-xs font-extrabold uppercase tracking-wider text-slate-400 block">Overall Invoice Reduction</label>
                                        <div className="grid grid-cols-3 gap-1 grid-flow-row">
                                            {(['NONE', 'PERCENT', 'FLAT'] as const).map(mode => (
                                                <button
                                                    key={mode}
                                                    type="button"
                                                    onClick={() => {
                                                        setOverallDiscountType(mode)
                                                        setOverallDiscountValue(0)
                                                    }}
                                                    className={`py-1.5 text-xs font-bold rounded-lg border transition-all ${overallDiscountType === mode
                                                        ? 'bg-amber-500/10 border-amber-500/30 text-amber-500'
                                                        : 'bg-slate-900 border-slate-800 hover:bg-slate-800 text-slate-400'
                                                        }`}
                                                >
                                                    {mode === 'NONE' ? 'No Discount' : mode === 'PERCENT' ? 'Percentage %' : 'Flat Cash'}
                                                </button>
                                            ))}
                                        </div>

                                        {overallDiscountType !== 'NONE' && (
                                            <div className="flex items-center justify-between gap-3 mt-2 pt-2 border-t border-slate-900">
                                                <span className="text-xs text-slate-400 font-bold">
                                                    {overallDiscountType === 'PERCENT' ? 'Enter Percentage' : 'Enter Dues Reduction (रु)'}
                                                </span>
                                                <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-800 rounded-lg py-1 px-2.5">
                                                    <input
                                                        type="number"
                                                        min="0"
                                                        value={overallDiscountValue}
                                                        onChange={(e) => setOverallDiscountValue(Number(e.target.value))}
                                                        className="w-16 bg-transparent text-right text-sm font-bold text-slate-105 focus:outline-none"
                                                    />
                                                    <span className="text-xs text-slate-400 font-bold">
                                                        {overallDiscountType === 'PERCENT' ? '%' : 'रु'}
                                                    </span>
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    {/* Arithmetic Breakdown */}
                                    <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-850 text-xs space-y-1.5 self-center">
                                        <div className="flex justify-between items-center text-slate-400">
                                            <span>Estimate subtotal:</span>
                                            <span className="font-semibold text-slate-200">रु {totals.subtotal.toLocaleString()}</span>
                                        </div>
                                        {totals.discount > 0 && (
                                            <div className="flex justify-between items-center text-rose-400 font-medium">
                                                <span>Overall Discount applied:</span>
                                                <span>- रु {totals.discount.toLocaleString()}</span>
                                            </div>
                                        )}
                                        <div className="flex justify-between items-center pt-2 border-t border-slate-900 text-sm font-extrabold text-amber-500">
                                            <span>Estimated Payee Total:</span>
                                            <span>रु {totals.netPayable.toLocaleString()}</span>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Share / Export Utility Controls */}
                            {items.length > 0 && (
                                <div className="flex flex-col sm:flex-row gap-3 pt-3 border-t border-slate-850 animate-in fade-in duration-300">
                                    <button
                                        onClick={handleSharePDF}
                                        disabled={sharingLoading}
                                        className="flex-grow py-3 px-4 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white font-extrabold text-xs uppercase rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-blue-500/15 hover:shadow-blue-500/25 cursor-pointer disabled:opacity-50 transition-all duration-300 hover:-translate-y-0.5 active:scale-95 font-outfit"
                                    >
                                        <Send className="h-4 w-4 text-white" /> {sharingLoading ? 'Generating PDF...' : 'Share PDF to WhatsApp'}
                                    </button>
                                    <div className="grid grid-cols-4 gap-2 flex-grow sm:flex-grow-0">
                                        <button
                                            onClick={handleSendWhatsApp}
                                            title="Send plain text quotation via WhatsApp"
                                            className="group py-3 px-4 bg-white border border-blue-200 hover:border-blue-400 text-blue-600 hover:text-blue-700 hover:bg-blue-50/30 rounded-xl flex items-center justify-center gap-1.5 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-sm active:scale-95 text-xs font-bold font-outfit shadow-sm"
                                        >
                                            <Send className="h-4 w-4 text-blue-500 group-hover:text-blue-600 transition-colors" /> WhatsApp Text
                                        </button>
                                        <button
                                            onClick={handleCopyClipboard}
                                            title="Copy to clipboard"
                                            className="group py-3 px-4 bg-white border border-blue-200 hover:border-blue-400 text-blue-600 hover:text-blue-700 hover:bg-blue-50/30 rounded-xl flex items-center justify-center gap-1.5 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-sm active:scale-95 text-xs font-bold"
                                        >
                                            <Copy className="h-4 w-4 text-blue-500 group-hover:text-blue-600 transition-colors" /> Copy Text
                                        </button>
                                        <button
                                            onClick={handlePrint}
                                            title="Print / Save PDF"
                                            className="group py-3 px-4 bg-white border border-blue-200 hover:border-blue-400 text-blue-600 hover:text-blue-700 hover:bg-blue-50/30 rounded-xl flex items-center justify-center gap-1.5 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-sm active:scale-95 text-xs font-bold"
                                        >
                                            <Printer className="h-4 w-4 text-blue-500 group-hover:text-blue-600 transition-colors" /> Print PDF
                                        </button>
                                        <button
                                            onClick={handleDownloadCSV}
                                            title="Export as CSV/Excel"
                                            className="group py-3 px-4 bg-white border border-blue-200 hover:border-blue-400 text-blue-600 hover:text-blue-700 hover:bg-blue-50/30 rounded-xl flex items-center justify-center gap-1.5 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-sm active:scale-95 text-xs font-bold"
                                        >
                                            <Download className="h-4 w-4 text-blue-500 group-hover:text-blue-600 transition-colors" /> Excel
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* ─── INVOICE PREVIEW SHEET (FOR NATIVE PRINTING OR VISUAL SCREENSHOTS) ─── */}
                    <div
                        id="print-invoice-sheet"
                        ref={printAreaRef}
                        className="hidden print:block bg-white text-black p-10 rounded-none shadow-none max-w-4xl mx-auto font-sans"
                    >
                        {/* Header Section */}
                        <div className="flex justify-between items-end pb-6 border-b-2 border-blue-600 mb-6 relative">
                            <div className="flex-grow">
                                <div className="flex items-center gap-2 mb-2">
                                    <div className="h-6 w-6 rounded flex items-center justify-center bg-blue-600 text-white shadow-sm">
                                        <Calculator size={14} />
                                    </div>
                                    <h2 className="text-base font-black uppercase tracking-widest text-[#1e293b] leading-tight">TEJAS IMPEX PVT. LTD.</h2>
                                </div>
                                <p className="text-[9px] text-[#64748b] mt-0.5">Teku, Kathmandu, Nepal</p>
                            </div>

                            <div className="text-right">
                                <h2 className="text-2xl font-black text-blue-600 uppercase tracking-widest leading-none mb-2">Quotation</h2>
                                <div className="inline-block text-left text-[11px] text-neutral-700 space-y-0.5">
                                    <div className="flex justify-between gap-4"><span className="text-neutral-400 font-bold">DATE:</span> <span className="font-mono">{new Date().toLocaleDateString('en-IN')}</span></div>
                                    <div className="flex justify-between gap-4"><span className="text-neutral-400 font-bold">CURRENCY:</span> <span className="font-mono">NPR (रु)</span></div>
                                </div>
                            </div>
                        </div>

                        {/* Customer billing summary */}
                        <div className="flex justify-between items-start p-4 rounded bg-neutral-50 border border-neutral-200 mb-8">
                            <div>
                                <span className="text-[9px] font-bold uppercase tracking-widest text-neutral-400 block mb-1">Prepared For</span>
                                <span className="font-black text-neutral-900 block text-base">{getPartyName()}</span>
                                {selectedParty?.city && (
                                    <span className="text-sm font-semibold text-neutral-600 block">{selectedParty.city}</span>
                                )}
                            </div>
                            <div className="text-right flex flex-col items-end text-xs">
                                {selectedParty?.party_code && (
                                    <div className="flex gap-2"><span className="text-neutral-400 font-bold">PARTY CODE:</span> <span className="font-mono font-bold">{selectedParty.party_code}</span></div>
                                )}
                                {selectedParty?.contact_number && (
                                    <div className="flex gap-2 mt-0.5"><span className="text-neutral-400 font-bold">PHONE:</span> <span className="font-mono">{selectedParty.contact_number}</span></div>
                                )}
                            </div>
                        </div>

                        {/* Table item lines */}
                        <div className="min-h-[350px]">
                            <table className="w-full text-left text-xs mb-8">
                                <thead>
                                    <tr className="bg-blue-600 text-white font-bold uppercase tracking-wider text-[10px]">
                                        <th className="py-2.5 px-3 rounded-tl-lg">S.N</th>
                                        <th className="py-2.5 px-3">Item Description</th>
                                        <th className="py-2.5 px-3 text-center">Qty</th>
                                        <th className="py-2.5 px-3 text-right">Rate</th>
                                        <th className="py-2.5 px-3 text-center">Disc</th>
                                        <th className="py-2.5 px-3 rounded-tr-lg text-right">Amount</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-neutral-200 border-b border-neutral-200 font-medium">
                                    {items.map((it, idx) => {
                                        const lineSub = it.quantity * it.unitPrice
                                        const lineTotal = lineSub * (1 - it.discountPct / 100)
                                        return (
                                            <tr key={it.product.id} className="text-[11px]">
                                                <td className="py-3 px-3 w-[5%]">{idx + 1}</td>
                                                <td className="py-3 px-3 w-[45%]">
                                                    <div className="flex items-center gap-3">
                                                        {it.product.image_url && (
                                                            <div className="h-10 w-10 shrink-0 rounded border border-neutral-200 bg-white flex items-center justify-center p-0.5 overflow-hidden">
                                                                <img
                                                                    src={it.product.image_url}
                                                                    alt={it.product.product_name}
                                                                    className="h-full w-full object-contain pointer-events-none"
                                                                    crossOrigin="anonymous"
                                                                    onError={(e) => {
                                                                        e.currentTarget.style.display = 'none';
                                                                    }}
                                                                />
                                                            </div>
                                                        )}
                                                        <div>
                                                            <span className="font-bold text-neutral-900 text-[12px]">{it.product.product_name}</span>
                                                            <div className="flex items-center gap-2 mt-0.5 text-[9px]">
                                                                {it.product.ref_code && <span className="font-mono text-neutral-500">Ref: {it.product.ref_code}</span>}
                                                                {it.product.company && <span className="font-bold text-neutral-400 uppercase">[{it.product.company}]</span>}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="py-3 px-3 text-center w-[10%]">
                                                    <span className="font-mono font-bold text-xs">{it.quantity}</span>
                                                    <span className="text-[9px] text-neutral-500 block">{it.product.unit}</span>
                                                </td>
                                                <td className="py-3 px-3 text-right font-mono w-[15%]">
                                                    रु {it.unitPrice.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                                </td>
                                                <td className="py-3 px-3 text-center w-[10%]">
                                                    {it.discountPct > 0 ? <span className="bg-neutral-100 rounded px-1.5 py-0.5 text-neutral-600 border border-neutral-200">{it.discountPct}%</span> : <span className="text-neutral-400">-</span>}
                                                </td>
                                                <td className="py-3 px-3 text-right font-mono font-bold text-neutral-900 w-[15%]">
                                                    रु {lineTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                                </td>
                                            </tr>
                                        )
                                    })}
                                </tbody>
                            </table>
                        </div>

                        {/* Sum totals math */}
                        <div className="flex justify-end pt-2 mb-12">
                            <div className="w-72 bg-neutral-50 rounded-lg p-4 border border-neutral-200 text-xs shadow-sm">
                                <div className="flex justify-between items-center text-neutral-600 pb-2 border-b border-neutral-200/60 mb-2">
                                    <span className="font-bold uppercase tracking-wide text-[10px]">Gross Subtotal</span>
                                    <span className="font-mono font-bold">रु {totals.subtotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                                </div>
                                {totals.discount > 0 && (
                                    <div className="flex justify-between items-center text-rose-600 pb-2 border-b border-neutral-200/60 mb-2">
                                        <span className="font-bold uppercase tracking-wide text-[10px]">Total Discount</span>
                                        <span className="font-mono font-bold">- रु {totals.discount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                                    </div>
                                )}
                                <div className="flex justify-between items-center pt-1 font-black text-lg text-blue-600">
                                    <span className="font-bold uppercase tracking-widest text-xs text-neutral-800">Grand Total</span>
                                    <span className="font-mono">रु {totals.netPayable.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                                </div>
                            </div>
                        </div>

                        {/* Signature & Disclaimer note */}
                        <div className="grid grid-cols-2 gap-8 text-[9px] text-neutral-500 border-t-2 border-dashed border-neutral-300 pt-6">
                            <div>
                                <p className="font-black uppercase tracking-widest text-neutral-800 mb-2">Terms & Conditions</p>
                                <ul className="list-disc list-inside space-y-1 text-neutral-600 text-[10px] leading-relaxed">
                                    <li>This is a computer-generated price quotation estimate.</li>
                                    <li>Prices strictly valid for <strong className="text-neutral-800">7 calendar days</strong> from the quotation date.</li>
                                    <li>Actual billing may vary based on verified stock availability at dispatch.</li>
                                </ul>
                            </div>
                            <div className="flex flex-col items-end justify-end">
                                <div className="w-40 border-b border-neutral-800 mb-2"></div>
                                <p className="font-bold uppercase tracking-widest text-neutral-800 text-[10px]">Authorized Signature</p>
                                <p className="font-mono text-[9px] text-neutral-400 mt-1">TEJAS IMPEX (KTM)</p>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Product Detail Modal/Drawer Overlay (Amazon Style) */}
            {selectedDetailProduct && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-md">
                    <div className="relative w-full max-w-2xl rounded-3xl border border-slate-800 bg-slate-900/90 p-6 shadow-2xl backdrop-blur-xl max-h-[90vh] overflow-y-auto animate-in fade-in zoom-in-95 duration-200">
                        <button
                            onClick={() => setSelectedDetailProduct(null)}
                            className="absolute right-4 top-4 rounded-xl bg-slate-955/80 p-2 text-slate-400 hover:text-white border border-slate-800 transition-colors"
                        >
                            <X className="h-5 w-5" />
                        </button>

                        <div className="grid gap-6 md:grid-cols-2 mt-4 text-slate-205">
                            {/* Visual Asset Container */}
                            <div className="relative aspect-square w-full rounded-2xl bg-slate-950/80 border border-slate-850 flex items-center justify-center p-6">
                                {selectedDetailProduct.image_url ? (
                                    <img
                                        src={selectedDetailProduct.image_url}
                                        alt={selectedDetailProduct.product_name}
                                        className="max-h-full max-w-full object-contain animate-in fade-in duration-300"
                                        onError={(e) => {
                                            e.currentTarget.style.display = 'none'
                                        }}
                                    />
                                ) : null}
                                <div className="flex flex-col items-center justify-center text-slate-600">
                                    <Package className="h-16 w-16 text-slate-700 mb-2" />
                                    <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-500 animate-pulse">No Image Available</span>
                                </div>
                            </div>

                            {/* Detail Specs Frame */}
                            <div className="flex flex-col justify-between space-y-4">
                                <div>
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className="text-[9px] font-bold uppercase tracking-wider py-0.5 px-2.5 rounded-full bg-slate-850 text-amber-500 border border-slate-800">
                                            {selectedDetailProduct.company || 'Generic'}
                                        </span>
                                        {selectedDetailProduct.ref_code && (
                                            <span className="text-xs font-mono font-extrabold py-1 px-3 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
                                                Ref No: {selectedDetailProduct.ref_code}
                                            </span>
                                        )}
                                    </div>

                                    <h2 className="mt-3 text-xl font-extrabold text-slate-200 tracking-tight leading-snug">{selectedDetailProduct.product_name}</h2>
                                    <p className="text-xs text-slate-400 font-semibold mt-1">
                                        Category: {selectedDetailProduct.category} {selectedDetailProduct.sub_category ? `• ${selectedDetailProduct.sub_category}` : ''}
                                    </p>
                                </div>

                                {/* MRP card */}
                                <div className="rounded-xl border border-slate-850 bg-slate-950/60 p-4">
                                    <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest block font-mono">Maximum Retail Price</span>
                                    <div className="flex items-baseline gap-1 mt-1">
                                        <span className="text-2xl font-black text-amber-500">
                                            {selectedDetailProduct.mrp ? `रु ${selectedDetailProduct.mrp.toLocaleString('en-NP', { minimumFractionDigits: 2 })}` : 'N/A'}
                                        </span>
                                        <span className="text-xs text-slate-500 font-semibold">/ {selectedDetailProduct.unit || 'pcs'}</span>
                                    </div>
                                </div>

                                <div className="rounded-xl bg-slate-950/30 border border-slate-850 p-3">
                                    <span className="text-[8px] font-bold text-slate-500 uppercase tracking-wide block">Order Unit</span>
                                    <span className="text-sm font-semibold text-slate-350 mt-0.5 block">
                                        {selectedDetailProduct.unit || 'pcs'}
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* Packaging rules & series tables */}
                        <div className="mt-6 space-y-4">
                            {selectedDetailProduct.specification && (
                                <div className="rounded-xl bg-slate-950/30 border border-slate-850 p-4">
                                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Technical Description & Specs</h4>
                                    <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-line bg-slate-955/45 p-3 rounded-lg border border-slate-850">
                                        {selectedDetailProduct.specification}
                                    </p>
                                </div>
                            )}

                            {/* Standard Packaging Rules Grid */}
                            <div className="rounded-xl border border-slate-850 bg-slate-950/40 p-4">
                                <h4 className="text-xs font-bold text-slate-450 uppercase tracking-wider mb-3">Logistic Packaging Configurations</h4>
                                <div className="grid grid-cols-3 gap-4 text-center">
                                    <div className="border-r border-slate-850">
                                        <span className="text-[9px] font-bold text-slate-500 uppercase block">Pcs / Packet</span>
                                        <span className="text-lg font-extrabold text-slate-200 mt-1 block">
                                            {selectedDetailProduct.packing_pcs || '—'}
                                        </span>
                                    </div>
                                    <div className="border-r border-slate-850">
                                        <span className="text-[9px] font-bold text-slate-500 uppercase block">Pcs / Box</span>
                                        <span className="text-lg font-extrabold text-slate-200 mt-1 block">
                                            {selectedDetailProduct.packing_bx || '—'}
                                        </span>
                                    </div>
                                    <div>
                                        <span className="text-[9px] font-bold text-slate-500 uppercase block">Pcs / Carton</span>
                                        <span className="text-lg font-extrabold text-slate-200 mt-1 block">
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
export default Quotations
