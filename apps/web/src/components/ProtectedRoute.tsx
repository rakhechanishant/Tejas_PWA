import React from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import type { UserRole } from '../context/AuthContext'

interface ProtectedRouteProps {
    children: React.ReactNode
    allowedRoles?: UserRole[]
    requiredModule?: string
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
    children,
    allowedRoles,
    requiredModule
}) => {
    const { user, loading, role, profile } = useAuth()
    const location = useLocation()

    if (loading) {
        return (
            <div className="flex h-screen w-screen items-center justify-center bg-slate-950 text-neutral-900">
                <div className="flex flex-col items-center gap-4">
                    <div className="h-10 w-10 animate-spin rounded-full border-4 border-slate-700 border-t-amber-500"></div>
                    <p className="font-medium tracking-wide text-neutral-600">Loading Tejas Impex Pvt. Ltd. PWA...</p>
                </div>
            </div>
        )
    }

    if (!user) {
        // Redirect to login page but remember where they were trying to go
        return <Navigate to="/login" state={{ from: location }} replace />
    }

    if (allowedRoles && (!role || !allowedRoles.includes(role))) {
        // Role not authorized, bounce them back to dashboard
        return <Navigate to="/" replace />
    }

    // Module-level access check
    if (requiredModule && profile?.allowed_modules) {
        // allowed_modules is non-null array — check if this module is permitted
        if (!profile.allowed_modules.includes(requiredModule)) {
            return <Navigate to="/" replace />
        }
    }
    // If allowed_modules is null, user has full access — no restriction

    return <>{children}</>
}

