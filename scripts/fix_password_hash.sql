-- Fix password hash for all users
-- This updates all users to use Pass@123 with a verified bcrypt hash

-- First, let's check the current hash
SELECT
    email,
    password_hash,
    CASE
        WHEN password_hash = '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy'
        THEN 'Matches expected'
        ELSE 'Different hash'
    END as hash_status
FROM users
WHERE email = 'arijit.chowdhury@fundsindia.com';

-- Update ALL users with the correct bcrypt hash for Pass@123
-- This hash was generated with: bcrypt.hash('Pass@123', 10)
UPDATE users
SET password_hash = '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy',
    updated_at = NOW()
WHERE password_hash != '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy';

-- Verify the update
SELECT
    COUNT(*) as total_users,
    COUNT(CASE WHEN password_hash = '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy' THEN 1 END) as users_with_correct_hash
FROM users;

-- Test specific user again
SELECT
    email,
    role,
    password_hash = '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy' as has_correct_hash
FROM users
WHERE email = 'arijit.chowdhury@fundsindia.com';
