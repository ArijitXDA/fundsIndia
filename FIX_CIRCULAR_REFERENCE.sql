-- Fix Circular Reference: Akshay Sapru reporting to himself
-- This is causing issues with the org view counting

-- Step 1: Check current state
SELECT
    employee_number,
    full_name,
    job_title,
    reporting_manager_emp_number,
    CASE
        WHEN employee_number = reporting_manager_emp_number THEN 'CIRCULAR REFERENCE!'
        ELSE 'OK'
    END as status
FROM employees
WHERE employee_number = 'W2225A';

-- Step 2: Fix the circular reference
-- Group CEO should have NULL reporting manager (no one above them)
UPDATE employees
SET reporting_manager_emp_number = NULL
WHERE employee_number = 'W2225A';

-- Step 3: Verify the fix
SELECT
    employee_number,
    full_name,
    job_title,
    reporting_manager_emp_number
FROM employees
WHERE employee_number = 'W2225A';

-- Step 4: Check direct reports count (should be 12, not 13)
SELECT COUNT(*) as direct_reports_count
FROM employees
WHERE reporting_manager_emp_number = 'W2225A';

-- Step 5: List all direct reports (should NOT include W2225A itself)
SELECT
    employee_number,
    full_name,
    job_title,
    business_unit
FROM employees
WHERE reporting_manager_emp_number = 'W2225A'
ORDER BY full_name;
