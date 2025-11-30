import { createClient, SupabaseClient } from '@supabase/supabase-js'

// SECURITY: Use environment variables (Supabase anon key is safe to expose, but use env vars for flexibility)
// Note: Supabase anon keys are designed to be public (client-side safe), but we use env vars for best practices
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

// Use fallback values if env vars not set (for graceful degradation)
// SECURITY: These are Supabase anon keys (public-safe and designed to be exposed)
// Note: In production, env vars should be set in Vercel, but fallbacks allow app to work
const finalSupabaseUrl = supabaseUrl || 'https://mcakqykdtxlythsutgpx.supabase.co'
const finalSupabaseKey = supabaseAnonKey || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1jYWtxeWtkdHhseXRoc3V0Z3B4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAyNTMyNTUsImV4cCI6MjA3NTgyOTI1NX0.Nbb4oQKKQaTTe46vjTHPNTxDnqxZL4X5MswbyZD2xjY'

// Create Supabase client with build-time safety
// During build, if env vars are missing, use placeholder to allow build to succeed
// At runtime, will use actual env vars from Vercel
const isBuildTime = typeof window === 'undefined' && 
  (process.env.NEXT_PHASE === 'phase-production-build' || 
   process.env.NEXT_PHASE === 'phase-development-build' ||
   !process.env.VERCEL)

let clientUrl = finalSupabaseUrl
let clientKey = finalSupabaseKey

// During build time, use fallback values if env vars are missing
if (isBuildTime && (!clientUrl || !clientKey)) {
  clientUrl = finalSupabaseUrl
  clientKey = finalSupabaseKey
}

// Runtime check - log warning if using fallback values (env vars not set in Vercel)
const isUsingFallback = !supabaseUrl || !supabaseAnonKey
if (!isBuildTime && isUsingFallback) {
  console.warn(
    '⚠️ Using fallback Supabase credentials. For production, set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in Vercel environment variables.'
  )
}

// Use the final values (will use fallbacks if env vars not set)
const safeClientUrl = clientUrl || finalSupabaseUrl
const safeClientKey = clientKey || finalSupabaseKey

export const supabase = createClient(safeClientUrl, safeClientKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true
  }
})

// Database types (to be extended as we build the schema)
export type Database = {
  public: {
    Tables: {
      users: {
        Row: {
          id: string
          email: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          email: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          email?: string
          created_at?: string
          updated_at?: string
        }
      }
      airdrop_plans: {
        Row: {
          id: string
          user_id: string
          name: string
          description: string
          start_date: string
          end_date: string
          status: 'active' | 'completed' | 'paused'
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          name: string
          description?: string
          start_date: string
          end_date: string
          status?: 'active' | 'completed' | 'paused'
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          name?: string
          description?: string
          start_date?: string
          end_date?: string
          status?: 'active' | 'completed' | 'paused'
          created_at?: string
          updated_at?: string
        }
      }
      protocols: {
        Row: {
          id: string
          name: string
          description: string
          category: string
          ecosystem: 'solana' | 'ethereum' | 'other'
          website_url?: string
          twitter_url?: string
          discord_url?: string
          airdrop_potential: 'high' | 'medium' | 'low' | 'confirmed'
          status: 'active' | 'inactive' | 'upcoming'
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          description?: string
          category: string
          ecosystem?: 'solana' | 'ethereum' | 'other'
          website_url?: string
          twitter_url?: string
          discord_url?: string
          airdrop_potential?: 'high' | 'medium' | 'low' | 'confirmed'
          status?: 'active' | 'inactive' | 'upcoming'
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          description?: string
          category?: string
          ecosystem?: 'solana' | 'ethereum' | 'other'
          website_url?: string
          twitter_url?: string
          discord_url?: string
          airdrop_potential?: 'high' | 'medium' | 'low' | 'confirmed'
          status?: 'active' | 'inactive' | 'upcoming'
          created_at?: string
          updated_at?: string
        }
      }
    }
  }
}

