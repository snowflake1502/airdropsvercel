# 🤖 Meteora Airdrop Farming Automation Plan

## 📋 Executive Summary

This document outlines a comprehensive automation system to maximize airdrop potential while maintaining strict budget controls and risk management. The system will automatically execute farming actions (open positions, claim fees, rebalance) based on configurable rules and budget limits.

---

## 🎯 Core Objectives

1. **Automate Routine Actions**: Eliminate manual intervention for common farming tasks
2. **Budget Control**: Strict spending limits to prevent over-investment
3. **Risk Management**: Safety controls to protect capital
4. **Airdrop Optimization**: Maximize farming score through consistent, strategic activity
5. **Transparency**: Full audit trail of all automated actions

---

## 🏗️ System Architecture

### **1. Automation Engine** (`src/lib/automation/`)

```
automation/
├── engine.ts              # Main automation orchestrator
├── rules.ts               # Rule definitions and evaluation
├── executor.ts            # Transaction execution handler
├── budget-manager.ts      # Budget tracking and enforcement
├── safety-checks.ts       # Risk validation before execution
└── types.ts               # TypeScript interfaces
```

### **2. Database Schema** (Supabase)

```sql
-- Automation configuration per user
CREATE TABLE automation_configs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  wallet_address TEXT NOT NULL,
  
  -- Budget Controls
  total_budget_usd DECIMAL(12,2) NOT NULL DEFAULT 1000.00,
  spent_usd DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  max_position_size_usd DECIMAL(12,2) NOT NULL DEFAULT 500.00,
  min_position_size_usd DECIMAL(12,2) NOT NULL DEFAULT 50.00,
  
  -- Automation Rules
  auto_claim_fees BOOLEAN DEFAULT true,
  claim_fee_threshold_usd DECIMAL(10,2) DEFAULT 5.00,  -- Claim when fees >= $5
  claim_fee_interval_hours INTEGER DEFAULT 24,          -- Max once per 24h
  
  auto_rebalance BOOLEAN DEFAULT true,
  rebalance_threshold_percent DECIMAL(5,2) DEFAULT 20.00,  -- Rebalance if out of range >20%
  rebalance_cooldown_hours INTEGER DEFAULT 6,               -- Wait 6h between rebalances
  
  auto_open_position BOOLEAN DEFAULT false,  -- More conservative default
  min_days_between_opens INTEGER DEFAULT 7,  -- Don't open more than 1 position per week
  
  -- Safety Controls
  max_positions INTEGER DEFAULT 3,
  max_daily_spend_usd DECIMAL(12,2) DEFAULT 200.00,
  require_manual_approval BOOLEAN DEFAULT true,  -- Require approval for large actions
  approval_threshold_usd DECIMAL(12,2) DEFAULT 100.00,
  
  -- Status
  is_active BOOLEAN DEFAULT false,
  last_run_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Automation execution log
CREATE TABLE automation_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  config_id UUID REFERENCES automation_configs(id) ON DELETE CASCADE,
  
  action_type TEXT NOT NULL,  -- 'open_position', 'claim_fees', 'rebalance', 'close_position'
  status TEXT NOT NULL,       -- 'pending', 'approved', 'executed', 'failed', 'rejected'
  
  -- Transaction details
  transaction_signature TEXT,
  position_address TEXT,
  amount_usd DECIMAL(12,2),
  
  -- Execution details
  triggered_by TEXT,          -- 'rule', 'manual', 'scheduled'
  rule_name TEXT,
  error_message TEXT,
  
  -- Budget impact
  cost_usd DECIMAL(12,2) DEFAULT 0.00,
  gas_fee_sol DECIMAL(18,9) DEFAULT 0.00,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  executed_at TIMESTAMPTZ
);

-- Pending approvals (if manual approval enabled)
CREATE TABLE automation_approvals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  log_id UUID REFERENCES automation_logs(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  
  action_type TEXT NOT NULL,
  details JSONB NOT NULL,
  estimated_cost_usd DECIMAL(12,2),
  
  status TEXT DEFAULT 'pending',  -- 'pending', 'approved', 'rejected'
  approved_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '24 hours'),
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 🔄 Automation Rules & Triggers

### **Rule 1: Auto-Claim Fees** 💰

**Trigger Conditions:**
- Position has unclaimed fees >= `claim_fee_threshold_usd`
- Last claim was >= `claim_fee_interval_hours` ago
- Gas fee < 10% of claimable amount

**Action:**
- Execute fee claim transaction
- Update budget: `spent_usd += gas_fee`
- Log action

**Safety Checks:**
- ✅ Position still exists
- ✅ Fees haven't been claimed manually
- ✅ Budget allows gas fee

---

### **Rule 2: Auto-Rebalance** ⚖️

**Trigger Conditions:**
- Position is out of range (fee_apr_24h = 0%)
- Position has been out of range for >= 2 hours
- Last rebalance was >= `rebalance_cooldown_hours` ago
- Remaining budget >= `min_position_size_usd`

**Action:**
1. Close current position (withdraw funds)
2. Wait for confirmation (30 seconds)
3. Open new position at current market price
4. Update budget: `spent_usd += gas_fees`
- Log both actions

**Safety Checks:**
- ✅ Position value > $10 (worth rebalancing)
- ✅ Budget allows new position
- ✅ Not exceeding `max_positions`
- ✅ Daily spend limit not exceeded

---

### **Rule 3: Auto-Open Position** 🆕

**Trigger Conditions:**
- No active positions
- Last position open was >= `min_days_between_opens` ago
- Remaining budget >= `min_position_size_usd`
- User has enabled `auto_open_position`

**Action:**
- Open new position with `min_position_size_usd` (or user-specified amount)
- Update budget: `spent_usd += position_cost + gas_fee`
- Log action

**Safety Checks:**
- ✅ Budget allows position
- ✅ Not exceeding `max_positions`
- ✅ Daily spend limit not exceeded
- ✅ If cost > `approval_threshold_usd`, require approval

---

### **Rule 4: Maintain Long-Term Positions** 📅

**Trigger Conditions:**
- Position age < 30 days
- Position is active and in range
- No action needed (monitoring only)

**Action:**
- Log status (no transaction)
- Send notification if position approaching 30 days

---

## 💰 Budget Management

### **Budget Tracking**

```typescript
interface BudgetState {
  totalBudgetUSD: number;
  spentUSD: number;
  reservedUSD: number;  // For pending approvals
  availableUSD: number; // totalBudget - spent - reserved
  
  dailySpend: {
    date: string;
    amount: number;
  }[];
  
  positionAllocations: {
    positionAddress: string;
    investedUSD: number;
  }[];
}
```

### **Budget Enforcement**

1. **Pre-Execution Check:**
   ```typescript
   if (actionCost + reservedUSD > availableUSD) {
     return { allowed: false, reason: 'Insufficient budget' };
   }
   ```

2. **Daily Spend Limit:**
   ```typescript
   const todaySpend = getTodaySpend();
   if (todaySpend + actionCost > maxDailySpendUSD) {
     return { allowed: false, reason: 'Daily limit exceeded' };
   }
   ```

3. **Position Size Limits:**
   ```typescript
   if (positionSize < minPositionSizeUSD || positionSize > maxPositionSizeUSD) {
     return { allowed: false, reason: 'Position size out of range' };
   }
   ```

---

## 🛡️ Safety Controls

### **1. Manual Approval System**

For actions exceeding `approval_threshold_usd`:
- Create approval request in `automation_approvals` table
- Send notification (email/push)
- User approves/rejects via UI
- Execute only after approval

### **2. Cooldown Periods**

- **Rebalance Cooldown**: Prevent excessive rebalancing (default 6 hours)
- **Position Open Cooldown**: Limit new positions (default 7 days)
- **Fee Claim Cooldown**: Prevent spam claims (default 24 hours)

### **3. Position Limits**

- **Max Positions**: Prevent over-diversification (default 3)
- **Min Position Size**: Ensure meaningful positions (default $50)
- **Max Position Size**: Limit risk per position (default $500)

### **4. Circuit Breakers**

- **Daily Loss Limit**: Pause automation if daily P&L < -$100
- **Consecutive Failures**: Pause if 3+ transactions fail in a row
- **Network Issues**: Pause if RPC errors > 5 in 10 minutes

---

## 🔌 Integration Points

### **1. Wallet Connection**

**Option A: Wallet Adapter (Recommended)**
- Use `@solana/wallet-adapter-react`
- User connects wallet in UI
- Automation requests transaction signing
- User approves via wallet popup

**Option B: Private Key Storage (Advanced)**
- Encrypt private key in database
- Decrypt server-side for execution
- ⚠️ Higher security risk

**Recommendation: Use Option A** - More secure, user maintains control

### **2. Meteora SDK Integration**

```typescript
import { MeteoraDLMM } from '@meteora-ag/dlmm';

// Initialize SDK
const dlmm = new MeteoraDLMM(connection, wallet);

// Claim fees
await dlmm.claimFee(positionAddress, userWallet);

// Close position
await dlmm.removeLiquidity(positionAddress, userWallet);

// Open position
await dlmm.addLiquidity(poolAddress, tokenXAmount, tokenYAmount, userWallet);
```

### **3. Transaction Execution Flow**

```
1. Rule Engine evaluates conditions
2. Safety checks pass
3. Budget check passes
4. If > approval_threshold: Create approval request
5. User approves (if required)
6. Build transaction using Meteora SDK
7. Sign transaction (wallet adapter)
8. Send transaction to Solana
9. Wait for confirmation
10. Update database (budget, logs, positions)
11. Send notification
```

---

## 📊 UI Components

### **1. Automation Dashboard** (`/dashboard/automation`)

**Features:**
- Enable/disable automation
- Configure budget and rules
- View pending approvals
- Execution history/logs
- Budget tracking chart
- Performance metrics

**Components:**
```typescript
// src/components/automation/
├── AutomationDashboard.tsx      # Main dashboard
├── BudgetControls.tsx             # Budget configuration
├── RuleConfiguration.tsx         # Rule settings
├── ApprovalQueue.tsx             # Pending approvals
├── ExecutionLog.tsx              # Action history
└── BudgetChart.tsx               # Spending visualization
```

### **2. Settings Panel**

```typescript
interface AutomationSettings {
  // Budget
  totalBudgetUSD: number;
  maxPositionSizeUSD: number;
  minPositionSizeUSD: number;
  maxDailySpendUSD: number;
  
  // Rules
  autoClaimFees: boolean;
  claimFeeThresholdUSD: number;
  claimFeeIntervalHours: number;
  
  autoRebalance: boolean;
  rebalanceThresholdPercent: number;
  rebalanceCooldownHours: number;
  
  autoOpenPosition: boolean;
  minDaysBetweenOpens: number;
  
  // Safety
  maxPositions: number;
  requireManualApproval: boolean;
  approvalThresholdUSD: number;
}
```

---

## ⚙️ Implementation Phases

### **Phase 1: Foundation** (Week 1-2)
- [ ] Database schema creation
- [ ] Budget manager implementation
- [ ] Safety checks module
- [ ] Basic UI for configuration

### **Phase 2: Fee Claiming** (Week 2-3)
- [ ] Rule engine for fee claims
- [ ] Meteora SDK integration
- [ ] Transaction execution
- [ ] Logging and notifications

### **Phase 3: Rebalancing** (Week 3-4)
- [ ] Position monitoring
- [ ] Rebalance detection
- [ ] Close + reopen logic
- [ ] Error handling

### **Phase 4: Position Opening** (Week 4-5)
- [ ] Auto-open rules
- [ ] Position size calculation
- [ ] Pool selection logic
- [ ] Approval system

### **Phase 5: Polish** (Week 5-6)
- [ ] UI/UX improvements
- [ ] Comprehensive testing
- [ ] Documentation
- [ ] Security audit

---

## 🔒 Security Considerations

1. **Wallet Security**
   - Never store private keys in plain text
   - Use wallet adapter for signing
   - Implement transaction preview before signing

2. **Budget Protection**
   - Server-side budget validation
   - Double-check before execution
   - Revert on failure

3. **Rate Limiting**
   - Limit automation runs (max 1 per 5 minutes)
   - Prevent rapid-fire transactions
   - Respect Solana network limits

4. **Error Handling**
   - Comprehensive try-catch blocks
   - Transaction retry logic
   - Failure notifications

5. **Audit Trail**
   - Log all actions
   - Store transaction signatures
   - Track budget changes

---

## 📈 Success Metrics

1. **Automation Rate**: % of actions automated vs manual
2. **Budget Adherence**: Actual spend vs budget
3. **Success Rate**: % of successful transactions
4. **Time Saved**: Hours saved per week
5. **Farming Score**: Improvement in airdrop eligibility

---

## 🚀 Quick Start Example

```typescript
// User enables automation with:
{
  totalBudgetUSD: 1000,
  maxPositionSizeUSD: 500,
  autoClaimFees: true,
  claimFeeThresholdUSD: 5,
  autoRebalance: true,
  requireManualApproval: true,
  approvalThresholdUSD: 100
}

// System automatically:
// 1. Monitors positions every 5 minutes
// 2. Claims fees when >= $5 (max once per 24h)
// 3. Detects out-of-range positions
// 4. Requests approval for rebalance (>$100)
// 5. Executes approved actions
// 6. Updates budget and logs
```

---

## ❓ FAQ

**Q: Can I pause automation anytime?**
A: Yes, toggle `is_active` to false in settings.

**Q: What if I run out of budget?**
A: Automation pauses automatically. You can increase budget or wait for next period.

**Q: Can I set different budgets per wallet?**
A: Yes, each wallet can have its own automation config.

**Q: What happens if a transaction fails?**
A: System logs the error, notifies you, and retries (if appropriate) or pauses.

**Q: Can I automate multiple wallets?**
A: Yes, create separate automation configs for each wallet.

---

## 📝 Next Steps

1. **Review this plan** and provide feedback
2. **Prioritize features** (which phase to start with?)
3. **Set budget defaults** (what are reasonable limits?)
4. **Choose wallet integration** (adapter vs private key?)
5. **Begin Phase 1 implementation**

---

**Ready to automate your airdrop farming? Let's build it! 🚀**

