'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { TrendingUp, Award, BarChart3, Trophy, Medal, Crown, Building2, Users, Network, KeyRound, CheckCircle, Shield, LogOut, UserCheck, Globe, ChevronLeft, ChevronRight } from 'lucide-react';
import OrgChartModal from '@/components/OrgChartModal';

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

type TabType = 'B2B' | 'B2C' | 'PW';

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [adminRole, setAdminRole] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [salesData, setSalesData] = useState<any>(null);
  const [b2cData, setB2cData] = useState<any>(null);
  const [myPerformance, setMyPerformance] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<TabType>('B2B');
  const [b2bSort, setB2bSort] = useState<'MTD' | 'YTD'>('MTD');
  const [b2cSort, setB2cSort] = useState<'MTD' | 'YTD'>('MTD');
  const handleTabChange = (tab: TabType) => { setActiveTab(tab); setB2bPage(1); setB2cPage(1); };
  const [isOrgChartOpen, setIsOrgChartOpen] = useState(false);
  const [passwordResetToast, setPasswordResetToast] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [b2bPage, setB2bPage] = useState(1);
  const [b2cPage, setB2cPage] = useState(1);
  const PAGE_SIZE = 10;

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
        setAdminRole(data.adminRole ?? null);

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

        // Fetch current user's performance (handles direct, manager, non-sales)
        try {
          const perfResponse = await fetch('/api/my-performance');
          if (perfResponse.ok) {
            const perfData = await perfResponse.json();
            setMyPerformance(perfData);
          }
        } catch {}

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

  const handleExitImpersonation = async () => {
    const res = await fetch('/api/admin/exit-impersonation', { method: 'POST' });
    if (res.ok) {
      // Hard redirect so the browser picks up the restored admin session cookie
      window.location.href = '/admin';
    }
  };

  const handleChangePassword = async () => {
    if (!user?.email) return;
    setPasswordResetToast('sending');
    try {
      const response = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: user.email }),
      });
      if (response.ok) {
        setPasswordResetToast('sent');
      } else {
        setPasswordResetToast('error');
      }
    } catch {
      setPasswordResetToast('error');
    }
    // Reset toast after 5 seconds
    setTimeout(() => setPasswordResetToast('idle'), 5000);
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

  const formatCrore = (value: string | number) => {
    const num = typeof value === 'string' ? parseFloat(value) : value;
    return `₹${num.toFixed(2)} Cr`;
  };

  // Filter tabs based on user's business unit
  const allTabs = [
    { id: 'B2B' as TabType, name: 'B2B', icon: Building2, description: 'Business to Business', businessUnit: 'B2B' },
    { id: 'B2C' as TabType, name: 'B2C', icon: Users, description: 'Digital Advisory', businessUnit: 'B2C' },
    { id: 'PW' as TabType, name: 'Private Wealth', icon: Award, description: 'Private Wealth', businessUnit: 'Private Wealth' },
  ];

  const userBusinessUnit = user?.employee?.business_unit;

  // B2B/B2C/Private Wealth users see only their tab
  // All other business units see all 3 tabs
  const tabs = ['B2B', 'B2C', 'Private Wealth'].includes(userBusinessUnit)
    ? allTabs.filter(tab => tab.businessUnit === userBusinessUnit)
    : allTabs;

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
      {/* Impersonation Banner */}
      {user?.impersonatedBy && (
        <div className="bg-amber-500 text-white px-4 py-2 flex items-center justify-between sticky top-0 z-[60]">
          <div className="flex items-center space-x-2">
            <Shield className="w-4 h-4" />
            <span className="text-sm font-semibold">
              Dev Admin View — Viewing as <strong>{user.employee?.full_name} ({user.email})</strong>
            </span>
          </div>
          <button
            onClick={handleExitImpersonation}
            className="flex items-center space-x-1.5 bg-white/20 hover:bg-white/30 px-3 py-1 rounded-lg text-sm font-medium transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Exit &amp; Return to Admin</span>
          </button>
        </div>
      )}

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
                <h1 className="text-2xl font-bold text-gray-900">Hall of Fame</h1>
                <p className="text-sm text-gray-500">Sales Contest & Performance Tracking</p>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <div className="text-right">
                <p className="text-sm font-semibold text-gray-900">{user?.employee?.full_name}</p>
                <p className="text-xs text-gray-500">{user?.employee?.employee_number} • {user?.role?.toUpperCase()}</p>
              </div>
              {adminRole && (
                <button
                  onClick={() => router.push('/admin')}
                  className="px-4 py-2.5 text-sm font-medium text-white bg-gradient-to-r from-rose-500 to-orange-500 hover:from-rose-600 hover:to-orange-600 rounded-lg transition-all duration-200 flex items-center space-x-2 shadow-md"
                  title={`Admin Panel (${adminRole.tier} admin)`}
                >
                  <Shield className="w-4 h-4" />
                  <span>Admin</span>
                </button>
              )}
              <button
                onClick={() => setIsOrgChartOpen(true)}
                className="px-4 py-2.5 text-sm font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-all duration-200 flex items-center space-x-2 border border-indigo-200"
              >
                <Network className="w-4 h-4" />
                <span>Org View</span>
              </button>
              <button
                onClick={handleChangePassword}
                disabled={passwordResetToast === 'sending'}
                className="px-4 py-2.5 text-sm font-medium text-gray-600 bg-gray-50 hover:bg-gray-100 rounded-lg transition-all duration-200 flex items-center space-x-2 border border-gray-200 disabled:opacity-60 disabled:cursor-not-allowed"
                title="Send a password reset link to your email"
              >
                <KeyRound className="w-4 h-4" />
                <span>
                  {passwordResetToast === 'sending' ? 'Sending...' : 'Change Password'}
                </span>
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
        {/* Hero Section - My Performance (for all users) */}
        <div className="mb-8">
          <div className="bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-500 rounded-2xl shadow-2xl p-8 text-white">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-3xl font-bold mb-2">Welcome back, {user?.employee?.full_name?.split(' ')[0]}! 👋</h2>
                <p className="text-indigo-100">
                  {myPerformance?.type === 'direct' && "Here's your performance overview"}
                  {myPerformance?.type === 'manager' && "Here's your team's combined performance"}
                  {myPerformance?.type === 'non-sales' && "Org Level Performance — B2B & B2C"}
                  {myPerformance?.type === 'vertical-support' && myPerformance?.label}
                  {!myPerformance && "Loading performance data..."}
                </p>
              </div>
              {myPerformance?.type === 'direct' && <TrendingUp className="w-16 h-16 text-white/30" />}
              {myPerformance?.type === 'manager' && <UserCheck className="w-16 h-16 text-white/30" />}
              {myPerformance?.type === 'non-sales' && <Globe className="w-16 h-16 text-white/30" />}
              {myPerformance?.type === 'vertical-support' && <BarChart3 className="w-16 h-16 text-white/30" />}
            </div>

            {/* TYPE: DIRECT — B2B performer */}
            {myPerformance?.type === 'direct' && myPerformance?.vertical === 'B2B' && (
              <div className="mt-8 space-y-6">
                <div>
                  <h3 className="text-xl font-bold mb-4 text-white/90">MTD Performance</h3>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-white/20">
                      <p className="text-xs text-white/70 mb-1">MF+SIF+MSCI</p>
                      <p className="text-2xl font-bold">{formatCrore(myPerformance.mtd?.mfSifMsci || 0)}</p>
                    </div>
                    <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-white/20">
                      <p className="text-xs text-white/70 mb-1">COB (100%)</p>
                      <p className="text-2xl font-bold">{formatCrore(myPerformance.mtd?.cob100 || 0)}</p>
                    </div>
                    <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-white/20">
                      <p className="text-xs text-white/70 mb-1">AIF+PMS+LAS+DYNAMO</p>
                      <p className="text-2xl font-bold">{formatCrore(myPerformance.mtd?.aifPmsLasDynamo || 0)}</p>
                    </div>
                    <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-white/20">
                      <p className="text-xs text-white/70 mb-1">ALTERNATE</p>
                      <p className="text-2xl font-bold">{formatCrore(myPerformance.mtd?.alternate || 0)}</p>
                    </div>
                  </div>
                  <div className="mt-4 bg-white/20 backdrop-blur-sm rounded-xl p-4 border border-white/30">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-white/90">Total MTD</span>
                      <span className="text-3xl font-bold">{formatCrore(myPerformance.mtd?.total || 0)}</span>
                    </div>
                  </div>
                </div>
                <div>
                  <h3 className="text-xl font-bold mb-4 text-white/90">YTD Performance</h3>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-white/20">
                      <p className="text-xs text-white/70 mb-1">MF+SIF+MSCI</p>
                      <p className="text-2xl font-bold">{formatCrore(myPerformance.ytdTotal?.mfSifMsci || 0)}</p>
                    </div>
                    <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-white/20">
                      <p className="text-xs text-white/70 mb-1">COB (100%)</p>
                      <p className="text-2xl font-bold">{formatCrore(myPerformance.ytdTotal?.cob100 || 0)}</p>
                    </div>
                    <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-white/20">
                      <p className="text-xs text-white/70 mb-1">AIF+PMS+LAS+DYNAMO</p>
                      <p className="text-2xl font-bold">{formatCrore(myPerformance.ytdTotal?.aifPmsLasDynamo || 0)}</p>
                    </div>
                    <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-white/20">
                      <p className="text-xs text-white/70 mb-1">ALTERNATE</p>
                      <p className="text-2xl font-bold">{formatCrore(myPerformance.ytdTotal?.alternate || 0)}</p>
                    </div>
                  </div>
                  <div className="mt-4 bg-white/20 backdrop-blur-sm rounded-xl p-4 border border-white/30">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-white/90">Total YTD</span>
                      <span className="text-3xl font-bold">{formatCrore(myPerformance.ytdTotal?.total || 0)}</span>
                    </div>
                  </div>
                </div>
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
            )}

            {/* TYPE: DIRECT — B2C performer */}
            {myPerformance?.type === 'direct' && myPerformance?.vertical === 'B2C' && (
              <div className="mt-8 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-white/20">
                    <p className="text-xs text-white/70 mb-1">Net Inflow MTD</p>
                    <p className="text-2xl font-bold">₹{(myPerformance.b2c?.netInflowMTD || 0).toFixed(2)} Cr</p>
                  </div>
                  <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-white/20">
                    <p className="text-xs text-white/70 mb-1">Net Inflow YTD</p>
                    <p className="text-2xl font-bold">₹{(myPerformance.b2c?.netInflowYTD || 0).toFixed(2)} Cr</p>
                  </div>
                  <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-white/20">
                    <p className="text-xs text-white/70 mb-1">Current AUM</p>
                    <p className="text-2xl font-bold">₹{(myPerformance.b2c?.currentAUM || 0).toFixed(2)} Cr</p>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-white/20">
                    <p className="text-xs text-white/70 mb-1">AUM Growth MTM</p>
                    <p className="text-2xl font-bold">{(myPerformance.b2c?.aumGrowthPct || 0).toFixed(2)}%</p>
                  </div>
                  <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-white/20">
                    <p className="text-xs text-white/70 mb-1">Assigned Leads</p>
                    <p className="text-2xl font-bold">{Math.round(myPerformance.b2c?.assignedLeads || 0)}</p>
                  </div>
                  <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-white/20">
                    <p className="text-xs text-white/70 mb-1">New SIP Inflow YTD</p>
                    <p className="text-2xl font-bold">₹{(myPerformance.b2c?.newSIPInflowYTD || 0).toFixed(3)} Cr</p>
                  </div>
                </div>
              </div>
            )}

            {/* TYPE: MANAGER — team aggregate */}
            {myPerformance?.type === 'manager' && (
              <div className="mt-8 space-y-6">
                <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-white/20 flex items-center space-x-4 mb-2">
                  <UserCheck className="w-8 h-8 text-yellow-300" />
                  <div>
                    <p className="text-sm text-white/70">Team Size</p>
                    <p className="text-xl font-bold">
                      {myPerformance.reporteeCount} reportee{myPerformance.reporteeCount !== 1 ? 's' : ''}
                      {myPerformance.b2b && ` • ${myPerformance.b2b.reporteeCount} B2B RM${myPerformance.b2b.reporteeCount !== 1 ? 's' : ''}`}
                      {myPerformance.b2c && ` • ${myPerformance.b2c.reporteeCount} B2C Advisor${myPerformance.b2c.reporteeCount !== 1 ? 's' : ''}`}
                    </p>
                  </div>
                </div>

                {/* Manager B2B Numbers */}
                {myPerformance.b2b && (
                  <div>
                    <h3 className="text-lg font-bold mb-3 text-white/90">Team B2B — MTD</h3>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                      <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-white/20">
                        <p className="text-xs text-white/70 mb-1">MF+SIF+MSCI</p>
                        <p className="text-2xl font-bold">{formatCrore(myPerformance.b2b.mtd?.mfSifMsci || 0)}</p>
                      </div>
                      <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-white/20">
                        <p className="text-xs text-white/70 mb-1">COB (100%)</p>
                        <p className="text-2xl font-bold">{formatCrore(myPerformance.b2b.mtd?.cob100 || 0)}</p>
                      </div>
                      <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-white/20">
                        <p className="text-xs text-white/70 mb-1">AIF+PMS+LAS+DYNAMO</p>
                        <p className="text-2xl font-bold">{formatCrore(myPerformance.b2b.mtd?.aifPmsLasDynamo || 0)}</p>
                      </div>
                      <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-white/20">
                        <p className="text-xs text-white/70 mb-1">ALTERNATE</p>
                        <p className="text-2xl font-bold">{formatCrore(myPerformance.b2b.mtd?.alternate || 0)}</p>
                      </div>
                    </div>
                    <div className="mt-4 bg-white/20 backdrop-blur-sm rounded-xl p-4 border border-white/30">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold text-white/90">Team MTD Total</span>
                        <span className="text-3xl font-bold">{formatCrore(myPerformance.b2b.mtd?.total || 0)}</span>
                      </div>
                    </div>

                    <h3 className="text-lg font-bold mb-3 mt-6 text-white/90">Team B2B — YTD</h3>
                    <div className="mt-4 bg-white/20 backdrop-blur-sm rounded-xl p-4 border border-white/30">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold text-white/90">Team YTD Total</span>
                        <span className="text-3xl font-bold">{formatCrore(myPerformance.b2b.ytdTotal?.total || 0)}</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Manager B2C Numbers */}
                {myPerformance.b2c && (
                  <div>
                    <h3 className="text-lg font-bold mb-3 text-white/90">Team B2C</h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-white/20">
                        <p className="text-xs text-white/70 mb-1">Net Inflow MTD</p>
                        <p className="text-2xl font-bold">₹{(myPerformance.b2c.netInflowMTD || 0).toFixed(2)} Cr</p>
                      </div>
                      <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-white/20">
                        <p className="text-xs text-white/70 mb-1">Net Inflow YTD</p>
                        <p className="text-2xl font-bold">₹{(myPerformance.b2c.netInflowYTD || 0).toFixed(2)} Cr</p>
                      </div>
                      <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-white/20">
                        <p className="text-xs text-white/70 mb-1">Current AUM</p>
                        <p className="text-2xl font-bold">₹{(myPerformance.b2c.currentAUM || 0).toFixed(2)} Cr</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* TYPE: NON-SALES — org-level totals */}
            {myPerformance?.type === 'non-sales' && (
              <div className="mt-8 space-y-6">
                <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-white/20 flex items-center space-x-4 mb-2">
                  <Globe className="w-8 h-8 text-yellow-300" />
                  <div>
                    <p className="text-sm text-white/70">Org Summary</p>
                    <p className="text-xl font-bold">
                      {myPerformance.totalB2BRMs} B2B RMs • {myPerformance.totalB2CAdvisors} B2C Advisors
                    </p>
                  </div>
                </div>

                {/* B2B Org */}
                <div>
                  <h3 className="text-lg font-bold mb-3 text-white/90">B2B — Org Level</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="bg-white/20 backdrop-blur-sm rounded-xl p-4 border border-white/30">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold text-white/90">MTD Net Sales</span>
                        <span className="text-2xl font-bold">{formatCrore(myPerformance.b2b?.mtd?.total || 0)}</span>
                      </div>
                    </div>
                    <div className="bg-white/20 backdrop-blur-sm rounded-xl p-4 border border-white/30">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold text-white/90">YTD Net Sales</span>
                        <span className="text-2xl font-bold">{formatCrore(myPerformance.b2b?.ytdTotal?.total || 0)}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* B2C Org */}
                <div>
                  <h3 className="text-lg font-bold mb-3 text-white/90">B2C — Org Level</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-white/20">
                      <p className="text-xs text-white/70 mb-1">Net Inflow MTD</p>
                      <p className="text-2xl font-bold">₹{(myPerformance.b2c?.netInflowMTD || 0).toFixed(2)} Cr</p>
                    </div>
                    <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-white/20">
                      <p className="text-xs text-white/70 mb-1">Net Inflow YTD</p>
                      <p className="text-2xl font-bold">₹{(myPerformance.b2c?.netInflowYTD || 0).toFixed(2)} Cr</p>
                    </div>
                    <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-white/20">
                      <p className="text-xs text-white/70 mb-1">Total Current AUM</p>
                      <p className="text-2xl font-bold">₹{(myPerformance.b2c?.currentAUM || 0).toFixed(2)} Cr</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TYPE: VERTICAL-SUPPORT — B2B/B2C/PW support employee sees only their vertical's aggregate */}
            {myPerformance?.type === 'vertical-support' && (
              <div className="mt-8 space-y-6">
                <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-white/20 flex items-center space-x-4 mb-2">
                  <BarChart3 className="w-8 h-8 text-yellow-300" />
                  <div>
                    <p className="text-sm text-white/70">Vertical Summary</p>
                    <p className="text-xl font-bold">
                      {myPerformance.vertical === 'B2B' && `${myPerformance.totalRMs ?? 0} B2B RMs`}
                      {myPerformance.vertical === 'B2C' && `${myPerformance.totalAdvisors ?? 0} B2C Advisors`}
                      {myPerformance.vertical === 'PW' && 'Private Wealth'}
                    </p>
                  </div>
                </div>

                {/* B2B Vertical — aggregate MTD + YTD */}
                {myPerformance.vertical === 'B2B' && myPerformance.b2b && (
                  <div className="space-y-6">
                    <div>
                      <h3 className="text-xl font-bold mb-4 text-white/90">B2B Vertical — MTD</h3>
                      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-white/20">
                          <p className="text-xs text-white/70 mb-1">MF+SIF+MSCI</p>
                          <p className="text-2xl font-bold">{formatCrore(myPerformance.b2b.mtd?.mfSifMsci || 0)}</p>
                        </div>
                        <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-white/20">
                          <p className="text-xs text-white/70 mb-1">COB (100%)</p>
                          <p className="text-2xl font-bold">{formatCrore(myPerformance.b2b.mtd?.cob100 || 0)}</p>
                        </div>
                        <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-white/20">
                          <p className="text-xs text-white/70 mb-1">AIF+PMS+LAS+DYNAMO</p>
                          <p className="text-2xl font-bold">{formatCrore(myPerformance.b2b.mtd?.aifPmsLasDynamo || 0)}</p>
                        </div>
                        <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-white/20">
                          <p className="text-xs text-white/70 mb-1">ALTERNATE</p>
                          <p className="text-2xl font-bold">{formatCrore(myPerformance.b2b.mtd?.alternate || 0)}</p>
                        </div>
                      </div>
                      <div className="mt-4 bg-white/20 backdrop-blur-sm rounded-xl p-4 border border-white/30">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-semibold text-white/90">Total MTD Net Sales</span>
                          <span className="text-3xl font-bold">{formatCrore(myPerformance.b2b.mtd?.total || 0)}</span>
                        </div>
                      </div>
                    </div>
                    <div>
                      <h3 className="text-xl font-bold mb-4 text-white/90">B2B Vertical — YTD</h3>
                      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-white/20">
                          <p className="text-xs text-white/70 mb-1">MF+SIF+MSCI</p>
                          <p className="text-2xl font-bold">{formatCrore(myPerformance.b2b.ytdTotal?.mfSifMsci || 0)}</p>
                        </div>
                        <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-white/20">
                          <p className="text-xs text-white/70 mb-1">COB (100%)</p>
                          <p className="text-2xl font-bold">{formatCrore(myPerformance.b2b.ytdTotal?.cob100 || 0)}</p>
                        </div>
                        <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-white/20">
                          <p className="text-xs text-white/70 mb-1">AIF+PMS+LAS+DYNAMO</p>
                          <p className="text-2xl font-bold">{formatCrore(myPerformance.b2b.ytdTotal?.aifPmsLasDynamo || 0)}</p>
                        </div>
                        <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-white/20">
                          <p className="text-xs text-white/70 mb-1">ALTERNATE</p>
                          <p className="text-2xl font-bold">{formatCrore(myPerformance.b2b.ytdTotal?.alternate || 0)}</p>
                        </div>
                      </div>
                      <div className="mt-4 bg-white/20 backdrop-blur-sm rounded-xl p-4 border border-white/30">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-semibold text-white/90">Total YTD Net Sales</span>
                          <span className="text-3xl font-bold">{formatCrore(myPerformance.b2b.ytdTotal?.total || 0)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* B2C Vertical — aggregate */}
                {myPerformance.vertical === 'B2C' && myPerformance.b2c && (
                  <div>
                    <h3 className="text-xl font-bold mb-4 text-white/90">B2C Vertical — Overall</h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-white/20">
                        <p className="text-xs text-white/70 mb-1">Net Inflow MTD</p>
                        <p className="text-2xl font-bold">₹{(myPerformance.b2c.netInflowMTD || 0).toFixed(2)} Cr</p>
                      </div>
                      <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-white/20">
                        <p className="text-xs text-white/70 mb-1">Net Inflow YTD</p>
                        <p className="text-2xl font-bold">₹{(myPerformance.b2c.netInflowYTD || 0).toFixed(2)} Cr</p>
                      </div>
                      <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-white/20">
                        <p className="text-xs text-white/70 mb-1">Current AUM</p>
                        <p className="text-2xl font-bold">₹{(myPerformance.b2c.currentAUM || 0).toFixed(2)} Cr</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* PW Vertical — placeholder */}
                {myPerformance.vertical === 'PW' && (
                  <div className="bg-white/10 backdrop-blur-sm rounded-xl p-8 text-center border border-white/20">
                    <Award className="w-16 h-16 text-white/40 mx-auto mb-4" />
                    <p className="text-xl font-semibold mb-2">Private Wealth Data Coming Soon</p>
                    <p className="text-white/70">PW performance metrics will appear here once data is available</p>
                  </div>
                )}
              </div>
            )}

            {/* Loading / Error state */}
            {!myPerformance && (
              <div className="bg-white/10 backdrop-blur-sm rounded-xl p-8 text-center border border-white/20">
                <BarChart3 className="w-16 h-16 text-white/50 mx-auto mb-4" />
                <p className="text-xl font-semibold mb-2">Loading Performance Data...</p>
                <p className="text-white/70">Please wait while we calculate your numbers</p>
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
                    onClick={() => handleTabChange(tab.id)}
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
          {activeTab === 'B2B' && (() => {
            // Sort client-side by the chosen metric, then re-rank
            const rawB2B: any[] = salesData?.allEmployeeSales || [];
            const allB2B = [...rawB2B]
              .sort((a, b) =>
                b2bSort === 'MTD'
                  ? (b.mtd?.total || 0) - (a.mtd?.total || 0)
                  : (b.ytdTotal?.total || 0) - (a.ytdTotal?.total || 0)
              )
              .map((p, i) => ({ ...p, rank: i + 1 }));
            const totalB2B = allB2B.length;
            const totalPagesB2B = Math.ceil(totalB2B / PAGE_SIZE);
            const pageB2B = allB2B.slice((b2bPage - 1) * PAGE_SIZE, b2bPage * PAGE_SIZE);
            const isFirstPageB2B = b2bPage === 1;
            return (
            <div>
              <div className="bg-gradient-to-r from-indigo-600 to-purple-600 px-8 py-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <Trophy className="w-8 h-8 text-yellow-300" />
                    <div>
                      <h2 className="text-2xl font-bold text-white">
                        {isFirstPageB2B ? 'Top 10 B2B Performers' : `B2B Rankings — Rank ${(b2bPage - 1) * PAGE_SIZE + 1}–${Math.min(b2bPage * PAGE_SIZE, totalB2B)}`}
                      </h2>
                      <p className="text-indigo-100 mt-1">
                        Ranked by {b2bSort === 'MTD' ? 'MTD' : 'YTD'} Net Sales (COB 100%)
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {/* MTD / YTD sort toggle */}
                    <div className="flex items-center bg-white/15 rounded-lg p-1 gap-1">
                      <button
                        onClick={() => { setB2bSort('MTD'); setB2bPage(1); }}
                        className={`px-4 py-1.5 text-sm font-semibold rounded-md transition-all ${
                          b2bSort === 'MTD'
                            ? 'bg-white text-indigo-700 shadow'
                            : 'text-white/80 hover:text-white'
                        }`}
                      >
                        MTD
                      </button>
                      <button
                        onClick={() => { setB2bSort('YTD'); setB2bPage(1); }}
                        className={`px-4 py-1.5 text-sm font-semibold rounded-md transition-all ${
                          b2bSort === 'YTD'
                            ? 'bg-white text-indigo-700 shadow'
                            : 'text-white/80 hover:text-white'
                        }`}
                      >
                        YTD
                      </button>
                    </div>
                    {totalB2B > 0 && (
                      <span className="text-sm text-indigo-200 bg-white/10 px-3 py-1 rounded-full">
                        {totalB2B} RMs ranked
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="p-8">
                {pageB2B.length > 0 ? (
                  <div className="space-y-4">
                    {pageB2B.map((performer: any) => {
                      const rank = performer.rank;
                      const isMedal = rank <= 3;
                      return (
                        <div
                          key={performer.employeeId}
                          className={`flex items-center justify-between p-5 rounded-xl transition-all duration-200 hover:shadow-md ${
                            isMedal
                              ? 'bg-gradient-to-r from-yellow-50 to-amber-50 border-2 border-yellow-200'
                              : 'bg-gray-50 border border-gray-200 hover:border-indigo-300'
                          }`}
                        >
                          <div className="flex items-center space-x-6 flex-1">
                            <div className="flex items-center justify-center w-12 h-12 rounded-full bg-white shadow-md">
                              {getRankIcon(rank)}
                            </div>
                            <div className="flex-1">
                              <h3 className="text-lg font-bold text-gray-900">{performer.employeeName}</h3>
                              <p className="text-sm text-gray-600">
                                {performer.employeeId} • {performer.branch} • {performer.zone}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center space-x-8 text-right">
                            <div>
                              <p className={`text-xs uppercase tracking-wide mb-1 ${b2bSort === 'MTD' ? 'text-indigo-600 font-semibold' : 'text-gray-500'}`}>MTD Sales</p>
                              <p className={`font-bold ${b2bSort === 'MTD' ? 'text-2xl text-indigo-600' : 'text-lg text-gray-600'}`}>{formatCurrency(performer.mtd?.total || 0)}</p>
                            </div>
                            <div>
                              <p className={`text-xs uppercase tracking-wide mb-1 ${b2bSort === 'YTD' ? 'text-purple-600 font-semibold' : 'text-gray-500'}`}>YTD Sales</p>
                              <p className={`font-bold ${b2bSort === 'YTD' ? 'text-2xl text-purple-600' : 'text-lg text-gray-600'}`}>{formatCurrency(performer.ytdTotal?.total || 0)}</p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <Trophy className="w-20 h-20 text-gray-300 mx-auto mb-4" />
                    <p className="text-xl font-semibold text-gray-600 mb-2">No B2B Leaderboard Data</p>
                    <p className="text-gray-500">Top B2B performers will appear here once sales data is available</p>
                  </div>
                )}

                {/* Pagination Controls */}
                {totalPagesB2B > 1 && (
                  <div className="flex items-center justify-between mt-6 pt-6 border-t border-gray-200">
                    <button
                      onClick={() => setB2bPage(p => Math.max(1, p - 1))}
                      disabled={b2bPage === 1}
                      className="flex items-center space-x-2 px-4 py-2.5 text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg transition-colors"
                    >
                      <ChevronLeft className="w-4 h-4" />
                      <span>Previous</span>
                    </button>
                    <div className="flex items-center space-x-2">
                      {Array.from({ length: Math.min(totalPagesB2B, 7) }, (_, i) => {
                        let pageNum: number;
                        if (totalPagesB2B <= 7) {
                          pageNum = i + 1;
                        } else if (b2bPage <= 4) {
                          pageNum = i + 1;
                        } else if (b2bPage >= totalPagesB2B - 3) {
                          pageNum = totalPagesB2B - 6 + i;
                        } else {
                          pageNum = b2bPage - 3 + i;
                        }
                        return (
                          <button
                            key={pageNum}
                            onClick={() => setB2bPage(pageNum)}
                            className={`w-9 h-9 text-sm font-medium rounded-lg transition-colors ${
                              b2bPage === pageNum
                                ? 'bg-indigo-600 text-white shadow-md'
                                : 'text-gray-600 hover:bg-gray-100'
                            }`}
                          >
                            {pageNum}
                          </button>
                        );
                      })}
                    </div>
                    <button
                      onClick={() => setB2bPage(p => Math.min(totalPagesB2B, p + 1))}
                      disabled={b2bPage === totalPagesB2B}
                      className="flex items-center space-x-2 px-4 py-2.5 text-sm font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg border border-indigo-200 transition-colors"
                    >
                      <span>{b2bPage === totalPagesB2B ? 'Last Page' : 'Next Employees'}</span>
                      <ChevronRight className="w-4 h-4" />
                    </button>
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
            );
          })()}

          {activeTab === 'B2C' && (() => {
            // Sort client-side by chosen metric, then re-rank
            const rawB2C: any[] = b2cData?.allAdvisors || [];
            const allB2C = [...rawB2C]
              .sort((a, b) =>
                b2cSort === 'MTD'
                  ? (b.netInflowMTD || 0) - (a.netInflowMTD || 0)
                  : (b.netInflowYTD || 0) - (a.netInflowYTD || 0)
              )
              .map((a, i) => ({ ...a, rank: i + 1 }));
            const totalB2C = allB2C.length;
            const totalPagesB2C = Math.ceil(totalB2C / PAGE_SIZE);
            const pageB2C = allB2C.slice((b2cPage - 1) * PAGE_SIZE, b2cPage * PAGE_SIZE);
            const isFirstPageB2C = b2cPage === 1;
            return (
            <div>
              <div className="bg-gradient-to-r from-blue-600 to-cyan-600 px-8 py-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <Trophy className="w-8 h-8 text-yellow-300" />
                    <div>
                      <h2 className="text-2xl font-bold text-white">
                        {isFirstPageB2C ? 'Top 10 B2C Advisors' : `B2C Rankings — Rank ${(b2cPage - 1) * PAGE_SIZE + 1}–${Math.min(b2cPage * PAGE_SIZE, totalB2C)}`}
                      </h2>
                      <p className="text-blue-100 mt-1">
                        Ranked by {b2cSort === 'MTD' ? 'MTD' : 'YTD'} Net Inflow
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {/* MTD / YTD sort toggle */}
                    <div className="flex items-center bg-white/15 rounded-lg p-1 gap-1">
                      <button
                        onClick={() => { setB2cSort('MTD'); setB2cPage(1); }}
                        className={`px-4 py-1.5 text-sm font-semibold rounded-md transition-all ${
                          b2cSort === 'MTD'
                            ? 'bg-white text-blue-700 shadow'
                            : 'text-white/80 hover:text-white'
                        }`}
                      >
                        MTD
                      </button>
                      <button
                        onClick={() => { setB2cSort('YTD'); setB2cPage(1); }}
                        className={`px-4 py-1.5 text-sm font-semibold rounded-md transition-all ${
                          b2cSort === 'YTD'
                            ? 'bg-white text-blue-700 shadow'
                            : 'text-white/80 hover:text-white'
                        }`}
                      >
                        YTD
                      </button>
                    </div>
                    {totalB2C > 0 && (
                      <span className="text-sm text-blue-200 bg-white/10 px-3 py-1 rounded-full">
                        {totalB2C} Advisors ranked
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="p-8">
                {pageB2C.length > 0 ? (
                  <div className="space-y-4">
                    {pageB2C.map((advisor: any) => {
                      const rank = advisor.rank;
                      const isMedal = rank <= 3;
                      return (
                        <div
                          key={advisor.advisor}
                          className={`flex items-center justify-between p-5 rounded-xl transition-all duration-200 hover:shadow-md ${
                            isMedal
                              ? 'bg-gradient-to-r from-blue-50 to-cyan-50 border-2 border-blue-200'
                              : 'bg-gray-50 border border-gray-200 hover:border-blue-300'
                          }`}
                        >
                          <div className="flex items-center space-x-6 flex-1">
                            <div className="flex items-center justify-center w-12 h-12 rounded-full bg-white shadow-md">
                              {getRankIcon(rank)}
                            </div>
                            <div className="flex-1">
                              <h3 className="text-lg font-bold text-gray-900">{advisor.advisor}</h3>
                              <p className="text-sm text-gray-600">
                                {advisor.team} • {Math.round(advisor.assignedLeads)} Leads
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center space-x-6 text-right">
                            <div>
                              <p className={`text-xs uppercase tracking-wide mb-1 ${b2cSort === 'MTD' ? 'text-blue-600 font-semibold' : 'text-gray-500'}`}>Net Inflow MTD</p>
                              <p className={`font-bold ${b2cSort === 'MTD' ? 'text-2xl text-blue-600' : 'text-lg text-gray-600'}`}>₹{advisor.netInflowMTD?.toFixed(2)} Cr</p>
                            </div>
                            <div>
                              <p className={`text-xs uppercase tracking-wide mb-1 ${b2cSort === 'YTD' ? 'text-cyan-600 font-semibold' : 'text-gray-500'}`}>Net Inflow YTD</p>
                              <p className={`font-bold ${b2cSort === 'YTD' ? 'text-2xl text-cyan-600' : 'text-lg text-gray-600'}`}>₹{advisor.netInflowYTD?.toFixed(2)} Cr</p>
                            </div>
                            <div>
                              <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Current AUM</p>
                              <p className="text-lg font-bold text-purple-600">₹{advisor.currentAUM?.toFixed(2)} Cr</p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <Users className="w-20 h-20 text-gray-300 mx-auto mb-4" />
                    <p className="text-xl font-semibold text-gray-600 mb-2">No B2C Advisory Data</p>
                    <p className="text-gray-500">B2C advisor performance will appear here once data is available</p>
                  </div>
                )}

                {/* Pagination Controls */}
                {totalPagesB2C > 1 && (
                  <div className="flex items-center justify-between mt-6 pt-6 border-t border-gray-200">
                    <button
                      onClick={() => setB2cPage(p => Math.max(1, p - 1))}
                      disabled={b2cPage === 1}
                      className="flex items-center space-x-2 px-4 py-2.5 text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg transition-colors"
                    >
                      <ChevronLeft className="w-4 h-4" />
                      <span>Previous</span>
                    </button>
                    <div className="flex items-center space-x-2">
                      {Array.from({ length: Math.min(totalPagesB2C, 7) }, (_, i) => {
                        let pageNum: number;
                        if (totalPagesB2C <= 7) {
                          pageNum = i + 1;
                        } else if (b2cPage <= 4) {
                          pageNum = i + 1;
                        } else if (b2cPage >= totalPagesB2C - 3) {
                          pageNum = totalPagesB2C - 6 + i;
                        } else {
                          pageNum = b2cPage - 3 + i;
                        }
                        return (
                          <button
                            key={pageNum}
                            onClick={() => setB2cPage(pageNum)}
                            className={`w-9 h-9 text-sm font-medium rounded-lg transition-colors ${
                              b2cPage === pageNum
                                ? 'bg-blue-600 text-white shadow-md'
                                : 'text-gray-600 hover:bg-gray-100'
                            }`}
                          >
                            {pageNum}
                          </button>
                        );
                      })}
                    </div>
                    <button
                      onClick={() => setB2cPage(p => Math.min(totalPagesB2C, p + 1))}
                      disabled={b2cPage === totalPagesB2C}
                      className="flex items-center space-x-2 px-4 py-2.5 text-sm font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg border border-blue-200 transition-colors"
                    >
                      <span>{b2cPage === totalPagesB2C ? 'Last Page' : 'Next Advisors'}</span>
                      <ChevronRight className="w-4 h-4" />
                    </button>
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
            );
          })()}

          {activeTab === 'PW' && (
            <div>
              <div className="bg-gradient-to-r from-purple-600 to-pink-600 px-8 py-6">
                <div className="flex items-center space-x-3">
                  <Trophy className="w-8 h-8 text-yellow-300" />
                  <h2 className="text-2xl font-bold text-white">Top 10 Private Wealth Advisors</h2>
                </div>
                <p className="text-purple-100 mt-1">Private Wealth Performance Metrics</p>
              </div>

              <div className="p-8">
                <div className="text-center py-16">
                  <Award className="w-24 h-24 text-purple-200 mx-auto mb-6" />
                  <p className="text-2xl font-bold text-gray-700 mb-3">Private Wealth Data Coming Soon</p>
                  <p className="text-gray-500 max-w-md mx-auto">
                    Import the Private Wealth data to see advisor rankings and performance metrics
                  </p>
                  <div className="mt-8 bg-purple-50 border border-purple-200 rounded-lg p-6 max-w-lg mx-auto text-left">
                    <h4 className="font-semibold text-purple-900 mb-3">📊 PW Metrics Will Include:</h4>
                    <ul className="text-sm text-purple-800 space-y-2">
                      <li className="flex items-start">
                        <span className="mr-2">•</span>
                        <span>AUM (Assets Under Management)</span>
                      </li>
                      <li className="flex items-start">
                        <span className="mr-2">•</span>
                        <span>Net Inflow (MTD & YTD)</span>
                      </li>
                      <li className="flex items-start">
                        <span className="mr-2">•</span>
                        <span>Revenue Generated</span>
                      </li>
                      <li className="flex items-start">
                        <span className="mr-2">•</span>
                        <span>Client Acquisition</span>
                      </li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Org Chart Modal */}
      <OrgChartModal
        isOpen={isOrgChartOpen}
        onClose={() => setIsOrgChartOpen(false)}
        currentEmployeeNumber={user?.employee?.employee_number || ''}
        verticalFilter={myPerformance?.type === 'vertical-support' ? myPerformance.vertical : null}
      />

      {/* Change Password Toast Notification */}
      {passwordResetToast !== 'idle' && (
        <div className="fixed bottom-6 right-6 z-50 animate-in slide-in-from-bottom-4 duration-300">
          <div className={`flex items-start space-x-3 px-5 py-4 rounded-xl shadow-xl border max-w-sm ${
            passwordResetToast === 'sent'
              ? 'bg-green-50 border-green-200 text-green-800'
              : passwordResetToast === 'error'
              ? 'bg-red-50 border-red-200 text-red-800'
              : 'bg-white border-gray-200 text-gray-700'
          }`}>
            {passwordResetToast === 'sending' && (
              <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin flex-shrink-0 mt-0.5" />
            )}
            {passwordResetToast === 'sent' && (
              <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
            )}
            {passwordResetToast === 'error' && (
              <span className="text-red-500 text-lg leading-none flex-shrink-0">!</span>
            )}
            <div>
              <p className="font-semibold text-sm">
                {passwordResetToast === 'sending' && 'Sending reset link...'}
                {passwordResetToast === 'sent' && 'Password reset email sent!'}
                {passwordResetToast === 'error' && 'Failed to send reset email'}
              </p>
              {passwordResetToast === 'sent' && (
                <p className="text-xs mt-0.5 text-green-700">
                  Check your inbox at {user?.email}
                </p>
              )}
              {passwordResetToast === 'error' && (
                <p className="text-xs mt-0.5 text-red-700">Please try again or contact support.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
