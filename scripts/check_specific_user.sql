-- Check if specific user exists in database
-- Run this in Supabase SQL Editor

-- Check if employee exists
SELECT
    'Employee Check' as check_type,
    employee_number,
    full_name,
    work_email,
    business_unit,
    job_title,
    employment_status
FROM employees
WHERE work_email = 'arijit.chowdhury@fundsindia.com';

-- Check if user account exists
SELECT
    'User Account Check' as check_type,
    u.email,
    u.role,
    u.is_first_login,
    u.created_at,
    e.full_name,
    e.employee_number
FROM users u
LEFT JOIN employees e ON u.employee_id = e.id
WHERE u.email = 'arijit.chowdhury@fundsindia.com';

-- If user doesn't exist, create it manually
-- Uncomment and run the following if the user account check returns no rows:

/*
INSERT INTO users (employee_id, email, password_hash, is_first_login, role)
VALUES (
    (SELECT id FROM employees WHERE work_email = 'arijit.chowdhury@fundsindia.com'),
    'arijit.chowdhury@fundsindia.com',
    '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy',
    false,
    'rm'
)
ON CONFLICT (email) DO UPDATE SET
    password_hash = EXCLUDED.password_hash
RETURNING *;
*/

-- Verify password hash is correct
SELECT
    'Password Hash Verification' as check_type,
    email,
    CASE
        WHEN password_hash = '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy'
        THEN 'Correct (Pass@123)'
        ELSE 'Different hash - password may be wrong'
    END as password_status
FROM users
WHERE email = 'arijit.chowdhury@fundsindia.com';
