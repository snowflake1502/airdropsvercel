## MCP Server + Manual Overrides (Operational Guide)

### Goal
- Keep **protocol integrations** isolated in the **MCP server** (add protocols one-by-one).
- Keep the dashboard resilient:
  - If a protocol API is unreliable (e.g. Meteora position values), the user can **manually add positions**.
  - If closed-position P&L is off, the user can **override P&L using Metlex summary**.

---

## MCP Server (Protocol Integrations)

### Protocols enabled now
- **Meteora**: scaffolded (SDK wiring pending).
- **Sanctum**: provides LST holdings via `get_protocol_data`.
- **Jupiter**: provides JUP balance + recent swap activity via `get_protocol_data`.

### Build / run (local)
From repo root:

```powershell
cd mcp-server
npm install
npm run build
npm run dev
```

### Tools exposed
- `get_protocol_data` (recommended read API for dashboard)
- `get_positions` (LP-style positions; currently best suited for Meteora once SDK is wired)
- `claim_fees`, `rebalance_position`, `open_position` (transaction builders; protocol support varies)

### Dashboard integration
- Backend route: `GET /api/mcp/protocol-data?protocol=<jupiter|sanctum|meteora>&walletAddress=<address>`
  - Tries MCP first (spawns MCP server client locally)
  - Falls back to direct RPC heuristics if MCP is unavailable (works online)

---

## Meteora: Manual Position Entry (Stop Blocking on API Debugging)

Where: **Dashboard → Portfolio**
- Click **“➕ Add Position”** to add an active Meteora position manually.
- Stored in Supabase table `manual_positions` as:
  - `position_type = 'dlmm'`
  - `position_data.source = 'manual'`
  - `position_data.protocol = 'meteora'`

Result:
- Manual positions appear in the **Positions** tab as “(Manual)”.

---

## Closed Position P&L Override (Metlex)

Where: **Dashboard → Portfolio → History**
- For a **position_close** tx row, click **“Upload Metlex P&L ↗”**
- Enter the numbers (Profit USD, PnL%, TVL, etc.)
- Optional: attach the summary image
  - If you want file uploads, create Supabase Storage bucket: **`position-summaries`**

Storage approach:
- Stored in Supabase `manual_positions` as:
  - `position_type = 'pnl_override'`
  - `position_data.source = 'metlex'`
  - `position_data.protocol = 'meteora'`
  - keyed by `position_data.position_nft_address`

Effect:
- Total P&L uses the override by adjusting realized P&L with the delta between:
  - computed P&L from transactions
  - overridden `profit_usd` from Metlex

---

## Notes / Limitations
- This approach avoids getting stuck on protocol APIs and still matches user-facing totals.
- For “Jupiter Portfolio” *full cross-protocol DeFi positions* (170+ protocols), a paid aggregator or per-protocol integrations are still required.

