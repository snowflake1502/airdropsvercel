/**
 * Task Storage - Save and retrieve daily task completions
 */

import { supabase } from './supabase'

export interface TaskCompletion {
  id?: string
  user_id: string
  wallet_address: string
  task_id: string
  task_date: string // YYYY-MM-DD format
  protocol: string
  task_name: string
  points: number
  completed: boolean
  completed_at?: string
  auto_detected: boolean
  created_at?: string
}

// Get tasks for a specific date
export async function getTasksForDate(
  userId: string,
  walletAddress: string,
  date: string
): Promise<TaskCompletion[]> {
  const { data, error } = await supabase
    .from('daily_tasks')
    .select('*')
    .eq('user_id', userId)
    .eq('wallet_address', walletAddress)
    .eq('task_date', date)

  if (error) {
    console.error('Error fetching tasks:', error)
    return []
  }

  return data || []
}

// Get all tasks for a date range (for history view)
export async function getTaskHistory(
  userId: string,
  walletAddress: string,
  startDate: string,
  endDate: string
): Promise<TaskCompletion[]> {
  const { data, error } = await supabase
    .from('daily_tasks')
    .select('*')
    .eq('user_id', userId)
    .eq('wallet_address', walletAddress)
    .gte('task_date', startDate)
    .lte('task_date', endDate)
    .order('task_date', { ascending: false })

  if (error) {
    console.error('Error fetching task history:', error)
    return []
  }

  return data || []
}

// Get incomplete tasks from past days
export async function getPendingTasks(
  userId: string,
  walletAddress: string
): Promise<TaskCompletion[]> {
  const today = new Date().toISOString().split('T')[0]
  
  const { data, error } = await supabase
    .from('daily_tasks')
    .select('*')
    .eq('user_id', userId)
    .eq('wallet_address', walletAddress)
    .eq('completed', false)
    .lt('task_date', today)
    .order('task_date', { ascending: false })
    .limit(20)

  if (error) {
    console.error('Error fetching pending tasks:', error)
    return []
  }

  return data || []
}

// Save or update a task completion
export async function saveTaskCompletion(task: TaskCompletion): Promise<boolean> {
  // Check if task already exists for this date
  const { data: existing } = await supabase
    .from('daily_tasks')
    .select('id')
    .eq('user_id', task.user_id)
    .eq('wallet_address', task.wallet_address)
    .eq('task_id', task.task_id)
    .eq('task_date', task.task_date)
    .single()

  if (existing) {
    // Update existing task
    const { error } = await supabase
      .from('daily_tasks')
      .update({
        completed: task.completed,
        completed_at: task.completed ? new Date().toISOString() : null,
        auto_detected: task.auto_detected,
      })
      .eq('id', existing.id)

    if (error) {
      console.error('Error updating task:', error)
      return false
    }
  } else {
    // Insert new task
    const { error } = await supabase
      .from('daily_tasks')
      .insert({
        user_id: task.user_id,
        wallet_address: task.wallet_address,
        task_id: task.task_id,
        task_date: task.task_date,
        protocol: task.protocol,
        task_name: task.task_name,
        points: task.points,
        completed: task.completed,
        completed_at: task.completed ? new Date().toISOString() : null,
        auto_detected: task.auto_detected,
      })

    if (error) {
      console.error('Error saving task:', error)
      return false
    }
  }

  return true
}

// Toggle task completion status
export async function toggleTaskCompletion(
  userId: string,
  walletAddress: string,
  taskId: string,
  taskDate: string,
  protocol: string,
  taskName: string,
  points: number
): Promise<boolean> {
  // Check if task exists
  const { data: existing } = await supabase
    .from('daily_tasks')
    .select('*')
    .eq('user_id', userId)
    .eq('wallet_address', walletAddress)
    .eq('task_id', taskId)
    .eq('task_date', taskDate)
    .single()

  if (existing) {
    // Toggle existing task
    const { error } = await supabase
      .from('daily_tasks')
      .update({
        completed: !existing.completed,
        completed_at: !existing.completed ? new Date().toISOString() : null,
        auto_detected: false, // Manual toggle
      })
      .eq('id', existing.id)

    if (error) {
      console.error('Error toggling task:', error)
      return false
    }
    return !existing.completed
  } else {
    // Create new task as completed
    const { error } = await supabase
      .from('daily_tasks')
      .insert({
        user_id: userId,
        wallet_address: walletAddress,
        task_id: taskId,
        task_date: taskDate,
        protocol: protocol,
        task_name: taskName,
        points: points,
        completed: true,
        completed_at: new Date().toISOString(),
        auto_detected: false,
      })

    if (error) {
      console.error('Error creating task:', error)
      return false
    }
    return true
  }
}

// Get weekly summary
export async function getWeeklySummary(
  userId: string,
  walletAddress: string
): Promise<{ date: string; completed: number; total: number; points: number }[]> {
  const today = new Date()
  const weekAgo = new Date(today)
  weekAgo.setDate(today.getDate() - 7)

  const { data, error } = await supabase
    .from('daily_tasks')
    .select('task_date, completed, points')
    .eq('user_id', userId)
    .eq('wallet_address', walletAddress)
    .gte('task_date', weekAgo.toISOString().split('T')[0])
    .lte('task_date', today.toISOString().split('T')[0])

  if (error || !data) {
    return []
  }

  // Group by date
  const byDate = new Map<string, { completed: number; total: number; points: number }>()
  
  data.forEach(task => {
    const existing = byDate.get(task.task_date) || { completed: 0, total: 0, points: 0 }
    existing.total++
    if (task.completed) {
      existing.completed++
      existing.points += task.points
    }
    byDate.set(task.task_date, existing)
  })

  return Array.from(byDate.entries()).map(([date, stats]) => ({
    date,
    ...stats
  })).sort((a, b) => b.date.localeCompare(a.date))
}

