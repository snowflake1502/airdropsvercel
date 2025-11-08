// Debug script to analyze the Oct 26 close transaction
const fetch = require('node-fetch');

const WALLET = '8bCupLv3n8u9tToLBJ3e1SNL5p5oSyMPz9Mr3j8ZkbYR';
const RPC_URL = 'https://mainnet.helius-rpc.com/?api-key=201675f6-a0a5-41b0-8206-c5d1f81fc8f2';

// Based on user's timeline, Oct 26 3:16 PM should be the close
// Let's find transactions around that time

async function analyzeTx(signature) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`Analyzing transaction: ${signature}`);
  console.log('='.repeat(80));
  
  const response = await fetch(RPC_URL, {
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
  const tx = data.result;
  
  if (!tx) {
    console.log('Transaction not found!');
    return;
  }
  
  const blockTime = new Date(tx.blockTime * 1000);
  console.log(`\n📅 Block Time: ${blockTime.toLocaleString()}`);
  
  // Check token balances
  const preBalances = tx.meta.preTokenBalances || [];
  const postBalances = tx.meta.postTokenBalances || [];
  
  console.log(`\n💰 Token Balance Changes:`);
  postBalances.forEach((post) => {
    const pre = preBalances.find((p) => p.accountIndex === post.accountIndex);
    const preAmount = pre ? parseFloat(pre.uiTokenAmount.uiAmountString || '0') : 0;
    const postAmount = parseFloat(post.uiTokenAmount.uiAmountString || '0');
    const change = postAmount - preAmount;
    
    if (Math.abs(change) > 0.000001) {
      const account = tx.transaction.message.accountKeys[post.accountIndex];
      console.log(`  Index ${post.accountIndex}: ${post.mint.slice(0, 8)}...`);
      console.log(`    Account: ${account.pubkey}`);
      console.log(`    Change: ${change > 0 ? '+' : ''}${change.toFixed(6)}`);
      console.log(`    Owner: ${post.uiTokenAmount.owner || 'N/A'}`);
    }
  });
  
  // Print all writable, non-signer accounts
  console.log(`\n🔑 Writable, Non-Signer Accounts (candidates for position NFT):`);
  tx.transaction.message.accountKeys.forEach((key, index) => {
    if (key.writable && !key.signer) {
      console.log(`  Index ${index}: ${key.pubkey} ${index === 0 ? '(fee payer)' : ''}`);
    }
  });
  
  // Check for position-related logs
  console.log(`\n📝 Relevant Log Messages:`);
  const logs = tx.meta.logMessages || [];
  logs.forEach((log) => {
    if (log.toLowerCase().includes('position') || 
        log.includes('ClosePosition') || 
        log.includes('Close') ||
        log.includes('NFT')) {
      console.log(`  ${log}`);
    }
  });
  
  // Check inner instructions for position NFT
  console.log(`\n🔍 Inner Instructions (looking for position NFT):`);
  const innerInstructions = tx.meta.innerInstructions || [];
  innerInstructions.forEach((inner, idx) => {
    console.log(`  Instruction ${inner.index}:`);
    inner.instructions.forEach((inst, instIdx) => {
      if (inst.parsed) {
        console.log(`    ${instIdx}. ${inst.parsed.type}`);
        if (inst.parsed.info) {
          console.log(`       Info:`, JSON.stringify(inst.parsed.info, null, 8));
        }
      }
    });
  });
}

async function main() {
  // Get recent signatures
  const response = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'getSignaturesForAddress',
      params: [WALLET, { limit: 20 }],
    }),
  });

  const data = await response.json();
  const signatures = data.result;
  
  console.log(`\n📋 Recent Transactions for ${WALLET}:`);
  signatures.forEach((sig, idx) => {
    const date = new Date(sig.blockTime * 1000);
    console.log(`${idx}. ${sig.signature.slice(0, 8)}... - ${date.toLocaleString()}`);
  });
  
  // Analyze the first few (most recent should be Oct 26 close)
  console.log('\n🔬 Detailed Analysis:');
  
  for (let i = 0; i < Math.min(3, signatures.length); i++) {
    await analyzeTx(signatures[i].signature);
    await new Promise(resolve => setTimeout(resolve, 500));
  }
}

main().catch(console.error);


