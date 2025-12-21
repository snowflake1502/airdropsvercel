/**
 * Meteora Position Value Fetcher
 * Fetches real-time position values directly from Meteora's API
 */

import {
  isMeteoraDLMMTransaction,
  determineTransactionType,
  extractPositionNFTAddress,
  type ParsedTransaction,
} from './meteora-transaction-parser'

export interface MeteoraPositionValue {
  positionAddress: string
  pairAddress: string
  pairName: string
  owner: string
  tokenX: {
    symbol: string
    mint: string
    amount: number
    price: number
    valueUSD: number
  }
  tokenY: {
    symbol: string
    mint: string
    amount: number
    price: number
    valueUSD: number
  }
  totalValueUSD: number
  unclaimedFeesUSD: number
  totalFeesClaimed: number
  isOutOfRange: boolean
  feeAPR24h: number
}

export interface MeteoraPositionsResult {
  positions: MeteoraPositionValue[]
  totalValueUSD: number
  totalUnclaimedFeesUSD: number
  errors: string[]
}

const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
const SOL_MINT = 'So11111111111111111111111111111111111111112'
const METEORA_DLMM_PROGRAM = 'LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo'

/**
 * Get RPC URL (Helius if available, fallback to public)
 */
function getRpcUrl(): string {
  if (typeof window === 'undefined') {
    // Server-side: Use Helius RPC URL from environment
    const heliusUrl = process.env.HELIUS_RPC_URL || 
                     process.env.SOLANA_RPC_URL ||
                     'https://api.mainnet-beta.solana.com'
    return heliusUrl
  }
  return `${window.location.origin}/api/rpc`
}

/**
 * Fetch position value using Helius transaction history (works for closed positions)
 * Similar to how metflex.io queries Meteora positions
 */
async function fetchMeteoraPositionViaHelius(
  positionAddress: string
): Promise<MeteoraPositionValue | null> {
  try {
    const rpcUrl = getRpcUrl()
    
    // #region agent log
    console.log(`[DEBUG-HELIUS] Querying transaction history for position NFT: ${positionAddress}`);
    // #endregion

    // Use Helius getTransactionsForAddress to get all transactions for this position NFT
    const response = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getTransactionsForAddress',
        params: [
          positionAddress,
          {
            transactionDetails: 'full',
            sortOrder: 'desc', // Newest first
            limit: 100,
            filters: {
              status: 'succeeded' // Only successful transactions
            }
          }
        ]
      })
    })

    if (!response.ok) {
      console.warn(`Helius RPC error for position ${positionAddress}: ${response.status}`)
      return null
    }

    const data = await response.json()
    
    if (data.error) {
      console.warn(`Helius RPC error: ${data.error.message}`)
      return null
    }

    const transactions = data.result?.data || []
    
    // #region agent log
    console.log(`[DEBUG-HELIUS] Found ${transactions.length} transactions for position NFT`);
    // #endregion

    if (transactions.length === 0) {
      return null
    }

    // Parse transactions to find:
    // 1. Initial deposit (position open)
    // 2. Fee claims
    // 3. Withdrawals (position close)
    // 4. Current position state (if still active)

    // For now, try Meteora API first, fallback to transaction parsing if needed
    // This is a placeholder - full implementation would parse all transactions
    // and calculate position value from transaction history
    
    return null // Will implement full parsing next
  } catch (error: any) {
    console.error(`Error fetching position via Helius ${positionAddress}:`, error.message)
    return null
  }
}

/**
 * Fetch real-time value for a single Meteora position
 */
export async function fetchMeteoraPositionValue(
  positionAddress: string
): Promise<MeteoraPositionValue | null> {
  try {
    // #region agent log
    console.log('[DEBUG-A] Fetching position:', JSON.stringify({positionAddress}));
    // #endregion
    // Step 1: Get position data
    const positionResponse = await fetch(
      `https://dlmm-api.meteora.ag/position/${positionAddress}`,
      {
        headers: { Accept: 'application/json' },
        next: { revalidate: 60 }, // Cache for 60 seconds
      }
    )

    if (!positionResponse.ok) {
      console.warn(`Meteora API error for position ${positionAddress}: ${positionResponse.status}`)
      return null
    }

    const positionData = await positionResponse.json()
    
    // #region agent log
    console.log('[DEBUG-B] Position API response:', JSON.stringify({
      positionAddress,
      pairAddress: positionData.pair_address,
      owner: positionData.owner,
      hasPositionData: !!positionData,
      positionDataKeys: positionData ? Object.keys(positionData).slice(0, 20) : [],
    }));
    // #endregion

    // Step 2: Get pair/pool data for token info
    const pairResponse = await fetch(
      `https://dlmm-api.meteora.ag/pair/${positionData.pair_address}`,
      {
        headers: { Accept: 'application/json' },
        next: { revalidate: 60 },
      }
    )

    if (!pairResponse.ok) {
      console.warn(`Meteora pair API error: ${pairResponse.status}`)
      return null
    }

    const pairData = await pairResponse.json()
    
    // #region agent log
    console.log('[DEBUG-B2] Pair API response:', JSON.stringify({
      pairAddress: positionData.pair_address,
      name: pairData.name,
      mint_x: pairData.mint_x,
      mint_y: pairData.mint_y,
      mint_x_decimals: pairData.mint_x_decimals,
      mint_y_decimals: pairData.mint_y_decimals,
      current_price: pairData.current_price,
    }));
    // #endregion

    // Step 3: Get token amounts
    // Meteora position API doesn't return token amounts directly
    // We need to calculate from liquidity shares or query associated token accounts
    let tokenXAmount = 0
    let tokenYAmount = 0
    let unclaimedFeeX = 0
    let unclaimedFeeY = 0
    let isOutOfRange = false
    
    const tokenXDecimals = pairData.mint_x_decimals || 9
    const tokenYDecimals = pairData.mint_y_decimals || 6
    
    // Try to get token amounts by querying token accounts owned by the position NFT
    // Meteora positions may have associated token accounts holding the liquidity
    try {
      const rpcUrl = getRpcUrl()
      
      // Query for token accounts owned by the position address
      const tokenAccountsResponse = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'getTokenAccountsByOwner',
          params: [
            positionAddress,
            {
              programId: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'
            },
            {
              encoding: 'jsonParsed'
            }
          ]
        })
      })
      
      if (tokenAccountsResponse.ok) {
        const tokenAccountsData = await tokenAccountsResponse.json()
        const tokenAccounts = tokenAccountsData.result?.value || []
        
        // #region agent log
        console.log('[DEBUG-B3] Token accounts for position:', JSON.stringify({
          tokenAccountsCount: tokenAccounts.length,
          accounts: tokenAccounts.map((acc: any) => ({
            mint: acc.account?.data?.parsed?.info?.mint,
            amount: acc.account?.data?.parsed?.info?.tokenAmount?.uiAmount,
          })),
        }));
        // #endregion
        
        // Extract token amounts from token accounts
        for (const account of tokenAccounts) {
          const mint = account.account?.data?.parsed?.info?.mint
          const amount = account.account?.data?.parsed?.info?.tokenAmount?.uiAmount || 0
          
          if (mint === pairData.mint_x && amount > 0) {
            tokenXAmount = amount
          } else if (mint === pairData.mint_y && amount > 0) {
            tokenYAmount = amount
          }
        }
        
        if (tokenXAmount > 0 || tokenYAmount > 0) {
          console.log('[DEBUG-B3] ✅ Got token amounts from token accounts:', { tokenXAmount, tokenYAmount })
        }
      }
    } catch (error: any) {
      console.log('[DEBUG-B3] Error fetching token accounts:', error.message)
    }
    
    // If token accounts didn't work, try user positions endpoint as fallback:
    if (tokenXAmount === 0 && tokenYAmount === 0) {
      // Try user positions endpoint (may work for some pools)
      const userPositionsResponse = await fetch(
        `https://dlmm-api.meteora.ag/pair/${positionData.pair_address}/user/${positionData.owner}`,
        {
          headers: { Accept: 'application/json' },
          next: { revalidate: 30 },
        }
      )

      if (userPositionsResponse.ok) {
        const userPosData = await userPositionsResponse.json()
        
        // #region agent log
        console.log('[DEBUG-B4] User positions response:', JSON.stringify({
          userPositionsCount: userPosData.user_positions?.length || 0,
          firstPositionKeys: userPosData.user_positions?.[0] ? Object.keys(userPosData.user_positions[0]) : [],
        }));
        // #endregion
        
        // Find this specific position
        const specificPosition = userPosData.user_positions?.find(
          (p: any) => p.position_address === positionAddress || p.public_key === positionAddress
        )

        if (specificPosition && specificPosition.position_data) {
          // #region agent log
          console.log('[DEBUG-B5] Found specific position:', JSON.stringify({
            positionAddress,
            positionDataKeys: Object.keys(specificPosition.position_data),
            raw_total_x: specificPosition.position_data?.total_x_amount,
            raw_total_y: specificPosition.position_data?.total_y_amount,
            raw_fee_x: specificPosition.position_data?.fee_x,
            raw_fee_y: specificPosition.position_data?.fee_y,
          }));
          // #endregion
          
          tokenXAmount = Number(specificPosition.position_data?.total_x_amount || 0) / Math.pow(10, tokenXDecimals)
          tokenYAmount = Number(specificPosition.position_data?.total_y_amount || 0) / Math.pow(10, tokenYDecimals)
          unclaimedFeeX = Number(specificPosition.position_data?.fee_x || 0) / Math.pow(10, tokenXDecimals)
          unclaimedFeeY = Number(specificPosition.position_data?.fee_y || 0) / Math.pow(10, tokenYDecimals)
          
          // Check if position is out of range
          const lowerBinId = specificPosition.position_data?.lower_bin_id
          const upperBinId = specificPosition.position_data?.upper_bin_id
          const activeBinId = pairData.active_bin_id
          
          if (lowerBinId !== undefined && upperBinId !== undefined && activeBinId !== undefined) {
            isOutOfRange = activeBinId < lowerBinId || activeBinId > upperBinId
          }
        }
      } else {
        // #region agent log
        const errorText = await userPositionsResponse.text().catch(() => '')
        console.log('[DEBUG-B7] User positions endpoint failed:', userPositionsResponse.status, errorText.slice(0, 200));
        // #endregion
        
        // If user positions endpoint fails, the position might be empty or closed
        // Check if we can get amounts from Shyft API position data
        // Shyft might have more detailed position information
        console.log('[DEBUG-B8] User positions endpoint unavailable, position may be empty or we need Shyft detailed query')
      }
    }
    
    // #region agent log
    console.log('[DEBUG-B9] Final token amounts:', JSON.stringify({
      tokenXAmount,
      tokenYAmount,
      unclaimedFeeX,
      unclaimedFeeY,
      isOutOfRange,
    }));
    // #endregion

    // Determine token prices
    const tokenXMint = pairData.mint_x
    const tokenYMint = pairData.mint_y
    const tokenXSymbol = pairData.name?.split('-')[0] || 'Unknown'
    const tokenYSymbol = pairData.name?.split('-')[1] || 'Unknown'

    // Get current SOL price from pair data (current_price is USDC per SOL for SOL-USDC pools)
    const currentPrice = Number(pairData.current_price || 132) // SOL price in USDC

    // #region agent log
    console.log('[DEBUG-C] Price calc inputs:', JSON.stringify({positionAddress,currentPrice,tokenXMint,tokenYMint,tokenXSymbol,tokenYSymbol,tokenXAmount,tokenYAmount}));
    // #endregion

    let tokenXPrice = 1
    let tokenYPrice = 1

    // Determine prices based on mint addresses
    if (tokenXMint === USDC_MINT) {
      tokenXPrice = 1
      tokenYPrice = currentPrice // Token Y is likely SOL
    } else if (tokenYMint === USDC_MINT) {
      tokenYPrice = 1
      tokenXPrice = currentPrice // Token X is likely SOL
    } else if (tokenXMint === SOL_MINT) {
      tokenXPrice = currentPrice
      tokenYPrice = 1
    } else if (tokenYMint === SOL_MINT) {
      tokenYPrice = currentPrice
      tokenXPrice = 1
    }

    const tokenXValueUSD = tokenXAmount * tokenXPrice
    const tokenYValueUSD = tokenYAmount * tokenYPrice
    const totalValueUSD = tokenXValueUSD + tokenYValueUSD
    const unclaimedFeesUSD = (unclaimedFeeX * tokenXPrice) + (unclaimedFeeY * tokenYPrice)

    // #region agent log
    console.log('[DEBUG-D] Final calc:', JSON.stringify({positionAddress,tokenXPrice,tokenYPrice,tokenXAmount,tokenYAmount,tokenXValueUSD,tokenYValueUSD,totalValueUSD,unclaimedFeesUSD}));
    // #endregion

    return {
      positionAddress,
      pairAddress: positionData.pair_address,
      pairName: pairData.name || 'Unknown',
      owner: positionData.owner,
      tokenX: {
        symbol: tokenXSymbol,
        mint: tokenXMint,
        amount: tokenXAmount,
        price: tokenXPrice,
        valueUSD: tokenXValueUSD,
      },
      tokenY: {
        symbol: tokenYSymbol,
        mint: tokenYMint,
        amount: tokenYAmount,
        price: tokenYPrice,
        valueUSD: tokenYValueUSD,
      },
      totalValueUSD,
      unclaimedFeesUSD,
      totalFeesClaimed: positionData.total_fee_usd_claimed || 0,
      isOutOfRange,
      feeAPR24h: positionData.fee_apr_24h || 0,
    }
  } catch (error: any) {
    console.error(`Error fetching Meteora position ${positionAddress}:`, error.message)
    return null
  }
}

/**
 * Jupiter Portfolio API Response types
 */
interface JupiterPortfolioPosition {
  type: string
  platformId: string
  label: string
  value: number
  data: any
}

interface JupiterPortfolioResponse {
  positions: JupiterPortfolioPosition[]
  totalValue?: number
}

// Known popular Meteora DLMM pools to check for positions (fallback)
const POPULAR_METEORA_POOLS = [
  '5rCf1DM8LjKTw4YqhnoLcngyZYeNnQqztScTogYHAS6', // SOL-USDC (from user's portfolio)
  'BVRbyLjjfSBcoyiYFuxbgKYnWuiFaF9CSXEa5vdSZ5Hh', // SOL-USDT
  'ARwi1S4DaiTG5DX7S4M4ZsrXqpMD1MrTmbu9ue2tpmEq', // BONK-SOL
]

/**
 * Fallback: Query Meteora directly for user positions
 * First tries to get all DLMM pools, then checks user positions in each
 */
async function fetchMeteoraPositionsDirect(
  walletAddress: string
): Promise<MeteoraPositionsResult> {
  const positions: MeteoraPositionValue[] = []
  const errors: string[] = []
  
  console.log('[DEBUG-METEORA] Fetching positions from Meteora API')
  
  // Try to get list of all DLMM pools from Meteora API
  let poolsToCheck = [...POPULAR_METEORA_POOLS]
  
  try {
    // Get top DLMM pools by liquidity (limit to top 20 for performance)
    const poolsResponse = await fetch(
      'https://dlmm-api.meteora.ag/pair/all_by_groups?page=0&limit=20&sort_key=tvl&order_by=desc',
      {
        headers: { Accept: 'application/json' },
        next: { revalidate: 300 }, // Cache for 5 minutes
      }
    )
    
    // #region agent log
    console.log(`[DEBUG-METEORA] Pool list fetch status: ${poolsResponse.status} ${poolsResponse.statusText}`);
    // #endregion
    
      if (poolsResponse.ok) {
      const poolsData = await poolsResponse.json()
      
      // #region agent log
      console.log(`[DEBUG-METEORA] Pool list response type: ${typeof poolsData}, isArray: ${Array.isArray(poolsData)}, keys: ${poolsData && typeof poolsData === 'object' ? Object.keys(poolsData).join(',') : 'N/A'}`);
      // #endregion
      
      let poolAddresses: string[] = []
      
      // Handle different response structures
      if (Array.isArray(poolsData)) {
        // Direct array
        poolAddresses = poolsData.map((p: any) => p.address || p.pair_address).filter(Boolean)
      } else if (poolsData && typeof poolsData === 'object') {
        // Try groups array (from all_by_groups endpoint)
        if (poolsData.groups && Array.isArray(poolsData.groups)) {
          // Flatten groups - each group contains pools
          for (const group of poolsData.groups) {
            if (group.pairs && Array.isArray(group.pairs)) {
              const groupPools = group.pairs.map((p: any) => p.address || p.pair_address).filter(Boolean)
              poolAddresses.push(...groupPools)
            }
          }
        } else if (poolsData.data && Array.isArray(poolsData.data)) {
          // Try nested data structure
          poolAddresses = poolsData.data.map((p: any) => p.address || p.pair_address).filter(Boolean)
        } else if (poolsData.pairs && Array.isArray(poolsData.pairs)) {
          // Try pairs array
          poolAddresses = poolsData.pairs.map((p: any) => p.address || p.pair_address).filter(Boolean)
        }
      }
      
      if (poolAddresses.length > 0) {
        // Merge with known pools, remove duplicates
        poolsToCheck = [...new Set([...POPULAR_METEORA_POOLS, ...poolAddresses])]
        console.log(`[DEBUG-METEORA] Found ${poolsToCheck.length} pools to check (${poolAddresses.length} from API + ${POPULAR_METEORA_POOLS.length} known)`)
      }
    } else {
      // #region agent log
      const errorText = await poolsResponse.text().catch(() => '')
      console.log(`[DEBUG-METEORA] Pool list fetch failed: ${poolsResponse.status} - ${errorText.slice(0, 200)}`);
      // #endregion
    }
  } catch (err: any) {
    console.log(`[DEBUG-METEORA] Could not fetch pool list, using known pools only: ${err.message}`)
  }

  // Check each pool for user positions (limit to first 30 for performance)
  const poolsToCheckLimited = poolsToCheck.slice(0, 30)
  console.log(`[DEBUG-METEORA] Checking ${poolsToCheckLimited.length} pools for positions`)

  for (const poolAddress of poolsToCheckLimited) {
    try {
      // Query user positions in this pool
      const response = await fetch(
        `https://dlmm-api.meteora.ag/pair/${poolAddress}/user/${walletAddress}`,
        {
          headers: { Accept: 'application/json' },
          next: { revalidate: 30 },
        }
      )

      // #region agent log
      if (!response.ok) {
        console.log(`[DEBUG-METEORA] Pool ${poolAddress.slice(0,8)}... user endpoint: ${response.status} ${response.statusText}`)
        continue
      }
      // #endregion

      const data = await response.json()
      const userPositions = data.user_positions || []

      // #region agent log
      console.log(`[DEBUG-METEORA] Pool ${poolAddress.slice(0,8)}... found ${userPositions.length} positions`)
      // #endregion

      if (userPositions.length === 0) continue

      // Get pool data for pricing
      const pairResponse = await fetch(
        `https://dlmm-api.meteora.ag/pair/${poolAddress}`,
        { headers: { Accept: 'application/json' } }
      )
      
      if (!pairResponse.ok) continue
      const pairData = await pairResponse.json()

      // Process each position
      for (const pos of userPositions) {
        const tokenXDecimals = pairData.mint_x_decimals || 9
        const tokenYDecimals = pairData.mint_y_decimals || 6
        const currentPrice = Number(pairData.current_price || 133)

        const tokenXAmount = Number(pos.position_data?.total_x_amount || 0) / Math.pow(10, tokenXDecimals)
        const tokenYAmount = Number(pos.position_data?.total_y_amount || 0) / Math.pow(10, tokenYDecimals)
        
        // Determine prices
        let tokenXPrice = 1, tokenYPrice = 1
        if (pairData.mint_y === USDC_MINT) {
          tokenYPrice = 1
          tokenXPrice = currentPrice
        } else if (pairData.mint_x === USDC_MINT) {
          tokenXPrice = 1
          tokenYPrice = currentPrice
        }

        const tokenXValueUSD = tokenXAmount * tokenXPrice
        const tokenYValueUSD = tokenYAmount * tokenYPrice
        const totalValueUSD = tokenXValueUSD + tokenYValueUSD

        const unclaimedFeeX = Number(pos.position_data?.fee_x || 0) / Math.pow(10, tokenXDecimals)
        const unclaimedFeeY = Number(pos.position_data?.fee_y || 0) / Math.pow(10, tokenYDecimals)
        const unclaimedFeesUSD = (unclaimedFeeX * tokenXPrice) + (unclaimedFeeY * tokenYPrice)

        positions.push({
          positionAddress: pos.position_address || pos.public_key || 'unknown',
          pairAddress: poolAddress,
          pairName: pairData.name || 'Unknown',
          owner: walletAddress,
          tokenX: {
            symbol: pairData.name?.split('-')[0] || 'Unknown',
            mint: pairData.mint_x,
            amount: tokenXAmount,
            price: tokenXPrice,
            valueUSD: tokenXValueUSD,
          },
          tokenY: {
            symbol: pairData.name?.split('-')[1] || 'Unknown',
            mint: pairData.mint_y,
            amount: tokenYAmount,
            price: tokenYPrice,
            valueUSD: tokenYValueUSD,
          },
          totalValueUSD,
          unclaimedFeesUSD,
          totalFeesClaimed: 0,
          isOutOfRange: false,
          feeAPR24h: 0,
        })
      }
    } catch (err: any) {
      errors.push(`Pool ${poolAddress}: ${err.message}`)
    }
  }

  const totalValueUSD = positions.reduce((sum, p) => sum + p.totalValueUSD, 0)
  const totalUnclaimedFeesUSD = positions.reduce((sum, p) => sum + p.unclaimedFeesUSD, 0)

  console.log(`[DEBUG-METEORA] Found ${positions.length} positions worth $${totalValueUSD.toFixed(2)}`)

  return { positions, totalValueUSD, totalUnclaimedFeesUSD, errors }
}

/**
 * Fetch Meteora position NFTs using Shyft API (PRIMARY - Most Reliable)
 * Uses GraphQL to query Meteora DLMM positions by owner
 */
async function fetchMeteoraPositionNFTsViaShyft(
  walletAddress: string
): Promise<string[]> {
  try {
    const shyftApiKey = process.env.SHYFT_API_KEY
    if (!shyftApiKey) {
      console.log(`[DEBUG-SHYFT] No API key, skipping Shyft API`)
      return []
    }

    console.log(`[DEBUG-SHYFT] Querying Shyft API for Meteora positions: ${walletAddress}`)
    
    // Query both Position and PositionV2 with detailed data including token amounts
    const query = `
      query GetMeteoraPositions {
        meteora_dlmm_Position(
          where: {owner: {_eq: ${JSON.stringify(walletAddress)}}}
        ) {
          pubkey
          owner
          lbPair
          lowerBinId
          upperBinId
          liquidityShares
          totalClaimedFeeXAmount
          totalClaimedFeeYAmount
        }
        meteora_dlmm_PositionV2(
          where: {owner: {_eq: ${JSON.stringify(walletAddress)}}}
        ) {
          pubkey
          owner
          lbPair
          lowerBinId
          upperBinId
          liquidityShares
          totalClaimedFeeXAmount
          totalClaimedFeeYAmount
        }
      }
    `

    const endpoint = `https://programs.shyft.to/v0/graphql/accounts?api_key=${shyftApiKey}&network=mainnet-beta`
    
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query,
        variables: {},
        operationName: 'GetMeteoraPositions',
      }),
    })

    if (!response.ok) {
      const errorText = await response.text().catch(() => '')
      console.log(`[DEBUG-SHYFT] API error ${response.status}: ${errorText.slice(0, 200)}`)
      return []
    }

    const data = await response.json()
    
    if (data.errors) {
      console.log(`[DEBUG-SHYFT] GraphQL errors:`, JSON.stringify(data.errors))
      return []
    }

    // Combine Position and PositionV2 results
    const positionsV1 = data.data?.meteora_dlmm_Position || []
    const positionsV2 = data.data?.meteora_dlmm_PositionV2 || []
    const allPositions = [...positionsV1, ...positionsV2]
    
    // Extract pubkey (position NFT address) and store position data for later use
    const positionAddresses = allPositions.map((p: any) => p.pubkey).filter(Boolean)
    
    console.log(`[DEBUG-SHYFT] ✅ Found ${positionAddresses.length} Meteora positions (${positionsV1.length} V1, ${positionsV2.length} V2) via Shyft API`)
    
    if (positionAddresses.length > 0) {
      console.log(`[DEBUG-SHYFT] Position addresses:`, positionAddresses.map((addr: string) => addr.slice(0, 8) + '...'))
      // Log position details from Shyft
      allPositions.forEach((p: any) => {
        console.log(`[DEBUG-SHYFT] Position ${p.pubkey.slice(0, 8)}...:`, JSON.stringify({
          lbPair: p.lbPair?.slice(0, 8),
          lowerBinId: p.lowerBinId,
          upperBinId: p.upperBinId,
          liquidityShares: p.liquidityShares,
        }))
      })
    }
    
    return positionAddresses
  } catch (error: any) {
    console.error(`[DEBUG-SHYFT] Error:`, error.message, error.stack)
    return []
  }
}

/**
 * Fetch Meteora position NFTs using Helius getProgramAccounts (SECONDARY)
 * Queries on-chain accounts directly with proper owner filter
 */
async function fetchMeteoraPositionNFTsViaHeliusRPC(
  walletAddress: string
): Promise<string[]> {
  try {
    const rpcUrl = getRpcUrl()
    
    // Convert wallet address to bytes for memcmp filter
    // Meteora DLMM position account structure: [discriminator: 8 bytes][owner: 32 bytes][...]
    // We need to use base58 encoding for the owner field
    
    console.log(`[DEBUG-HELIUS-RPC] Querying getProgramAccounts for wallet: ${walletAddress}`)
    
    // Use jsonParsed encoding to get readable account data
    const response = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getProgramAccounts',
        params: [
          METEORA_DLMM_PROGRAM,
          {
            encoding: 'jsonParsed',
            filters: [
              {
                dataSize: 200, // Approximate size of Meteora position account
              }
            ]
          }
        ]
      })
    })

    if (!response.ok) {
      console.log(`[DEBUG-HELIUS-RPC] getProgramAccounts failed: ${response.status}`)
      return []
    }

    const data = await response.json()
    
    if (data.error) {
      console.log(`[DEBUG-HELIUS-RPC] RPC error: ${data.error.message}`)
      return []
    }

    const accounts = data.result || []
    
    // Filter accounts by owner (check parsed data)
    const positionAddresses: string[] = []
    
    for (const acc of accounts) {
      const pubkey = acc.pubkey
      if (!pubkey) continue
      
      // Try to get owner from parsed account data
      let owner: string | null = null
      if (acc.account?.data && typeof acc.account.data === 'object' && 'parsed' in acc.account.data) {
        const parsed = acc.account.data.parsed
        owner = parsed?.info?.owner || parsed?.owner || parsed?.data?.owner
      }
      
      if (owner && owner === walletAddress) {
        positionAddresses.push(pubkey)
      }
    }
    
    console.log(`[DEBUG-HELIUS-RPC] Found ${positionAddresses.length} positions owned by wallet`)
    
    return positionAddresses
  } catch (error: any) {
    console.error(`[DEBUG-HELIUS-RPC] Error:`, error.message)
    return []
  }
}

/**
 * Fetch Meteora position NFTs owned by wallet - Multi-strategy approach
 * Tries Shyft API first, then Helius RPC, then transaction parsing
 */
async function fetchMeteoraPositionNFTsViaHelius(
  walletAddress: string
): Promise<string[]> {
  // Strategy 1: Shyft API (most reliable)
  const shyftPositions = await fetchMeteoraPositionNFTsViaShyft(walletAddress)
  if (shyftPositions.length > 0) {
    return shyftPositions
  }

  // Strategy 2: Helius RPC getProgramAccounts
  const heliusPositions = await fetchMeteoraPositionNFTsViaHeliusRPC(walletAddress)
  if (heliusPositions.length > 0) {
    return heliusPositions
  }

  // Strategy 3: Transaction parsing (fallback)
  return await fetchMeteoraPositionNFTsViaTransactionParsing(walletAddress)
}

/**
 * Fallback: Parse transactions to find position NFT addresses
 */
async function fetchMeteoraPositionNFTsViaTransactionParsing(
  walletAddress: string
): Promise<string[]> {
  try {
    const rpcUrl = getRpcUrl()
    
    // #region agent log
    console.log(`[DEBUG-HELIUS-TX] Parsing transactions for wallet: ${walletAddress}`);
    // #endregion

    // Get recent transaction signatures (last 100 should cover recent positions)
    const sigResponse = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getSignaturesForAddress',
        params: [walletAddress, { limit: 100 }]
      })
    })

    if (!sigResponse.ok) {
      return []
    }

    const sigData = await sigResponse.json()
    if (sigData.error) {
      return []
    }

    const signatures = sigData.result || []
    
    if (signatures.length === 0) {
      return []
    }

    // Fetch transaction details in batches (limit to 50 most recent to catch new positions)
    const recentSignatures = signatures.slice(0, 50).map((s: any) => s.signature)
    const positionNFTs = new Set<string>()
    
    // #region agent log
    console.log(`[DEBUG-HELIUS-TX] Processing ${recentSignatures.length} recent transactions`);
    // #endregion

    // Fetch transactions in parallel (but limit concurrency)
    const batchSize = 5
    for (let i = 0; i < recentSignatures.length; i += batchSize) {
      const batch = recentSignatures.slice(i, i + batchSize)
      const txPromises = batch.map(sig => 
        fetch(rpcUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'getTransaction',
            params: [
              sig,
              {
                encoding: 'jsonParsed',
                maxSupportedTransactionVersion: 0
              }
            ]
          })
        }).then(r => r.json()).catch(() => null)
      )

      const txResults = await Promise.all(txPromises)
      
      for (const txData of txResults) {
        if (!txData?.result) continue
        
        try {
          const tx = txData.result as ParsedTransaction
          
          if (!tx?.transaction?.message || !tx?.meta) continue
          if (!Array.isArray(tx.transaction.message.accountKeys)) continue
          
          if (!isMeteoraDLMMTransaction(tx)) continue

          const txType = determineTransactionType(tx)
          
          if (txType === 'position_open') {
            const positionNFT = extractPositionNFTAddress(tx, txType)
            if (positionNFT) {
              positionNFTs.add(positionNFT)
              // #region agent log
              console.log(`[DEBUG-HELIUS-TX] ✅ Found position_open transaction! NFT: ${positionNFT.slice(0, 8)}...${positionNFT.slice(-8)}`);
              // #endregion
            } else {
              // #region agent log
              console.log(`[DEBUG-HELIUS-TX] ⚠️ position_open transaction found but could not extract NFT address`);
              // #endregion
            }
          } else if (txType !== 'unknown') {
            // #region agent log
            console.log(`[DEBUG-HELIUS-TX] Found Meteora ${txType} transaction (not position_open)`);
            // #endregion
          }
        } catch (error: any) {
          continue
        }
      }
    }

    const positionAddresses = Array.from(positionNFTs)
    
    // #region agent log
    console.log(`[DEBUG-HELIUS-TX] Found ${positionAddresses.length} position NFTs from transaction parsing`);
    // #endregion

    return positionAddresses
  } catch (error: any) {
    console.error(`Error parsing transactions:`, error.message)
    return []
  }
}

/**
 * Fetch Meteora positions using Meteora's direct API
 * This is the primary method - queries Meteora API directly for accurate position data
 * Meteora API uses on-chain data (via Helius RPC) to provide real-time position values
 */
export async function fetchMeteoraPositionsByWallet(
  walletAddress: string
): Promise<MeteoraPositionsResult> {
  console.log(`🌊 Fetching Meteora positions for wallet: ${walletAddress}`)
  
  // Multi-strategy approach: Shyft API → Helius RPC → Transaction Parsing
  const positionNFTs = await fetchMeteoraPositionNFTsViaHelius(walletAddress)
  
  console.log(`[DEBUG-MULTI] Position NFT search complete: found ${positionNFTs.length} NFTs`);
  
  if (positionNFTs.length > 0) {
    console.log(`[DEBUG-MULTI] Fetching values for ${positionNFTs.length} position NFTs`)
    
    // Fetch values for each position NFT from Meteora API
    const result = await fetchMeteoraPositionsValues(positionNFTs)
    
    console.log(`[DEBUG-MULTI] Position values: ${result.positions.length} positions, $${result.totalValueUSD.toFixed(2)} total`)
    
    if (result.positions.length > 0) {
      return result
    } else {
      console.log(`[DEBUG-MULTI] ⚠️ Found ${positionNFTs.length} NFTs but Meteora API returned 0 positions. Errors:`, result.errors)
    }
  } else {
    console.log(`[DEBUG-MULTI] No position NFTs found via any method`)
  }
  
  // Final fallback: Meteora API direct pool checking
  console.log(`🌊 Final fallback: Checking Meteora pools directly`)
  return await fetchMeteoraPositionsDirect(walletAddress)
}

/**
 * Fetch real-time values for multiple Meteora positions
 * @deprecated Use fetchMeteoraPositionsByWallet instead for more reliable results
 */
export async function fetchMeteoraPositionsValues(
  positionAddresses: string[]
): Promise<MeteoraPositionsResult> {
  const positions: MeteoraPositionValue[] = []
  const errors: string[] = []

  // Fetch all positions in parallel (with rate limiting)
  const batchSize = 3 // Limit concurrent requests
  for (let i = 0; i < positionAddresses.length; i += batchSize) {
    const batch = positionAddresses.slice(i, i + batchSize)
    const results = await Promise.all(
      batch.map(async (addr) => {
        try {
          return await fetchMeteoraPositionValue(addr)
        } catch (err: any) {
          errors.push(`Failed to fetch ${addr}: ${err.message}`)
          return null
        }
      })
    )

    results.forEach((result) => {
      if (result) {
        positions.push(result)
      }
    })

    // Small delay between batches to avoid rate limiting
    if (i + batchSize < positionAddresses.length) {
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
  }

  const totalValueUSD = positions.reduce((sum, p) => sum + p.totalValueUSD, 0)
  const totalUnclaimedFeesUSD = positions.reduce((sum, p) => sum + p.unclaimedFeesUSD, 0)

  return {
    positions,
    totalValueUSD,
    totalUnclaimedFeesUSD,
    errors,
  }
}



