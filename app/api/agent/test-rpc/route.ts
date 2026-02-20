// GET /api/agent/test-rpc
// Diagnostic endpoint — inspects actual DB column types and data for all key tables.
// Visit /api/agent/test-rpc after login to see raw results.

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

async function rpc(sql: string) {
  const { data, error } = await supabaseAdmin.rpc('agent_execute_query', { query_sql: sql });
  return { data, error: error ? { message: error.message, code: (error as any).code } : null };
}

export async function GET(_request: NextRequest) {
  const results: Record<string, any> = {};

  // 1. What columns exist in employees + their actual data types?
  results.employees_columns = await rpc(`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'employees'
    ORDER BY ordinal_position
  `);

  // 2. Sample 3 rows from employees — see real data including date_joined
  results.employees_sample = await rpc(`
    SELECT employee_number, full_name, business_unit, date_joined, employment_status
    FROM employees
    LIMIT 3
  `);

  // 3. How many employees have NULL date_joined?
  results.employees_date_joined_nulls = await rpc(`
    SELECT
      COUNT(*) as total,
      COUNT(date_joined) as has_date_joined,
      COUNT(*) - COUNT(date_joined) as null_date_joined
    FROM employees
    WHERE employment_status = 'Active'
  `);

  // 4. What columns exist in b2b_sales_current_month + types?
  results.b2b_columns = await rpc(`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'b2b_sales_current_month'
    ORDER BY ordinal_position
  `);

  // 5. Sample 2 rows from b2b — see real values + types
  results.b2b_sample = await rpc(`
    SELECT "RM Emp ID", "Total Net Sales (COB 100%)", "MF+SIF+MSCI", "Zone"
    FROM b2b_sales_current_month
    LIMIT 2
  `);

  // 6. Test numeric cast on b2b — does NULLIF(...)::numeric work?
  results.b2b_cast_test = await rpc(`
    SELECT
      COUNT(*) as total_rows,
      COUNT(NULLIF("Total Net Sales (COB 100%)", '')::numeric) as castable_rows,
      ROUND(AVG(NULLIF("Total Net Sales (COB 100%)", '')::numeric)::numeric, 4) as avg_val
    FROM b2b_sales_current_month
  `);

  // 7. What columns exist in b2c + types?
  results.b2c_columns = await rpc(`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'b2c'
    ORDER BY ordinal_position
  `);

  // 8. Vintage query — does it work?
  results.vintage_test = await rpc(`
    SELECT
      EXTRACT(YEAR FROM date_joined)::int as year_joined,
      COUNT(*) as headcount
    FROM employees
    WHERE employment_status = 'Active' AND date_joined IS NOT NULL
    GROUP BY EXTRACT(YEAR FROM date_joined)
    ORDER BY year_joined DESC
    LIMIT 10
  `);

  return NextResponse.json(results, { status: 200 });
}
