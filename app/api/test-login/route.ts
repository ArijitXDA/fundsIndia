import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import bcrypt from 'bcryptjs';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const testEmail = 'arijit.chowdhury@fundsindia.com';
    const testPassword = 'Pass@123';

    // Fetch user from database
    const { data: user, error: userError } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('email', testEmail)
      .single();

    if (userError || !user) {
      return NextResponse.json({
        error: 'User not found',
        details: userError,
      }, { status: 404 });
    }

    // Test password comparison
    const passwordMatch = await bcrypt.compare(testPassword, user.password_hash);

    // Also test with the expected hash directly
    const expectedHash = '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy';
    const expectedMatch = await bcrypt.compare(testPassword, expectedHash);

    return NextResponse.json({
      test: 'Login Test',
      email: testEmail,
      password: testPassword,
      userFound: true,
      userRole: user.role,
      hashFromDB: user.password_hash,
      expectedHash: expectedHash,
      hashesMatch: user.password_hash === expectedHash,
      passwordMatchesDBHash: passwordMatch,
      passwordMatchesExpectedHash: expectedMatch,
      bcryptWorking: expectedMatch,
      diagnosis: passwordMatch
        ? '✅ Everything works! Login should succeed.'
        : '❌ Password does not match. Check hash or bcrypt version.',
    });
  } catch (error: any) {
    return NextResponse.json({
      error: error.message,
      stack: error.stack,
    }, { status: 500 });
  }
}
