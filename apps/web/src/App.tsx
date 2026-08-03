import React, { useState, useEffect } from 'react'
import { BrowserRouter as Router, Routes, Route, Link, useLocation } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { ProtectedRoute } from './components/ProtectedRoute'
import { Login } from './pages/Login'
import { Products } from './pages/Products'
import { Parties } from './pages/Parties'
import { Orders } from './pages/Orders'
import { NewOrder } from './pages/NewOrder'
import { Payments } from './pages/Payments'
import { Quotations } from './pages/Quotations'
import { Returns } from './pages/Returns'
import { Cheques } from './pages/Cheques'
import { Attendance } from './pages/Attendance'
import { AuditLogs } from './pages/AuditLogs'
import { supabase } from './lib/supabase'
import {
  LayoutDashboard,
  Layers,
  Users,
  ClipboardList,
  Wallet,
  LogOut,
  Menu,
  X,
  User as UserIcon,
  TrendingUp,
  PackageCheck,
  AlertCircle,
  RefreshCw,
  Calculator,
  Compass,
  BookOpen,
  Activity,
  Undo2
} from 'lucide-react'

// ─── DYNAMIC DASHBOARD PAGE ───────────────────────────────────────────────
const Dashboard = () => {
  const { profile } = useAuth()
  const [metrics, setMetrics] = useState({
    todayCount: 0,
    awaitingBilling: 0,
    fulfilledCount: 0,
    outstandingDues: 0
  })
  const [loading, setLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    if (profile?.id) {
      fetchMetrics()
    }
  }, [profile?.id])

  const fetchMetrics = async () => {
    setLoading(true)
    setErrorMsg('')
    try {
      // 1. Today's orders count
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      const { count: todayCount, error: todayErr } = await supabase
        .from('orders')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', today.toISOString())

      if (todayErr) throw todayErr

      // 2. Awaiting Billing (CONFIRMED status) count
      const { count: billingCount, error: billingErr } = await supabase
        .from('orders')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'CONFIRMED')

      if (billingErr) throw billingErr

      // 3. Fulfilled count (PACKED, DISPATCHED, DELIVERED)
      const { count: fulfilledCount, error: fulfilledErr } = await supabase
        .from('orders')
        .select('*', { count: 'exact', head: true })
        .in('status', ['PACKED', 'DISPATCHED', 'DELIVERED'])

      if (fulfilledErr) throw fulfilledErr

      // 4. Outstanding Dues (sum total_due from parties)
      const { data: partiesData, error: partiesErr } = await supabase
        .from('parties')
        .select('total_due')

      if (partiesErr) throw partiesErr

      const duesSum = partiesData
        ? partiesData.reduce((acc, p) => {
          const due = Number(p.total_due || 0)
          return due > 0 ? acc + due : acc
        }, 0)
        : 0

      setMetrics({
        todayCount: todayCount || 0,
        awaitingBilling: billingCount || 0,
        fulfilledCount: fulfilledCount || 0,
        outstandingDues: duesSum
      })
    } catch (err: any) {
      console.error('Error fetching dashboard metrics:', err)
      setErrorMsg(err.message || 'Error updating dashboard metrics.')
    } finally {
      setLoading(false)
    }
  }

  const formatCurrency = (val: number) => {
    return 'रु ' + val.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-100 sm:text-3xl font-outfit">Dashboard</h1>
          <p className="text-sm text-slate-400">Welcome back, {profile?.name || 'Partner'} ({profile?.role})</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={fetchMetrics}
            disabled={loading}
            title="Reload live feeds"
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-900 border border-slate-800 hover:bg-slate-800 transition-colors text-slate-450 hover:text-white"
          >
            <RefreshCw className={`h-4.5 w-4.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <div className="text-xs text-slate-500 bg-slate-900 border border-slate-805 rounded-lg px-3 py-1.5 self-start">
            Database: Supabase Live • NPR (रु)
          </div>
        </div>
      </div>

      {errorMsg && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-400 flex items-center gap-2">
          <AlertCircle className="h-5 w-5 text-rose-500 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Analytics Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { title: "Today's Orders", value: loading ? '...' : String(metrics.todayCount), sub: "Placed today", icon: ClipboardList, color: "text-amber-500", accentClass: "accent-card-amber" },
          { title: "Awaiting Billing", value: loading ? '...' : String(metrics.awaitingBilling), sub: "Needs payment processing", icon: AlertCircle, color: "text-rose-500", accentClass: "accent-card-rose" },
          { title: "Fulfilled Safely", value: loading ? '...' : String(metrics.fulfilledCount), sub: "Packed/Dispatched/Delivered", icon: PackageCheck, color: "text-emerald-500", accentClass: "accent-card-emerald" },
          { title: "Outstanding Dues", value: loading ? '...' : formatCurrency(metrics.outstandingDues), sub: "Awaiting payment across entries", icon: TrendingUp, color: "text-blue-500", accentClass: "accent-card-blue" },
        ].map((c, i) => (
          <div key={i} className={`rounded-2xl border border-slate-800/80 p-6 backdrop-blur-sm shadow-sm transition-all duration-300 hover:shadow-md cursor-pointer bg-white ${c.accentClass}`}>
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-slate-700">{c.title}</span>
              <c.icon className={`h-5 w-5 ${c.color}`} />
            </div>
            <div className="mt-2 text-2xl font-black text-slate-200 font-mono">{c.value}</div>
            <div className="mt-1 text-xs text-slate-650 font-medium">{c.sub}</div>
          </div>
        ))}
      </div>

      {/* Getting Started Message */}
      <div className="rounded-2xl border border-slate-800/80 bg-gradient-to-r from-amber-500/10 to-transparent p-6">
        <h3 className="text-lg font-semibold text-amber-500">System Live</h3>
        <p className="mt-2 text-sm text-slate-300 max-w-2xl leading-relaxed">
          The dashboard is running live linked to Supabase. Placed orders, billing statuses, and credit ranges sync here in real-time.
        </p>
      </div>
    </div>
  )
}


// ─── NAV LAYOUT ─────────────────────────────────────────────────────────────
const Layout: React.FC = () => {
  const { signOut, profile } = useAuth()
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false)
  const location = useLocation()

  const isActive = (path: string) => {
    if (path === '/') return location.pathname === '/'
    return location.pathname.startsWith(path)
  }

  const allNavItems = [
    { name: 'Dashboard', path: '/', icon: LayoutDashboard, section: 'main', moduleKey: 'dashboard' },
    { name: 'Products', path: '/products', icon: Layers, section: 'main', moduleKey: 'products' },
    { name: 'Parties', path: '/parties', icon: Users, section: 'main', moduleKey: 'parties' },
    { name: 'Orders', path: '/orders', icon: ClipboardList, section: 'main', moduleKey: 'orders' },
    { name: 'Payments', path: '/payments', icon: Wallet, section: 'main', moduleKey: 'payments' },
    { name: 'Quotations', path: '/quotations', icon: Calculator, section: 'main', moduleKey: 'quotations' },
    { name: 'Sales Returns', path: '/returns', icon: Undo2, section: 'ops', moduleKey: 'returns' },
    { name: 'Cheque Register', path: '/cheques', icon: BookOpen, section: 'ops', moduleKey: 'cheques' },
    { name: 'GPS Attendance', path: '/attendance', icon: Compass, section: 'ops', moduleKey: 'attendance' },
    ...(profile?.role === 'ADMIN' || profile?.role === 'MANAGER'
      ? [{ name: 'Audit Trails', path: '/audit-logs', icon: Activity, section: 'ops', moduleKey: 'audit-logs' }]
      : [])
  ]

  // Filter nav items based on allowed_modules
  // null = full access, array = only dashboard + listed modules
  const navItems = profile?.allowed_modules
    ? allNavItems.filter(item => item.moduleKey === 'dashboard' || profile.allowed_modules!.includes(item.moduleKey))
    : allNavItems

  return (
    <div className="min-h-screen tejas-gradient text-slate-100 flex flex-col md:flex-row">
      {/* Mobile Top Bar */}
      <div className="md:hidden flex items-center justify-between bg-slate-900 border-b border-slate-800 px-4 py-3 sticky top-0 z-50">
        <div className="flex items-center gap-2">
          <a href="https://www.tejasimpex.com.np/" target="_blank" rel="noopener noreferrer" className="font-extrabold text-amber-500 tracking-wider hover:text-amber-400 transition-colors uppercase text-sm">
            Tejas Impex
          </a>
        </div>
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="text-slate-400 hover:text-white focus:outline-none"
        >
          {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </div>

      {/* Sidebar Navigation */}
      <aside className={`
        fixed inset-y-0 left-0 z-40 w-64 bg-slate-900 border-r border-slate-850 p-5 transform transition-transform duration-300 md:translate-x-0 md:static md:flex md:flex-col justify-between
        ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <div className="space-y-6">
          <div className="hidden md:block py-2">
            <a href="https://www.tejasimpex.com.np/" target="_blank" rel="noopener noreferrer" className="font-extrabold text-amber-500 tracking-wider text-base hover:text-amber-400 transition-colors uppercase">
              Tejas Impex
            </a>
          </div>

          {/* User Profile Card */}
          <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-950/60 border border-slate-800/80 hover:border-amber-500/20 transition-all">
            <div className="h-10 w-10 rounded-lg bg-amber-500/10 flex items-center justify-center text-amber-500 border border-amber-500/20">
              <UserIcon className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold truncate text-slate-200">{profile?.name || 'Loading...'}</p>
              <p className="text-[9px] font-medium tracking-wide uppercase text-slate-500">{profile?.role || 'User'}</p>
            </div>
          </div>

          {/* Nav Links */}
          <nav className="space-y-1">
            {navItems.filter(i => i.section === 'main').map((item) => {
              const active = isActive(item.path)
              return (
                <Link
                  key={item.name}
                  to={item.path}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 ${active
                    ? 'bg-gradient-to-r from-blue-600 to-indigo-650 text-white shadow-md shadow-blue-500/15'
                    : 'text-slate-600 hover:bg-blue-550/10 hover:text-blue-600'
                    }`}
                >
                  <item.icon className={`h-5 w-5 ${active ? 'text-white' : 'text-slate-500'}`} />
                  <span className="text-sm font-semibold">{item.name}</span>
                </Link>
              )
            })}
            <div className="pt-3 pb-1">
              <p className="px-4 text-[9px] font-bold uppercase tracking-widest text-slate-500">Operations</p>
            </div>
            {navItems.filter(i => i.section === 'ops').map((item) => {
              const active = isActive(item.path)
              return (
                <Link
                  key={item.name}
                  to={item.path}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 ${active
                    ? 'bg-gradient-to-r from-blue-600 to-indigo-655 text-white shadow-md shadow-blue-500/15'
                    : 'text-slate-600 hover:bg-blue-550/10 hover:text-blue-600'
                    }`}
                >
                  <item.icon className={`h-5 w-5 ${active ? 'text-white' : 'text-slate-500'}`} />
                  <span className="text-sm font-semibold">{item.name}</span>
                </Link>
              )
            })}
          </nav>
        </div>

        {/* Logout Control */}
        <button
          onClick={() => {
            setMobileMenuOpen(false)
            signOut()
          }}
          className="flex items-center gap-3 w-full px-4 py-3 mt-6 md:mt-0 rounded-xl text-rose-400 hover:bg-rose-500/10 transition-colors duration-200"
        >
          <LogOut className="h-5 w-5" />
          <span className="text-sm font-medium">Log Out</span>
        </button>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 bg-slate-950/50 p-4 md:p-8 overflow-y-auto">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/products" element={<ProtectedRoute requiredModule="products"><Products /></ProtectedRoute>} />
          <Route path="/parties" element={<ProtectedRoute requiredModule="parties"><Parties /></ProtectedRoute>} />
          <Route path="/orders" element={<ProtectedRoute requiredModule="orders"><Orders /></ProtectedRoute>} />
          <Route path="/orders/new" element={<ProtectedRoute requiredModule="orders"><NewOrder /></ProtectedRoute>} />
          <Route path="/payments" element={<ProtectedRoute requiredModule="payments"><Payments /></ProtectedRoute>} />
          <Route path="/quotations" element={<ProtectedRoute requiredModule="quotations"><Quotations /></ProtectedRoute>} />
          <Route path="/returns" element={<ProtectedRoute requiredModule="returns"><Returns /></ProtectedRoute>} />
          <Route path="/cheques" element={<ProtectedRoute requiredModule="cheques"><Cheques /></ProtectedRoute>} />
          <Route path="/attendance" element={<ProtectedRoute requiredModule="attendance"><Attendance /></ProtectedRoute>} />
          <Route path="/audit-logs" element={<ProtectedRoute requiredModule="audit-logs"><AuditLogs /></ProtectedRoute>} />
        </Routes>
      </main>
    </div>
  )
}

// ─── ROOT APP ───────────────────────────────────────────────────────────────
export default function App() {
  return (
    <Router>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            path="/*"
            element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }
          />
        </Routes>
      </AuthProvider>
    </Router>
  )
}
export { App }
