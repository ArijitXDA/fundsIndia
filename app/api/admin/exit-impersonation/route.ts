import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const adminSessionCookie = request.cookies.get('admin_session');

    if (!adminSessionCookie) {
      return NextResponse.json({ error: 'No impersonation session found' }, { status: 400 });
    }

    const response = NextResponse.json({ success: true });

    // Restore admin session back to main session cookie
    response.cookies.set('session', adminSessionCookie.value, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24,
    });

    // Clear the admin_session cookie
    response.cookies.set('admin_session', '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 0,
    });

    return response;
  } catch (error) {
    console.error('[EXIT IMPERSONATION] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
