import React, { createContext, useContext, useEffect, useState } from 'react'
import type { User, Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

export type UserRole = 'ADMIN' | 'MANAGER' | 'TEAM' | 'ORDER_ENTRY_TEAM' | 'UNIKAJI'

export interface Profile {
    id: string
    name: string
    phone: string | null
    role: UserRole
    is_active: boolean
    allowed_modules: string[] | null
}

interface AuthContextType {
    user: User | null
    profile: Profile | null
    session: Session | null
    loading: boolean
    role: UserRole | null
    signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [user, setUser] = useState<User | null>(null)
    const [profile, setProfile] = useState<Profile | null>(null)
    const [session, setSession] = useState<Session | null>(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        // Check active session
        supabase.auth.getSession().then(({ data: { session } }) => {
            setSession(session)
            setUser(session?.user ?? null)
            if (session?.user) {
                fetchProfile(session.user.id)
            } else {
                setLoading(false)
            }
        })

        // Listen for auth changes
        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
            setSession(session)
            setUser(session?.user ?? null)
            if (session?.user) {
                await fetchProfile(session.user.id)
            } else {
                setProfile(null)
                setLoading(false)
            }
        })

        return () => {
            subscription.unsubscribe()
        }
    }, [])

    const fetchProfile = async (userId: string) => {
        try {
            const { data, error } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', userId)
                .single()

            if (error) {
                console.error('Error fetching profile:', error)
            } else if (data) {
                setProfile(data as Profile)
            }
        } catch (err) {
            console.error('Auth Profile fetch fail:', err)
        } finally {
            setLoading(false)
        }
    }

    const signOut = async () => {
        setLoading(true)
        await supabase.auth.signOut()
        setUser(null)
        setProfile(null)
        setSession(null)
        setLoading(false)
    }

    return (
        <AuthContext.Provider
            value={{
                user,
                profile,
                session,
                loading,
                role: profile?.role ?? null,
                signOut
            }}
        >
            {children}
        </AuthContext.Provider>
    )
}

export const useAuth = () => {
    const context = useContext(AuthContext)
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider')
    }
    return context
}
