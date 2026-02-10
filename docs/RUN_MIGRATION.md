# 🚀 Employee Master Migration Guide

## Overview
This guide will help you migrate all employees from the Excel file to Supabase and create user accounts with a default password.

---

## Prerequisites

✅ **Before running migration:**
1. Supabase database schema must be created (run `supabase_migration_complete.sql`)
2. Environment variables must be configured in `.env.local`
3. Excel file: `Employee Master as on 09.02.2026.xlsx` must exist

---

## Step 1: Verify Database Schema

First, ensure the database tables exist:

**Go to Supabase Dashboard → SQL Editor and run:**

```sql
-- Check if tables exist
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('employees', 'users');
```

**Expected output:**
- `employees`
- `users`

If tables don't exist, run `supabase_migration_complete.sql` first!

---

## Step 2: Install Dependencies (if not already installed)

```bash
cd "/Users/Arijit WS/FI Project Prompts/RNR Dashboard/rnr-dashboard"
npm install xlsx bcryptjs @supabase/supabase-js dotenv
```

---

## Step 3: Run Migration Script

```bash
cd "/Users/Arijit WS/FI Project Prompts/RNR Dashboard"
node migrate_employees.js
```

---

## What the Script Does

1. ✅ **Reads** `Employee Master as on 09.02.2026.xlsx`
2. ✅ **Extracts** all employee records
3. ✅ **Inserts/Updates** employee data in `employees` table
4. ✅ **Creates** user accounts in `users` table
5. ✅ **Sets** default password: `Pass@123` for all users
6. ✅ **Assigns** roles based on job titles:
   - `admin` → Employee #W2661
   - `group_ceo` → Akshay Sapru
   - `ceo` → Anyone with "CEO" in job title (B2B, B2C, PW)
   - `manager` → Anyone with "Manager" or "Head" in job title
   - `rm` → Default for all others

---

## Expected Output

```
═══════════════════════════════════════════
🚀 FundsIndia RNR Dashboard - Employee Migration
═══════════════════════════════════════════

📖 Reading Employee Master Excel file...

✅ Found 1523 employees in Excel file

🔐 Hashing default password...
✅ Password hash generated

🚀 Starting migration...

✅ Processed 50/1523 employees...
✅ Processed 100/1523 employees...
✅ Processed 150/1523 employees...
...

═══════════════════════════════════════════
📊 Migration Summary
═══════════════════════════════════════════
Total rows in Excel: 1523
✅ Employees inserted/updated: 1523
✅ Users created: 1523
❌ Errors: 0
═══════════════════════════════════════════

🎉 Migration complete!

🔑 Default password for all users: Pass@123
   Users can login with: <email>@fundsindia.com / Pass@123
```

---

## Step 4: Verify Migration

**In Supabase SQL Editor, run:**

```sql
-- Check total counts
SELECT
  (SELECT COUNT(*) FROM employees) as total_employees,
  (SELECT COUNT(*) FROM users) as total_users;

-- Check sample users by role
SELECT
  u.role,
  COUNT(*) as count
FROM users u
GROUP BY u.role
ORDER BY count DESC;

-- View sample users
SELECT
  u.email,
  u.role,
  e.full_name,
  e.employee_number,
  e.business_unit,
  e.job_title
FROM users u
JOIN employees e ON u.employee_id = e.id
LIMIT 10;
```

---

## Step 5: Test Login

**Test with any employee email:**

1. Go to: https://funds-india-8134.vercel.app/login
2. Enter any employee email (e.g., `john.doe@fundsindia.com`)
3. Password: `Pass@123`
4. Click "Sign in"
5. ✅ Should successfully login and redirect to dashboard

---

## Default Login Credentials

**🔑 ALL employees can now login with:**
- **Email:** `<their-email>@fundsindia.com`
- **Password:** `Pass@123`

**Example users to test:**

```
Admin User:
Email: <admin-email>@fundsindia.com (employee #W2661)
Password: Pass@123

Regular RM:
Email: <any-rm-email>@fundsindia.com
Password: Pass@123
```

---

## Simplified Authentication Logic

✅ **Current setup:**
- Every employee in the Excel automatically gets a user account
- Default password: `Pass@123` for all users
- No email verification needed
- No first-time password change required (`is_first_login` = false)
- Users can login immediately after migration

---

## Troubleshooting

### Issue: "Employee Number not found in Excel"
**Solution:** The script tries multiple column name variations:
- `Employee Number`, `Emp No`, `EmpNo`
- Check your Excel column names and update the script mapping if needed

### Issue: "Email not found"
**Solution:** Script looks for:
- `Email`, `Work Email`, `Official Email`
- If email doesn't have `@fundsindia.com`, it's automatically added

### Issue: "Cannot connect to Supabase"
**Solution:**
1. Check `.env.local` has correct credentials
2. Verify `NEXT_PUBLIC_SUPABASE_URL` is correct
3. Verify `SUPABASE_SERVICE_ROLE_KEY` is set (not placeholder)

### Issue: "Table does not exist"
**Solution:**
- Run `supabase_migration_complete.sql` in Supabase SQL Editor first
- This creates all required tables

---

## Column Mapping Reference

The script maps Excel columns to database fields:

| Excel Column | Database Field |
|--------------|----------------|
| Employee Number / Emp No | employee_number |
| Full Name / Name | full_name |
| Email / Work Email | work_email |
| Gender | gender |
| Mobile / Phone | mobile_phone |
| Location / City | location |
| Business Unit / BU | business_unit |
| Department / Dept | department |
| Sub Department | sub_department |
| Job Title / Designation | job_title |
| Reporting Manager | reporting_manager_emp_number |
| Date of Joining / DOJ | date_joined |
| Status | employment_status |

**Note:** If your Excel has different column names, update the script's field mapping.

---

## Re-running Migration

The script uses **UPSERT** (INSERT or UPDATE), so you can safely re-run it:
- Existing employees will be updated
- New employees will be inserted
- No duplicates will be created

---

## Next Steps After Migration

1. ✅ **Test login** with multiple employee accounts
2. ✅ **Verify roles** are assigned correctly
3. ✅ **Check dashboard** displays user info
4. ✅ **Upload sales data** (next migration task)

---

## Security Note

🔒 **For Production:**
- Change default password policy
- Consider enabling first-time password change
- Implement password complexity requirements
- Add multi-factor authentication (future)

For now, the simplified `Pass@123` approach works perfectly for initial setup and testing.

---

**Last Updated:** 2026-02-09
**Version:** 1.0
**Status:** ✅ Ready to run
