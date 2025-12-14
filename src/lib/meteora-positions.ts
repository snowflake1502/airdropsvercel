/**
 * Meteora Position Value Fetcher
 * Fetches real-time position values directly from Meteora's API
 */

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

    // Step 3: Get user's position details with token amounts
    const userPositionsResponse = await fetch(
      `https://dlmm-api.meteora.ag/pair/${positionData.pair_address}/user/${positionData.owner}`,
      {
        headers: { Accept: 'application/json' },
        next: { revalidate: 30 }, // Cache for 30 seconds (more real-time)
      }
    )

    let tokenXAmount = 0
    let tokenYAmount = 0
    let unclaimedFeeX = 0
    let unclaimedFeeY = 0
    let isOutOfRange = false

    if (userPositionsResponse.ok) {
      const userPosData = await userPositionsResponse.json()
      
      // Find this specific position
      const specificPosition = userPosData.user_positions?.find(
        (p: any) => p.position_address === positionAddress || p.public_key === positionAddress
      )

      if (specificPosition) {
        const tokenXDecimals = pairData.mint_x_decimals || 9
        const tokenYDecimals = pairData.mint_y_decimals || 6
        
        // #region agent log
        console.log('[DEBUG-B] Raw API amounts:', JSON.stringify({positionAddress,raw_total_x_amount:specificPosition.position_data?.total_x_amount,raw_total_y_amount:specificPosition.position_data?.total_y_amount,tokenXDecimals,tokenYDecimals,pairName:pairData.name,mint_x:pairData.mint_x,mint_y:pairData.mint_y}));
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
    }

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
 * Fallback: Query Meteora directly for user positions in known pools
 */
async function fetchMeteoraPositionsDirect(
  walletAddress: string
): Promise<MeteoraPositionsResult> {
  const positions: MeteoraPositionValue[] = []
  const errors: string[] = []
  
  console.log('[DEBUG-FALLBACK] Trying direct Meteora API for known pools')

  for (const poolAddress of POPULAR_METEORA_POOLS) {
    try {
      // Query user positions in this pool
      const response = await fetch(
        `https://dlmm-api.meteora.ag/pair/${poolAddress}/user/${walletAddress}`,
        {
          headers: { Accept: 'application/json' },
          next: { revalidate: 30 },
        }
      )

      if (!response.ok) continue

      const data = await response.json()
      const userPositions = data.user_positions || []

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

  console.log(`[DEBUG-FALLBACK] Found ${positions.length} positions worth $${totalValueUSD.toFixed(2)}`)

  return { positions, totalValueUSD, totalUnclaimedFeesUSD, errors }
}

/**
 * Fetch Meteora positions using Jupiter Portfolio API
 * Jupiter aggregates data from 170+ protocols including Meteora
 * Falls back to direct Meteora API if Jupiter fails
 */
export async function fetchMeteoraPositionsByWallet(
  walletAddress: string
): Promise<MeteoraPositionsResult> {
  const positions: MeteoraPositionValue[] = []
  const errors: string[] = []

  try {
    // #region agent log
    console.log('[DEBUG-JUPITER] Fetching portfolio from Jupiter for wallet:', walletAddress);
    // #endregion

    // Use Jupiter Portfolio API - requires API key (free tier available at portal.jup.ag)
    const jupiterApiKey = process.env.JUPITER_API_KEY
    
    if (!jupiterApiKey) {
      console.warn('JUPITER_API_KEY not set - falling back to direct Meteora API')
      // #region agent log
      console.log('[DEBUG-JUPITER] No API key - using fallback');
      // #endregion
      return await fetchMeteoraPositionsDirect(walletAddress)
    }

    // Add platforms=meteora query parameter to filter for Meteora positions
    const response = await fetch(
      `https://api.jup.ag/portfolio/v1/positions/${walletAddress}?platforms=meteora`,
      {
        headers: { 
          Accept: 'application/json',
          'x-api-key': jupiterApiKey,
        },
        next: { revalidate: 30 },
      }
    )

    if (!response.ok) {
      console.warn(`Jupiter Portfolio API error: ${response.status} - falling back to direct Meteora API`)
      // #region agent log
      console.log('[DEBUG-JUPITER] API error:', response.status, '- using fallback');
      // #endregion
      return await fetchMeteoraPositionsDirect(walletAddress)
    }

    const portfolioData = await response.json()
    
    // #region agent log
    console.log('[DEBUG-JUPITER] Raw response keys:', JSON.stringify(Object.keys(portfolioData)));
    console.log('[DEBUG-JUPITER] Full response structure:', JSON.stringify({
      date: portfolioData.date,
      owner: portfolioData.owner,
      duration: portfolioData.duration,
      elementsCount: portfolioData.elements?.length || 0,
      fetcherReportsCount: portfolioData.fetcherReports?.length || 0,
      tokenInfoKeys: portfolioData.tokenInfo ? Object.keys(portfolioData.tokenInfo) : null,
    }));
    console.log('[DEBUG-JUPITER] Elements type:', typeof portfolioData.elements, 'isArray:', Array.isArray(portfolioData.elements));
    console.log('[DEBUG-JUPITER] Elements length:', portfolioData.elements?.length || 0);
    console.log('[DEBUG-JUPITER] Elements sample (first 3):', JSON.stringify(
      Array.isArray(portfolioData.elements) 
        ? portfolioData.elements.slice(0, 3).map((e: any) => ({
            type: typeof e,
            keys: typeof e === 'object' ? Object.keys(e) : 'not object',
            platformId: e?.platformId,
            label: e?.label,
            protocol: e?.protocol,
            protocolId: e?.protocolId,
          }))
        : portfolioData.elements
    ));
    console.log('[DEBUG-JUPITER] FetcherReports:', JSON.stringify(
      portfolioData.fetcherReports?.slice(0, 3).map((r: any) => ({
        protocol: r?.protocol,
        protocolId: r?.protocolId,
        success: r?.success,
        positionsCount: r?.positions?.length || 0,
      })) || []
    ));
    // #endregion

    // Find Meteora positions from the portfolio
    // Jupiter returns positions in elements array, or sometimes in fetcherReports
    let allPositions: any[] = []
    
    if (Array.isArray(portfolioData.elements) && portfolioData.elements.length > 0) {
      allPositions = portfolioData.elements
    } else if (Array.isArray(portfolioData.fetcherReports)) {
      // Extract positions from fetcherReports
      for (const report of portfolioData.fetcherReports) {
        if (report.positions && Array.isArray(report.positions)) {
          allPositions.push(...report.positions)
        }
      }
    } else if (portfolioData.positions) {
      allPositions = Array.isArray(portfolioData.positions) ? portfolioData.positions : []
    }
    
    // #region agent log
    console.log('[DEBUG-JUPITER] All positions count:', allPositions.length);
    console.log('[DEBUG-JUPITER] Position platforms:', JSON.stringify(
      allPositions.slice(0, 10).map((p: any) => ({ 
        platformId: p.platformId, 
        protocolId: p.protocolId,
        protocol: p.protocol,
        label: p.label, 
        value: p.value,
        type: p.type,
      }))
    ));
    // #endregion

    // Filter for Meteora positions
    // Check multiple fields: platformId, protocolId, protocol, label, type
    const meteoraPositions = allPositions.filter((p: any) => {
      const platformId = String(p.platformId || '').toLowerCase()
      const protocolId = String(p.protocolId || '').toLowerCase()
      const protocol = String(p.protocol || '').toLowerCase()
      const label = String(p.label || '').toLowerCase()
      const type = String(p.type || '').toLowerCase()
      
      return platformId.includes('meteora') ||
             protocolId.includes('meteora') ||
             protocol.includes('meteora') ||
             label.includes('meteora') ||
             type.includes('meteora')
    })

    // #region agent log
    console.log('[DEBUG-JUPITER] Meteora positions found:', JSON.stringify({ 
      count: meteoraPositions.length,
      positions: meteoraPositions.map((p: any) => ({ label: p.label, value: p.value, platformId: p.platformId }))
    }));
    // #endregion

    let totalValueUSD = 0
    let totalUnclaimedFeesUSD = 0

    for (const pos of meteoraPositions) {
      totalValueUSD += pos.value || 0
      
      // Try to extract fee info if available
      if (pos.data?.unclaimedFees) {
        totalUnclaimedFeesUSD += pos.data.unclaimedFees
      }

      // Create a position entry for each Meteora position
      positions.push({
        positionAddress: pos.data?.address || 'unknown',
        pairAddress: pos.data?.pairAddress || 'unknown',
        pairName: pos.label || pos.data?.name || 'Meteora LP',
        owner: walletAddress,
        tokenX: {
          symbol: pos.data?.tokenX?.symbol || 'Unknown',
          mint: pos.data?.tokenX?.mint || '',
          amount: pos.data?.tokenX?.amount || 0,
          price: pos.data?.tokenX?.price || 0,
          valueUSD: pos.data?.tokenX?.valueUSD || 0,
        },
        tokenY: {
          symbol: pos.data?.tokenY?.symbol || 'Unknown',
          mint: pos.data?.tokenY?.mint || '',
          amount: pos.data?.tokenY?.amount || 0,
          price: pos.data?.tokenY?.price || 0,
          valueUSD: pos.data?.tokenY?.valueUSD || 0,
        },
        totalValueUSD: pos.value || 0,
        unclaimedFeesUSD: pos.data?.unclaimedFees || 0,
        totalFeesClaimed: pos.data?.totalFeesClaimed || 0,
        isOutOfRange: pos.data?.isOutOfRange || false,
        feeAPR24h: pos.data?.feeAPR24h || 0,
      })
    }

    // #region agent log
    console.log('[DEBUG-JUPITER] Final result:', JSON.stringify({ totalValueUSD, totalUnclaimedFeesUSD, positionCount: positions.length }));
    // #endregion

    return {
      positions,
      totalValueUSD,
      totalUnclaimedFeesUSD,
      errors,
    }
  } catch (err: any) {
    console.error('Jupiter Portfolio API error:', err.message)
    errors.push(`Failed to fetch Jupiter portfolio: ${err.message}`)
    return { positions: [], totalValueUSD: 0, totalUnclaimedFeesUSD: 0, errors }
  }
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



