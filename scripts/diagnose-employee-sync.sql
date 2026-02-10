-- Diagnostic Script for Employee Data Sync Issues
-- Run this to investigate why W2225A (Akshay Sapru) is not showing in org view

-- 1. Check if employee W2225A exists in employees table
SELECT 'Employee W2225A in employees table:' as check_type;
SELECT employee_number, full_name, work_email, business_unit, reporting_manager_emp_number
FROM employees
WHERE employee_number = 'W2225A';

-- 2. Search for Akshay Sapru by name
SELECT 'Employees with name matching Akshay Sapru:' as check_type;
SELECT employee_number, full_name, work_email, business_unit, reporting_manager_emp_number
FROM employees
WHERE full_name ILIKE '%akshay%sapru%' OR full_name ILIKE '%sapru%akshay%';

-- 3. Check users table for akshay.sapru@fundsindia.com
SELECT 'User record for akshay.sapru@fundsindia.com:' as check_type;
SELECT u.id, u.email, u.employee_id, u.role,
       e.employee_number, e.full_name, e.business_unit
FROM users u
LEFT JOIN employees e ON u.employee_id = e.id
WHERE u.email = 'akshay.sapru@fundsindia.com';

-- 4. Check who reports to W2225A
SELECT 'Employees reporting to W2225A:' as check_type;
SELECT employee_number, full_name, job_title, business_unit
FROM employees
WHERE reporting_manager_emp_number = 'W2225A'
LIMIT 20;

-- 5. Check if there are any employees with similar employee numbers
SELECT 'Similar employee numbers to W2225A:' as check_type;
SELECT employee_number, full_name, work_email
FROM employees
WHERE employee_number ILIKE '%w2225%' OR employee_number ILIKE '%2225a%';

-- 6. Check total employees count
SELECT 'Total employees in system:' as check_type;
SELECT COUNT(*) as total_employees FROM employees;

-- 7. Check for employees with null or invalid employee_number
SELECT 'Employees with NULL employee_number:' as check_type;
SELECT COUNT(*) as count_null_emp_no
FROM employees
WHERE employee_number IS NULL OR employee_number = '';

-- 8. Check for circular references (employees reporting to themselves)
SELECT 'Circular references (employees reporting to themselves):' as check_type;
SELECT employee_number, full_name, reporting_manager_emp_number
FROM employees
WHERE employee_number = reporting_manager_emp_number;

-- 9. Check for broken manager references
SELECT 'Employees with non-existent managers:' as check_type;
SELECT e.employee_number, e.full_name, e.reporting_manager_emp_number
FROM employees e
WHERE e.reporting_manager_emp_number IS NOT NULL
  AND e.reporting_manager_emp_number != ''
  AND NOT EXISTS (
    SELECT 1 FROM employees m
    WHERE m.employee_number = e.reporting_manager_emp_number
  )
LIMIT 20;

-- 10. Get the full employee hierarchy for W2225A if it exists
SELECT 'Full employee record for W2225A:' as check_type;
SELECT * FROM employees WHERE employee_number = 'W2225A';
