-- Create test employee record for Arijit Chowdhury
INSERT INTO employees (
  id,
  employee_number,
  full_name,
  work_email,
  gender,
  mobile_phone,
  location,
  business_unit,
  department,
  sub_department,
  job_title,
  secondary_job_title,
  reporting_manager_emp_number,
  date_joined,
  employment_status
) VALUES (
  gen_random_uuid(),
  'W2662',
  'Arijit Chowdhury',
  'arijit.chowdhury@fundsindia.com',
  'Male',
  '+91-9876543210',
  'Bangalore',
  'B2B',
  'Sales',
  'Enterprise Sales',
  'Relationship Manager',
  'RM',
  'W2661',
  '2024-01-15',
  'Active'
)
ON CONFLICT (work_email) DO NOTHING;

-- Create test user account for login
-- Password: Test@123 (hashed with bcrypt, cost=10)
-- Generated hash using bcryptjs with password "Test@123"
INSERT INTO users (
  id,
  employee_id,
  email,
  password_hash,
  is_first_login,
  role
) VALUES (
  gen_random_uuid(),
  (SELECT id FROM employees WHERE work_email = 'arijit.chowdhury@fundsindia.com'),
  'arijit.chowdhury@fundsindia.com',
  '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy',
  false,
  'rm'
)
ON CONFLICT (email) DO UPDATE SET
  password_hash = EXCLUDED.password_hash,
  is_first_login = EXCLUDED.is_first_login;

-- Note: The password hash above is for "Test@123"
-- To create a different password hash, use bcryptjs:
-- const bcrypt = require('bcryptjs');
-- const hash = bcrypt.hashSync('YourPassword', 10);
-- console.log(hash);

-- Verify the user was created
SELECT
  u.email,
  u.role,
  u.is_first_login,
  e.full_name,
  e.employee_number,
  e.business_unit,
  e.department
FROM users u
JOIN employees e ON u.employee_id = e.id
WHERE u.email = 'arijit.chowdhury@fundsindia.com';
