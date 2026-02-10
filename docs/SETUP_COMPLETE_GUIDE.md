# 🎯 Complete Setup Guide - RNR Dashboard

## Quick Start (3 Steps)

### ✅ Step 1: Create Database Tables (ONE TIME)
```bash
# In Supabase Dashboard → SQL Editor → New Query
# Copy and run: supabase_migration_complete.sql
```

### ✅ Step 2: Import Employee Data
```bash
cd "/Users/Arijit WS/FI Project Prompts/RNR Dashboard"
node migrate_employees.js
```

### ✅ Step 3: Test Login
```
URL: https://funds-india-8134.vercel.app/login
Email: <any-employee-email>@fundsindia.com
Password: Pass@123
```

---

## 🔐 Simplified Authentication

**Every employee is automatically a user!**

- ✅ No sign-up needed
- ✅ No email verification
- ✅ No first-time password change
- ✅ Default password: `Pass@123` for everyone
- ✅ Login immediately after migration

---

## 📊 What Gets Created

### Employees Table
- All employee records from Excel
- Full name, email, employee number
- Business unit, department, job title
- Reporting hierarchy
- Location, contact info

### Users Table
- One user account per employee
- Email: `<employee>@fundsindia.com`
- Password: `Pass@123` (bcrypt hashed)
- Role assigned based on job title:
  - **admin** → Employee #W2661
  - **group_ceo** → Akshay Sapru
  - **ceo** → CEOs of B2B, B2C, PW
  - **manager** → Managers/Heads
  - **rm** → Everyone else

---

## 🚀 Running the Migration

### Option 1: Check Excel First (Recommended)
```bash
# See what columns are in the Excel file
node check_excel_columns.js
```

### Option 2: Run Full Migration
```bash
# Import all employees and create users
node migrate_employees.js
```

**Expected output:**
```
✅ Employees inserted/updated: 1523
✅ Users created: 1523
🔑 Default password for all users: Pass@123
```

---

## 🔍 Verify Migration Success

**In Supabase SQL Editor:**

```sql
-- Check counts
SELECT
  (SELECT COUNT(*) FROM employees) as employees,
  (SELECT COUNT(*) FROM users) as users;

-- Check role distribution
SELECT role, COUNT(*) as count
FROM users
GROUP BY role;

-- View sample users
SELECT
  u.email,
  u.role,
  e.full_name,
  e.employee_number,
  e.business_unit
FROM users u
JOIN employees e ON u.employee_id = e.id
LIMIT 20;
```

---

## 🧪 Test Login Scenarios

### Admin Login
```
Email: <admin-email>@fundsindia.com (Employee #W2661)
Password: Pass@123
Expected: Access to admin panel
```

### CEO Login
```
Email: <ceo-email>@fundsindia.com
Password: Pass@123
Expected: Full vertical visibility
```

### Manager Login
```
Email: <manager-email>@fundsindia.com
Password: Pass@123
Expected: Team hierarchy view
```

### RM Login
```
Email: <rm-email>@fundsindia.com
Password: Pass@123
Expected: Personal dashboard view
```

---

## 📁 Files Created

| File | Purpose |
|------|---------|
| `migrate_employees.js` | Main migration script |
| `check_excel_columns.js` | Preview Excel structure |
| `RUN_MIGRATION.md` | Detailed migration guide |
| `SETUP_COMPLETE_GUIDE.md` | This file - quick reference |

---

## ⚙️ How Authentication Works Now

### Login Flow:
1. User enters email + password
2. System checks `users` table
3. Verifies password hash (bcrypt)
4. Creates session cookie
5. Redirects to dashboard

### No Special Setup Needed:
- ❌ No email verification
- ❌ No password reset on first login
- ❌ No account activation
- ✅ Just login with `Pass@123`

---

## 🔄 Re-running Migration

**Safe to run multiple times!**

The script uses UPSERT:
- Existing employees → **Updated**
- New employees → **Inserted**
- Passwords → **Reset to Pass@123**

---

## 🐛 Troubleshooting

### Migration fails with "table does not exist"
**Fix:** Run `supabase_migration_complete.sql` first

### "Environment variables not configured"
**Fix:** Check `.env.local` has real Supabase credentials (not placeholders)

### "Cannot find module 'xlsx'"
**Fix:** Run `npm install` in rnr-dashboard folder

### Login returns 401
**Fix:** Ensure migration completed successfully

### Excel column names don't match
**Fix:** Run `check_excel_columns.js` and update field mapping in migrate script

---

## 📈 Current Project Status

| Component | Status | Details |
|-----------|--------|---------|
| Database Schema | ✅ Ready | Run supabase_migration_complete.sql |
| Employee Migration | ✅ Ready | Run migrate_employees.js |
| User Accounts | ✅ Automated | Created during migration |
| Authentication | ✅ Simplified | Pass@123 for all |
| Vercel Deployment | ✅ Live | https://funds-india-8134.vercel.app |
| Environment Variables | ✅ Configured | Set in Vercel |

---

## 🎯 Next Steps After Setup

1. ✅ **Test login** with multiple roles
2. ✅ **Verify dashboard** displays correctly
3. ✅ **Import sales data** (next migration)
4. ✅ **Test leaderboards** with real data
5. ✅ **Configure contest** periods

---

## 💡 Quick Commands Reference

```bash
# Navigate to project
cd "/Users/Arijit WS/FI Project Prompts/RNR Dashboard"

# Check Excel structure
node check_excel_columns.js

# Run migration
node migrate_employees.js

# Check Vercel deployment
# Visit: https://funds-india-8134.vercel.app/login
```

---

## 🔒 Security Notes

**Current Setup (Development/Testing):**
- Default password: `Pass@123`
- No complexity requirements
- No expiration
- Simple and fast for testing

**For Production (Future):**
- Implement password change on first login
- Add complexity requirements
- Enable multi-factor authentication
- Set password expiration policies

---

**Last Updated:** 2026-02-09
**Status:** ✅ Ready to migrate
**Default Password:** Pass@123
