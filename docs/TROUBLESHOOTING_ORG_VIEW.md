# Troubleshooting Org View Issues

## Problem: User Cannot See Direct Reports in Org View

### Symptoms
- User opens Org View modal
- Shows "No Organization Data" message
- Direct reports are not visible
- Console shows "Current employee not found" error

### Root Cause
This issue occurs when there's a mismatch between the `users` table and `employees` table. The user's account exists, but the employee record is either missing or not properly linked.

## Database Structure

### Users Table
```sql
CREATE TABLE users (
    id UUID PRIMARY KEY,
    employee_id UUID REFERENCES employees(id),  -- Foreign key to employees
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    ...
);
```

### Employees Table
```sql
CREATE TABLE employees (
    id UUID PRIMARY KEY,
    employee_number TEXT UNIQUE,  -- e.g., "W2225A"
    full_name TEXT,
    work_email TEXT,
    reporting_manager_emp_number TEXT,  -- References another employee's employee_number
    ...
);
```

## Diagnostic Steps

### 1. Check User's Employee Link

Run the diagnostic API:
```bash
curl http://localhost:3000/api/diagnose-user
```

Or visit in browser after logging in:
```
http://localhost:3000/api/diagnose-user
```

This will show:
- Whether the user has an `employee_id` set
- Whether the `employee_id` points to a valid employee record
- The employee's data (if linked)
- Direct reports count
- Whether the manager exists

### 2. Run SQL Diagnostics

Execute the diagnostic SQL script:
```bash
# Copy the SQL from scripts/diagnose-employee-sync.sql
# and run it in Supabase SQL Editor
```

Or manually check:
```sql
-- Check if W2225A exists
SELECT * FROM employees WHERE employee_number = 'W2225A';

-- Check user's employee link
SELECT u.email, u.employee_id, e.employee_number, e.full_name
FROM users u
LEFT JOIN employees e ON u.employee_id = e.id
WHERE u.email = 'akshay.sapru@fundsindia.com';

-- Check direct reports
SELECT employee_number, full_name
FROM employees
WHERE reporting_manager_emp_number = 'W2225A';
```

## Common Issues & Fixes

### Issue 1: Employee Record Doesn't Exist

**Symptoms:**
- `diagnose-user` API shows `employeeJoinSuccessful: false`
- SQL query for employee_number returns no results

**Fix:**
Create the employee record:
```sql
INSERT INTO employees (
    employee_number,
    full_name,
    work_email,
    business_unit,
    job_title,
    reporting_manager_emp_number,
    location
) VALUES (
    'W2225A',
    'Akshay Sapru',
    'akshay.sapru@fundsindia.com',
    'Corporate',
    'Group CEO',
    NULL,  -- CEO has no manager
    'Mumbai'
);
```

Then link it to the user:
```sql
UPDATE users
SET employee_id = (SELECT id FROM employees WHERE employee_number = 'W2225A')
WHERE email = 'akshay.sapru@fundsindia.com';
```

### Issue 2: Employee Exists but Not Linked to User

**Symptoms:**
- `diagnose-user` shows `employeeFoundByEmail: true`
- But `employeeJoinSuccessful: false`
- API suggests a specific employee_id

**Fix:**
Link the employee to the user:
```sql
UPDATE users
SET employee_id = (SELECT id FROM employees WHERE work_email = 'akshay.sapru@fundsindia.com')
WHERE email = 'akshay.sapru@fundsindia.com';
```

### Issue 3: Employee Number Mismatch

**Symptoms:**
- Employee record exists with different employee_number
- Users table has wrong employee_id

**Fix:**
Either update the employee_number:
```sql
UPDATE employees
SET employee_number = 'W2225A'
WHERE work_email = 'akshay.sapru@fundsindia.com';
```

Or update the users table to link to correct employee:
```sql
UPDATE users
SET employee_id = (SELECT id FROM employees WHERE employee_number = 'W2225A')
WHERE email = 'akshay.sapru@fundsindia.com';
```

### Issue 4: Circular Reference

**Symptoms:**
- Employee reports to themselves
- `reporting_manager_emp_number = employee_number`

**Fix:**
```sql
UPDATE employees
SET reporting_manager_emp_number = NULL
WHERE employee_number = reporting_manager_emp_number;
```

## Verification

After applying fixes, verify:

1. **Check user can log in:**
```bash
# Login at http://localhost:3000/login
# Should redirect to dashboard
```

2. **Check employee data loads:**
```bash
curl http://localhost:3000/api/auth/me
# Should show employee data
```

3. **Check org hierarchy:**
```bash
curl "http://localhost:3000/api/org-hierarchy?employeeId=W2225A"
# Should return currentEmployee with data
```

4. **Check direct reports:**
```sql
SELECT employee_number, full_name
FROM employees
WHERE reporting_manager_emp_number = 'W2225A';
```

## Prevention

To prevent this issue in the future:

1. **Always create employee record before user account:**
```sql
-- 1. Create employee first
INSERT INTO employees (...) VALUES (...);

-- 2. Then create user with proper link
INSERT INTO users (email, employee_id, ...)
VALUES (
    'new.user@fundsindia.com',
    (SELECT id FROM employees WHERE employee_number = 'W1234'),
    ...
);
```

2. **Add database constraints:**
```sql
-- Ensure employee_id in users always references valid employee
ALTER TABLE users
ADD CONSTRAINT fk_employee_id
FOREIGN KEY (employee_id)
REFERENCES employees(id)
ON DELETE CASCADE;
```

3. **Use CSV import with validation:**
When importing employees from CSV, validate:
- No duplicate employee_numbers
- All reporting_manager_emp_number values exist (or are NULL)
- No circular references
- work_email matches users.email where applicable

## API Endpoints for Debugging

- `/api/diagnose-user` - Check current user's employee linkage
- `/api/org-hierarchy?employeeId=W2225A` - Check if employee is in hierarchy
- `/api/auth/me` - Check session and employee data
- `/api/debug-employee?employeeNumber=W2225A` - Detailed employee lookup

## Next Steps

If issue persists after trying above fixes:

1. Check application logs for errors
2. Verify Supabase connection is working
3. Check browser console for errors
4. Ensure all migrations have run
5. Contact support with diagnostic output
