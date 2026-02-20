-- Comprehensive check to verify direct reports count

-- 1. Check if circular reference still exists
SELECT
    'CIRCULAR REFERENCE CHECK' as check_type,
    employee_number,
    full_name,
    reporting_manager_emp_number,
    CASE
        WHEN employee_number = reporting_manager_emp_number THEN '❌ STILL HAS CIRCULAR REFERENCE'
        WHEN reporting_manager_emp_number IS NULL THEN '✅ CORRECT - No manager (top level)'
        ELSE '⚠️  Reports to: ' || reporting_manager_emp_number
    END as status
FROM employees
WHERE employee_number = 'W2225A';

-- 2. Count actual direct reports (excluding himself if circular ref exists)
SELECT
    'DIRECT REPORTS COUNT' as check_type,
    COUNT(*) as total_count,
    COUNT(CASE WHEN employee_number != 'W2225A' THEN 1 END) as excluding_self
FROM employees
WHERE reporting_manager_emp_number = 'W2225A';

-- 3. List all direct reports with details
SELECT
    'DIRECT REPORTS LIST' as check_type,
    employee_number,
    full_name,
    job_title,
    business_unit,
    CASE
        WHEN employee_number = 'W2225A' THEN '⚠️ CIRCULAR - This is Akshay himself!'
        ELSE '✅ Valid direct report'
    END as validation
FROM employees
WHERE reporting_manager_emp_number = 'W2225A'
ORDER BY
    CASE WHEN employee_number = 'W2225A' THEN 0 ELSE 1 END,
    full_name;

-- 4. Check if there are any employees with business units that might be filtered
SELECT
    'BUSINESS UNIT DISTRIBUTION' as check_type,
    business_unit,
    COUNT(*) as count
FROM employees
WHERE reporting_manager_emp_number = 'W2225A'
GROUP BY business_unit
ORDER BY count DESC;
