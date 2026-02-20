-- ─────────────────────────────────────────────────────────────────────────────
-- FIX: Replace agent_execute_query with a minimal, working version
--
-- MUST RUN THIS in Supabase Dashboard → SQL Editor → New query
--
-- Previous version had SET LOCAL ROLE agent_readonly which fails because
-- Supabase's postgres user cannot switch to custom roles.
--
-- This version: validation only + direct execute. Security is enforced by:
--   1. SELECT/WITH-only check
--   2. DML/DDL keyword block
--   3. GRANT EXECUTE only to service_role (not callable from browser)
--   4. App-layer blocked table list in tools.ts
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

  -- Allow SELECT or WITH (CTEs start with WITH)
  IF normalized NOT LIKE 'SELECT%' AND normalized NOT LIKE 'WITH%' THEN
    RAISE EXCEPTION 'Only SELECT queries are allowed';
  END IF;

  -- Block DML/DDL
  IF normalized ~* '\m(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE|GRANT|REVOKE|COPY|PERFORM|DO)\M' THEN
    RAISE EXCEPTION 'Disallowed SQL keyword detected';
  END IF;

  -- Execute and return as JSON array
  EXECUTE 'SELECT COALESCE(json_agg(row_to_json(t)), ''[]''::json) FROM (' || query_sql || ') t'
  INTO result;

  RETURN result;

EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Query error: %', SQLERRM;
END;
$$;

REVOKE ALL ON FUNCTION agent_execute_query(TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION agent_execute_query(TEXT) TO service_role;

-- Quick verification test
SELECT agent_execute_query('SELECT 1 as test');
