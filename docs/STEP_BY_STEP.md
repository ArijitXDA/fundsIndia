# ✅ Step-by-Step: You've Added Employees, Now Create Users

## Current Status

✅ **Employees table populated** with real data from Excel
❌ **Users table empty** - No user accounts yet

**Result:** Login fails because there are no user accounts to authenticate against.

---

## What You Need to Do

Since you've already uploaded employees to the database, you just need to create user accounts for them.

---

## Step 1: Verify Employees Are There

Run this to see what's in the database:

```bash
cd "/Users/Arijit WS/FI Project Prompts/RNR Dashboard"
node verify_database.js
```

**Expected Output:**
```
✅ Employees Table
   Total employees: 1523

⚠️  No users found!
   Need to create user accounts for employees.
```

---

## Step 2: Create User Accounts

Run this to create user accounts for all employees:

```bash
cd "/Users/Arijit WS/FI Project Prompts/RNR Dashboard"
node create_users_for_employees.js
```

**What this does:**
1. ✅ Reads all employees from `employees` table
2. ✅ Creates user account for each employee in `users` table
3. ✅ Sets password to `Pass@123` for everyone
4. ✅ Assigns roles based on job titles:
   - **admin** → Employee #W2661
   - **group_ceo** → Akshay Sapru
   - **ceo** → CEOs of B2B, B2C, PW
   - **manager** → Anyone with "Manager" or "Head" in job title
   - **rm** → Everyone else

**Expected Output:**
```
✅ Found 1523 employees
🔐 Hashing default password...
✅ Password hash generated

🚀 Creating user accounts...
✅ Processed 100/1523 employees...
✅ Processed 200/1523 employees...
...
✅ Processed 1523/1523 employees...

📊 Summary
Total employees: 1523
✅ Users created: 1523
⏭️  Users already existed: 0
❌ Errors: 0

🎉 User creation complete!
🔑 Default password for all users: Pass@123
```

---

## Step 3: Test Login

1. Go to: https://funds-india-8134.vercel.app/login

2. Try any employee email:
   - Email: `<any-employee-email>@fundsindia.com`
   - Password: `Pass@123`

3. Click "Sign in"

✅ **Should work now!**

---

## Quick Test Users

After running the script, try logging in with:

**Your account (if in the employee list):**
```
Email: arijit.chowdhury@fundsindia.com
Password: Pass@123
```

**Admin (if W2661 exists):**
```
Email: <email-of-W2661>@fundsindia.com
Password: Pass@123
```

**Any other employee:**
```
Email: <their-email>@fundsindia.com
Password: Pass@123
```

---

## Troubleshooting

### "Cannot find module 'dotenv'"
```bash
cd rnr-dashboard
npm install dotenv
```

### "Environment variables not configured"
Check that `.env.local` has real Supabase credentials:
```
NEXT_PUBLIC_SUPABASE_URL=https://pgomungsynwbqwcwskly.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-real-key>
SUPABASE_SERVICE_ROLE_KEY=<your-real-key>
```

### Login still shows 401
1. Verify users were created: `node verify_database.js`
2. Check Supabase dashboard → Table Editor → `users` table
3. Should see 1,523 users

### Want to reset passwords
Just re-run: `node create_users_for_employees.js`
(It will update existing users with new password hash)

---

## Summary

**You did:** Added employees to database ✅
**Now do:** Create user accounts (1 command) ✅
**Then:** Login works for everyone! 🎉

---

**Time Required:** 2 minutes
**Commands to Run:**
```bash
# Optional: Check what's there
node verify_database.js

# Required: Create users
node create_users_for_employees.js
```

---

**Last Updated:** 2026-02-09
**Status:** Ready to run
