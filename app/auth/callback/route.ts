import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const token_hash = searchParams.get('token_hash');
  const type = searchParams.get('type');
  const next = searchParams.get('next') ?? '/set-password';

  const siteUrl = process.env.NEXT_PUBLIC_APP_URL || origin;

  const cookieStore = cookies();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        },
      },
    }
  );

  // Handle PKCE flow (?code=...)
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      console.error('[AUTH CALLBACK] Code exchange error:', error.message);
      return NextResponse.redirect(`${siteUrl}/login?error=auth_callback_failed`);
    }
    const redirectUrl = next.startsWith('/') ? `${siteUrl}${next}` : next;
    return NextResponse.redirect(redirectUrl);
  }

  // Handle token_hash flow (email OTP / magic link via ?token_hash=&type=...)
  if (token_hash && type) {
    const { error } = await supabase.auth.verifyOtp({ token_hash, type: type as any });
    if (error) {
      console.error('[AUTH CALLBACK] Token hash verify error:', error.message);
      return NextResponse.redirect(`${siteUrl}/login?error=auth_callback_failed`);
    }
    const redirectUrl = next.startsWith('/') ? `${siteUrl}${next}` : next;
    return NextResponse.redirect(redirectUrl);
  }

  // Neither code nor token_hash — redirect to set-password anyway and let
  // the client-side page handle the session from the URL hash fragment
  const redirectUrl = next.startsWith('/') ? `${siteUrl}${next}` : next;
  return NextResponse.redirect(redirectUrl);
}
