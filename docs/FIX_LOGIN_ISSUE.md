# 🔧 Fix Login 401 Error - Action Plan

**Issue:** Login returns 401 Unauthorized error at https://funds-india-8134.vercel.app/login

**Root Cause:** Database tables and test user don't exist in Supabase yet.

---

## ✅ Step 1: Run Database Migration in Supabase

1. **Open Supabase Dashboard:**
   - Go to: https://supabase.com/dashboard
   - Select project: `pgomungsynwbqwcwskly`

2. **Navigate to SQL Editor:**
   - Click on **SQL Editor** in left sidebar
   - Click **New Query**

3. **Run the Migration:**
   - Copy contents of: `supabase_migration_complete.sql`
   - Paste into SQL Editor
   - Click **Run** (or press Ctrl/Cmd + Enter)
   - Wait for success message

   **Expected Output:**
   ```
   Success. No rows returned
   ```

---

## ✅ Step 2: Create Test User

1. **Still in SQL Editor, create a new query**

2. **Run this SQL:**

```sql
-- Create test employee
INSERT INTO employees (
  employee_number,
  full_name,
  work_email,
  gender,
  location,
  business_unit,
  department,
  job_title,
  date_joined,
  employment_status
) VALUES (
  'W2662',
  'Arijit Chowdhury',
  'arijit.chowdhury@fundsindia.com',
  'Male',
  'Bangalore',
  'B2B',
  'Sales',
  'Relationship Manager',
  '2024-01-15',
  'Working'
)
ON CONFLICT (work_email) DO NOTHING
RETURNING *;

-- Create test user account
-- Password: Test@123
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
RETURNING email, role, is_first_login;
```

3. **Verify user was created:**

```sql
SELECT
  u.email,
  u.role,
  u.is_first_login,
  e.full_name,
  e.employee_number
FROM users u
JOIN employees e ON u.employee_id = e.id
WHERE u.email = 'arijit.chowdhury@fundsindia.com';
```

**Expected Output:**
| email | role | is_first_login | full_name | employee_number |
|-------|------|----------------|-----------|-----------------|
| arijit.chowdhury@fundsindia.com | rm | false | Arijit Chowdhury | W2662 |

---

## ✅ Step 3: Test Login

1. **Go to:** https://funds-india-8134.vercel.app/login

2. **Enter credentials:**
   - Email: `arijit.chowdhury@fundsindia.com`
   - Password: `Test@123`

3. **Click Sign in**

4. **Expected result:**
   - ✅ Successfully redirected to `/dashboard`
   - ✅ No 401 error

---

## 🔍 If Login Still Fails

### Check Vercel Logs:

1. Go to: https://vercel.com/dashboard
2. Click on your project: `funds-india-8134`
3. Go to **Deployments** → Click latest deployment
4. Click **Functions** → Find the error logs

### Check Supabase Connection:

1. In Supabase Dashboard, go to **Settings** → **API**
2. Verify these match your Vercel environment variables:
   - Project URL: `https://pgomungsynwbqwcwskly.supabase.co`
   - `anon public` key → matches `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` key → matches `SUPABASE_SERVICE_ROLE_KEY`

### Force Redeploy:

If environment variables were recently changed:

1. Go to Vercel Dashboard → Your Project
2. Go to **Deployments**
3. Click **•••** on latest deployment → **Redeploy**
4. Check **Use existing Build Cache** is UNCHECKED
5. Click **Redeploy**

---

## 📝 Test Credentials

**User 1 (RM):**
- Email: `arijit.chowdhury@fundsindia.com`
- Password: `Test@123`
- Role: Relationship Manager

**Admin User (if needed):**
Create by running in SQL Editor:
```sql
INSERT INTO employees (employee_number, full_name, work_email, business_unit, job_title)
VALUES ('W2661', 'Admin User', 'admin@fundsindia.com', 'Corporate', 'Admin')
ON CONFLICT (work_email) DO NOTHING;

INSERT INTO users (employee_id, email, password_hash, is_first_login, role)
VALUES (
  (SELECT id FROM employees WHERE work_email = 'admin@fundsindia.com'),
  'admin@fundsindia.com',
  '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy',
  false,
  'admin'
)
ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash;
```

---

## ✅ Success Criteria

When everything works, you should see:

1. ✅ No 401 errors in browser console
2. ✅ Login redirects to `/dashboard`
3. ✅ User info displayed on dashboard
4. ✅ No Supabase connection errors

---

## 🆘 Need Help?

If you're still stuck, check:
1. Supabase Dashboard → **Table Editor** → Verify `users` and `employees` tables exist
2. Browser DevTools → Network tab → Check the actual error response
3. Vercel Dashboard → Function logs for detailed error messages

---

**Last Updated:** 2026-02-09
**Version:** 1.0
