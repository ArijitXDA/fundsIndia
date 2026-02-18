import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // Get B2C advisory data
    const { data: b2cData, error: b2cError } = await supabaseAdmin
      .from('b2c')
      .select('*');

    if (b2cError) {
      return NextResponse.json({
        error: 'Failed to fetch B2C data',
        details: b2cError,
      }, { status: 500 });
    }

    if (!b2cData || b2cData.length === 0) {
      return NextResponse.json({
        success: true,
        summary: {
          totalAdvisors: 0,
          totalNetInflowMTD: '0.00',
          totalNetInflowYTD: '0.00',
          totalCurrentAUM: '0.00',
          totalAssignedLeads: 0,
        },
        top10Performers: [],
        allAdvisors: [],
      });
    }

    // Process and enrich data
    const advisors = b2cData.map(row => ({
      advisor: row.advisor || 'Unknown',
      team: row.team || 'N/A',
      assignedLeads: parseFloat(row.assigned_leads || 0),
      netInflowMTD: parseFloat(row['net_inflow_mtd[cr]'] || 0),
      netInflowYTD: parseFloat(row['net_inflow_ytd[cr]'] || 0),
      currentAUM: parseFloat(row['current_aum_mtm [cr.]'] || 0),
      aumGrowthPct: parseFloat(row['aum_growth_mtm %'] || 0),
      sipBookAO: parseFloat(row['total_sip_book_ao_31stmarch[cr.]'] || 0),
      newSIPInflowMTD: parseFloat(row['new_sip_inflow_mtd[cr.]'] || 0),
      newSIPInflowYTD: parseFloat(row['new_sip_inflow_ytd[cr.]'] || 0),
      assignedAUMAO: parseFloat(row['assigned_aum_ao_31stmarch[cr.]'] || 0),
      ytdNetAUMGrowthPct: parseFloat(row['ytd_net_aum_growth %'] || 0),
    }));

    // Sort by Net Inflow YTD (primary metric for B2C)
    advisors.sort((a, b) => b.netInflowYTD - a.netInflowYTD);

    // Get top 10
    const top10 = advisors.slice(0, 10);

    // Calculate summary stats
    const totalNetInflowMTD = advisors.reduce((sum, adv) => sum + adv.netInflowMTD, 0);
    const totalNetInflowYTD = advisors.reduce((sum, adv) => sum + adv.netInflowYTD, 0);
    const totalCurrentAUM = advisors.reduce((sum, adv) => sum + adv.currentAUM, 0);
    const totalAssignedLeads = advisors.reduce((sum, adv) => sum + adv.assignedLeads, 0);

    return NextResponse.json({
      success: true,
      summary: {
        totalAdvisors: advisors.length,
        totalNetInflowMTD: totalNetInflowMTD.toFixed(2),
        totalNetInflowYTD: totalNetInflowYTD.toFixed(2),
        totalCurrentAUM: totalCurrentAUM.toFixed(2),
        totalAssignedLeads: Math.round(totalAssignedLeads),
      },
      top10Performers: top10.map((adv, index) => ({
        rank: index + 1,
        advisor: adv.advisor,
        team: adv.team,
        netInflowMTD: adv.netInflowMTD.toFixed(2),
        netInflowYTD: adv.netInflowYTD.toFixed(2),
        currentAUM: adv.currentAUM.toFixed(2),
        aumGrowthPct: adv.aumGrowthPct.toFixed(2),
        assignedLeads: Math.round(adv.assignedLeads),
        newSIPInflowYTD: adv.newSIPInflowYTD.toFixed(3),
      })),
      allAdvisors: advisors.map((adv, index) => ({ ...adv, rank: index + 1 })),
    });
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: error.message,
      stack: error.stack,
    }, { status: 500 });
  }
}
