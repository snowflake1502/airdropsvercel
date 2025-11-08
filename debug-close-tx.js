// Debug script to check what's stored in the database for the close transaction
const fetch = require('node-fetch');

const RPC_URL = 'https://mainnet.helius-rpc.com/?api-key=201675f6-a0a5-41b0-8206-c5d1f81fc8f2';
const CLOSE_SIG = '3SL5jV8fa6xNdGYz7a8radsbr1AYAbR4wWutfLXQFMxtQmmHKBmHVpg27hkGuBgb8oaFiUwow4G7xPA9Fs63h485';

async function main() {
  const response = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'getTransaction',
      params: [
        CLOSE_SIG,
        {
          encoding: 'jsonParsed',
          maxSupportedTransactionVersion: 0,
        },
      ],
    }),
  });

  const data = await response.json();
  const tx = data.result;
  
  console.log('\n📊 CLOSE TRANSACTION ANALYSIS (3SL5jV8f...)');
  console.log('='.repeat(80));
  
  // Check token balances
  const preBalances = tx.meta.preTokenBalances || [];
  const postBalances = tx.meta.postTokenBalances || [];
  
  console.log('\n💰 Pre-Token Balances:');
  preBalances.forEach((pre) => {
    const account = tx.transaction.message.accountKeys[pre.accountIndex];
    console.log(`  Index ${pre.accountIndex}: ${account.pubkey.slice(0, 8)}...`);
    console.log(`    Mint: ${pre.mint.slice(0, 8)}...`);
    console.log(`    Amount: ${pre.uiTokenAmount.uiAmountString}`);
  });
  
  console.log('\n💰 Post-Token Balances:');
  postBalances.forEach((post) => {
    const account = tx.transaction.message.accountKeys[post.accountIndex];
    console.log(`  Index ${post.accountIndex}: ${account.pubkey.slice(0, 8)}...`);
    console.log(`    Mint: ${post.mint.slice(0, 8)}...`);
    console.log(`    Amount: ${post.uiTokenAmount.uiAmountString}`);
  });
  
  console.log('\n📈 Token Balance CHANGES:');
  const changes = new Map();
  
  postBalances.forEach((post) => {
    const pre = preBalances.find((p) => p.accountIndex === post.accountIndex);
    const preAmount = pre ? parseFloat(pre.uiTokenAmount.uiAmountString || '0') : 0;
    const postAmount = parseFloat(post.uiTokenAmount.uiAmountString || '0');
    const change = postAmount - preAmount;
    
    const mint = post.mint.slice(0, 8);
    const symbol = post.mint === 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' ? 'USDC' :
                   post.mint === 'So11111111111111111111111111111111111111112' ? 'SOL' : 'Unknown';
    
    if (Math.abs(change) > 0.000001 || Math.abs(postAmount) > 0.000001) {
      const account = tx.transaction.message.accountKeys[post.accountIndex];
      console.log(`  ${symbol} (${mint}...)`);
      console.log(`    Account: ${account.pubkey}`);
      console.log(`    Pre: ${preAmount}`);
      console.log(`    Post: ${postAmount}`);
      console.log(`    Change: ${change > 0 ? '+' : ''}${change}`);
      
      if (!changes.has(mint)) {
        changes.set(mint, { symbol, total: 0, accounts: [] });
      }
      changes.get(mint).total += change;
      changes.get(mint).accounts.push({ account: account.pubkey, change });
    }
  });
  
  console.log('\n📊 SUMMARY - Total Changes by Token:');
  changes.forEach((data, mint) => {
    console.log(`  ${data.symbol}: ${data.total > 0 ? '+' : ''}${data.total}`);
    console.log(`    Affected ${data.accounts.length} account(s)`);
  });
  
  console.log('\n✅ EXPECTED for user wallet:');
  console.log('  - User receives: +391.87 USDC');
  console.log('  - User receives: +0 SOL (none in this tx)');
}

main().catch(console.error);


