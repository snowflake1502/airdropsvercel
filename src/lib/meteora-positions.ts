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
 * Fetch all Meteora positions for a wallet address directly from Meteora API
 * This is more reliable than querying by stored position addresses
 */
export async function fetchMeteoraPositionsByWallet(
  walletAddress: string
): Promise<MeteoraPositionsResult> {
  const positions: MeteoraPositionValue[] = []
  const errors: string[] = []

  try {
    // #region agent log
    console.log('[DEBUG-WALLET] Fetching positions by wallet:', walletAddress);
    // #endregion

    // Query Meteora for all positions owned by this wallet
    const response = await fetch(
      `https://dlmm-api.meteora.ag/position/find_by_user?owner=${walletAddress}`,
      {
        headers: { Accept: 'application/json' },
        next: { revalidate: 30 },
      }
    )

    if (!response.ok) {
      console.warn(`Meteora user positions API error: ${response.status}`)
      return { positions: [], totalValueUSD: 0, totalUnclaimedFeesUSD: 0, errors: [`API error: ${response.status}`] }
    }

    const userPositions = await response.json()
    
    // #region agent log
    console.log('[DEBUG-WALLET] Found positions:', JSON.stringify({ count: userPositions?.length || 0 }));
    // #endregion

    if (!userPositions || userPositions.length === 0) {
      return { positions: [], totalValueUSD: 0, totalUnclaimedFeesUSD: 0, errors: [] }
    }

    // Process each position
    for (const pos of userPositions) {
      try {
        const positionValue = await fetchMeteoraPositionValue(pos.address || pos.public_key)
        if (positionValue) {
          positions.push(positionValue)
        }
      } catch (err: any) {
        errors.push(`Failed to fetch position ${pos.address}: ${err.message}`)
      }
    }
  } catch (err: any) {
    errors.push(`Failed to fetch wallet positions: ${err.message}`)
  }

  const totalValueUSD = positions.reduce((sum, p) => sum + p.totalValueUSD, 0)
  const totalUnclaimedFeesUSD = positions.reduce((sum, p) => sum + p.unclaimedFeesUSD, 0)

  // #region agent log
  console.log('[DEBUG-WALLET] Final result:', JSON.stringify({ totalValueUSD, totalUnclaimedFeesUSD, positionCount: positions.length }));
  // #endregion

  return {
    positions,
    totalValueUSD,
    totalUnclaimedFeesUSD,
    errors,
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



