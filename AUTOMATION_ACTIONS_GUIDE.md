# 🤖 Automated Actions Guide

When you approve a personalized airdrop plan, the following automated actions are configured and activated:

---

## ✅ **Active Automated Actions**

### 1. **Auto-Claim Fees** 💰
- **When**: Automatically claims fees when they reach ≥ $5 USD
- **Frequency**: Maximum once per 24 hours per position
- **Safety**: Only claims if gas fee < 10% of claimable amount
- **Purpose**: Maximize rewards without manual intervention

**Configuration:**
- Threshold: $5.00 USD
- Cooldown: 24 hours
- Gas fee check: Enabled

---

### 2. **Auto-Rebalance Positions** ⚖️
- **When**: Automatically rebalances positions that are out of range
- **Trigger**: Position fee APR drops to 0% (out of range)
- **Cooldown**: 6 hours between rebalances
- **Purpose**: Keep positions active and earning fees

**Configuration:**
- Threshold: 20% out of range
- Cooldown: 6 hours
- Manual approval: Required for large rebalances (>$100)

---

### 3. **Position Monitoring** 📊
- **When**: Continuously monitors all positions
- **Frequency**: Every 5 minutes
- **Actions**: 
  - Tracks position status (active/out of range)
  - Updates P&L calculations
  - Detects new transactions
  - Logs activity for airdrop eligibility

**Purpose**: Ensure all activity is tracked for airdrop qualification

---

### 4. **Auto-Open Positions** ⏳ (Conditional)
- **When**: Enabled if your plan includes multiple protocols
- **Requirement**: Manual approval required for amounts > $100
- **Frequency**: Maximum 1 position per 7 days
- **Purpose**: Gradually build positions according to your plan

**Configuration:**
- Max positions: Based on your plan
- Daily spend limit: 20% of available balance
- Approval threshold: $100 USD

---

## 🛡️ **Safety Controls**

### Budget Limits
- **Total Budget**: Set to your available balance
- **Max Position Size**: Based on your plan's recommendations
- **Min Position Size**: Minimum $50 USD
- **Daily Spend Limit**: 20% of available balance

### Position Limits
- **Max Concurrent Positions**: Based on your plan
- **Min Days Between Opens**: 7 days
- **Manual Approval**: Required for actions > $100

### Circuit Breakers
- **Budget Exceeded**: All automation paused
- **Daily Limit Reached**: Paused until next day
- **Position Limit Reached**: No new positions opened
- **Error Rate**: If 3+ errors occur, automation paused

---

## 📋 **What Gets Automated**

### ✅ **Fully Automated** (No approval needed)
1. Fee claiming (when threshold met)
2. Position monitoring and tracking
3. P&L calculations and updates
4. Transaction history syncing

### ⏳ **Semi-Automated** (Requires approval)
1. Opening new positions (>$100)
2. Large rebalances (>$100)
3. Closing positions

### ❌ **Never Automated**
1. Withdrawing funds
2. Changing automation settings
3. Modifying approved plan
4. Large transactions (>$500)

---

## 🔄 **How Automation Works**

### Execution Flow
1. **Every 5 minutes**: Automation engine checks all active positions
2. **Rule Evaluation**: Evaluates each automation rule
3. **Safety Checks**: Validates budget, limits, and cooldowns
4. **Action Execution**: Executes approved actions
5. **Logging**: Records all actions in `automation_logs` table

### Approval Process
1. **Action Detected**: Automation identifies action needed
2. **Safety Validation**: Checks budget, limits, cooldowns
3. **Approval Check**: If > threshold, creates approval request
4. **User Notification**: You receive notification (if enabled)
5. **Execution**: After approval, action executes
6. **Logging**: All actions logged with full details

---

## 📊 **Monitoring & Logs**

### Where to Check
- **Dashboard**: Real-time status of automation
- **Activities Page**: Full execution log
- **Positions Page**: Position status and P&L

### What's Logged
- Action type (claim, rebalance, open, etc.)
- Status (pending, approved, executed, failed)
- Transaction signature (when executed)
- Cost in USD
- Gas fees
- Timestamp
- Error messages (if any)

---

## ⚙️ **Configuration Details**

When you approve a plan, the following automation config is created:

```json
{
  "total_budget_usd": "Your available balance",
  "spent_usd": 0,
  "max_position_size_usd": "Largest protocol investment",
  "min_position_size_usd": "Smallest protocol investment",
  "auto_claim_fees": true,
  "claim_fee_threshold_usd": 5.00,
  "claim_fee_interval_hours": 24,
  "auto_rebalance": true,
  "rebalance_threshold_percent": 20.00,
  "rebalance_cooldown_hours": 6,
  "auto_open_position": true,
  "min_days_between_opens": 7,
  "max_positions": "Number of protocols in plan",
  "max_daily_spend_usd": "20% of balance",
  "require_manual_approval": true,
  "approval_threshold_usd": 100.00,
  "is_active": true
}
```

---

## 🚨 **Important Notes**

1. **Manual Override**: You can pause automation anytime from Settings
2. **Budget Protection**: Automation stops if budget exceeded
3. **Approval Required**: Large actions always require your approval
4. **Transparency**: All actions are logged and visible
5. **Safety First**: Multiple safety checks prevent over-spending

---

## 🔧 **Modifying Automation**

To change automation settings:
1. Go to **Settings** page
2. Click **Automation Configuration**
3. Adjust settings as needed
4. Save changes

**Note**: Changes take effect immediately for new actions. Already-approved actions will still execute.

---

## 📞 **Support**

If you have questions about automation:
- Check the **Activities** page for execution logs
- Review **Positions** page for current status
- Check browser console for detailed logs
- Contact support if automation behaves unexpectedly

---

**Last Updated**: Plan approval date
**Status**: ✅ Active

