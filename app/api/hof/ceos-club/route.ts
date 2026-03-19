// GET /api/hof/ceos-club
// Returns CEO's Club rankings for the current active HOF quarter.
//
// Visibility rules (based on employee.business_unit):
//   B2B / Partners  → only B2B segment returned
//   B2C / Digital   → only B2C segment returned
//   anything else   → both segments returned
//
// B2B primary ranking metric : Trail Net Sales (COB 50%) % of quarterly target
// B2C primary ranking metric : Net Inflow MTD % of quarterly target
// CEO's Club       : Top 20% of each segment (min 1 person)

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

// ── Auth helper ───────────────────────────────────────────────────────────────

async function getSession(request: NextRequest) {
  const sessionCookie = request.cookies.get('session');
  if (!sessionCookie) return null;
  try {
    const session = JSON.parse(sessionCookie.value);
    const { data: user } = await supabaseAdmin
      .from('users')
      .select('*, employee:employees(id, full_name, business_unit, employee_number)')
      .eq('id', session.userId)
      .single();
    if (!user) return null;
    return { userId: session.userId, user };
  } catch {
    return null;
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseNum(val: unknown): number {
  if (val == null || val === '') return 0;
  const n = parseFloat(String(val).replace(/,/g, ''));
  return isNaN(n) ? 0 : n;
}

function pct(actual: number, target: number): number {
  if (target <= 0) return 0;
  return parseFloat(((actual / target) * 100).toFixed(2));
}

function getSegmentFilter(businessUnit: string | null): 'b2b' | 'b2c' | 'all' {
  if (!businessUnit) return 'all';
  const bu = businessUnit.toLowerCase();
  if (bu.includes('b2b') || bu.includes('partner')) return 'b2b';
  if (bu.includes('b2c') || bu.includes('digital')) return 'b2c';
  return 'all';
}

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const session = await getSession(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Fetch active quarter config
  const { data: quarter, error: qErr } = await supabaseAdmin
    .from('hof_quarter_config')
    .select('*')
    .eq('is_active', true)
    .single();

  if (qErr || !quarter) {
    return NextResponse.json({ error: 'No active quarter configured' }, { status: 404 });
  }

  const businessUnit = (session.user as any).employee?.business_unit ?? null;
  const userSegment = getSegmentFilter(businessUnit);

  const result: {
    quarter: typeof quarter;
    userSegment: 'b2b' | 'b2c' | 'all';
    b2b: any[] | null;
    b2c: any[] | null;
  } = { quarter, userSegment, b2b: null, b2c: null };

  // ── B2B rankings ──────────────────────────────────────────────────────────
  if (userSegment === 'b2b' || userSegment === 'all') {
    const { data: rows } = await supabaseAdmin
      .from('b2b_sales_current_month')
      .select(
        '"RM", "BM", "Branch", "Zone", "Total Net Sales (COB 50%)", "AIF+PMS+LAS+DYNAMO (TRAIL)"'
      );

    if (rows && rows.length > 0) {
      const rmMap = new Map<
        string,
        { rm: string; bm: string; branch: string; zone: string; trail: number; fees: number }
      >();

      for (const row of rows) {
        const rm = String((row as any)['RM'] ?? '').trim();
        if (!rm) continue;
        const lower = rm.toLowerCase();
        if (lower === 'total' || lower === 'grand total' || lower === 'subtotal') continue;

        const existing = rmMap.get(rm) ?? {
          rm,
          bm:     String((row as any)['BM']     ?? '').trim(),
          branch: String((row as any)['Branch'] ?? '').trim(),
          zone:   String((row as any)['Zone']   ?? '').trim(),
          trail: 0,
          fees:  0,
        };
        existing.trail += parseNum((row as any)['Total Net Sales (COB 50%)']);
        existing.fees  += parseNum((row as any)['AIF+PMS+LAS+DYNAMO (TRAIL)']);
        rmMap.set(rm, existing);
      }

      const trailTarget = Number(quarter.b2b_trail_target);
      const feesTarget  = Number(quarter.b2b_fees_target);

      const entries = Array.from(rmMap.values()).map(e => {
        const trail_pct       = pct(e.trail, trailTarget);
        const fees_pct        = pct(e.fees,  feesTarget);
        const achievement_pct = trail_pct; // primary = trail
        return {
          name:            e.rm,
          bm:              e.bm,
          branch:          e.branch,
          zone:            e.zone,
          trail_actual:    parseFloat(e.trail.toFixed(4)),
          fees_actual:     parseFloat(e.fees.toFixed(4)),
          trail_target:    trailTarget,
          fees_target:     feesTarget,
          trail_pct,
          fees_pct,
          achievement_pct,
        };
      });

      // Sort descending; break ties alphabetically
      entries.sort(
        (a, b) => b.achievement_pct - a.achievement_pct || a.name.localeCompare(b.name)
      );

      const clubCount = Math.max(1, Math.ceil(entries.length * 0.2));
      result.b2b = entries.map((e, i) => ({
        ...e,
        rank: i + 1,
        is_ceos_club: i < clubCount,
      }));
    } else {
      result.b2b = [];
    }
  }

  // ── B2C rankings ──────────────────────────────────────────────────────────
  if (userSegment === 'b2c' || userSegment === 'all') {
    const { data: rows } = await supabaseAdmin
      .from('b2c')
      .select('"team", "advisor", "net_inflow_mtd[cr]", "new_sip_inflow_mtd[cr.]"');

    if (rows && rows.length > 0) {
      const netSalesTarget = Number(quarter.b2c_net_new_sales_target);
      const sipsTarget     = Number(quarter.b2c_net_new_sips_target);

      const entries = rows
        .filter(r => {
          const adv = String((r as any)['advisor'] ?? '').trim();
          if (!adv) return false;
          const lower = adv.toLowerCase();
          return lower !== 'total' && lower !== 'grand total';
        })
        .map(r => {
          const net_sales = parseNum((r as any)['net_inflow_mtd[cr]']);
          const net_sips  = parseNum((r as any)['new_sip_inflow_mtd[cr.]']);
          const net_sales_pct    = pct(net_sales, netSalesTarget);
          const net_sips_pct     = pct(net_sips,  sipsTarget);
          const achievement_pct  = net_sales_pct; // primary = net new sales
          return {
            name:               String((r as any)['advisor']).trim(),
            team:               String((r as any)['team'] ?? '').trim(),
            net_sales_actual:   parseFloat(net_sales.toFixed(4)),
            net_sips_actual:    parseFloat(net_sips.toFixed(4)),
            net_sales_target:   netSalesTarget,
            net_sips_target:    sipsTarget,
            net_sales_pct,
            net_sips_pct,
            achievement_pct,
          };
        });

      entries.sort(
        (a, b) => b.achievement_pct - a.achievement_pct || a.name.localeCompare(b.name)
      );

      const clubCount = Math.max(1, Math.ceil(entries.length * 0.2));
      result.b2c = entries.map((e, i) => ({
        ...e,
        rank: i + 1,
        is_ceos_club: i < clubCount,
      }));
    } else {
      result.b2c = [];
    }
  }

  return NextResponse.json(result);
}
