// GET /api/agent/test-rpc
// Diagnostic endpoint: runs a simple test query via agent_execute_query RPC
// and returns the raw result or error. Used to debug query_database failures.
// Remove this endpoint after debugging is complete.

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const results: Record<string, any> = {};

  // Test 1: plain SELECT — should always work
  const test1 = await supabaseAdmin.rpc('agent_execute_query', {
    query_sql: 'SELECT 1 as ping',
  });
  results.test1_plain_select = {
    data: test1.data,
    error: test1.error ? { message: test1.error.message, code: test1.error.code, details: test1.error.details } : null,
  };

  // Test 2: SELECT from b2b table — tests table access
  const test2 = await supabaseAdmin.rpc('agent_execute_query', {
    query_sql: 'SELECT "RM Emp ID", "Total Net Sales (COB 100%)" FROM b2b_sales_current_month LIMIT 3',
  });
  results.test2_b2b_select = {
    data: test2.data,
    error: test2.error ? { message: test2.error.message, code: test2.error.code, details: test2.error.details } : null,
  };

  // Test 3: CTE with GROUP BY and AVG — tests the actual below-average query pattern
  const test3 = await supabaseAdmin.rpc('agent_execute_query', {
    query_sql: `WITH rm_totals AS (
      SELECT "RM Emp ID", SUM("Total Net Sales (COB 100%)") as total
      FROM b2b_sales_current_month
      GROUP BY "RM Emp ID"
    )
    SELECT COUNT(*) as below_avg_count
    FROM rm_totals
    WHERE total < (SELECT AVG(total) FROM rm_totals)`,
  });
  results.test3_cte_below_avg = {
    data: test3.data,
    error: test3.error ? { message: test3.error.message, code: test3.error.code, details: test3.error.details } : null,
  };

  // Test 4: check if the function exists at all
  const test4 = await supabaseAdmin
    .from('information_schema.routines' as any)
    .select('routine_name, security_type')
    .eq('routine_name', 'agent_execute_query')
    .limit(1);
  results.test4_function_exists = {
    data: test4.data,
    error: test4.error ? test4.error.message : null,
  };

  return NextResponse.json(results, { status: 200 });
}
