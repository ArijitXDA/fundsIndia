import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

// Mark this route as dynamic since it uses cookies
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const sessionCookie = request.cookies.get('session');

    if (sessionCookie) {
      const sessionData = JSON.parse(sessionCookie.value);

      // Log logout activity
      await supabaseAdmin
        .from('activity_logs')
        .insert({
          user_id: sessionData.userId,
          employee_id: sessionData.employeeId,
          action_type: 'logout',
          action_details: { success: true },
        });
    }

    const response = NextResponse.json({ success: true });

    // Clear session cookie
    response.cookies.set('session', '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 0,
    });

    return response;
  } catch (error) {
    console.error('Logout error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
