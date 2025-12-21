# Meteora Position Detection - API Testing Summary

> **📋 Quick Reference**: See [API_TESTING_REGISTRY.md](./API_TESTING_REGISTRY.md) for a concise checklist of tested APIs before starting new tests.

## ✅ APIs That WORK (Find Positions)

### 1. Shyft API (GraphQL) - ✅ WORKING
- **Status**: ✅ Successfully finds position NFTs
- **Endpoint**: `https://programs.shyft.to/v0/graphql/accounts`
- **Query**: `meteora_dlmm_Position` and `meteora_dlmm_PositionV2` by owner
- **Returns**: Position addresses (pubkey), lbPair, lowerBinId, upperBinId, liquidityShares
- **Limitation**: Doesn't return token amounts directly
- **API Key**: Required (free tier available)

### 2. Helius RPC Transaction Parsing - ✅ WORKING (Partial)
- **Status**: ✅ Can find position NFTs from transaction history
- **Method**: Parse last 50 transactions for `position_open` events
- **Returns**: Position NFT addresses
- **Limitation**: Only finds recent positions (last 50 transactions), complex parsing logic

## ❌ APIs That DON'T WORK (For Getting Token Amounts)

### 1. Meteora `/position/{positionAddress}` - ❌ NO TOKEN AMOUNTS
- **Status**: ✅ API works, ❌ Doesn't return token amounts
- **Endpoint**: `https://dlmm-api.meteora.ag/position/{positionAddress}`
- **Returns**: Fee data, APR, but NO `total_x_amount` or `total_y_amount`
- **Response Keys**: `["address","pair_address","owner","total_fee_x_claimed","total_fee_y_claimed",...]`
- **Issue**: Missing token amount fields

### 2. Meteora `/pair/{pool}/user/{wallet}` - ❌ 404 ERROR
- **Status**: ❌ Returns 404 Not Found
- **Endpoint**: `https://dlmm-api.meteora.ag/pair/{poolAddress}/user/{walletAddress}`
- **Error**: `404` for all pools tested
- **Issue**: Endpoint doesn't exist or requires different parameters

### 3. Jupiter Portfolio API - ❌ NO POSITIONS RETURNED
- **Status**: ❌ Returns empty results
- **Endpoint**: `https://api.jup.ag/portfolio/v1/positions/{wallet}?platforms=meteora`
- **With API Key**: Returns `elements: []`, `fetcherReports: []`
- **Without API Key**: Returns 401/404
- **Issue**: Free tier doesn't provide Meteora position data, or endpoint structure different

### 4. Token Accounts Query - ❌ RETURNS 0
- **Status**: ❌ No token accounts found
- **Method**: `getTokenAccountsByOwner` for position NFT address
- **Returns**: Empty array `[]`
- **Issue**: Meteora positions don't hold tokens directly - liquidity is in pool bins

### 5. Helius getProgramAccounts - ⚠️ COMPLEX
- **Status**: ⚠️ Technically possible but complex
- **Method**: Query position accounts, parse account data
- **Issue**: Requires parsing binary account data, complex structure

## 🔍 What We KNOW Works

1. **Shyft API finds positions** ✅
   - Returns: `pubkey`, `lbPair`, `lowerBinId`, `upperBinId`, `liquidityShares[]`

2. **Meteora Position API returns metadata** ✅
   - Returns: Fee data, APR, pair address, owner
   - Missing: Token amounts

3. **Meteora Pair API returns pool data** ✅
   - Returns: Token mints, decimals, current price, pool name

## 🎯 The REAL Problem

**We can FIND positions but can't get TOKEN AMOUNTS because:**
- Meteora API doesn't expose token amounts in position endpoint
- User positions endpoint returns 404
- Token accounts are empty (liquidity is in bins, not position NFT)
- Calculating from `liquidityShares` requires bin data (composition factors)

## ✅ SOLUTION FOUND: Shyft API with totalXAmount/totalYAmount

### Shyft API - ✅ HAS TOKEN AMOUNTS!
- **Status**: ✅ **SOLUTION** - Shyft API provides `totalXAmount` and `totalYAmount` fields!
- **Fields Available**: 
  - `totalXAmount` - Raw token X amount (divide by decimals)
  - `totalYAmount` - Raw token Y amount (divide by decimals)
  - `totalClaimedFeeXAmount` - Claimed fees in token X
  - `totalClaimedFeeYAmount` - Claimed fees in token Y
- **Implementation**: ✅ Implemented - `fetchMeteoraPositionsViaShyft()` function
- **This is the working solution!**

## 💡 Other Solutions (NOT NEEDED - Shyft works!)

1. ~~Calculate from liquidityShares + Bin Data~~ - NOT NEEDED (Shyft has amounts)
2. ~~Use Meteora SDK~~ - NOT NEEDED (Shyft works)
3. ~~Query Bin Arrays On-Chain~~ - NOT NEEDED (Shyft works)
4. ~~Use Different Meteora API Endpoint~~ - NOT NEEDED (Shyft works)
5. ~~Use Third-Party Aggregator~~ - NOT NEEDED (Shyft works)

## 📋 Testing Checklist

- [x] Shyft API - ✅ Finds positions
- [x] Meteora `/position/{address}` - ✅ Works but no amounts
- [x] Meteora `/pair/{pool}/user/{wallet}` - ❌ 404
- [x] Jupiter Portfolio API - ❌ Empty results
- [x] Token accounts query - ❌ Empty
- [ ] Calculate from liquidityShares + bin data - ⏳ NOT TESTED
- [ ] Meteora SDK - ⏳ NOT TESTED
- [ ] Bin array on-chain query - ⏳ NOT TESTED
- [ ] Other Meteora API endpoints - ⏳ NOT TESTED
