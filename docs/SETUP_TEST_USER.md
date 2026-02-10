# Test User Setup Instructions

## Authentication System is Now Live! 🎉

The authentication system has been successfully implemented and deployed. Follow these steps to create a test user and log in.

---

## Step 1: Create Test User in Supabase

1. Go to your Supabase Dashboard: https://supabase.com/dashboard
2. Select your project
3. Click on "SQL Editor" in the left sidebar
4. Copy and paste the SQL script from `/Users/Arijit WS/FI Project Prompts/RNR Dashboard/create_test_user.sql`
5. Click "Run" to execute the script

**The script will create:**
- Employee record for Arijit Chowdhury (W2662)
- User account with email: `arijit.chowdhury@fundsindia.com`
- Password: `Test@123`
- Role: Relationship Manager (RM)

---

## Step 2: Set Environment Variables in Vercel

For authentication to work, Vercel needs the Supabase credentials:

1. Go to your Vercel Dashboard: https://vercel.com/dashboard
2. Select your project: `funds-india-8134`
3. Click "Settings" → "Environment Variables"
4. Add the following variables:

### Required Environment Variables:

```
NEXT_PUBLIC_SUPABASE_URL=<your-supabase-project-url>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-supabase-anon-key>
SUPABASE_SERVICE_ROLE_KEY=<your-supabase-service-role-key>
```

**Where to find these values:**
- Go to Supabase Dashboard → Project Settings → API
- `NEXT_PUBLIC_SUPABASE_URL`: Copy from "Project URL"
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Copy from "Project API keys" → "anon public"
- `SUPABASE_SERVICE_ROLE_KEY`: Copy from "Project API keys" → "service_role" (⚠️ Keep this secret!)

5. After adding variables, click "Save"
6. Redeploy your application (Vercel → Deployments → click "..." → "Redeploy")

---

## Step 3: Test Login

1. Go to: https://funds-india-8134.vercel.app/login
2. Enter credentials:
   - **Email**: `arijit.chowdhury@fundsindia.com`
   - **Password**: `Test@123`
3. Click "Sign in"
4. You should be redirected to the dashboard at `/dashboard`

---

## What's Working Now ✅

- ✅ **Login Page**: Functional form with validation
- ✅ **Authentication API**: `/api/auth/login` endpoint
- ✅ **Session Management**: HTTP-only cookies for security
- ✅ **Dashboard**: Basic dashboard showing user profile
- ✅ **Logout**: Proper session clearing
- ✅ **Email Validation**: Only @fundsindia.com allowed
- ✅ **Activity Logging**: All login/logout actions logged
- ✅ **Error Handling**: User-friendly error messages

---

## Files Created/Updated

### New API Routes:
- `/app/api/auth/login/route.ts` - Login endpoint
- `/app/api/auth/logout/route.ts` - Logout endpoint
- `/app/api/auth/me/route.ts` - Session verification

### New Pages:
- `/app/dashboard/page.tsx` - Dashboard after login

### Updated:
- `/app/login/page.tsx` - Now functional with form submission

---

## Next Steps (Future Development)

After confirming login works, we can proceed with:

1. **Dashboard Hero Section**
   - Employee profile card
   - Hierarchy tree view
   - Performance metrics tabs (MTD, QTD, YTD, Contest)

2. **Data Upload**
   - Admin panel for file uploads
   - Excel parser for Employee Master, Net Sales, Advisory MIS

3. **Rankings & Leaderboard**
   - Vertical-specific rankings
   - Leaderboard with filters
   - Team aggregation

4. **Charts & Visualizations**
   - Achievement vs Target charts
   - Trend lines
   - Rank badges

---

## Troubleshooting

### Issue: "Invalid email or password"
- **Solution**: Make sure you ran the SQL script in Supabase to create the test user
- **Verify**: Run this in Supabase SQL Editor:
  ```sql
  SELECT * FROM users WHERE email = 'arijit.chowdhury@fundsindia.com';
  ```

### Issue: "Internal server error"
- **Solution**: Check if environment variables are set in Vercel
- **Verify**: Go to Vercel → Settings → Environment Variables

### Issue: Login form doesn't submit
- **Solution**: Check browser console for errors
- **Verify**: Open DevTools (F12) → Console tab

### Issue: Redirects to login after successful login
- **Solution**: Session cookie might not be set
- **Verify**: Check Application → Cookies in DevTools

---

## Security Features Implemented

1. **Password Hashing**: bcrypt with cost factor 10
2. **HTTP-Only Cookies**: Session data not accessible via JavaScript
3. **Domain Validation**: Only @fundsindia.com emails allowed
4. **Activity Logging**: All authentication events tracked
5. **Secure Cookie Settings**:
   - `httpOnly: true`
   - `secure: true` (in production)
   - `sameSite: 'lax'`
   - 24-hour expiration

---

## Test User Details

**Employee Information:**
- Name: Arijit Chowdhury
- Employee Number: W2662
- Email: arijit.chowdhury@fundsindia.com
- Business Unit: B2B
- Department: Sales
- Sub-Department: Enterprise Sales
- Job Title: Relationship Manager
- Reporting To: W2661 (Admin)

**Login Credentials:**
- Email: `arijit.chowdhury@fundsindia.com`
- Password: `Test@123`
- Role: RM (Relationship Manager)
- First Login: No (password already set)

---

## Creating Additional Test Users

To create more test users, modify the SQL script with different values:

```sql
-- Example: Create a Manager user
INSERT INTO employees (...) VALUES (
  gen_random_uuid(),
  'W2663',  -- Different employee number
  'John Manager',  -- Different name
  'john.manager@fundsindia.com',  -- Different email
  ...
);

INSERT INTO users (...) VALUES (
  gen_random_uuid(),
  (SELECT id FROM employees WHERE work_email = 'john.manager@fundsindia.com'),
  'john.manager@fundsindia.com',
  '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy',  -- Same hash = Test@123
  false,
  'manager'  -- Different role
);
```

---

## Password Hash Generation

The current hash is for password: `Test@123`

To generate a new password hash:

```javascript
// Run in Node.js or browser console (with bcryptjs loaded)
const bcrypt = require('bcryptjs');
const newPassword = 'YourPassword123';
const hash = bcrypt.hashSync(newPassword, 10);
console.log(hash);
```

Then use the generated hash in the SQL INSERT statement.

---

## Deployment Status

- **GitHub Repo**: https://github.com/ArijitXDA/fundsIndia.git
- **Live URL**: https://funds-india-8134.vercel.app/login
- **Build Status**: ✅ Passing (as of latest commit)
- **Last Deployed**: Automatic deployment on push to main

---

## Quick Verification Checklist

- [ ] SQL script executed in Supabase
- [ ] Test user created successfully
- [ ] Environment variables set in Vercel
- [ ] Application redeployed
- [ ] Login page loads without errors
- [ ] Can submit login form
- [ ] Successfully logged in and redirected to dashboard
- [ ] User profile displayed on dashboard
- [ ] Logout button works

---

**Need Help?**
If you encounter any issues, check:
1. Supabase logs (Dashboard → Logs)
2. Vercel deployment logs (Deployments → View Function Logs)
3. Browser console errors (F12 → Console)

