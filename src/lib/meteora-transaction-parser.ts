/**
 * Meteora DLMM Transaction Parser
 * 
 * Parses Solana transactions to identify and extract Meteora DLMM position activity
 * Detects: Position opens, fee claims, position closes, rebalances
 */

import type { ParsedTransaction, TokenBalance } from './solana-rpc';

// Meteora DLMM Program ID
export const METEORA_DLMM_PROGRAM = 'LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo';

// Known token mints
export const SOL_MINT = 'So11111111111111111111111111111111111111112';
export const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

export type TransactionType =
  | 'position_open'
  | 'fee_claim'
  | 'position_close'
  | 'rebalance'
  | 'unknown';

export interface ParsedMeteoraTransaction {
  signature: string;
  blockTime: number;
  slot: number;
  type: TransactionType;
  
  // Position information
  positionNftAddress: string | null;
  poolAddress: string | null;
  
  // Token amounts
  tokenX: {
    mint: string;
    symbol: string;
    amount: number;
    decimals: number;
    priceUSD?: number;
    valueUSD?: number;
  } | null;
  
  tokenY: {
    mint: string;
    symbol: string;
    amount: number;
    decimals: number;
    priceUSD?: number;
    valueUSD?: number;
  } | null;
  
  // SOL balance change for wallet
  solChange: number;
  
  // Total USD value (if prices available)
  totalValueUSD: number | null;
  
  // Raw transaction for reference
  rawTransaction: ParsedTransaction;
  
  // Status
  success: boolean;
  errorMessage?: string;
}

/**
 * Check if transaction involves Meteora DLMM program
 */
export function isMeteoraDLMMTransaction(transaction: ParsedTransaction): boolean {
  const accountKeys = transaction.transaction.message.accountKeys || [];
  const instructions = transaction.transaction.message.instructions || [];
  
  // Check if any account key matches Meteora program (convert to string for comparison)
  const hasMeteoraAccount = accountKeys.some((key) => 
    (typeof key.pubkey === 'string' ? key.pubkey : key.pubkey?.toString()) === METEORA_DLMM_PROGRAM
  );
  
  // Also check instruction program IDs (convert to string)
  const hasMeteoraInstruction = instructions.some((inst: any) => {
    const programId = typeof inst.programId === 'string' ? inst.programId : inst.programId?.toString();
    return programId === METEORA_DLMM_PROGRAM;
  });
  
  // Check log messages for Meteora references (additional heuristic)
  const logMessages = transaction.meta?.logMessages || [];
  const hasMeteoraLogs = logMessages.some((log: string) => 
    log.toLowerCase().includes('meteora') || 
    log.includes(METEORA_DLMM_PROGRAM) ||
    log.includes('LBUZKhRxPF3X') // Partial match for program ID
  );
  
  return hasMeteoraAccount || hasMeteoraInstruction || hasMeteoraLogs;
}

/**
 * Determine the type of Meteora transaction
 */
export function determineTransactionType(
  transaction: ParsedTransaction
): TransactionType {
  const preTokenBalances = transaction.meta.preTokenBalances || [];
  const postTokenBalances = transaction.meta.postTokenBalances || [];
  const instructions = transaction.transaction.message.instructions || [];
  const logMessages = transaction.meta?.logMessages || [];
  
  // PRIORITY 1: Check Meteora-specific instruction logs (most reliable!)
  const hasInitializePositionLog = logMessages.some((log: string) => 
    log.includes('Instruction: InitializePosition')
  );
  
  const hasClosePositionLog = logMessages.some((log: string) => 
    log.includes('Instruction: ClosePosition') ||
    log.includes('Instruction: RemoveLiquidity')
  );
  
  const hasClaimFeeInstruction = logMessages.some((log: string) => 
    log.includes('Instruction: ClaimFee') ||
    log.includes('Instruction: ClaimReward')
  );
  
  // PRIORITY 1 detection - most reliable
  if (hasInitializePositionLog) {
    return 'position_open';
  }
  
  if (hasClosePositionLog) {
    return 'position_close';
  }
  
  if (hasClaimFeeInstruction) {
    return 'fee_claim';
  }
  
  // PRIORITY 2: Check general log messages
  const hasAddLiquidityLog = logMessages.some((log: string) => 
    log.toLowerCase().includes('addliquidity') || 
    log.toLowerCase().includes('add liquidity') ||
    log.toLowerCase().includes('deposit')
  );
  
  const hasRemoveLiquidityLog = logMessages.some((log: string) => 
    log.toLowerCase().includes('removeliquidity') || 
    log.toLowerCase().includes('remove liquidity') ||
    log.toLowerCase().includes('withdraw')
  );
  
  const hasClaimFeeLog = logMessages.some((log: string) => 
    log.toLowerCase().includes('claim') || 
    log.toLowerCase().includes('fee')
  );
  
  // PRIORITY 3: Check account structure changes
  const hasNewTokenAccounts = postTokenBalances.length > preTokenBalances.length;
  const hasClosedTokenAccounts = postTokenBalances.length < preTokenBalances.length;
  
  // Get token balance changes
  const tokenChanges = getTokenBalanceChanges(transaction);
  const significantTransfers = tokenChanges.filter(
    (change) => Math.abs(change.change) > 0.01
  );
  
  // Position open: Add liquidity with significant transfers
  // Note: Don't rely on closeAccount instruction - it could be cleanup!
  if (hasAddLiquidityLog && significantTransfers.length >= 2) {
    return 'position_open';
  }
  
  // Position close: Remove liquidity with significant withdrawals
  if (hasRemoveLiquidityLog && hasClosedTokenAccounts) {
    return 'position_close';
  }
  
  // Fee claim: Claim logs with token changes
  if (hasClaimFeeLog && tokenChanges.length > 0) {
    return 'fee_claim';
  }
  
  // Rebalance: Multiple operations without clear open/close signals
  if (significantTransfers.length >= 2 && !hasAddLiquidityLog && !hasRemoveLiquidityLog) {
    return 'rebalance';
  }
  
  return 'unknown';
}

/**
 * Extract position NFT address from transaction
 * Position NFT address is consistent across all position transactions
 */
export function extractPositionNFTAddress(
  transaction: ParsedTransaction,
  type: TransactionType
): string | null {
  const accountKeys = transaction.transaction.message.accountKeys;
  const postTokenBalances = transaction.meta.postTokenBalances || [];
  const preTokenBalances = transaction.meta.preTokenBalances || [];
  const logMessages = transaction.meta?.logMessages || [];
  
  // Strategy 1: Look in log messages for position address
  // Meteora logs often contain "position: <address>" or similar patterns
  for (const log of logMessages) {
    // Look for patterns like "position: ABC..." or "Position: ABC..."
    const posMatch = log.match(/[Pp]osition:\s*([A-Za-z0-9]{32,44})/);
    if (posMatch && posMatch[1]) {
      return posMatch[1];
    }
  }
  
  // Strategy 2: Get all accounts that appear in token balances
  const tokenAccountIndices = new Set([
    ...postTokenBalances.map(b => b.accountIndex),
    ...preTokenBalances.map(b => b.accountIndex)
  ]);
  
  // Strategy 3: For position opens, look for the position NFT (owner of token accounts)
  // For Meteora, this is typically the account that owns the SPL token accounts
  if (type === 'position_open') {
    // Check token account owners in post-balances
    for (const balance of postTokenBalances) {
      // In Meteora DLMM, the position NFT is the owner of the liquidity tokens
      // Look for accounts that have token balances and are writable
      const accountIndex = balance.accountIndex;
      if (accountIndex > 0 && accountIndex < accountKeys.length) {
        const account = accountKeys[accountIndex];
        if (account.writable && !account.signer) {
          const pubkey = typeof account.pubkey === 'string' ? account.pubkey : account.pubkey?.toString();
          if (pubkey && pubkey.length >= 32) {
            return pubkey;
          }
        }
      }
    }
  }
  
  // Strategy 4: For fee claims and closes, look for writable, non-signer accounts
  // PRIORITIZE accounts that also appear in token balances (they're the liquidity holders)
  const tokenAccounts = new Set<string>();
  [...postTokenBalances, ...preTokenBalances].forEach(balance => {
    if (balance.accountIndex < accountKeys.length) {
      const account = accountKeys[balance.accountIndex];
      const pubkey = typeof account.pubkey === 'string' ? account.pubkey : account.pubkey?.toString();
      if (pubkey) {
        tokenAccounts.add(pubkey);
      }
    }
  });
  
  // First pass: Look for writable, non-signer accounts that ALSO appear in token balances
  for (let i = 1; i < accountKeys.length; i++) {
    const key = accountKeys[i];
    const pubkey = typeof key.pubkey === 'string' ? key.pubkey : key.pubkey?.toString();
    
    if (pubkey && key.writable && !key.signer && tokenAccounts.has(pubkey) && pubkey.length >= 32) {
      // This is a writable account that holds tokens - perfect candidate!
      return pubkey;
    }
  }
  
  // Second pass: If no token-holding account found, fall back to first writable account
  for (let i = 1; i < Math.min(5, accountKeys.length); i++) {
    const key = accountKeys[i];
    const pubkey = typeof key.pubkey === 'string' ? key.pubkey : key.pubkey?.toString();
    
    if (pubkey && key.writable && !key.signer && pubkey.length >= 32) {
      return pubkey;
    }
  }
  
  return null;
}

/**
 * Extract pool address from transaction
 */
export function extractPoolAddress(transaction: ParsedTransaction): string | null {
  // Pool address is usually one of the writable accounts in the transaction
  // For now, we'll need to identify it based on patterns
  // This might need refinement based on actual transaction structures
  
  const accountKeys = transaction.transaction.message.accountKeys;
  // Look for accounts that appear in token balance changes
  const tokenAccountIndices = new Set([
    ...(transaction.meta.preTokenBalances?.map((b) => b.accountIndex) || []),
    ...(transaction.meta.postTokenBalances?.map((b) => b.accountIndex) || []),
  ]);
  
  // Pool is usually a writable account that's involved in token transfers
  const poolAccount = accountKeys.find(
    (key, index) => key.writable && !key.signer && tokenAccountIndices.has(index)
  );
  
  return poolAccount?.pubkey || null;
}

/**
 * Get token balance changes from transaction
 * Groups changes by mint address (combines changes from multiple accounts)
 * For Meteora DLMM: Also includes tokens that didn't "change" but have non-zero post-balances
 */
function getTokenBalanceChanges(transaction: ParsedTransaction): Array<{
  accountIndex: number;
  mint: string;
  change: number;
  decimals: number;
}> {
  const preBalances = transaction.meta.preTokenBalances || [];
  const postBalances = transaction.meta.postTokenBalances || [];
  
  // First, collect all individual account changes
  const accountChanges: Array<{
    accountIndex: number;
    mint: string;
    change: number;
    decimals: number;
  }> = [];
  
  // Track all unique mints we've seen
  const seenMints = new Set<string>();
  
  postBalances.forEach((post) => {
    const pre = preBalances.find((p) => p.accountIndex === post.accountIndex);
    const preAmount = pre ? parseFloat(pre.uiTokenAmount.uiAmountString || '0') : 0;
    const postAmount = parseFloat(post.uiTokenAmount.uiAmountString || '0');
    const change = postAmount - preAmount;
    
    seenMints.add(post.mint);
    
    // Only include if there's an actual change in balance
    // Don't include accounts with zero change, even if they have non-zero post-balances
    if (Math.abs(change) > 0.000001) {
      accountChanges.push({
        accountIndex: post.accountIndex,
        mint: post.mint,
        change: change,
        decimals: post.uiTokenAmount.decimals,
      });
    }
  });
  
  // Also check for closed accounts (pre-balance exists, post-balance doesn't)
  preBalances.forEach((pre) => {
    const hasPost = postBalances.find((p) => p.accountIndex === pre.accountIndex);
    if (!hasPost) {
      const preAmount = parseFloat(pre.uiTokenAmount.uiAmountString || '0');
      if (Math.abs(preAmount) > 0.000001) {
        seenMints.add(pre.mint);
        accountChanges.push({
          accountIndex: pre.accountIndex,
          mint: pre.mint,
          change: -preAmount, // Negative because account was closed
          decimals: pre.uiTokenAmount.decimals,
        });
      }
    }
  });
  
  // Group by mint address and take the MAXIMUM absolute change for same token
  // (For Meteora, multiple accounts of same token might exist, we want the largest movement)
  const mintMap = new Map<string, { change: number; decimals: number; accountIndex: number }>();
  
  accountChanges.forEach((change) => {
    const existing = mintMap.get(change.mint);
    if (existing) {
      // Take the larger absolute value (represents the actual amount involved)
      if (Math.abs(change.change) > Math.abs(existing.change)) {
        existing.change = change.change;
      }
    } else {
      mintMap.set(change.mint, {
        change: change.change,
        decimals: change.decimals,
        accountIndex: change.accountIndex,
      });
    }
  });
  
  // Convert back to array
  const groupedChanges: Array<{
    accountIndex: number;
    mint: string;
    change: number;
    decimals: number;
  }> = [];
  
  mintMap.forEach((value, mint) => {
    groupedChanges.push({
      accountIndex: value.accountIndex,
      mint,
      change: value.change,
      decimals: value.decimals,
    });
  });
  
  return groupedChanges;
}

/**
 * Get token symbol from mint address
 */
function getTokenSymbol(mint: string): string {
  if (mint === SOL_MINT) return 'SOL';
  if (mint === USDC_MINT) return 'USDC';
  // Add more token mappings as needed
  return 'UNKNOWN';
}

/**
 * Calculate SOL balance change for wallet
 */
function getSOLBalanceChange(
  transaction: ParsedTransaction,
  walletAddress: string
): number {
  const accountKeys = transaction.transaction.message.accountKeys;
  const walletIndex = accountKeys.findIndex((key) => key.pubkey === walletAddress);
  
  if (walletIndex === -1) {
    return 0;
  }
  
  const preBalance = transaction.meta.preBalances[walletIndex] || 0;
  const postBalance = transaction.meta.postBalances[walletIndex] || 0;
  
  return (postBalance - preBalance) / 1e9;
}

/**
 * Parse a Meteora DLMM transaction
 * Main function to extract all relevant information
 */
export function parseMeteoraTransaction(
  transaction: ParsedTransaction,
  signature: string,
  walletAddress: string
): ParsedMeteoraTransaction | null {
  if (!isMeteoraDLMMTransaction(transaction)) {
    return null; // Not a Meteora transaction
  }
  
  const type = determineTransactionType(transaction);
  const tokenChanges = getTokenBalanceChanges(transaction);
  const solChange = getSOLBalanceChange(transaction, walletAddress);
  const positionNftAddress = extractPositionNFTAddress(transaction, type);
  const poolAddress = extractPoolAddress(transaction);
  
  // Extract token X and Y information (usually SOL and USDC for Meteora)
  let tokenX = null;
  let tokenY = null;
  
  if (tokenChanges.length >= 1) {
    const firstChange = tokenChanges[0];
    tokenX = {
      mint: firstChange.mint,
      symbol: getTokenSymbol(firstChange.mint),
      amount: Math.abs(firstChange.change),
      decimals: firstChange.decimals,
    };
  }
  
  if (tokenChanges.length >= 2) {
    const secondChange = tokenChanges[1];
    tokenY = {
      mint: secondChange.mint,
      symbol: getTokenSymbol(secondChange.mint),
      amount: Math.abs(secondChange.change),
      decimals: secondChange.decimals,
    };
  }
  
  const success = transaction.meta.err === null;
  
  // Estimate total USD value based on token amounts
  // Use rough price estimates: SOL ~$190, USDC $1
  let estimatedUSD = 0;
  
  if (tokenX) {
    const tokenXSymbol = tokenX.symbol.toUpperCase();
    if (tokenXSymbol === 'SOL' || tokenXSymbol === 'WSOL') {
      estimatedUSD += tokenX.amount * 190; // Rough SOL price
    } else if (tokenXSymbol === 'USDC' || tokenXSymbol === 'USDT') {
      estimatedUSD += tokenX.amount;
    }
  }
  
  if (tokenY) {
    const tokenYSymbol = tokenY.symbol.toUpperCase();
    if (tokenYSymbol === 'SOL' || tokenYSymbol === 'WSOL') {
      estimatedUSD += tokenY.amount * 190; // Rough SOL price
    } else if (tokenYSymbol === 'USDC' || tokenYSymbol === 'USDT') {
      estimatedUSD += tokenY.amount;
    }
  }
  
  return {
    signature,
    blockTime: transaction.blockTime || 0,
    slot: transaction.slot,
    type,
    positionNftAddress,
    poolAddress,
    tokenX,
    tokenY,
    solChange,
    totalValueUSD: estimatedUSD > 0 ? estimatedUSD : null,
    rawTransaction: transaction,
    success,
    errorMessage: success ? undefined : 'Transaction failed',
  };
}

/**
 * Parse multiple Meteora transactions from a wallet
 */
export async function parseMeteoraTransactions(
  transactions: Array<ParsedTransaction | null>,
  signatures: string[],
  walletAddress: string
): Promise<ParsedMeteoraTransaction[]> {
  const parsed: ParsedMeteoraTransaction[] = [];
  
  for (let i = 0; i < transactions.length; i++) {
    const tx = transactions[i];
    if (!tx) continue; // Skip null transactions
    
    try {
      const parsedTx = parseMeteoraTransaction(tx, signatures[i], walletAddress);
      if (parsedTx) {
        parsed.push(parsedTx);
      }
    } catch (error) {
      console.error(`Error parsing transaction ${signatures[i]}:`, error);
    }
  }
  
  return parsed;
}


