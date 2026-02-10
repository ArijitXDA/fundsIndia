'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { TrendingUp, Award, Target, BarChart3, Trophy, Medal, Crown, Building2, Users, Network } from 'lucide-react';
import OrgChartModal from '@/components/OrgChartModal';

interface SalesBreakdown {
  mfSifMsci: number;
  cob100: number;
  aifPmsLasDynamo: number;
  alternate: number;
  total: number;
}

interface EmployeeSales {
  employeeId: string;
  employeeName: string;
  branch: string;
  zone: string;
  mtd: SalesBreakdown;
  ytdTotal: SalesBreakdown;
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

interface B2CAdvisor {
  rank: number;
  advisor: string;
  team: string;
  netInflowMTD: string;
  netInflowYTD: string;
  currentAUM: string;
  aumGrowthPct: string;
  assignedLeads: number;
  newSIPInflowYTD: string;
}

type TabType = 'B2B' | 'B2C';

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [salesData, setSalesData] = useState<any>(null);
  const [b2cData, setB2cData] = useState<any>(null);
  const [myPerformance, setMyPerformance] = useState<EmployeeSales | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>('B2B');
  const [isOrgChartOpen, setIsOrgChartOpen] = useState(false);

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

        // Set default tab based on user's business unit
        if (data.user.employee?.business_unit === 'B2C') {
          setActiveTab('B2C');
        }

        // Fetch B2B sales data
        const salesResponse = await fetch('/api/sales-summary');
        const salesData = await salesResponse.json();
        setSalesData(salesData);

        // Fetch B2C advisory data
        const b2cResponse = await fetch('/api/b2c-summary');
        const b2cData = await b2cResponse.json();
        setB2cData(b2cData);

        // Find current user's performance
        const empNumber = data.user.employee?.employee_number;
        const userEmail = data.user.email;

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

  const tabs = [
    { id: 'B2B' as TabType, name: 'B2B', icon: Building2, description: 'Business to Business' },
    { id: 'B2C' as TabType, name: 'B2C', icon: Users, description: 'Digital Advisory' },
  ];

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
            <div className="flex items-center space-x-4">
              <div className="text-right">
                <p className="text-sm font-semibold text-gray-900">{user?.employee?.full_name}</p>
                <p className="text-xs text-gray-500">{user?.employee?.employee_number} • {user?.role?.toUpperCase()}</p>
              </div>
              <button
                onClick={() => setIsOrgChartOpen(true)}
                className="px-4 py-2.5 text-sm font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-all duration-200 flex items-center space-x-2 border border-indigo-200"
              >
                <Network className="w-4 h-4" />
                <span>Org View</span>
              </button>
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
              <div className="mt-8 space-y-6">
                {/* MTD Performance */}
                <div>
                  <h3 className="text-xl font-bold mb-4 text-white/90">MTD Performance</h3>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-white/20">
                      <p className="text-xs text-white/70 mb-1">MF+SIF+MSCI</p>
                      <p className="text-2xl font-bold">{formatCurrency(myPerformance.mtd?.mfSifMsci || 0)}</p>
                    </div>
                    <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-white/20">
                      <p className="text-xs text-white/70 mb-1">COB (100%)</p>
                      <p className="text-2xl font-bold">{formatCurrency(myPerformance.mtd?.cob100 || 0)}</p>
                    </div>
                    <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-white/20">
                      <p className="text-xs text-white/70 mb-1">AIF+PMS+LAS+DYNAMO</p>
                      <p className="text-2xl font-bold">{formatCurrency(myPerformance.mtd?.aifPmsLasDynamo || 0)}</p>
                    </div>
                    <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-white/20">
                      <p className="text-xs text-white/70 mb-1">ALTERNATE</p>
                      <p className="text-2xl font-bold">{formatCurrency(myPerformance.mtd?.alternate || 0)}</p>
                    </div>
                  </div>
                  <div className="mt-4 bg-white/20 backdrop-blur-sm rounded-xl p-4 border border-white/30">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-white/90">Total MTD</span>
                      <span className="text-3xl font-bold">{formatCurrency(myPerformance.mtd?.total || 0)}</span>
                    </div>
                  </div>
                </div>

                {/* YTD Performance */}
                <div>
                  <h3 className="text-xl font-bold mb-4 text-white/90">YTD Performance</h3>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-white/20">
                      <p className="text-xs text-white/70 mb-1">MF+SIF+MSCI</p>
                      <p className="text-2xl font-bold">{formatCurrency(myPerformance.ytdTotal?.mfSifMsci || 0)}</p>
                    </div>
                    <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-white/20">
                      <p className="text-xs text-white/70 mb-1">COB (100%)</p>
                      <p className="text-2xl font-bold">{formatCurrency(myPerformance.ytdTotal?.cob100 || 0)}</p>
                    </div>
                    <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-white/20">
                      <p className="text-xs text-white/70 mb-1">AIF+PMS+LAS+DYNAMO</p>
                      <p className="text-2xl font-bold">{formatCurrency(myPerformance.ytdTotal?.aifPmsLasDynamo || 0)}</p>
                    </div>
                    <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-white/20">
                      <p className="text-xs text-white/70 mb-1">ALTERNATE</p>
                      <p className="text-2xl font-bold">{formatCurrency(myPerformance.ytdTotal?.alternate || 0)}</p>
                    </div>
                  </div>
                  <div className="mt-4 bg-white/20 backdrop-blur-sm rounded-xl p-4 border border-white/30">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-white/90">Total YTD</span>
                      <span className="text-3xl font-bold">{formatCurrency(myPerformance.ytdTotal?.total || 0)}</span>
                    </div>
                  </div>
                </div>

                {/* Location */}
                <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-white/20">
                  <div className="flex items-center space-x-4">
                    <Award className="w-8 h-8 text-yellow-300" />
                    <div>
                      <p className="text-sm text-white/70">Location</p>
                      <p className="text-xl font-bold">{myPerformance.branch || 'N/A'} • {myPerformance.zone} Zone</p>
                    </div>
                  </div>
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

        {/* Tabs Section */}
        <div className="bg-white rounded-2xl shadow-xl overflow-hidden">
          {/* Tab Navigation */}
          <div className="bg-gradient-to-r from-gray-50 to-gray-100 border-b border-gray-200">
            <div className="flex space-x-1 px-6 pt-6">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex items-center space-x-2 px-6 py-4 rounded-t-xl font-semibold transition-all duration-200 ${
                      activeTab === tab.id
                        ? 'bg-white text-indigo-600 shadow-md border-t-4 border-indigo-600'
                        : 'text-gray-600 hover:text-gray-900 hover:bg-white/50'
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                    <span>{tab.name}</span>
                    <span className={`text-xs px-2 py-1 rounded-full ${
                      activeTab === tab.id
                        ? 'bg-indigo-100 text-indigo-700'
                        : 'bg-gray-200 text-gray-600'
                    }`}>
                      {tab.description}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Tab Content */}
          {activeTab === 'B2B' && (
            <div>
              <div className="bg-gradient-to-r from-indigo-600 to-purple-600 px-8 py-6">
                <div className="flex items-center space-x-3">
                  <Trophy className="w-8 h-8 text-yellow-300" />
                  <h2 className="text-2xl font-bold text-white">Top 10 B2B Performers</h2>
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
                    <p className="text-xl font-semibold text-gray-600 mb-2">No B2B Leaderboard Data</p>
                    <p className="text-gray-500">Top B2B performers will appear here once sales data is available</p>
                  </div>
                )}
              </div>

              {/* Summary Stats for B2B */}
              {salesData?.summary && (
                <div className="bg-gray-50 px-8 py-6 border-t border-gray-200">
                  <div className="grid grid-cols-4 gap-6">
                    <div className="text-center">
                      <p className="text-sm text-gray-600 mb-1">Total B2B RMs</p>
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
                      <p className="text-sm text-gray-600 mb-1">ARN Partners</p>
                      <p className="text-2xl font-bold text-gray-900">
                        {(salesData.summary.recordsCurrentMonth || 0) + (salesData.summary.recordsYTD || 0)}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'B2C' && (
            <div>
              <div className="bg-gradient-to-r from-blue-600 to-cyan-600 px-8 py-6">
                <div className="flex items-center space-x-3">
                  <Trophy className="w-8 h-8 text-yellow-300" />
                  <h2 className="text-2xl font-bold text-white">Top 10 B2C Advisors</h2>
                </div>
                <p className="text-blue-100 mt-1">Based on Net Inflow YTD Performance</p>
              </div>

              <div className="p-8">
                {b2cData?.top10Performers && b2cData.top10Performers.length > 0 ? (
                  <div className="space-y-4">
                    {b2cData.top10Performers.map((advisor: B2CAdvisor, index: number) => (
                      <div
                        key={advisor.advisor}
                        className={`flex items-center justify-between p-5 rounded-xl transition-all duration-200 hover:shadow-md ${
                          index < 3
                            ? 'bg-gradient-to-r from-blue-50 to-cyan-50 border-2 border-blue-200'
                            : 'bg-gray-50 border border-gray-200 hover:border-blue-300'
                        }`}
                      >
                        <div className="flex items-center space-x-6 flex-1">
                          <div className="flex items-center justify-center w-12 h-12 rounded-full bg-white shadow-md">
                            {getRankIcon(advisor.rank)}
                          </div>

                          <div className="flex-1">
                            <h3 className="text-lg font-bold text-gray-900">{advisor.advisor}</h3>
                            <p className="text-sm text-gray-600">
                              {advisor.team} • {advisor.assignedLeads} Leads
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center space-x-6 text-right">
                          <div>
                            <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Net Inflow MTD</p>
                            <p className="text-lg font-bold text-blue-600">₹{advisor.netInflowMTD} Cr</p>
                          </div>
                          <div>
                            <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Net Inflow YTD</p>
                            <p className="text-2xl font-bold text-cyan-600">₹{advisor.netInflowYTD} Cr</p>
                          </div>
                          <div>
                            <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Current AUM</p>
                            <p className="text-lg font-bold text-purple-600">₹{advisor.currentAUM} Cr</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <Users className="w-20 h-20 text-gray-300 mx-auto mb-4" />
                    <p className="text-xl font-semibold text-gray-600 mb-2">No B2C Advisory Data</p>
                    <p className="text-gray-500">B2C advisor performance will appear here once data is available</p>
                  </div>
                )}
              </div>

              {/* Summary Stats for B2C */}
              {b2cData?.summary && (
                <div className="bg-gray-50 px-8 py-6 border-t border-gray-200">
                  <div className="grid grid-cols-4 gap-6">
                    <div className="text-center">
                      <p className="text-sm text-gray-600 mb-1">Total Advisors</p>
                      <p className="text-2xl font-bold text-gray-900">{b2cData.summary.totalAdvisors}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-sm text-gray-600 mb-1">Net Inflow MTD</p>
                      <p className="text-2xl font-bold text-blue-600">₹{b2cData.summary.totalNetInflowMTD} Cr</p>
                    </div>
                    <div className="text-center">
                      <p className="text-sm text-gray-600 mb-1">Net Inflow YTD</p>
                      <p className="text-2xl font-bold text-cyan-600">₹{b2cData.summary.totalNetInflowYTD} Cr</p>
                    </div>
                    <div className="text-center">
                      <p className="text-sm text-gray-600 mb-1">Total Current AUM</p>
                      <p className="text-2xl font-bold text-purple-600">₹{b2cData.summary.totalCurrentAUM} Cr</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      {/* Org Chart Modal */}
      <OrgChartModal
        isOpen={isOrgChartOpen}
        onClose={() => setIsOrgChartOpen(false)}
        currentEmployeeNumber={user?.employee?.employee_number || ''}
      />
    </div>
  );
}
