import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const testPassword = 'Pass@123';
    const expectedHash = '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy';

    // Test if the password matches the hash
    const match = await bcrypt.compare(testPassword, expectedHash);

    // Generate a fresh hash for comparison
    const freshHash = await bcrypt.hash(testPassword, 10);
    const freshMatch = await bcrypt.compare(testPassword, freshHash);

    return NextResponse.json({
      test: 'Password Hash Verification',
      password: testPassword,
      expectedHash: expectedHash,
      matchesExpected: match,
      freshHash: freshHash,
      matchesFresh: freshMatch,
      bcryptVersion: bcrypt.version || 'unknown',
    });
  } catch (error: any) {
    return NextResponse.json({
      error: error.message,
      stack: error.stack,
    }, { status: 500 });
  }
}
