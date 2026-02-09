'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check if user is authenticated
    const checkAuth = async () => {
      try {
        const response = await fetch('/api/auth/me');
        if (!response.ok) {
          router.push('/login');
          return;
        }
        const data = await response.json();
        setUser(data.user);
        setLoading(false);
      } catch (error) {
        router.push('/login');
      }
    };

    checkAuth();
  }, [router]);

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <div className="flex items-center space-x-4">
            <img
              src="https://cdn.fundsindia.com/prelogin/fi-logo-new.svg"
              alt="FundsIndia"
              className="h-8 w-auto"
            />
            <h1 className="text-2xl font-bold text-gray-900">RNR Dashboard</h1>
          </div>
          <div className="flex items-center space-x-4">
            <div className="text-right">
              <p className="text-sm font-medium text-gray-900">{user?.employee?.full_name || user?.email}</p>
              <p className="text-xs text-gray-500">{user?.role}</p>
            </div>
            <button
              onClick={handleLogout}
              className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-md"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">
            Welcome to RNR Dashboard!
          </h2>

          <div className="space-y-4">
            <div className="bg-green-50 border border-green-200 rounded-md p-4">
              <h3 className="text-lg font-medium text-green-900 mb-2">✅ Authentication Working</h3>
              <p className="text-sm text-green-700">
                You have successfully logged in. Your session is active.
              </p>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
              <h3 className="text-lg font-medium text-blue-900 mb-2">📊 Coming Soon</h3>
              <ul className="text-sm text-blue-700 space-y-1 list-disc list-inside">
                <li>Performance Metrics (MTD, QTD, YTD, Contest)</li>
                <li>Team Hierarchy View</li>
                <li>Rankings & Leaderboard</li>
                <li>Target vs Achievement Charts</li>
                <li>Admin Panel (Data Upload & Configuration)</li>
              </ul>
            </div>

            {user && (
              <div className="bg-gray-50 border border-gray-200 rounded-md p-4">
                <h3 className="text-lg font-medium text-gray-900 mb-2">Your Profile</h3>
                <dl className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <dt className="font-medium text-gray-500">Email</dt>
                    <dd className="text-gray-900">{user.email}</dd>
                  </div>
                  <div>
                    <dt className="font-medium text-gray-500">Role</dt>
                    <dd className="text-gray-900 capitalize">{user.role}</dd>
                  </div>
                  {user.employee && (
                    <>
                      <div>
                        <dt className="font-medium text-gray-500">Name</dt>
                        <dd className="text-gray-900">{user.employee.full_name}</dd>
                      </div>
                      <div>
                        <dt className="font-medium text-gray-500">Business Unit</dt>
                        <dd className="text-gray-900">{user.employee.business_unit || 'N/A'}</dd>
                      </div>
                      <div>
                        <dt className="font-medium text-gray-500">Department</dt>
                        <dd className="text-gray-900">{user.employee.department || 'N/A'}</dd>
                      </div>
                      <div>
                        <dt className="font-medium text-gray-500">Employee Number</dt>
                        <dd className="text-gray-900">{user.employee.employee_number}</dd>
                      </div>
                    </>
                  )}
                </dl>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
