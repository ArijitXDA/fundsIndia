-- Check exact hash details for debugging

-- Show the exact hash and its length
SELECT
    email,
    role,
    password_hash,
    LENGTH(password_hash) as hash_length,
    password_hash = '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy' as matches_expected,
    SUBSTRING(password_hash, 1, 10) as hash_prefix,
    created_at,
    updated_at
FROM users
WHERE email = 'arijit.chowdhury@fundsindia.com';

-- Expected hash details
SELECT
    '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy' as expected_hash,
    LENGTH('$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy') as expected_length;
