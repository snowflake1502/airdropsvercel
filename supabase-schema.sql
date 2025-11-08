-- Airdrop Dashboard Database Schema
-- Run this in your Supabase SQL Editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Table: tracked_wallets
-- Store multiple wallets per user (connected or manual entry)
CREATE TABLE IF NOT EXISTS tracked_wallets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  wallet_address TEXT NOT NULL,
  nickname TEXT,
  is_connected BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, wallet_address)
);

-- Table: protocols
-- Protocol metadata and configuration
CREATE TABLE IF NOT EXISTS protocols (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  website_url TEXT,
  twitter_url TEXT,
  discord_url TEXT,
  logo_url TEXT,
  program_ids TEXT[], -- Solana program addresses
  airdrop_status TEXT CHECK (airdrop_status IN ('confirmed', 'high', 'medium', 'low', 'none')),
  farming_requirements JSONB,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Table: farming_activities
-- Activity templates for each protocol
CREATE TABLE IF NOT EXISTS farming_activities (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  protocol_id UUID REFERENCES protocols(id) ON DELETE CASCADE,
  activity_type TEXT NOT NULL, -- 'swap', 'lp', 'stake', 'unstake', 'nft_trade', 'bridge'
  name TEXT NOT NULL,
  description TEXT,
  points_value INTEGER DEFAULT 0,
  automation_level TEXT CHECK (automation_level IN ('full', 'partial', 'manual')),
  execution_params JSONB,
  frequency_recommendation TEXT, -- 'daily', 'weekly', 'once'
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Table: user_transactions
-- Transaction history for tracked wallets
CREATE TABLE IF NOT EXISTS user_transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  wallet_id UUID REFERENCES tracked_wallets(id) ON DELETE CASCADE,
  protocol_id UUID REFERENCES protocols(id) ON DELETE SET NULL,
  activity_id UUID REFERENCES farming_activities(id) ON DELETE SET NULL,
  tx_signature TEXT UNIQUE NOT NULL,
  tx_type TEXT,
  block_time TIMESTAMP WITH TIME ZONE,
  status TEXT CHECK (status IN ('success', 'failed', 'pending')),
  metadata JSONB,
  parsed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Table: farming_schedules
-- Automated task schedules
CREATE TABLE IF NOT EXISTS farming_schedules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  wallet_id UUID REFERENCES tracked_wallets(id) ON DELETE CASCADE,
  activity_id UUID REFERENCES farming_activities(id) ON DELETE CASCADE,
  frequency TEXT CHECK (frequency IN ('daily', 'weekly', 'custom')),
  next_execution TIMESTAMP WITH TIME ZONE,
  last_execution TIMESTAMP WITH TIME ZONE,
  is_active BOOLEAN DEFAULT true,
  automation_params JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Table: farming_recommendations
-- AI-generated suggestions for users
CREATE TABLE IF NOT EXISTS farming_recommendations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  wallet_id UUID REFERENCES tracked_wallets(id) ON DELETE CASCADE,
  protocol_id UUID REFERENCES protocols(id) ON DELETE CASCADE,
  recommendation_type TEXT, -- 'missing_activity', 'optimization', 'new_opportunity'
  priority INTEGER DEFAULT 0, -- Higher = more important
  title TEXT NOT NULL,
  description TEXT,
  action_items JSONB,
  expires_at TIMESTAMP WITH TIME ZONE,
  completed BOOLEAN DEFAULT false,
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Table: user_farming_scores
-- Track farming scores over time
CREATE TABLE IF NOT EXISTS user_farming_scores (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  wallet_id UUID REFERENCES tracked_wallets(id) ON DELETE CASCADE,
  protocol_id UUID REFERENCES protocols(id) ON DELETE CASCADE,
  score INTEGER DEFAULT 0,
  score_breakdown JSONB,
  calculated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_tracked_wallets_user_id ON tracked_wallets(user_id);
CREATE INDEX IF NOT EXISTS idx_tracked_wallets_address ON tracked_wallets(wallet_address);
CREATE INDEX IF NOT EXISTS idx_user_transactions_wallet_id ON user_transactions(wallet_id);
CREATE INDEX IF NOT EXISTS idx_user_transactions_signature ON user_transactions(tx_signature);
CREATE INDEX IF NOT EXISTS idx_user_transactions_block_time ON user_transactions(block_time DESC);
CREATE INDEX IF NOT EXISTS idx_farming_recommendations_user_id ON farming_recommendations(user_id);
CREATE INDEX IF NOT EXISTS idx_farming_recommendations_completed ON farming_recommendations(completed, expires_at);
CREATE INDEX IF NOT EXISTS idx_farming_schedules_next_execution ON farming_schedules(next_execution) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_user_farming_scores_user_protocol ON user_farming_scores(user_id, protocol_id);

-- Enable Row Level Security (RLS)
ALTER TABLE tracked_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE farming_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE farming_recommendations ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_farming_scores ENABLE ROW LEVEL SECURITY;

-- RLS Policies for tracked_wallets
CREATE POLICY "Users can view their own wallets"
  ON tracked_wallets FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own wallets"
  ON tracked_wallets FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own wallets"
  ON tracked_wallets FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own wallets"
  ON tracked_wallets FOR DELETE
  USING (auth.uid() = user_id);

-- RLS Policies for user_transactions
CREATE POLICY "Users can view transactions for their wallets"
  ON user_transactions FOR SELECT
  USING (
    wallet_id IN (
      SELECT id FROM tracked_wallets WHERE user_id = auth.uid()
    )
  );

-- RLS Policies for farming_schedules
CREATE POLICY "Users can manage their own schedules"
  ON farming_schedules FOR ALL
  USING (auth.uid() = user_id);

-- RLS Policies for farming_recommendations
CREATE POLICY "Users can view their own recommendations"
  ON farming_recommendations FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own recommendations"
  ON farming_recommendations FOR UPDATE
  USING (auth.uid() = user_id);

-- RLS Policies for user_farming_scores
CREATE POLICY "Users can view their own scores"
  ON user_farming_scores FOR SELECT
  USING (auth.uid() = user_id);

-- Protocols and farming_activities are public (read-only)
ALTER TABLE protocols ENABLE ROW LEVEL SECURITY;
ALTER TABLE farming_activities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view protocols"
  ON protocols FOR SELECT
  USING (true);

CREATE POLICY "Anyone can view farming activities"
  ON farming_activities FOR SELECT
  USING (true);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
CREATE TRIGGER update_tracked_wallets_updated_at
  BEFORE UPDATE ON tracked_wallets
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_protocols_updated_at
  BEFORE UPDATE ON protocols
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_farming_schedules_updated_at
  BEFORE UPDATE ON farming_schedules
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();


