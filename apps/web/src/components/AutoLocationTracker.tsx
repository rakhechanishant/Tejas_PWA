import React, { useEffect, useRef } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'

export const AutoLocationTracker: React.FC = () => {
    const { profile } = useAuth()
    const hasRun = useRef(false) // Ensure it only runs once per session/mount

    // Reverse geocode fallback/helper
    const reverseGeocode = async (lat: number, lng: number): Promise<string | null> => {
        try {
            const response = await fetch(
                `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`,
                {
                    headers: { 'User-Agent': 'TejasHardwarePWA/1.0' }
                }
            )
            if (!response.ok) throw new Error('OSM geocoding failed')
            const data = await response.json()
            return data.display_name || null
        } catch (err) {
            console.error('AutoLocation reverse geocoding failed:', err)
            return null
        }
    }

    useEffect(() => {
        // Only trigger for TEAM members (not ADMIN / MANAGER)
        // Adjust the role condition if we also want to track managers.
        if (profile?.id && profile?.role === 'TEAM' && !hasRun.current) {
            hasRun.current = true
            trackLocation()
        }
    }, [profile])

    const trackLocation = async () => {
        if (!navigator.geolocation) {
            console.warn('Geolocation not supported by this browser.')
            return
        }

        navigator.geolocation.getCurrentPosition(
            async (pos) => {
                const lat = pos.coords.latitude
                const lng = pos.coords.longitude
                const accuracy = pos.coords.accuracy

                const address = await reverseGeocode(lat, lng)

                // Save to database silently
                const { error } = await supabase
                    .from('user_locations')
                    .insert({
                        profile_id: profile?.id,
                        latitude: lat,
                        longitude: lng,
                        accuracy: accuracy,
                        address: address,
                        event_type: 'APP_OPEN'
                    })

                if (error) {
                    console.error('Failed to save auto location log:', error)
                } else {
                    console.log('App Open Location Logged. Lat:', lat, 'Lng:', lng)
                }
            },
            (err) => {
                console.warn('Auto Location Tracker missed coords (Permission Denied/Timeout):', err)
            },
            {
                enableHighAccuracy: true,
                timeout: 10000,
                maximumAge: 0
            }
        )
    }

    // This component renders absolutely nothing. It is a silent background tracker.
    return null
}
