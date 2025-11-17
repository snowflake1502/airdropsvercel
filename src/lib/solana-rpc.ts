/**
 * Solana RPC Utility Module
 * 
 * Handles all communication with Solana blockchain via free public RPC
 * Uses: https://api.mainnet-beta.solana.com
 * 
 * Rate limit: ~40 requests/10 seconds per IP
 * Can be upgraded to Helius/Alchemy if needed by changing RPC_URL env variable
 */

// Get RPC URL dynamically to ensure env vars are loaded
function getRpcUrl(): string {
  // Server-side: Use HELIUS_RPC_URL (no NEXT_PUBLIC_ prefix) or fallback to public RPC
  // This is used in API routes, so we want server-side RPC URL
  if (typeof window === 'undefined') {
    // Server-side: Use Helius RPC URL from environment (server-side only)
    const heliusUrl = process.env.HELIUS_RPC_URL || 
                     process.env.SOLANA_RPC_URL ||
                     'https://api.mainnet-beta.solana.com'
    return heliusUrl
  }
  
  // Client-side: Should not be called from client (this is for API routes)
  // But if it is, use proxy
  return `${window.location.origin}/api/rpc`
}

// Helper function to introduce a delay
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export interface TransactionSignature {
  signature: string;
  blockTime: number | null;
  slot: number;
  confirmationStatus?: string;
  err: any;
  memo: string | null;
}

export interface ParsedTransaction {
  blockTime: number | null;
  slot: number;
  meta: {
    err: any;
    fee: number;
    preBalances: number[];
    postBalances: number[];
    preTokenBalances: TokenBalance[];
    postTokenBalances: TokenBalance[];
    logMessages?: string[];
    [key: string]: any;
  };
  transaction: {
    message: {
      accountKeys: AccountKey[];
      instructions: any[];
      [key: string]: any;
    };
    signatures: string[];
  };
  [key: string]: any;
}

export interface AccountKey {
  pubkey: string;
  signer: boolean;
  writable: boolean;
  source?: string;
}

export interface TokenBalance {
  accountIndex: number;
  mint: string;
  owner?: string;
  programId?: string;
  uiTokenAmount: {
    amount: string;
    decimals: number;
    uiAmount: number | null;
    uiAmountString: string;
  };
}

/**
 * Fetch all transaction signatures for a given address
 * 
 * @param address - Solana wallet or account address
 * @param limit - Maximum number of signatures to fetch (default: 1000)
 * @returns Array of transaction signatures with metadata
 */
export async function getSignaturesForAddress(
  address: string,
  limit: number = 1000
): Promise<TransactionSignature[]> {
  const rpcUrl = getRpcUrl();
  console.log('🔗 Using RPC:', rpcUrl.includes('helius') ? 'Helius RPC (Fast!)' : 'Public Solana RPC (Slow)');
  
  const response = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'getSignaturesForAddress',
      params: [address, { limit }],
    }),
  });

  const data = await response.json();

  if (data.error) {
    throw new Error(`RPC Error: ${data.error.message}`);
  }

  return data.result || [];
}

/**
 * Fetch full transaction details with parsed instructions (with retry logic)
 * 
 * @param signature - Transaction signature
 * @param maxRetries - Maximum number of retry attempts for rate limits
 * @returns Parsed transaction with all details
 */
export async function getTransaction(
  signature: string,
  maxRetries: number = 3
): Promise<ParsedTransaction | null> {
  let lastError: Error | null = null;
  const rpcUrl = getRpcUrl();
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'getTransaction',
          params: [
            signature,
            {
              encoding: 'jsonParsed',
              maxSupportedTransactionVersion: 0,
            },
          ],
        }),
      });

      const data = await response.json();

      if (data.error) {
        // Check if it's a rate limit error
        if (data.error.message?.includes('Too many requests')) {
          throw new Error('RATE_LIMIT');
        }
        throw new Error(`RPC Error: ${data.error.message}`);
      }

      return data.result;
    } catch (error: any) {
      lastError = error;
      
      // Only retry on rate limit errors
      if (error.message === 'RATE_LIMIT' && attempt < maxRetries) {
        // Exponential backoff: 1s, 2s, 4s
        const waitTime = Math.pow(2, attempt) * 1000;
        console.log(`⏳ Rate limited on tx ${signature.slice(0,8)}..., retrying in ${waitTime}ms (attempt ${attempt + 1}/${maxRetries})`);
        await sleep(waitTime);
        continue;
      }
      
      // Don't throw on other errors, just log and return null
      if (attempt === maxRetries) {
        console.warn(`⚠️ Failed to fetch transaction ${signature.slice(0,8)}... after ${maxRetries} retries`);
      }
      break;
    }
  }
  
  return null;
}

/**
 * Fetch multiple transactions in batch
 * Implements rate limiting to avoid hitting RPC limits
 * 
 * @param signatures - Array of transaction signatures
 * @param delayMs - Delay between requests in milliseconds (default: 100ms)
 * @returns Array of parsed transactions
 */
export async function getTransactionsBatch(
  signatures: string[],
  delayMs: number = 100
): Promise<(ParsedTransaction | null)[]> {
  const transactions: (ParsedTransaction | null)[] = [];

  for (const signature of signatures) {
    try {
      const tx = await getTransaction(signature);
      transactions.push(tx);

      // Rate limiting delay
      if (delayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    } catch (error) {
      console.error(`Error fetching transaction ${signature}:`, error);
      transactions.push(null); // Continue with null for failed transactions
    }
  }

  return transactions;
}

/**
 * Check if a transaction involves a specific program
 * 
 * @param transaction - Parsed transaction
 * @param programId - Program public key to check
 * @returns True if transaction involves the program
 */
export function transactionInvolvesProgram(
  transaction: ParsedTransaction,
  programId: string
): boolean {
  const accountKeys = transaction.transaction.message.accountKeys || [];
  return accountKeys.some((key) => key.pubkey === programId);
}

/**
 * Calculate SOL balance change for a specific wallet in a transaction
 * 
 * @param transaction - Parsed transaction
 * @param walletAddress - Wallet address to check
 * @returns SOL balance change (can be negative)
 */
export function getSOLBalanceChange(
  transaction: ParsedTransaction,
  walletAddress: string
): number {
  const accountKeys = transaction.transaction.message.accountKeys;
  const walletIndex = accountKeys.findIndex((key) => key.pubkey === walletAddress);

  if (walletIndex === -1) {
    return 0; // Wallet not involved in this transaction
  }

  const preBalance = transaction.meta.preBalances[walletIndex] || 0;
  const postBalance = transaction.meta.postBalances[walletIndex] || 0;

  // Convert from lamports to SOL
  return (postBalance - preBalance) / 1e9;
}

/**
 * Get token balance changes for a transaction
 * 
 * @param transaction - Parsed transaction
 * @returns Array of token balance changes
 */
export function getTokenBalanceChanges(transaction: ParsedTransaction): Array<{
  accountIndex: number;
  mint: string;
  change: number;
  decimals: number;
  symbol?: string;
}> {
  const preBalances = transaction.meta.preTokenBalances || [];
  const postBalances = transaction.meta.postTokenBalances || [];

  const changes: Array<{
    accountIndex: number;
    mint: string;
    change: number;
    decimals: number;
  }> = [];

  // Check all post balances for changes
  postBalances.forEach((post) => {
    const pre = preBalances.find((p) => p.accountIndex === post.accountIndex);
    const preAmount = pre ? parseFloat(pre.uiTokenAmount.uiAmountString || '0') : 0;
    const postAmount = parseFloat(post.uiTokenAmount.uiAmountString || '0');
    const change = postAmount - preAmount;

    if (Math.abs(change) > 0.000001) {
      // Only include significant changes
      changes.push({
        accountIndex: post.accountIndex,
        mint: post.mint,
        change,
        decimals: post.uiTokenAmount.decimals,
      });
    }
  });

  return changes;
}


