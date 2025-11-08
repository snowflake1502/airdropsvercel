-- Seed Data for Protocols and Farming Activities
-- Run this AFTER running supabase-schema.sql

-- Insert Protocols
INSERT INTO protocols (name, slug, description, website_url, twitter_url, program_ids, airdrop_status, farming_requirements) VALUES
(
  'Meteora',
  'meteora',
  'Dynamic liquidity market maker (DLMM) protocol on Solana with concentrated liquidity pools',
  'https://meteora.ag',
  'https://twitter.com/MeteoraAG',
  ARRAY['LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo', 'DLMM3DgeuhSzGSuBQnGSiH8LGQUgwAv8qLWGPtABV8r'],
  'confirmed',
  '{"min_liquidity_duration_days": 7, "min_transactions": 5, "recommended_volume": 1000}'::jsonb
),
(
  'Jupiter',
  'jupiter',
  'Leading DEX aggregator on Solana with best price routing and limit orders',
  'https://jup.ag',
  'https://twitter.com/JupiterExchange',
  ARRAY['JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4', 'JUP4Fb2cqiRUcaTHdrPC8h2gNsA2ETXiPDD33WcGuJB'],
  'high',
  '{"min_swaps_per_week": 3, "min_volume": 100, "jup_staking_recommended": true}'::jsonb
),
(
  'Sanctum',
  'sanctum',
  'Liquid staking protocol aggregator enabling multi-LST strategies',
  'https://sanctum.so',
  'https://twitter.com/sanctumso',
  ARRAY['SP12tWFxD9oJsVWNavTTBZvMbA6gkAmxtVgxdqvyvhY'],
  'high',
  '{"min_lst_amount": 0.1, "recommended_protocols": ["jito", "marinade", "blaze"], "min_staking_duration_days": 14}'::jsonb
),
(
  'Magic Eden',
  'magic-eden',
  'Premier NFT marketplace on Solana with cross-chain support',
  'https://magiceden.io',
  'https://twitter.com/MagicEden',
  ARRAY['M2mx93ekt1fmXSVkTrUL9xVFHkmME8HTUi5Cyc5aF7K'],
  'medium',
  '{"min_nft_trades": 2, "min_listings": 1, "recommended_frequency": "weekly"}'::jsonb
);

-- Insert Farming Activities for Meteora
INSERT INTO farming_activities (protocol_id, activity_type, name, description, points_value, automation_level, frequency_recommendation, execution_params) VALUES
(
  (SELECT id FROM protocols WHERE slug = 'meteora'),
  'lp',
  'Add Liquidity to DLMM Pool',
  'Provide liquidity to a Meteora Dynamic Liquidity Market Maker pool',
  50,
  'partial',
  'weekly',
  '{"min_amount_sol": 0.1, "recommended_pools": ["SOL-USDC", "JUP-USDC"], "duration_days": 7}'::jsonb
),
(
  (SELECT id FROM protocols WHERE slug = 'meteora'),
  'lp',
  'Remove Liquidity from Pool',
  'Withdraw liquidity from Meteora pool',
  10,
  'partial',
  'weekly',
  '{"wait_for_minimum_duration": true}'::jsonb
),
(
  (SELECT id FROM protocols WHERE slug = 'meteora'),
  'swap',
  'Swap on Meteora',
  'Execute token swap directly on Meteora',
  15,
  'full',
  'daily',
  '{"min_amount_usd": 10, "max_amount_usd": 100, "slippage": 0.5}'::jsonb
);

-- Insert Farming Activities for Jupiter
INSERT INTO farming_activities (protocol_id, activity_type, name, description, points_value, automation_level, frequency_recommendation, execution_params) VALUES
(
  (SELECT id FROM protocols WHERE slug = 'jupiter'),
  'swap',
  'Swap via Jupiter Aggregator',
  'Execute token swap using Jupiter DEX aggregator',
  20,
  'full',
  'daily',
  '{"min_amount_usd": 5, "max_amount_usd": 500, "slippage": 1.0, "use_best_route": true}'::jsonb
),
(
  (SELECT id FROM protocols WHERE slug = 'jupiter'),
  'stake',
  'Stake JUP Tokens',
  'Stake JUP tokens for governance and rewards',
  100,
  'partial',
  'once',
  '{"min_jup_amount": 10, "lock_duration_days": 30}'::jsonb
),
(
  (SELECT id FROM protocols WHERE slug = 'jupiter'),
  'lp',
  'Provide Liquidity on Jupiter',
  'Add liquidity to Jupiter liquidity pools',
  40,
  'partial',
  'weekly',
  '{"min_amount_sol": 0.5, "recommended_pairs": ["JUP-SOL", "JUP-USDC"]}'::jsonb
);

-- Insert Farming Activities for Sanctum
INSERT INTO farming_activities (protocol_id, activity_type, name, description, points_value, automation_level, frequency_recommendation, execution_params) VALUES
(
  (SELECT id FROM protocols WHERE slug = 'sanctum'),
  'stake',
  'Stake SOL to LST',
  'Convert SOL to liquid staking token (JitoSOL, mSOL, bSOL, etc.)',
  80,
  'full',
  'weekly',
  '{"min_amount_sol": 0.1, "recommended_lst": ["JitoSOL", "mSOL", "bSOL"], "auto_compound": true}'::jsonb
),
(
  (SELECT id FROM protocols WHERE slug = 'sanctum'),
  'swap',
  'Swap Between LSTs',
  'Rotate between different liquid staking tokens',
  30,
  'full',
  'weekly',
  '{"rotation_strategy": "highest_apy", "slippage": 0.5}'::jsonb
),
(
  (SELECT id FROM protocols WHERE slug = 'sanctum'),
  'unstake',
  'Unstake LST to SOL',
  'Convert liquid staking token back to SOL',
  20,
  'full',
  'once',
  '{"instant_unstake": false}'::jsonb
);

-- Insert Farming Activities for Magic Eden
INSERT INTO farming_activities (protocol_id, activity_type, name, description, points_value, automation_level, frequency_recommendation, execution_params) VALUES
(
  (SELECT id FROM protocols WHERE slug = 'magic-eden'),
  'nft_trade',
  'Buy NFT on Magic Eden',
  'Purchase an NFT from Magic Eden marketplace',
  60,
  'manual',
  'weekly',
  '{"min_price_sol": 0.01, "max_price_sol": 1.0, "collection_filter": "verified"}'::jsonb
),
(
  (SELECT id FROM protocols WHERE slug = 'magic-eden'),
  'nft_trade',
  'List NFT for Sale',
  'Create a listing for your NFT on Magic Eden',
  25,
  'manual',
  'weekly',
  '{"pricing_strategy": "floor_price", "duration_days": 7}'::jsonb
),
(
  (SELECT id FROM protocols WHERE slug = 'magic-eden'),
  'nft_trade',
  'Cancel NFT Listing',
  'Cancel an active NFT listing',
  5,
  'manual',
  'weekly',
  '{}'::jsonb
);

-- Verification queries
SELECT 'Protocols Created:' as status, COUNT(*) as count FROM protocols;
SELECT 'Farming Activities Created:' as status, COUNT(*) as count FROM farming_activities;
SELECT name, slug, airdrop_status FROM protocols ORDER BY airdrop_status DESC;
SELECT p.name, COUNT(fa.id) as activity_count 
FROM protocols p 
LEFT JOIN farming_activities fa ON p.id = fa.protocol_id 
GROUP BY p.name 
ORDER BY activity_count DESC;


