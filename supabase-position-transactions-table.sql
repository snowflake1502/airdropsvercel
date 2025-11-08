-- Table to store all Meteora position transactions
-- This enables automatic wallet scanning and complete transaction history

CREATE TABLE IF NOT EXISTS position_transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  wallet_address TEXT NOT NULL,
  
  -- Transaction identification
  signature TEXT NOT NULL UNIQUE,
  block_time BIGINT NOT NULL,
  slot BIGINT NOT NULL,
  
  -- Transaction type and details
  tx_type TEXT NOT NULL, -- 'position_open', 'fee_claim', 'position_close', 'rebalance', 'unknown'
  
  -- Position references
  position_nft_address TEXT, -- Position NFT address (for linking to manual_positions)
  pool_address TEXT,
  
  -- Token amounts (in base units, then converted for display)
  token_x_mint TEXT,
  token_y_mint TEXT,
  token_x_amount NUMERIC,
  token_y_amount NUMERIC,
  token_x_symbol TEXT,
  token_y_symbol TEXT,
  
  -- USD values (calculated at time of transaction)
  token_x_usd NUMERIC,
  token_y_usd NUMERIC,
  total_usd NUMERIC,
  
  -- SOL balance change for wallet
  sol_change NUMERIC,
  
  -- Additional metadata
  status TEXT DEFAULT 'success', -- 'success' or 'failed'
  error_message TEXT,
  
  -- Raw transaction data for reference
  raw_transaction_data JSONB,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Indexes for fast queries
  CONSTRAINT unique_signature UNIQUE (signature)
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_position_transactions_user_id ON position_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_position_transactions_wallet_address ON position_transactions(wallet_address);
CREATE INDEX IF NOT EXISTS idx_position_transactions_position_nft ON position_transactions(position_nft_address);
CREATE INDEX IF NOT EXISTS idx_position_transactions_type ON position_transactions(tx_type);
CREATE INDEX IF NOT EXISTS idx_position_transactions_block_time ON position_transactions(block_time DESC);

-- Enable RLS
ALTER TABLE position_transactions ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can only see their own transactions
CREATE POLICY "Users can view their own transactions"
  ON position_transactions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own transactions"
  ON position_transactions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own transactions"
  ON position_transactions FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own transactions"
  ON position_transactions FOR DELETE
  USING (auth.uid() = user_id);

-- Add comment for documentation
COMMENT ON TABLE position_transactions IS 'Stores all Meteora DLMM transactions parsed from Solana blockchain for wallet-based position tracking';


