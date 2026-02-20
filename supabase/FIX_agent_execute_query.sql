-- ─────────────────────────────────────────────────────────────────────────────
-- RUN THIS IN: Supabase Dashboard → SQL Editor → New query → Run
--
-- Replaces the broken agent_execute_query function.
-- The old version had SET LOCAL ROLE which fails on Supabase,
-- and also blocked WITH clauses and whitespace-prefixed queries.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION agent_execute_query(query_sql TEXT)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result    json;
  trimmed   TEXT;
BEGIN
  -- Trim whitespace/newlines before checking
  trimmed := TRIM(query_sql);

  -- Allow SELECT and WITH (CTEs)
  IF UPPER(LEFT(trimmed, 6)) NOT IN ('SELECT', 'WITH  ') AND UPPER(LEFT(trimmed, 4)) != 'WITH' THEN
    RAISE EXCEPTION 'Only SELECT queries are allowed. Query starts with: %', LEFT(trimmed, 20);
  END IF;

  -- Block DML/DDL (word boundaries)
  IF UPPER(trimmed) ~* '\m(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE|GRANT|REVOKE|COPY|PERFORM|DO)\M' THEN
    RAISE EXCEPTION 'Disallowed SQL keyword detected';
  END IF;

  -- Execute and return JSON array
  EXECUTE 'SELECT COALESCE(json_agg(row_to_json(t)), ''[]''::json) FROM (' || trimmed || ') t'
  INTO result;

  RETURN result;

EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Query error: %', SQLERRM;
END;
$$;

REVOKE ALL ON FUNCTION agent_execute_query(TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION agent_execute_query(TEXT) TO service_role;

-- Verify: should return [{"ping":1}]
SELECT agent_execute_query('SELECT 1 as ping');

-- Verify WITH clause works: should return a number
SELECT agent_execute_query('WITH x AS (SELECT 1 as n) SELECT n FROM x');

-- Verify YTD table is accessible (MUST use double-quoted mixed-case name)
SELECT agent_execute_query('SELECT COUNT(*) as rows FROM "btb_sales_YTD_minus_current_month"');

-- Verify vintage analysis query works end-to-end
SELECT agent_execute_query('SELECT employment_status, COUNT(*) as cnt FROM employees GROUP BY employment_status LIMIT 5');
