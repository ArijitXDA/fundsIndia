// GET /api/agent/config
// Returns the FundsAgent config for the currently logged-in user.
// Used by the dashboard widget and /agent page on load.
// Returns null if the user has no agent access.

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const sessionCookie = request.cookies.get('session');
    if (!sessionCookie) return NextResponse.json({ config: null }, { status: 200 });

    const { userId } = JSON.parse(sessionCookie.value);

    // Get user → employee link
    const { data: user } = await supabaseAdmin
      .from('users')
      .select('id, email, employee:employees(id, employee_number, full_name, work_email, job_title, business_unit, department)')
      .eq('id', userId)
      .single();

    if (!user?.employee) return NextResponse.json({ config: null });

    const employeeId = (user.employee as any).id;

    // Get agent access record for this employee
    const { data: access } = await supabaseAdmin
      .from('agent_access')
      .select(`
        *,
        persona:agent_personas(*)
      `)
      .eq('employee_id', employeeId)
      .eq('is_active', true)
      .single();

    if (!access) return NextResponse.json({ config: null });

    // Merge persona capability flags with per-employee overrides
    const persona = access.persona as any;
    const effectiveConfig = {
      accessId: access.id,
      employeeId,
      employee: user.employee,

      // Persona details
      persona: persona ? {
        id: persona.id,
        name: persona.name,
        agentName: persona.agent_name,
        tone: persona.tone,
        outputFormat: persona.output_format,
        model: persona.model,
        temperature: persona.temperature,
        topP: persona.top_p,
        maxTokens: persona.max_tokens,
        presencePenalty: persona.presence_penalty,
        frequencyPenalty: persona.frequency_penalty,
        systemPromptOverride: persona.system_prompt_override,
      } : null,

      // Effective capability flags (override > persona > false)
      // DB column names: override_proactive_insights, override_recommendations
      capabilities: {
        proactiveInsights: access.override_proactive_insights
          ?? persona?.can_proactively_surface_insights
          ?? false,
        recommendations: access.override_recommendations
          ?? persona?.can_make_recommendations
          ?? false,
        forecasting:          persona?.can_do_forecasting          ?? false,
        contestStrategy:      persona?.can_suggest_contest_strategy ?? false,
        discussOrgStructure:  persona?.can_discuss_org_structure    ?? false,
      },

      // Data access scope (enforced by the query engine)
      dataAccess: {
        accessDescription:   access.access_description,
        noAccessDescription: access.no_access_description,
        allowedTables:       access.allowed_tables,
        deniedTables:        access.denied_tables,
        columnFilters:       access.column_filters,
        rowScope:            access.row_scope,
      },

      // Widget settings
      widget: {
        showOnDashboard: access.show_widget_on_dashboard,
        greeting: access.widget_greeting,
      },
    };

    return NextResponse.json({ config: effectiveConfig });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
