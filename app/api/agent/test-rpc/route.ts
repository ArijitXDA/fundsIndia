// GET /api/agent/test-rpc
// Diagnostic endpoint — inspects actual DB column types and data for all key tables.
// Visit /api/agent/test-rpc after login to see raw results.
// Queries are written on one line to avoid whitespace prefix issues with old RPC versions.

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

async function rpc(sql: string) {
  // Trim all leading/trailing whitespace and collapse internal newlines
  const cleaned = sql.replace(/\s+/g, ' ').trim();
  const { data, error } = await supabaseAdmin.rpc('agent_execute_query', { query_sql: cleaned });
  return { sql: cleaned.slice(0, 120), data, error: error ? { message: error.message, code: (error as any).code } : null };
}

export async function GET(_request: NextRequest) {
  const results: Record<string, any> = {};

  // 1. Verify RPC works at all
  results.t1_ping = await rpc(`SELECT 1 as ping`);

  // 2. WITH clause works?
  results.t2_with = await rpc(`WITH x AS (SELECT 1 as n) SELECT n FROM x`);

  // 3. employees columns — actual names and data types from DB catalog
  results.t3_employees_columns = await rpc(`SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'employees' ORDER BY ordinal_position`);

  // 4. Sample employees rows — see actual date_joined value
  results.t4_employees_sample = await rpc(`SELECT employee_number, full_name, business_unit, date_joined, employment_status FROM employees LIMIT 3`);

  // 5. How many employees have NULL date_joined? (actual employment_status value is 'Working')
  results.t5_date_joined_nulls = await rpc(`SELECT COUNT(*) as total, COUNT(date_joined) as has_date, COUNT(*) - COUNT(date_joined) as null_date FROM employees WHERE employment_status = 'Working'`);

  // 6. b2b columns — actual types
  results.t6_b2b_columns = await rpc(`SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'b2b_sales_current_month' ORDER BY ordinal_position`);

  // 7. b2b sample rows — see actual stored values
  results.t7_b2b_sample = await rpc(`SELECT "RM Emp ID", "Total Net Sales (COB 100%)", "Zone" FROM b2b_sales_current_month LIMIT 2`);

  // 8. Does NULLIF cast work on b2b?
  results.t8_b2b_cast = await rpc(`SELECT COUNT(*) as rows, ROUND(AVG(NULLIF("Total Net Sales (COB 100%)", '')::numeric)::numeric, 2) as avg_cr FROM b2b_sales_current_month`);

  // 9. b2c columns
  results.t9_b2c_columns = await rpc(`SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'b2c' ORDER BY ordinal_position`);

  // 10. Vintage query end-to-end (using correct employment_status = 'Working')
  results.t10_vintage = await rpc(`SELECT EXTRACT(YEAR FROM date_joined)::int as year_joined, COUNT(*) as headcount FROM employees WHERE employment_status = 'Working' AND date_joined IS NOT NULL GROUP BY EXTRACT(YEAR FROM date_joined) ORDER BY year_joined DESC LIMIT 10`);

  // 11. W-prefix strip test — verify that SUBSTRING("RM Emp ID" FROM 2) matches employees.employee_number
  results.t11_w_prefix_join = await rpc(`SELECT b."RM Emp ID", SUBSTRING(b."RM Emp ID" FROM 2) as bare_id, e.full_name, e.employee_number FROM b2b_sales_current_month b JOIN employees e ON e.employee_number = SUBSTRING(b."RM Emp ID" FROM 2) WHERE e.employment_status = 'Working' GROUP BY b."RM Emp ID", e.full_name, e.employee_number LIMIT 5`);

  // 12. Total active headcount (should be > 0 with 'Working' filter)
  results.t12_headcount = await rpc(`SELECT COUNT(*) as active_count, COUNT(date_joined) as with_date FROM employees WHERE employment_status = 'Working'`);

  return NextResponse.json(results, { status: 200 });
}
