'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Mail, ArrowRight, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';

type State = 'form' | 'loading' | 'success' | 'error';

export default function SignUpPage() {
  const [email, setEmail] = useState('');
  const [state, setState] = useState<State>('form');
  const [error, setError] = useState('');
  const [employeeName, setEmployeeName] = useState('');

  const validateEmail = (value: string): string => {
    if (!value) return 'Email is required';
    if (!value.endsWith('@fundsindia.com')) {
      return 'Only @fundsindia.com email addresses are allowed';
    }
    return '';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const validationError = validateEmail(email.trim().toLowerCase());
    if (validationError) {
      setError(validationError);
      return;
    }

    setState('loading');

    try {
      const response = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Sign up failed. Please try again.');
        setState('form');
        return;
      }

      setEmployeeName(data.employeeName || '');
      setState('success');
    } catch {
      setError('An error occurred. Please try again.');
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
          <h2 className="text-3xl font-bold text-gray-900">Create Account</h2>
          <p className="mt-2 text-sm text-gray-600">
            Hall of Fame — Sales Contest & Performance Tracking
          </p>
        </div>

        {/* Success State */}
        {state === 'success' && (
          <div className="space-y-6">
            <div className="flex flex-col items-center text-center space-y-4 py-4">
              <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
                <CheckCircle className="w-9 h-9 text-green-600" />
              </div>
              <div>
                <h3 className="text-xl font-semibold text-gray-900">
                  {employeeName ? `Hi ${employeeName}!` : 'Check your email'}
                </h3>
                <p className="mt-2 text-sm text-gray-600">
                  We've sent a verification link to{' '}
                  <span className="font-medium text-indigo-600">{email}</span>.
                </p>
                <p className="mt-2 text-sm text-gray-500">
                  Click the link in the email to verify your account and set your password.
                  The link expires in 1 hour.
                </p>
              </div>
            </div>

            <div className="bg-blue-50 rounded-lg p-4 text-sm text-blue-800">
              <p className="font-semibold mb-1">Didn't receive it?</p>
              <ul className="list-disc list-inside space-y-1 text-blue-700">
                <li>Check your spam/junk folder</li>
                <li>Make sure you used your @fundsindia.com email</li>
                <li>
                  <button
                    onClick={() => setState('form')}
                    className="underline hover:no-underline"
                  >
                    Try signing up again
                  </button>
                </li>
              </ul>
            </div>

            <Link
              href="/login"
              className="block text-center text-sm text-indigo-600 hover:text-indigo-800 font-medium"
            >
              Back to Sign In
            </Link>
          </div>
        )}

        {/* Form State */}
        {(state === 'form' || state === 'loading') && (
          <form className="mt-4 space-y-6" onSubmit={handleSubmit}>
            {error && (
              <div className="rounded-md bg-red-50 p-4 flex items-start space-x-3">
                <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-red-800">{error}</p>
              </div>
            )}

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                Work Email Address
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Mail className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setError('');
                  }}
                  disabled={state === 'loading'}
                  className="appearance-none block w-full pl-10 pr-3 py-2.5 border border-gray-300 rounded-lg placeholder-gray-400 text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent sm:text-sm disabled:bg-gray-50 disabled:cursor-not-allowed transition"
                  placeholder="yourname@fundsindia.com"
                />
              </div>
              <p className="mt-1.5 text-xs text-gray-500">
                Must be a valid @fundsindia.com email address
              </p>
            </div>

            <div>
              <button
                type="submit"
                disabled={state === 'loading'}
                className="group relative w-full flex items-center justify-center py-2.5 px-4 border border-transparent text-sm font-medium rounded-lg text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:bg-indigo-400 disabled:cursor-not-allowed transition-colors"
              >
                {state === 'loading' ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Sending verification email...
                  </>
                ) : (
                  <>
                    Send Verification Email
                    <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
                  </>
                )}
              </button>
            </div>

            <div className="text-center">
              <p className="text-sm text-gray-600">
                Already have an account?{' '}
                <Link href="/login" className="font-medium text-indigo-600 hover:text-indigo-800">
                  Sign in
                </Link>
              </p>
            </div>
          </form>
        )}

        {/* Footer */}
        <div className="mt-6 border-t border-gray-100 pt-4">
          <p className="text-center text-xs text-gray-400">
            FundsIndia Hall of Fame v1.0 &mdash; For internal use only
          </p>
        </div>
      </div>
    </div>
  );
}
