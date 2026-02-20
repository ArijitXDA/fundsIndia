-- ─────────────────────────────────────────────────────────────────────────────
-- DATABASE SCHEMA REFERENCE
-- Source of truth for all table/column names used in application code.
-- Update this file whenever migrations are run against the live DB.
--
-- WARNING: This file is for reference only — do NOT run it directly.
--          Table order and FK constraints may not be valid for execution.
--          Use the migrations in supabase/migrations/ to apply changes.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── users ─────────────────────────────────────────────────────────────────────
CREATE TABLE public.users (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  employee_id uuid UNIQUE,                          -- FK → employees(id)
  email text NOT NULL UNIQUE CHECK (email ~~ '%@fundsindia.com'::text),
  password_hash text NOT NULL,
  is_first_login boolean DEFAULT true,
  last_login timestamp with time zone,
  role text DEFAULT 'rm'::text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT users_pkey PRIMARY KEY (id),
  CONSTRAINT users_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id)
);

-- ── employees ─────────────────────────────────────────────────────────────────
CREATE TABLE public.employees (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  employee_number text NOT NULL UNIQUE,
  full_name text NOT NULL,
  work_email text NOT NULL UNIQUE,
  gender text,
  mobile_phone text,
  location text,
  business_unit text NOT NULL,
  department text,
  sub_department text,
  job_title text,
  secondary_job_title text,
  reporting_manager_emp_number text,
  date_joined date,
  employment_status text DEFAULT 'Working'::text,
  exit_date date,
  is_placeholder boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT employees_pkey PRIMARY KEY (id)
);

-- ── admin_roles ───────────────────────────────────────────────────────────────
CREATE TABLE public.admin_roles (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  employee_id text NOT NULL,
  email text NOT NULL UNIQUE,
  tier text NOT NULL CHECK (tier = ANY (ARRAY['dev'::text, 'super'::text, 'co'::text, 'vertical'::text])),
  vertical text CHECK (vertical = ANY (ARRAY['B2B'::text, 'B2C'::text, 'PW'::text])),
  roles ARRAY NOT NULL DEFAULT '{}'::integer[],
  can_impersonate boolean NOT NULL DEFAULT false,
  can_assign_admins boolean NOT NULL DEFAULT false,
  assigned_by text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  is_active boolean NOT NULL DEFAULT true,
  CONSTRAINT admin_roles_pkey PRIMARY KEY (id)
);

-- ── agent_personas ────────────────────────────────────────────────────────────
CREATE TABLE public.agent_personas (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  model text DEFAULT 'gpt-4o'::text,
  temperature numeric DEFAULT 0.7,
  top_p numeric DEFAULT 0.9,
  max_tokens integer DEFAULT 1500,
  presence_penalty numeric DEFAULT 0.0,
  frequency_penalty numeric DEFAULT 0.0,
  agent_name text DEFAULT 'FundsAgent'::text,
  tone text DEFAULT 'professional'::text,
  output_format text DEFAULT 'conversational'::text,
  language text DEFAULT 'en'::text,
  can_proactively_surface_insights boolean DEFAULT true,
  can_make_recommendations boolean DEFAULT true,
  can_do_forecasting boolean DEFAULT false,
  can_suggest_contest_strategy boolean DEFAULT false,
  can_discuss_org_structure boolean DEFAULT false,
  system_prompt_override text,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  is_active boolean DEFAULT true,
  CONSTRAINT agent_personas_pkey PRIMARY KEY (id),
  CONSTRAINT agent_personas_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id)
);

-- ── agent_access ──────────────────────────────────────────────────────────────
-- IMPORTANT: Column names here are the canonical names to use in ALL application code.
-- The override_can_* columns were NOT renamed by any migration — use the exact names below.
CREATE TABLE public.agent_access (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  employee_id uuid UNIQUE,                          -- FK → employees(id)
  persona_id uuid,                                  -- FK → agent_personas(id)
  access_description text NOT NULL,
  no_access_description text NOT NULL,
  allowed_tables text[] DEFAULT '{}'::text[],
  denied_tables text[] DEFAULT '{}'::text[],
  column_filters jsonb DEFAULT '{}'::jsonb,
  row_scope jsonb DEFAULT '{}'::jsonb,
  -- Per-employee capability overrides (null = use persona default)
  override_can_proactively_surface_insights boolean, -- NOTE: full name, NOT override_proactive_insights
  override_can_make_recommendations boolean,         -- NOTE: full name, NOT override_recommendations
  show_widget_on_dashboard boolean DEFAULT true,
  widget_greeting text,
  is_active boolean DEFAULT true,
  granted_by uuid,                                  -- FK → users(id)
  granted_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  -- Added by migration 002_query_database_tool.sql
  can_query_database boolean NOT NULL DEFAULT false,
  query_db_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- query_db_config shape:
  -- {
  --   "result_limit":     200,
  --   "allow_aggregates": true,
  --   "allow_joins":      false,
  --   "blocked_columns":  { "employees": ["mobile_phone"], "b2c": ["advisor"] }
  -- }
  CONSTRAINT agent_access_pkey PRIMARY KEY (id),
  CONSTRAINT agent_access_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id),
  CONSTRAINT agent_access_persona_id_fkey FOREIGN KEY (persona_id) REFERENCES public.agent_personas(id),
  CONSTRAINT agent_access_granted_by_fkey FOREIGN KEY (granted_by) REFERENCES public.users(id)
);

-- ── agent_conversations ───────────────────────────────────────────────────────
CREATE TABLE public.agent_conversations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  employee_id uuid,
  persona_id uuid,
  title text,
  started_at timestamp with time zone DEFAULT now(),
  last_active_at timestamp with time zone DEFAULT now(),
  message_count integer DEFAULT 0,
  is_archived boolean DEFAULT false,
  conversation_summary text,
  CONSTRAINT agent_conversations_pkey PRIMARY KEY (id),
  CONSTRAINT agent_conversations_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id),
  CONSTRAINT agent_conversations_persona_id_fkey FOREIGN KEY (persona_id) REFERENCES public.agent_personas(id)
);

-- ── agent_messages ────────────────────────────────────────────────────────────
CREATE TABLE public.agent_messages (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  conversation_id uuid,
  employee_id uuid,
  role text NOT NULL,
  content text NOT NULL,
  data_sources_used text[],
  tokens_used integer,
  model_used text,
  is_proactive boolean DEFAULT false,
  proactive_trigger text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT agent_messages_pkey PRIMARY KEY (id),
  CONSTRAINT agent_messages_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.agent_conversations(id),
  CONSTRAINT agent_messages_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id)
);

-- ── agent_memory ──────────────────────────────────────────────────────────────
CREATE TABLE public.agent_memory (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  employee_id uuid,
  memory_type text NOT NULL,
  key text NOT NULL,
  value text NOT NULL,
  source text,
  confidence numeric,
  created_at timestamp with time zone DEFAULT now(),
  expires_at timestamp with time zone,
  CONSTRAINT agent_memory_pkey PRIMARY KEY (id),
  CONSTRAINT agent_memory_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id)
);

-- ── Data tables (sales / performance) ────────────────────────────────────────

-- ⚠️ ALL SALES COLUMNS IN THIS TABLE ARE TEXT (stored as uploaded from CSV).
-- Always cast to numeric before math: NULLIF(col, '')::numeric
-- One row per IFA/ARN partner per RM — GROUP BY "RM Emp ID" for RM-level totals.
CREATE TABLE public.b2b_sales_current_month (
  "Arn" text,
  "Partner Name" text,          -- IFA/ARN name, NOT the RM's own name
  "MF+SIF+MSCI" text,           -- CAST TO NUMERIC before SUM/AVG
  "COB (100%)" text,            -- CAST TO NUMERIC before SUM/AVG
  "COB (50%)" text,
  "AIF+PMS+LAS+DYNAMO (TRAIL)" text,  -- CAST TO NUMERIC before SUM/AVG
  "MF Total (COB 100%)" text,
  "MF Total (COB 50%)" text,
  "ALTERNATE" text,             -- CAST TO NUMERIC before SUM/AVG
  "ALT Total" text,
  "Total Net Sales (COB 100%)" text,  -- CAST TO NUMERIC before SUM/AVG
  "Total Net Sales (COB 50%)" text,
  "RM" text,                    -- RM name string (may be unreliable, use employees table)
  "BM" text,
  "Branch" text,
  "Zone" text,
  "RGM" text,
  "ZM" text,
  "RM Emp ID" text              -- W-prefixed RM employee ID, join key
);

CREATE TABLE public.btb_sales_YTD_minus_current_month (
  "Arn" text,
  "Partner Name" text,
  "MF+SIF+MSCI" double precision,
  "SUM of COB (100%)" double precision,
  "COB (50%)" double precision,
  "SUM of AIF+PMS+LAS (TRAIL)" double precision,
  "MF Total (COB 100%)" double precision,
  "MF Total (COB 50%)" double precision,
  "SUM of ALT" text,
  "ALT Total" text,
  "Total Net Sales (COB 100%)" double precision,
  "Total Net Sales (COB 50%)" double precision,
  "RM" text,
  "BM" text,
  "Branch" text,
  "Zone" text,
  "RGM" text,
  "ZM" text,
  "RM Emp ID" text
);

CREATE TABLE public.b2c (
  team text,
  advisor text,
  assigned_leads bigint,
  "total_sip_book_ao_31stmarch[cr.]" double precision,
  "assigned_aum_ao_31stmarch[cr.]" double precision,
  "ytd_net_aum_growth %" double precision,
  "net_inflow_mtd[cr]" double precision,
  "net_inflow_ytd[cr]" double precision,
  "gross_lumpsum_inflow_mtd[cr.]" double precision,
  "gross_lumpsum_inflow_ytd[cr.]" double precision,
  "total_sip_inflow_mtd[cr.]" double precision,
  "total_sip_inflow_ytd[cr.]" double precision,
  "new_sip_inflow_mtd[cr.]" double precision,
  "new_sip_inflow_ytd[cr.]" double precision,
  "total_outflow_mtd[cr.]" double precision,
  "total_outflow_ytd[cr.]" double precision,
  "current_aum_mtm [cr.]" double precision,
  "aum_growth_mtm %" double precision,
  "msci_inflow_mtd[cr.]" text,
  "msci_inflow_ytd[cr.]" text,
  "fd_inflow_mtd[cr.]" text,
  "fd_inflow_ytd[cr.]" double precision
);

CREATE TABLE public.targets (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  employee_id uuid,
  business_unit text NOT NULL,
  parameter_name text NOT NULL,
  target_type text NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  target_value numeric NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  created_by uuid,
  CONSTRAINT targets_pkey PRIMARY KEY (id),
  CONSTRAINT targets_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id),
  CONSTRAINT targets_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.employees(id)
);

-- ── Other tables ──────────────────────────────────────────────────────────────

CREATE TABLE public.activity_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid,
  employee_id uuid,
  action_type text NOT NULL,
  action_details jsonb,
  ip_address text,
  user_agent text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT activity_logs_pkey PRIMARY KEY (id),
  CONSTRAINT activity_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id),
  CONSTRAINT activity_logs_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id)
);

CREATE TABLE public.advisory_data (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  team text,
  advisor_email text NOT NULL,
  employee_id uuid,
  assigned_leads integer DEFAULT 0,
  total_sip_book numeric DEFAULT 0,
  assigned_aum numeric DEFAULT 0,
  ytd_net_aum_growth_pct numeric DEFAULT 0,
  net_inflow_mtd numeric DEFAULT 0,
  net_inflow_ytd numeric DEFAULT 0,
  gross_lumpsum_inflow_mtd numeric DEFAULT 0,
  gross_lumpsum_inflow_ytd numeric DEFAULT 0,
  total_sip_inflow_mtd numeric DEFAULT 0,
  total_sip_inflow_ytd numeric DEFAULT 0,
  new_sip_inflow_mtd numeric DEFAULT 0,
  new_sip_inflow_ytd numeric DEFAULT 0,
  total_outflow_mtd numeric DEFAULT 0,
  total_outflow_ytd numeric DEFAULT 0,
  current_aum_mtm numeric DEFAULT 0,
  aum_growth_mtm_pct numeric DEFAULT 0,
  msci_inflow_mtd numeric DEFAULT 0,
  msci_inflow_ytd numeric DEFAULT 0,
  fd_inflow_mtd numeric DEFAULT 0,
  fd_inflow_ytd numeric DEFAULT 0,
  data_date date NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT advisory_data_pkey PRIMARY KEY (id),
  CONSTRAINT advisory_data_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id)
);

CREATE TABLE public.contest_config (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  contest_name text NOT NULL,
  contest_period_start date NOT NULL,
  contest_period_end date NOT NULL,
  is_active boolean DEFAULT false,
  ranking_parameter text DEFAULT 'net_sales'::text,
  business_units text[] DEFAULT ARRAY['B2B'::text, 'B2C'::text, 'PW'::text],
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  created_by uuid,
  CONSTRAINT contest_config_pkey PRIMARY KEY (id),
  CONSTRAINT contest_config_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.employees(id)
);

CREATE TABLE public.rankings (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  employee_id uuid,
  business_unit text NOT NULL,
  parameter_name text NOT NULL,
  period_type text NOT NULL,
  achievement_value numeric DEFAULT 0,
  target_value numeric DEFAULT 0,
  achievement_pct numeric DEFAULT 0,
  shortfall numeric DEFAULT 0,
  rank_vertical integer NOT NULL,
  calculation_date date NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT rankings_pkey PRIMARY KEY (id),
  CONSTRAINT rankings_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id)
);

CREATE TABLE public.reporting_history (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  employee_id uuid,
  reporting_manager_emp_number text NOT NULL,
  effective_from date NOT NULL,
  effective_to date,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT reporting_history_pkey PRIMARY KEY (id),
  CONSTRAINT reporting_history_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id)
);

CREATE TABLE public.sales_data (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  employee_email text,
  employee_name text,
  employee_id uuid,
  business_unit text DEFAULT 'B2B'::text,
  arn text,
  partner_name text,
  rm_name text,
  bm_name text,
  rgm_name text,
  zm_name text,
  mf_sif_msci numeric DEFAULT 0,
  cob_100 numeric DEFAULT 0,
  cob_50 numeric DEFAULT 0,
  aif_pms_las_trail numeric DEFAULT 0,
  mf_total_cob_100 numeric DEFAULT 0,
  mf_total_cob_50 numeric DEFAULT 0,
  alternate numeric DEFAULT 0,
  alt_total numeric DEFAULT 0,
  total_net_sales_cob_100 numeric DEFAULT 0,
  total_net_sales_cob_50 numeric DEFAULT 0,
  branch text,
  zone text,
  data_date date NOT NULL,
  data_period text NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT sales_data_pkey PRIMARY KEY (id),
  CONSTRAINT sales_data_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id)
);

-- ── RPC Functions ─────────────────────────────────────────────────────────────
-- agent_execute_query(query_sql TEXT) RETURNS json
--   Added by migration 002_query_database_tool.sql
--   SECURITY DEFINER, switches to agent_readonly role at runtime
--   Only callable by service_role

-- ── Roles ─────────────────────────────────────────────────────────────────────
-- agent_readonly: NOLOGIN role with SELECT on b2b_sales_current_month,
--   btb_sales_YTD_minus_current_month, b2c, employees, targets
--   NO access to agent_*, users, auth tables
