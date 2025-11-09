-- Table for automation configuration
-- Stores automation settings for each wallet

CREATE TABLE IF NOT EXISTS automation_configs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  wallet_address TEXT NOT NULL,
  
  -- Budget Controls
  total_budget_usd DECIMAL(12,2) NOT NULL DEFAULT 1000.00,
  spent_usd DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  max_position_size_usd DECIMAL(12,2) NOT NULL DEFAULT 500.00,
  min_position_size_usd DECIMAL(12,2) NOT NULL DEFAULT 50.00,
  
  -- Automation Rules
  auto_claim_fees BOOLEAN DEFAULT true,
  claim_fee_threshold_usd DECIMAL(10,2) DEFAULT 5.00,
  claim_fee_interval_hours INTEGER DEFAULT 24,
  
  auto_rebalance BOOLEAN DEFAULT true,
  rebalance_threshold_percent DECIMAL(5,2) DEFAULT 20.00,
  rebalance_cooldown_hours INTEGER DEFAULT 6,
  
  auto_open_position BOOLEAN DEFAULT false,
  min_days_between_opens INTEGER DEFAULT 7,
  
  -- Safety Controls
  max_positions INTEGER DEFAULT 3,
  max_daily_spend_usd DECIMAL(12,2) DEFAULT 200.00,
  require_manual_approval BOOLEAN DEFAULT true,
  approval_threshold_usd DECIMAL(12,2) DEFAULT 100.00,
  
  -- Status
  is_active BOOLEAN DEFAULT false,
  last_run_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- One config per wallet
  UNIQUE(user_id, wallet_address)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_automation_configs_user_wallet ON automation_configs(user_id, wallet_address);
CREATE INDEX IF NOT EXISTS idx_automation_configs_active ON automation_configs(is_active);

-- Enable RLS
ALTER TABLE automation_configs ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see their own configs
CREATE POLICY "Users can view own automation configs"
  ON automation_configs FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: Users can insert their own configs
CREATE POLICY "Users can insert own automation configs"
  ON automation_configs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can update their own configs
CREATE POLICY "Users can update own automation configs"
  ON automation_configs FOR UPDATE
  USING (auth.uid() = user_id);

