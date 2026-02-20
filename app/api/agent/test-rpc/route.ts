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

  // 11. YTD table access — must use double-quoted mixed-case name
  results.t11_ytd_table = await rpc(`SELECT COUNT(*) as rows FROM "btb_sales_YTD_minus_current_month" LIMIT 1`);

  // 12. FIXED: Vintage vs MTD performance — direct join (employee_number already has W-prefix)
  results.t12_vintage_vs_perf = await rpc(`WITH emp_vintage AS (SELECT employee_number, CASE WHEN date_joined >= CURRENT_DATE - INTERVAL '1 year' THEN '0-1 yr' WHEN date_joined >= CURRENT_DATE - INTERVAL '3 years' THEN '1-3 yrs' WHEN date_joined >= CURRENT_DATE - INTERVAL '5 years' THEN '3-5 yrs' ELSE '5+ yrs' END as vintage_band FROM employees WHERE employment_status = 'Working' AND business_unit = 'B2B' AND date_joined IS NOT NULL), rm_mtd AS (SELECT "RM Emp ID", SUM(NULLIF("Total Net Sales (COB 100%)", '')::numeric) as mtd_cr FROM b2b_sales_current_month GROUP BY "RM Emp ID") SELECT v.vintage_band, COUNT(DISTINCT r."RM Emp ID") as rm_count, ROUND(AVG(r.mtd_cr)::numeric, 2) as avg_mtd_cr FROM rm_mtd r JOIN emp_vintage v ON v.employee_number = r."RM Emp ID" GROUP BY v.vintage_band ORDER BY avg_mtd_cr DESC LIMIT 10`);

  // 13. FIXED: Direct join test — employee_number = "RM Emp ID" (both W-prefixed, no SUBSTRING needed)
  results.t13_direct_join = await rpc(`SELECT b."RM Emp ID", e.full_name, e.employee_number FROM b2b_sales_current_month b JOIN employees e ON e.employee_number = b."RM Emp ID" WHERE e.employment_status = 'Working' GROUP BY b."RM Emp ID", e.full_name, e.employee_number LIMIT 5`);

  // 14. Total active headcount (should be > 0 with 'Working' filter)
  results.t14_headcount = await rpc(`SELECT COUNT(*) as active_count, COUNT(date_joined) as with_date FROM employees WHERE employment_status = 'Working'`);

  // 15. Distinct RM Emp IDs in b2b (sample) — confirm W-prefix format
  results.t15_b2b_rm_ids = await rpc(`SELECT DISTINCT "RM Emp ID" FROM b2b_sales_current_month LIMIT 5`);

  // 16. Sample employee_numbers for B2B — confirm W-prefix format
  results.t16_emp_numbers = await rpc(`SELECT employee_number, full_name, business_unit FROM employees WHERE employment_status = 'Working' AND business_unit = 'B2B' LIMIT 5`);

  // 17. FIXED: Direct join count — employee_number = "RM Emp ID" (should be > 0 now)
  results.t17_direct_join_count = await rpc(`SELECT COUNT(*) as matched FROM b2b_sales_current_month b JOIN employees e ON e.employee_number = b."RM Emp ID"`);

  // 18. Broken SUBSTRING join count — EXPECT 0 (this confirms old approach was wrong)
  results.t18_substring_join_broken = await rpc(`SELECT COUNT(*) as matched FROM b2b_sales_current_month b JOIN employees e ON e.employee_number = SUBSTRING(b."RM Emp ID" FROM 2)`);

  // 19. Vintage WITHOUT join — just employee tenure bands (no sales)
  results.t19_vintage_only = await rpc(`SELECT CASE WHEN date_joined >= CURRENT_DATE - INTERVAL '1 year' THEN '0-1 yr' WHEN date_joined >= CURRENT_DATE - INTERVAL '3 years' THEN '1-3 yrs' WHEN date_joined >= CURRENT_DATE - INTERVAL '5 years' THEN '3-5 yrs' ELSE '5+ yrs' END as vintage_band, COUNT(*) as headcount FROM employees WHERE employment_status = 'Working' AND business_unit = 'B2B' AND date_joined IS NOT NULL GROUP BY vintage_band ORDER BY headcount DESC`);

  // 20. Distinct business_unit values in employees
  results.t20_business_units = await rpc(`SELECT DISTINCT business_unit, COUNT(*) as cnt FROM employees WHERE employment_status = 'Working' GROUP BY business_unit`);

  // 21. gs_overall_aum — what business_segment values are actually stored?
  results.t21_gs_aum_segments = await rpc(`SELECT DISTINCT business_segment, COUNT(*) as cnt FROM gs_overall_aum GROUP BY business_segment ORDER BY cnt DESC`);

  // 22. gs_overall_aum — sample rows to see month format and actual values
  results.t22_gs_aum_sample = await rpc(`SELECT month, business_segment, overall_aum, net_cr, mf_aum_cr FROM gs_overall_aum ORDER BY month DESC LIMIT 6`);

  // 23. gs_overall_sales — what business_segment values are stored?
  results.t23_gs_sales_segments = await rpc(`SELECT DISTINCT business_segment, COUNT(*) as cnt FROM gs_overall_sales GROUP BY business_segment ORDER BY cnt DESC`);

  // 24. gs_overall_aum — check if the gs tables have any rows at all
  results.t24_gs_row_counts = await rpc(`SELECT (SELECT COUNT(*) FROM gs_overall_aum) as aum_rows, (SELECT COUNT(*) FROM gs_overall_sales) as sales_rows`);

  return NextResponse.json(results, { status: 200 });
}
