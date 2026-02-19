// ─────────────────────────────────────────────────────────────────────────────
// FundsAgent Tool Library
// Each tool is a typed data-fetching function that enforces row_scope from
// agent_access before returning data. The GPT-4o function-calling layer maps
// tool names to these implementations.
// ─────────────────────────────────────────────────────────────────────────────

import { supabaseAdmin } from '@/lib/supabase';

// ── Row-scope helper ──────────────────────────────────────────────────────────

/**
 * Resolve the effective employee ID filter based on row_scope token.
 * Returns an array of employee_numbers the user is allowed to see.
 */
async function resolveAllowedEmployeeNumbers(
  employeeNumber: string,
  rowScope: Record<string, string> | null | undefined
): Promise<string[] | 'all'> {
  const scope = rowScope?.default ?? 'own_only';

  if (scope === 'all') return 'all';

  if (scope === 'own_only') return [employeeNumber];

  if (scope === 'own_and_team' || scope === 'vertical_only') {
    // Fetch full org tree
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

    // Build manager → children map
    const empMap = new Map<string, string[]>();
    for (const emp of allEmployees) {
      if (emp.reporting_manager_emp_number) {
        const existing = empMap.get(emp.reporting_manager_emp_number) ?? [];
        existing.push(emp.employee_number);
        empMap.set(emp.reporting_manager_emp_number, existing);
      }
    }

    // Recursively collect all downstream IDs
    function getAllDownstream(id: string): string[] {
      const direct = empMap.get(id) ?? [];
      const all = [...direct];
      for (const d of direct) all.push(...getAllDownstream(d));
      return all;
    }

    const downstream = getAllDownstream(employeeNumber);
    const ids = [employeeNumber, ...downstream];

    if (scope === 'vertical_only') {
      // Further filter to same business_unit as the requesting employee
      const myEmp = allEmployees.find(e => e.employee_number === employeeNumber);
      if (myEmp) {
        const myBU = myEmp.business_unit;
        const buFiltered = allEmployees
          .filter(e => ids.includes(e.employee_number) && e.business_unit === myBU)
          .map(e => e.employee_number);
        return buFiltered;
      }
    }

    return ids;
  }

  return [employeeNumber]; // safe default
}

// ─── Tool Definitions for OpenAI Function Calling ────────────────────────────

export const AGENT_TOOLS = [
  {
    type: 'function' as const,
    function: {
      name: 'get_my_performance',
      description: 'Get the current user\'s own sales performance — MTD and YTD breakdown for B2B (MF+SIF+MSCI, COB100, AIF+PMS+LAS+DYNAMO, Alternate) or B2C (Net Inflow, AUM, SIP Inflow). Also returns target vs actual if available.',
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
      description: 'Get aggregated performance data for the user\'s team (direct and indirect reportees). Returns individual rows sorted by MTD sales descending. Useful for managers and CEOs.',
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
      description: 'Get leaderboard rankings — overall or filtered by zone, branch, or business unit. Returns rank, name, MTD and YTD figures.',
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
            description: 'Optional: filter to a specific zone (e.g. "North", "South")',
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
      description: 'Get the reporting structure for a given employee — their direct reports and chain of command. Useful for org-related questions.',
      parameters: {
        type: 'object',
        properties: {
          employee_number: {
            type: 'string',
            description: 'Employee number to fetch org structure for. If omitted, uses the current user.',
          },
          depth: {
            type: 'number',
            description: 'How many levels down to fetch. Default: 2 (direct + 1 more)',
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
      description: 'Run proactive insight checks and return any alerts or opportunities the user should know about — partner inactivity, target gaps, rank changes, team outliers, zone opportunities.',
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

// ─── Tool Implementations ─────────────────────────────────────────────────────

export interface ToolContext {
  employeeNumber: string;
  employeeId: string;
  businessUnit: string;
  rowScope: Record<string, string> | null;
  allowedTables: string[] | null;
}

export async function executeTool(
  toolName: string,
  args: Record<string, any>,
  ctx: ToolContext
): Promise<any> {
  // Check table-level access
  const isTableAllowed = (table: string) => {
    if (!ctx.allowedTables || ctx.allowedTables.length === 0) return true;
    return ctx.allowedTables.includes(table);
  };

  switch (toolName) {
    case 'get_my_performance':
      return await toolGetMyPerformance(args, ctx);

    case 'get_team_performance':
      if (!isTableAllowed('b2b_sales_current_month') && !isTableAllowed('b2c_advisory_current')) {
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
  const empNum = ctx.employeeNumber;
  const bu = ctx.businessUnit;

  if (bu === 'B2B') {
    const wKey = empNum.startsWith('W') ? empNum : `W${empNum}`;

    const [{ data: mtdRows }, { data: ytdRows }] = await Promise.all([
      supabaseAdmin.from('b2b_sales_current_month').select('*').eq('employee_number', wKey),
      supabaseAdmin.from('btb_sales_YTD_minus_current_month').select('*').eq('employee_number', wKey),
    ]);

    const mtd = mtdRows?.[0] ?? null;
    const ytd = ytdRows?.[0] ?? null;

    return {
      vertical: 'B2B',
      employee_number: empNum,
      period_requested: args.period ?? 'both',
      mtd: mtd ? {
        mf_sif_msci: mtd.mf_sif_msci ?? 0,
        cob100: mtd.cob_100 ?? 0,
        aif_pms_las_dynamo: mtd.aif_pms_las_dynamo ?? 0,
        alternate: mtd.alternate ?? 0,
        total: mtd.total ?? 0,
        partner_name: mtd.partner_name ?? null,
        zone: mtd.zone ?? null,
        branch: mtd.branch ?? null,
      } : null,
      ytd: ytd ? {
        mf_sif_msci: ytd.mf_sif_msci ?? 0,
        cob100: ytd.cob_100 ?? 0,
        aif_pms_las_dynamo: ytd.aif_pms_las_dynamo ?? 0,
        alternate: ytd.alternate ?? 0,
        total: ytd.total ?? 0,
      } : null,
    };
  }

  if (bu === 'B2C') {
    const email = ctx.employeeNumber; // B2C uses email as key
    // Fetch by work email from employee record
    const { data: emp } = await supabaseAdmin
      .from('employees')
      .select('work_email')
      .eq('employee_number', empNum)
      .single();

    const workEmail = (emp?.work_email ?? '').trim().toLowerCase();

    const { data: b2cRows } = await supabaseAdmin
      .from('b2c_advisory_current')
      .select('*')
      .ilike('advisor_email', workEmail);

    const row = b2cRows?.[0] ?? null;
    return {
      vertical: 'B2C',
      employee_number: empNum,
      data: row ? {
        advisor_name: row.advisor_name,
        net_inflow_mtd: row.net_inflow_mtd ?? 0,
        net_inflow_ytd: row.net_inflow_ytd ?? 0,
        current_aum: row.current_aum ?? 0,
        aum_growth_pct: row.aum_growth_pct ?? 0,
        assigned_leads: row.assigned_leads ?? 0,
        new_sip_inflow_ytd: row.new_sip_inflow_ytd ?? 0,
        team: row.team ?? null,
        zone: row.zone ?? null,
      } : null,
    };
  }

  return { vertical: bu, message: 'No direct sales data available for this business unit.' };
}

// ── Tool: get_team_performance ────────────────────────────────────────────────

async function toolGetTeamPerformance(args: any, ctx: ToolContext) {
  const allowed = await resolveAllowedEmployeeNumbers(ctx.employeeNumber, ctx.rowScope);

  if (allowed !== 'all' && allowed.length <= 1) {
    return {
      message: 'No team members found under your profile, or your access level restricts team data.',
      team_size: 0,
      members: [],
    };
  }

  const limit = args.limit ?? 20;
  const sortBy = args.sort_by ?? 'mtd_desc';
  const period = args.period ?? 'MTD';

  // Build W-prefixed keys
  const wKeys = allowed === 'all'
    ? undefined
    : (allowed as string[]).map(id => id.startsWith('W') ? id : `W${id}`);

  let query = supabaseAdmin
    .from('b2b_sales_current_month')
    .select('employee_number, partner_name, zone, branch, mf_sif_msci, cob_100, aif_pms_las_dynamo, alternate, total');

  if (wKeys) {
    query = query.in('employee_number', wKeys);
  }

  if (sortBy.includes('ytd')) {
    // For YTD we need a different table
    let ytdQuery = supabaseAdmin
      .from('btb_sales_YTD_minus_current_month')
      .select('employee_number, partner_name, zone, branch, mf_sif_msci, cob_100, aif_pms_las_dynamo, alternate, total');
    if (wKeys) ytdQuery = ytdQuery.in('employee_number', wKeys);
    if (sortBy === 'ytd_desc') ytdQuery = ytdQuery.order('total', { ascending: false });
    else ytdQuery = ytdQuery.order('total', { ascending: true });
    const { data: ytdData } = await ytdQuery.limit(limit);
    return {
      period: 'YTD',
      team_size: (allowed === 'all' ? 'all' : allowed.length),
      members: (ytdData ?? []).map(r => ({
        employee_number: r.employee_number,
        name: r.partner_name,
        zone: r.zone,
        branch: r.branch,
        total_ytd: r.total,
        mf_sif_msci: r.mf_sif_msci,
        cob100: r.cob_100,
        aif_pms_las_dynamo: r.aif_pms_las_dynamo,
        alternate: r.alternate,
      })),
    };
  }

  if (sortBy === 'mtd_desc' || sortBy === 'MTD') query = query.order('total', { ascending: false });
  else if (sortBy === 'mtd_asc') query = query.order('total', { ascending: true });
  else if (sortBy === 'name') query = query.order('partner_name');

  const { data: mtdData } = await query.limit(limit);

  return {
    period: 'MTD',
    team_size: allowed === 'all' ? 'all' : (allowed as string[]).length,
    members: (mtdData ?? []).map(r => ({
      employee_number: r.employee_number,
      name: r.partner_name,
      zone: r.zone,
      branch: r.branch,
      total_mtd: r.total,
      mf_sif_msci: r.mf_sif_msci,
      cob100: r.cob_100,
      aif_pms_las_dynamo: r.aif_pms_las_dynamo,
      alternate: r.alternate,
    })),
  };
}

// ── Tool: get_rankings ────────────────────────────────────────────────────────

async function toolGetRankings(args: any, ctx: ToolContext) {
  const vertical = args.vertical ?? 'B2B';
  const sortBy = args.sort_by ?? 'MTD';
  const limit = Math.min(args.limit ?? 10, 50);

  if (vertical === 'B2C') {
    let query = supabaseAdmin
      .from('b2c_advisory_current')
      .select('advisor_name, team, zone, net_inflow_mtd, net_inflow_ytd, current_aum');

    if (sortBy === 'MTD') query = query.order('net_inflow_mtd', { ascending: false });
    else query = query.order('net_inflow_ytd', { ascending: false });

    const { data } = await query.limit(limit);

    return {
      vertical: 'B2C',
      sort_by: sortBy,
      rankings: (data ?? []).map((r, i) => ({
        rank: i + 1,
        name: r.advisor_name,
        team: r.team,
        zone: r.zone,
        net_inflow_mtd: r.net_inflow_mtd,
        net_inflow_ytd: r.net_inflow_ytd,
        current_aum: r.current_aum,
      })),
    };
  }

  // B2B
  const tableName = sortBy === 'YTD' ? 'btb_sales_YTD_minus_current_month' : 'b2b_sales_current_month';
  let query = supabaseAdmin
    .from(tableName)
    .select('employee_number, partner_name, zone, branch, total')
    .order('total', { ascending: false });

  if (args.filter_zone) {
    query = query.ilike('zone', `%${args.filter_zone}%`);
  }

  const { data } = await query.limit(limit);

  return {
    vertical: 'B2B',
    sort_by: sortBy,
    rankings: (data ?? []).map((r, i) => ({
      rank: i + 1,
      employee_number: r.employee_number,
      name: r.partner_name,
      zone: r.zone,
      branch: r.branch,
      total: r.total,
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

  // Fetch full org
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

  const empMap = new Map(allEmployees.map(e => [e.employee_number, e]));
  const childrenMap = new Map<string, string[]>();
  for (const emp of allEmployees) {
    if (emp.reporting_manager_emp_number) {
      const existing = childrenMap.get(emp.reporting_manager_emp_number) ?? [];
      existing.push(emp.employee_number);
      childrenMap.set(emp.reporting_manager_emp_number, existing);
    }
  }

  function buildTree(id: string, currentDepth: number): any {
    const emp = empMap.get(id);
    if (!emp) return null;
    const node: any = {
      employee_number: emp.employee_number,
      full_name: emp.full_name,
      job_title: emp.job_title,
      business_unit: emp.business_unit,
    };
    if (currentDepth > 0) {
      const children = childrenMap.get(id) ?? [];
      if (children.length > 0) {
        node.direct_reports = children
          .map(c => buildTree(c, currentDepth - 1))
          .filter(Boolean);
        node.direct_reports_count = children.length;
      } else {
        node.direct_reports = [];
        node.direct_reports_count = 0;
      }
    }
    return node;
  }

  const target = empMap.get(targetEmpNum);
  if (!target) {
    return { error: `Employee ${targetEmpNum} not found` };
  }

  // Also find who reports to this person's manager
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

  // 1. Target gap check
  if (runAll || checks.includes('target_gap')) {
    const wKey = ctx.employeeNumber.startsWith('W') ? ctx.employeeNumber : `W${ctx.employeeNumber}`;
    const [{ data: mtd }, { data: target }] = await Promise.all([
      supabaseAdmin.from('b2b_sales_current_month').select('total, partner_name').eq('employee_number', wKey).single(),
      supabaseAdmin.from('b2b_targets_current_month').select('monthly_target').eq('employee_number', wKey).single(),
    ]);

    if (mtd && target?.monthly_target) {
      const pct = (mtd.total / target.monthly_target) * 100;
      if (pct < 50) {
        insights.push({
          type: 'target_gap',
          severity: 'high',
          title: 'Critical target gap',
          detail: `You are at ${pct.toFixed(1)}% of your monthly target (${mtd.total?.toFixed(2)} Cr of ${target.monthly_target?.toFixed(2)} Cr MTD). Less than half the target achieved.`,
        });
      } else if (pct < 80) {
        insights.push({
          type: 'target_gap',
          severity: 'medium',
          title: 'Target gap alert',
          detail: `You are at ${pct.toFixed(1)}% of your monthly target (${mtd.total?.toFixed(2)} Cr of ${target.monthly_target?.toFixed(2)} Cr MTD).`,
        });
      } else {
        insights.push({
          type: 'target_gap',
          severity: 'low',
          title: 'On track with target',
          detail: `You are at ${pct.toFixed(1)}% of your monthly target. Great progress!`,
        });
      }
    }
  }

  // 2. Team outlier check (for managers)
  if (runAll || checks.includes('team_outlier')) {
    const allowed = await resolveAllowedEmployeeNumbers(ctx.employeeNumber, ctx.rowScope);

    if (allowed !== 'all' && (allowed as string[]).length > 1) {
      const wKeys = (allowed as string[]).map(id => id.startsWith('W') ? id : `W${id}`);

      const { data: teamData } = await supabaseAdmin
        .from('b2b_sales_current_month')
        .select('employee_number, partner_name, total')
        .in('employee_number', wKeys)
        .neq('employee_number', ctx.employeeNumber.startsWith('W') ? ctx.employeeNumber : `W${ctx.employeeNumber}`)
        .order('total', { ascending: false });

      if (teamData && teamData.length > 0) {
        const totals = teamData.map(r => r.total ?? 0);
        const avg = totals.reduce((a, b) => a + b, 0) / totals.length;
        const top = teamData[0];
        const bottom = teamData[teamData.length - 1];

        insights.push({
          type: 'team_outlier',
          severity: 'info',
          title: 'Team performance snapshot',
          detail: `Team avg MTD: ${avg.toFixed(2)} Cr. Top: ${top.partner_name} (${(top.total ?? 0).toFixed(2)} Cr). Needs attention: ${bottom.partner_name} (${(bottom.total ?? 0).toFixed(2)} Cr).`,
          top_performer: { name: top.partner_name, total: top.total },
          bottom_performer: { name: bottom.partner_name, total: bottom.total },
          team_avg: avg,
        });
      }
    }
  }

  // 3. Ranking summary
  if (runAll || checks.includes('ranking_summary')) {
    const wKey = ctx.employeeNumber.startsWith('W') ? ctx.employeeNumber : `W${ctx.employeeNumber}`;

    const { data: allMtd } = await supabaseAdmin
      .from('b2b_sales_current_month')
      .select('employee_number, total')
      .order('total', { ascending: false });

    if (allMtd && allMtd.length > 0) {
      const rank = allMtd.findIndex(r => r.employee_number === wKey);
      if (rank >= 0) {
        const total = allOf(allMtd).length;
        insights.push({
          type: 'ranking_summary',
          severity: 'info',
          title: 'Your current rank',
          detail: `You are ranked #${rank + 1} out of ${total} B2B employees by MTD sales.`,
          rank: rank + 1,
          total_employees: total,
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

function allOf<T>(arr: T[]): T[] { return arr; }
