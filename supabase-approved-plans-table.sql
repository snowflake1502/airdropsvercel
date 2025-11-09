-- Table to store approved airdrop plans
-- Created when user approves a personalized plan

CREATE TABLE IF NOT EXISTS approved_plans (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  wallet_address TEXT NOT NULL,
  
  -- Plan details (stored as JSONB for flexibility)
  plan_data JSONB NOT NULL,
  
  -- Status
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed')),
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- One active plan per wallet
  UNIQUE(user_id, wallet_address)
);

-- Create index for fast lookups
CREATE INDEX IF NOT EXISTS idx_approved_plans_user_wallet ON approved_plans(user_id, wallet_address);
CREATE INDEX IF NOT EXISTS idx_approved_plans_status ON approved_plans(status);

-- Enable RLS
ALTER TABLE approved_plans ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see their own plans
CREATE POLICY "Users can view own approved plans"
  ON approved_plans FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: Users can insert their own plans
CREATE POLICY "Users can insert own approved plans"
  ON approved_plans FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can update their own plans
CREATE POLICY "Users can update own approved plans"
  ON approved_plans FOR UPDATE
  USING (auth.uid() = user_id);

-- Policy: Users can delete their own plans
CREATE POLICY "Users can delete own approved plans"
  ON approved_plans FOR DELETE
  USING (auth.uid() = user_id);

