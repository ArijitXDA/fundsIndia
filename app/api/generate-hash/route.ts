import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const password = 'Pass@123';

    // Generate a fresh hash on the Vercel server
    const hash = await bcrypt.hash(password, 10);

    // Test that it works
    const testMatch = await bcrypt.compare(password, hash);

    return NextResponse.json({
      password: password,
      freshHash: hash,
      hashLength: hash.length,
      testMatch: testMatch,
      instructions: testMatch
        ? 'Copy the freshHash value and update your database with this SQL:\n\nUPDATE users SET password_hash = \'' + hash + '\' WHERE email = \'arijit.chowdhury@fundsindia.com\';'
        : 'ERROR: bcrypt is not working correctly',
    });
  } catch (error: any) {
    return NextResponse.json({
      error: error.message,
      stack: error.stack,
    }, { status: 500 });
  }
}
