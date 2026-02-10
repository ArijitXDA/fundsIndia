# RNR Dashboard Scripts

This folder contains utility scripts for database setup, migrations, and verification.

## 📁 Script Files

### Database Setup (SQL)
- **supabase_migration_complete.sql** - Creates all database tables, indexes, and policies
- **create_test_user.sql** - Creates a single test user for testing
- **create_users_from_employees.sql** - Creates users for all employees (original)
- **create_users_fundsindia_only.sql** - Creates users only for @fundsindia.com emails ✅ **Use this**

### Migration Scripts (Node.js)
- **migrate_employees.js** - Import employees from Excel and create users
- **create_users_for_employees.js** - Create user accounts for existing employees
- **verify_database.js** - Verify database contents and show statistics
- **check_excel_columns.js** - Preview Excel file structure before migration

## 🚀 Usage

### 1. Database Schema Setup (Run Once)

**In Supabase SQL Editor:**
```sql
-- Copy and run: supabase_migration_complete.sql
```

This creates all required tables: employees, users, sales_data, etc.

### 2. Create User Accounts

**Option A: Using SQL (Recommended - No dependencies)**

In Supabase SQL Editor:
```sql
-- Copy and run: create_users_fundsindia_only.sql
```

**Option B: Using Node.js (Requires npm packages)**

```bash
cd scripts
node create_users_for_employees.js
```

### 3. Verify Setup

**Using SQL:**
```sql
SELECT COUNT(*) FROM employees;
SELECT COUNT(*) FROM users;
```

**Using Node.js:**
```bash
node verify_database.js
```

## 📋 Prerequisites

### For SQL Scripts:
- ✅ Access to Supabase Dashboard
- ✅ Database tables created (run supabase_migration_complete.sql first)

### For Node.js Scripts:
- ✅ Node.js installed
- ✅ Dependencies installed: `npm install dotenv`
- ✅ `.env.local` configured with Supabase credentials

## 🔑 Default Password

All user accounts created by these scripts use:
- **Password:** `Pass@123`

This is set for all employees to enable immediate login.

## ⚠️ Important Notes

1. **Email Domain Restriction:** Only `@fundsindia.com` emails can create users
2. **Employee Data Required:** Employees must exist before creating users
3. **Re-runnable:** Scripts use UPSERT, safe to run multiple times
4. **Role Assignment:** Automatic based on job titles and employee numbers

## 📊 Role Assignment Logic

- **admin** → Employee #W2661
- **group_ceo** → Akshay Sapru
- **ceo** → CEOs of B2B, B2C, PW (not Corporate)
- **manager** → Anyone with "Manager" or "Head" in job title
- **rm** → Everyone else (default)

## 🔍 Troubleshooting

### "table does not exist"
→ Run `supabase_migration_complete.sql` first

### "Cannot find module"
→ Run `npm install` in the rnr-dashboard directory

### "Email domain check constraint"
→ Use `create_users_fundsindia_only.sql` instead

### "Environment variables not configured"
→ Check `.env.local` has real Supabase credentials

## 📖 Documentation

See `/docs` folder for complete setup guides and troubleshooting.

---

**Last Updated:** 2026-02-10
