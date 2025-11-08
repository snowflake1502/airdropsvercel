# 🤖 Automation Quick Reference

## 🎯 What Gets Automated?

| Action | When | Budget Impact | Approval Needed? |
|--------|------|---------------|------------------|
| **Claim Fees** | Fees ≥ $5, last claim ≥ 24h ago | Gas fee only (~$0.01) | No (if < $100) |
| **Rebalance** | Position out of range > 2h | Gas fees (~$0.02) | Yes (if > $100) |
| **Open Position** | No active positions, 7+ days since last | Position cost + gas | Yes (if > $100) |

---

## 💰 Budget Controls

### **Default Settings** (Safe for Beginners)

```typescript
{
  totalBudgetUSD: 1000,        // Total you're willing to invest
  maxPositionSizeUSD: 500,    // Max per position
  minPositionSizeUSD: 50,     // Min per position
  maxDailySpendUSD: 200,      // Max spending per day
  maxPositions: 3             // Max concurrent positions
}
```

### **Conservative Settings** (Low Risk)

```typescript
{
  totalBudgetUSD: 500,
  maxPositionSizeUSD: 250,
  minPositionSizeUSD: 50,
  maxDailySpendUSD: 100,
  maxPositions: 2,
  requireManualApproval: true,
  approvalThresholdUSD: 50    // Approve anything > $50
}
```

### **Aggressive Settings** (Higher Risk)

```typescript
{
  totalBudgetUSD: 5000,
  maxPositionSizeUSD: 2000,
  minPositionSizeUSD: 100,
  maxDailySpendUSD: 500,
  maxPositions: 5,
  requireManualApproval: false,
  autoOpenPosition: true      // Auto-open new positions
}
```

---

## ⚙️ Rule Configuration

### **Fee Claiming** 💰

```typescript
autoClaimFees: true,                    // Enable auto-claim
claimFeeThresholdUSD: 5.00,             // Claim when fees >= $5
claimFeeIntervalHours: 24               // Max once per 24 hours
```

**Why:** Claiming fees shows active management and increases airdrop eligibility.

---

### **Rebalancing** ⚖️

```typescript
autoRebalance: true,                    // Enable auto-rebalance
rebalanceThresholdPercent: 20.00,       // Rebalance if out of range >20%
rebalanceCooldownHours: 6               // Wait 6h between rebalances
```

**Why:** Out-of-range positions don't earn fees. Rebalancing keeps you active.

---

### **Position Opening** 🆕

```typescript
autoOpenPosition: false,                // Disable by default (conservative)
minDaysBetweenOpens: 7                  // Don't open more than 1 per week
```

**Why:** Opening positions costs money. Only enable if you want aggressive farming.

---

## 🛡️ Safety Features

### **1. Manual Approval**

For actions > `approvalThresholdUSD`, you'll get a notification:

```
🔔 Approval Required
Action: Rebalance Position
Cost: $150.00
Position: USDC-SOL (Out of Range)
Approve | Reject
```

### **2. Budget Limits**

- ✅ **Total Budget**: Hard limit on total spending
- ✅ **Daily Limit**: Prevents overspending in one day
- ✅ **Position Size**: Ensures reasonable position sizes

### **3. Cooldown Periods**

- **Fee Claims**: Max once per 24 hours
- **Rebalances**: Min 6 hours between rebalances
- **New Positions**: Min 7 days between opens

---

## 📊 Monitoring Dashboard

### **Key Metrics**

1. **Budget Status**
   - Total Budget: $1,000
   - Spent: $450
   - Available: $550
   - Reserved: $100 (pending approvals)

2. **Activity Summary**
   - Positions Active: 2
   - Fees Claimed Today: $12.50
   - Actions Executed: 5
   - Success Rate: 100%

3. **Recent Actions**
   - ✅ Claimed fees ($5.20) - 2h ago
   - ✅ Rebalanced position - 6h ago
   - ⏳ Pending: Open new position ($200) - Awaiting approval

---

## 🚦 Status Indicators

| Status | Meaning | Action |
|--------|---------|--------|
| 🟢 **Active** | Automation running | Monitoring positions |
| 🟡 **Paused** | Automation disabled | Enable in settings |
| 🔴 **Budget Exceeded** | No funds available | Increase budget or wait |
| ⚠️ **Approval Pending** | Action waiting approval | Review and approve |
| ❌ **Error** | Transaction failed | Check logs and retry |

---

## 🔧 Troubleshooting

### **Automation Not Running**

1. Check `is_active` is `true` in settings
2. Verify budget hasn't been exceeded
3. Check for pending approvals
4. Review error logs

### **Transactions Failing**

1. Check wallet has enough SOL for gas
2. Verify position still exists
3. Check network connectivity
4. Review transaction logs

### **Budget Issues**

1. Check daily spend limit
2. Verify total budget not exceeded
3. Check for reserved funds (pending approvals)
4. Review spending history

---

## 📱 Notifications

You'll receive notifications for:

- ✅ **Successful Actions**: "Fees claimed: $5.20"
- ⚠️ **Approval Required**: "Rebalance needed: $150"
- ❌ **Failures**: "Transaction failed: Insufficient SOL"
- 💰 **Budget Alerts**: "Budget 80% used: $800/$1000"

---

## 🎓 Best Practices

1. **Start Conservative**
   - Enable only fee claiming first
   - Set low budget limits
   - Require manual approval

2. **Monitor Regularly**
   - Check dashboard daily
   - Review execution logs
   - Adjust rules as needed

3. **Gradually Increase**
   - Once comfortable, enable rebalancing
   - Increase budget limits
   - Reduce approval thresholds

4. **Stay Informed**
   - Monitor airdrop announcements
   - Adjust strategy based on protocol updates
   - Keep wallet funded for gas

---

## 🚀 Getting Started

1. **Set Budget**: Configure your total budget and limits
2. **Enable Rules**: Start with fee claiming only
3. **Connect Wallet**: Link your Solana wallet
4. **Monitor**: Watch the dashboard for activity
5. **Approve**: Review and approve pending actions
6. **Optimize**: Adjust rules based on results

---

**Ready to automate? Start with fee claiming and gradually add more features! 🎯**

