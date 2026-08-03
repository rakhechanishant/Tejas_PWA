import React, { useEffect, useState, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { Search, AlertCircle, RefreshCw, Layers, X } from 'lucide-react'

interface Product {
    id: number
    ref_code: string | null
    product_name: string
    category: string | null
    sub_category: string | null
    specification: string | null
    mrp: number | null
    packing_pcs: number | null
    packing_bx: number | null
    packing_car: number | null
    series: string | null
    company: string | null
    image_url: string | null
    unit: string
    is_active: boolean
}

export const Products: React.FC = () => {
    const [products, setProducts] = useState<Product[]>([])
    const [loading, setLoading] = useState(true)
    const [errorMsg, setErrorMsg] = useState('')

    // Search and filter states
    const [searchQuery, setSearchQuery] = useState('')
    const [selectedCompany, setSelectedCompany] = useState('ALL')
    const [selectedCategory, setSelectedCategory] = useState('ALL')


    // Pagination and Detail states
    const [currentPage, setCurrentPage] = useState(1)
    const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)

    useEffect(() => {
        fetchProducts()
    }, [])

    const fetchProducts = async () => {
        setLoading(true)
        setErrorMsg('')
        try {
            const { data, error } = await supabase
                .from('products')
                .select('*')
                .order('product_name', { ascending: true })

            if (error) {
                throw error
            }
            setProducts(data || [])
        } catch (err: any) {
            console.error('Error fetching products:', err)
            setErrorMsg(err.message || 'Failed to load catalog products.')
        } finally {
            setLoading(false)
        }
    }

    // Get distinct companies and categories for dropdown selections
    const companies = useMemo(() => {
        const list = products
            .map(p => p.company)
            .filter((c): c is string => !!c)
        return ['ALL', ...Array.from(new Set(list))]
    }, [products])

    const categories = useMemo(() => {
        const list = products
            .map(p => p.category)
            .filter((c): c is string => !!c)
        return ['ALL', ...Array.from(new Set(list))]
    }, [products])

    // Real-time filtering based on state inputs
    const filteredProducts = useMemo(() => {
        const query = searchQuery.trim().toLowerCase()

        return products.filter((p) => {
            // 1. Search Query Filter (dynamic on keystroke)
            if (query) {
                const matchesName = p.product_name?.toLowerCase().includes(query)
                const matchesRef = p.ref_code?.toLowerCase().includes(query)
                const matchesCat = p.category?.toLowerCase().includes(query)
                const matchesSubCat = p.sub_category?.toLowerCase().includes(query)
                const matchesSpec = p.specification?.toLowerCase().includes(query)

                if (!matchesName && !matchesRef && !matchesCat && !matchesSubCat && !matchesSpec) {
                    return false
                }
            }

            // 2. Company/Brand Filter
            if (selectedCompany !== 'ALL' && p.company !== selectedCompany) {
                return false
            }

            // 3. Category Filter
            if (selectedCategory !== 'ALL' && p.category !== selectedCategory) {
                return false
            }

            return true
        })
    }, [products, searchQuery, selectedCompany, selectedCategory])

    // Reset pagination to page 1 when search or filter states change
    useEffect(() => {
        setCurrentPage(1)
    }, [searchQuery, selectedCompany, selectedCategory])

    const ITEMS_PER_PAGE = 18
    const totalPages = Math.ceil(filteredProducts.length / ITEMS_PER_PAGE)
    const paginatedProducts = useMemo(() => {
        const start = (currentPage - 1) * ITEMS_PER_PAGE
        return filteredProducts.slice(start, start + ITEMS_PER_PAGE)
    }, [filteredProducts, currentPage])

    return (
        <div className="space-y-6">
            {/* Top Title Bar */}
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h1 className="text-3xl font-extrabold tracking-tight text-white font-outfit">Products Catalog</h1>
                    <p className="text-sm text-slate-400">Manage store inventory, check stock alerts, and inspect specification sheets.</p>
                </div>
                <button
                    onClick={fetchProducts}
                    title="Reload Catalog"
                    className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900 border border-slate-800 hover:bg-slate-800 transition-colors text-slate-400 hover:text-white self-start sm:self-center"
                >
                    <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                </button>
            </div>

            {/* Filter and Search Layout Control */}
            <div className="rounded-2xl border border-slate-800/80 bg-slate-900/40 p-4 sm:p-6 backdrop-blur-md space-y-4">
                {/* Dynamic Search Input */}
                <div className="relative">
                    <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                        <Search className="h-5 w-5 text-slate-500" />
                    </div>
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search by name, ref code, specs, category..."
                        className="block w-full rounded-xl border border-slate-800 bg-slate-950/80 py-3 pr-4 pl-10 text-white placeholder-slate-500 transition-colors focus:border-amber-500 focus:ring-1 focus:ring-amber-500 focus:outline-none"
                    />
                    {searchQuery && (
                        <button
                            onClick={() => setSearchQuery('')}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-500 hover:text-slate-200"
                        >
                            Clear
                        </button>
                    )}
                </div>

                {/* Dropdowns Row */}
                <div className="grid gap-3 grid-cols-1 md:grid-cols-2">
                    {/* Company */}
                    <div className="space-y-1.5">
                        <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Brand / Company</label>
                        <select
                            value={selectedCompany}
                            onChange={(e) => setSelectedCompany(e.target.value)}
                            className="block w-full rounded-xl border border-slate-800 bg-slate-950 py-2.5 px-3 text-xs text-white focus:border-amber-500 focus:outline-none"
                        >
                            {companies.map((c) => (
                                <option key={c} value={c}>{c === 'ALL' ? 'All Brands' : c}</option>
                            ))}
                        </select>
                    </div>

                    {/* Category */}
                    <div className="space-y-1.5">
                        <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Category</label>
                        <select
                            value={selectedCategory}
                            onChange={(e) => setSelectedCategory(e.target.value)}
                            className="block w-full rounded-xl border border-slate-800 bg-slate-950 py-2.5 px-3 text-xs text-white focus:border-amber-500 focus:outline-none"
                        >
                            {categories.map((cat) => (
                                <option key={cat} value={cat}>{cat === 'ALL' ? 'All Categories' : cat}</option>
                            ))}
                        </select>
                    </div>
                </div>
            </div>

            {/* Error State */}
            {errorMsg && (
                <div className="flex items-center gap-3 rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-rose-400 text-sm">
                    <AlertCircle className="h-5 w-5 text-rose-500" />
                    <span>{errorMsg}</span>
                </div>
            )}

            {/* Loading Skeleton */}
            {loading ? (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {[...Array(6)].map((_, i) => (
                        <div key={i} className="animate-pulse rounded-2xl border border-slate-800 bg-slate-900/30 p-5 h-48 space-y-4">
                            <div className="h-4 bg-slate-800 rounded w-1/3"></div>
                            <div className="h-6 bg-slate-800 rounded w-3/4"></div>
                            <div className="space-y-2 pt-2">
                                <div className="h-3 bg-slate-800 rounded w-5/6"></div>
                                <div className="h-3 bg-slate-800 rounded w-1/2"></div>
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <>
                    {/* Empty State */}
                    {filteredProducts.length === 0 ? (
                        <div className="flex flex-col items-center justify-center p-12 text-center rounded-2xl border border-slate-805 bg-slate-900/10">
                            <Layers className="h-12 w-12 text-slate-600 mb-3" />
                            <h3 className="text-lg font-bold text-slate-350">No products found</h3>
                            <p className="text-xs text-slate-500 max-w-sm mt-1">Try tweaking your search term or filter parameters above to view other records.</p>
                        </div>
                    ) : (
                        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                            {paginatedProducts.map((p) => {
                                return (
                                    <div
                                        key={p.id}
                                        onClick={() => setSelectedProduct(p)}
                                        className="group relative rounded-2xl glass-card p-5 hover:scale-[1.01] transition-all flex flex-col justify-between cursor-pointer"
                                    >
                                        <div>
                                            {/* Product Image Display */}
                                            <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-slate-950/60 border border-slate-850 flex items-center justify-center mb-4">
                                                {p.image_url ? (
                                                    <img
                                                        src={p.image_url}
                                                        alt={p.product_name}
                                                        className="h-full w-full object-contain transition-transform duration-300 group-hover:scale-105"
                                                        loading="lazy"
                                                        onError={(e) => {
                                                            e.currentTarget.style.display = 'none'
                                                            const fallback = e.currentTarget.parentElement?.querySelector('.fallback-icon')
                                                            if (fallback) fallback.classList.remove('hidden')
                                                        }}
                                                    />
                                                ) : null}
                                                <div className={`fallback-icon flex flex-col items-center justify-center text-slate-600 ${p.image_url ? 'hidden' : ''}`}>
                                                    <Layers className="h-7 w-7 text-slate-700 mb-1" />
                                                    <span className="text-[8px] font-mono font-bold uppercase tracking-wider text-slate-500">No Image</span>
                                                </div>
                                            </div>

                                            {/* Company & Code row */}
                                            <div className="flex items-center justify-between gap-2">
                                                <span className="text-[9px] font-bold uppercase tracking-wider py-0.5 px-2.5 rounded-full bg-slate-850 text-slate-400">
                                                    {p.company || 'Generic'}
                                                </span>
                                                {p.ref_code && (
                                                    <span className="text-xs font-mono font-bold text-amber-500 bg-slate-950/60 px-2 py-0.5 rounded-lg border border-slate-850">
                                                        {p.ref_code}
                                                    </span>
                                                )}
                                            </div>

                                            {/* Product Name */}
                                            <h3 className="mt-3 text-sm font-bold text-slate-100 group-hover:text-white transition-colors leading-snug">
                                                {p.product_name}
                                            </h3>

                                            {/* Sub-category / details */}
                                            <div className="mt-1 flex items-center gap-1.5 text-xs text-slate-500 font-medium">
                                                <span>{p.category}</span>
                                                {p.sub_category && (
                                                    <>
                                                        <span className="h-1 w-1 rounded-full bg-slate-700"></span>
                                                        <span>{p.sub_category}</span>
                                                    </>
                                                )}
                                            </div>

                                            {/* Specification Sheet */}
                                            {p.specification && (
                                                <p className="mt-2 text-xs text-slate-400 line-clamp-2 leading-relaxed italic">
                                                    "{p.specification}"
                                                </p>
                                            )}
                                        </div>

                                        {/* Footer price row */}
                                        <div className="mt-5 pt-4 border-t border-slate-850 flex items-center justify-between">
                                            {/* Price box */}
                                            <div>
                                                <span className="block text-[9px] font-semibold text-slate-500 uppercase tracking-wider">price (mrp)</span>
                                                <span className="text-base font-extrabold text-amber-500">
                                                    {p.mrp ? `रु ${p.mrp.toLocaleString('en-NP', { minimumFractionDigits: 2 })}` : 'N/A'}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    )}

                    {/* Pagination Selector Bar */}
                    {totalPages > 1 && (
                        <div className="mt-8 flex flex-wrap items-center justify-center gap-2 border-t border-slate-900 pt-6">
                            <button
                                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                                disabled={currentPage === 1}
                                className="flex h-9 items-center justify-center rounded-xl bg-slate-900 border border-slate-800 px-4 text-xs font-medium text-slate-300 hover:bg-slate-850 hover:text-white disabled:opacity-50 disabled:hover:bg-slate-900 disabled:hover:text-slate-350 transition-colors"
                            >
                                Previous
                            </button>
                            {[...Array(totalPages)].map((_, idx) => {
                                const pageNum = idx + 1
                                return (
                                    <button
                                        key={pageNum}
                                        onClick={() => setCurrentPage(pageNum)}
                                        className={`flex h-9 w-9 items-center justify-center rounded-xl text-xs font-bold transition-all ${currentPage === pageNum
                                            ? 'bg-amber-500 text-white shadow-md shadow-amber-500/10'
                                            : 'bg-slate-905 border border-slate-855 text-slate-400 hover:bg-slate-800 hover:text-white'
                                            }`}
                                    >
                                        {pageNum}
                                    </button>
                                )
                            })}
                            <button
                                onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                                disabled={currentPage === totalPages}
                                className="flex h-9 items-center justify-center rounded-xl bg-slate-900 border border-slate-800 px-4 text-xs font-medium text-slate-300 hover:bg-slate-850 hover:text-white disabled:opacity-50 disabled:hover:bg-slate-900 disabled:hover:text-slate-350 transition-colors"
                            >
                                Next
                            </button>
                        </div>
                    )}
                </>
            )}

            {/* Product Detail Modal/Drawer Overlay (Amazon Style) */}
            {selectedProduct && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-md">
                    <div className="relative w-full max-w-2xl rounded-3xl border border-slate-800 bg-slate-905 bg-slate-900/90 p-6 shadow-2xl backdrop-blur-xl max-h-[90vh] overflow-y-auto">
                        <button
                            onClick={() => setSelectedProduct(null)}
                            className="absolute right-4 top-4 rounded-xl bg-slate-950/80 p-2 text-slate-400 hover:text-white border border-slate-800 transition-colors"
                        >
                            <X className="h-5 w-5" />
                        </button>

                        <div className="grid gap-6 md:grid-cols-2 mt-4">
                            {/* Visual Asset Container */}
                            <div className="relative aspect-square w-full rounded-2xl bg-slate-950/80 border border-slate-850 flex items-center justify-center p-6">
                                {selectedProduct.image_url ? (
                                    <img
                                        src={selectedProduct.image_url}
                                        alt={selectedProduct.product_name}
                                        className="max-h-full max-w-full object-contain"
                                        onError={(e) => {
                                            e.currentTarget.style.display = 'none'
                                            const fallback = e.currentTarget.parentElement?.querySelector('.modal-fallback')
                                            if (fallback) fallback.classList.remove('hidden')
                                        }}
                                    />
                                ) : null}
                                <div className={`modal-fallback flex flex-col items-center justify-center text-slate-600 ${selectedProduct.image_url ? 'hidden' : ''}`}>
                                    <Layers className="h-16 w-16 text-slate-705 mb-2" />
                                    <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-500">No Image Available</span>
                                </div>
                            </div>

                            {/* Detail Specs Frame */}
                            <div className="flex flex-col justify-between space-y-4">
                                <div>
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className="text-[9px] font-bold uppercase tracking-wider py-0.5 px-2.5 rounded-full bg-slate-800 text-amber-500 border border-slate-750">
                                            {selectedProduct.company || 'Generic'}
                                        </span>
                                        {selectedProduct.ref_code && (
                                            <span className="text-xs font-mono font-extrabold py-1 px-3 rounded-xl bg-amber-505/10 text-amber-400 border border-amber-550/20">
                                                Ref No: {selectedProduct.ref_code}
                                            </span>
                                        )}
                                    </div>

                                    <h2 className="mt-3 text-xl font-extrabold text-slate-200 tracking-tight leading-snug">{selectedProduct.product_name}</h2>
                                    <p className="text-xs text-slate-400 font-semibold mt-1">
                                        Category: {selectedProduct.category} {selectedProduct.sub_category ? `• ${selectedProduct.sub_category}` : ''}
                                    </p>
                                </div>

                                {/* MRP card */}
                                <div className="rounded-xl border border-slate-850 bg-slate-950/60 p-4">
                                    <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest block">Maximum Retail Price</span>
                                    <div className="flex items-baseline gap-1 mt-1">
                                        <span className="text-2xl font-black text-amber-505">
                                            {selectedProduct.mrp ? `रु ${selectedProduct.mrp.toLocaleString('en-NP', { minimumFractionDigits: 2 })}` : 'N/A'}
                                        </span>
                                        <span className="text-xs text-slate-500 font-semibold">/ {selectedProduct.unit || 'pcs'}</span>
                                    </div>
                                </div>


                            </div>
                        </div>

                        {/* Packaging rules & series tables */}
                        <div className="mt-6 space-y-4">
                            {selectedProduct.specification && (
                                <div className="rounded-xl bg-slate-950/30 border border-slate-850 p-4">
                                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Technical Description & Specs</h4>
                                    <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-line bg-slate-950/45 p-3 rounded-lg border border-slate-850">
                                        {selectedProduct.specification}
                                    </p>
                                </div>
                            )}

                            {/* Standard Packaging Rules Grid */}
                            <div className="rounded-xl border border-slate-850 bg-slate-950/40 p-4">
                                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Logistic Packaging Configurations</h4>
                                <div className="grid grid-cols-3 gap-4 text-center">
                                    <div className="border-r border-slate-850">
                                        <span className="text-[9px] font-bold text-slate-550 uppercase block">Pcs / Packet</span>
                                        <span className="text-lg font-extrabold text-slate-200 mt-1 block">
                                            {selectedProduct.packing_pcs || '—'}
                                        </span>
                                    </div>
                                    <div className="border-r border-slate-850">
                                        <span className="text-[9px] font-bold text-slate-550 uppercase block">Pcs / Box</span>
                                        <span className="text-lg font-extrabold text-slate-200 mt-1 block">
                                            {selectedProduct.packing_bx || '—'}
                                        </span>
                                    </div>
                                    <div>
                                        <span className="text-[9px] font-bold text-slate-550 uppercase block">Pcs / Carton</span>
                                        <span className="text-lg font-extrabold text-slate-200 mt-1 block">
                                            {selectedProduct.packing_car || '—'}
                                        </span>
                                    </div>
                                </div>

                                {/* Wholesale Logistics Estimations */}
                                {(selectedProduct.mrp && (selectedProduct.packing_bx || selectedProduct.packing_car)) && (
                                    <div className="mt-4 pt-4 border-t border-slate-850/60 grid grid-cols-2 gap-4 text-xs">
                                        {selectedProduct.packing_bx && (
                                            <div className="flex justify-between items-center text-slate-405">
                                                <span>Est. Box Value:</span>
                                                <span className="font-bold text-slate-200">
                                                    रु {(selectedProduct.mrp * selectedProduct.packing_bx).toLocaleString('en-NP', { minimumFractionDigits: 2 })}
                                                </span>
                                            </div>
                                        )}
                                        {selectedProduct.packing_car && (
                                            <div className="flex justify-between items-center text-slate-405">
                                                <span>Est. Carton Value:</span>
                                                <span className="font-bold text-slate-205">
                                                    रु {(selectedProduct.mrp * selectedProduct.packing_car).toLocaleString('en-NP', { minimumFractionDigits: 2 })}
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* Additional Attributes Info */}
                            {selectedProduct.series && (
                                <div className="flex justify-between items-center bg-slate-950/20 p-3 rounded-xl border border-slate-850 text-xs">
                                    <span className="font-bold text-slate-500 uppercase tracking-wider text-[9px]">Product Line / Series</span>
                                    <span className="font-semibold text-slate-300">{selectedProduct.series}</span>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
