-- Fix circular references in employee reporting structure
-- Issue: Some employees report to themselves, causing infinite loops

-- First, identify all circular references
SELECT
    employee_number,
    full_name,
    reporting_manager_emp_number,
    job_title
FROM employees
WHERE employee_number = reporting_manager_emp_number
ORDER BY employee_number;

-- Fix: Set reporting_manager_emp_number to NULL for self-reporting employees
-- These are likely top-level executives who shouldn't report to anyone
UPDATE employees
SET reporting_manager_emp_number = NULL
WHERE employee_number = reporting_manager_emp_number;

-- Verify the fix
SELECT
    employee_number,
    full_name,
    reporting_manager_emp_number,
    job_title
FROM employees
WHERE employee_number = reporting_manager_emp_number;
-- Should return 0 rows

-- Additional check: Find employees with NULL reporting manager (top-level)
SELECT
    employee_number,
    full_name,
    job_title,
    business_unit
FROM employees
WHERE reporting_manager_emp_number IS NULL
ORDER BY job_title;
