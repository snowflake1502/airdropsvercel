-- Add manual_positions table for direct position tracking
-- Run this in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS manual_positions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  protocol_id UUID REFERENCES protocols(id) ON DELETE CASCADE,
  position_type TEXT NOT NULL, -- 'dlmm', 'stake', 'lst', 'nft', etc.
  position_data JSONB NOT NULL, -- Flexible storage for protocol-specific data
  notes TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_synced TIMESTAMP WITH TIME ZONE
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_manual_positions_user_id ON manual_positions(user_id);
CREATE INDEX IF NOT EXISTS idx_manual_positions_protocol ON manual_positions(protocol_id);
CREATE INDEX IF NOT EXISTS idx_manual_positions_active ON manual_positions(is_active);

-- Enable RLS
ALTER TABLE manual_positions ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own positions"
  ON manual_positions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own positions"
  ON manual_positions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own positions"
  ON manual_positions FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own positions"
  ON manual_positions FOR DELETE
  USING (auth.uid() = user_id);

-- Trigger for updated_at
CREATE TRIGGER update_manual_positions_updated_at
  BEFORE UPDATE ON manual_positions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Example queries to verify
SELECT 'manual_positions table created successfully' as status;


