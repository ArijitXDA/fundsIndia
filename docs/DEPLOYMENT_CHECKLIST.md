# ✅ RNR Dashboard Deployment Checklist

## Current Status

### 🟢 Completed
- [x] Code deployed to Vercel: https://funds-india-8134.vercel.app
- [x] GitHub repository connected: https://github.com/ArijitXDA/fundsIndia.git
- [x] Vercel environment variables configured
- [x] Login page rendering correctly
- [x] Build passing
- [x] Favicon configured

### 🔴 Pending
- [ ] Supabase database schema created
- [ ] Test users created in database
- [ ] Login authentication working
- [ ] Dashboard page accessible

---

## 📋 Setup Steps

### 1. Database Setup (⚠️ CRITICAL - DO THIS FIRST)

**Status:** ❌ Not Done

**Action Required:**
1. Go to https://supabase.com/dashboard
2. Select project: `pgomungsynwbqwcwskly`
3. Click **SQL Editor** → **New Query**
4. Copy and run: `supabase_migration_complete.sql`
5. Copy and run: `create_test_user.sql`

**Verification:**
```sql
-- Run this in Supabase SQL Editor to verify
SELECT
  COUNT(*) as user_count,
  (SELECT COUNT(*) FROM employees) as employee_count
FROM users;
```

Expected: At least 1 user and 1 employee

---

### 2. Environment Variables

**Status:** ✅ Done

All required variables are set in Vercel:
- ✅ `NEXT_PUBLIC_SUPABASE_URL`
- ✅ `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- ✅ `SUPABASE_SERVICE_ROLE_KEY`
- ✅ `NEXTAUTH_SECRET`
- ✅ `NEXTAUTH_URL`
- ✅ `NEXT_PUBLIC_APP_URL`

**Note:** If you just added these, you need to redeploy!

---

### 3. Test Login

**Status:** 🔴 Failing (401 Unauthorized)

**Test Credentials:**
```
Email: arijit.chowdhury@fundsindia.com
Password: Test@123
```

**How to Test:**
1. Go to: https://funds-india-8134.vercel.app/login
2. Enter credentials above
3. Click "Sign in"
4. Should redirect to `/dashboard`

**Current Error:**
```
POST https://funds-india-8134.vercel.app/api/auth/login 401 (Unauthorized)
```

**Root Cause:** Database not set up yet (tables don't exist)

---

### 4. Dashboard Verification

**Status:** ⏳ Pending (can't access until login works)

**To Verify:**
- [ ] Dashboard loads without errors
- [ ] User info displays correctly
- [ ] Navigation works
- [ ] No console errors

---

## 🚀 Deployment URLs

| Environment | URL | Status |
|-------------|-----|--------|
| Production | https://funds-india-8134.vercel.app | 🟢 Live |
| GitHub | https://github.com/ArijitXDA/fundsIndia.git | 🟢 Connected |
| Supabase | https://pgomungsynwbqwcwskly.supabase.co | 🟡 Not configured |

---

## 🔍 Debugging Commands

### Check Supabase Tables
```sql
-- List all tables
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public';

-- Count records
SELECT
  'employees' as table_name, COUNT(*) as count FROM employees
UNION ALL
SELECT 'users', COUNT(*) FROM users
UNION ALL
SELECT 'sales_data', COUNT(*) FROM sales_data;
```

### Check API Health
```bash
# Test API endpoint
curl https://funds-india-8134.vercel.app/api/auth/login \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"email":"arijit.chowdhury@fundsindia.com","password":"Test@123"}'
```

### Check Environment Variables (in Vercel)
1. Go to: https://vercel.com/dashboard
2. Select project → Settings → Environment Variables
3. Verify all 6 variables are set for "Production" environment

---

## ⚠️ Common Issues

### Issue: 401 Unauthorized on Login
**Cause:** Database not set up
**Fix:** Run `supabase_migration_complete.sql` in Supabase SQL Editor

### Issue: "relation does not exist"
**Cause:** Tables not created
**Fix:** Run migration SQL

### Issue: "Invalid email or password"
**Cause:** Test user doesn't exist
**Fix:** Run `create_test_user.sql`

### Issue: Environment variable undefined
**Cause:** Recent changes to env vars
**Fix:** Redeploy on Vercel

---

## 📊 Project Health

| Component | Status | Details |
|-----------|--------|---------|
| Frontend Build | ✅ Passing | Next.js 14 build successful |
| Deployment | ✅ Live | Vercel deployment active |
| Database | ❌ Not Setup | Tables need to be created |
| Authentication | ❌ Not Working | 401 error |
| Environment Variables | ✅ Configured | All 6 variables set |

---

## 🎯 Next Steps

**Priority 1 (CRITICAL):**
1. ⚠️ Run `supabase_migration_complete.sql` in Supabase
2. ⚠️ Run `create_test_user.sql` in Supabase
3. ⚠️ Test login with: `arijit.chowdhury@fundsindia.com` / `Test@123`

**Priority 2:**
4. Verify dashboard loads correctly
5. Test all navigation links
6. Upload sample data files

**Priority 3:**
7. Create additional test users for different roles
8. Test leaderboard functionality
9. Test admin panel

---

## 📝 Notes

- Favicon warning is cosmetic, can be ignored for now
- All critical functionality depends on database being set up first
- Once database is ready, everything else should work

---

**Last Updated:** 2026-02-09
**Status:** 🟡 Partially Complete - Database setup required
