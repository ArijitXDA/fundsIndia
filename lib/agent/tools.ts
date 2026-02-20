// ─────────────────────────────────────────────────────────────────────────────
// FundsAgent Tool Library
// Each tool is a typed data-fetching function that enforces row_scope from
// agent_access before returning data. The GPT-4o function-calling layer maps
// tool names to these implementations.
//
// IMPORTANT: Column names match the LIVE Supabase schema exactly.
// B2B tables use raw CSV headers with spaces/brackets (e.g. "RM Emp ID").
// B2C table is named "b2c" and uses bracketed column names.
// ─────────────────────────────────────────────────────────────────────────────

import { supabaseAdmin } from '@/lib/supabase';

// ── Row-scope helper ──────────────────────────────────────────────────────────

/**
 * Resolve the effective employee ID filter based on row_scope token.
 * Returns an array of employee_numbers the user is allowed to see,
 * or 'all' for unrestricted access.
 */
async function resolveAllowedEmployeeNumbers(
  employeeNumber: string,
  rowScope: Record<string, string> | null | undefined
): Promise<string[] | 'all'> {
  const scope = rowScope?.default ?? 'own_only';

  if (scope === 'all') return 'all';
  if (scope === 'own_only') return [employeeNumber];

  if (scope === 'own_and_team' || scope === 'vertical_only') {
    const EMP_PAGE = 1000;
    let allEmployees: any[] = [];
    let page = 0;
    while (true) {
      const { data: batch } = await supabaseAdmin
        .from('employees')
        .select('employee_number, reporting_manager_emp_number, business_unit, employment_status')
        .neq('employment_status', 'Inactive')
        .order('employee_number')
        .range(page * EMP_PAGE, (page + 1) * EMP_PAGE - 1);
      if (!batch || batch.length === 0) break;
      allEmployees = allEmployees.concat(batch);
      if (batch.length < EMP_PAGE) break;
      page++;
    }

    const empMap = new Map<string, string[]>();
    for (const emp of allEmployees) {
      if (emp.reporting_manager_emp_number) {
        const existing = empMap.get(emp.reporting_manager_emp_number) ?? [];
        existing.push(emp.employee_number);
        empMap.set(emp.reporting_manager_emp_number, existing);
      }
    }

    function getAllDownstream(id: string): string[] {
      const direct = empMap.get(id) ?? [];
      const all = [...direct];
      for (const d of direct) all.push(...getAllDownstream(d));
      return all;
    }

    const downstream = getAllDownstream(employeeNumber);
    const ids = [employeeNumber, ...downstream];

    if (scope === 'vertical_only') {
      const myEmp = allEmployees.find(e => e.employee_number === employeeNumber);
      if (myEmp) {
        const myBU = myEmp.business_unit;
        return allEmployees
          .filter(e => ids.includes(e.employee_number) && e.business_unit === myBU)
          .map(e => e.employee_number);
      }
    }

    return ids;
  }

  return [employeeNumber];
}

// ── B2B column name helpers (raw CSV headers) ─────────────────────────────────

// B2B MTD table: b2b_sales_current_month
const B2B_MTD_COLS = `"RM Emp ID", "Partner Name", "MF+SIF+MSCI", "COB (100%)", "AIF+PMS+LAS+DYNAMO (TRAIL)", "ALTERNATE", "Total Net Sales (COB 100%)", "Branch", "Zone"`;

// B2B YTD table: btb_sales_YTD_minus_current_month
const B2B_YTD_COLS = `"RM Emp ID", "Partner Name", "MF+SIF+MSCI", "SUM of COB (100%)", "SUM of AIF+PMS+LAS (TRAIL)", "SUM of ALT", "Total Net Sales (COB 100%)", "Branch", "Zone"`;

function parseMtdRow(row: any) {
  return {
    emp_id:   String(row['RM Emp ID'] || '').trim(),
    // NOTE: "Partner Name" is the IFA/ARN partner, NOT the RM's own name.
    // RM names are resolved separately from the employees table via resolveRmNames().
    partner_name: String(row['Partner Name'] || '').trim(),
    zone:     String(row['Zone'] || '').trim(),
    branch:   String(row['Branch'] || '').trim(),
    mf_sif_msci:       parseFloat(row['MF+SIF+MSCI'] || 0) || 0,
    cob100:            parseFloat(row['COB (100%)'] || 0) || 0,
    aif_pms_las:       parseFloat(row['AIF+PMS+LAS+DYNAMO (TRAIL)'] || 0) || 0,
    alternate:         parseFloat(row['ALTERNATE'] || 0) || 0,
    total:             parseFloat(row['Total Net Sales (COB 100%)'] || 0) || 0,
  };
}

function parseYtdRow(row: any) {
  return {
    emp_id:   String(row['RM Emp ID'] || '').trim(),
    // NOTE: "Partner Name" is the IFA/ARN partner, NOT the RM's own name.
    partner_name: String(row['Partner Name'] || '').trim(),
    zone:     String(row['Zone'] || '').trim(),
    branch:   String(row['Branch'] || '').trim(),
    mf_sif_msci:   parseFloat(row['MF+SIF+MSCI'] || 0) || 0,
    cob100:        parseFloat(row['SUM of COB (100%)'] || row['COB (100%)'] || 0) || 0,
    aif_pms_las:   parseFloat(row['SUM of AIF+PMS+LAS (TRAIL)'] || row['AIF+PMS+LAS+DYNAMO (TRAIL)'] || 0) || 0,
    alternate:     parseFloat(row['SUM of ALT'] || row['ALTERNATE'] || 0) || 0,
    total:         parseFloat(row['Total Net Sales (COB 100%)'] || 0) || 0,
  };
}

// ── Helper: resolve RM full names from employees table ────────────────────────
// B2B sales tables only have "RM Emp ID" (W-prefixed) and "Partner Name" (IFA).
// This batch-fetches the actual RM full_name + job_title from the employees table.
// Returns a map of employee_number → { full_name, job_title }.
async function resolveRmNames(empIds: string[]): Promise<Map<string, { full_name: string; job_title: string }>> {
  if (empIds.length === 0) return new Map();
  const { data } = await supabaseAdmin
    .from('employees')
    .select('employee_number, full_name, job_title')
    .in('employee_number', empIds)
    .limit(empIds.length + 10);
  const map = new Map<string, { full_name: string; job_title: string }>();
  for (const e of (data ?? [])) {
    map.set(String(e.employee_number), { full_name: e.full_name, job_title: e.job_title });
  }
  return map;
}

// B2C column name helper
function parseB2cRow(row: any) {
  return {
    advisor_email:     String(row['advisor'] || '').trim().toLowerCase(),
    team:              String(row['team'] || '').trim(),
    net_inflow_mtd:    parseFloat(row['net_inflow_mtd[cr]'] || 0) || 0,
    net_inflow_ytd:    parseFloat(row['net_inflow_ytd[cr]'] || 0) || 0,
    current_aum:       parseFloat(row['current_aum_mtm [cr.]'] || 0) || 0,
    aum_growth_pct:    parseFloat(row['aum_growth_mtm %'] || 0) || 0,
    assigned_leads:    parseInt(row['assigned_leads'] || 0) || 0,
    new_sip_inflow_ytd: parseFloat(row['new_sip_inflow_ytd[cr.]'] || 0) || 0,
  };
}

// ─── Tool Definitions for OpenAI Function Calling ────────────────────────────

export const AGENT_TOOLS = [
  {
    type: 'function' as const,
    function: {
      name: 'get_my_performance',
      description: 'Get the current user\'s own sales performance — MTD and YTD breakdown for B2B (MF+SIF+MSCI, COB100, AIF+PMS+LAS+DYNAMO, Alternate) or B2C (Net Inflow, AUM, SIP Inflow).',
      parameters: {
        type: 'object',
        properties: {
          period: {
            type: 'string',
            enum: ['MTD', 'YTD', 'both'],
            description: 'Which period to return data for. Default: both',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_team_performance',
      description: 'Get aggregated performance data for the user\'s team (direct and indirect reportees). Returns individual rows sorted by MTD sales. Useful for managers and CEOs.',
      parameters: {
        type: 'object',
        properties: {
          period: {
            type: 'string',
            enum: ['MTD', 'YTD', 'both'],
            description: 'Which period to return. Default: MTD',
          },
          limit: {
            type: 'number',
            description: 'Max rows to return. Default: 20',
          },
          sort_by: {
            type: 'string',
            enum: ['mtd_desc', 'mtd_asc', 'ytd_desc', 'ytd_asc', 'name'],
            description: 'Sort order. Default: mtd_desc',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_rankings',
      description: 'Get leaderboard rankings — overall or filtered by zone or branch. Returns rank, name, MTD and YTD figures.',
      parameters: {
        type: 'object',
        properties: {
          vertical: {
            type: 'string',
            enum: ['B2B', 'B2C'],
            description: 'Which vertical to rank. Default: B2B',
          },
          sort_by: {
            type: 'string',
            enum: ['MTD', 'YTD'],
            description: 'Ranking basis. Default: MTD',
          },
          filter_zone: {
            type: 'string',
            description: 'Optional: filter to a specific zone name',
          },
          limit: {
            type: 'number',
            description: 'Max rows. Default: 10',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_employee_info',
      description: 'Look up employee details by name or employee number. Returns full_name, employee_number, job_title, business_unit, department, reporting manager.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Name fragment or employee number to search for',
          },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_org_structure',
      description: 'Get the reporting structure for a given employee — their direct reports and chain of command.',
      parameters: {
        type: 'object',
        properties: {
          employee_number: {
            type: 'string',
            description: 'Employee number to fetch org structure for. If omitted, uses the current user.',
          },
          depth: {
            type: 'number',
            description: 'How many levels down to fetch. Default: 2',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_proactive_insights',
      description: 'Run proactive insight checks and return any alerts or opportunities — target gaps, team outliers, ranking summary.',
      parameters: {
        type: 'object',
        properties: {
          check_types: {
            type: 'array',
            items: {
              type: 'string',
              enum: ['target_gap', 'team_outlier', 'ranking_summary', 'all'],
            },
            description: 'Which checks to run. Default: all',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_company_summary',
      description: 'Get a high-level company-wide performance summary across all verticals (B2B and B2C). Returns total MTD and YTD figures for each vertical, top performers, and a combined company total. Use this for Group CEO / leadership queries like "how is the company doing", "give me an analysis of all verticals", or when the user asks about overall business performance.',
      parameters: {
        type: 'object',
        properties: {
          period: {
            type: 'string',
            enum: ['MTD', 'YTD', 'both'],
            description: 'Which period to return. Default: both',
          },
          include_top_performers: {
            type: 'boolean',
            description: 'Whether to include top 3 performers per vertical. Default: true',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'query_database',
      description: `Execute a custom SQL SELECT query directly against the database. Use this for ad-hoc questions that the specific tools (get_my_performance, get_team_performance, etc.) don't cover — e.g. custom multi-column filters, specific employee lookups, cross-table analysis, zone breakdowns, or any question requiring bespoke data retrieval.

Rules:
- ONLY SELECT statements. Never INSERT, UPDATE, DELETE, DROP, or any DML/DDL.
- Always add LIMIT unless the user explicitly wants all rows (respect the result_limit in your config).
- Column names with spaces or special characters MUST be wrapped in double-quotes (e.g. "RM Emp ID", "MF+SIF+MSCI", "net_inflow_mtd[cr]").
- Only query tables you have been granted access to (see your allowed tables).
- Include an explanation of what the query does for the audit log.`,
      parameters: {
        type: 'object',
        properties: {
          sql: {
            type: 'string',
            description: 'The SQL SELECT query to execute. Must start with SELECT. Use double-quotes around column names that contain spaces, brackets, or special characters.',
          },
          explanation: {
            type: 'string',
            description: 'One-sentence description of what this query fetches, used for logging.',
          },
        },
        required: ['sql', 'explanation'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'save_memory',
      description: 'Persist a piece of information about the user to memory so it can be recalled in future sessions. Use this when the user shares preferences, goals, context, or anything worth remembering long-term. Examples: preferred reporting format, personal targets, noted concerns, focus areas.',
      parameters: {
        type: 'object',
        properties: {
          key: {
            type: 'string',
            description: 'A short descriptive key for this memory item (e.g., "preferred_format", "monthly_target_goal", "focus_area")',
          },
          value: {
            type: 'string',
            description: 'The value to store. Keep it concise but complete.',
          },
          memory_type: {
            type: 'string',
            enum: ['preference', 'goal', 'context', 'note'],
            description: 'Category of this memory. Default: context',
          },
          expires_days: {
            type: 'number',
            description: 'Optional: number of days before this memory expires. Omit for permanent memory.',
          },
        },
        required: ['key', 'value'],
      },
    },
  },
];

// ─── Tool Context ─────────────────────────────────────────────────────────────

export interface QueryDbConfig {
  result_limit?:     number;                       // max rows returned (default 200, hard-cap 1000)
  allow_aggregates?: boolean;                      // allow GROUP BY, SUM, COUNT, AVG, HAVING
  allow_joins?:      boolean;                      // allow JOIN keyword
  blocked_columns?:  Record<string, string[]>;     // { tableName: [col1, col2] } — stripped post-query
}

export interface ToolContext {
  employeeNumber:  string;
  employeeId:      string;
  businessUnit:    string;
  workEmail:       string;
  rowScope:        Record<string, string> | null;
  allowedTables:   string[] | null;
  queryDbConfig?:  QueryDbConfig | null;           // only set when can_query_database = true
}

// ─── Tool Dispatcher ──────────────────────────────────────────────────────────

export async function executeTool(
  toolName: string,
  args: Record<string, any>,
  ctx: ToolContext
): Promise<any> {
  const isTableAllowed = (table: string) => {
    if (!ctx.allowedTables || ctx.allowedTables.length === 0) return true;
    return ctx.allowedTables.includes(table);
  };

  switch (toolName) {
    case 'get_my_performance':
      return await toolGetMyPerformance(args, ctx);

    case 'get_team_performance':
      if (!isTableAllowed('b2b_sales_current_month') && !isTableAllowed('b2c')) {
        return { error: 'You do not have access to team performance data.' };
      }
      return await toolGetTeamPerformance(args, ctx);

    case 'get_rankings':
      return await toolGetRankings(args, ctx);

    case 'get_employee_info':
      return await toolGetEmployeeInfo(args, ctx);

    case 'get_org_structure':
      return await toolGetOrgStructure(args, ctx);

    case 'get_proactive_insights':
      return await toolGetProactiveInsights(args, ctx);

    case 'get_company_summary':
      return await toolGetCompanySummary(args, ctx);

    case 'save_memory':
      return await toolSaveMemory(args, ctx);

    case 'query_database':
      return await toolQueryDatabase(args, ctx);

    default:
      return { error: `Unknown tool: ${toolName}` };
  }
}

// ── Tool: get_my_performance ──────────────────────────────────────────────────

async function toolGetMyPerformance(args: any, ctx: ToolContext) {
  const { employeeNumber: empNum, businessUnit: bu, workEmail } = ctx;

  if (bu === 'B2B') {
    // B2B tables key on "RM Emp ID" which is W-prefixed
    const wKey = empNum.startsWith('W') ? empNum : `W${empNum}`;

    const [{ data: mtdRows }, { data: ytdRows }] = await Promise.all([
      supabaseAdmin.from('b2b_sales_current_month').select(B2B_MTD_COLS).eq('RM Emp ID', wKey),
      supabaseAdmin.from('btb_sales_YTD_minus_current_month').select(B2B_YTD_COLS).eq('RM Emp ID', wKey),
    ]);

    // Aggregate all rows for this employee (one row per ARN/partner)
    const sumMtd = (mtdRows ?? []).reduce((acc: any, row: any) => {
      const r = parseMtdRow(row);
      return {
        mf_sif_msci: acc.mf_sif_msci + r.mf_sif_msci,
        cob100:      acc.cob100 + r.cob100,
        aif_pms_las: acc.aif_pms_las + r.aif_pms_las,
        alternate:   acc.alternate + r.alternate,
        total:       acc.total + r.total,
        zone:        r.zone || acc.zone,
        branch:      r.branch || acc.branch,
      };
    }, { mf_sif_msci: 0, cob100: 0, aif_pms_las: 0, alternate: 0, total: 0, zone: '', branch: '' });

    const sumYtd = (ytdRows ?? []).reduce((acc: any, row: any) => {
      const r = parseYtdRow(row);
      return {
        mf_sif_msci: acc.mf_sif_msci + r.mf_sif_msci,
        cob100:      acc.cob100 + r.cob100,
        aif_pms_las: acc.aif_pms_las + r.aif_pms_las,
        alternate:   acc.alternate + r.alternate,
        total:       acc.total + r.total,
      };
    }, { mf_sif_msci: 0, cob100: 0, aif_pms_las: 0, alternate: 0, total: 0 });

    const hasMtd = (mtdRows ?? []).length > 0;
    const hasYtd = (ytdRows ?? []).length > 0;

    return {
      vertical: 'B2B',
      employee_number: empNum,
      partner_name: empNum,  // Partner Name in sales table is the IFA firm, not the RM — use empNum as identifier
      zone: sumMtd.zone,
      branch: sumMtd.branch,
      mtd: hasMtd ? {
        mf_sif_msci_cr: sumMtd.mf_sif_msci,
        cob100_cr:      sumMtd.cob100,
        aif_pms_las_cr: sumMtd.aif_pms_las,
        alternate_cr:   sumMtd.alternate,
        total_cr:       sumMtd.total,
      } : null,
      ytd_excluding_current_month: hasYtd ? {
        mf_sif_msci_cr: sumYtd.mf_sif_msci,
        cob100_cr:      sumYtd.cob100,
        aif_pms_las_cr: sumYtd.aif_pms_las,
        alternate_cr:   sumYtd.alternate,
        total_cr:       sumYtd.total,
      } : null,
      ytd_total_cr: hasMtd && hasYtd ? sumMtd.total + sumYtd.total : null,
    };
  }

  if (bu === 'B2C') {
    // B2C table keys on the advisor column which stores email
    const emailLower = workEmail.toLowerCase();

    const { data: b2cRows } = await supabaseAdmin
      .from('b2c')
      .select('*')
      .ilike('advisor', emailLower);

    const row = b2cRows?.[0] ?? null;
    if (!row) {
      return {
        vertical: 'B2C',
        employee_number: empNum,
        message: 'No B2C advisory data found for this email address.',
        data: null,
      };
    }

    const parsed = parseB2cRow(row);
    return {
      vertical: 'B2C',
      employee_number: empNum,
      data: {
        team:               parsed.team,
        net_inflow_mtd_cr:  parsed.net_inflow_mtd,
        net_inflow_ytd_cr:  parsed.net_inflow_ytd,
        current_aum_cr:     parsed.current_aum,
        aum_growth_pct:     parsed.aum_growth_pct,
        assigned_leads:     parsed.assigned_leads,
        new_sip_inflow_ytd_cr: parsed.new_sip_inflow_ytd,
      },
    };
  }

  // For non-B2B/B2C BUs (e.g. Corporate, Management, Group CEO) — return company-wide summary
  // so leadership users get meaningful data instead of an empty response.
  const scope = ctx.rowScope?.default ?? 'own_only';
  if (scope === 'all') {
    return await toolGetCompanySummary({ period: 'both', include_top_performers: true }, ctx);
  }

  return { vertical: bu, message: 'No direct sales data available for this business unit.' };
}

// ── Tool: get_team_performance ────────────────────────────────────────────────

async function toolGetTeamPerformance(args: any, ctx: ToolContext) {
  const allowed = await resolveAllowedEmployeeNumbers(ctx.employeeNumber, ctx.rowScope);

  // Group CEO / all-scope: delegate to company summary which covers all verticals
  if (allowed === 'all') {
    return await toolGetCompanySummary({ period: args.sort_by?.includes('ytd') ? 'YTD' : 'MTD', include_top_performers: true }, ctx);
  }

  if ((allowed as string[]).length <= 1) {
    return {
      message: 'No team members found under your profile, or your access level restricts team data.',
      team_size: 0,
      members: [],
    };
  }

  const limit = args.limit ?? 20;
  const sortBy: string = args.sort_by ?? 'mtd_desc';

  // Build W-prefixed keys for B2B lookup (allowed is string[] here — 'all' case returned above)
  const wKeys = (allowed as string[]).map(id => id.startsWith('W') ? id : `W${id}`);

  if (sortBy.includes('ytd')) {
    const { data } = await supabaseAdmin
      .from('btb_sales_YTD_minus_current_month')
      .select(B2B_YTD_COLS)
      .in('RM Emp ID', wKeys)
      .limit(limit * 3); // over-fetch to allow aggregation

    // Aggregate by emp ID
    const byEmp = new Map<string, any>();
    for (const row of (data ?? [])) {
      const r = parseYtdRow(row);
      if (!r.emp_id || r.emp_id === '#N/A') continue;
      if (!byEmp.has(r.emp_id)) byEmp.set(r.emp_id, { ...r });
      else {
        const e = byEmp.get(r.emp_id)!;
        e.mf_sif_msci += r.mf_sif_msci;
        e.cob100      += r.cob100;
        e.aif_pms_las += r.aif_pms_las;
        e.alternate   += r.alternate;
        e.total       += r.total;
      }
    }

    const sorted = Array.from(byEmp.values())
      .sort((a, b) => sortBy === 'ytd_asc' ? a.total - b.total : b.total - a.total)
      .slice(0, limit);

    // Resolve RM names from employees table
    const nameMap = await resolveRmNames(sorted.map(r => r.emp_id));

    const members = sorted.map((r, i) => {
      const emp = nameMap.get(r.emp_id);
      return {
        rank: i + 1,
        employee_number: r.emp_id,
        rm_name: emp?.full_name ?? r.emp_id,
        job_title: emp?.job_title ?? '',
        zone: r.zone,
        branch: r.branch,
        ytd_total_cr: r.total,
        mf_sif_msci_cr: r.mf_sif_msci,
        cob100_cr: r.cob100,
        aif_pms_las_cr: r.aif_pms_las,
        alternate_cr: r.alternate,
      };
    });

    return {
      period: 'YTD',
      team_size: wKeys.length,
      members,
    };
  }

  // MTD (default)
  const { data } = await supabaseAdmin
    .from('b2b_sales_current_month')
    .select(B2B_MTD_COLS)
    .in('RM Emp ID', wKeys)
    .limit(limit * 3);

  const byEmp = new Map<string, any>();
  for (const row of (data ?? [])) {
    const r = parseMtdRow(row);
    if (!r.emp_id || r.emp_id === '#N/A') continue;
    if (!byEmp.has(r.emp_id)) byEmp.set(r.emp_id, { ...r });
    else {
      const e = byEmp.get(r.emp_id)!;
      e.mf_sif_msci += r.mf_sif_msci;
      e.cob100      += r.cob100;
      e.aif_pms_las += r.aif_pms_las;
      e.alternate   += r.alternate;
      e.total       += r.total;
    }
  }

  const sorted = Array.from(byEmp.values())
    .sort((a, b) => sortBy === 'mtd_asc' ? a.total - b.total : b.total - a.total)
    .slice(0, limit);

  // Resolve RM names from employees table
  const nameMap = await resolveRmNames(sorted.map(r => r.emp_id));

  const members = sorted.map((r, i) => {
    const emp = nameMap.get(r.emp_id);
    return {
      rank: i + 1,
      employee_number: r.emp_id,
      rm_name: emp?.full_name ?? r.emp_id,
      job_title: emp?.job_title ?? '',
      zone: r.zone,
      branch: r.branch,
      mtd_total_cr: r.total,
      mf_sif_msci_cr: r.mf_sif_msci,
      cob100_cr: r.cob100,
      aif_pms_las_cr: r.aif_pms_las,
      alternate_cr: r.alternate,
    };
  });

  return {
    period: 'MTD',
    team_size: wKeys.length,
    members,
  };
}

// ── Tool: get_rankings ────────────────────────────────────────────────────────

async function toolGetRankings(args: any, ctx: ToolContext) {
  const vertical = args.vertical ?? 'B2B';
  const sortBy   = args.sort_by ?? 'MTD';
  const limit    = Math.min(args.limit ?? 10, 50);

  if (vertical === 'B2C') {
    const { data } = await supabaseAdmin
      .from('b2c')
      .select('advisor, team, "net_inflow_mtd[cr]", "net_inflow_ytd[cr]", "current_aum_mtm [cr.]"')
      .limit(200);

    const parsed = (data ?? []).map(parseB2cRow);
    const sorted = parsed.sort((a, b) =>
      sortBy === 'YTD'
        ? b.net_inflow_ytd - a.net_inflow_ytd
        : b.net_inflow_mtd - a.net_inflow_mtd
    ).slice(0, limit);

    return {
      vertical: 'B2C',
      sort_by: sortBy,
      rankings: sorted.map((r, i) => ({
        rank: i + 1,
        advisor_email: r.advisor_email,
        team: r.team,
        net_inflow_mtd_cr: r.net_inflow_mtd,
        net_inflow_ytd_cr: r.net_inflow_ytd,
        current_aum_cr: r.current_aum,
      })),
    };
  }

  // B2B — fetch the right table, then aggregate by emp ID before ranking
  const cols = sortBy === 'YTD' ? B2B_YTD_COLS : B2B_MTD_COLS;
  const tableName = sortBy === 'YTD' ? 'btb_sales_YTD_minus_current_month' : 'b2b_sales_current_month';

  let q = supabaseAdmin.from(tableName).select(cols).limit(2000);
  if (args.filter_zone) q = q.ilike('Zone', `%${args.filter_zone}%`);

  const { data } = await q;

  const byEmp = new Map<string, any>();
  for (const row of (data ?? [])) {
    const r = sortBy === 'YTD' ? parseYtdRow(row) : parseMtdRow(row);
    if (!r.emp_id || r.emp_id === '#N/A') continue;
    if (!byEmp.has(r.emp_id)) byEmp.set(r.emp_id, { ...r });
    else {
      const e = byEmp.get(r.emp_id)!;
      e.total       += r.total;
      e.mf_sif_msci += r.mf_sif_msci;
      e.cob100      += r.cob100;
      e.aif_pms_las += r.aif_pms_las;
      e.alternate   += r.alternate;
    }
  }

  const ranked = Array.from(byEmp.values())
    .sort((a, b) => b.total - a.total)
    .slice(0, limit);

  // Resolve actual RM names from employees table (Partner Name ≠ RM name)
  const empIds = ranked.map(r => r.emp_id);
  const nameMap = await resolveRmNames(empIds);

  return {
    vertical: 'B2B',
    sort_by: sortBy,
    total_employees_in_pool: byEmp.size,
    rankings: ranked.map((r, i) => {
      const emp = nameMap.get(r.emp_id);
      return {
        rank: i + 1,
        employee_number: r.emp_id,
        rm_name: emp?.full_name ?? r.emp_id,   // RM's actual name from employees table
        job_title: emp?.job_title ?? '',
        zone: r.zone,
        branch: r.branch,
        total_cr: r.total,
      };
    }),
  };
}

// ── Tool: get_employee_info ───────────────────────────────────────────────────

async function toolGetEmployeeInfo(args: any, ctx: ToolContext) {
  const q = args.query?.trim() ?? '';
  if (!q) return { error: 'Query is required' };

  const { data } = await supabaseAdmin
    .from('employees')
    .select('employee_number, full_name, job_title, business_unit, department, reporting_manager_emp_number, employment_status')
    .or(`full_name.ilike.%${q}%,employee_number.ilike.%${q}%`)
    .neq('employment_status', 'Inactive')
    .limit(5);

  if (!data || data.length === 0) {
    return { message: `No employee found matching "${q}"` };
  }

  return {
    results: data.map(e => ({
      employee_number: e.employee_number,
      full_name: e.full_name,
      job_title: e.job_title,
      business_unit: e.business_unit,
      department: e.department,
      reporting_manager_emp_number: e.reporting_manager_emp_number,
    })),
  };
}

// ── Tool: get_org_structure ───────────────────────────────────────────────────

async function toolGetOrgStructure(args: any, ctx: ToolContext) {
  const targetEmpNum = args.employee_number ?? ctx.employeeNumber;
  const depth = Math.min(args.depth ?? 2, 4);

  const EMP_PAGE = 1000;
  let allEmployees: any[] = [];
  let page = 0;
  while (true) {
    const { data: batch } = await supabaseAdmin
      .from('employees')
      .select('employee_number, full_name, job_title, business_unit, reporting_manager_emp_number, employment_status')
      .neq('employment_status', 'Inactive')
      .order('employee_number')
      .range(page * EMP_PAGE, (page + 1) * EMP_PAGE - 1);
    if (!batch || batch.length === 0) break;
    allEmployees = allEmployees.concat(batch);
    if (batch.length < EMP_PAGE) break;
    page++;
  }

  const empMap    = new Map(allEmployees.map(e => [e.employee_number, e]));
  const childrenMap = new Map<string, string[]>();
  for (const emp of allEmployees) {
    if (emp.reporting_manager_emp_number) {
      const existing = childrenMap.get(emp.reporting_manager_emp_number) ?? [];
      existing.push(emp.employee_number);
      childrenMap.set(emp.reporting_manager_emp_number, existing);
    }
  }

  function buildTree(id: string, d: number): any {
    const emp = empMap.get(id);
    if (!emp) return null;
    const node: any = {
      employee_number: emp.employee_number,
      full_name: emp.full_name,
      job_title: emp.job_title,
      business_unit: emp.business_unit,
    };
    const children = childrenMap.get(id) ?? [];
    node.direct_reports_count = children.length;
    if (d > 0 && children.length > 0) {
      node.direct_reports = children.map(c => buildTree(c, d - 1)).filter(Boolean);
    }
    return node;
  }

  const target = empMap.get(targetEmpNum);
  if (!target) return { error: `Employee ${targetEmpNum} not found` };

  const manager = target.reporting_manager_emp_number
    ? empMap.get(target.reporting_manager_emp_number)
    : null;

  return {
    employee: buildTree(targetEmpNum, depth),
    reports_to: manager ? {
      employee_number: manager.employee_number,
      full_name: manager.full_name,
      job_title: manager.job_title,
    } : null,
  };
}

// ── Tool: get_proactive_insights ──────────────────────────────────────────────

async function toolGetProactiveInsights(args: any, ctx: ToolContext) {
  const checks = args.check_types ?? ['all'];
  const runAll = checks.includes('all');
  const insights: any[] = [];
  const scope = ctx.rowScope?.default ?? 'own_only';
  const isAllScope = scope === 'all';

  // For all-scope users (Group CEO / leadership) — return a company-wide snapshot
  // instead of individual B2B-only checks which would yield empty results.
  if (isAllScope) {
    const summary = await toolGetCompanySummary({ period: 'MTD', include_top_performers: true }, ctx);
    return {
      insights: [{
        type: 'company_snapshot',
        severity: 'info',
        title: 'Company performance snapshot',
        detail: 'Full cross-vertical summary attached below.',
        company_summary: summary,
      }],
      timestamp: new Date().toISOString(),
      employee_number: ctx.employeeNumber,
      note: 'Showing company-wide summary for leadership access level.',
    };
  }

  // 1. Target gap check — individual B2B employee (uses `targets` table)
  if (runAll || checks.includes('target_gap')) {
    if (ctx.businessUnit === 'B2B') {
      const wKey = ctx.employeeNumber.startsWith('W') ? ctx.employeeNumber : `W${ctx.employeeNumber}`;

      const { data: mtdRows } = await supabaseAdmin
        .from('b2b_sales_current_month')
        .select(B2B_MTD_COLS)
        .eq('RM Emp ID', wKey);

      const mtdTotal = (mtdRows ?? []).reduce((sum: number, row: any) =>
        sum + (parseFloat(row['Total Net Sales (COB 100%)'] || 0) || 0), 0
      );

      const { data: targetRows } = await supabaseAdmin
        .from('targets')
        .select('target_value, period_start, period_end')
        .eq('employee_id', ctx.employeeId)
        .eq('business_unit', 'B2B')
        .eq('target_type', 'monthly')
        .order('period_start', { ascending: false })
        .limit(1);

      const targetVal = targetRows?.[0]?.target_value;

      if (mtdRows && mtdRows.length > 0) {
        if (targetVal) {
          const pct = (mtdTotal / targetVal) * 100;
          insights.push({
            type: 'target_gap',
            severity: pct < 50 ? 'high' : pct < 80 ? 'medium' : 'low',
            title: pct < 50 ? 'Critical target gap' : pct < 80 ? 'Target gap alert' : 'On track with target',
            detail: `You are at ${pct.toFixed(1)}% of your monthly target (${mtdTotal.toFixed(2)} Cr of ${Number(targetVal).toFixed(2)} Cr MTD).`,
            mtd_cr: mtdTotal,
            target_cr: targetVal,
            achievement_pct: pct,
          });
        } else {
          insights.push({
            type: 'target_gap',
            severity: 'info',
            title: 'MTD performance',
            detail: `Your MTD total is ${mtdTotal.toFixed(2)} Cr. No target data found to compare against.`,
            mtd_cr: mtdTotal,
          });
        }
      }
    } else if (ctx.businessUnit === 'B2C') {
      // B2C target gap
      const { data: b2cRows } = await supabaseAdmin
        .from('b2c')
        .select('*')
        .ilike('advisor', ctx.workEmail);

      if (b2cRows && b2cRows.length > 0) {
        const row = parseB2cRow(b2cRows[0]);
        const { data: targetRows } = await supabaseAdmin
          .from('targets')
          .select('target_value')
          .eq('employee_id', ctx.employeeId)
          .eq('business_unit', 'B2C')
          .eq('target_type', 'monthly')
          .order('period_start', { ascending: false })
          .limit(1);

        const targetVal = targetRows?.[0]?.target_value;
        if (targetVal) {
          const pct = (row.net_inflow_mtd / targetVal) * 100;
          insights.push({
            type: 'target_gap',
            severity: pct < 50 ? 'high' : pct < 80 ? 'medium' : 'low',
            title: pct < 50 ? 'Critical target gap' : pct < 80 ? 'Target gap alert' : 'On track',
            detail: `Net Inflow MTD at ${pct.toFixed(1)}% of target (${row.net_inflow_mtd.toFixed(2)} Cr of ${Number(targetVal).toFixed(2)} Cr).`,
            mtd_cr: row.net_inflow_mtd,
            target_cr: targetVal,
            achievement_pct: pct,
          });
        } else {
          insights.push({
            type: 'target_gap',
            severity: 'info',
            title: 'B2C MTD performance',
            detail: `Net Inflow MTD: ${row.net_inflow_mtd.toFixed(2)} Cr. AUM: ${row.current_aum.toFixed(2)} Cr. No target set to compare against.`,
            net_inflow_mtd_cr: row.net_inflow_mtd,
            current_aum_cr: row.current_aum,
          });
        }
      }
    }
  }

  // 2. Team outlier check (only for managers with a team)
  if (runAll || checks.includes('team_outlier')) {
    const allowed = await resolveAllowedEmployeeNumbers(ctx.employeeNumber, ctx.rowScope);

    if (allowed !== 'all' && (allowed as string[]).length > 1) {
      const wKeys = (allowed as string[]).map(id => id.startsWith('W') ? id : `W${id}`);
      const myWKey = ctx.employeeNumber.startsWith('W') ? ctx.employeeNumber : `W${ctx.employeeNumber}`;

      const { data } = await supabaseAdmin
        .from('b2b_sales_current_month')
        .select(B2B_MTD_COLS)
        .in('RM Emp ID', wKeys);

      const byEmp = new Map<string, any>();
      for (const row of (data ?? [])) {
        const r = parseMtdRow(row);
        if (!r.emp_id || r.emp_id === '#N/A') continue;
        if (!byEmp.has(r.emp_id)) byEmp.set(r.emp_id, { ...r });
        else { const e = byEmp.get(r.emp_id)!; e.total += r.total; }
      }

      const members = Array.from(byEmp.values()).filter(r => r.emp_id !== myWKey);

      if (members.length > 0) {
        const totals = members.map(r => r.total);
        const avg = totals.reduce((a: number, b: number) => a + b, 0) / totals.length;
        const sorted = [...members].sort((a, b) => b.total - a.total);
        const top = sorted[0];
        const bottom = sorted[sorted.length - 1];

        insights.push({
          type: 'team_outlier',
          severity: 'info',
          title: 'Team performance snapshot',
          detail: `Team avg MTD: ${avg.toFixed(2)} Cr. Top: ${top.emp_id} (${top.total.toFixed(2)} Cr). Needs attention: ${bottom.emp_id} (${bottom.total.toFixed(2)} Cr).`,
          team_size: members.length,
          team_avg_cr: avg,
          top_performer: { employee_number: top.emp_id, mtd_cr: top.total },
          bottom_performer: { employee_number: bottom.emp_id, mtd_cr: bottom.total },
        });
      }
    }
  }

  // 3. Ranking summary (B2B employees only)
  if ((runAll || checks.includes('ranking_summary')) && ctx.businessUnit === 'B2B') {
    const wKey = ctx.employeeNumber.startsWith('W') ? ctx.employeeNumber : `W${ctx.employeeNumber}`;

    const { data: allMtd } = await supabaseAdmin
      .from('b2b_sales_current_month')
      .select(`"RM Emp ID", "Total Net Sales (COB 100%)"`)
      .limit(5000);

    if (allMtd && allMtd.length > 0) {
      const byEmp = new Map<string, number>();
      for (const row of allMtd) {
        const id = String(row['RM Emp ID'] || '').trim();
        if (!id || id === '#N/A') continue;
        byEmp.set(id, (byEmp.get(id) ?? 0) + (parseFloat(row['Total Net Sales (COB 100%)'] || 0) || 0));
      }

      const sorted = Array.from(byEmp.entries()).sort((a, b) => b[1] - a[1]);
      const rank = sorted.findIndex(([id]) => id === wKey);

      if (rank >= 0) {
        insights.push({
          type: 'ranking_summary',
          severity: 'info',
          title: 'Your current rank',
          detail: `You are ranked #${rank + 1} out of ${sorted.length} B2B employees by MTD sales (${(sorted[rank][1]).toFixed(2)} Cr).`,
          rank: rank + 1,
          total_employees: sorted.length,
          your_mtd_cr: sorted[rank][1],
        });
      }
    }
  }

  // If no insights generated (e.g. non-B2B/B2C individual), return a helpful fallback
  if (insights.length === 0) {
    insights.push({
      type: 'info',
      severity: 'info',
      title: 'No specific alerts at this time',
      detail: 'Everything appears on track. Ask me about specific metrics, your team, or rankings.',
    });
  }

  return {
    insights,
    timestamp: new Date().toISOString(),
    employee_number: ctx.employeeNumber,
  };
}

// ── Tool: get_company_summary ─────────────────────────────────────────────────

async function toolGetCompanySummary(args: any, ctx: ToolContext) {
  const period = args.period ?? 'both';
  const includeTop = args.include_top_performers !== false;

  // ── B2B aggregation ──────────────────────────────────────────────────────
  const [{ data: b2bMtdRows }, { data: b2bYtdRows }, { data: b2cRows }] = await Promise.all([
    supabaseAdmin
      .from('b2b_sales_current_month')
      .select(`"RM Emp ID", "MF+SIF+MSCI", "COB (100%)", "AIF+PMS+LAS+DYNAMO (TRAIL)", "ALTERNATE", "Total Net Sales (COB 100%)", "Zone"`)
      .limit(5000),
    supabaseAdmin
      .from('btb_sales_YTD_minus_current_month')
      .select(`"RM Emp ID", "Total Net Sales (COB 100%)"`)
      .limit(5000),
    supabaseAdmin
      .from('b2c')
      .select(`advisor, team, "net_inflow_mtd[cr]", "net_inflow_ytd[cr]", "current_aum_mtm [cr.]"`)
      .limit(2000),
  ]);

  // Aggregate B2B MTD by employee
  const b2bByEmpMtd = new Map<string, any>();
  for (const row of (b2bMtdRows ?? [])) {
    const r = parseMtdRow(row);
    if (!r.emp_id || r.emp_id === '#N/A') continue;
    if (!b2bByEmpMtd.has(r.emp_id)) b2bByEmpMtd.set(r.emp_id, { ...r });
    else {
      const e = b2bByEmpMtd.get(r.emp_id)!;
      e.total       += r.total;
      e.mf_sif_msci += r.mf_sif_msci;
      e.cob100      += r.cob100;
      e.aif_pms_las += r.aif_pms_las;
      e.alternate   += r.alternate;
    }
  }

  // Aggregate B2B YTD by employee
  const b2bByEmpYtd = new Map<string, number>();
  for (const row of (b2bYtdRows ?? [])) {
    const id = String(row['RM Emp ID'] || '').trim();
    if (!id || id === '#N/A') continue;
    b2bByEmpYtd.set(id, (b2bByEmpYtd.get(id) ?? 0) + (parseFloat(row['Total Net Sales (COB 100%)'] || 0) || 0));
  }

  const b2bMtdEmployees = Array.from(b2bByEmpMtd.values());
  const b2bTotalMtd     = b2bMtdEmployees.reduce((s, r) => s + r.total, 0);
  const b2bTotalYtd     = Array.from(b2bByEmpYtd.values()).reduce((s, v) => s + v, 0);
  const b2bMfMtd        = b2bMtdEmployees.reduce((s, r) => s + r.mf_sif_msci, 0);
  const b2bCobMtd       = b2bMtdEmployees.reduce((s, r) => s + r.cob100, 0);
  const b2bAifMtd       = b2bMtdEmployees.reduce((s, r) => s + r.aif_pms_las, 0);
  const b2bAltMtd       = b2bMtdEmployees.reduce((s, r) => s + r.alternate, 0);

  // B2B top performers — resolve RM names from employees table
  const b2bTopMtdSorted = [...b2bMtdEmployees].sort((a, b) => b.total - a.total).slice(0, 3);
  const b2bTopNameMap = await resolveRmNames(b2bTopMtdSorted.map(r => r.emp_id));
  const b2bTopMtd = b2bTopMtdSorted.map((r, i) => {
    const emp = b2bTopNameMap.get(r.emp_id);
    return { rank: i + 1, employee_number: r.emp_id, rm_name: emp?.full_name ?? r.emp_id, zone: r.zone, mtd_total_cr: r.total };
  });

  // ── B2C aggregation ──────────────────────────────────────────────────────
  const b2cParsed        = (b2cRows ?? []).map(parseB2cRow);
  const b2cTotalMtd      = b2cParsed.reduce((s, r) => s + r.net_inflow_mtd, 0);
  const b2cTotalYtd      = b2cParsed.reduce((s, r) => s + r.net_inflow_ytd, 0);
  const b2cTotalAum      = b2cParsed.reduce((s, r) => s + r.current_aum, 0);
  const b2cAdvisors      = b2cParsed.length;

  const b2cTopMtd = [...b2cParsed]
    .sort((a, b) => b.net_inflow_mtd - a.net_inflow_mtd)
    .slice(0, 3)
    .map((r, i) => ({ rank: i + 1, advisor: r.advisor_email, team: r.team, net_inflow_mtd_cr: r.net_inflow_mtd }));

  // ── Zone-wise B2B breakdown ───────────────────────────────────────────────
  const zoneMap = new Map<string, number>();
  for (const r of b2bMtdEmployees) {
    const z = r.zone || 'Unknown';
    zoneMap.set(z, (zoneMap.get(z) ?? 0) + r.total);
  }
  const zoneBreakdown = Array.from(zoneMap.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([zone, total]) => ({ zone, mtd_total_cr: parseFloat(total.toFixed(2)) }));

  // ── Combined totals ───────────────────────────────────────────────────────
  const combinedMtd = b2bTotalMtd + b2cTotalMtd;
  const combinedYtd = b2bTotalYtd + b2cTotalYtd;

  const result: any = {
    as_of: new Date().toISOString(),
    company_totals: {
      combined_mtd_cr: parseFloat(combinedMtd.toFixed(2)),
      combined_ytd_cr: parseFloat(combinedYtd.toFixed(2)),
    },
    b2b: {
      total_employees: b2bByEmpMtd.size,
      mtd_total_cr:    parseFloat(b2bTotalMtd.toFixed(2)),
      ytd_total_cr:    parseFloat(b2bTotalYtd.toFixed(2)),
      mtd_breakdown: {
        mf_sif_msci_cr: parseFloat(b2bMfMtd.toFixed(2)),
        cob100_cr:      parseFloat(b2bCobMtd.toFixed(2)),
        aif_pms_las_cr: parseFloat(b2bAifMtd.toFixed(2)),
        alternate_cr:   parseFloat(b2bAltMtd.toFixed(2)),
      },
      zone_breakdown: zoneBreakdown,
    },
    b2c: {
      total_advisors:  b2cAdvisors,
      mtd_net_inflow_cr: parseFloat(b2cTotalMtd.toFixed(2)),
      ytd_net_inflow_cr: parseFloat(b2cTotalYtd.toFixed(2)),
      total_aum_cr:    parseFloat(b2cTotalAum.toFixed(2)),
    },
  };

  if (includeTop) {
    result.b2b.top_performers_mtd = b2bTopMtd;
    result.b2c.top_advisors_mtd   = b2cTopMtd;
  }

  return result;
}

// ── Tool: save_memory ─────────────────────────────────────────────────────────

async function toolSaveMemory(args: any, ctx: ToolContext) {
  const key          = String(args.key ?? '').trim().slice(0, 100);
  const value        = String(args.value ?? '').trim().slice(0, 1000);
  const memory_type  = args.memory_type ?? 'context';
  const expiresDays  = args.expires_days ? Number(args.expires_days) : null;

  if (!key || !value) {
    return { error: 'key and value are required to save memory' };
  }

  const expires_at = expiresDays
    ? new Date(Date.now() + expiresDays * 86_400_000).toISOString()
    : null;

  // Upsert on (employee_id, key) — overwrite existing entry with same key
  const { error } = await supabaseAdmin
    .from('agent_memory')
    .upsert(
      {
        employee_id: ctx.employeeId,
        key,
        value,
        memory_type,
        expires_at,
      },
      { onConflict: 'employee_id,key' }
    );

  if (error) {
    return { error: `Failed to save memory: ${error.message}` };
  }

  return {
    saved: true,
    key,
    memory_type,
    expires_at: expires_at ?? 'never',
    message: `I've remembered that: "${key}" = "${value}".`,
  };
}

// ── Tool: query_database ───────────────────────────────────────────────────────
// Lets the agent write a custom SQL SELECT and execute it via a Supabase RPC
// function (agent_execute_query) that runs under the agent_readonly role —
// SELECT-only, no access to auth/agent tables.
//
// Guardrails (per-user, from query_db_config in agent_access):
//   result_limit     — hard row cap (default 200, max 1000)
//   allow_aggregates — if false, rejects GROUP BY / aggregate functions
//   allow_joins      — if false, rejects JOIN keyword
//   blocked_columns  — strips those keys from every returned row

async function toolQueryDatabase(args: any, ctx: ToolContext) {
  const sql:         string = String(args.sql ?? '').trim();
  const explanation: string = String(args.explanation ?? '').trim().slice(0, 300);

  if (!sql) return { error: 'sql is required' };

  // ── App-layer guardrails ──────────────────────────────────────────────────

  const cfg = ctx.queryDbConfig ?? {};
  const resultLimit    = Math.min(cfg.result_limit ?? 200, 1000);
  const allowAggregates = cfg.allow_aggregates ?? true;
  const allowJoins      = cfg.allow_joins      ?? false;

  const upper = sql.toUpperCase();

  // Must be a SELECT
  if (!/^\s*SELECT\b/.test(upper)) {
    return { error: 'Only SELECT queries are permitted. Your query must start with SELECT.' };
  }

  // Block DML/DDL at app layer too (defence in depth — RPC also blocks)
  const dangerousKeywords = /\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE|GRANT|REVOKE|COPY|EXECUTE|PERFORM)\b/;
  if (dangerousKeywords.test(upper)) {
    return { error: 'Disallowed SQL keyword detected. Only SELECT statements are permitted.' };
  }

  // Aggregate check
  if (!allowAggregates) {
    const aggregatePattern = /\b(GROUP\s+BY|HAVING|SUM\s*\(|COUNT\s*\(|AVG\s*\(|MIN\s*\(|MAX\s*\()\b/;
    if (aggregatePattern.test(upper)) {
      return { error: 'Aggregate functions and GROUP BY are not enabled for your access level.' };
    }
  }

  // JOIN check
  if (!allowJoins) {
    if (/\bJOIN\b/.test(upper)) {
      return { error: 'JOIN queries are not enabled for your access level.' };
    }
  }

  // Table access check — block sensitive internal tables regardless of allowedTables config.
  // Note: allowed_tables in agent_access controls pre-built tool access, not raw SQL access.
  // The DB-level agent_readonly role is the real enforcement layer for data table access.
  // Here we only block tables that must NEVER be accessible via query_database:
  const alwaysBlockedTables = [
    'users', 'agent_access', 'agent_personas', 'agent_conversations',
    'agent_messages', 'agent_memory',
  ];
  for (const t of alwaysBlockedTables) {
    if (upper.includes(t.toUpperCase())) {
      return { error: `Access denied: the "${t}" table is not accessible via query_database.` };
    }
  }

  // Inject LIMIT if not already present
  let finalSql = sql;
  if (!/\bLIMIT\s+\d+\b/i.test(sql)) {
    finalSql = `${sql.replace(/;?\s*$/, '')} LIMIT ${resultLimit}`;
  }

  // Audit log
  console.log(`[agent:query_database] emp=${ctx.employeeId} | ${explanation} | SQL: ${finalSql}`);

  // ── Execute via RPC ───────────────────────────────────────────────────────
  let rows: Record<string, any>[];
  try {
    const { data, error } = await supabaseAdmin.rpc('agent_execute_query', {
      query_sql: finalSql,
    });

    if (error) {
      console.error('[agent:query_database] RPC error:', error.message);
      return { error: `Query failed: ${error.message}` };
    }

    rows = Array.isArray(data) ? data : [];
  } catch (err: any) {
    console.error('[agent:query_database] exception:', err.message);
    return { error: `Query execution error: ${err.message ?? 'Unknown error'}` };
  }

  // ── Post-processing: strip blocked columns ────────────────────────────────
  const blockedColumns = cfg.blocked_columns ?? {};
  if (Object.keys(blockedColumns).length > 0) {
    // Collect all blocked column names (union across all tables — we don't know
    // which table each column came from without parsing, so strip globally)
    const allBlocked = new Set<string>(
      Object.values(blockedColumns).flat()
    );
    if (allBlocked.size > 0) {
      rows = rows.map(row => {
        const cleaned: Record<string, any> = {};
        for (const [k, v] of Object.entries(row)) {
          if (!allBlocked.has(k)) cleaned[k] = v;
        }
        return cleaned;
      });
    }
  }

  // Hard cap — ensure we never send more than resultLimit rows to the LLM
  const capped = rows.slice(0, resultLimit);

  return {
    row_count:    capped.length,
    total_found:  rows.length,
    rows:         capped,
    explanation,
  };
}
