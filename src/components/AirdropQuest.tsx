'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { 
  getTasksForDate, 
  toggleTaskCompletion, 
  saveTaskCompletion,
  getPendingTasks,
  getWeeklySummary,
  getTaskHistory,
  TaskCompletion 
} from '@/lib/task-storage'
import { quickCheckJupiterSwaps, checkSanctumLST } from '@/lib/jupiter-api'

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
  id: string
  protocol: string
  task: string
  points: number
  completed: boolean
  autoDetected: boolean
  icon: string
  instruction: string
  link?: string
}

// Protocol point targets based on known airdrop criteria
const PROTOCOL_CONFIGS: Omit<ProtocolTarget, 'currentPoints' | 'streak' | 'lastActivityDate'>[] = [
  {
    id: 'meteora',
    name: 'Meteora',
    icon: '🌊',
    color: 'cyan',
    totalPointsRequired: 500, // Lowered - more achievable milestone
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
    totalPointsRequired: 200, // Lowered - Jupiter has many users, activity matters more
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
    totalPointsRequired: 300, // Lowered - LST holding should show progress quickly
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
  // Meteora
  hasActivePosition: boolean
  claimedFeesToday: boolean
  claimedFeesThisWeek: boolean
  openedPositionToday: boolean
  openedPositionThisWeek: boolean
  rebalancedThisWeek: boolean
  totalTransactionsToday: number
  totalTransactionsThisWeek: number
  // Jupiter
  hasJupiterSwapToday: boolean
  hasJupiterLimitOrderToday: boolean
  hasJupiterPerpsToday: boolean
  // Sanctum
  hasSanctumLST: boolean
}

// Analyze transactions to determine activity status (Meteora only)
const analyzeMeteoraActivity = (transactions: any[]): Omit<ActivityStatus, 'hasJupiterSwapToday' | 'hasJupiterLimitOrderToday' | 'hasJupiterPerpsToday' | 'hasSanctumLST'> => {
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

// Task definitions with instructions
const TASK_DEFINITIONS = {
  'meteora-lp': {
    task: 'Maintain LP Position',
    protocol: 'Meteora',
    points: 50,
    icon: '🌊',
    instruction: 'Keep an active liquidity position on Meteora DLMM',
    link: 'https://app.meteora.ag/dlmm'
  },
  'jupiter-swap': {
    task: 'Make a Swap',
    protocol: 'Jupiter',
    points: 10,
    icon: '🪐',
    instruction: 'Swap any token on Jupiter Exchange (min $1)',
    link: 'https://jup.ag'
  },
  'sanctum-lst': {
    task: 'Check LST Position',
    protocol: 'Sanctum',
    points: 40,
    icon: '⭐',
    instruction: 'Hold or stake SOL in a Sanctum LST (e.g., INF, bSOL)',
    link: 'https://app.sanctum.so'
  },
  'meteora-fees': {
    task: 'Claim Fees',
    protocol: 'Meteora',
    points: 25,
    icon: '💰',
    instruction: 'Claim accumulated fees from your Meteora position',
    link: 'https://app.meteora.ag/dlmm'
  },
  'weekly-review': {
    task: 'Weekly Review & Rebalance',
    protocol: 'Meteora',
    points: 50,
    icon: '📊',
    instruction: 'Rebalance Meteora positions if out of range, check APRs',
    link: 'https://app.meteora.ag/dlmm'
  },
  'jupiter-limit': {
    task: 'Place Limit Order',
    protocol: 'Jupiter',
    points: 20,
    icon: '📈',
    instruction: 'Set a limit order on Jupiter (any amount)',
    link: 'https://jup.ag/limit'
  },
  'jupiter-perp': {
    task: 'Perp Trade',
    protocol: 'Jupiter',
    points: 30,
    icon: '📉',
    instruction: 'Open a perpetual position on Jupiter Perps',
    link: 'https://jup.ag/perps'
  },
}

// Generate daily tasks based on day of week and activity status
const generateDailyTasks = (activityStatus: ActivityStatus): DailyTask[] => {
  const dayOfWeek = getDayOfWeek()
  const tasks: DailyTask[] = []
  
  // === METEORA TASKS ===
  // Meteora LP - always show (core daily task)
  const meteoraLp = TASK_DEFINITIONS['meteora-lp']
  tasks.push({
    id: 'meteora-lp',
    ...meteoraLp,
    completed: activityStatus.hasActivePosition,
    autoDetected: activityStatus.hasActivePosition,
  })
  
  // Claim fees - show on Wed and Sat (fee claim days)
  if (dayOfWeek === 3 || dayOfWeek === 6) {
    const meteoraFees = TASK_DEFINITIONS['meteora-fees']
    tasks.push({
      id: 'meteora-fees',
      ...meteoraFees,
      completed: activityStatus.claimedFeesToday,
      autoDetected: activityStatus.claimedFeesToday,
    })
  }
  
  // === JUPITER TASKS ===
  // Jupiter swap - every day (easy points) - AUTO-DETECTED
  const jupSwap = TASK_DEFINITIONS['jupiter-swap']
  tasks.push({
    id: 'jupiter-swap',
    ...jupSwap,
    completed: activityStatus.hasJupiterSwapToday,
    autoDetected: activityStatus.hasJupiterSwapToday,
  })
  
  // Jupiter limit order - Mon, Wed, Fri - AUTO-DETECTED
  if (dayOfWeek === 1 || dayOfWeek === 3 || dayOfWeek === 5) {
    const jupLimit = TASK_DEFINITIONS['jupiter-limit']
    tasks.push({
      id: 'jupiter-limit',
      ...jupLimit,
      completed: activityStatus.hasJupiterLimitOrderToday,
      autoDetected: activityStatus.hasJupiterLimitOrderToday,
    })
  }
  
  // Jupiter perps - Tue, Thu, Sat - AUTO-DETECTED
  if (dayOfWeek === 2 || dayOfWeek === 4 || dayOfWeek === 6) {
    const jupPerp = TASK_DEFINITIONS['jupiter-perp']
    tasks.push({
      id: 'jupiter-perp',
      ...jupPerp,
      completed: activityStatus.hasJupiterPerpsToday,
      autoDetected: activityStatus.hasJupiterPerpsToday,
    })
  }
  
  // === SANCTUM TASKS ===
  // Sanctum LST - every day (passive holding) - AUTO-DETECTED
  const sanctumLst = TASK_DEFINITIONS['sanctum-lst']
  tasks.push({
    id: 'sanctum-lst',
    ...sanctumLst,
    completed: activityStatus.hasSanctumLST,
    autoDetected: activityStatus.hasSanctumLST,
  })
  
  // === WEEKLY TASKS ===
  // Weekly review - Saturday
  if (dayOfWeek === 6) {
    const weeklyReview = TASK_DEFINITIONS['weekly-review']
    tasks.push({
      id: 'weekly-review',
      ...weeklyReview,
      completed: activityStatus.rebalancedThisWeek || activityStatus.totalTransactionsThisWeek >= 3,
      autoDetected: activityStatus.rebalancedThisWeek || activityStatus.totalTransactionsThisWeek >= 3,
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
  const [pendingTasks, setPendingTasks] = useState<TaskCompletion[]>([])
  const [showPending, setShowPending] = useState(false)
  const [savingTask, setSavingTask] = useState<string | null>(null)
  const [hoveredTask, setHoveredTask] = useState<string | null>(null)
  const [savedTasksMap, setSavedTasksMap] = useState<Map<string, boolean>>(new Map())
  const [isLoadingActivity, setIsLoadingActivity] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [taskHistory, setTaskHistory] = useState<TaskCompletion[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [weeklySummary, setWeeklySummary] = useState<{ date: string; completed: number; total: number; points: number }[]>([])

  const today = new Date().toISOString().split('T')[0]

  // Load saved tasks FIRST before generating tasks
  useEffect(() => {
    if (userId && walletAddress) {
      loadSavedTasksFirst()
    }
  }, [userId, walletAddress])

  // Then calculate points and generate tasks
  useEffect(() => {
    if (walletAddress) {
      calculatePointsWithMultiProtocol()
    }
  }, [transactions, walletAddress, savedTasksMap])

  // Load pending tasks
  useEffect(() => {
    if (userId && walletAddress) {
      loadPendingTasks()
    }
  }, [userId, walletAddress])

  // Load saved task completions BEFORE generating tasks
  const loadSavedTasksFirst = async () => {
    if (!userId || !walletAddress) return
    
    try {
      const savedTasks = await getTasksForDate(userId, walletAddress, today)
      const taskMap = new Map<string, boolean>()
      savedTasks.forEach(task => {
        if (task.completed) {
          taskMap.set(task.task_id, true)
        }
      })
      setSavedTasksMap(taskMap)
      console.log('📋 Loaded saved tasks:', Array.from(taskMap.keys()))
    } catch (error) {
      console.error('Error loading saved tasks:', error)
    }
  }

  // Calculate points with multi-protocol detection
  const calculatePointsWithMultiProtocol = async () => {
    setIsLoadingActivity(true)
    
    try {
      // Analyze Meteora activity from transactions
      const meteoraStatus = analyzeMeteoraActivity(transactions)
      
      // Check Jupiter and Sanctum activity (in parallel)
      let jupiterStatus = { hasSwapToday: false, hasLimitOrderToday: false, hasPerpsToday: false }
      let hasSanctumLST = false
      
      if (walletAddress) {
        try {
          const [jupResult, sanctumResult] = await Promise.all([
            quickCheckJupiterSwaps(walletAddress),
            checkSanctumLST(walletAddress)
          ])
          jupiterStatus = jupResult
          hasSanctumLST = sanctumResult
          console.log('🪐 Jupiter activity:', jupiterStatus)
          console.log('⭐ Sanctum LST:', hasSanctumLST)
        } catch (err) {
          console.warn('Could not check multi-protocol activity:', err)
        }
      }
      
      // Combine all activity status
      const fullStatus: ActivityStatus = {
        ...meteoraStatus,
        hasJupiterSwapToday: jupiterStatus.hasSwapToday,
        hasJupiterLimitOrderToday: jupiterStatus.hasLimitOrderToday,
        hasJupiterPerpsToday: jupiterStatus.hasPerpsToday,
        hasSanctumLST,
      }
      
      setActivityStatus(fullStatus)
      
      // Generate tasks with auto-detection AND preserved manual completions
      const generatedTasks = generateDailyTasks(fullStatus)
      
      // Merge with saved task completions (preserve manual completions)
      const mergedTasks = generatedTasks.map(task => {
        const wasManuallySaved = savedTasksMap.get(task.id)
        if (wasManuallySaved && !task.autoDetected) {
          return { ...task, completed: true, autoDetected: false }
        }
        return task
      })
      
      setDailyTasks(mergedTasks)
      
      // === CALCULATE METEORA POINTS ===
      const opens = transactions.filter(tx => tx.tx_type === 'position_open')
      const fees = transactions.filter(tx => tx.tx_type === 'fee_claim')
      const uniqueDays = new Set(transactions.map(tx => 
        new Date(tx.block_time * 1000).toDateString()
      ))
      
      let meteoraPoints = opens.length * 50 + fees.length * 25 + uniqueDays.size * 10
      if (fullStatus.hasActivePosition) meteoraPoints += 100
      
      // Calculate streak from Meteora transactions
      let meteoraStreak = 0
      const sortedDates = Array.from(uniqueDays).sort().reverse()
      for (let i = 0; i < sortedDates.length; i++) {
        const date = new Date(sortedDates[i])
        const expectedDate = new Date()
        expectedDate.setDate(expectedDate.getDate() - i)
        if (date.toDateString() === expectedDate.toDateString()) {
          meteoraStreak++
        } else {
          break
        }
      }
      if (meteoraStreak >= 7) meteoraPoints += 100
      if (meteoraStreak >= 30) meteoraPoints += 300
      
      // Calculate overall streak (any protocol activity today counts)
      // If user has ANY active position/holding today, count as a streak day
      const hasActivityToday = fullStatus.hasActivePosition || 
                               fullStatus.hasJupiterSwapToday || 
                               fullStatus.hasSanctumLST
      const currentStreak = hasActivityToday ? Math.max(1, meteoraStreak) : 0
      setStreak(currentStreak)
      
      // === CALCULATE JUPITER POINTS ===
      let jupiterPoints = 0
      if (fullStatus.hasJupiterSwapToday) jupiterPoints += 10 // Swap today
      if (fullStatus.hasJupiterLimitOrderToday) jupiterPoints += 20 // Limit order today
      if (fullStatus.hasJupiterPerpsToday) jupiterPoints += 30 // Perps today
      // Note: Historical Jupiter activity would need transaction parsing like Meteora
      
      // === CALCULATE SANCTUM POINTS ===
      let sanctumPoints = 0
      if (fullStatus.hasSanctumLST) {
        sanctumPoints += 100 // Holding LST bonus
        sanctumPoints += 40 // Daily holding points
      }
      
      console.log('📊 Protocol Points:', { meteoraPoints, jupiterPoints, sanctumPoints })
      
      // Update protocols with ALL calculated points
      const updatedProtocols = PROTOCOL_CONFIGS.map(config => {
        let points = 0
        let protocolStreak = 0
        
        if (config.id === 'meteora') {
          points = meteoraPoints
          protocolStreak = currentStreak
        } else if (config.id === 'jupiter') {
          points = jupiterPoints
        } else if (config.id === 'sanctum') {
          points = sanctumPoints
        }
        
        const updatedActivities = config.activities.map(activity => {
          let completed = false
          let completedToday = false
          
          // METEORA activities
          if (config.id === 'meteora') {
            switch (activity.id) {
              case 'meteora-lp':
                completed = fullStatus.hasActivePosition
                completedToday = fullStatus.hasActivePosition
                break
              case 'meteora-fees':
                completed = fees.length > 0
                completedToday = fullStatus.claimedFeesToday
                break
              case 'meteora-rebalance':
                completed = fullStatus.rebalancedThisWeek
                break
              case 'meteora-new-pool':
                completed = opens.length > 0
                completedToday = fullStatus.openedPositionToday
                break
              case 'meteora-duration':
                completed = currentStreak >= 30
                break
            }
          }
          
          // JUPITER activities
          if (config.id === 'jupiter') {
            switch (activity.id) {
              case 'jup-swap':
                completed = fullStatus.hasJupiterSwapToday
                completedToday = fullStatus.hasJupiterSwapToday
                break
              case 'jup-limit':
                completed = fullStatus.hasJupiterLimitOrderToday
                completedToday = fullStatus.hasJupiterLimitOrderToday
                break
              case 'jup-perp':
                completed = fullStatus.hasJupiterPerpsToday
                completedToday = fullStatus.hasJupiterPerpsToday
                break
              case 'jup-dca':
                // Would need DCA detection
                break
              case 'jup-stake':
                // Would need JUP staking detection
                break
            }
          }
          
          // SANCTUM activities
          if (config.id === 'sanctum') {
            switch (activity.id) {
              case 'sanctum-stake':
                completed = fullStatus.hasSanctumLST
                completedToday = fullStatus.hasSanctumLST
                break
              case 'sanctum-swap':
                // Would need LST swap detection
                break
              case 'sanctum-infinity':
                // Would need Infinity pool detection
                break
              case 'sanctum-hold':
                // Would need 90-day tracking
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
      const totalPts = updatedProtocols.reduce((sum, p) => sum + p.currentPoints, 0)
      setTotalPoints(totalPts)
      setLevel(Math.floor(totalPts / 500) + 1)
      
      console.log('📊 Updated Protocols:', updatedProtocols.map(p => ({ name: p.name, points: p.currentPoints })))
      
    } catch (error) {
      console.error('Error calculating points:', error)
    } finally {
      setIsLoadingActivity(false)
    }
  }

  // Load pending tasks from previous days
  const loadPendingTasks = async () => {
    if (!userId || !walletAddress) return
    
    try {
      const pending = await getPendingTasks(userId, walletAddress)
      setPendingTasks(pending)
    } catch (error) {
      console.error('Error loading pending tasks:', error)
    }
  }

  // Handle manual task toggle
  const handleTaskToggle = async (task: DailyTask) => {
    if (!userId || !walletAddress) return
    if (task.autoDetected && task.completed) return // Can't manually uncheck auto-detected
    
    setSavingTask(task.id)
    
    try {
      const newStatus = await toggleTaskCompletion(
        userId,
        walletAddress,
        task.id,
        today,
        task.protocol,
        task.task,
        task.points
      )
      
      // Update local state immediately
      setDailyTasks(prev => prev.map(t => 
        t.id === task.id ? { ...t, completed: newStatus, autoDetected: false } : t
      ))
      
      // Also update the saved tasks map to persist across re-renders
      setSavedTasksMap(prev => {
        const newMap = new Map(prev)
        if (newStatus) {
          newMap.set(task.id, true)
        } else {
          newMap.delete(task.id)
        }
        return newMap
      })
    } catch (error) {
      console.error('Error toggling task:', error)
    } finally {
      setSavingTask(null)
    }
  }

  // Handle completing a pending task from previous days
  const handlePendingTaskComplete = async (task: TaskCompletion) => {
    if (!userId || !walletAddress) return
    
    try {
      await toggleTaskCompletion(
        userId,
        walletAddress,
        task.task_id,
        task.task_date,
        task.protocol,
        task.task_name,
        task.points
      )
      loadPendingTasks()
    } catch (error) {
      console.error('Error completing pending task:', error)
    }
  }

  // Load task history (last 30 days)
  const loadTaskHistory = async () => {
    if (!userId || !walletAddress) return
    setHistoryLoading(true)
    
    try {
      const endDate = new Date().toISOString().split('T')[0]
      const startDate = new Date()
      startDate.setDate(startDate.getDate() - 30)
      
      const [history, summary] = await Promise.all([
        getTaskHistory(userId, walletAddress, startDate.toISOString().split('T')[0], endDate),
        getWeeklySummary(userId, walletAddress)
      ])
      
      setTaskHistory(history)
      setWeeklySummary(summary)
    } catch (error) {
      console.error('Error loading task history:', error)
    } finally {
      setHistoryLoading(false)
    }
  }

  // Toggle history view
  const toggleHistoryView = () => {
    if (!showHistory) {
      loadTaskHistory()
    }
    setShowHistory(!showHistory)
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
  const currentDayOfWeek = getDayOfWeek()

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
            <p className="text-2xl font-bold text-emerald-400">{protocols.filter(p => p.currentPoints >= p.totalPointsRequired * 0.25).length}/{protocols.length}</p>
            <p className="text-slate-400 text-xs">Protocols Active</p>
          </div>
        </div>
      </div>

      {/* Daily Tasks Calendar */}
      <div className="bg-slate-800/30 rounded-2xl border border-slate-700/50 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-white flex items-center gap-2">
            📅 Today&apos;s Tasks
            <span className="text-xs bg-cyan-500/20 text-cyan-400 px-2 py-0.5 rounded-full">
              {dayNames[currentDayOfWeek]}
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
                idx === currentDayOfWeek
                  ? 'bg-gradient-to-r from-cyan-500 to-violet-500 text-white'
                  : idx < currentDayOfWeek
                  ? 'bg-emerald-500/20 text-emerald-400'
                  : 'bg-slate-700/50 text-slate-500'
              }`}
            >
              {day}
              {idx < currentDayOfWeek && <span className="ml-1">✓</span>}
            </div>
          ))}
        </div>
        
        {/* Task List */}
        <div className="space-y-2">
          {dailyTasks.map((task) => (
            <div
              key={task.id}
              className={`relative p-4 rounded-xl border transition-all ${
                task.completed
                  ? 'bg-gradient-to-r from-emerald-500/20 to-emerald-500/10 border-emerald-500/40 shadow-lg shadow-emerald-500/10'
                  : 'bg-slate-800/50 border-slate-700/50 hover:border-cyan-500/50'
              }`}
              onMouseEnter={() => setHoveredTask(task.id)}
              onMouseLeave={() => setHoveredTask(null)}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 flex-1">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                    task.completed ? 'bg-emerald-500/30' : 'bg-slate-700/50'
                  }`}>
                    <span className="text-xl">{task.icon}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className={`font-medium ${task.completed ? 'text-emerald-400' : 'text-white'}`}>
                        {task.task}
                      </p>
                      {task.completed && task.autoDetected && (
                        <span className="text-xs bg-cyan-500/20 text-cyan-400 px-2 py-0.5 rounded-full">
                          ✨ Auto-detected
                        </span>
                      )}
                      {task.completed && !task.autoDetected && (
                        <span className="text-xs bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full">
                          ✓ Done
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-slate-500 text-xs">{task.protocol}</span>
                      <span className="text-slate-600">•</span>
                      <span className="text-slate-400 text-xs truncate">{task.instruction}</span>
                    </div>
                  </div>
                </div>
                
                <div className="flex items-center gap-3 ml-3">
                  {/* Link button */}
                  {task.link && (
                    <a
                      href={task.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-2 rounded-lg bg-slate-700/50 hover:bg-cyan-500/20 text-slate-400 hover:text-cyan-400 transition-all"
                      title="Open protocol"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                    </a>
                  )}
                  
                  <span className={`font-semibold whitespace-nowrap ${task.completed ? 'text-emerald-400' : 'text-cyan-400'}`}>
                    {task.completed ? '✓ ' : '+'}{task.points} pts
                  </span>
                  
                  {/* Toggle button */}
                  <button
                    onClick={() => handleTaskToggle(task)}
                    disabled={savingTask === task.id || (task.autoDetected && task.completed)}
                    className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${
                      task.completed
                        ? task.autoDetected
                          ? 'bg-gradient-to-r from-cyan-500 to-cyan-400 text-white cursor-not-allowed'
                          : 'bg-gradient-to-r from-emerald-500 to-emerald-400 text-white shadow-lg shadow-emerald-500/30 hover:opacity-80'
                        : 'border-2 border-slate-600 hover:border-cyan-500 hover:bg-cyan-500/10 cursor-pointer'
                    } ${savingTask === task.id ? 'opacity-50' : ''}`}
                    title={
                      task.autoDetected && task.completed 
                        ? 'Auto-detected from on-chain activity' 
                        : task.completed 
                          ? 'Click to unmark' 
                          : 'Click to mark as done'
                    }
                  >
                    {savingTask === task.id ? (
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : task.completed ? (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    ) : (
                      <span className="w-3 h-3 rounded-full bg-slate-600"></span>
                    )}
                  </button>
                </div>
              </div>
              
              {/* Tooltip on hover */}
              {hoveredTask === task.id && !task.completed && (
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg shadow-xl z-10 whitespace-nowrap">
                  <p className="text-sm text-white font-medium">How to complete:</p>
                  <p className="text-xs text-slate-400 mt-1">{task.instruction}</p>
                  {task.link && (
                    <p className="text-xs text-cyan-400 mt-1 flex items-center gap-1">
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                      Click link to open protocol
                    </p>
                  )}
                  <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 w-2 h-2 bg-slate-900 border-r border-b border-slate-700 transform rotate-45"></div>
                </div>
              )}
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

        {/* Pending Tasks from Previous Days */}
        {pendingTasks.length > 0 && (
          <div className="mt-4">
            <button
              onClick={() => setShowPending(!showPending)}
              className="w-full flex items-center justify-between p-3 bg-amber-500/10 rounded-xl border border-amber-500/30 hover:bg-amber-500/15 transition-all"
            >
              <div className="flex items-center gap-2">
                <span className="text-lg">⏰</span>
                <span className="text-amber-400 font-medium">
                  {pendingTasks.length} Pending Task{pendingTasks.length > 1 ? 's' : ''} from Previous Days
                </span>
              </div>
              <svg
                className={`w-5 h-5 text-amber-400 transition-transform ${showPending ? 'rotate-180' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            
            {showPending && (
              <div className="mt-2 space-y-2">
                {pendingTasks.slice(0, 5).map((task) => (
                  <div
                    key={`${task.task_id}-${task.task_date}`}
                    className="flex items-center justify-between p-3 bg-slate-800/30 rounded-xl border border-slate-700/30"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-amber-500">⚠️</span>
                      <div>
                        <p className="text-white text-sm font-medium">{task.task_name}</p>
                        <p className="text-slate-500 text-xs">
                          {task.protocol} • {new Date(task.task_date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-cyan-400 text-sm">+{task.points} pts</span>
                      <button
                        onClick={() => handlePendingTaskComplete(task)}
                        className="px-3 py-1.5 text-xs font-medium bg-emerald-500/20 text-emerald-400 rounded-lg hover:bg-emerald-500/30 transition-all"
                      >
                        Mark Done
                      </button>
                    </div>
                  </div>
                ))}
                {pendingTasks.length > 5 && (
                  <p className="text-center text-slate-500 text-xs py-2">
                    + {pendingTasks.length - 5} more pending tasks
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {/* View Task History Button */}
        <div className="mt-4">
          <button
            onClick={toggleHistoryView}
            className="w-full flex items-center justify-center gap-2 p-3 bg-slate-700/30 rounded-xl border border-slate-600/30 hover:bg-slate-700/50 transition-all text-slate-300 hover:text-white"
          >
            <span>📅</span>
            <span className="font-medium">{showHistory ? 'Hide' : 'View'} Task History</span>
            <svg
              className={`w-4 h-4 transition-transform ${showHistory ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {/* Task History Panel */}
          {showHistory && (
            <div className="mt-3 bg-slate-800/50 rounded-xl border border-slate-700/50 p-4">
              {historyLoading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-2 border-cyan-500 border-t-transparent"></div>
                </div>
              ) : (
                <>
                  {/* Weekly Summary */}
                  {weeklySummary.length > 0 && (
                    <div className="mb-4">
                      <h4 className="text-sm font-medium text-slate-300 mb-3">📊 Last 7 Days</h4>
                      <div className="grid grid-cols-7 gap-1">
                        {Array.from({ length: 7 }).map((_, i) => {
                          const date = new Date()
                          date.setDate(date.getDate() - (6 - i))
                          const dateStr = date.toISOString().split('T')[0]
                          const dayData = weeklySummary.find(d => d.date === dateStr)
                          const hasActivity = dayData && dayData.completed > 0
                          const isToday = i === 6
                          
                          return (
                            <div 
                              key={dateStr}
                              className={`p-2 rounded-lg text-center ${
                                hasActivity 
                                  ? 'bg-emerald-500/20 border border-emerald-500/30' 
                                  : 'bg-slate-700/30 border border-slate-700/50'
                              } ${isToday ? 'ring-2 ring-cyan-500/50' : ''}`}
                            >
                              <p className="text-xs text-slate-500">{date.toLocaleDateString('en-US', { weekday: 'short' })}</p>
                              <p className={`text-sm font-bold ${hasActivity ? 'text-emerald-400' : 'text-slate-600'}`}>
                                {dayData?.completed || 0}
                              </p>
                              {hasActivity && (
                                <p className="text-xs text-emerald-400">+{dayData?.points}</p>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {/* Task History List */}
                  <h4 className="text-sm font-medium text-slate-300 mb-3">📜 Recent Tasks</h4>
                  {taskHistory.length > 0 ? (
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {/* Group by date */}
                      {Array.from(new Set(taskHistory.map(t => t.task_date))).slice(0, 7).map(date => {
                        const tasksForDate = taskHistory.filter(t => t.task_date === date)
                        const completedCount = tasksForDate.filter(t => t.completed).length
                        const totalPoints = tasksForDate.filter(t => t.completed).reduce((sum, t) => sum + t.points, 0)
                        
                        return (
                          <div key={date} className="bg-slate-900/50 rounded-lg p-3">
                            <div className="flex items-center justify-between mb-2">
                              <p className="text-sm font-medium text-white">
                                {new Date(date + 'T12:00:00').toLocaleDateString('en-US', { 
                                  weekday: 'long', 
                                  month: 'short', 
                                  day: 'numeric' 
                                })}
                              </p>
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-slate-400">{completedCount}/{tasksForDate.length} tasks</span>
                                {totalPoints > 0 && (
                                  <span className="text-xs text-emerald-400 bg-emerald-500/20 px-2 py-0.5 rounded-full">
                                    +{totalPoints} pts
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="flex flex-wrap gap-1">
                              {tasksForDate.map(task => (
                                <span
                                  key={task.task_id}
                                  className={`px-2 py-0.5 text-xs rounded-full ${
                                    task.completed 
                                      ? 'bg-emerald-500/20 text-emerald-400' 
                                      : 'bg-slate-700/50 text-slate-500'
                                  }`}
                                  title={task.task_name}
                                >
                                  {task.protocol === 'Meteora' ? '🌊' : 
                                   task.protocol === 'Jupiter' ? '🪐' : 
                                   task.protocol === 'Sanctum' ? '⭐' : '📋'} 
                                  {task.completed ? '✓' : '○'}
                                </span>
                              ))}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  ) : (
                    <div className="text-center py-6">
                      <span className="text-3xl">📭</span>
                      <p className="text-slate-400 text-sm mt-2">No task history yet</p>
                      <p className="text-slate-500 text-xs">Complete today's tasks to start tracking!</p>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
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

