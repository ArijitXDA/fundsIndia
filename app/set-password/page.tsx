'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Lock, Eye, EyeOff, CheckCircle, AlertCircle, Loader2, ShieldCheck } from 'lucide-react';
import { supabase } from '@/lib/supabase';

type State = 'loading' | 'form' | 'submitting' | 'success' | 'error';

interface PasswordStrength {
  score: number; // 0-4
  label: string;
  color: string;
}

function getPasswordStrength(password: string): PasswordStrength {
  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;

  // Cap at 4
  score = Math.min(score, 4);

  const map: Record<number, { label: string; color: string }> = {
    0: { label: 'Very weak', color: 'bg-red-500' },
    1: { label: 'Weak', color: 'bg-orange-500' },
    2: { label: 'Fair', color: 'bg-yellow-500' },
    3: { label: 'Good', color: 'bg-blue-500' },
    4: { label: 'Strong', color: 'bg-green-500' },
  };

  return { score, ...map[score] };
}

export default function SetPasswordPage() {
  const router = useRouter();
  const [state, setState] = useState<State>('loading');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const [debugLog, setDebugLog] = useState<string[]>([]);

  const strength = getPasswordStrength(password);

  const addDebug = (msg: string) => {
    console.log('[SET-PASSWORD]', msg);
    setDebugLog((prev) => [...prev, msg]);
  };

  useEffect(() => {
    let settled = false;

    const resolve = (email: string) => {
      if (settled) return;
      settled = true;
      addDebug(`✓ Session resolved for: ${email}`);
      setUserEmail(email);
      setState('form');
    };

    const fail = (msg: string) => {
      if (settled) return;
      settled = true;
      addDebug(`✗ Failed: ${msg}`);
      setError(msg);
      setState('error');
    };

    // Helper: parse the #access_token hash fragment and set session manually
    const tryHashFragment = async () => {
      const hash = window.location.hash;
      addDebug(`hash present: ${!!hash}, length: ${hash.length}`);
      if (!hash) return false;

      const params = new URLSearchParams(hash.substring(1));
      const accessToken = params.get('access_token');
      const refreshToken = params.get('refresh_token');
      addDebug(`access_token present: ${!!accessToken}, refresh_token present: ${!!refreshToken}`);

      if (accessToken && refreshToken) {
        addDebug('calling setSession...');
        const { data, error: sessionError } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        addDebug(`setSession result: error=${sessionError?.message}, email=${data.session?.user?.email}`);
        if (sessionError || !data.session?.user?.email) return false;
        window.history.replaceState(null, '', window.location.pathname);
        resolve(data.session.user.email);
        return true;
      }

      return false;
    };

    // Helper: check ?token_hash=&type= query params (Supabase OTP flow)
    const tryTokenHash = async () => {
      const params = new URLSearchParams(window.location.search);
      const token_hash = params.get('token_hash');
      const type = params.get('type');
      addDebug(`token_hash present: ${!!token_hash}, type: ${type}`);

      if (token_hash && type) {
        const { data, error: verifyError } = await supabase.auth.verifyOtp({
          token_hash,
          type: type as any,
        });
        addDebug(`verifyOtp result: error=${verifyError?.message}, email=${data.session?.user?.email}`);
        if (verifyError || !data.session?.user?.email) return false;
        resolve(data.session.user.email);
        return true;
      }

      return false;
    };

    const init = async () => {
      addDebug('init started');

      // 1. Try existing session first
      const { data: { session } } = await supabase.auth.getSession();
      addDebug(`existing session: ${session?.user?.email ?? 'none'}`);
      if (session?.user?.email) {
        resolve(session.user.email);
        return;
      }

      // 2. Try hash fragment
      const handledHash = await tryHashFragment();
      if (handledHash) return;

      // 3. Try token_hash query param
      const handledToken = await tryTokenHash();
      if (handledToken) return;

      // 4. onAuthStateChange fallback
      addDebug('waiting for onAuthStateChange...');
      const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
        addDebug(`onAuthStateChange: event=${event}, email=${session?.user?.email}`);
        if (settled) return;
        if (
          (event === 'SIGNED_IN' || event === 'USER_UPDATED' || event === 'PASSWORD_RECOVERY') &&
          session?.user?.email
        ) {
          resolve(session.user.email);
        }
      });

      // 5. Timeout after 10 seconds
      setTimeout(() => {
        subscription.unsubscribe();
        fail('Your verification link has expired or is invalid. Please request a new one.');
      }, 10000);
    };

    init().catch((err) => {
      console.error('[SET-PASSWORD] init error:', err);
      fail('An unexpected error occurred. Please request a new verification link.');
    });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Validate passwords
    if (password.length < 8) {
      setError('Password must be at least 8 characters long');
      return;
    }
    if (strength.score < 2) {
      setError('Password is too weak. Please use a mix of letters, numbers, and symbols.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setState('submitting');

    try {
      // 1. Update password in Supabase Auth (user is already authenticated via session)
      const { data: updateData, error: updateError } = await supabase.auth.updateUser({
        password,
      });

      if (updateError) {
        setError(updateError.message || 'Failed to update password. Please try again.');
        setState('form');
        return;
      }

      const supabaseUserId = updateData.user?.id;
      const email = updateData.user?.email || userEmail;

      // 2. Sync with our custom users table and issue session cookie
      const response = await fetch('/api/auth/set-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, supabaseUserId }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Account setup failed. Please contact support.');
        setState('form');
        return;
      }

      setState('success');

      // Redirect to dashboard after a short delay
      setTimeout(() => {
        router.push('/dashboard');
      }, 2000);
    } catch {
      setError('An unexpected error occurred. Please try again.');
      setState('form');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="max-w-md w-full space-y-8 p-10 bg-white rounded-xl shadow-2xl">
        {/* Header */}
        <div className="text-center">
          <img
            src="https://cdn.fundsindia.com/prelogin/fi-logo-new.svg"
            alt="FundsIndia"
            className="mx-auto h-12 w-auto mb-6"
          />
          <h2 className="text-3xl font-bold text-gray-900">Set Your Password</h2>
          <p className="mt-2 text-sm text-gray-600">
            {userEmail ? (
              <>
                Setting password for{' '}
                <span className="font-medium text-indigo-600">{userEmail}</span>
              </>
            ) : (
              'Create a secure password for your account'
            )}
          </p>
        </div>

        {/* Loading */}
        {state === 'loading' && (
          <div className="flex flex-col items-center justify-center py-8 space-y-4">
            <Loader2 className="w-10 h-10 text-indigo-600 animate-spin" />
            <p className="text-sm text-gray-500">Verifying your session...</p>
            {debugLog.length > 0 && (
              <div className="w-full bg-gray-900 rounded p-3 text-left">
                {debugLog.map((line, i) => (
                  <p key={i} className="text-xs text-green-400 font-mono">{line}</p>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Success */}
        {state === 'success' && (
          <div className="flex flex-col items-center text-center space-y-4 py-4">
            <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
              <CheckCircle className="w-9 h-9 text-green-600" />
            </div>
            <div>
              <h3 className="text-xl font-semibold text-gray-900">Password Set!</h3>
              <p className="mt-2 text-sm text-gray-600">
                Your password has been set successfully. Redirecting to the dashboard...
              </p>
            </div>
            <Loader2 className="w-5 h-5 text-indigo-500 animate-spin" />
          </div>
        )}

        {/* Error (invalid/expired link) */}
        {state === 'error' && (
          <div className="space-y-6">
            <div className="flex flex-col items-center text-center space-y-4 py-4">
              <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center">
                <AlertCircle className="w-9 h-9 text-red-600" />
              </div>
              <div>
                <h3 className="text-xl font-semibold text-gray-900">Link Expired</h3>
                <p className="mt-2 text-sm text-gray-600">{error}</p>
              </div>
            </div>
            <div className="space-y-3">
              <Link
                href="/signup"
                className="block w-full text-center py-2.5 px-4 border border-transparent text-sm font-medium rounded-lg text-white bg-indigo-600 hover:bg-indigo-700 transition-colors"
              >
                Request New Sign Up Link
              </Link>
              <Link
                href="/login"
                className="block text-center text-sm text-indigo-600 hover:text-indigo-800 font-medium"
              >
                Back to Sign In
              </Link>
            </div>
          </div>
        )}

        {/* Form */}
        {(state === 'form' || state === 'submitting') && (
          <form className="mt-4 space-y-5" onSubmit={handleSubmit}>
            {error && (
              <div className="rounded-md bg-red-50 p-4 flex items-start space-x-3">
                <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-red-800">{error}</p>
              </div>
            )}

            {/* New Password */}
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                New Password
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Lock className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setError(''); }}
                  disabled={state === 'submitting'}
                  className="appearance-none block w-full pl-10 pr-10 py-2.5 border border-gray-300 rounded-lg placeholder-gray-400 text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent sm:text-sm disabled:bg-gray-50 disabled:cursor-not-allowed transition"
                  placeholder="At least 8 characters"
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>

              {/* Password strength bar */}
              {password && (
                <div className="mt-2 space-y-1">
                  <div className="flex gap-1 h-1.5">
                    {[0, 1, 2, 3].map((i) => (
                      <div
                        key={i}
                        className={`flex-1 rounded-full transition-colors ${
                          i < strength.score ? strength.color : 'bg-gray-200'
                        }`}
                      />
                    ))}
                  </div>
                  <p className={`text-xs ${
                    strength.score <= 1 ? 'text-red-600' :
                    strength.score === 2 ? 'text-yellow-600' :
                    strength.score === 3 ? 'text-blue-600' :
                    'text-green-600'
                  }`}>
                    {strength.label} password
                  </p>
                </div>
              )}
            </div>

            {/* Confirm Password */}
            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-1">
                Confirm Password
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <ShieldCheck className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  id="confirmPassword"
                  type={showConfirm ? 'text' : 'password'}
                  required
                  value={confirmPassword}
                  onChange={(e) => { setConfirmPassword(e.target.value); setError(''); }}
                  disabled={state === 'submitting'}
                  className={`appearance-none block w-full pl-10 pr-10 py-2.5 border rounded-lg placeholder-gray-400 text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent sm:text-sm disabled:bg-gray-50 disabled:cursor-not-allowed transition ${
                    confirmPassword && password !== confirmPassword
                      ? 'border-red-300 bg-red-50'
                      : confirmPassword && password === confirmPassword
                      ? 'border-green-300 bg-green-50'
                      : 'border-gray-300'
                  }`}
                  placeholder="Repeat your password"
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm(!showConfirm)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600"
                  tabIndex={-1}
                >
                  {showConfirm ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
              {confirmPassword && password !== confirmPassword && (
                <p className="mt-1 text-xs text-red-600">Passwords do not match</p>
              )}
              {confirmPassword && password === confirmPassword && (
                <p className="mt-1 text-xs text-green-600 flex items-center gap-1">
                  <CheckCircle className="w-3.5 h-3.5" /> Passwords match
                </p>
              )}
            </div>

            {/* Password requirements hint */}
            <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-500 space-y-1">
              <p className="font-medium text-gray-600">Password requirements:</p>
              <ul className="space-y-0.5 list-disc list-inside">
                <li className={password.length >= 8 ? 'text-green-600' : ''}>At least 8 characters</li>
                <li className={/[A-Z]/.test(password) ? 'text-green-600' : ''}>At least one uppercase letter</li>
                <li className={/[0-9]/.test(password) ? 'text-green-600' : ''}>At least one number</li>
                <li className={/[^A-Za-z0-9]/.test(password) ? 'text-green-600' : ''}>At least one special character (recommended)</li>
              </ul>
            </div>

            <div>
              <button
                type="submit"
                disabled={state === 'submitting' || !password || !confirmPassword}
                className="group relative w-full flex items-center justify-center py-2.5 px-4 border border-transparent text-sm font-medium rounded-lg text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:bg-indigo-400 disabled:cursor-not-allowed transition-colors"
              >
                {state === 'submitting' ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Setting password...
                  </>
                ) : (
                  'Set Password & Continue to Dashboard'
                )}
              </button>
            </div>
          </form>
        )}

        {/* Footer */}
        <div className="mt-4 border-t border-gray-100 pt-4">
          <p className="text-center text-xs text-gray-400">
            FundsIndia RNR Dashboard v1.0 &mdash; For internal use only
          </p>
        </div>
      </div>
    </div>
  );
}
