import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // Check b2b_sales_current_month table
    const { data: currentMonth, error: currentMonthError, count: currentMonthCount } = await supabaseAdmin
      .from('b2b_sales_current_month')
      .select('*', { count: 'exact', head: false })
      .limit(5);

    // Check b2b_sales_YTD_minus_current_month table (corrected spelling)
    const { data: ytdData, error: ytdError, count: ytdCount } = await supabaseAdmin
      .from('btb_sales_YTD_minus_current_month')
      .select('*', { count: 'exact', head: false })
      .limit(5);

    // Get column names from first row
    const currentMonthColumns = currentMonth && currentMonth.length > 0 ? Object.keys(currentMonth[0]) : [];
    const ytdColumns = ytdData && ytdData.length > 0 ? Object.keys(ytdData[0]) : [];

    return NextResponse.json({
      success: true,
      tables: {
        b2b_sales_current_month: {
          accessible: !currentMonthError,
          rowCount: currentMonthCount,
          columns: currentMonthColumns,
          sampleData: currentMonth ? currentMonth.slice(0, 3) : null,
          error: currentMonthError?.message,
        },
        btb_sales_YTD_minus_current_month: {
          accessible: !ytdError,
          rowCount: ytdCount,
          columns: ytdColumns,
          sampleData: ytdData ? ytdData.slice(0, 3) : null,
          error: ytdError?.message,
        },
      },
    });
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: error.message,
      stack: error.stack,
    }, { status: 500 });
  }
}
