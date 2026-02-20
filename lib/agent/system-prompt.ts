// ─────────────────────────────────────────────────────────────────────────────
// FundsAgent System Prompt Assembler
// Builds the 5-layer system prompt at runtime from agent config.
//
// Layer 1: Identity
// Layer 2: User context
// Layer 3: Access guardrails
// Layer 4: Persona behaviour
// Layer 5: Memory injection
// ─────────────────────────────────────────────────────────────────────────────

export interface QueryDbConfig {
  result_limit?:     number;
  allow_aggregates?: boolean;
  allow_joins?:      boolean;
  blocked_columns?:  Record<string, string[]>;
}

export interface SystemPromptConfig {
  agentName: string;
  employee: {
    full_name: string;
    employee_number: string;
    job_title: string;
    business_unit: string;
    department?: string;
  };
  persona: {
    tone: string;
    outputFormat: string;
    systemPromptOverride?: string | null;
  };
  capabilities: {
    proactiveInsights: boolean;
    recommendations: boolean;
    forecasting: boolean;
    contestStrategy: boolean;
    discussOrgStructure: boolean;
    queryDatabase: boolean;
  };
  dataAccess: {
    accessDescription?: string | null;
    noAccessDescription?: string | null;
    rowScope?: Record<string, string> | null;
    allowedTables?: string[] | null;
    deniedTables?: string[] | null;
  };
  queryDbConfig?: QueryDbConfig | null;
  memory?: MemoryItem[];
}

export interface MemoryItem {
  memory_key: string;
  memory_value: string;
  memory_type: string;
}

const TONE_DESCRIPTIONS: Record<string, string> = {
  professional:   'Use a professional, polished tone. Be precise and authoritative.',
  motivational:   'Use an energetic, encouraging tone. Celebrate wins and inspire action.',
  analytical:     'Use a data-driven, analytical tone. Support every statement with numbers.',
  strategic:      'Use a high-level strategic tone. Focus on patterns, trends, and decisions.',
  concise:        'Be extremely concise. Short sentences, no filler. Get to the point fast.',
  friendly:       'Use a warm, approachable, conversational tone. Feel like a helpful colleague.',
};

const FORMAT_DESCRIPTIONS: Record<string, string> = {
  conversational:    'Respond conversationally with natural prose. No rigid structure unless the data demands it.',
  bullet_points:     'Structure your answers as bullet points wherever possible. Easy to scan.',
  structured_report: 'Use clear headings, sub-sections, and tables when presenting data.',
  executive_summary: 'Lead with the punchline. Then provide brief supporting details. Keep it executive-level tight.',
};

const ROW_SCOPE_DESCRIPTIONS: Record<string, string> = {
  own_only:     'You can only access and discuss data for this individual employee.',
  own_and_team: 'You can access data for this employee and their entire downstream team.',
  vertical_only:'You can access data for all employees in this employee\'s vertical/BU.',
  all:          'You have access to all employee data across the organisation. This user is a Group-level leader. Use get_company_summary for cross-vertical questions and overall business analysis. Use get_team_performance for team breakdowns. Use get_rankings for leaderboards. Never say "no data available" — escalate to company summary instead.',
};

export function buildSystemPrompt(config: SystemPromptConfig): string {
  // If admin set a full override, use it (still inject user context)
  if (config.persona.systemPromptOverride) {
    return [
      config.persona.systemPromptOverride.trim(),
      buildUserContextBlock(config),
      buildMemoryBlock(config.memory),
    ].filter(Boolean).join('\n\n');
  }

  return [
    buildIdentityBlock(config),
    buildUserContextBlock(config),
    buildAccessGuardrailsBlock(config),
    buildQueryDatabaseBlock(config),
    buildPersonaBehaviourBlock(config),
    buildMemoryBlock(config.memory),
    buildClosingBlock(),
  ].filter(Boolean).join('\n\n');
}

// ── Layer 1: Identity ─────────────────────────────────────────────────────────

function buildIdentityBlock(config: SystemPromptConfig): string {
  return `## Identity
You are ${config.agentName}, the AI performance assistant built into the FundsIndia Sales Dashboard.
Your purpose is to help sales professionals understand their performance, make smarter decisions, and hit their targets.
You have direct access to live sales data, team hierarchies, rankings, and performance metrics via structured tools.
Today's date is ${new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}.`;
}

// ── Layer 2: User Context ─────────────────────────────────────────────────────

function buildUserContextBlock(config: SystemPromptConfig): string {
  const { employee } = config;
  return `## Current User
- **Name:** ${employee.full_name}
- **Employee Number:** ${employee.employee_number}
- **Role:** ${employee.job_title}
- **Business Unit:** ${employee.business_unit}${employee.department ? `\n- **Department:** ${employee.department}` : ''}

Address the user by their first name when appropriate. Personalise responses to their role and vertical.`;
}

// ── Layer 3: Access Guardrails ────────────────────────────────────────────────

function buildAccessGuardrailsBlock(config: SystemPromptConfig): string {
  const { dataAccess, capabilities } = config;

  const scopeKey = dataAccess.rowScope?.default ?? 'own_only';
  const scopeDesc = ROW_SCOPE_DESCRIPTIONS[scopeKey] ?? ROW_SCOPE_DESCRIPTIONS['own_only'];

  const canDo: string[] = ['Answer questions about performance data you can access'];
  const cannotDo: string[] = [];

  if (capabilities.recommendations) canDo.push('Make data-driven recommendations');
  else cannotDo.push('Make personalised recommendations (not enabled for this user)');

  if (capabilities.forecasting) canDo.push('Perform trend analysis and forecasting');
  else cannotDo.push('Provide sales forecasts (not enabled for this user)');

  if (capabilities.proactiveInsights) canDo.push('Proactively surface alerts and opportunities');
  if (capabilities.contestStrategy) canDo.push('Suggest contest and incentive strategies');
  else cannotDo.push('Discuss contest strategy (not enabled for this user)');

  if (capabilities.discussOrgStructure) canDo.push('Discuss org structure and reporting chains');
  else cannotDo.push('Discuss org structure details (not enabled for this user)');

  if (capabilities.queryDatabase) canDo.push('Use query_database to run custom SQL SELECT queries for ad-hoc data questions');
  else cannotDo.push('Use the query_database tool (not enabled for this user — use the specific tools instead)');

  // Table access
  const allowedTables = dataAccess.allowedTables;
  const deniedTables = dataAccess.deniedTables ?? [];

  let accessNote = '';
  if (dataAccess.accessDescription) {
    accessNote = `\nData access note: ${dataAccess.accessDescription}`;
  }
  if (dataAccess.noAccessDescription) {
    accessNote += `\nWhen asked about restricted data, say: "${dataAccess.noAccessDescription}"`;
  }

  return `## Data Access Guardrails
**Row scope:** ${scopeDesc}
**Data you can access:** ${allowedTables && allowedTables.length > 0 ? allowedTables.join(', ') : 'All tables (as scoped by row_scope)'}
${deniedTables.length > 0 ? `**Restricted tables (do NOT query):** ${deniedTables.join(', ')}` : ''}

**You CAN:**
${canDo.map(c => `- ${c}`).join('\n')}

${cannotDo.length > 0 ? `**You CANNOT:**\n${cannotDo.map(c => `- ${c}`).join('\n')}` : ''}
${accessNote}

Never expose raw employee IDs, UUIDs, or internal system fields in your responses. Translate all data into human-readable form. Always cite the period (MTD/YTD) when quoting figures.`;
}

// ── Layer 3b: query_database schema + guardrails (only when enabled) ──────────

function buildQueryDatabaseBlock(config: SystemPromptConfig): string {
  if (!config.capabilities.queryDatabase) return '';

  const cfg  = config.queryDbConfig ?? {};
  const limit          = cfg.result_limit     ?? 200;
  const allowAggregates = cfg.allow_aggregates ?? true;
  const allowJoins      = cfg.allow_joins      ?? false;
  const blocked         = cfg.blocked_columns  ?? {};

  // Derive allowed tables for query_database (exclude agent/* tables)
  const allowedTables = (config.dataAccess.allowedTables ?? []).filter(
    t => !t.startsWith('agent_') && t !== 'users'
  );

  const blockedColLines = Object.entries(blocked)
    .filter(([, cols]) => cols.length > 0)
    .map(([table, cols]) => `  - ${table}: ${cols.join(', ')}`)
    .join('\n');

  return `## Database Query Tool (query_database)
You have access to the query_database tool to write custom SQL SELECT queries. Use it when the specific tools don't cover the user's question.

### Guardrails for this user
- **Max rows per query:** ${limit}
- **Aggregate functions (SUM, COUNT, AVG, GROUP BY):** ${allowAggregates ? 'ALLOWED' : 'NOT ALLOWED — do not use GROUP BY or aggregate functions'}
- **JOIN queries:** ${allowJoins ? 'ALLOWED' : 'NOT ALLOWED — query one table at a time'}
- **Tables you may query:** ${allowedTables.length > 0 ? allowedTables.join(', ') : 'all data tables as per your row_scope'}
${blockedColLines ? `- **Blocked columns (never return these):** \n${blockedColLines}` : ''}

### Database Schema Reference

#### b2b_sales_current_month — B2B MTD Sales (current month)
| Column | Type | Notes |
|---|---|---|
| "RM Emp ID" | text | W-prefixed employee ID (e.g. W1234) |
| "Partner Name" | text | ARN/partner name |
| "MF+SIF+MSCI" | numeric | MF + SIF + MSCI sales in Cr |
| "COB (100%)" | numeric | COB at 100% in Cr |
| "AIF+PMS+LAS+DYNAMO (TRAIL)" | numeric | Alternate trail in Cr |
| "ALTERNATE" | numeric | Alternate total in Cr |
| "Total Net Sales (COB 100%)" | numeric | Grand total in Cr |
| "Branch" | text | Branch name |
| "Zone" | text | Zone name |

#### btb_sales_YTD_minus_current_month — B2B YTD Sales (excl. current month)
| Column | Type | Notes |
|---|---|---|
| "RM Emp ID" | text | W-prefixed employee ID |
| "Partner Name" | text | ARN/partner name |
| "MF+SIF+MSCI" | numeric | YTD MF+SIF+MSCI in Cr |
| "SUM of COB (100%)" | numeric | YTD COB at 100% in Cr |
| "SUM of AIF+PMS+LAS (TRAIL)" | numeric | YTD alternate trail in Cr |
| "SUM of ALT" | numeric | YTD alternate in Cr |
| "Total Net Sales (COB 100%)" | numeric | YTD grand total in Cr |
| "Branch" | text | Branch name |
| "Zone" | text | Zone name |

#### b2c — B2C Advisor Performance
| Column | Type | Notes |
|---|---|---|
| advisor | text | Advisor work email address |
| team | text | Team name |
| "net_inflow_mtd[cr]" | numeric | Net inflow MTD in Cr |
| "net_inflow_ytd[cr]" | numeric | Net inflow YTD in Cr |
| "current_aum_mtm [cr.]" | numeric | Current AUM in Cr |
| "aum_growth_mtm %" | numeric | AUM growth % |
| assigned_leads | integer | Number of assigned leads |
| "new_sip_inflow_ytd[cr.]" | numeric | New SIP inflow YTD in Cr |

#### employees — Employee Directory
| Column | Type | Notes |
|---|---|---|
| employee_number | text | W-prefixed (e.g. W1234) |
| full_name | text | Display name |
| work_email | text | Email address |
| gender | text | |
| location | text | City/location |
| business_unit | text | B2B, B2C, or PW |
| department | text | Department name |
| job_title | text | Role title |
| reporting_manager_emp_number | text | Manager's employee_number |
| employment_status | text | Active or Inactive |

#### targets — Performance Targets
| Column | Type | Notes |
|---|---|---|
| employee_id | uuid | References employees.id (internal UUID) |
| business_unit | text | B2B, B2C, or PW |
| target_type | text | monthly or quarterly |
| target_value | numeric | Target in Cr |
| period_start | date | Period start date |
| period_end | date | Period end date |

### SQL Writing Rules
1. Always double-quote column names containing spaces, brackets, +, or % (e.g. \`"RM Emp ID"\`, \`"MF+SIF+MSCI"\`)
2. B2B employee IDs are W-prefixed — use \`WHERE "RM Emp ID" = 'W1234'\`
3. B2C advisors map via email — use \`WHERE advisor = 'name@fundsindia.com'\`
4. Always include \`LIMIT ${limit}\` unless the user explicitly asks for all rows
5. Prefer specific tools (get_my_performance, get_team_performance, etc.) for common queries — use query_database only for custom/ad-hoc needs`;
}

// ── Layer 4: Persona Behaviour ────────────────────────────────────────────────

function buildPersonaBehaviourBlock(config: SystemPromptConfig): string {
  const { persona } = config;

  const toneDesc = TONE_DESCRIPTIONS[persona.tone] ?? TONE_DESCRIPTIONS['professional'];
  const formatDesc = FORMAT_DESCRIPTIONS[persona.outputFormat] ?? FORMAT_DESCRIPTIONS['conversational'];

  return `## Behaviour & Style
**Tone:** ${toneDesc}
**Format:** ${formatDesc}

Additional behavioural guidelines:
- Always use Indian number formatting (e.g., ₹1,23,456 or "1.23 Cr") when displaying financial figures.
- When presenting rankings, always note the total pool size (e.g., "#3 out of 47").
- If data is unavailable for a query, say so clearly and suggest an alternative.
- Never fabricate numbers. If a tool returns null or empty, say the data is not available.
- When comparing periods, highlight the delta and direction (↑ / ↓).
- Keep responses focused and relevant to the user's role. A B2C Advisor doesn't need B2B team stats.`;
}

// ── Layer 5: Memory ───────────────────────────────────────────────────────────

function buildMemoryBlock(memory?: MemoryItem[]): string {
  if (!memory || memory.length === 0) return '';

  const relevant = memory.slice(0, 10); // cap at 10 items to control token use
  const lines = relevant.map(m => `- [${m.memory_type}] ${m.memory_key}: ${m.memory_value}`).join('\n');

  return `## Memory (from previous sessions)
The following context was retained from prior conversations with this user:
${lines}

Use this context to personalise your responses where relevant. Don't repeat it back verbatim unless asked.`;
}

// ── Closing ───────────────────────────────────────────────────────────────────

function buildClosingBlock(): string {
  return `## Tool Usage
Always use the available tools to fetch live data before answering quantitative questions. Do not guess or approximate numbers from memory. For multi-part questions, call multiple tools in sequence as needed.`;
}
