-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: query_database tool support
--
-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor → New query)
--
-- Steps:
--   1. Add can_query_database + query_db_config columns to agent_access
--   2. Create agent_readonly role with SELECT-only on data tables (DB-level safety)
--   3. Create agent_execute_query() RPC function owned by agent_readonly
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Step 1: Extend agent_access table ────────────────────────────────────────

ALTER TABLE agent_access
  ADD COLUMN IF NOT EXISTS can_query_database   BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS query_db_config      JSONB   NOT NULL DEFAULT '{}';

-- query_db_config shape:
-- {
--   "result_limit":     200,          -- max rows per query (default 200, max 1000)
--   "allow_aggregates": true,         -- allow SUM, COUNT, AVG, GROUP BY, HAVING
--   "allow_joins":      false,        -- allow JOIN across tables
--   "blocked_columns":  {             -- columns stripped from results (never shown to agent)
--     "employees": ["mobile_phone", "work_email"],
--     "b2c":       ["advisor"]
--   }
-- }

COMMENT ON COLUMN agent_access.can_query_database IS
  'Enables the query_database tool for this user — lets the agent write custom SQL SELECT queries';

COMMENT ON COLUMN agent_access.query_db_config IS
  'JSON config controlling query_database guardrails: result_limit, allow_aggregates, allow_joins, blocked_columns';


-- ── Step 2: Create agent_readonly role ───────────────────────────────────────
-- This role has SELECT-only on the 5 data tables.
-- The RPC function runs as this role, so even if SQL injection bypasses text checks,
-- Postgres itself blocks any writes or access to agent/auth tables.

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'agent_readonly') THEN
    CREATE ROLE agent_readonly NOLOGIN;
  END IF;
END
$$;

-- Grant SELECT on data tables only — NOT on agent_*, users, auth tables
GRANT SELECT ON b2b_sales_current_month                TO agent_readonly;
GRANT SELECT ON btb_sales_YTD_minus_current_month      TO agent_readonly;
GRANT SELECT ON b2c                                    TO agent_readonly;
GRANT SELECT ON employees                              TO agent_readonly;
GRANT SELECT ON targets                                TO agent_readonly;

-- Explicitly revoke everything on sensitive tables (belt-and-suspenders)
REVOKE ALL ON agent_access        FROM agent_readonly;
REVOKE ALL ON agent_personas      FROM agent_readonly;
REVOKE ALL ON agent_conversations FROM agent_readonly;
REVOKE ALL ON agent_messages      FROM agent_readonly;
REVOKE ALL ON agent_memory        FROM agent_readonly;
REVOKE ALL ON users               FROM agent_readonly;


-- ── Step 3: Create agent_execute_query() RPC function ────────────────────────
-- SECURITY DEFINER so it can switch to agent_readonly context.
-- Initial owner is postgres (superuser), but we immediately ALTER to agent_readonly.
-- This means the function itself runs with agent_readonly privileges — SELECT only.

CREATE OR REPLACE FUNCTION agent_execute_query(query_sql TEXT)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result    json;
  normalized TEXT;
BEGIN
  normalized := TRIM(UPPER(query_sql));

  -- Must start with SELECT
  IF normalized NOT LIKE 'SELECT%' THEN
    RAISE EXCEPTION 'Only SELECT queries are allowed. Got: %', LEFT(normalized, 30);
  END IF;

  -- Block DML/DDL patterns even if somehow smuggled past first check
  IF normalized ~* '\m(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE|GRANT|REVOKE|COPY|EXECUTE|PERFORM|DO)\M' THEN
    RAISE EXCEPTION 'Disallowed SQL keyword detected in query';
  END IF;

  -- Block pg functions that could read/write server files
  IF normalized ~* '(pg_read_file|pg_ls_dir|lo_export|lo_import|copy_file_range)' THEN
    RAISE EXCEPTION 'Disallowed system function detected in query';
  END IF;

  -- Execute and aggregate as JSON
  EXECUTE 'SELECT json_agg(row_to_json(t)) FROM (' || query_sql || ') t'
  INTO result;

  RETURN COALESCE(result, '[]'::json);

EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE EXCEPTION 'Access denied: query references a table or column you are not permitted to access';
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Query error: %', SQLERRM;
END;
$$;

-- Transfer ownership to agent_readonly so SECURITY DEFINER runs as that role
-- (not as postgres/superuser)
ALTER FUNCTION agent_execute_query(TEXT) OWNER TO agent_readonly;

-- Only service_role can call this function (used by supabaseAdmin in Next.js)
REVOKE ALL ON FUNCTION agent_execute_query(TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION agent_execute_query(TEXT) TO service_role;


-- ── Verify ───────────────────────────────────────────────────────────────────
-- After running, verify with:
--   SELECT routine_name, security_type FROM information_schema.routines
--   WHERE routine_name = 'agent_execute_query';
--
--   SELECT column_name, data_type FROM information_schema.columns
--   WHERE table_name = 'agent_access'
--   AND column_name IN ('can_query_database', 'query_db_config');
