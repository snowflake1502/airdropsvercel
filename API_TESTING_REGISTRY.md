# API Testing Registry - Meteora Position Detection

> **⚠️ IMPORTANT: Check this file BEFORE testing any new API or approach to avoid retesting methods that have already been evaluated.**

## Quick Reference Status

| API/Method | Status | Token Amounts? | Date Tested | Notes |
|------------|--------|----------------|-------------|-------|
| **Shyft GraphQL API** | ✅ PARTIAL | ❌ NO (only `liquidityShares`) | 2025-12-21 | Finds position NFTs, but does NOT provide `totalXAmount`/`totalYAmount` fields |
| **Helius RPC Transaction Parsing** | ✅ PARTIAL | ❌ NO | 2025-12-14 | Finds position NFTs only, no amounts |
| **Meteora `/position/{address}`** | ⚠️ PARTIAL | ❌ NO | 2025-12-14 | Returns metadata/fees, but NO token amounts |
| **Meteora `/pair/{pool}/user/{wallet}`** | ❌ FAILED | ❌ NO | 2025-12-14 | Returns 404 - endpoint doesn't exist |
| **Jupiter Portfolio API** | ❌ FAILED | ❌ NO | 2025-12-14 | Returns empty results even with API key |
| **Token Accounts Query** | ❌ FAILED | ❌ NO | 2025-12-14 | Returns empty - positions don't hold tokens directly |
| **Helius getProgramAccounts** | ⚠️ COMPLEX | ❌ NO | 2025-12-14 | Technically possible but requires binary parsing |

---

## Detailed Test Results

### ✅ PARTIAL - Shyft GraphQL API (Finds Positions, NOT Token Amounts)

**Endpoint**: `https://programs.shyft.to/v0/graphql/accounts`  
**Query Types**: `meteora_dlmm_Position`, `meteora_dlmm_PositionV2`  
**API Key Required**: Yes (free tier available)

**What it returns:**
- ✅ Position addresses (`pubkey`)
- ✅ Pair addresses (`lbPair`)
- ✅ Bin IDs (`lowerBinId`, `upperBinId`)
- ✅ Liquidity shares array (`liquidityShares[]`)
- ❌ **NO token amounts** (`totalXAmount`, `totalYAmount` fields don't exist)
- ❌ **NO claimed fees** (`totalClaimedFeeXAmount`, `totalClaimedFeeYAmount` fields don't exist)

**Error when requesting token amounts**: `"field 'totalXAmount' not found in type: 'meteora_dlmm_Position'"`

**Implementation**: `fetchMeteoraPositionsViaShyft()` in `src/lib/meteora-positions.ts` - now uses Shyft to find NFTs, then calls `fetchMeteoraPositionValue()` to get amounts

**Status**: ✅ Works for finding position NFTs, but token amounts must be calculated from `liquidityShares` + bin data OR fetched via other methods

---

### ✅ PARTIAL - Helius RPC Transaction Parsing

**Method**: Parse transaction history for `position_open` events  
**RPC Method**: `getSignaturesForAddress` + `getTransaction`

**What it returns:**
- ✅ Position NFT addresses (from transaction parsing)
- ❌ No token amounts

**Limitations:**
- Only finds recent positions (last 50 transactions)
- Complex parsing logic required
- Doesn't provide token amounts

**Status**: ✅ Works as fallback for finding position NFTs, but not for amounts

---

### ⚠️ PARTIAL - Meteora Position API

**Endpoint**: `https://dlmm-api.meteora.ag/position/{positionAddress}`

**What it returns:**
- ✅ Position metadata (address, pair, owner)
- ✅ Fee data (`total_fee_x_claimed`, `total_fee_y_claimed`)
- ✅ APR/APY data (`fee_apy_24h`, `fee_apr_24h`)
- ❌ **NO token amounts** (`total_x_amount`, `total_y_amount` missing)

**Status**: ⚠️ API works but doesn't solve the token amount problem

---

### ❌ FAILED - Meteora User Positions Endpoint

**Endpoint**: `https://dlmm-api.meteora.ag/pair/{poolAddress}/user/{walletAddress}`

**Result**: 
- ❌ Returns `404 Not Found` for all pools tested
- Endpoint doesn't exist or requires different parameters

**Status**: ❌ Not usable

---

### ❌ FAILED - Jupiter Portfolio API

**Endpoint**: `https://api.jup.ag/portfolio/v1/positions/{wallet}?platforms=meteora`

**Results:**
- Without API key: `401 Unauthorized` or `404 Not Found`
- With API key: Returns `elements: []`, `fetcherReports: []` (empty results)

**Issue**: Free tier doesn't provide Meteora position data, or endpoint structure is different from what Jupiter UI uses

**Status**: ❌ Not usable for Meteora positions

---

### ❌ FAILED - Token Accounts Query

**Method**: `getTokenAccountsByOwner` for position NFT address

**Result**: 
- Returns empty array `[]`
- No token accounts found

**Reason**: Meteora positions don't hold tokens directly - liquidity is stored in pool bins, not in the position NFT

**Status**: ❌ Not usable

---

### ⚠️ COMPLEX - Helius getProgramAccounts

**Method**: Query Meteora DLMM program accounts, filter by owner, parse account data

**Challenges:**
- Requires parsing binary account data
- Complex account structure
- No direct token amount fields in account data

**Status**: ⚠️ Technically possible but overly complex - not recommended

---

## Approaches NOT Tested (But Not Needed)

The following approaches were considered but **NOT tested** because Shyft API already provides the solution:

- ❓ Calculate from `liquidityShares` + Bin Data - Would require fetching bin arrays and complex calculations
- ❓ Meteora SDK - Would require integrating external SDK
- ❓ Query Bin Arrays On-Chain - Complex and would require parsing multiple accounts
- ❓ Other Meteora API Endpoints - Unknown endpoints not documented

**Note**: These are not needed since Shyft API provides `totalXAmount` and `totalYAmount` directly.

---

## Current Implementation Strategy

1. **PRIMARY**: `fetchMeteoraPositionsViaShyft()` - Uses Shyft GraphQL API with `totalXAmount`/`totalYAmount`
2. **FALLBACK 1**: `fetchMeteoraPositionNFTsViaHeliusRPC()` - Uses Helius `getProgramAccounts` to find NFTs
3. **FALLBACK 2**: `fetchMeteoraPositionNFTsViaTransactionParsing()` - Parses transaction history
4. **FALLBACK 3**: `fetchMeteoraPositionsDirect()` - Direct Meteora API pool checking

---

## Before Testing a New API

1. ✅ Check this registry to see if it's already been tested
2. ✅ Review the test results and limitations
3. ✅ If not tested, document the test plan before implementing
4. ✅ Update this registry with results after testing

---

## Last Updated

**Date**: 2025-12-21  
**Current Solution**: Shyft GraphQL API finds position NFTs, but token amounts still need calculation  
**Status**: ⚠️ Shyft query fixed, but token amount calculation still needed  
**Issue**: Shyft does NOT provide `totalXAmount`/`totalYAmount` - need to calculate from `liquidityShares` + bin data
