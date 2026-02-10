-- ============================================================================
-- Create User Accounts for All Employees
-- Run this in Supabase SQL Editor
-- Password for all users: Pass@123
-- ============================================================================

-- Step 1: Create a function to generate bcrypt hash for Pass@123
-- This hash is pre-generated: $2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy

-- Step 2: Insert users for all employees
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
ON CONFLICT (email)
DO UPDATE SET
    password_hash = EXCLUDED.password_hash,
    role = EXCLUDED.role,
    updated_at = NOW();

-- Step 3: Verify results
DO $$
DECLARE
    employee_count INTEGER;
    user_count INTEGER;
    admin_count INTEGER;
    ceo_count INTEGER;
    manager_count INTEGER;
    rm_count INTEGER;
BEGIN
    -- Get counts
    SELECT COUNT(*) INTO employee_count FROM employees WHERE employment_status = 'Working';
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
