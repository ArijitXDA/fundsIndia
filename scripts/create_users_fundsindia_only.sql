-- ============================================================================
-- Create User Accounts for Employees with @fundsindia.com emails only
-- Run this in Supabase SQL Editor
-- Password for all users: Pass@123
-- ============================================================================

-- Step 1: Insert users ONLY for employees with @fundsindia.com emails
INSERT INTO users (employee_id, email, password_hash, is_first_login, role)
SELECT
    e.id as employee_id,
    e.work_email as email,
    '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy' as password_hash,
    false as is_first_login,
    CASE
        -- Admin: Employee #W2661
        WHEN e.employee_number = 'W2661' THEN 'admin'

        -- Group CEO: Akshay Sapru
        WHEN LOWER(e.full_name) LIKE '%akshay sapru%' THEN 'group_ceo'

        -- CEOs: Anyone with CEO in job title (except Corporate)
        WHEN LOWER(COALESCE(e.job_title, '')) LIKE '%ceo%'
             AND COALESCE(e.business_unit, '') != 'Corporate' THEN 'ceo'

        -- Managers: Anyone with Manager or Head in job title
        WHEN LOWER(COALESCE(e.job_title, '')) LIKE '%manager%'
             OR LOWER(COALESCE(e.job_title, '')) LIKE '%head%' THEN 'manager'

        -- Default: RM (Relationship Manager)
        ELSE 'rm'
    END as role
FROM employees e
WHERE e.work_email IS NOT NULL
    AND e.employment_status = 'Working'
    AND e.work_email LIKE '%@fundsindia.com'  -- ONLY @fundsindia.com emails
ON CONFLICT (email)
DO UPDATE SET
    password_hash = EXCLUDED.password_hash,
    role = EXCLUDED.role,
    updated_at = NOW();

-- Step 2: Show summary of skipped emails
SELECT
    COUNT(*) as skipped_employees,
    'Not @fundsindia.com' as reason
FROM employees
WHERE work_email IS NOT NULL
    AND employment_status = 'Working'
    AND work_email NOT LIKE '%@fundsindia.com';

-- Step 3: Verify results
DO $$
DECLARE
    employee_count INTEGER;
    fundsindia_count INTEGER;
    other_domain_count INTEGER;
    user_count INTEGER;
    admin_count INTEGER;
    ceo_count INTEGER;
    manager_count INTEGER;
    rm_count INTEGER;
BEGIN
    -- Get counts
    SELECT COUNT(*) INTO employee_count FROM employees WHERE employment_status = 'Working';
    SELECT COUNT(*) INTO fundsindia_count FROM employees WHERE employment_status = 'Working' AND work_email LIKE '%@fundsindia.com';
    SELECT COUNT(*) INTO other_domain_count FROM employees WHERE employment_status = 'Working' AND work_email NOT LIKE '%@fundsindia.com';
    SELECT COUNT(*) INTO user_count FROM users;
    SELECT COUNT(*) INTO admin_count FROM users WHERE role = 'admin';
    SELECT COUNT(*) INTO ceo_count FROM users WHERE role = 'ceo' OR role = 'group_ceo';
    SELECT COUNT(*) INTO manager_count FROM users WHERE role = 'manager';
    SELECT COUNT(*) INTO rm_count FROM users WHERE role = 'rm';

    -- Print summary
    RAISE NOTICE '═══════════════════════════════════════════';
    RAISE NOTICE '✅ User Creation Complete!';
    RAISE NOTICE '═══════════════════════════════════════════';
    RAISE NOTICE 'Total active employees: %', employee_count;
    RAISE NOTICE '  @fundsindia.com emails: %', fundsindia_count;
    RAISE NOTICE '  Other domains (skipped): %', other_domain_count;
    RAISE NOTICE '';
    RAISE NOTICE 'Total users created: %', user_count;
    RAISE NOTICE '';
    RAISE NOTICE 'Role Distribution:';
    RAISE NOTICE '  Admin: %', admin_count;
    RAISE NOTICE '  CEOs: %', ceo_count;
    RAISE NOTICE '  Managers: %', manager_count;
    RAISE NOTICE '  RMs: %', rm_count;
    RAISE NOTICE '';
    RAISE NOTICE '🔑 Default password for all users: Pass@123';
    RAISE NOTICE '═══════════════════════════════════════════';
END $$;

-- Step 4: Show sample users
SELECT
    u.email,
    u.role,
    e.full_name,
    e.employee_number,
    e.business_unit,
    e.job_title
FROM users u
JOIN employees e ON u.employee_id = e.id
ORDER BY
    CASE u.role
        WHEN 'admin' THEN 1
        WHEN 'group_ceo' THEN 2
        WHEN 'ceo' THEN 3
        WHEN 'manager' THEN 4
        ELSE 5
    END,
    e.full_name
LIMIT 20;

-- Step 5: Show employees that were skipped
SELECT
    employee_number,
    full_name,
    work_email,
    business_unit,
    job_title,
    'Email not @fundsindia.com' as skip_reason
FROM employees
WHERE employment_status = 'Working'
    AND work_email IS NOT NULL
    AND work_email NOT LIKE '%@fundsindia.com'
ORDER BY full_name
LIMIT 20;
