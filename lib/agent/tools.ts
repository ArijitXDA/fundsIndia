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
    name:     String(row['Partner Name'] || '').trim(),
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
    name:     String(row['Partner Name'] || '').trim(),
    zone:     String(row['Zone'] || '').trim(),
    branch:   String(row['Branch'] || '').trim(),
    mf_sif_msci:   parseFloat(row['MF+SIF+MSCI'] || 0) || 0,
    cob100:        parseFloat(row['SUM of COB (100%)'] || row['COB (100%)'] || 0) || 0,
    aif_pms_las:   parseFloat(row['SUM of AIF+PMS+LAS (TRAIL)'] || row['AIF+PMS+LAS+DYNAMO (TRAIL)'] || 0) || 0,
    alternate:     parseFloat(row['SUM of ALT'] || row['ALTERNATE'] || 0) || 0,
    total:         parseFloat(row['Total Net Sales (COB 100%)'] || 0) || 0,
  };
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
];

// ─── Tool Context ─────────────────────────────────────────────────────────────

export interface ToolContext {
  employeeNumber: string;
  employeeId:     string;
  businessUnit:   string;
  workEmail:      string;
  rowScope:       Record<string, string> | null;
  allowedTables:  string[] | null;
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
        name:        r.name || acc.name,
        zone:        r.zone || acc.zone,
        branch:      r.branch || acc.branch,
      };
    }, { mf_sif_msci: 0, cob100: 0, aif_pms_las: 0, alternate: 0, total: 0, name: '', zone: '', branch: '' });

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
      partner_name: sumMtd.name || empNum,
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

  return { vertical: bu, message: 'No direct sales data available for this business unit.' };
}

// ── Tool: get_team_performance ────────────────────────────────────────────────

async function toolGetTeamPerformance(args: any, ctx: ToolContext) {
  const allowed = await resolveAllowedEmployeeNumbers(ctx.employeeNumber, ctx.rowScope);

  if (allowed !== 'all' && (allowed as string[]).length <= 1) {
    return {
      message: 'No team members found under your profile, or your access level restricts team data.',
      team_size: 0,
      members: [],
    };
  }

  const limit = args.limit ?? 20;
  const sortBy: string = args.sort_by ?? 'mtd_desc';

  // Build W-prefixed keys for B2B lookup
  const wKeys = allowed === 'all'
    ? null
    : (allowed as string[]).map(id => id.startsWith('W') ? id : `W${id}`);

  if (sortBy.includes('ytd')) {
    let q = supabaseAdmin.from('btb_sales_YTD_minus_current_month').select(B2B_YTD_COLS);
    if (wKeys) q = q.in('RM Emp ID', wKeys);
    const { data } = await q.limit(limit * 3); // over-fetch to allow aggregation

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

    const members = Array.from(byEmp.values())
      .sort((a, b) => sortBy === 'ytd_asc' ? a.total - b.total : b.total - a.total)
      .slice(0, limit)
      .map((r, i) => ({
        rank: i + 1,
        employee_number: r.emp_id,
        name: r.name,
        zone: r.zone,
        branch: r.branch,
        ytd_total_cr: r.total,
        mf_sif_msci_cr: r.mf_sif_msci,
        cob100_cr: r.cob100,
        aif_pms_las_cr: r.aif_pms_las,
        alternate_cr: r.alternate,
      }));

    return {
      period: 'YTD',
      team_size: allowed === 'all' ? 'all' : (allowed as string[]).length,
      members,
    };
  }

  // MTD (default)
  let q = supabaseAdmin.from('b2b_sales_current_month').select(B2B_MTD_COLS);
  if (wKeys) q = q.in('RM Emp ID', wKeys);
  const { data } = await q.limit(limit * 3);

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

  const members = Array.from(byEmp.values())
    .sort((a, b) => sortBy === 'mtd_asc' ? a.total - b.total : sortBy === 'name' ? a.name.localeCompare(b.name) : b.total - a.total)
    .slice(0, limit)
    .map((r, i) => ({
      rank: i + 1,
      employee_number: r.emp_id,
      name: r.name,
      zone: r.zone,
      branch: r.branch,
      mtd_total_cr: r.total,
      mf_sif_msci_cr: r.mf_sif_msci,
      cob100_cr: r.cob100,
      aif_pms_las_cr: r.aif_pms_las,
      alternate_cr: r.alternate,
    }));

  return {
    period: 'MTD',
    team_size: allowed === 'all' ? 'all' : (allowed as string[]).length,
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

  return {
    vertical: 'B2B',
    sort_by: sortBy,
    total_employees_in_pool: byEmp.size,
    rankings: ranked.map((r, i) => ({
      rank: i + 1,
      employee_number: r.emp_id,
      name: r.name,
      zone: r.zone,
      branch: r.branch,
      total_cr: r.total,
    })),
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

  // 1. Target gap check — uses `targets` table in live schema
  if (runAll || checks.includes('target_gap')) {
    const wKey = ctx.employeeNumber.startsWith('W') ? ctx.employeeNumber : `W${ctx.employeeNumber}`;

    // Fetch current MTD performance
    const { data: mtdRows } = await supabaseAdmin
      .from('b2b_sales_current_month')
      .select(B2B_MTD_COLS)
      .eq('RM Emp ID', wKey);

    const mtdTotal = (mtdRows ?? []).reduce((sum: number, row: any) =>
      sum + (parseFloat(row['Total Net Sales (COB 100%)'] || 0) || 0), 0
    );

    // Fetch target from targets table (live schema)
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
  }

  // 2. Team outlier check
  if (runAll || checks.includes('team_outlier')) {
    const allowed = await resolveAllowedEmployeeNumbers(ctx.employeeNumber, ctx.rowScope);

    if (allowed !== 'all' && (allowed as string[]).length > 1) {
      const wKeys = (allowed as string[]).map(id => id.startsWith('W') ? id : `W${id}`);
      const myWKey = ctx.employeeNumber.startsWith('W') ? ctx.employeeNumber : `W${ctx.employeeNumber}`;

      const { data } = await supabaseAdmin
        .from('b2b_sales_current_month')
        .select(B2B_MTD_COLS)
        .in('RM Emp ID', wKeys);

      // Aggregate by emp
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
          detail: `Team avg MTD: ${avg.toFixed(2)} Cr. Top: ${top.name} (${top.total.toFixed(2)} Cr). Needs attention: ${bottom.name} (${bottom.total.toFixed(2)} Cr).`,
          team_size: members.length,
          team_avg_cr: avg,
          top_performer: { name: top.name, employee_number: top.emp_id, mtd_cr: top.total },
          bottom_performer: { name: bottom.name, employee_number: bottom.emp_id, mtd_cr: bottom.total },
        });
      }
    }
  }

  // 3. Ranking summary
  if (runAll || checks.includes('ranking_summary')) {
    const wKey = ctx.employeeNumber.startsWith('W') ? ctx.employeeNumber : `W${ctx.employeeNumber}`;

    const { data: allMtd } = await supabaseAdmin
      .from('b2b_sales_current_month')
      .select(`"RM Emp ID", "Total Net Sales (COB 100%)"`)
      .limit(5000);

    if (allMtd && allMtd.length > 0) {
      // Aggregate by emp
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

  return {
    insights,
    timestamp: new Date().toISOString(),
    employee_number: ctx.employeeNumber,
  };
}
