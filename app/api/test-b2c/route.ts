import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // Check b2c table
    const { data: b2cData, error: b2cError, count: b2cCount } = await supabaseAdmin
      .from('b2c')
      .select('*', { count: 'exact', head: false })
      .limit(5);

    // Get column names from first row
    const b2cColumns = b2cData && b2cData.length > 0 ? Object.keys(b2cData[0]) : [];

    return NextResponse.json({
      success: true,
      table: {
        name: 'b2c',
        accessible: !b2cError,
        rowCount: b2cCount,
        columns: b2cColumns,
        sampleData: b2cData ? b2cData.slice(0, 3) : null,
        error: b2cError?.message,
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
