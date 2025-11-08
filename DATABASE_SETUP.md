# Database Setup Guide

This guide will help you set up the Airdrop Dashboard database in Supabase.

## Prerequisites

- Active Supabase project
- Access to Supabase SQL Editor

## Step-by-Step Setup

### Step 1: Access Supabase SQL Editor

1. Go to your Supabase project dashboard
2. Click on **"SQL Editor"** in the left sidebar
3. Click **"New query"** button

### Step 2: Run Schema Migration

1. Open the `supabase-schema.sql` file from this project
2. Copy the entire contents
3. Paste into the Supabase SQL Editor
4. Click **"Run"** button (or press Ctrl/Cmd + Enter)
5. Wait for the success message

**Expected Output:**
```
Success. No rows returned
```

**This will create:**
- 7 database tables
- Row Level Security policies
- Indexes for performance
- Triggers for automatic timestamps

### Step 3: Run Seed Data

1. Click **"New query"** button again
2. Open the `supabase-seed-data.sql` file
3. Copy the entire contents
4. Paste into the Supabase SQL Editor
5. Click **"Run"** button

**Expected Output:**
```
Protocols Created: 4
Farming Activities Created: 13
```

**This will create:**
- 4 protocols (Meteora, Jupiter, Sanctum, Magic Eden)
- 13 farming activities across all protocols

### Step 4: Verify Setup

Run this query to verify everything is set up correctly:

```sql
-- Check tables exist
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN (
  'tracked_wallets',
  'protocols',
  'farming_activities',
  'user_transactions',
  'farming_schedules',
  'farming_recommendations',
  'user_farming_scores'
);

-- Check protocols
SELECT name, slug, airdrop_status FROM protocols;

-- Check farming activities count
SELECT p.name, COUNT(fa.id) as activities
FROM protocols p
LEFT JOIN farming_activities fa ON p.id = fa.protocol_id
GROUP BY p.name;
```

**Expected Results:**
- 7 tables should be listed
- 4 protocols should be shown
- Each protocol should have 2-3 activities

## Database Schema Overview

### Tables Created

1. **tracked_wallets** - User's tracked wallet addresses
2. **protocols** - Protocol metadata (Meteora, Jupiter, etc.)
3. **farming_activities** - Activity templates for farming
4. **user_transactions** - Transaction history
5. **farming_schedules** - Automated task schedules
6. **farming_recommendations** - AI-generated suggestions
7. **user_farming_scores** - Farming score tracking

### Security

- Row Level Security (RLS) is enabled on all user tables
- Users can only access their own data
- Protocols and activities are public (read-only)

## Troubleshooting

### Error: "permission denied for schema public"

**Solution:** Make sure you're using the correct Supabase project and have admin access.

### Error: "relation already exists"

**Solution:** Tables already exist. Either:
- Drop existing tables first (destructive!)
- Or skip to seed data step

To drop all tables:
```sql
DROP TABLE IF EXISTS user_farming_scores CASCADE;
DROP TABLE IF EXISTS farming_recommendations CASCADE;
DROP TABLE IF EXISTS farming_schedules CASCADE;
DROP TABLE IF EXISTS user_transactions CASCADE;
DROP TABLE IF EXISTS farming_activities CASCADE;
DROP TABLE IF EXISTS protocols CASCADE;
DROP TABLE IF EXISTS tracked_wallets CASCADE;
```

### Error: "duplicate key value violates unique constraint"

**Solution:** Seed data already exists. You can either:
- Skip seeding
- Or delete existing data:
```sql
DELETE FROM farming_activities;
DELETE FROM protocols;
```
Then run seed data again.

## Next Steps

After database setup is complete:
1. Update your `.env.local` file with Supabase credentials
2. Restart your Next.js development server
3. The application will now have access to the database

## Environment Variables

Make sure these are set in `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

## Support

If you encounter any issues:
1. Check the Supabase logs (Logs section in dashboard)
2. Verify your SQL syntax is correct
3. Ensure you have the latest version of this project


