-- ─────────────────────────────────────────────────────────────────────────────
-- FIX: Replace agent_execute_query with a simpler version
--
-- Problem: SET LOCAL ROLE agent_readonly inside a SECURITY DEFINER function
-- fails on Supabase because the postgres user cannot SET ROLE to agent_readonly
-- unless it is a member of that role. Supabase managed Postgres does not allow
-- adding postgres to custom roles.
--
-- Solution: Remove SET LOCAL ROLE entirely. Safety is provided by:
--   1. App-layer validation (SELECT-only, blocked internal tables) in tools.ts
--   2. This function's own keyword validation (INSERT/UPDATE/DROP etc.)
--   3. GRANT EXECUTE TO service_role only — not callable from the browser
--
-- Run this in: Supabase Dashboard → SQL Editor → New query
-- ─────────────────────────────────────────────────────────────────────────────

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

  -- Must start with SELECT or WITH (CTEs start with WITH)
  IF normalized NOT LIKE 'SELECT%' AND normalized NOT LIKE 'WITH%' THEN
    RAISE EXCEPTION 'Only SELECT queries are allowed. Got: %', LEFT(normalized, 50);
  END IF;

  -- If it starts with WITH, the first non-CTE statement must be SELECT
  -- (blocks WITH ... DELETE/UPDATE/INSERT ... which is valid SQL but dangerous)
  IF normalized LIKE 'WITH%' THEN
    IF normalized !~ '\)\s*(SELECT|,)\s' AND normalized !~ 'SELECT\s' THEN
      RAISE EXCEPTION 'WITH clause must be followed by SELECT';
    END IF;
  END IF;

  -- Block DML/DDL keywords — word boundary anchors (\m \M) are Postgres-specific
  IF normalized ~* '\m(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE|GRANT|REVOKE|COPY|EXECUTE|PERFORM|DO)\M' THEN
    RAISE EXCEPTION 'Disallowed SQL keyword detected in query';
  END IF;

  -- Block Postgres file/system functions
  IF normalized ~* '(pg_read_file|pg_ls_dir|lo_export|lo_import|copy_file_range|pg_sleep|pg_cancel_backend|pg_terminate_backend)' THEN
    RAISE EXCEPTION 'Disallowed system function detected in query';
  END IF;

  -- Execute query and aggregate rows as JSON array
  EXECUTE 'SELECT json_agg(row_to_json(t)) FROM (' || query_sql || ') t'
  INTO result;

  RETURN COALESCE(result, '[]'::json);

EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE EXCEPTION 'Access denied: query references a table or column not permitted';
  WHEN syntax_error THEN
    RAISE EXCEPTION 'SQL syntax error: %', SQLERRM;
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Query error: %', SQLERRM;
END;
$$;

-- Only service_role can call this (Next.js API route via supabaseAdmin)
-- Never callable from browser (anon/authenticated roles)
REVOKE ALL ON FUNCTION agent_execute_query(TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION agent_execute_query(TEXT) TO service_role;

-- Verify it was created
SELECT routine_name, security_type
FROM information_schema.routines
WHERE routine_name = 'agent_execute_query';
