# Immediate Action Required: Org View Issue for W2225A

## Issue Summary

The user **Akshay Sapru** (akshay.sapru@fundsindia.com) cannot see direct reports in the Org View because of a data synchronization issue between the `users` table and `employees` table.

## Root Cause

The `users` table has an `employee_id` column that should reference a record in the `employees` table. One of the following is true:

1. **Employee record W2225A does not exist** in the employees table, OR
2. **Employee record exists but is not linked** to the user account, OR
3. **Employee record has a different employee_number** than expected

## Quick Fix Options

### Option 1: Check if Employee W2225A Exists

Run this query in Supabase SQL Editor:

```sql
SELECT employee_number, full_name, work_email, id
FROM employees
WHERE employee_number = 'W2225A' OR work_email = 'akshay.sapru@fundsindia.com';
```

**If NO results:** The employee record is missing → Go to **Fix A**
**If YES results:** The employee exists → Go to **Fix B**

### Fix A: Create Missing Employee Record

```sql
-- Create employee record
INSERT INTO employees (
    employee_number,
    full_name,
    work_email,
    business_unit,
    job_title,
    reporting_manager_emp_number,
    location,
    employment_status
) VALUES (
    'W2225A',
    'Akshay Sapru',
    'akshay.sapru@fundsindia.com',
    'Corporate',
    'Group CEO',
    NULL,  -- CEO has no manager
    'Mumbai',
    'Working'
);

-- Link to user account
UPDATE users
SET employee_id = (SELECT id FROM employees WHERE employee_number = 'W2225A')
WHERE email = 'akshay.sapru@fundsindia.com';
```

### Fix B: Link Existing Employee to User

```sql
-- Update user to point to correct employee
UPDATE users
SET employee_id = (SELECT id FROM employees WHERE work_email = 'akshay.sapru@fundsindia.com')
WHERE email = 'akshay.sapru@fundsindia.com';
```

### Fix C: Verify Direct Reports

After fixing the employee link, check that direct reports exist:

```sql
-- This should return Rishabh Garg, Arijit Chowdhury, etc.
SELECT employee_number, full_name, job_title
FROM employees
WHERE reporting_manager_emp_number = 'W2225A';
```

**If NO results:** Import the employee hierarchy data or update reporting_manager_emp_number for subordinates

## Verification Steps

1. Run the diagnostic API (after logging in as Akshay):
```
http://localhost:3000/api/diagnose-user
```

This should show:
- `employeeJoinSuccessful: true`
- `employeeNumber: "W2225A"`
- `directReportsCount: <number>`

2. Test the org hierarchy API:
```
http://localhost:3000/api/org-hierarchy?employeeId=W2225A
```

This should return:
- `currentEmployee: { employeeNumber: "W2225A", ... }`
- `employees: [array of downstream employees]`

3. Log in to dashboard and click "Org View"
   - Should see "Akshay Sapru" card highlighted
   - Should see direct reports below
   - Should be able to expand/collapse teams

## What I've Done

1. ✅ Added enhanced debugging to OrgChartModal component
2. ✅ Improved error messages in the UI when employee not found
3. ✅ Created `/api/diagnose-user` endpoint for troubleshooting
4. ✅ Created `/api/debug-employee` endpoint for detailed lookup
5. ✅ Added debug logging to `/api/org-hierarchy` for W2225A
6. ✅ Created SQL diagnostic script: `scripts/diagnose-employee-sync.sql`
7. ✅ Created troubleshooting guide: `docs/TROUBLESHOOTING_ORG_VIEW.md`

## Files Changed

- `components/OrgChartModal.tsx` - Better error handling and debugging
- `app/api/org-hierarchy/route.ts` - Added debug info for W2225A
- `app/api/diagnose-user/route.ts` - New diagnostic endpoint
- `app/api/debug-employee/route.ts` - New employee lookup endpoint
- `scripts/diagnose-employee-sync.sql` - Database diagnostic queries
- `docs/TROUBLESHOOTING_ORG_VIEW.md` - Complete troubleshooting guide

## Next Steps for You

1. **Run the diagnostic query** (Option 1 above) to identify which fix is needed
2. **Apply the appropriate fix** (Fix A, B, or C)
3. **Verify** using the verification steps
4. **Import missing employee data** if direct reports are not in the system
5. **Check other users** if they have similar issues

## Support Resources

- Diagnostic endpoint: `http://localhost:3000/api/diagnose-user`
- Troubleshooting guide: `docs/TROUBLESHOOTING_ORG_VIEW.md`
- SQL diagnostics: `scripts/diagnose-employee-sync.sql`

---

**Note:** This is a data sync issue, not a code bug. The application is working correctly, but the database needs to have the employee records properly linked to user accounts.
