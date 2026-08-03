import React, { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { KeyRound, Mail, AlertTriangle, Hammer, Loader2 } from 'lucide-react'

export const Login: React.FC = () => {
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [loading, setLoading] = useState(false)
    const [errorMsg, setErrorMsg] = useState('')
    const navigate = useNavigate()
    const location = useLocation()

    // Routing destination after login
    const from = (location.state as any)?.from?.pathname || '/'

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault()
        setErrorMsg('')
        setLoading(true)

        try {
            const { error } = await supabase.auth.signInWithPassword({
                email: email.trim(),
                password
            })

            if (error) {
                setErrorMsg(error.message)
            } else {
                navigate(from, { replace: true })
            }
        } catch (err: any) {
            setErrorMsg(err.message || 'An unexpected error occurred.')
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="relative flex min-h-screen items-center justify-center overflow-hidden tejas-gradient px-4 py-12 text-slate-100 sm:px-6 lg:px-8">
            {/* Background gradients */}
            <div className="absolute -top-40 -left-40 h-96 w-96 rounded-full bg-amber-500/10 blur-3xl"></div>
            <div className="absolute -bottom-40 -right-40 h-96 w-96 rounded-full bg-blue-600/10 blur-3xl"></div>

            <div className="relative w-full max-w-md space-y-8">
                {/* Logo and Header */}
                <div className="flex flex-col items-center text-center">
                    <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-tr from-amber-500 to-amber-600 shadow-lg shadow-amber-500/20 border border-amber-400/20">
                        <Hammer className="h-9 w-9 text-slate-100" />
                    </div>
                    <h2 className="mt-6 text-3xl font-extrabold tracking-tight text-white sm:text-4xl font-outfit uppercase tracking-wide">
                        Tejas Impex
                    </h2>
                    <p className="mt-2 text-xs uppercase tracking-wider text-amber-500 font-semibold">
                        Import & Distribution PWA
                    </p>
                </div>

                {/* Card Container */}
                <div className="rounded-3xl border border-slate-800/80 bg-slate-900/60 p-8 shadow-2xl backdrop-blur-xl sm:p-10">
                    <form className="space-y-6" onSubmit={handleLogin}>
                        {errorMsg && (
                            <div className="flex items-start gap-3 rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-400 animate-in fade-in slide-in-from-top-2 duration-300">
                                <AlertTriangle className="h-5 w-5 shrink-0 text-rose-500" />
                                <span>{errorMsg}</span>
                            </div>
                        )}

                        {/* Email Field */}
                        <div className="space-y-2">
                            <label htmlFor="email" className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
                                Email Address
                            </label>
                            <div className="relative">
                                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                                    <Mail className="h-5 w-5 text-slate-500" />
                                </div>
                                <input
                                    id="email"
                                    name="email"
                                    type="email"
                                    autoComplete="email"
                                    required
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    className="block w-full rounded-xl border border-slate-800 bg-slate-950/80 py-3 pr-4 pl-10 text-white placeholder-slate-500 transition-colors focus:border-amber-500 focus:ring-1 focus:ring-amber-500 focus:outline-none"
                                    placeholder="name@nepalhardware.com"
                                />
                            </div>
                        </div>

                        {/* Password Field */}
                        <div className="space-y-2">
                            <label htmlFor="password" className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
                                Password
                            </label>
                            <div className="relative">
                                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                                    <KeyRound className="h-5 w-5 text-slate-500" />
                                </div>
                                <input
                                    id="password"
                                    name="password"
                                    type="password"
                                    autoComplete="current-password"
                                    required
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="block w-full rounded-xl border border-slate-800 bg-slate-950/80 py-3 pr-4 pl-10 text-white placeholder-slate-500 transition-colors focus:border-amber-500 focus:ring-1 focus:ring-amber-500 focus:outline-none"
                                    placeholder="••••••••"
                                />
                            </div>
                        </div>

                        {/* Submit Button */}
                        <div>
                            <button
                                type="submit"
                                disabled={loading}
                                className="group relative flex w-full justify-center rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 py-3.5 px-4 text-sm font-bold text-slate-100 hover:from-amber-400 hover:to-amber-500 focus:ring-2 focus:ring-amber-500 focus:ring-offset-2 focus:ring-offset-slate-950 focus:outline-none disabled:opacity-50 transition-all duration-200"
                            >
                                {loading ? (
                                    <Loader2 className="h-5 w-5 animate-spin" />
                                ) : (
                                    'Sign In to Dashboard'
                                )}
                            </button>
                        </div>
                    </form>
                </div>

                {/* Footer Credit */}
                <div className="text-center text-xs text-slate-600">
                    Secure Internal Access Only (NPR Database)
                </div>
            </div>
        </div>
    )
}
