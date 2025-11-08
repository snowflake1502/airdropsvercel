import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const { positionAddress } = await request.json()

    if (!positionAddress) {
      return NextResponse.json(
        { error: 'Position address is required' },
        { status: 400 }
      )
    }

    console.log(`Fetching Meteora position: ${positionAddress}`)

    // Use Meteora's DLMM Position API
    // Reference: https://docs.meteora.ag/api-reference/liquidity-book-positions/get_position
    const meteoraApiUrl = `https://dlmm-api.meteora.ag/position/${positionAddress}`
    
    const response = await fetch(meteoraApiUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Meteora API returned ${response.status}: ${errorText}`)
    }

    const positionData = await response.json()
    
    console.log('Meteora API response:', JSON.stringify(positionData, null, 2))

    // Get pool details and user's position data
    const pairResponse = await fetch(`https://dlmm-api.meteora.ag/pair/${positionData.pair_address}`)
    const pairData = await pairResponse.json()

    console.log('Pair data:', JSON.stringify(pairData, null, 2))

    // Extract token information
    const tokenX = pairData.mint_x
    const tokenY = pairData.mint_y
    const tokenXDecimals = pairData.mint_x_decimals || 9
    const tokenYDecimals = pairData.mint_y_decimals || 6
    const tokenXSymbol = pairData.name?.split('-')[0] || 'Unknown'
    const tokenYSymbol = pairData.name?.split('-')[1] || 'Unknown'

    // Fetch position details from user_positions endpoint using owner wallet
    let tokenXAmount = 0
    let tokenYAmount = 0
    let unclaimedFeeX = 0
    let unclaimedFeeY = 0

    try {
      // Try to get position details using the owner's wallet
      const userPositionsUrl = `https://dlmm-api.meteora.ag/pair/${positionData.pair_address}/user/${positionData.owner}`
      const userPosResponse = await fetch(userPositionsUrl)
      
      if (userPosResponse.ok) {
        const userPosData = await userPosResponse.json()
        console.log('User position data:', JSON.stringify(userPosData, null, 2))
        
        // Find this specific position in the user's positions
        const specificPosition = userPosData.user_positions?.find(
          (p: any) => p.position_address === positionAddress || p.public_key === positionAddress
        )
        
        if (specificPosition) {
          tokenXAmount = Number(specificPosition.position_data?.total_x_amount || 0) / Math.pow(10, tokenXDecimals)
          tokenYAmount = Number(specificPosition.position_data?.total_y_amount || 0) / Math.pow(10, tokenYDecimals)
          unclaimedFeeX = Number(specificPosition.position_data?.fee_x || 0) / Math.pow(10, tokenXDecimals)
          unclaimedFeeY = Number(specificPosition.position_data?.fee_y || 0) / Math.pow(10, tokenYDecimals)
        }
      }
    } catch (userPosError: any) {
      console.log('Could not fetch user position details:', userPosError.message)
      // Continue with 0 amounts if we can't fetch
    }

    // Use prices from pair data
    const tokenXPrice = Number(pairData.current_price || 186)
    const tokenYPrice = 1 // USDC is always $1

    const totalValueUSD = (tokenXAmount * tokenXPrice) + (tokenYAmount * tokenYPrice)
    const unclaimedFeesUSD = (unclaimedFeeX * tokenXPrice) + (unclaimedFeeY * tokenYPrice)

    const result = {
      positionAddress: positionData.address,
      owner: positionData.owner,
      poolAddress: positionData.pair_address,
      tokenX: {
        symbol: tokenXSymbol,
        mint: tokenX,
        amount: tokenXAmount,
        price: tokenXPrice,
      },
      tokenY: {
        symbol: tokenYSymbol,
        mint: tokenY,
        amount: tokenYAmount,
        price: tokenYPrice,
      },
      totalValueUSD,
      unclaimedFees: {
        tokenX: unclaimedFeeX,
        tokenY: unclaimedFeeY,
        usd: unclaimedFeesUSD,
        totalClaimedUSD: positionData.total_fee_usd_claimed,
      },
      metrics: {
        feeAPR24h: positionData.fee_apr_24h,
        feeAPY24h: positionData.fee_apy_24h,
        dailyFeeYield: positionData.daily_fee_yield,
      },
      rawData: positionData,
    }

    console.log('Processed position:', result)

    return NextResponse.json({
      success: true,
      position: result,
    })
  } catch (error: any) {
    console.error('Error fetching Meteora position:', error)
    return NextResponse.json(
      { 
        error: 'Failed to fetch position',
        details: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      },
      { status: 500 }
    )
  }
}

