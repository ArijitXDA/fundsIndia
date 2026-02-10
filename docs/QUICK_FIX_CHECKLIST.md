# 🚨 QUICK FIX - Authentication 401 Error

## Current Status
❌ Login returns 401 Unauthorized error
❌ Environment variables not configured
❌ Test user not created in database

---

## 3 Steps to Fix (15 minutes)

### ✅ STEP 1: Get Supabase API Keys (5 minutes)

1. **Open Supabase Dashboard**
   - Go to: https://supabase.com/dashboard
   - Sign in if needed

2. **Select Your Project**
   - Find the project with URL: `https://pgomungsynwbqwcwskly.supabase.co`
   - Click on it to open

3. **Navigate to API Settings**
   - Click the **⚙️ Settings** icon (bottom left)
   - Click **API** from the settings menu

4. **Copy Three Values**

   You'll see a page with these sections:

   **a) Project URL**
   ```
   https://pgomungsynwbqwcwskly.supabase.co
   ```
   ✅ This is already correct in your .env.local file

   **b) Project API keys**

   Find the box labeled "anon public" (it's a long string starting with `eyJ...`)
   - Click the 👁️ icon or copy button
   - **Copy this entire key** → You'll paste it in Step 2

   Find the box labeled "service_role" (another long string starting with `eyJ...`)
   - Click "Reveal" or the 👁️ icon
   - **⚠️ WARNING: Keep this secret! Don't share it!**
   - **Copy this entire key** → You'll paste it in Step 2

---

### ✅ STEP 2: Update .env.local File (2 minutes)

1. **Open the file:**
   - Location: `/Users/Arijit WS/FI Project Prompts/RNR Dashboard/rnr-dashboard/.env.local`

2. **Replace the placeholder values:**

   **BEFORE:**
   ```env
   NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_ANON_KEY_HERE
   SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY_HERE
   ```

   **AFTER:** (paste your actual keys)
   ```env
   NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...your_actual_anon_key...
   SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...your_actual_service_role_key...
   ```

3. **Save the file** (Cmd+S)

---

### ✅ STEP 3: Create Test User in Supabase (3 minutes)

1. **Go back to Supabase Dashboard**
   - Click **SQL Editor** in the left sidebar
   - Click **+ New query**

2. **Copy the SQL script**
   - Open: `/Users/Arijit WS/FI Project Prompts/RNR Dashboard/create_test_user.sql`
   - Select all (Cmd+A) and copy (Cmd+C)

3. **Paste and Run**
   - Paste the script into the SQL Editor
   - Click **Run** (or press Cmd+Enter)
   - You should see: **"Success. No rows returned"** ✅

4. **Verify it worked**
   - Clear the SQL editor
   - Paste this verification query:
   ```sql
   SELECT
     u.email,
     u.role,
     e.full_name,
     e.employee_number,
     e.business_unit
   FROM users u
   JOIN employees e ON u.employee_id = e.id
   WHERE u.email = 'arijit.chowdhury@fundsindia.com';
   ```
   - Click **Run**
   - You should see **1 row** with Arijit's details ✅

---

### ✅ STEP 4: Add Environment Variables to Vercel (5 minutes)

1. **Open Vercel Dashboard**
   - Go to: https://vercel.com/dashboard
   - Sign in if needed

2. **Select Your Project**
   - Find and click on: **funds-india-8134**

3. **Navigate to Environment Variables**
   - Click **Settings** (top menu)
   - Click **Environment Variables** (left sidebar)

4. **Add Variable #1**
   - Click **Add New**
   - Name: `NEXT_PUBLIC_SUPABASE_URL`
   - Value: `https://pgomungsynwbqwcwskly.supabase.co`
   - Environment: Select **All** (Production, Preview, Development)
   - Click **Save**

5. **Add Variable #2**
   - Click **Add New**
   - Name: `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - Value: (paste the anon key you copied from Step 1)
   - Environment: Select **All**
   - Click **Save**

6. **Add Variable #3**
   - Click **Add New**
   - Name: `SUPABASE_SERVICE_ROLE_KEY`
   - Value: (paste the service_role key you copied from Step 1)
   - Environment: Select **All**
   - Click **Save**

7. **Redeploy the Application**
   - Click **Deployments** (top menu)
   - Find the latest deployment (at the top)
   - Click the **⋯** (three dots) menu on the right
   - Click **Redeploy**
   - Confirm by clicking **Redeploy** again
   - Wait 1-2 minutes for deployment to complete

---

### ✅ STEP 5: Test Login (2 minutes)

1. **Wait for Vercel deployment**
   - You'll see "Building..." then "Ready" (takes ~2 minutes)

2. **Open the login page**
   - Go to: https://funds-india-8134.vercel.app/login

3. **Try logging in**
   - Email: `arijit.chowdhury@fundsindia.com`
   - Password: `Test@123`
   - Click **Sign in**

4. **Success! 🎉**
   - You should be redirected to: `/dashboard`
   - You'll see your profile: Arijit Chowdhury
   - Business Unit: B2B
   - Role: RM

---

## Troubleshooting

### ❌ Still getting 401 error?

**Check #1: Did the SQL script run successfully?**
```sql
-- Run this in Supabase SQL Editor
SELECT COUNT(*) FROM users WHERE email = 'arijit.chowdhury@fundsindia.com';
```
Should return: 1
If returns 0: Re-run the create_test_user.sql script

**Check #2: Are environment variables set in Vercel?**
- Vercel Dashboard → Project → Settings → Environment Variables
- Should see all 3 variables listed
- If missing: Add them again

**Check #3: Did Vercel redeploy complete?**
- Vercel Dashboard → Deployments → Latest should show "Ready"
- If still "Building": Wait a bit longer
- If "Error": Check the error logs

**Check #4: Are the keys correct?**
- Keys should start with `eyJ`
- Keys should be very long (hundreds of characters)
- No extra spaces or line breaks

### ❌ Can't find Supabase API keys?

**Visual Guide:**
1. Supabase Dashboard → Project (pgomungsynwbqwcwskly)
2. Look for ⚙️ Settings icon (bottom left sidebar)
3. Click "API" in the Settings submenu
4. Scroll down to "Project API keys"
5. You'll see two boxes:
   - "anon public" - copy this for NEXT_PUBLIC_SUPABASE_ANON_KEY
   - "service_role" - click reveal, copy for SUPABASE_SERVICE_ROLE_KEY

---

## Why This Works

**Before Fix:**
- ❌ Vercel app has no Supabase credentials
- ❌ API routes can't connect to database
- ❌ Login query returns null
- ❌ API returns 401 Unauthorized

**After Fix:**
- ✅ Vercel app can connect to Supabase
- ✅ API routes successfully query database
- ✅ Test user exists and password matches
- ✅ Login succeeds, redirects to dashboard

---

## Summary

**Time Required:** ~15 minutes
**Difficulty:** Easy (copy-paste configuration)
**No Code Changes Needed:** Only configuration updates

After completing these 5 steps, your authentication will work perfectly!

---

## Need Help?

If you get stuck at any step, let me know:
- Which step you're on
- What error message you're seeing
- Screenshot of the issue (if visual)

I can guide you through each step in detail!
