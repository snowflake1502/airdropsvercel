'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

// Redirect old /protocols to new /discover
export default function ProtocolsRedirect() {
  const router = useRouter()
  
  useEffect(() => {
    router.replace('/dashboard/discover')
  }, [router])
  
  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-2 border-cyan-500 border-t-transparent mx-auto mb-4"></div>
        <p className="text-slate-400">Redirecting to Discover...</p>
      </div>
    </div>
  )
}
