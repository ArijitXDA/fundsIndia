import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/set-password';

  // Build the absolute redirect URL
  const siteUrl = process.env.NEXT_PUBLIC_APP_URL || origin;

  if (!code) {
    // No code — redirect to login with an error
    return NextResponse.redirect(`${siteUrl}/login?error=missing_code`);
  }

  const cookieStore = cookies();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        },
      },
    }
  );

  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    console.error('[AUTH CALLBACK] Code exchange error:', error.message);
    return NextResponse.redirect(`${siteUrl}/login?error=auth_callback_failed`);
  }

  // Successfully authenticated — redirect to set-password (or wherever `next` points)
  const redirectUrl = next.startsWith('/') ? `${siteUrl}${next}` : next;
  return NextResponse.redirect(redirectUrl);
}
