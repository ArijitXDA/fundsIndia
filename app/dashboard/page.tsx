'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { TrendingUp, Award, Target, BarChart3, Trophy, Medal, Crown } from 'lucide-react';

interface EmployeeSales {
  employeeId: string;
  employeeName: string;
  branch: string;
  zone: string;
  mtd: number;
  ytdTotal: number;
}

interface TopPerformer {
  rank: number;
  employeeId: string;
  name: string;
  branch: string;
  zone: string;
  mtdSales: string;
  ytdSales: string;
}

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [salesData, setSalesData] = useState<any>(null);
  const [myPerformance, setMyPerformance] = useState<EmployeeSales | null>(null);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const response = await fetch('/api/auth/me');
        if (!response.ok) {
          router.push('/login');
          return;
        }
        const data = await response.json();
        setUser(data.user);

        // Fetch sales data
        const salesResponse = await fetch('/api/sales-summary');
        const salesData = await salesResponse.json();
        setSalesData(salesData);

        // Find current user's performance
        const empNumber = data.user.employee?.employee_number;
        if (empNumber && salesData.allEmployeeSales) {
          const myData = salesData.allEmployeeSales.find(
            (emp: EmployeeSales) => emp.employeeId === empNumber
          );
          setMyPerformance(myData);
        }

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
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-indigo-600 mx-auto"></div>
          <p className="mt-6 text-lg font-medium text-gray-700">Loading your dashboard...</p>
        </div>
      </div>
    );
  }

  const getRankIcon = (rank: number) => {
    if (rank === 1) return <Crown className="w-6 h-6 text-yellow-500" />;
    if (rank === 2) return <Medal className="w-6 h-6 text-gray-400" />;
    if (rank === 3) return <Medal className="w-6 h-6 text-amber-600" />;
    return <span className="text-lg font-bold text-gray-400">#{rank}</span>;
  };

  const formatCurrency = (value: string | number) => {
    const num = typeof value === 'string' ? parseFloat(value) : value;
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 2,
    }).format(num);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-lg shadow-sm border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center space-x-4">
              <img
                src="https://cdn.fundsindia.com/prelogin/fi-logo-new.svg"
                alt="FundsIndia"
                className="h-10 w-auto"
              />
              <div>
                <h1 className="text-2xl font-bold text-gray-900">RNR Dashboard</h1>
                <p className="text-sm text-gray-500">Sales Contest & Performance Tracking</p>
              </div>
            </div>
            <div className="flex items-center space-x-6">
              <div className="text-right">
                <p className="text-sm font-semibold text-gray-900">{user?.employee?.full_name}</p>
                <p className="text-xs text-gray-500">{user?.employee?.employee_number} • {user?.role?.toUpperCase()}</p>
              </div>
              <button
                onClick={handleLogout}
                className="px-5 py-2.5 text-sm font-medium text-white bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 rounded-lg shadow-md transition-all duration-200"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Hero Section - My Performance */}
        <div className="mb-8">
          <div className="bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-500 rounded-2xl shadow-2xl p-8 text-white">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-3xl font-bold mb-2">Welcome back, {user?.employee?.full_name?.split(' ')[0]}! 👋</h2>
                <p className="text-indigo-100">Here's your performance overview</p>
              </div>
              <TrendingUp className="w-16 h-16 text-white/30" />
            </div>

            {myPerformance ? (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-8">
                <div className="bg-white/10 backdrop-blur-sm rounded-xl p-6 border border-white/20">
                  <div className="flex items-center justify-between mb-4">
                    <BarChart3 className="w-8 h-8 text-yellow-300" />
                    <span className="text-xs font-medium text-white/80 uppercase tracking-wide">MTD Sales</span>
                  </div>
                  <p className="text-4xl font-bold mb-2">{formatCurrency(myPerformance.mtd)}</p>
                  <p className="text-sm text-white/70">Current Month Performance</p>
                </div>

                <div className="bg-white/10 backdrop-blur-sm rounded-xl p-6 border border-white/20">
                  <div className="flex items-center justify-between mb-4">
                    <Target className="w-8 h-8 text-green-300" />
                    <span className="text-xs font-medium text-white/80 uppercase tracking-wide">YTD Sales</span>
                  </div>
                  <p className="text-4xl font-bold mb-2">{formatCurrency(myPerformance.ytdTotal)}</p>
                  <p className="text-sm text-white/70">Year to Date Performance</p>
                </div>

                <div className="bg-white/10 backdrop-blur-sm rounded-xl p-6 border border-white/20">
                  <div className="flex items-center justify-between mb-4">
                    <Award className="w-8 h-8 text-blue-300" />
                    <span className="text-xs font-medium text-white/80 uppercase tracking-wide">Location</span>
                  </div>
                  <p className="text-2xl font-bold mb-1">{myPerformance.branch || 'N/A'}</p>
                  <p className="text-sm text-white/70">{myPerformance.zone} Zone</p>
                </div>
              </div>
            ) : (
              <div className="bg-white/10 backdrop-blur-sm rounded-xl p-8 text-center border border-white/20">
                <BarChart3 className="w-16 h-16 text-white/50 mx-auto mb-4" />
                <p className="text-xl font-semibold mb-2">No Sales Data Available</p>
                <p className="text-white/70">Your sales performance will appear here once data is available</p>
              </div>
            )}
          </div>
        </div>

        {/* Leaderboard Section */}
        <div className="bg-white rounded-2xl shadow-xl overflow-hidden">
          <div className="bg-gradient-to-r from-indigo-600 to-purple-600 px-8 py-6">
            <div className="flex items-center space-x-3">
              <Trophy className="w-8 h-8 text-yellow-300" />
              <h2 className="text-2xl font-bold text-white">Top 10 Performers</h2>
            </div>
            <p className="text-indigo-100 mt-1">Based on YTD Sales (COB 100%)</p>
          </div>

          <div className="p-8">
            {salesData?.top10Performers && salesData.top10Performers.length > 0 ? (
              <div className="space-y-4">
                {salesData.top10Performers.map((performer: TopPerformer, index: number) => (
                  <div
                    key={performer.employeeId}
                    className={`flex items-center justify-between p-5 rounded-xl transition-all duration-200 hover:shadow-md ${
                      index < 3
                        ? 'bg-gradient-to-r from-yellow-50 to-amber-50 border-2 border-yellow-200'
                        : 'bg-gray-50 border border-gray-200 hover:border-indigo-300'
                    }`}
                  >
                    <div className="flex items-center space-x-6 flex-1">
                      <div className="flex items-center justify-center w-12 h-12 rounded-full bg-white shadow-md">
                        {getRankIcon(performer.rank)}
                      </div>

                      <div className="flex-1">
                        <h3 className="text-lg font-bold text-gray-900">{performer.name}</h3>
                        <p className="text-sm text-gray-600">
                          {performer.employeeId} • {performer.branch} • {performer.zone}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center space-x-8 text-right">
                      <div>
                        <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">MTD Sales</p>
                        <p className="text-lg font-bold text-indigo-600">{formatCurrency(performer.mtdSales)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">YTD Sales</p>
                        <p className="text-2xl font-bold text-purple-600">{formatCurrency(performer.ytdSales)}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12">
                <Trophy className="w-20 h-20 text-gray-300 mx-auto mb-4" />
                <p className="text-xl font-semibold text-gray-600 mb-2">No Leaderboard Data</p>
                <p className="text-gray-500">Top performers will appear here once sales data is available</p>
              </div>
            )}
          </div>

          {/* Summary Stats */}
          {salesData?.summary && (
            <div className="bg-gray-50 px-8 py-6 border-t border-gray-200">
              <div className="grid grid-cols-4 gap-6">
                <div className="text-center">
                  <p className="text-sm text-gray-600 mb-1">Total Employees</p>
                  <p className="text-2xl font-bold text-gray-900">{salesData.summary.totalEmployees}</p>
                </div>
                <div className="text-center">
                  <p className="text-sm text-gray-600 mb-1">Total MTD Sales</p>
                  <p className="text-2xl font-bold text-indigo-600">{formatCurrency(salesData.summary.totalMTDSales)}</p>
                </div>
                <div className="text-center">
                  <p className="text-sm text-gray-600 mb-1">Total YTD Sales</p>
                  <p className="text-2xl font-bold text-purple-600">{formatCurrency(salesData.summary.totalYTDSales)}</p>
                </div>
                <div className="text-center">
                  <p className="text-sm text-gray-600 mb-1">Data Points</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {(salesData.summary.recordsCurrentMonth || 0) + (salesData.summary.recordsYTD || 0)}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
