# Database & Supabase Context - RNR Dashboard

**Last Updated:** February 9, 2026
**Database:** Supabase (PostgreSQL)
**Version:** 1.0.0

---

## Table of Contents
1. [Database Schema](#database-schema)
2. [SQL Migration Scripts](#sql-migration-scripts)
3. [Row Level Security Policies](#row-level-security-policies)
4. [Database Functions](#database-functions)
5. [Indexes](#indexes)
6. [Sample Queries](#sample-queries)
7. [Data Retention](#data-retention)

---

## Database Schema

### Entity Relationship Overview

```
users ──────┬─── employees ──────┬─── sales_data
            │                     │
            │                     ├─── advisory_data
            │                     │
            │                     ├─── targets
            │                     │
            │                     ├─── rankings
            │                     │
            │                     └─── reporting_history
            │
            └─── activity_logs

contest_config (standalone)
```

---

### Table: employees

**Purpose:** Master employee directory with organizational details

```sql
CREATE TABLE employees (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_number TEXT UNIQUE NOT NULL,
    full_name TEXT NOT NULL,
    work_email TEXT UNIQUE NOT NULL,
    gender TEXT,
    mobile_phone TEXT,
    location TEXT,
    business_unit TEXT NOT NULL, -- 'B2B', 'B2C', 'Corporate', 'PW'
    department TEXT,
    sub_department TEXT,
    job_title TEXT,
    secondary_job_title TEXT,
    reporting_manager_emp_number TEXT, -- References employee_number
    date_joined DATE,
    employment_status TEXT DEFAULT 'Working', -- 'Working', 'Resigned', 'Terminated'
    exit_date DATE,
    is_placeholder BOOLEAN DEFAULT FALSE, -- TRUE if auto-created from sales data
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_employees_email ON employees(work_email);
CREATE INDEX idx_employees_emp_number ON employees(employee_number);
CREATE INDEX idx_employees_business_unit ON employees(business_unit);
CREATE INDEX idx_employees_status ON employees(employment_status);
CREATE INDEX idx_employees_manager ON employees(reporting_manager_emp_number);
```

**Key Fields:**
- `employee_number`: Unique identifier (e.g., "W2661", "5012")
- `work_email`: Must be @fundsindia.com
- `business_unit`: B2B, B2C, Corporate, PW
- `reporting_manager_emp_number`: Self-referencing to build hierarchy
- `is_placeholder`: TRUE if employee was auto-created from sales data without Employee Master entry

---

### Table: users

**Purpose:** Authentication and authorization

```sql
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id UUID UNIQUE REFERENCES employees(id) ON DELETE CASCADE,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    is_first_login BOOLEAN DEFAULT TRUE,
    last_login TIMESTAMP WITH TIME ZONE,
    role TEXT DEFAULT 'rm', -- 'admin', 'group_ceo', 'ceo', 'manager', 'rm', 'ifa'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_employee_id ON users(employee_id);
CREATE INDEX idx_users_role ON users(role);

-- Constraint: Email must be @fundsindia.com
ALTER TABLE users ADD CONSTRAINT email_domain_check
    CHECK (email LIKE '%@fundsindia.com');
```

**Role Assignment Logic:**
- `admin`: employee_number = 'W2661'
- `group_ceo`: Lookup by name "Akshay Sapru"
- `ceo`: business_unit IN ('B2B', 'B2C', 'PW') AND job_title ILIKE '%CEO%'
- `manager`: Has employees with reporting_manager_emp_number = this employee's number
- `rm` / `ifa`: Default for individual contributors

---

### Table: reporting_history

**Purpose:** Track reporting manager changes over time

```sql
CREATE TABLE reporting_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id UUID REFERENCES employees(id) ON DELETE CASCADE,
    reporting_manager_emp_number TEXT NOT NULL,
    effective_from DATE NOT NULL,
    effective_to DATE, -- NULL means current
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_reporting_history_employee ON reporting_history(employee_id);
CREATE INDEX idx_reporting_history_dates ON reporting_history(effective_from, effective_to);
```

**Usage:**
- When manager changes, set effective_to = change_date for old record
- Insert new record with effective_from = change_date, effective_to = NULL
- Allows historical context: "Who was this person's manager in January?"

---

### Table: sales_data

**Purpose:** Store B2B sales performance data (from Net Sales file)

```sql
CREATE TABLE sales_data (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_email TEXT, -- May not match employees table initially
    employee_name TEXT,
    employee_id UUID REFERENCES employees(id) ON DELETE SET NULL, -- Linked after matching
    business_unit TEXT DEFAULT 'B2B',

    -- Sales file specific fields
    arn TEXT, -- ARN number (for B2B partners)
    partner_name TEXT,

    -- B2B Hierarchy from Net Sales file
    rm_name TEXT,
    bm_name TEXT,
    rgm_name TEXT,
    zm_name TEXT,

    -- Financial metrics
    mf_sif_msci DECIMAL(15,2) DEFAULT 0,
    cob_100 DECIMAL(15,2) DEFAULT 0,
    cob_50 DECIMAL(15,2) DEFAULT 0,
    aif_pms_las_trail DECIMAL(15,2) DEFAULT 0,
    mf_total_cob_100 DECIMAL(15,2) DEFAULT 0,
    mf_total_cob_50 DECIMAL(15,2) DEFAULT 0,
    alternate DECIMAL(15,2) DEFAULT 0,
    alt_total DECIMAL(15,2) DEFAULT 0,
    total_net_sales_cob_100 DECIMAL(15,2) DEFAULT 0, -- PRIMARY RANKING METRIC
    total_net_sales_cob_50 DECIMAL(15,2) DEFAULT 0,

    -- Location
    branch TEXT,
    zone TEXT,

    -- Temporal
    data_date DATE NOT NULL, -- Date of the data
    data_period TEXT NOT NULL, -- 'MTD', 'YTD', 'QTD'

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- Unique constraint: One record per employee per period per date
    UNIQUE(employee_email, data_period, data_date)
);

-- Indexes
CREATE INDEX idx_sales_data_email ON sales_data(employee_email);
CREATE INDEX idx_sales_data_employee_id ON sales_data(employee_id);
CREATE INDEX idx_sales_data_period ON sales_data(data_period);
CREATE INDEX idx_sales_data_date ON sales_data(data_date);
CREATE INDEX idx_sales_data_business_unit ON sales_data(business_unit);
CREATE INDEX idx_sales_data_rm ON sales_data(rm_name);
```

**Key Fields:**
- `total_net_sales_cob_100`: Primary metric for ranking
- `data_period`: 'MTD', 'YTD', 'QTD', 'Contest'
- `rm_name, bm_name, rgm_name, zm_name`: B2B hierarchy (overrides Employee Master for B2B)

---

### Table: advisory_data

**Purpose:** Store B2C/Digital advisor performance data

```sql
CREATE TABLE advisory_data (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team TEXT, -- Team name (e.g., "DIGITAL")
    advisor_email TEXT NOT NULL,
    employee_id UUID REFERENCES employees(id) ON DELETE SET NULL,

    -- Performance metrics
    assigned_leads INTEGER DEFAULT 0,
    total_sip_book DECIMAL(15,2) DEFAULT 0,
    assigned_aum DECIMAL(15,2) DEFAULT 0,
    ytd_net_aum_growth_pct DECIMAL(5,2) DEFAULT 0,

    -- Monthly inflows/outflows
    net_inflow_mtd DECIMAL(15,2) DEFAULT 0,
    net_inflow_ytd DECIMAL(15,2) DEFAULT 0,
    gross_lumpsum_inflow_mtd DECIMAL(15,2) DEFAULT 0,
    gross_lumpsum_inflow_ytd DECIMAL(15,2) DEFAULT 0,
    total_sip_inflow_mtd DECIMAL(15,2) DEFAULT 0,
    total_sip_inflow_ytd DECIMAL(15,2) DEFAULT 0,
    new_sip_inflow_mtd DECIMAL(15,2) DEFAULT 0,
    new_sip_inflow_ytd DECIMAL(15,2) DEFAULT 0,
    total_outflow_mtd DECIMAL(15,2) DEFAULT 0,
    total_outflow_ytd DECIMAL(15,2) DEFAULT 0,

    -- Current state
    current_aum_mtm DECIMAL(15,2) DEFAULT 0,
    aum_growth_mtm_pct DECIMAL(5,2) DEFAULT 0,
    msci_inflow_mtd DECIMAL(15,2) DEFAULT 0,
    msci_inflow_ytd DECIMAL(15,2) DEFAULT 0,
    fd_inflow_mtd DECIMAL(15,2) DEFAULT 0,
    fd_inflow_ytd DECIMAL(15,2) DEFAULT 0,

    -- Temporal
    data_date DATE NOT NULL,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- Unique constraint
    UNIQUE(advisor_email, data_date)
);

-- Indexes
CREATE INDEX idx_advisory_data_email ON advisory_data(advisor_email);
CREATE INDEX idx_advisory_data_employee_id ON advisory_data(employee_id);
CREATE INDEX idx_advisory_data_date ON advisory_data(data_date);
CREATE INDEX idx_advisory_data_team ON advisory_data(team);
```

**Key Fields:**
- `advisor_email`: Links to employees via email matching
- `current_aum_mtm`: Mark-to-market AUM
- `net_inflow_*`: Net inflows for ranking

---

### Table: targets

**Purpose:** Store individual employee targets for each parameter and period

```sql
CREATE TABLE targets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id UUID REFERENCES employees(id) ON DELETE CASCADE,
    business_unit TEXT NOT NULL,
    parameter_name TEXT NOT NULL, -- 'net_sales', 'aum', 'revenue'
    target_type TEXT NOT NULL, -- 'monthly', 'quarterly', 'yearly', 'contest'
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    target_value DECIMAL(15,2) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID REFERENCES employees(id),

    -- Unique constraint: One target per employee per parameter per period
    UNIQUE(employee_id, parameter_name, target_type, period_start)
);

-- Indexes
CREATE INDEX idx_targets_employee ON targets(employee_id);
CREATE INDEX idx_targets_parameter ON targets(parameter_name);
CREATE INDEX idx_targets_type ON targets(target_type);
CREATE INDEX idx_targets_dates ON targets(period_start, period_end);
CREATE INDEX idx_targets_business_unit ON targets(business_unit);
```

**Sample Targets:**
```sql
-- Net Sales target for January 2026
INSERT INTO targets (employee_id, business_unit, parameter_name, target_type, period_start, period_end, target_value)
VALUES ('uuid-here', 'B2B', 'net_sales', 'monthly', '2026-01-01', '2026-01-31', 100.00);

-- AUM target for Q4
INSERT INTO targets (employee_id, business_unit, parameter_name, target_type, period_start, period_end, target_value)
VALUES ('uuid-here', 'B2C', 'aum', 'quarterly', '2026-01-01', '2026-03-31', 500.00);
```

---

### Table: rankings

**Purpose:** Store calculated rankings for each period

```sql
CREATE TABLE rankings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id UUID REFERENCES employees(id) ON DELETE CASCADE,
    business_unit TEXT NOT NULL,
    parameter_name TEXT NOT NULL, -- 'net_sales', 'aum', 'revenue'
    period_type TEXT NOT NULL, -- 'MTD', 'QTD', 'YTD', 'Contest'
    achievement_value DECIMAL(15,2) DEFAULT 0,
    target_value DECIMAL(15,2) DEFAULT 0,
    achievement_pct DECIMAL(5,2) DEFAULT 0, -- (achievement/target)*100
    shortfall DECIMAL(15,2) DEFAULT 0, -- target - achievement
    rank_vertical INTEGER NOT NULL, -- Rank within business unit
    calculation_date DATE NOT NULL, -- When was this calculated
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- Unique constraint: One ranking per employee per parameter per period per calculation
    UNIQUE(employee_id, parameter_name, period_type, calculation_date)
);

-- Indexes
CREATE INDEX idx_rankings_employee ON rankings(employee_id);
CREATE INDEX idx_rankings_business_unit ON rankings(business_unit);
CREATE INDEX idx_rankings_period ON rankings(period_type);
CREATE INDEX idx_rankings_rank ON rankings(rank_vertical);
CREATE INDEX idx_rankings_date ON rankings(calculation_date);
```

**Note:** No `rank_org` column since rankings are vertical-specific only.

---

### Table: contest_config

**Purpose:** Store contest configuration

```sql
CREATE TABLE contest_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contest_name TEXT NOT NULL,
    contest_period_start DATE NOT NULL,
    contest_period_end DATE NOT NULL,
    is_active BOOLEAN DEFAULT FALSE,
    ranking_parameter TEXT DEFAULT 'net_sales', -- 'net_sales', 'aum', 'revenue'
    business_units TEXT[] DEFAULT ARRAY['B2B', 'B2C', 'PW'], -- Which verticals participate
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID REFERENCES employees(id)
);

-- Indexes
CREATE INDEX idx_contest_config_active ON contest_config(is_active);
CREATE INDEX idx_contest_config_dates ON contest_config(contest_period_start, contest_period_end);
```

**Default Contest (Q4 FY26):**
```sql
INSERT INTO contest_config (contest_name, contest_period_start, contest_period_end, is_active, ranking_parameter)
VALUES ('Q4 FY26 Contest', '2026-01-01', '2026-03-31', TRUE, 'net_sales');
```

---

### Table: activity_logs

**Purpose:** Audit trail of all user actions

```sql
CREATE TABLE activity_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    employee_id UUID REFERENCES employees(id) ON DELETE SET NULL,
    action_type TEXT NOT NULL, -- 'login', 'view_dashboard', 'upload_data', 'change_password', etc.
    action_details JSONB, -- Flexible JSON for action-specific data
    ip_address TEXT,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_activity_logs_user ON activity_logs(user_id);
CREATE INDEX idx_activity_logs_employee ON activity_logs(employee_id);
CREATE INDEX idx_activity_logs_action ON activity_logs(action_type);
CREATE INDEX idx_activity_logs_created ON activity_logs(created_at DESC);

-- Partial index for recent logs (last 3 months)
CREATE INDEX idx_activity_logs_recent ON activity_logs(created_at DESC)
    WHERE created_at > NOW() - INTERVAL '3 months';
```

**Sample Actions:**
```sql
-- Login
INSERT INTO activity_logs (user_id, action_type, action_details, ip_address)
VALUES ('user-uuid', 'login', '{"success": true}', '192.168.1.1');

-- File upload
INSERT INTO activity_logs (user_id, action_type, action_details)
VALUES ('user-uuid', 'upload_data', '{"file_type": "net_sales", "records": 3257, "status": "success"}');
```

---

## SQL Migration Scripts

### Migration 001: Initial Schema

```sql
-- Migration: 001_initial_schema.sql
-- Description: Create all core tables
-- Date: 2026-02-09

BEGIN;

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create employees table
CREATE TABLE employees (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_number TEXT UNIQUE NOT NULL,
    full_name TEXT NOT NULL,
    work_email TEXT UNIQUE NOT NULL,
    gender TEXT,
    mobile_phone TEXT,
    location TEXT,
    business_unit TEXT NOT NULL,
    department TEXT,
    sub_department TEXT,
    job_title TEXT,
    secondary_job_title TEXT,
    reporting_manager_emp_number TEXT,
    date_joined DATE,
    employment_status TEXT DEFAULT 'Working',
    exit_date DATE,
    is_placeholder BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create users table
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id UUID UNIQUE REFERENCES employees(id) ON DELETE CASCADE,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    is_first_login BOOLEAN DEFAULT TRUE,
    last_login TIMESTAMP WITH TIME ZONE,
    role TEXT DEFAULT 'rm',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT email_domain_check CHECK (email LIKE '%@fundsindia.com')
);

-- Create reporting_history table
CREATE TABLE reporting_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id UUID REFERENCES employees(id) ON DELETE CASCADE,
    reporting_manager_emp_number TEXT NOT NULL,
    effective_from DATE NOT NULL,
    effective_to DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create sales_data table
CREATE TABLE sales_data (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_email TEXT,
    employee_name TEXT,
    employee_id UUID REFERENCES employees(id) ON DELETE SET NULL,
    business_unit TEXT DEFAULT 'B2B',
    arn TEXT,
    partner_name TEXT,
    rm_name TEXT,
    bm_name TEXT,
    rgm_name TEXT,
    zm_name TEXT,
    mf_sif_msci DECIMAL(15,2) DEFAULT 0,
    cob_100 DECIMAL(15,2) DEFAULT 0,
    cob_50 DECIMAL(15,2) DEFAULT 0,
    aif_pms_las_trail DECIMAL(15,2) DEFAULT 0,
    mf_total_cob_100 DECIMAL(15,2) DEFAULT 0,
    mf_total_cob_50 DECIMAL(15,2) DEFAULT 0,
    alternate DECIMAL(15,2) DEFAULT 0,
    alt_total DECIMAL(15,2) DEFAULT 0,
    total_net_sales_cob_100 DECIMAL(15,2) DEFAULT 0,
    total_net_sales_cob_50 DECIMAL(15,2) DEFAULT 0,
    branch TEXT,
    zone TEXT,
    data_date DATE NOT NULL,
    data_period TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(employee_email, data_period, data_date)
);

-- Create advisory_data table
CREATE TABLE advisory_data (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team TEXT,
    advisor_email TEXT NOT NULL,
    employee_id UUID REFERENCES employees(id) ON DELETE SET NULL,
    assigned_leads INTEGER DEFAULT 0,
    total_sip_book DECIMAL(15,2) DEFAULT 0,
    assigned_aum DECIMAL(15,2) DEFAULT 0,
    ytd_net_aum_growth_pct DECIMAL(5,2) DEFAULT 0,
    net_inflow_mtd DECIMAL(15,2) DEFAULT 0,
    net_inflow_ytd DECIMAL(15,2) DEFAULT 0,
    gross_lumpsum_inflow_mtd DECIMAL(15,2) DEFAULT 0,
    gross_lumpsum_inflow_ytd DECIMAL(15,2) DEFAULT 0,
    total_sip_inflow_mtd DECIMAL(15,2) DEFAULT 0,
    total_sip_inflow_ytd DECIMAL(15,2) DEFAULT 0,
    new_sip_inflow_mtd DECIMAL(15,2) DEFAULT 0,
    new_sip_inflow_ytd DECIMAL(15,2) DEFAULT 0,
    total_outflow_mtd DECIMAL(15,2) DEFAULT 0,
    total_outflow_ytd DECIMAL(15,2) DEFAULT 0,
    current_aum_mtm DECIMAL(15,2) DEFAULT 0,
    aum_growth_mtm_pct DECIMAL(5,2) DEFAULT 0,
    msci_inflow_mtd DECIMAL(15,2) DEFAULT 0,
    msci_inflow_ytd DECIMAL(15,2) DEFAULT 0,
    fd_inflow_mtd DECIMAL(15,2) DEFAULT 0,
    fd_inflow_ytd DECIMAL(15,2) DEFAULT 0,
    data_date DATE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(advisor_email, data_date)
);

-- Create targets table
CREATE TABLE targets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id UUID REFERENCES employees(id) ON DELETE CASCADE,
    business_unit TEXT NOT NULL,
    parameter_name TEXT NOT NULL,
    target_type TEXT NOT NULL,
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    target_value DECIMAL(15,2) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID REFERENCES employees(id),
    UNIQUE(employee_id, parameter_name, target_type, period_start)
);

-- Create rankings table
CREATE TABLE rankings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id UUID REFERENCES employees(id) ON DELETE CASCADE,
    business_unit TEXT NOT NULL,
    parameter_name TEXT NOT NULL,
    period_type TEXT NOT NULL,
    achievement_value DECIMAL(15,2) DEFAULT 0,
    target_value DECIMAL(15,2) DEFAULT 0,
    achievement_pct DECIMAL(5,2) DEFAULT 0,
    shortfall DECIMAL(15,2) DEFAULT 0,
    rank_vertical INTEGER NOT NULL,
    calculation_date DATE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(employee_id, parameter_name, period_type, calculation_date)
);

-- Create contest_config table
CREATE TABLE contest_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contest_name TEXT NOT NULL,
    contest_period_start DATE NOT NULL,
    contest_period_end DATE NOT NULL,
    is_active BOOLEAN DEFAULT FALSE,
    ranking_parameter TEXT DEFAULT 'net_sales',
    business_units TEXT[] DEFAULT ARRAY['B2B', 'B2C', 'PW'],
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID REFERENCES employees(id)
);

-- Create activity_logs table
CREATE TABLE activity_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    employee_id UUID REFERENCES employees(id) ON DELETE SET NULL,
    action_type TEXT NOT NULL,
    action_details JSONB,
    ip_address TEXT,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

COMMIT;
```

### Migration 002: Create Indexes

```sql
-- Migration: 002_create_indexes.sql
-- Description: Create all performance indexes
-- Date: 2026-02-09

BEGIN;

-- Employees indexes
CREATE INDEX idx_employees_email ON employees(work_email);
CREATE INDEX idx_employees_emp_number ON employees(employee_number);
CREATE INDEX idx_employees_business_unit ON employees(business_unit);
CREATE INDEX idx_employees_status ON employees(employment_status);
CREATE INDEX idx_employees_manager ON employees(reporting_manager_emp_number);

-- Users indexes
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_employee_id ON users(employee_id);
CREATE INDEX idx_users_role ON users(role);

-- Reporting history indexes
CREATE INDEX idx_reporting_history_employee ON reporting_history(employee_id);
CREATE INDEX idx_reporting_history_dates ON reporting_history(effective_from, effective_to);

-- Sales data indexes
CREATE INDEX idx_sales_data_email ON sales_data(employee_email);
CREATE INDEX idx_sales_data_employee_id ON sales_data(employee_id);
CREATE INDEX idx_sales_data_period ON sales_data(data_period);
CREATE INDEX idx_sales_data_date ON sales_data(data_date);
CREATE INDEX idx_sales_data_business_unit ON sales_data(business_unit);
CREATE INDEX idx_sales_data_rm ON sales_data(rm_name);

-- Advisory data indexes
CREATE INDEX idx_advisory_data_email ON advisory_data(advisor_email);
CREATE INDEX idx_advisory_data_employee_id ON advisory_data(employee_id);
CREATE INDEX idx_advisory_data_date ON advisory_data(data_date);
CREATE INDEX idx_advisory_data_team ON advisory_data(team);

-- Targets indexes
CREATE INDEX idx_targets_employee ON targets(employee_id);
CREATE INDEX idx_targets_parameter ON targets(parameter_name);
CREATE INDEX idx_targets_type ON targets(target_type);
CREATE INDEX idx_targets_dates ON targets(period_start, period_end);
CREATE INDEX idx_targets_business_unit ON targets(business_unit);

-- Rankings indexes
CREATE INDEX idx_rankings_employee ON rankings(employee_id);
CREATE INDEX idx_rankings_business_unit ON rankings(business_unit);
CREATE INDEX idx_rankings_period ON rankings(period_type);
CREATE INDEX idx_rankings_rank ON rankings(rank_vertical);
CREATE INDEX idx_rankings_date ON rankings(calculation_date);

-- Contest config indexes
CREATE INDEX idx_contest_config_active ON contest_config(is_active);
CREATE INDEX idx_contest_config_dates ON contest_config(contest_period_start, contest_period_end);

-- Activity logs indexes
CREATE INDEX idx_activity_logs_user ON activity_logs(user_id);
CREATE INDEX idx_activity_logs_employee ON activity_logs(employee_id);
CREATE INDEX idx_activity_logs_action ON activity_logs(action_type);
CREATE INDEX idx_activity_logs_created ON activity_logs(created_at DESC);
CREATE INDEX idx_activity_logs_recent ON activity_logs(created_at DESC)
    WHERE created_at > NOW() - INTERVAL '3 months';

COMMIT;
```

---

## Row Level Security Policies

### Enable RLS on all tables

```sql
-- Enable RLS
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE advisory_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE rankings ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE contest_config ENABLE ROW LEVEL SECURITY;
```

### RLS Policies

```sql
-- Policy: Admins can see everything
CREATE POLICY admin_all_access ON employees
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM users u
            JOIN employees e ON u.employee_id = e.id
            WHERE u.id = auth.uid()
            AND u.role = 'admin'
        )
    );

-- Policy: Users can see their own employee record + downstream reportees
CREATE POLICY employee_hierarchy_access ON employees
    FOR SELECT
    USING (
        id = (SELECT employee_id FROM users WHERE id = auth.uid())
        OR
        employee_number IN (
            -- Recursive: get all downstream reportees
            WITH RECURSIVE hierarchy AS (
                SELECT e.employee_number
                FROM employees e
                JOIN users u ON e.id = u.employee_id
                WHERE u.id = auth.uid()

                UNION

                SELECT e.employee_number
                FROM employees e
                JOIN hierarchy h ON e.reporting_manager_emp_number = h.employee_number
            )
            SELECT employee_number FROM hierarchy
        )
    );

-- Policy: Sales data visible based on employee hierarchy
CREATE POLICY sales_data_hierarchy_access ON sales_data
    FOR SELECT
    USING (
        employee_id IN (
            WITH RECURSIVE hierarchy AS (
                SELECT e.id
                FROM employees e
                JOIN users u ON e.id = u.employee_id
                WHERE u.id = auth.uid()

                UNION

                SELECT e.id
                FROM employees e
                JOIN hierarchy h ON e.reporting_manager_emp_number = (
                    SELECT employee_number FROM employees WHERE id = h.id
                )
            )
            SELECT id FROM hierarchy
        )
        OR
        EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'group_ceo'))
    );

-- Policy: CEOs can see their vertical only
CREATE POLICY ceo_vertical_access ON sales_data
    FOR SELECT
    USING (
        business_unit = (
            SELECT e.business_unit
            FROM users u
            JOIN employees e ON u.employee_id = e.id
            WHERE u.id = auth.uid() AND u.role = 'ceo'
        )
        OR
        EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'group_ceo'))
    );

-- Similar policies for other tables...
```

---

## Database Functions

### Function 1: get_employee_hierarchy

**Purpose:** Get all downstream reportees recursively

```sql
CREATE OR REPLACE FUNCTION get_employee_hierarchy(emp_id UUID)
RETURNS TABLE (
    employee_id UUID,
    employee_number TEXT,
    full_name TEXT,
    job_title TEXT,
    level INTEGER,
    parent_id UUID
) AS $$
BEGIN
    RETURN QUERY
    WITH RECURSIVE hierarchy AS (
        -- Base case: the employee themselves
        SELECT
            e.id,
            e.employee_number,
            e.full_name,
            e.job_title,
            0 AS level,
            NULL::UUID AS parent_id
        FROM employees e
        WHERE e.id = emp_id

        UNION ALL

        -- Recursive case: direct reports
        SELECT
            e.id,
            e.employee_number,
            e.full_name,
            e.job_title,
            h.level + 1,
            h.employee_id
        FROM employees e
        JOIN hierarchy h ON e.reporting_manager_emp_number = (
            SELECT employee_number FROM employees WHERE id = h.employee_id
        )
    )
    SELECT * FROM hierarchy ORDER BY level, full_name;
END;
$$ LANGUAGE plpgsql;
```

**Usage:**
```sql
SELECT * FROM get_employee_hierarchy('uuid-of-manager');
```

---

### Function 2: calculate_rankings

**Purpose:** Calculate rankings for a given period and business unit

```sql
CREATE OR REPLACE FUNCTION calculate_rankings(
    p_period_type TEXT,
    p_business_unit TEXT DEFAULT NULL
)
RETURNS INTEGER AS $$
DECLARE
    records_processed INTEGER := 0;
BEGIN
    -- Delete existing rankings for this period/business unit/date
    DELETE FROM rankings
    WHERE period_type = p_period_type
    AND calculation_date = CURRENT_DATE
    AND (p_business_unit IS NULL OR business_unit = p_business_unit);

    -- Calculate and insert new rankings
    INSERT INTO rankings (
        employee_id,
        business_unit,
        parameter_name,
        period_type,
        achievement_value,
        target_value,
        achievement_pct,
        shortfall,
        rank_vertical,
        calculation_date
    )
    SELECT
        e.id AS employee_id,
        e.business_unit,
        'net_sales' AS parameter_name,
        p_period_type AS period_type,
        COALESCE(SUM(sd.total_net_sales_cob_100), 0) AS achievement_value,
        COALESCE(t.target_value, 0) AS target_value,
        CASE
            WHEN COALESCE(t.target_value, 0) > 0
            THEN (COALESCE(SUM(sd.total_net_sales_cob_100), 0) / t.target_value) * 100
            ELSE 0
        END AS achievement_pct,
        COALESCE(t.target_value, 0) - COALESCE(SUM(sd.total_net_sales_cob_100), 0) AS shortfall,
        ROW_NUMBER() OVER (
            PARTITION BY e.business_unit
            ORDER BY COALESCE(SUM(sd.total_net_sales_cob_100), 0) DESC
        ) AS rank_vertical,
        CURRENT_DATE AS calculation_date
    FROM employees e
    LEFT JOIN sales_data sd ON e.id = sd.employee_id AND sd.data_period = p_period_type
    LEFT JOIN targets t ON e.id = t.employee_id
        AND t.parameter_name = 'net_sales'
        AND t.target_type = LOWER(p_period_type) || 'ly'
    WHERE e.employment_status = 'Working'
    AND (p_business_unit IS NULL OR e.business_unit = p_business_unit)
    GROUP BY e.id, e.business_unit, t.target_value;

    GET DIAGNOSTICS records_processed = ROW_COUNT;
    RETURN records_processed;
END;
$$ LANGUAGE plpgsql;
```

**Usage:**
```sql
-- Calculate MTD rankings for all business units
SELECT calculate_rankings('MTD');

-- Calculate QTD rankings for B2B only
SELECT calculate_rankings('QTD', 'B2B');
```

---

### Function 3: get_team_aggregate

**Purpose:** Get aggregated team performance (manager + all reportees)

```sql
CREATE OR REPLACE FUNCTION get_team_aggregate(
    emp_id UUID,
    p_period_type TEXT
)
RETURNS TABLE (
    total_net_sales DECIMAL,
    manager_contribution DECIMAL,
    team_contribution DECIMAL,
    num_team_members INTEGER
) AS $$
BEGIN
    RETURN QUERY
    WITH team_members AS (
        SELECT employee_id FROM get_employee_hierarchy(emp_id)
    ),
    manager_sales AS (
        SELECT COALESCE(SUM(total_net_sales_cob_100), 0) AS sales
        FROM sales_data
        WHERE employee_id = emp_id
        AND data_period = p_period_type
    ),
    team_sales AS (
        SELECT COALESCE(SUM(sd.total_net_sales_cob_100), 0) AS sales
        FROM sales_data sd
        JOIN team_members tm ON sd.employee_id = tm.employee_id
        WHERE sd.employee_id != emp_id
        AND sd.data_period = p_period_type
    )
    SELECT
        (SELECT sales FROM manager_sales) + (SELECT sales FROM team_sales) AS total_net_sales,
        (SELECT sales FROM manager_sales) AS manager_contribution,
        (SELECT sales FROM team_sales) AS team_contribution,
        (SELECT COUNT(*) - 1 FROM team_members)::INTEGER AS num_team_members;
END;
$$ LANGUAGE plpgsql;
```

**Usage:**
```sql
SELECT * FROM get_team_aggregate('manager-uuid', 'QTD');
```

---

### Function 4: upsert_sales_data

**Purpose:** Bulk upsert sales data (replace existing for period)

```sql
CREATE OR REPLACE FUNCTION upsert_sales_data(
    data JSONB,
    p_period_type TEXT
)
RETURNS JSONB AS $$
DECLARE
    record JSONB;
    inserted_count INTEGER := 0;
    updated_count INTEGER := 0;
    placeholder_count INTEGER := 0;
    result JSONB;
BEGIN
    FOR record IN SELECT * FROM jsonb_array_elements(data)
    LOOP
        -- Check if employee exists, create placeholder if not
        IF NOT EXISTS (SELECT 1 FROM employees WHERE work_email = record->>'employee_email') THEN
            INSERT INTO employees (
                employee_number,
                full_name,
                work_email,
                business_unit,
                is_placeholder
            ) VALUES (
                'PH-' || SUBSTRING(MD5(record->>'employee_email'), 1, 8),
                record->>'employee_name',
                record->>'employee_email',
                COALESCE(record->>'business_unit', 'B2B'),
                TRUE
            );
            placeholder_count := placeholder_count + 1;
        END IF;

        -- Upsert sales data
        INSERT INTO sales_data (
            employee_email,
            employee_name,
            employee_id,
            business_unit,
            -- ... all other fields from JSONB record
            total_net_sales_cob_100,
            data_period,
            data_date
        ) VALUES (
            record->>'employee_email',
            record->>'employee_name',
            (SELECT id FROM employees WHERE work_email = record->>'employee_email'),
            COALESCE(record->>'business_unit', 'B2B'),
            (record->>'total_net_sales_cob_100')::DECIMAL,
            p_period_type,
            CURRENT_DATE
        )
        ON CONFLICT (employee_email, data_period, data_date)
        DO UPDATE SET
            total_net_sales_cob_100 = EXCLUDED.total_net_sales_cob_100,
            updated_at = NOW();

        IF FOUND THEN
            updated_count := updated_count + 1;
        ELSE
            inserted_count := inserted_count + 1;
        END IF;
    END LOOP;

    result := jsonb_build_object(
        'success', true,
        'inserted', inserted_count,
        'updated', updated_count,
        'placeholders_created', placeholder_count
    );

    RETURN result;
END;
$$ LANGUAGE plpgsql;
```

---

## Sample Queries

### Query 1: Get employee with their reportees count

```sql
SELECT
    e.employee_number,
    e.full_name,
    e.job_title,
    e.business_unit,
    COUNT(reportees.id) AS direct_reportees_count
FROM employees e
LEFT JOIN employees reportees ON reportees.reporting_manager_emp_number = e.employee_number
WHERE e.employment_status = 'Working'
GROUP BY e.id, e.employee_number, e.full_name, e.job_title, e.business_unit
ORDER BY direct_reportees_count DESC;
```

### Query 2: Get current rankings for B2B

```sql
SELECT
    r.rank_vertical,
    e.full_name,
    e.job_title,
    r.achievement_value,
    r.target_value,
    r.achievement_pct,
    r.shortfall
FROM rankings r
JOIN employees e ON r.employee_id = e.id
WHERE r.business_unit = 'B2B'
AND r.period_type = 'MTD'
AND r.calculation_date = CURRENT_DATE
ORDER BY r.rank_vertical;
```

### Query 3: Get user's accessible activity logs (hierarchy-aware)

```sql
WITH accessible_employees AS (
    SELECT employee_id FROM get_employee_hierarchy(
        (SELECT employee_id FROM users WHERE email = 'user@fundsindia.com')
    )
)
SELECT
    al.created_at,
    e.full_name,
    al.action_type,
    al.action_details
FROM activity_logs al
JOIN accessible_employees ae ON al.employee_id = ae.employee_id
JOIN employees e ON al.employee_id = e.id
ORDER BY al.created_at DESC
LIMIT 100;
```

---

## Data Retention

### Retention Policies

1. **Employees:** Retain indefinitely (archive on exit)
2. **Sales/Advisory Data:** Retain current FY + 2 previous FYs
3. **Rankings:** Retain current FY only (recalculate for historical)
4. **Activity Logs:** Retain 1 year, archive older
5. **Targets:** Retain current FY + 2 previous FYs

### Archive Script (Run annually)

```sql
-- Archive old activity logs (older than 1 year)
DELETE FROM activity_logs
WHERE created_at < NOW() - INTERVAL '1 year';

-- Archive old rankings (older than 1 FY)
DELETE FROM rankings
WHERE calculation_date < '2025-04-01'; -- Start of previous FY
```

---

**End of Database Context Document**
