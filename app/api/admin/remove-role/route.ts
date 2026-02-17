import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const sessionCookie = request.cookies.get('session');
    if (!sessionCookie) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const sessionData = JSON.parse(sessionCookie.value);

    const { data: callerUser } = await supabaseAdmin
      .from('users')
      .select('email')
      .eq('id', sessionData.userId)
      .single();

    if (!callerUser) {
      return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
    }

    // Verify caller has assign permissions
    const { data: callerAdmin } = await supabaseAdmin
      .from('admin_roles')
      .select('can_assign_admins, tier')
      .eq('email', callerUser.email)
      .eq('is_active', true)
      .single();

    if (!callerAdmin?.can_assign_admins) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    const { email } = await request.json();
    if (!email) {
      return NextResponse.json({ error: 'email is required' }, { status: 400 });
    }

    // Look up the target admin role
    const { data: targetRole } = await supabaseAdmin
      .from('admin_roles')
      .select('tier, email')
      .eq('email', email)
      .eq('is_active', true)
      .single();

    if (!targetRole) {
      return NextResponse.json({ error: 'Admin role not found' }, { status: 404 });
    }

    // Prevent non-dev admins from removing dev admins
    if (targetRole.tier === 'dev' && callerAdmin.tier !== 'dev') {
      return NextResponse.json({ error: 'Only Dev Admin can remove Dev Admin roles' }, { status: 403 });
    }

    // Prevent self-removal
    if (email === callerUser.email) {
      return NextResponse.json({ error: 'You cannot remove your own admin role' }, { status: 400 });
    }

    const { error: updateError } = await supabaseAdmin
      .from('admin_roles')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('email', email);

    if (updateError) {
      console.error('[REMOVE ROLE] Update error:', updateError);
      return NextResponse.json({ error: 'Failed to remove admin role' }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: `Admin role removed for ${email}` });
  } catch (error: any) {
    console.error('[REMOVE ROLE] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
