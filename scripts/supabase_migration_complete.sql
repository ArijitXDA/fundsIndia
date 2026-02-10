-- ============================================================================
-- FundsIndia RNR Dashboard - Complete Database Migration
-- Version: 1.0.0
-- Date: 2026-02-09
-- Description: Creates all tables, indexes, RLS policies, and functions
-- ============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- SECTION 1: DROP EXISTING TABLES (if re-running)
-- ============================================================================

DROP TABLE IF EXISTS activity_logs CASCADE;
DROP TABLE IF EXISTS rankings CASCADE;
DROP TABLE IF EXISTS contest_config CASCADE;
DROP TABLE IF EXISTS advisory_data CASCADE;
DROP TABLE IF EXISTS sales_data CASCADE;
DROP TABLE IF EXISTS targets CASCADE;
DROP TABLE IF EXISTS reporting_history CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS employees CASCADE;

-- ============================================================================
-- SECTION 2: CREATE TABLES
-- ============================================================================

-- Table: employees
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

-- Table: users
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

-- Table: reporting_history
CREATE TABLE reporting_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id UUID REFERENCES employees(id) ON DELETE CASCADE,
    reporting_manager_emp_number TEXT NOT NULL,
    effective_from DATE NOT NULL,
    effective_to DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Table: sales_data
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

-- Table: advisory_data
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

-- Table: targets
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

-- Table: rankings
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

-- Table: contest_config
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

-- Table: activity_logs
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

-- ============================================================================
-- SECTION 3: CREATE INDEXES
-- ============================================================================

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
-- Note: Removed partial index with NOW() as it requires immutable function

-- ============================================================================
-- SECTION 4: CREATE DATABASE FUNCTIONS
-- ============================================================================

-- Function 1: get_employee_hierarchy
CREATE OR REPLACE FUNCTION get_employee_hierarchy(emp_id UUID)
RETURNS TABLE (
    employee_id UUID,
    employee_number TEXT,
    full_name TEXT,
    job_title TEXT,
    business_unit TEXT,
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
            e.business_unit,
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
            e.business_unit,
            h.level + 1,
            h.employee_id
        FROM employees e
        JOIN hierarchy h ON e.reporting_manager_emp_number = (
            SELECT employee_number FROM employees WHERE id = h.employee_id
        )
        WHERE e.employment_status = 'Working'
    )
    SELECT * FROM hierarchy ORDER BY level, full_name;
END;
$$ LANGUAGE plpgsql;

-- Function 2: calculate_rankings
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
            ORDER BY
                COALESCE(SUM(sd.total_net_sales_cob_100), 0) DESC,
                CASE
                    WHEN COALESCE(t.target_value, 0) > 0
                    THEN (COALESCE(SUM(sd.total_net_sales_cob_100), 0) / t.target_value) * 100
                    ELSE 0
                END DESC,
                e.employee_number ASC
        ) AS rank_vertical,
        CURRENT_DATE AS calculation_date
    FROM employees e
    LEFT JOIN sales_data sd ON e.id = sd.employee_id AND sd.data_period = p_period_type
    LEFT JOIN targets t ON e.id = t.employee_id
        AND t.parameter_name = 'net_sales'
        AND t.target_type = LOWER(p_period_type)
    WHERE e.employment_status = 'Working'
    AND (p_business_unit IS NULL OR e.business_unit = p_business_unit)
    GROUP BY e.id, e.business_unit, e.employee_number, t.target_value;

    GET DIAGNOSTICS records_processed = ROW_COUNT;
    RETURN records_processed;
END;
$$ LANGUAGE plpgsql;

-- Function 3: get_team_aggregate
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

-- ============================================================================
-- SECTION 5: INSERT DEFAULT DATA
-- ============================================================================

-- Insert default contest configuration
INSERT INTO contest_config (
    contest_name,
    contest_period_start,
    contest_period_end,
    is_active,
    ranking_parameter,
    business_units
) VALUES (
    'Q4 FY26 Contest',
    '2026-01-01',
    '2026-03-31',
    TRUE,
    'net_sales',
    ARRAY['B2B', 'B2C', 'PW']
);

-- ============================================================================
-- SECTION 6: ENABLE ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE advisory_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE rankings ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE contest_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE reporting_history ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- SECTION 7: CREATE RLS POLICIES
-- ============================================================================

-- Policy: Service role has full access (for backend operations)
CREATE POLICY service_role_all_access ON employees
    FOR ALL
    USING (auth.jwt() ->> 'role' = 'service_role')
    WITH CHECK (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY service_role_all_access ON users
    FOR ALL
    USING (auth.jwt() ->> 'role' = 'service_role')
    WITH CHECK (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY service_role_all_access ON sales_data
    FOR ALL
    USING (auth.jwt() ->> 'role' = 'service_role')
    WITH CHECK (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY service_role_all_access ON advisory_data
    FOR ALL
    USING (auth.jwt() ->> 'role' = 'service_role')
    WITH CHECK (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY service_role_all_access ON targets
    FOR ALL
    USING (auth.jwt() ->> 'role' = 'service_role')
    WITH CHECK (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY service_role_all_access ON rankings
    FOR ALL
    USING (auth.jwt() ->> 'role' = 'service_role')
    WITH CHECK (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY service_role_all_access ON activity_logs
    FOR ALL
    USING (auth.jwt() ->> 'role' = 'service_role')
    WITH CHECK (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY service_role_all_access ON contest_config
    FOR ALL
    USING (auth.jwt() ->> 'role' = 'service_role')
    WITH CHECK (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY service_role_all_access ON reporting_history
    FOR ALL
    USING (auth.jwt() ->> 'role' = 'service_role')
    WITH CHECK (auth.jwt() ->> 'role' = 'service_role');

-- Note: Additional user-specific RLS policies will be added in Next.js application
-- using Supabase middleware and API routes for fine-grained access control

-- ============================================================================
-- SECTION 8: CREATE TRIGGERS FOR updated_at
-- ============================================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for employees
CREATE TRIGGER update_employees_updated_at
    BEFORE UPDATE ON employees
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Trigger for users
CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Trigger for sales_data
CREATE TRIGGER update_sales_data_updated_at
    BEFORE UPDATE ON sales_data
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Trigger for targets
CREATE TRIGGER update_targets_updated_at
    BEFORE UPDATE ON targets
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Trigger for contest_config
CREATE TRIGGER update_contest_config_updated_at
    BEFORE UPDATE ON contest_config
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================

-- Verify tables created
SELECT
    table_name,
    (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = t.table_name) as column_count
FROM information_schema.tables t
WHERE table_schema = 'public'
AND table_type = 'BASE TABLE'
ORDER BY table_name;

-- Success message
DO $$
BEGIN
    RAISE NOTICE '✅ Database migration completed successfully!';
    RAISE NOTICE '✅ All tables, indexes, functions, and policies created.';
    RAISE NOTICE '✅ Default contest configuration inserted.';
    RAISE NOTICE '✅ Row Level Security enabled on all tables.';
    RAISE NOTICE '';
    RAISE NOTICE '📋 Next steps:';
    RAISE NOTICE '1. Upload employee data using the admin panel';
    RAISE NOTICE '2. Upload sales data files';
    RAISE NOTICE '3. Create user accounts for employees';
END $$;
