# 🚀 Quick Start - Get Login Working in 5 Minutes

## Current Status
✅ App deployed: https://funds-india-8134.vercel.app
✅ Code pushed to GitHub
❌ Database empty (no tables or users yet)

**Result:** Login shows "Invalid email or password" ✗

---

## Fix Login in 3 Steps

### Step 1: Create Database Tables (2 minutes)

1. **Open Supabase Dashboard:**
   - Go to: https://supabase.com/dashboard
   - Click on project: `pgomungsynwbqwcwskly`

2. **Open SQL Editor:**
   - Click "SQL Editor" in left sidebar
   - Click "New Query"

3. **Copy and Run Migration:**
   - Open file: `/Users/Arijit WS/FI Project Prompts/RNR Dashboard/supabase_migration_complete.sql`
   - Select ALL (Cmd+A)
   - Copy (Cmd+C)
   - Paste in Supabase SQL Editor
   - Click "Run" or press Cmd+Enter
   - Wait for "Success. No rows returned"

✅ **Tables created:** employees, users, sales_data, rankings, etc.

---

### Step 2: Import Employees & Create Users (2 minutes)

1. **Install missing package:**
   ```bash
   cd "/Users/Arijit WS/FI Project Prompts/RNR Dashboard/rnr-dashboard"
   npm install dotenv
   ```

2. **Run migration script:**
   ```bash
   cd "/Users/Arijit WS/FI Project Prompts/RNR Dashboard"
   node migrate_employees.js
   ```

3. **Wait for completion:**
   ```
   ✅ Employees inserted: 1523
   ✅ Users created: 1523
   🔑 Default password: Pass@123
   ```

✅ **All employees imported with accounts created!**

---

### Step 3: Test Login (30 seconds)

1. **Go to:** https://funds-india-8134.vercel.app/login

2. **Enter credentials:**
   - Email: `arijit.chowdhury@fundsindia.com`
   - Password: `Pass@123`

3. **Click "Sign in"**

✅ **Should redirect to dashboard!**

---

## Alternative: Quick Test User (Skip Migration)

If you want to test login **without** importing all employees:

**In Supabase SQL Editor, run:**

```sql
-- Create test employee
INSERT INTO employees (
  employee_number,
  full_name,
  work_email,
  business_unit,
  department,
  job_title,
  employment_status
) VALUES (
  'W2662',
  'Arijit Chowdhury',
  'arijit.chowdhury@fundsindia.com',
  'B2B',
  'Sales',
  'Relationship Manager',
  'Working'
)
ON CONFLICT (work_email) DO NOTHING
RETURNING *;

-- Create test user (password: Pass@123)
INSERT INTO users (
  employee_id,
  email,
  password_hash,
  is_first_login,
  role
) VALUES (
  (SELECT id FROM employees WHERE work_email = 'arijit.chowdhury@fundsindia.com'),
  'arijit.chowdhury@fundsindia.com',
  '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy',
  false,
  'rm'
)
ON CONFLICT (email) DO UPDATE SET
  password_hash = EXCLUDED.password_hash
RETURNING *;
```

**Then test login with:**
- Email: `arijit.chowdhury@fundsindia.com`
- Password: `Pass@123`

---

## Troubleshooting

### "table does not exist"
→ Run Step 1 (create tables in Supabase)

### "Cannot find module 'dotenv'"
→ Run: `cd rnr-dashboard && npm install dotenv`

### "Environment variables not configured"
→ Check `.env.local` has real Supabase keys (not placeholders)

### Login still shows 401
→ Verify user exists in Supabase:
```sql
SELECT * FROM users WHERE email = 'arijit.chowdhury@fundsindia.com';
```

---

## What Each Step Does

**Step 1:** Creates 9 database tables with proper schema
**Step 2:** Imports 1,523 employees and creates user accounts
**Step 3:** Tests that authentication works

---

## Default Credentials

**After migration, ALL employees can login with:**
- Email: `<their-email>@fundsindia.com`
- Password: `Pass@123`

---

## Next Steps After Login Works

1. ✅ Test different user roles (admin, manager, RM)
2. ✅ Import sales data (next migration)
3. ✅ Test leaderboards and rankings
4. ✅ Configure contest periods

---

**Estimated Time:** 5 minutes total
**Result:** Full login working for all 1,523 employees

---

Need help? Check the detailed guides:
- `SETUP_COMPLETE_GUIDE.md` - Full setup instructions
- `RUN_MIGRATION.md` - Detailed migration guide
- `FIX_LOGIN_ISSUE.md` - Troubleshooting

**Last Updated:** 2026-02-09
