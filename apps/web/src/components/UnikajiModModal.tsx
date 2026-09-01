import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { X, Search, Plus, Trash2, Save, AlertCircle, Info, ShoppingCart } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

interface UnikajiModModalProps {
    order: any;
    onClose: () => void;
    onSaved: () => void;
}

export const UnikajiModModal: React.FC<UnikajiModModalProps> = ({ order, onClose, onSaved }) => {
    const { profile } = useAuth();

    const [modifiedItems, setModifiedItems] = useState<any[]>([]);
    const [products, setProducts] = useState<any[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    // Discount States
    const [discountType, setDiscountType] = useState<'NONE' | 'PRODUCT' | 'OVERALL'>('NONE');
    const [overallDiscountPct, setOverallDiscountPct] = useState<number>(0);
    const [selectedDetailProduct, setSelectedDetailProduct] = useState<any | null>(null);

    useEffect(() => {
        fetchProducts();
    }, []);

    useEffect(() => {
        if (order && order.order_items && products.length > 0) {
            // Parse discount from notes
            let initDiscType: 'NONE' | 'PRODUCT' | 'OVERALL' = 'NONE';
            let initOverallPct = 0;
            let initItemDiscs: Record<number, number> = {};

            if (order.notes) {
                try {
                    const match = order.notes.match(/\|\|DISCOUNTS:(.*?)\|\|/);
                    if (match) {
                        const d = JSON.parse(match[1]);
                        initDiscType = d.type || 'NONE';
                        initOverallPct = d.overallPct || 0;
                        initItemDiscs = d.items || {};
                    }
                } catch (e) {
                    console.error("Failed to parse discounts from notes", e);
                }
            }

            setDiscountType(initDiscType);
            setOverallDiscountPct(initOverallPct);

            const initialItems = order.order_items.map((oi: any) => {
                const catalogProd = products.find(p => p.id === oi.product_id);
                // We use unit_price as mrp fallback if not in catalog
                const mrp = catalogProd ? (catalogProd.mrp || 0) : (parseFloat(oi.unit_price) || 0);

                return {
                    id: oi.id,
                    product_id: oi.product_id,
                    quantity: oi.quantity,
                    mrp: mrp,
                    discountPct: initItemDiscs[oi.product_id] || 0,
                    product_name: catalogProd?.product_name || oi.products?.product_name || 'Unknown',
                    ref_code: catalogProd?.ref_code || oi.products?.ref_code || '',
                    unit: catalogProd?.unit || oi.products?.unit || 'PCS',
                    image_url: catalogProd?.image_url || oi.products?.image_url,
                    company: catalogProd?.company,
                    category: catalogProd?.category,
                    specification: catalogProd?.specification
                };
            });
            setModifiedItems(initialItems);
        }
    }, [order, products]);

    const fetchProducts = async () => {
        try {
            setLoading(true);
            const { data, error } = await supabase
                .from('products')
                .select('*')
                .eq('is_active', true)
                .order('product_name');
            if (error) throw error;
            setProducts(data || []);
        } catch (err: any) {
            console.error('Failed to load products:', err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleQtyChange = (index: number, newQty: number) => {
        if (newQty < 1) return;
        const newItems = [...modifiedItems];
        newItems[index].quantity = newQty;
        setModifiedItems(newItems);
    };

    const handleDiscountChange = (index: number, newDisc: number) => {
        const newItems = [...modifiedItems];
        newItems[index].discountPct = newDisc;
        setModifiedItems(newItems);
    };

    const handleRemove = (index: number) => {
        const newItems = [...modifiedItems];
        newItems.splice(index, 1);
        setModifiedItems(newItems);
    };

    const handleAddProduct = (product: any) => {
        const existingIndex = modifiedItems.findIndex(i => i.product_id === product.id);
        if (existingIndex >= 0) {
            handleQtyChange(existingIndex, modifiedItems[existingIndex].quantity + 1);
        } else {
            setModifiedItems([...modifiedItems, {
                product_id: product.id,
                quantity: 1,
                mrp: parseFloat(product.mrp) || 0,
                discountPct: 0,
                product_name: product.product_name,
                ref_code: product.ref_code,
                unit: product.unit || 'PCS',
                image_url: product.image_url,
                company: product.company,
                category: product.category,
                specification: product.specification
            }]);
        }
        setSearchQuery('');
    };

    const handleSave = async () => {
        if (modifiedItems.length === 0) {
            alert('Cannot save an empty order. Please add at least one item.');
            return;
        }
        try {
            setSaving(true);

            // Serialize new notes
            let baseNotes = order.notes || '';
            baseNotes = baseNotes.replace(/\|\|DISCOUNTS:.*?\|\|/g, '').trim();

            const discData: any = { type: discountType };
            if (discountType === 'OVERALL') discData.overallPct = overallDiscountPct;
            if (discountType === 'PRODUCT') {
                const map: Record<number, number> = {};
                modifiedItems.forEach(i => { if (i.discountPct > 0) map[i.product_id] = i.discountPct; });
                discData.items = map;
            }
            const newNotes = baseNotes + (baseNotes ? ' ' : '') + `||DISCOUNTS:${JSON.stringify(discData)}||`;

            // Calculate highly precise final unit_prices based on active discounts
            const rpcPayload = modifiedItems.map(item => {
                const price = item.mrp || 0;
                let pct = 0;
                if (discountType === 'PRODUCT') pct = item.discountPct || 0;
                else if (discountType === 'OVERALL') pct = overallDiscountPct || 0;

                const finalUnitPrice = price * (1 - pct / 100);

                return {
                    product_id: item.product_id,
                    quantity: item.quantity,
                    unit_price: Math.round(finalUnitPrice * 100) / 100
                };
            });

            const { error } = await supabase.rpc('modify_unikaji_order', {
                p_order_id: order.id,
                p_modified_by: profile?.id,
                p_items: rpcPayload,
                p_notes: newNotes
            });

            if (error) throw error;
            alert('Order successfully modified!');
            onSaved();
            onClose();
        } catch (err: any) {
            console.error('Save failed:', err);
            alert('Failed to modify order: ' + err.message);
        } finally {
            setSaving(false);
        }
    };

    const filteredProducts = searchQuery
        ? products.filter(p =>
            p.product_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            (p.ref_code && p.ref_code.toLowerCase().includes(searchQuery.toLowerCase()))
        ).slice(0, 50)
        : [];

    // Totals calculations
    const originalTotal = order.total_amount || 0;

    const subtotal = modifiedItems.reduce((acc, item) => acc + (item.quantity * (item.mrp || 0)), 0);
    const itemDiscounts = discountType === 'PRODUCT' ? modifiedItems.reduce((acc, item) => {
        const itemDisc = (item.mrp || 0) * ((item.discountPct || 0) / 100);
        return acc + (item.quantity * itemDisc);
    }, 0) : 0;

    const baseTotal = discountType === 'PRODUCT' ? (subtotal - itemDiscounts) : subtotal;
    const overallDiscount = discountType === 'OVERALL' ? (baseTotal * (overallDiscountPct / 100)) : 0;
    const newTotal = baseTotal - overallDiscount;
    const totalLines = modifiedItems.length;
    const totalQty = modifiedItems.reduce((acc, i) => acc + i.quantity, 0);

    return (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm overflow-y-auto">
            {selectedDetailProduct && (
                <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm transition-all duration-300">
                    <div className="relative w-full max-w-lg bg-white rounded-3xl overflow-hidden shadow-2xl ring-1 ring-slate-900/5 animate-in fade-in zoom-in-95 duration-200">
                        <button
                            onClick={() => setSelectedDetailProduct(null)}
                            className="absolute right-4 top-4 z-10 p-2 bg-white/80 hover:bg-slate-100 rounded-full backdrop-blur transition-all shadow-sm group"
                        >
                            <X className="h-5 w-5 text-slate-500 group-hover:text-neutral-900" />
                        </button>

                        <div className="relative bg-slate-50/80 p-8 flex justify-center items-center overflow-hidden min-h-[250px]">
                            <div className="absolute inset-0 pattern-dots opacity-30 text-slate-300"></div>
                            <div className="absolute inset-0 bg-gradient-to-t from-slate-100/80 to-transparent"></div>
                            <div className="relative z-10 w-full max-w-[280px] aspect-square flex items-center justify-center rounded-2xl bg-white shadow-xl ring-1 ring-slate-900/5 border border-slate-100 overflow-hidden group">
                                {selectedDetailProduct.image_url ? (
                                    <img
                                        src={selectedDetailProduct.image_url}
                                        alt={selectedDetailProduct.product_name}
                                        className="h-full w-full object-contain p-4 group-hover:scale-110 transition-transform duration-500"
                                    />
                                ) : (
                                    <span className="text-xs font-mono text-slate-400 uppercase tracking-widest font-bold">No Image Configured</span>
                                )}
                            </div>
                        </div>

                        <div className="p-6 sm:p-8 bg-white relative">
                            <div className="absolute top-0 right-8 -mt-6">
                                <div className="inline-flex items-center justify-center px-4 py-2 rounded-xl bg-blue-600 text-white font-extrabold text-lg shadow-lg shadow-blue-600/20 ring-4 ring-white">
                                    रु {selectedDetailProduct.mrp ? selectedDetailProduct.mrp.toLocaleString('en-NP', { minimumFractionDigits: 2 }) : 'N/A'}
                                    <span className="text-xs text-blue-200 font-semibold ml-1">/ {selectedDetailProduct.unit || 'pcs'}</span>
                                </div>
                            </div>

                            <div className="flex items-center gap-2 mb-3">
                                <span className="inline-flex items-center rounded-full bg-slate-900 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-white">
                                    {selectedDetailProduct.company || 'Generic'}
                                </span>
                                {selectedDetailProduct.ref_code && (
                                    <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-amber-700 font-mono border border-amber-200">
                                        Ref No: {selectedDetailProduct.ref_code}
                                    </span>
                                )}
                            </div>

                            <h2 className="mt-3 text-xl font-extrabold text-neutral-900 tracking-tight leading-snug">{selectedDetailProduct.product_name}</h2>
                            <p className="mt-2 text-xs text-slate-500 font-medium">
                                Category: <span className="font-bold text-neutral-700">{selectedDetailProduct.category}</span>
                            </p>

                            {selectedDetailProduct.specification && (
                                <div className="mt-6">
                                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Technical Specifications</h3>
                                    <div className="bg-slate-50 rounded-xl p-4 text-sm text-neutral-700 leading-relaxed font-medium border border-slate-100">
                                        {selectedDetailProduct.specification}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            <div className="relative w-full max-w-5xl bg-white rounded-3xl shadow-2xl overflow-hidden border border-slate-200 flex flex-col max-h-[90vh]">
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-neutral-50">
                    <div className="flex items-center gap-3">
                        <div className="bg-fuchsia-500/10 p-2 rounded-xl border border-fuchsia-500/20">
                            <AlertCircle className="h-5 w-5 text-fuchsia-500" />
                        </div>
                        <div>
                            <h2 className="font-bold text-neutral-900 text-lg">Modify Order UNIKAJI</h2>
                            <p className="text-xs font-medium text-neutral-700">Order #{order.order_number} • Party: {order.parties?.Parties_name}</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-neutral-200 rounded-full transition-colors" disabled={saving}>
                        <X className="h-5 w-5 text-neutral-700" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-4 sm:p-6 flex flex-col lg:flex-row gap-6">
                    <div className="flex-1 space-y-4">
                        <div className="space-y-3">
                            <label className="text-xs font-bold uppercase tracking-wider text-neutral-700">Add Product</label>
                            <div className="relative">
                                <Search className="absolute left-3 top-2.5 h-4 w-4 text-neutral-600" />
                                <input
                                    type="text"
                                    placeholder="Search by name or code..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="w-full pl-9 pr-4 py-2 bg-neutral-100 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-fuchsia-500/50"
                                />
                                {searchQuery && (
                                    <div className="absolute z-10 w-full mt-2 bg-white rounded-xl shadow-xl max-h-60 overflow-y-auto border border-slate-200">
                                        {filteredProducts.map(p => (
                                            <button
                                                key={p.id}
                                                onClick={() => handleAddProduct(p)}
                                                className="w-full text-left px-4 py-3 hover:bg-fuchsia-50 flex justify-between items-center transition-colors border-b border-slate-100 last:border-0"
                                            >
                                                <div>
                                                    <div className="text-sm font-medium">{p.product_name}</div>
                                                    <div className="text-xs text-neutral-700 font-mono mt-0.5">{p.ref_code}</div>
                                                </div>
                                                <Plus className="h-4 w-4 text-fuchsia-500" />
                                            </button>
                                        ))}
                                        {filteredProducts.length === 0 && (
                                            <div className="px-4 py-3 text-sm text-neutral-700 text-center">No products found.</div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="space-y-3 flex-1 flex flex-col">
                            <label className="text-xs font-bold uppercase tracking-wider text-neutral-700">Order Items</label>
                            <div className="bg-neutral-50 rounded-2xl border border-slate-200 overflow-x-auto">
                                {loading && modifiedItems.length === 0 ? (
                                    <div className="p-8 text-center text-neutral-600 text-sm animate-pulse">Loading Catalog...</div>
                                ) : (
                                    <div className="divide-y divide-slate-100 max-h-[400px] overflow-y-auto p-3 flex flex-col gap-2">
                                        {modifiedItems.length === 0 ? (
                                            <div className="py-8 text-center text-xs text-slate-500 font-semibold flex flex-col items-center gap-1">
                                                <ShoppingCart className="h-6 w-6 stroke-1 text-neutral-400" />
                                                <span>Cart is empty</span>
                                            </div>
                                        ) : (
                                            modifiedItems.map((item, idx) => (
                                                <div key={idx} className="bg-white border border-slate-200 rounded-xl p-3 flex flex-col gap-2 relative group hover:border-slate-300 transition-colors">
                                                    <div className="flex justify-between items-start">
                                                        <div className="pr-10">
                                                            <div className="flex items-center gap-2">
                                                                <h4 className="font-bold text-sm text-neutral-900">{item.product_name}</h4>
                                                                <Info onClick={() => setSelectedDetailProduct(item)} className="h-4 w-4 text-neutral-500 hover:text-blue-500 cursor-pointer shrink-0" />
                                                            </div>
                                                            <div className="text-xs text-neutral-500 font-mono">{item.ref_code}</div>

                                                            <div className="flex items-center gap-2 mt-2">
                                                                <button onClick={() => handleQtyChange(idx, item.quantity - 1)} className="text-neutral-600 bg-neutral-100 border border-slate-200 rounded px-2 py-0.5 hover:bg-neutral-200 font-bold">-</button>
                                                                <input
                                                                    type="number"
                                                                    min="1"
                                                                    className="w-12 bg-neutral-50 border border-slate-200 text-neutral-900 text-xs font-bold text-center py-1 rounded focus:outline-none focus:border-fuchsia-500"
                                                                    value={item.quantity}
                                                                    onChange={(e) => handleQtyChange(idx, Number(e.target.value) || 1)}
                                                                />
                                                                <button onClick={() => handleQtyChange(idx, item.quantity + 1)} className="text-neutral-600 bg-neutral-100 border border-slate-200 rounded px-2 py-0.5 hover:bg-neutral-200 font-bold">+</button>
                                                                <span className="text-xs text-neutral-500 font-mono font-bold ml-2">× रु {item.mrp?.toLocaleString() || '0'}</span>
                                                                <span className="text-xs text-neutral-400 ml-1">/ {item.unit}</span>
                                                            </div>
                                                        </div>
                                                        <button
                                                            onClick={() => handleRemove(idx)}
                                                            className="absolute right-3 top-3 text-slate-400 hover:text-red-500 p-1 rounded-md hover:bg-red-50 transition-colors"
                                                        >
                                                            <Trash2 className="h-4 w-4" />
                                                        </button>
                                                    </div>

                                                    {discountType === 'PRODUCT' && (
                                                        <div className="flex items-center gap-2 mt-1 bg-fuchsia-50/50 p-2 rounded-lg border border-fuchsia-100 w-max">
                                                            <span className="text-xs text-slate-600 font-bold">Item Disc:</span>
                                                            <input
                                                                type="number"
                                                                min="0"
                                                                max="100"
                                                                value={item.discountPct || 0}
                                                                onChange={(e) => handleDiscountChange(idx, Number(e.target.value))}
                                                                className="w-14 bg-white border border-slate-200 rounded px-2 py-1 text-xs text-neutral-900 text-center font-bold focus:outline-none focus:border-fuchsia-500"
                                                            />
                                                            <span className="text-xs text-slate-500 font-bold">%</span>
                                                        </div>
                                                    )}
                                                </div>
                                            ))
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Summary & Discounts Panel */}
                    <div className="w-full lg:w-80 space-y-4">
                        <div className="bg-neutral-50 border border-slate-200 rounded-2xl p-4">
                            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-3 block">Discount Scheme</h3>
                            <div className="grid grid-cols-3 gap-1 mb-4">
                                {(['NONE', 'PRODUCT', 'OVERALL'] as const).map((type) => (
                                    <button
                                        key={type}
                                        type="button"
                                        onClick={() => setDiscountType(type)}
                                        className={`py-1.5 text-[10px] font-bold rounded-lg border transition-all cursor-pointer ${discountType === type
                                            ? 'bg-fuchsia-100 border-fuchsia-300 text-fuchsia-700'
                                            : 'bg-white border-slate-200 hover:bg-neutral-100 text-neutral-600'
                                            }`}
                                    >
                                        {type === 'NONE' ? 'None' : type === 'PRODUCT' ? 'Item Pct' : 'Overall Pct'}
                                    </button>
                                ))}
                            </div>

                            {discountType === 'OVERALL' && (
                                <div className="flex items-center justify-between gap-2 mb-4 bg-fuchsia-50/50 p-3 rounded-xl border border-fuchsia-100">
                                    <span className="text-xs text-slate-700 font-bold">% Discount Off:</span>
                                    <div className="flex items-center gap-1">
                                        <input
                                            type="number"
                                            min="0"
                                            max="100"
                                            value={overallDiscountPct}
                                            onChange={(e) => setOverallDiscountPct(Number(e.target.value))}
                                            className="w-16 bg-white border border-slate-200 rounded-lg px-2 py-1 text-sm text-neutral-900 text-right font-bold focus:outline-none focus:border-fuchsia-500"
                                        />
                                        <span className="text-sm text-slate-500 font-bold">%</span>
                                    </div>
                                </div>
                            )}

                            <div className="pt-4 border-t border-slate-200 space-y-2 text-xs">
                                <div className="flex justify-between items-center text-slate-600">
                                    <span>Total Positions:</span>
                                    <span className="font-semibold text-neutral-900">{totalLines}</span>
                                </div>
                                <div className="flex justify-between items-center text-slate-600">
                                    <span>Total Quantity:</span>
                                    <span className="font-semibold text-neutral-900">{totalQty}</span>
                                </div>
                                <div className="flex justify-between items-center text-slate-600 mt-2">
                                    <span>Base Subtotal:</span>
                                    <span className="font-semibold text-neutral-900 font-mono font-bold">रु {subtotal.toLocaleString()}</span>
                                </div>

                                {discountType === 'PRODUCT' && itemDiscounts > 0 && (
                                    <div className="flex justify-between items-center text-rose-600 font-bold">
                                        <span>Item Discounts:</span>
                                        <span className="font-semibold text-rose-700 font-mono">- रु {itemDiscounts.toLocaleString()}</span>
                                    </div>
                                )}
                                {discountType === 'OVERALL' && overallDiscount > 0 && (
                                    <div className="flex justify-between items-center text-rose-600 font-bold">
                                        <span>Overall Disc ({overallDiscountPct}%):</span>
                                        <span className="font-semibold text-rose-700 font-mono">- रु {overallDiscount.toLocaleString()}</span>
                                    </div>
                                )}

                                <div className="flex justify-between items-center pt-3 mt-1 border-t border-slate-200 text-base font-black text-fuchsia-600">
                                    <span>Net Payable:</span>
                                    <span className="font-mono">रु {newTotal.toLocaleString()}</span>
                                </div>
                                <div className="flex justify-between items-center text-xs font-semibold text-neutral-500 mt-1">
                                    <span>Original Total:</span>
                                    <span className="font-mono line-through decoration-red-400">रु {originalTotal.toLocaleString()}</span>
                                </div>
                            </div>
                        </div>

                        <div className="flex flex-col gap-2 pt-2">
                            <button
                                onClick={handleSave}
                                disabled={saving || modifiedItems.length === 0}
                                className="w-full flex items-center justify-center gap-2 px-6 py-3 font-bold text-white bg-fuchsia-600 hover:bg-fuchsia-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl transition-all shadow-lg shadow-fuchsia-500/20"
                            >
                                {saving ? <AlertCircle className="h-5 w-5 animate-spin" /> : <Save className="h-5 w-5" />}
                                {saving ? 'Saving...' : 'Save Changes'}
                            </button>
                            <button
                                onClick={onClose}
                                disabled={saving}
                                className="w-full px-6 py-3 font-semibold text-neutral-800 bg-neutral-200 hover:bg-neutral-300 rounded-xl transition-colors"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
