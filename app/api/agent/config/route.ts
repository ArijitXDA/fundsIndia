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

    // Get user record
    const { data: user } = await supabaseAdmin
      .from('users')
      .select('id, email, employee_id')
      .eq('id', userId)
      .single();

    if (!user) return NextResponse.json({ config: null });

    // Get employee record via users.employee_id FK — separate query avoids PostgREST join issues
    if (!user.employee_id) return NextResponse.json({ config: null });
    const { data: employee } = await supabaseAdmin
      .from('employees')
      .select('id, employee_number, full_name, work_email, job_title, business_unit, department')
      .eq('id', user.employee_id)
      .single();

    if (!employee) return NextResponse.json({ config: null });

    const employeeId = employee.id;

    // Query view — fresh schema cache, bypasses stale agent_access cache
    const { data: access } = await supabaseAdmin
      .from('agent_access_view')
      .select('*')
      .eq('employee_id', employeeId)
      .eq('is_active', true)
      .single();

    if (!access) return NextResponse.json({ config: null });

    // Fetch persona separately if assigned
    let persona: any = null;
    if (access.persona_id) {
      const { data: p } = await supabaseAdmin
        .from('agent_personas')
        .select('*')
        .eq('id', access.persona_id)
        .single();
      persona = p ?? null;
    }
    const effectiveConfig = {
      accessId: access.id,
      employeeId,
      employee,

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
      // DB column names: override_can_proactively_surface_insights, override_can_make_recommendations
      capabilities: {
        proactiveInsights: access.override_can_proactively_surface_insights
          ?? persona?.can_proactively_surface_insights
          ?? false,
        recommendations: access.override_can_make_recommendations
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
