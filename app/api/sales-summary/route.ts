import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // Get current month data
    const { data: currentMonth, error: currentError } = await supabaseAdmin
      .from('b2b_sales_current_month')
      .select('*');

    // Get YTD data
    const { data: ytdData, error: ytdError } = await supabaseAdmin
      .from('btb_sales_YTD_minus_current_month')
      .select('*');

    if (currentError || ytdError) {
      return NextResponse.json({
        error: 'Failed to fetch sales data',
        details: { currentError, ytdError },
      }, { status: 500 });
    }

    // Group by RM Emp ID and calculate totals
    const salesByEmployee = new Map();

    // Process current month data
    currentMonth?.forEach(row => {
      const empId = row['RM Emp ID'];
      if (!empId || empId === '#N/A') return;

      if (!salesByEmployee.has(empId)) {
        salesByEmployee.set(empId, {
          employeeId: empId,
          employeeName: row['RM'],
          branch: row['Branch'],
          zone: row['Zone'],
          bm: row['BM'],
          rgm: row['RGM'],
          zm: row['ZM'],
          mtd: 0,
          ytdPrevious: 0,
          ytdTotal: 0,
        });
      }

      const empData = salesByEmployee.get(empId);
      empData.mtd += parseFloat(row['Total Net Sales (COB 100%)'] || 0);
    });

    // Process YTD data (excluding current month)
    ytdData?.forEach(row => {
      const empId = row['RM Emp ID'];
      if (!empId || empId === '#N/A') return;

      if (!salesByEmployee.has(empId)) {
        salesByEmployee.set(empId, {
          employeeId: empId,
          employeeName: row['RM'],
          branch: row['Branch'],
          zone: row['Zone'],
          bm: row['BM'],
          rgm: row['RGM'],
          zm: row['ZM'],
          mtd: 0,
          ytdPrevious: 0,
          ytdTotal: 0,
        });
      }

      const empData = salesByEmployee.get(empId);
      empData.ytdPrevious += parseFloat(row['Total Net Sales (COB 100%)'] || 0);
    });

    // Calculate YTD total and convert to array
    const employeeSales = Array.from(salesByEmployee.values()).map(emp => ({
      ...emp,
      ytdTotal: emp.mtd + emp.ytdPrevious,
    }));

    // Sort by YTD total descending
    employeeSales.sort((a, b) => b.ytdTotal - a.ytdTotal);

    // Get top 10
    const top10 = employeeSales.slice(0, 10);

    // Calculate summary stats
    const totalMTD = employeeSales.reduce((sum, emp) => sum + emp.mtd, 0);
    const totalYTD = employeeSales.reduce((sum, emp) => sum + emp.ytdTotal, 0);

    return NextResponse.json({
      success: true,
      summary: {
        totalEmployees: employeeSales.length,
        totalMTDSales: totalMTD.toFixed(2),
        totalYTDSales: totalYTD.toFixed(2),
        recordsCurrentMonth: currentMonth?.length || 0,
        recordsYTD: ytdData?.length || 0,
      },
      top10Performers: top10.map((emp, index) => ({
        rank: index + 1,
        employeeId: emp.employeeId,
        name: emp.employeeName,
        branch: emp.branch,
        zone: emp.zone,
        mtdSales: emp.mtd.toFixed(2),
        ytdSales: emp.ytdTotal.toFixed(2),
      })),
      allEmployeeSales: employeeSales.slice(0, 20), // First 20 for preview
    });
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: error.message,
      stack: error.stack,
    }, { status: 500 });
  }
}
