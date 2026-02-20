-- Fix for Akshay Sapru's Employee Link Issue
-- Employee exists but is not linked to user account

-- Step 1: Check current user record
SELECT
    u.id as user_id,
    u.email,
    u.employee_id as current_employee_id,
    e.employee_number,
    e.full_name
FROM users u
LEFT JOIN employees e ON u.employee_id = e.id
WHERE u.email = 'akshay.sapru@fundsindia.com';

-- Step 2: Update user to link to correct employee
-- The employee W2225A has ID: 21bd7811-91a0-4815-9173-69cf8f188639
UPDATE users
SET employee_id = '21bd7811-91a0-4815-9173-69cf8f188639'
WHERE email = 'akshay.sapru@fundsindia.com';

-- Step 3: Verify the fix
SELECT
    u.id as user_id,
    u.email,
    u.employee_id,
    e.employee_number,
    e.full_name,
    e.business_unit,
    e.job_title
FROM users u
LEFT JOIN employees e ON u.employee_id = e.id
WHERE u.email = 'akshay.sapru@fundsindia.com';

-- Step 4: Check direct reports
SELECT
    employee_number,
    full_name,
    job_title,
    business_unit
FROM employees
WHERE reporting_manager_emp_number = 'W2225A'
ORDER BY full_name;
