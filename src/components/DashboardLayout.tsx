'use client'

import { useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'
import WalletButton from './WalletButton'

interface DashboardLayoutProps {
  children: React.ReactNode
}

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const router = useRouter()
  const pathname = usePathname()

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/auth/login')
  }

  // Primary navigation - 4 main sections
  const navigation = [
    { name: 'Home', href: '/dashboard', icon: '🏠' },
    { name: 'Portfolio', href: '/dashboard/portfolio', icon: '💎' },
    { name: 'Discover', href: '/dashboard/discover', icon: '🎯' },
    { name: 'Automation', href: '/dashboard/automation', icon: '🤖' },
  ]

  // Secondary navigation in dropdown
  const secondaryNav = [
    { name: 'Analytics', href: '/dashboard/analytics', icon: '📊', badge: 'Soon' },
    { name: 'Settings', href: '/dashboard/settings', icon: '⚙️' },
  ]

  const isActive = (href: string) => {
    if (href === '/dashboard') return pathname === '/dashboard'
    return pathname?.startsWith(href)
  }

  return (
    <div className="min-h-screen bg-slate-950">
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setSidebarOpen(false)} />
          <div className="relative flex w-full max-w-xs flex-col bg-slate-900 pt-5 pb-4 shadow-2xl border-r border-slate-800">
            <div className="absolute top-0 right-0 -mr-12 pt-2">
              <button
                type="button"
                className="ml-1 flex h-10 w-10 items-center justify-center rounded-full focus:outline-none"
                onClick={() => setSidebarOpen(false)}
              >
                <span className="text-white text-xl">✕</span>
              </button>
            </div>
            <div className="flex flex-shrink-0 items-center px-4">
              <div className="flex items-center gap-2">
                <span className="text-2xl">🌟</span>
                <h2 className="text-lg font-bold bg-gradient-to-r from-cyan-400 to-violet-400 bg-clip-text text-transparent">
                  Airdrop Tracker
                </h2>
              </div>
            </div>
            <div className="mt-6 flex-1 overflow-y-auto px-3">
              <nav className="space-y-1">
                {navigation.map((item) => (
                  <Link
                    key={item.name}
                    href={item.href}
                    onClick={() => setSidebarOpen(false)}
                    className={`group flex items-center px-3 py-2.5 text-sm font-medium rounded-xl transition-all duration-200 ${
                      isActive(item.href)
                        ? 'bg-gradient-to-r from-cyan-500/20 to-violet-500/20 text-white border border-cyan-500/30'
                        : 'text-slate-400 hover:bg-slate-800/50 hover:text-white'
                    }`}
                  >
                    <span className="mr-3 text-lg">{item.icon}</span>
                    {item.name}
                  </Link>
                ))}
              </nav>
              <div className="mt-6 pt-6 border-t border-slate-800">
                <p className="px-3 text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">More</p>
                {secondaryNav.map((item) => (
                  <Link
                    key={item.name}
                    href={item.href}
                    onClick={() => setSidebarOpen(false)}
                    className="group flex items-center justify-between px-3 py-2 text-sm font-medium rounded-xl text-slate-400 hover:bg-slate-800/50 hover:text-white transition-all"
                  >
                    <span className="flex items-center">
                      <span className="mr-3 text-lg">{item.icon}</span>
                      {item.name}
                    </span>
                    {item.badge && (
                      <span className="px-2 py-0.5 text-[10px] font-semibold rounded-full bg-violet-500/20 text-violet-400 border border-violet-500/30">
                        {item.badge}
                      </span>
                    )}
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Static sidebar for desktop */}
      <div className="hidden lg:fixed lg:inset-y-0 lg:z-50 lg:flex lg:w-64 lg:flex-col">
        <div className="flex grow flex-col overflow-y-auto bg-slate-900/50 backdrop-blur-xl px-4 pb-4 border-r border-slate-800/50">
          <div className="flex h-16 shrink-0 items-center px-2">
            <div className="flex items-center gap-2">
              <span className="text-2xl">🌟</span>
              <h1 className="text-lg font-bold bg-gradient-to-r from-cyan-400 to-violet-400 bg-clip-text text-transparent">
                Airdrop Tracker
              </h1>
            </div>
          </div>
          <nav className="flex flex-1 flex-col mt-4">
            <ul role="list" className="flex flex-1 flex-col gap-y-2">
              <li>
                <ul role="list" className="space-y-1">
                  {navigation.map((item) => (
                    <li key={item.name}>
                      <Link
                        href={item.href}
                        className={`group flex gap-x-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200 ${
                          isActive(item.href)
                            ? 'bg-gradient-to-r from-cyan-500/20 to-violet-500/20 text-white border border-cyan-500/30 shadow-lg shadow-cyan-500/10'
                            : 'text-slate-400 hover:bg-slate-800/50 hover:text-white'
                        }`}
                      >
                        <span className="text-lg">{item.icon}</span>
                        {item.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              </li>
              <li className="mt-auto pt-4 border-t border-slate-800/50">
                <p className="px-3 text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">More</p>
                <ul className="space-y-1">
                  {secondaryNav.map((item) => (
                    <li key={item.name}>
                      <Link
                        href={item.href}
                        className={`group flex items-center justify-between rounded-xl px-3 py-2 text-sm font-medium transition-all ${
                          isActive(item.href)
                            ? 'bg-slate-800/50 text-white'
                            : 'text-slate-500 hover:bg-slate-800/30 hover:text-slate-300'
                        }`}
                      >
                        <span className="flex items-center gap-x-3">
                          <span className="text-lg">{item.icon}</span>
                          {item.name}
                        </span>
                        {item.badge && (
                          <span className="px-2 py-0.5 text-[10px] font-semibold rounded-full bg-violet-500/20 text-violet-400 border border-violet-500/30">
                            {item.badge}
                          </span>
                        )}
                      </Link>
                    </li>
                  ))}
                </ul>
              </li>
            </ul>
          </nav>
        </div>
      </div>

      {/* Main content */}
      <div className="lg:pl-64">
        {/* Top bar */}
        <div className="sticky top-0 z-40 flex h-16 shrink-0 items-center gap-x-4 border-b border-slate-800/50 bg-slate-950/80 backdrop-blur-xl px-4 sm:gap-x-6 sm:px-6 lg:px-8">
          <button
            type="button"
            className="-m-2.5 p-2.5 text-slate-400 hover:text-white lg:hidden transition-colors"
            onClick={() => setSidebarOpen(true)}
          >
            <span className="sr-only">Open sidebar</span>
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5M3.75 17.25h16.5" />
            </svg>
          </button>

          <div className="flex flex-1 gap-x-4 self-stretch lg:gap-x-6">
            <div className="flex flex-1"></div>
            <div className="flex items-center gap-x-3 lg:gap-x-4">
              <WalletButton />

              <div className="hidden lg:block lg:h-6 lg:w-px lg:bg-slate-700"></div>

              <button className="p-2 text-slate-400 hover:text-white hover:bg-slate-800/50 rounded-lg transition-all">
                <span className="sr-only">View notifications</span>
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
                </svg>
              </button>

              <div className="hidden lg:block lg:h-6 lg:w-px lg:bg-slate-700"></div>

              <button
                onClick={handleSignOut}
                className="text-sm font-medium text-slate-400 hover:text-white transition-colors px-3 py-1.5 hover:bg-slate-800/50 rounded-lg"
              >
                Sign out
              </button>
            </div>
          </div>
        </div>

        {/* Page content */}
        <main className="py-8">
          <div className="px-4 sm:px-6 lg:px-8">
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}

