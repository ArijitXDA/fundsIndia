-- Check what columns exist and have data for W1564
SELECT 
  employee_number,
  employee_name,
  work_email,
  mobile_number,
  designation,
  business_unit,
  reporting_manager,
  reporting_manager_emp_no,
  location
FROM employees
WHERE employee_number = 'W1564';
