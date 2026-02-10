-- Update ALL users with the working bcrypt hash for Pass@123
-- This hash was generated on Vercel and confirmed to work

-- First, check how many users will be updated
SELECT
    COUNT(*) as total_users,
    COUNT(CASE WHEN password_hash = '$2a$10$secEtCn0M6S4IACt/jazE.e67w0XIf8DLzympEY7Ae3VpKIDuMzTa' THEN 1 END) as already_correct,
    COUNT(CASE WHEN password_hash != '$2a$10$secEtCn0M6S4IACt/jazE.e67w0XIf8DLzympEY7Ae3VpKIDuMzTa' THEN 1 END) as needs_update
FROM users;

-- Update ALL users to use the working hash
UPDATE users
SET
    password_hash = '$2a$10$secEtCn0M6S4IACt/jazE.e67w0XIf8DLzympEY7Ae3VpKIDuMzTa',
    updated_at = NOW()
WHERE password_hash != '$2a$10$secEtCn0M6S4IACt/jazE.e67w0XIf8DLzympEY7Ae3VpKIDuMzTa';

-- Verify the update
SELECT
    COUNT(*) as total_users,
    COUNT(CASE WHEN password_hash = '$2a$10$secEtCn0M6S4IACt/jazE.e67w0XIf8DLzympEY7Ae3VpKIDuMzTa' THEN 1 END) as with_correct_hash
FROM users;

-- Show sample users to verify
SELECT
    email,
    role,
    password_hash = '$2a$10$secEtCn0M6S4IACt/jazE.e67w0XIf8DLzympEY7Ae3VpKIDuMzTa' as has_working_hash
FROM users
ORDER BY role, email
LIMIT 20;
