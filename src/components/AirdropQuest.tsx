'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

interface ProtocolTarget {
  id: string
  name: string
  icon: string
  color: string
  totalPointsRequired: number
  currentPoints: number
  activities: Activity[]
  streak: number
  lastActivityDate: string | null
  airdropDate: string
  airdropPotential: 'confirmed' | 'high' | 'medium'
}

interface Activity {
  id: string
  name: string
  points: number
  frequency: 'daily' | 'weekly' | 'monthly' | 'one-time'
  completed: boolean
  completedToday: boolean
  description: string
  icon: string
}

interface DailyTask {
  protocol: string
  task: string
  points: number
  completed: boolean
  icon: string
}

// Protocol point targets based on known airdrop criteria
const PROTOCOL_CONFIGS: Omit<ProtocolTarget, 'currentPoints' | 'streak' | 'lastActivityDate'>[] = [
  {
    id: 'meteora',
    name: 'Meteora',
    icon: '🌊',
    color: 'cyan',
    totalPointsRequired: 1000,
    airdropDate: 'Q1 2025',
    airdropPotential: 'confirmed',
    activities: [
      { id: 'meteora-lp', name: 'Provide Liquidity', points: 50, frequency: 'daily', completed: false, completedToday: false, description: 'Have active LP position', icon: '💧' },
      { id: 'meteora-fees', name: 'Claim Fees', points: 25, frequency: 'weekly', completed: false, completedToday: false, description: 'Claim accumulated fees', icon: '💰' },
      { id: 'meteora-rebalance', name: 'Rebalance Position', points: 30, frequency: 'weekly', completed: false, completedToday: false, description: 'Adjust position range', icon: '⚖️' },
      { id: 'meteora-new-pool', name: 'Try New Pool', points: 100, frequency: 'monthly', completed: false, completedToday: false, description: 'Open position in new pool', icon: '🆕' },
      { id: 'meteora-duration', name: '30 Day Streak', points: 200, frequency: 'one-time', completed: false, completedToday: false, description: 'Maintain position for 30 days', icon: '📅' },
    ],
  },
  {
    id: 'jupiter',
    name: 'Jupiter',
    icon: '🪐',
    color: 'green',
    totalPointsRequired: 800,
    airdropDate: 'Q2 2025',
    airdropPotential: 'high',
    activities: [
      { id: 'jup-swap', name: 'Swap Tokens', points: 10, frequency: 'daily', completed: false, completedToday: false, description: 'Make a token swap', icon: '🔄' },
      { id: 'jup-limit', name: 'Limit Order', points: 20, frequency: 'weekly', completed: false, completedToday: false, description: 'Place a limit order', icon: '📊' },
      { id: 'jup-dca', name: 'DCA Order', points: 50, frequency: 'monthly', completed: false, completedToday: false, description: 'Start a DCA position', icon: '📈' },
      { id: 'jup-perp', name: 'Perp Trade', points: 30, frequency: 'weekly', completed: false, completedToday: false, description: 'Trade perpetuals', icon: '📉' },
      { id: 'jup-stake', name: 'Stake JUP', points: 100, frequency: 'one-time', completed: false, completedToday: false, description: 'Stake JUP tokens', icon: '🔒' },
    ],
  },
  {
    id: 'sanctum',
    name: 'Sanctum',
    icon: '⭐',
    color: 'purple',
    totalPointsRequired: 600,
    airdropDate: 'Q2-Q3 2025',
    airdropPotential: 'high',
    activities: [
      { id: 'sanctum-stake', name: 'Stake SOL', points: 40, frequency: 'daily', completed: false, completedToday: false, description: 'Hold staked SOL (LST)', icon: '🔐' },
      { id: 'sanctum-swap', name: 'Swap LSTs', points: 25, frequency: 'weekly', completed: false, completedToday: false, description: 'Swap between LST types', icon: '🔄' },
      { id: 'sanctum-infinity', name: 'Use Infinity Pool', points: 50, frequency: 'weekly', completed: false, completedToday: false, description: 'Provide to Infinity pool', icon: '♾️' },
      { id: 'sanctum-hold', name: '90 Day Hold', points: 200, frequency: 'one-time', completed: false, completedToday: false, description: 'Hold LST for 90 days', icon: '💎' },
    ],
  },
]

// Get day of week (0 = Sunday)
const getDayOfWeek = () => new Date().getDay()
const getWeekOfMonth = () => Math.ceil(new Date().getDate() / 7)

// Check if a date is today
const isToday = (timestamp: number) => {
  const date = new Date(timestamp * 1000)
  const today = new Date()
  return date.toDateString() === today.toDateString()
}

// Check if a date is this week
const isThisWeek = (timestamp: number) => {
  const date = new Date(timestamp * 1000)
  const today = new Date()
  const startOfWeek = new Date(today)
  startOfWeek.setDate(today.getDate() - today.getDay()) // Sunday
  startOfWeek.setHours(0, 0, 0, 0)
  return date >= startOfWeek
}

interface ActivityStatus {
  hasActivePosition: boolean
  claimedFeesToday: boolean
  claimedFeesThisWeek: boolean
  openedPositionToday: boolean
  openedPositionThisWeek: boolean
  rebalancedThisWeek: boolean
  totalTransactionsToday: number
  totalTransactionsThisWeek: number
}

// Analyze transactions to determine activity status
const analyzeActivity = (transactions: any[]): ActivityStatus => {
  const opens = transactions.filter(tx => tx.tx_type === 'position_open')
  const closes = transactions.filter(tx => tx.tx_type === 'position_close')
  const fees = transactions.filter(tx => tx.tx_type === 'fee_claim')
  
  // Check if there's an active position (more opens than closes)
  const hasActivePosition = opens.length > closes.length
  
  // Check today's activity
  const claimedFeesToday = fees.some(tx => isToday(tx.block_time))
  const openedPositionToday = opens.some(tx => isToday(tx.block_time))
  const totalTransactionsToday = transactions.filter(tx => isToday(tx.block_time)).length
  
  // Check this week's activity
  const claimedFeesThisWeek = fees.some(tx => isThisWeek(tx.block_time))
  const openedPositionThisWeek = opens.some(tx => isThisWeek(tx.block_time))
  const closedPositionThisWeek = closes.some(tx => isThisWeek(tx.block_time))
  const rebalancedThisWeek = openedPositionThisWeek && closedPositionThisWeek
  const totalTransactionsThisWeek = transactions.filter(tx => isThisWeek(tx.block_time)).length
  
  return {
    hasActivePosition,
    claimedFeesToday,
    claimedFeesThisWeek,
    openedPositionToday,
    openedPositionThisWeek,
    rebalancedThisWeek,
    totalTransactionsToday,
    totalTransactionsThisWeek,
  }
}

// Generate daily tasks based on day of week and activity status
const generateDailyTasks = (activityStatus: ActivityStatus): DailyTask[] => {
  const dayOfWeek = getDayOfWeek()
  const tasks: DailyTask[] = []
  
  // Meteora - always active if you have a position
  tasks.push({
    protocol: 'Meteora',
    task: 'Maintain LP Position',
    points: 50,
    completed: activityStatus.hasActivePosition, // Auto-detect!
    icon: '🌊'
  })
  
  // Rotate other tasks by day
  if (dayOfWeek === 1 || dayOfWeek === 4) { // Mon, Thu
    tasks.push({
      protocol: 'Jupiter',
      task: 'Make a Swap',
      points: 10,
      completed: false, // Would need Jupiter transaction tracking
      icon: '🪐'
    })
  }
  
  if (dayOfWeek === 2 || dayOfWeek === 5) { // Tue, Fri
    tasks.push({
      protocol: 'Sanctum',
      task: 'Check LST Position',
      points: 40,
      completed: false, // Would need Sanctum transaction tracking
      icon: '⭐'
    })
  }
  
  if (dayOfWeek === 3) { // Wed - claim day
    tasks.push({
      protocol: 'Meteora',
      task: 'Claim Fees',
      points: 25,
      completed: activityStatus.claimedFeesToday, // Auto-detect!
      icon: '💰'
    })
  }
  
  if (dayOfWeek === 6) { // Sat - review day
    tasks.push({
      protocol: 'All',
      task: 'Weekly Review & Rebalance',
      points: 50,
      completed: activityStatus.rebalancedThisWeek || activityStatus.totalTransactionsThisWeek >= 3, // Auto-detect!
      icon: '📊'
    })
  }
  
  if (dayOfWeek === 0) { // Sun - rest day
    tasks.push({
      protocol: 'All',
      task: 'Plan Next Week Strategy',
      points: 20,
      completed: activityStatus.totalTransactionsThisWeek > 0, // Had activity = planned
      icon: '📋'
    })
  }
  
  return tasks
}

interface AirdropQuestProps {
  userId: string
  walletAddress: string
  transactions: any[]
}

export default function AirdropQuest({ userId, walletAddress, transactions }: AirdropQuestProps) {
  const [protocols, setProtocols] = useState<ProtocolTarget[]>([])
  const [dailyTasks, setDailyTasks] = useState<DailyTask[]>([])
  const [totalPoints, setTotalPoints] = useState(0)
  const [level, setLevel] = useState(1)
  const [streak, setStreak] = useState(0)
  const [expandedProtocol, setExpandedProtocol] = useState<string | null>(null)
  const [activityStatus, setActivityStatus] = useState<ActivityStatus | null>(null)

  useEffect(() => {
    calculatePoints()
  }, [transactions])

  const calculatePoints = () => {
    // Analyze activity status from transactions
    const status = analyzeActivity(transactions)
    setActivityStatus(status)
    
    // Calculate points based on transaction history
    const opens = transactions.filter(tx => tx.tx_type === 'position_open')
    const closes = transactions.filter(tx => tx.tx_type === 'position_close')
    const fees = transactions.filter(tx => tx.tx_type === 'fee_claim')
    
    // Calculate Meteora points
    let meteoraPoints = 0
    
    // Points for each position opened
    meteoraPoints += opens.length * 50
    
    // Points for fee claims
    meteoraPoints += fees.length * 25
    
    // Points for active days (unique days with transactions)
    const uniqueDays = new Set(transactions.map(tx => 
      new Date(tx.block_time * 1000).toDateString()
    ))
    meteoraPoints += uniqueDays.size * 10
    
    // Bonus for maintaining positions
    if (status.hasActivePosition) {
      meteoraPoints += 100 // Active position bonus
    }
    
    // Bonus for streaks
    let currentStreak = 0
    const sortedDates = Array.from(uniqueDays).sort().reverse()
    
    for (let i = 0; i < sortedDates.length; i++) {
      const date = new Date(sortedDates[i])
      const expectedDate = new Date()
      expectedDate.setDate(expectedDate.getDate() - i)
      
      if (date.toDateString() === expectedDate.toDateString()) {
        currentStreak++
      } else {
        break
      }
    }
    
    // Streak bonus points
    if (currentStreak >= 7) meteoraPoints += 100
    if (currentStreak >= 30) meteoraPoints += 300
    
    setStreak(currentStreak)
    
    // Update protocols with calculated points and activity status
    const updatedProtocols = PROTOCOL_CONFIGS.map(config => {
      let points = 0
      let protocolStreak = 0
      
      if (config.id === 'meteora') {
        points = meteoraPoints
        protocolStreak = currentStreak
      }
      
      // Update activities completion status based on actual activity
      const updatedActivities = config.activities.map(activity => {
        let completed = false
        let completedToday = false
        
        if (config.id === 'meteora') {
          switch (activity.id) {
            case 'meteora-lp':
              completed = status.hasActivePosition
              completedToday = status.hasActivePosition
              break
            case 'meteora-fees':
              completed = fees.length > 0
              completedToday = status.claimedFeesToday
              break
            case 'meteora-rebalance':
              completed = status.rebalancedThisWeek
              completedToday = status.openedPositionToday && closes.some(tx => isToday(tx.block_time))
              break
            case 'meteora-new-pool':
              completed = opens.length > 0
              completedToday = status.openedPositionToday
              break
            case 'meteora-duration':
              completed = currentStreak >= 30
              break
          }
        }
        
        return { ...activity, completed, completedToday }
      })
      
      return {
        ...config,
        currentPoints: points,
        streak: protocolStreak,
        lastActivityDate: sortedDates[0] || null,
        activities: updatedActivities
      }
    })
    
    setProtocols(updatedProtocols)
    setTotalPoints(updatedProtocols.reduce((sum, p) => sum + p.currentPoints, 0))
    setLevel(Math.floor(updatedProtocols.reduce((sum, p) => sum + p.currentPoints, 0) / 500) + 1)
    
    // Generate daily tasks with auto-detection
    setDailyTasks(generateDailyTasks(status))
  }

  const getProgressColor = (protocol: ProtocolTarget) => {
    const percent = (protocol.currentPoints / protocol.totalPointsRequired) * 100
    if (percent >= 100) return 'from-emerald-500 to-emerald-400'
    if (percent >= 75) return 'from-cyan-500 to-cyan-400'
    if (percent >= 50) return 'from-amber-500 to-amber-400'
    return 'from-slate-500 to-slate-400'
  }

  const getPotentialBadge = (potential: string) => {
    switch (potential) {
      case 'confirmed':
        return { bg: 'bg-emerald-500/20', text: 'text-emerald-400', label: '✅ Confirmed' }
      case 'high':
        return { bg: 'bg-cyan-500/20', text: 'text-cyan-400', label: '🔵 High' }
      default:
        return { bg: 'bg-amber-500/20', text: 'text-amber-400', label: '🟡 Medium' }
    }
  }

  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const today = getDayOfWeek()

  return (
    <div className="space-y-6">
      {/* Header Stats */}
      <div className="bg-gradient-to-br from-violet-500/10 to-cyan-500/10 rounded-2xl border border-violet-500/20 p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              🎮 Airdrop Quest
            </h2>
            <p className="text-slate-400 text-sm mt-1">Complete activities to maximize your airdrop rewards</p>
          </div>
          <div className="text-right">
            <div className="flex items-center gap-2">
              <span className="text-3xl">🏆</span>
              <div>
                <p className="text-2xl font-bold text-white">{totalPoints.toLocaleString()}</p>
                <p className="text-slate-400 text-xs">Total Points</p>
              </div>
            </div>
          </div>
        </div>
        
        {/* Level & Streak */}
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-slate-800/50 rounded-xl p-3 text-center">
            <p className="text-2xl font-bold text-cyan-400">Lvl {level}</p>
            <p className="text-slate-400 text-xs">Farmer Level</p>
          </div>
          <div className="bg-slate-800/50 rounded-xl p-3 text-center">
            <p className="text-2xl font-bold text-amber-400">🔥 {streak}</p>
            <p className="text-slate-400 text-xs">Day Streak</p>
          </div>
          <div className="bg-slate-800/50 rounded-xl p-3 text-center">
            <p className="text-2xl font-bold text-emerald-400">{protocols.filter(p => p.currentPoints >= p.totalPointsRequired * 0.5).length}/{protocols.length}</p>
            <p className="text-slate-400 text-xs">Protocols Ready</p>
          </div>
        </div>
      </div>

      {/* Daily Tasks Calendar */}
      <div className="bg-slate-800/30 rounded-2xl border border-slate-700/50 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-white flex items-center gap-2">
            📅 Today&apos;s Tasks
            <span className="text-xs bg-cyan-500/20 text-cyan-400 px-2 py-0.5 rounded-full">
              {dayNames[today]}
            </span>
          </h3>
          <span className="text-slate-400 text-sm">{new Date().toLocaleDateString()}</span>
        </div>
        
        {/* Week Calendar Bar */}
        <div className="flex gap-2 mb-4">
          {dayNames.map((day, idx) => (
            <div
              key={day}
              className={`flex-1 text-center py-2 rounded-lg text-xs font-medium transition-all ${
                idx === today
                  ? 'bg-gradient-to-r from-cyan-500 to-violet-500 text-white'
                  : idx < today
                  ? 'bg-emerald-500/20 text-emerald-400'
                  : 'bg-slate-700/50 text-slate-500'
              }`}
            >
              {day}
              {idx < today && <span className="ml-1">✓</span>}
            </div>
          ))}
        </div>
        
        {/* Task List */}
        <div className="space-y-2">
          {dailyTasks.map((task, idx) => (
            <div
              key={idx}
              className={`flex items-center justify-between p-4 rounded-xl border transition-all ${
                task.completed
                  ? 'bg-gradient-to-r from-emerald-500/20 to-emerald-500/10 border-emerald-500/40 shadow-lg shadow-emerald-500/10'
                  : 'bg-slate-800/50 border-slate-700/50 hover:border-slate-600/50'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                  task.completed ? 'bg-emerald-500/30' : 'bg-slate-700/50'
                }`}>
                  <span className="text-xl">{task.icon}</span>
                </div>
                <div>
                  <p className={`font-medium ${task.completed ? 'text-emerald-400' : 'text-white'}`}>
                    {task.task}
                    {task.completed && <span className="ml-2 text-xs">✨ Completed!</span>}
                  </p>
                  <p className="text-slate-500 text-xs">{task.protocol}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className={`font-semibold ${task.completed ? 'text-emerald-400' : 'text-cyan-400'}`}>
                  {task.completed ? '✓ ' : '+'}{task.points} pts
                </span>
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${
                    task.completed
                      ? 'bg-gradient-to-r from-emerald-500 to-emerald-400 text-white shadow-lg shadow-emerald-500/30'
                      : 'border-2 border-slate-600 hover:border-cyan-500'
                  }`}
                >
                  {task.completed ? (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <span className="w-3 h-3 rounded-full bg-slate-600"></span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
        
        {/* Daily Summary */}
        {dailyTasks.length > 0 && (
          <div className="mt-4 p-3 bg-slate-900/50 rounded-xl border border-slate-700/50">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-lg">📊</span>
                <span className="text-slate-400 text-sm">Today&apos;s Progress</span>
              </div>
              <div className="flex items-center gap-4">
                <span className="text-white font-semibold">
                  {dailyTasks.filter(t => t.completed).length}/{dailyTasks.length} tasks
                </span>
                <span className="text-emerald-400 font-semibold">
                  +{dailyTasks.filter(t => t.completed).reduce((sum, t) => sum + t.points, 0)} pts earned
                </span>
              </div>
            </div>
            {/* Progress bar */}
            <div className="mt-2 w-full bg-slate-700/50 rounded-full h-2">
              <div
                className="h-2 rounded-full bg-gradient-to-r from-emerald-500 to-cyan-500 transition-all duration-500"
                style={{ width: `${(dailyTasks.filter(t => t.completed).length / dailyTasks.length) * 100}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Protocol Progress */}
      <div className="bg-slate-800/30 rounded-2xl border border-slate-700/50 p-6">
        <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          🎯 Protocol Progress
        </h3>
        
        <div className="space-y-4">
          {protocols.map(protocol => {
            const progress = Math.min((protocol.currentPoints / protocol.totalPointsRequired) * 100, 100)
            const badge = getPotentialBadge(protocol.airdropPotential)
            const isExpanded = expandedProtocol === protocol.id
            
            return (
              <div key={protocol.id} className="bg-slate-900/50 rounded-xl border border-slate-700/50 overflow-hidden">
                {/* Header */}
                <button
                  onClick={() => setExpandedProtocol(isExpanded ? null : protocol.id)}
                  className="w-full p-4 flex items-center justify-between hover:bg-slate-800/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{protocol.icon}</span>
                    <div className="text-left">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-white">{protocol.name}</p>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${badge.bg} ${badge.text}`}>
                          {badge.label}
                        </span>
                      </div>
                      <p className="text-slate-500 text-xs">Airdrop: {protocol.airdropDate}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className="text-white font-bold">{protocol.currentPoints.toLocaleString()} / {protocol.totalPointsRequired.toLocaleString()}</p>
                      <p className="text-slate-500 text-xs">points</p>
                    </div>
                    <svg
                      className={`w-5 h-5 text-slate-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </button>
                
                {/* Progress Bar */}
                <div className="px-4 pb-4">
                  <div className="w-full bg-slate-700/50 rounded-full h-2">
                    <div
                      className={`h-2 rounded-full bg-gradient-to-r ${getProgressColor(protocol)} transition-all duration-500`}
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  <div className="flex justify-between mt-1">
                    <span className="text-slate-500 text-xs">{progress.toFixed(0)}% complete</span>
                    {protocol.streak > 0 && (
                      <span className="text-amber-400 text-xs">🔥 {protocol.streak} day streak</span>
                    )}
                  </div>
                </div>
                
                {/* Expanded Activities */}
                {isExpanded && (
                  <div className="border-t border-slate-700/50 p-4 space-y-2">
                    <p className="text-slate-400 text-xs uppercase tracking-wider mb-3">Activities to Earn Points</p>
                    {protocol.activities.map(activity => (
                      <div
                        key={activity.id}
                        className={`flex items-center justify-between p-3 rounded-lg ${
                          activity.completed
                            ? 'bg-emerald-500/10 border border-emerald-500/30'
                            : 'bg-slate-800/50'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-lg">{activity.icon}</span>
                          <div>
                            <p className={`text-sm font-medium ${activity.completed ? 'text-emerald-400' : 'text-white'}`}>
                              {activity.name}
                            </p>
                            <p className="text-slate-500 text-xs">{activity.description}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-cyan-400 font-semibold">+{activity.points}</p>
                          <p className="text-slate-500 text-xs capitalize">{activity.frequency}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Tips */}
      <div className="bg-gradient-to-r from-amber-500/10 to-orange-500/10 rounded-2xl border border-amber-500/20 p-4">
        <div className="flex items-start gap-3">
          <span className="text-2xl">💡</span>
          <div>
            <p className="text-white font-medium mb-1">Pro Tip</p>
            <p className="text-slate-300 text-sm">
              Consistency is key! Protocols reward users who maintain activity over time. 
              Try to hit your daily targets and maintain your streak for maximum airdrop potential.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

