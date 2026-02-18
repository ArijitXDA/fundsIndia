'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Shield, ArrowLeft, Users, BarChart2, TrendingUp, Briefcase,
  UserCog, Trophy, Search, Loader2, AlertCircle,
  CheckCircle, Trash2, Plus, LogIn, ChevronRight, X,
  Upload, FileSpreadsheet, Eye, RefreshCw, AlertTriangle,
  UserPlus, UserMinus, UserCheck, ChevronDown, ChevronUp,
} from 'lucide-react';

// ── Role definitions ──────────────────────────────────────────────────────────
const ROLE_LABELS: Record<number, string> = {
  1:  'Upload/Update B2B MTD MIS',
  2:  'Upload/Update B2B YTD MIS',
  3:  'Upload/Update B2C MIS',
  4:  'Upload/Update/Edit Employees',
  5:  'Upload/Update B2B MTD Targets',
  6:  'Upload/Update B2B YTD Targets',
  7:  'Upload/Update B2C Targets',
  8:  'Upload/Update PW MTD MIS',
  9:  'Upload/Update PW YTD MIS',
  10: 'Upload/Update PW Targets',
  11: 'Create/Edit/Delete a Contest',
  12: 'Upload/Update/Edit Partner/IFA Vs RM Mapping',
  13: 'Create/Update/Edit IC Vs RM Mapping',
};

// Maps role ID → API endpoint
const ROLE_ENDPOINTS: Record<number, string> = {
  1: '/api/admin/upload/b2b-mtd',
  2: '/api/admin/upload/b2b-ytd',
  3: '/api/admin/upload/b2c',
  4: '/api/admin/upload/employees',
};

const TIER_ROLES: Record<string, number[]> = {
  dev:      [1,2,3,4,5,6,7,8,9,10,11,12,13],
  super:    [1,2,3,4,5,6,7,8,9,10,11,12,13],
  co:       [1,2,3,4,5,6,7,8,9,10,11,12,13],
  'vertical-B2B': [1,2,5,6,12],
  'vertical-B2C': [3,7],
  'vertical-PW':  [8,9,10,13],
};

const TIER_LABELS: Record<string, string> = {
  dev: 'Dev Admin', super: 'Super Admin', co: 'CO Admin', vertical: 'Vertical Admin',
};

const TIER_COLORS: Record<string, string> = {
  dev: 'bg-red-100 text-red-800 border-red-200',
  super: 'bg-purple-100 text-purple-800 border-purple-200',
  co: 'bg-blue-100 text-blue-800 border-blue-200',
  vertical: 'bg-green-100 text-green-800 border-green-200',
};

// ── Sidebar nav items ─────────────────────────────────────────────────────────
type SectionId = 'user-mgmt' | 'impersonate' | 'b2b' | 'b2c' | 'pw' | 'employees' | 'contests';

interface NavItem { id: SectionId; label: string; icon: any; roleIds?: number[]; devOnly?: boolean; assignAdminsOnly?: boolean; }

const NAV_ITEMS: NavItem[] = [
  { id: 'user-mgmt',   label: 'User Management',  icon: UserCog,    assignAdminsOnly: true },
  { id: 'impersonate', label: 'Impersonate User',  icon: LogIn,      devOnly: true },
  { id: 'b2b',         label: 'B2B Data',          icon: BarChart2,  roleIds: [1,2,5,6,12] },
  { id: 'b2c',         label: 'B2C Data',          icon: TrendingUp, roleIds: [3,7] },
  { id: 'pw',          label: 'Private Wealth',    icon: Briefcase,  roleIds: [8,9,10,13] },
  { id: 'employees',   label: 'Employees',         icon: Users,      roleIds: [4] },
  { id: 'contests',    label: 'Contests',          icon: Trophy,     roleIds: [11] },
];

// ── Main Component ────────────────────────────────────────────────────────────
export default function AdminPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [adminRole, setAdminRole] = useState<any>(null);
  const [activeSection, setActiveSection] = useState<SectionId>('user-mgmt');
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    fetch('/api/admin/check')
      .then(r => r.json())
      .then(data => {
        if (!data.adminRole) {
          router.push('/dashboard');
          return;
        }
        setAdminRole(data.adminRole);
        // Default to first visible section
        const first = getVisibleSections(data.adminRole)[0];
        if (first) setActiveSection(first.id);
        setLoading(false);
      })
      .catch(() => router.push('/dashboard'));
  }, [router]);

  const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  };

  const getVisibleSections = (role: any) => {
    return NAV_ITEMS.filter(item => {
      if (item.devOnly) return role.can_impersonate;
      if (item.assignAdminsOnly) return role.can_assign_admins;
      if (item.roleIds) return item.roleIds.some((r: number) => role.roles?.includes(r));
      return true;
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-indigo-600 animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Loading admin panel...</p>
        </div>
      </div>
    );
  }

  const visibleSections = getVisibleSections(adminRole);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Top Header */}
      <header className="bg-white border-b border-gray-200 shadow-sm sticky top-0 z-40">
        <div className="max-w-screen-2xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <button
              onClick={() => router.push('/dashboard')}
              className="flex items-center space-x-2 text-gray-600 hover:text-gray-900 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="text-sm font-medium">Back to Dashboard</span>
            </button>
            <div className="h-6 w-px bg-gray-300" />
            <div className="flex items-center space-x-2">
              <Shield className="w-5 h-5 text-rose-500" />
              <h1 className="text-xl font-bold text-gray-900">Admin Panel</h1>
            </div>
          </div>
          <div className="flex items-center space-x-3">
            <img src="https://cdn.fundsindia.com/prelogin/fi-logo-new.svg" alt="FundsIndia" className="h-8 w-auto" />
            <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${TIER_COLORS[adminRole.tier]}`}>
              {TIER_LABELS[adminRole.tier]}
              {adminRole.vertical ? ` — ${adminRole.vertical}` : ''}
            </span>
          </div>
        </div>
      </header>

      <div className="flex flex-1 max-w-screen-2xl mx-auto w-full">
        {/* Sidebar */}
        <aside className="w-64 bg-white border-r border-gray-200 shrink-0">
          <nav className="p-4 space-y-1 sticky top-16">
            {visibleSections.map(item => {
              const Icon = item.icon;
              const isActive = activeSection === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveSection(item.id)}
                  className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                    isActive
                      ? 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                  }`}
                >
                  <Icon className={`w-4 h-4 ${isActive ? 'text-indigo-600' : 'text-gray-400'}`} />
                  <span>{item.label}</span>
                  {isActive && <ChevronRight className="w-3.5 h-3.5 ml-auto text-indigo-400" />}
                </button>
              );
            })}
          </nav>
        </aside>

        {/* Main Content */}
        <main className="flex-1 p-8 overflow-y-auto">
          {activeSection === 'user-mgmt' && (
            <UserManagementSection adminRole={adminRole} showToast={showToast} />
          )}
          {activeSection === 'impersonate' && (
            <ImpersonateSection showToast={showToast} router={router} />
          )}
          {activeSection === 'b2b' && (
            <DataSection
              title="B2B Data Management"
              description="Upload and manage B2B sales MIS data for the current month and year-to-date."
              roles={[1, 2, 5, 6, 12]}
              adminRoles={adminRole.roles}
              showToast={showToast}
            />
          )}
          {activeSection === 'b2c' && (
            <DataSection
              title="B2C Data Management"
              description="Upload and manage B2C advisory MIS and target data."
              roles={[3, 7]}
              adminRoles={adminRole.roles}
              showToast={showToast}
            />
          )}
          {activeSection === 'pw' && (
            <DataSection
              title="Private Wealth Data"
              description="Upload and manage Private Wealth MIS and target data."
              roles={[8, 9, 10, 13]}
              adminRoles={adminRole.roles}
              showToast={showToast}
            />
          )}
          {activeSection === 'employees' && (
            <DataSection
              title="Employee Management"
              description="Upload and sync the employee master data. Shows additions, updates, and deactivations before confirming."
              roles={[4]}
              adminRoles={adminRole.roles}
              showToast={showToast}
            />
          )}
          {activeSection === 'contests' && (
            <ComingSoonSection title="Contest Management" description="Create, edit, and manage Hall of Fame contests." />
          )}
        </main>
      </div>

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 flex items-center space-x-3 px-5 py-4 rounded-xl shadow-xl border max-w-sm ${
          toast.type === 'success' ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-800'
        }`}>
          {toast.type === 'success' ? <CheckCircle className="w-5 h-5 text-green-600 shrink-0" /> : <AlertCircle className="w-5 h-5 text-red-500 shrink-0" />}
          <p className="text-sm font-medium">{toast.message}</p>
          <button onClick={() => setToast(null)} className="ml-2 opacity-60 hover:opacity-100"><X className="w-4 h-4" /></button>
        </div>
      )}
    </div>
  );
}

// ── Data Section (wraps upload panels for each role) ──────────────────────────
function DataSection({
  title, description, roles, adminRoles, showToast,
}: {
  title: string;
  description: string;
  roles: number[];
  adminRoles: number[];
  showToast: Function;
}) {
  const allowedRoles = roles.filter(r => adminRoles?.includes(r));

  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-900 mb-1">{title}</h2>
      <p className="text-sm text-gray-500 mb-6">{description}</p>

      <div className="space-y-6">
        {allowedRoles.map(roleId => {
          const endpoint = ROLE_ENDPOINTS[roleId];
          if (endpoint) {
            return (
              <UploadPanel
                key={roleId}
                roleId={roleId}
                endpoint={endpoint}
                showToast={showToast}
              />
            );
          }
          return (
            <ComingSoonCard key={roleId} roleId={roleId} />
          );
        })}
        {allowedRoles.length === 0 && (
          <div className="text-center py-16 text-gray-400">
            <Shield className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p>No roles assigned for this section.</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Upload Panel (two-phase: preview → confirm) ───────────────────────────────
type UploadPhase = 'idle' | 'uploading' | 'preview' | 'confirming' | 'done' | 'error';

function UploadPanel({ roleId, endpoint, showToast }: { roleId: number; endpoint: string; showToast: Function }) {
  const [phase, setPhase] = useState<UploadPhase>('idle');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<any>(null);
  const [result, setResult] = useState<any>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setPhase('idle');
    setFile(null);
    setPreview(null);
    setResult(null);
    setErrorMsg('');
    setShowDetails(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleFile = (f: File) => {
    setFile(f);
    handleUpload(f);
  };

  const handleUpload = async (f: File) => {
    setPhase('uploading');
    setErrorMsg('');
    const form = new FormData();
    form.append('file', f);
    form.append('confirm', 'false');

    try {
      const res = await fetch(endpoint, { method: 'POST', body: form });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || 'Failed to parse file');
        setPhase('error');
        return;
      }
      setPreview(data);
      setPhase('preview');
    } catch (e: any) {
      setErrorMsg(e.message || 'Network error');
      setPhase('error');
    }
  };

  const handleConfirm = async () => {
    if (!file) return;
    setPhase('confirming');
    const form = new FormData();
    form.append('file', file);
    form.append('confirm', 'true');

    try {
      const res = await fetch(endpoint, { method: 'POST', body: form });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || 'Failed to execute upload');
        setPhase('error');
        return;
      }
      setResult(data);
      setPhase('done');
      showToast('success', buildSuccessMessage(roleId, data));
    } catch (e: any) {
      setErrorMsg(e.message || 'Network error');
      setPhase('error');
    }
  };

  const buildSuccessMessage = (rId: number, data: any) => {
    if (rId === 4) {
      const r = data.result;
      return `Employees synced: +${r.added} new, ${r.updated} updated, ${r.deactivated} deactivated`;
    }
    return `Successfully uploaded ${data.result?.inserted ?? 0} records from ${data.result?.filename ?? 'file'}`;
  };

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gray-50">
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-indigo-100 rounded-lg">
            <FileSpreadsheet className="w-4 h-4 text-indigo-600" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900 text-sm">{ROLE_LABELS[roleId]}</h3>
            <p className="text-xs text-gray-400 mt-0.5">Role ID: {roleId} · {getEndpointLabel(endpoint)}</p>
          </div>
        </div>
        {phase !== 'idle' && (
          <button
            onClick={reset}
            className="flex items-center space-x-1.5 text-xs text-gray-500 hover:text-gray-700 px-3 py-1.5 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <RefreshCw className="w-3 h-3" />
            <span>Reset</span>
          </button>
        )}
      </div>

      <div className="p-6">
        {/* IDLE — file picker */}
        {phase === 'idle' && (
          <div
            className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors cursor-pointer ${
              dragOver ? 'border-indigo-400 bg-indigo-50' : 'border-gray-300 hover:border-indigo-300 hover:bg-gray-50'
            }`}
            onClick={() => fileInputRef.current?.click()}
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={e => {
              e.preventDefault();
              setDragOver(false);
              const f = e.dataTransfer.files[0];
              if (f) handleFile(f);
            }}
          >
            <Upload className="w-8 h-8 text-gray-300 mx-auto mb-3" />
            <p className="text-sm font-medium text-gray-600">
              Drag &amp; drop your file here, or <span className="text-indigo-600">click to browse</span>
            </p>
            <p className="text-xs text-gray-400 mt-1">Accepts .xlsx, .xls, .csv</p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
            />
          </div>
        )}

        {/* UPLOADING — parsing */}
        {phase === 'uploading' && (
          <div className="flex flex-col items-center justify-center py-10 space-y-3">
            <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
            <p className="text-sm text-gray-600 font-medium">Parsing file: <span className="font-semibold">{file?.name}</span></p>
            <p className="text-xs text-gray-400">Analyzing data and computing changes…</p>
          </div>
        )}

        {/* ERROR */}
        {phase === 'error' && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-5">
            <div className="flex items-start space-x-3">
              <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-red-800 text-sm">Upload Failed</p>
                <p className="text-sm text-red-700 mt-1">{errorMsg}</p>
                <button
                  onClick={reset}
                  className="mt-3 text-xs font-medium text-red-600 hover:text-red-800 underline"
                >
                  Try again
                </button>
              </div>
            </div>
          </div>
        )}

        {/* PREVIEW — show diff, ask for confirmation */}
        {phase === 'preview' && preview && (
          <div className="space-y-4">
            {/* File badge */}
            <div className="flex items-center space-x-2 text-sm text-gray-600 bg-gray-50 rounded-lg px-4 py-2.5 border border-gray-200">
              <FileSpreadsheet className="w-4 h-4 text-indigo-500" />
              <span className="font-medium">{file?.name}</span>
              <span className="text-gray-400">·</span>
              <span className="text-gray-400">{file ? formatBytes(file.size) : ''}</span>
            </div>

            {/* Warning */}
            <div className="flex items-start space-x-3 bg-amber-50 border border-amber-200 rounded-xl p-4">
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-amber-800">Review before confirming</p>
                <p className="text-xs text-amber-700 mt-0.5">{preview.warning || preview.message}</p>
              </div>
            </div>

            {/* Stats */}
            <PreviewStats roleId={roleId} preview={preview} />

            {/* Expandable sample rows / diff details */}
            {roleId === 4 ? (
              <EmployeesDiffDetails preview={preview} show={showDetails} onToggle={() => setShowDetails(v => !v)} />
            ) : (
              <SampleRowsDetails preview={preview} show={showDetails} onToggle={() => setShowDetails(v => !v)} />
            )}

            {/* Actions */}
            <div className="flex items-center space-x-3 pt-2">
              <button
                onClick={handleConfirm}
                className="flex items-center space-x-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-lg transition-colors shadow-sm"
              >
                <CheckCircle className="w-4 h-4" />
                <span>Confirm &amp; Execute Upload</span>
              </button>
              <button
                onClick={reset}
                className="px-5 py-2.5 text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* CONFIRMING — executing */}
        {phase === 'confirming' && (
          <div className="flex flex-col items-center justify-center py-10 space-y-3">
            <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
            <p className="text-sm font-semibold text-gray-700">Executing upload…</p>
            <p className="text-xs text-gray-400">Writing data to database, please wait.</p>
          </div>
        )}

        {/* DONE — success result */}
        {phase === 'done' && result && (
          <div className="space-y-4">
            <div className="bg-green-50 border border-green-200 rounded-xl p-5 flex items-start space-x-3">
              <CheckCircle className="w-6 h-6 text-green-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-green-800">Upload complete!</p>
                <ResultSummary roleId={roleId} result={result} />
              </div>
            </div>

            {result.errors && result.errors.length > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                <p className="text-sm font-semibold text-red-800 mb-2">Partial errors ({result.errors.length})</p>
                <ul className="space-y-1">
                  {result.errors.map((e: string, i: number) => (
                    <li key={i} className="text-xs text-red-700 font-mono">{e}</li>
                  ))}
                </ul>
              </div>
            )}

            <button
              onClick={reset}
              className="flex items-center space-x-2 px-4 py-2 text-sm font-medium text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 rounded-lg transition-colors"
            >
              <Upload className="w-4 h-4" />
              <span>Upload another file</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Preview Stats Grid ────────────────────────────────────────────────────────
function PreviewStats({ roleId, preview }: { roleId: number; preview: any }) {
  const s = preview.stats;

  if (roleId === 4) {
    // Employee diff stats
    const cards = [
      { label: 'Total in File', value: s.totalInFile, icon: Users, color: 'bg-blue-50 text-blue-700 border-blue-200' },
      { label: 'New Employees', value: s.newEmployees, icon: UserPlus, color: 'bg-green-50 text-green-700 border-green-200' },
      { label: 'Updated', value: s.updatedEmployees, icon: UserCheck, color: 'bg-amber-50 text-amber-700 border-amber-200' },
      { label: 'To Deactivate', value: s.deactivatedEmployees, icon: UserMinus, color: 'bg-red-50 text-red-700 border-red-200' },
      { label: 'Unchanged', value: s.unchanged, icon: CheckCircle, color: 'bg-gray-50 text-gray-600 border-gray-200' },
    ];
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {cards.map(c => (
          <StatCard key={c.label} {...c} />
        ))}
      </div>
    );
  }

  if (roleId === 1 || roleId === 2) {
    // B2B stats
    const cards = [
      { label: 'Total Records', value: s.totalRecords, icon: BarChart2, color: 'bg-blue-50 text-blue-700 border-blue-200' },
      { label: 'With RM', value: s.validRMRecords, icon: UserCheck, color: 'bg-green-50 text-green-700 border-green-200' },
      { label: 'No RM', value: s.noRMRecords, icon: AlertTriangle, color: 'bg-amber-50 text-amber-700 border-amber-200' },
      { label: roleId === 1 ? 'COB 100% (Cr.)' : 'COB 100% YTD', value: formatCr(roleId === 1 ? s.totalCOB100 : s.totalCOB100YTD), icon: TrendingUp, color: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
      { label: 'MF+SIF+MSCI (Cr.)', value: formatCr(s.totalMFSIFMSCI), icon: BarChart2, color: 'bg-purple-50 text-purple-700 border-purple-200' },
    ];
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {cards.map(c => <StatCard key={c.label} {...c} />)}
      </div>
    );
  }

  if (roleId === 3) {
    // B2C stats
    const cards = [
      { label: 'Total Advisors', value: s.totalAdvisors, icon: Users, color: 'bg-blue-50 text-blue-700 border-blue-200' },
      { label: 'Net Inflow YTD (Cr.)', value: formatCr(s.totalNetInflowYTD), icon: TrendingUp, color: 'bg-green-50 text-green-700 border-green-200' },
      { label: 'Current AUM (Cr.)', value: formatCr(s.totalCurrentAUM), icon: BarChart2, color: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
      { label: 'Assigned Leads', value: s.totalAssignedLeads, icon: UserCheck, color: 'bg-purple-50 text-purple-700 border-purple-200' },
    ];
    return (
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {cards.map(c => <StatCard key={c.label} {...c} />)}
      </div>
    );
  }

  // Generic fallback
  return (
    <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-sm text-gray-700">
      <pre className="text-xs">{JSON.stringify(s, null, 2)}</pre>
    </div>
  );
}

function StatCard({ label, value, icon: Icon, color }: { label: string; value: any; icon: any; color: string }) {
  return (
    <div className={`rounded-xl p-4 border ${color}`}>
      <div className="flex items-center space-x-2 mb-2">
        <Icon className="w-4 h-4 opacity-70" />
        <p className="text-xs font-medium opacity-80">{label}</p>
      </div>
      <p className="text-xl font-bold">{value ?? 0}</p>
    </div>
  );
}

// ── Employee Diff Details ─────────────────────────────────────────────────────
function EmployeesDiffDetails({ preview, show, onToggle }: { preview: any; show: boolean; onToggle: () => void }) {
  const hasDetails = (preview.additions?.length || 0) + (preview.updates?.length || 0) + (preview.deactivations?.length || 0) > 0;
  if (!hasDetails) return null;

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-5 py-3.5 bg-gray-50 hover:bg-gray-100 transition-colors text-sm font-medium text-gray-700"
      >
        <div className="flex items-center space-x-2">
          <Eye className="w-4 h-4 text-gray-400" />
          <span>View change details</span>
          <span className="text-xs text-gray-400">
            ({preview.additionsTotal ?? 0} new · {preview.updatesTotal ?? 0} updated · {preview.deactivationsTotal ?? 0} deactivated)
          </span>
        </div>
        {show ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
      </button>

      {show && (
        <div className="divide-y divide-gray-100">
          {/* New Employees */}
          {preview.additions?.length > 0 && (
            <div className="p-5">
              <p className="text-xs font-semibold text-green-700 uppercase tracking-wider mb-3 flex items-center space-x-1.5">
                <UserPlus className="w-3.5 h-3.5" />
                <span>New Employees ({preview.additionsTotal}){preview.additionsTotal > preview.additions.length ? ` — showing first ${preview.additions.length}` : ''}</span>
              </p>
              <div className="space-y-1.5">
                {preview.additions.map((e: any, i: number) => (
                  <div key={i} className="flex items-center space-x-3 bg-green-50 rounded-lg px-3 py-2 text-xs">
                    <span className="font-mono font-semibold text-green-800 w-16 shrink-0">{e.employee_number}</span>
                    <span className="font-medium text-green-900">{e.full_name}</span>
                    <span className="text-green-600 ml-auto">{e.business_unit} · {e.job_title}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Updates */}
          {preview.updates?.length > 0 && (
            <div className="p-5">
              <p className="text-xs font-semibold text-amber-700 uppercase tracking-wider mb-3 flex items-center space-x-1.5">
                <UserCheck className="w-3.5 h-3.5" />
                <span>Updated ({preview.updatesTotal}){preview.updatesTotal > preview.updates.length ? ` — showing first ${preview.updates.length}` : ''}</span>
              </p>
              <div className="space-y-2">
                {preview.updates.map((u: any, i: number) => (
                  <div key={i} className="bg-amber-50 rounded-lg px-3 py-2 text-xs">
                    <div className="flex items-center space-x-2 mb-1.5">
                      <span className="font-mono font-semibold text-amber-800">{u.employee_number}</span>
                      <span className="font-medium text-amber-900">{u.full_name}</span>
                    </div>
                    <ul className="space-y-0.5 pl-2">
                      {u.changes.map((c: string, j: number) => (
                        <li key={j} className="text-amber-700 font-mono">→ {c}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Deactivations */}
          {preview.deactivations?.length > 0 && (
            <div className="p-5">
              <p className="text-xs font-semibold text-red-700 uppercase tracking-wider mb-3 flex items-center space-x-1.5">
                <UserMinus className="w-3.5 h-3.5" />
                <span>To Deactivate ({preview.deactivationsTotal}){preview.deactivationsTotal > preview.deactivations.length ? ` — showing first ${preview.deactivations.length}` : ''}</span>
              </p>
              <div className="space-y-1.5">
                {preview.deactivations.map((d: any, i: number) => (
                  <div key={i} className="flex items-center space-x-3 bg-red-50 rounded-lg px-3 py-2 text-xs">
                    <span className="font-mono font-semibold text-red-800 w-16 shrink-0">{d.employee_number}</span>
                    <span className="font-medium text-red-900">{d.full_name}</span>
                    <span className="text-red-400 ml-auto text-xs italic">Will be set to Inactive</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Sample Rows Details (B2B / B2C) ───────────────────────────────────────────
function SampleRowsDetails({ preview, show, onToggle }: { preview: any; show: boolean; onToggle: () => void }) {
  const hasSummary = preview.teamSummary || preview.zoneSummary;
  const hasSamples = preview.sampleRows?.length > 0;
  if (!hasSummary && !hasSamples) return null;

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-5 py-3.5 bg-gray-50 hover:bg-gray-100 transition-colors text-sm font-medium text-gray-700"
      >
        <div className="flex items-center space-x-2">
          <Eye className="w-4 h-4 text-gray-400" />
          <span>View breakdown &amp; sample rows</span>
        </div>
        {show ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
      </button>

      {show && (
        <div className="p-5 space-y-5">
          {/* Summary breakdown */}
          {hasSummary && (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
                {preview.teamSummary ? 'By Team' : 'By Zone'}
              </p>
              <div className="flex flex-wrap gap-2">
                {Object.entries(preview.teamSummary || preview.zoneSummary).map(([key, count]: [string, any]) => (
                  <span key={key} className="text-xs bg-indigo-50 text-indigo-700 border border-indigo-200 px-2.5 py-1 rounded-full font-medium">
                    {key}: <strong>{count}</strong>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Sample rows */}
          {hasSamples && (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
                Sample Records (first {preview.sampleRows.length})
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-xs border border-gray-200 rounded-lg overflow-hidden">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      {Object.keys(preview.sampleRows[0]).map(k => (
                        <th key={k} className="text-left px-3 py-2 text-gray-500 font-semibold whitespace-nowrap">{k}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {preview.sampleRows.map((row: any, i: number) => (
                      <tr key={i} className="hover:bg-gray-50">
                        {Object.values(row).map((v: any, j: number) => (
                          <td key={j} className="px-3 py-2 text-gray-700 font-mono whitespace-nowrap">{String(v ?? '—')}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Result Summary ────────────────────────────────────────────────────────────
function ResultSummary({ roleId, result }: { roleId: number; result: any }) {
  if (roleId === 4) {
    const r = result.result;
    return (
      <div className="mt-2 text-sm text-green-700 space-y-0.5">
        <p>✓ <strong>{r.added}</strong> new employees added</p>
        <p>✓ <strong>{r.updated}</strong> employees updated</p>
        <p>✓ <strong>{r.deactivated}</strong> employees deactivated</p>
      </div>
    );
  }
  const r = result.result;
  return (
    <p className="mt-1 text-sm text-green-700">
      <strong>{r.inserted}</strong> records inserted from <em>{r.filename}</em>
    </p>
  );
}

// ── Coming Soon Card ──────────────────────────────────────────────────────────
function ComingSoonCard({ roleId }: { roleId: number }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-gray-900">{ROLE_LABELS[roleId]}</h3>
          <p className="text-xs text-gray-400 mt-1">Role ID: {roleId}</p>
        </div>
        <span className="px-3 py-1.5 bg-yellow-50 text-yellow-700 border border-yellow-200 text-xs font-medium rounded-full">
          Coming Soon
        </span>
      </div>
      <div className="mt-4 bg-gray-50 rounded-lg p-4 border border-dashed border-gray-300 text-center text-sm text-gray-400">
        Upload interface for this feature will be built here
      </div>
    </div>
  );
}

// ── Coming Soon Section ───────────────────────────────────────────────────────
function ComingSoonSection({ title, description }: { title: string; description: string }) {
  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-900 mb-1">{title}</h2>
      <p className="text-sm text-gray-500 mb-6">{description}</p>
      <div className="bg-white border border-dashed border-gray-300 rounded-xl p-16 text-center">
        <Trophy className="w-10 h-10 text-gray-300 mx-auto mb-3" />
        <p className="text-gray-500 font-medium">Coming Soon</p>
        <p className="text-gray-400 text-sm mt-1">This feature is under development.</p>
      </div>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatCr(val: any) {
  const n = parseFloat(val);
  if (isNaN(n)) return '0';
  return n.toLocaleString('en-IN', { maximumFractionDigits: 2 });
}

function getEndpointLabel(endpoint: string) {
  const parts = endpoint.split('/');
  return parts[parts.length - 1].toUpperCase();
}

// ── User Management Section ───────────────────────────────────────────────────
function UserManagementSection({ adminRole, showToast }: { adminRole: any; showToast: Function }) {
  const [admins, setAdmins] = useState<any[]>([]);
  const [loadingAdmins, setLoadingAdmins] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);

  const fetchAdmins = () => {
    setLoadingAdmins(true);
    fetch('/api/admin/list-admins')
      .then(r => r.json())
      .then(d => { setAdmins(d.admins || []); setLoadingAdmins(false); })
      .catch(() => setLoadingAdmins(false));
  };

  useEffect(() => { fetchAdmins(); }, []);

  const handleRemove = async (email: string) => {
    if (!confirm(`Remove admin access for ${email}?`)) return;
    const res = await fetch('/api/admin/remove-role', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    const data = await res.json();
    if (res.ok) { showToast('success', data.message); fetchAdmins(); }
    else showToast('error', data.error || 'Failed to remove admin');
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">User Management</h2>
          <p className="text-sm text-gray-500 mt-1">Manage admin roles and permissions</p>
        </div>
        <button
          onClick={() => setShowAddForm(true)}
          className="flex items-center space-x-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors shadow-sm"
        >
          <Plus className="w-4 h-4" />
          <span>Add Admin</span>
        </button>
      </div>

      {showAddForm && (
        <AddAdminForm
          callerTier={adminRole.tier}
          onClose={() => setShowAddForm(false)}
          onSuccess={() => { setShowAddForm(false); fetchAdmins(); showToast('success', 'Admin role assigned successfully'); }}
          showToast={showToast}
        />
      )}

      {loadingAdmins ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Admin</th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Tier</th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Roles</th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Assigned By</th>
                <th className="px-6 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {admins.map(admin => (
                <tr key={admin.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4">
                    <div>
                      <p className="font-medium text-gray-900">{admin.email}</p>
                      <p className="text-xs text-gray-400">{admin.employee_id}</p>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${TIER_COLORS[admin.tier]}`}>
                      {TIER_LABELS[admin.tier]}{admin.vertical ? ` (${admin.vertical})` : ''}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-wrap gap-1 max-w-xs">
                      {admin.roles?.length === 13 ? (
                        <span className="text-xs bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full border border-indigo-200">All 13 roles</span>
                      ) : admin.roles?.map((r: number) => (
                        <span key={r} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">Role {r}</span>
                      ))}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-gray-500 text-xs">{admin.assigned_by || '—'}</td>
                  <td className="px-6 py-4 text-right">
                    {admin.tier !== 'dev' || adminRole.tier === 'dev' ? (
                      <button
                        onClick={() => handleRemove(admin.email)}
                        className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        title="Remove admin"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    ) : (
                      <span className="text-xs text-gray-300 px-2">Protected</span>
                    )}
                  </td>
                </tr>
              ))}
              {admins.length === 0 && (
                <tr><td colSpan={5} className="px-6 py-12 text-center text-gray-400">No admins found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Add Admin Form ────────────────────────────────────────────────────────────
function AddAdminForm({ callerTier, onClose, onSuccess, showToast }: { callerTier: string; onClose: () => void; onSuccess: () => void; showToast: Function }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [selected, setSelected] = useState<any>(null);
  const [tier, setTier] = useState('vertical');
  const [vertical, setVertical] = useState('B2B');
  const [roles, setRoles] = useState<number[]>([1,2,5,6,12]);
  const [submitting, setSubmitting] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);

  const searchEmployees = async (q: string) => {
    if (q.length < 2) { setResults([]); return; }
    setSearchLoading(true);
    const res = await fetch(`/api/admin/search-employees?q=${encodeURIComponent(q)}`);
    const data = await res.json();
    setResults(data.employees || []);
    setSearchLoading(false);
  };

  useEffect(() => {
    const t = setTimeout(() => searchEmployees(query), 300);
    return () => clearTimeout(t);
  }, [query]);

  // Auto-update roles when tier/vertical changes
  useEffect(() => {
    const key = tier === 'vertical' ? `vertical-${vertical}` : tier;
    setRoles(TIER_ROLES[key] || []);
  }, [tier, vertical]);

  const handleSubmit = async () => {
    if (!selected) { showToast('error', 'Please select an employee'); return; }
    setSubmitting(true);
    const res = await fetch('/api/admin/assign-role', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: selected.work_email,
        employeeId: selected.employee_number,
        tier,
        vertical: tier === 'vertical' ? vertical : null,
        roles,
      }),
    });
    const data = await res.json();
    setSubmitting(false);
    if (res.ok) onSuccess();
    else showToast('error', data.error || 'Failed to assign role');
  };

  const availableTiers = callerTier === 'dev'
    ? [{ value: 'dev', label: 'Dev Admin' }, { value: 'super', label: 'Super Admin' }, { value: 'co', label: 'CO Admin' }, { value: 'vertical', label: 'Vertical Admin' }]
    : [{ value: 'super', label: 'Super Admin' }, { value: 'co', label: 'CO Admin' }, { value: 'vertical', label: 'Vertical Admin' }];

  return (
    <div className="bg-white border border-indigo-200 rounded-xl p-6 mb-6 shadow-sm">
      <div className="flex items-center justify-between mb-5">
        <h3 className="text-lg font-semibold text-gray-900">Add New Admin</h3>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
      </div>

      {/* Employee Search */}
      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-1.5">Search Employee</label>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={selected ? `${selected.full_name} (${selected.employee_number})` : query}
            onChange={e => { setQuery(e.target.value); setSelected(null); }}
            placeholder="Search by name, employee ID, or email..."
            className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />
          {searchLoading && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 animate-spin" />}
        </div>
        {results.length > 0 && !selected && (
          <div className="border border-gray-200 rounded-lg mt-1 divide-y divide-gray-100 shadow-md bg-white z-10 relative">
            {results.map(emp => (
              <button key={emp.id} onClick={() => { setSelected(emp); setResults([]); setQuery(''); }}
                className="w-full text-left px-4 py-3 hover:bg-indigo-50 transition-colors text-sm">
                <p className="font-medium text-gray-900">{emp.full_name}</p>
                <p className="text-xs text-gray-500">{emp.employee_number} · {emp.work_email} · {emp.business_unit}</p>
              </button>
            ))}
          </div>
        )}
        {selected && (
          <div className="mt-2 bg-indigo-50 border border-indigo-200 rounded-lg p-3 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-indigo-800">{selected.full_name}</p>
              <p className="text-xs text-indigo-600">{selected.employee_number} · {selected.work_email}</p>
            </div>
            <button onClick={() => setSelected(null)} className="text-indigo-400 hover:text-indigo-600"><X className="w-4 h-4" /></button>
          </div>
        )}
      </div>

      {/* Tier Selection */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Admin Tier</label>
          <select value={tier} onChange={e => setTier(e.target.value)}
            className="w-full border border-gray-300 rounded-lg py-2.5 px-3 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent">
            {availableTiers.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
        {tier === 'vertical' && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Vertical</label>
            <select value={vertical} onChange={e => setVertical(e.target.value)}
              className="w-full border border-gray-300 rounded-lg py-2.5 px-3 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent">
              <option value="B2B">B2B</option>
              <option value="B2C">B2C</option>
              <option value="PW">Private Wealth</option>
            </select>
          </div>
        )}
      </div>

      {/* Roles */}
      <div className="mb-5">
        <label className="block text-sm font-medium text-gray-700 mb-2">Assigned Roles</label>
        <div className="grid grid-cols-1 gap-2 max-h-48 overflow-y-auto border border-gray-200 rounded-lg p-3 bg-gray-50">
          {Object.entries(ROLE_LABELS).map(([id, label]) => {
            const roleId = parseInt(id);
            const checked = roles.includes(roleId);
            return (
              <label key={id} className="flex items-center space-x-3 cursor-pointer hover:bg-white rounded p-1.5 transition-colors">
                <input type="checkbox" checked={checked}
                  onChange={e => setRoles(e.target.checked ? [...roles, roleId] : roles.filter(r => r !== roleId))}
                  className="w-4 h-4 text-indigo-600 rounded border-gray-300 focus:ring-indigo-500"
                />
                <span className="text-sm text-gray-700">{label}</span>
              </label>
            );
          })}
        </div>
      </div>

      <div className="flex items-center space-x-3">
        <button onClick={handleSubmit} disabled={submitting || !selected}
          className="flex items-center space-x-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white text-sm font-medium rounded-lg transition-colors">
          {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          <span>{submitting ? 'Assigning...' : 'Assign Role'}</span>
        </button>
        <button onClick={onClose} className="px-5 py-2.5 text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors">
          Cancel
        </button>
      </div>
    </div>
  );
}

// ── Impersonate Section ───────────────────────────────────────────────────────
function ImpersonateSection({ showToast, router }: { showToast: Function; router: any }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [selected, setSelected] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);

  const searchEmployees = async (q: string) => {
    if (q.length < 2) { setResults([]); return; }
    setSearchLoading(true);
    const res = await fetch(`/api/admin/search-employees?q=${encodeURIComponent(q)}`);
    const data = await res.json();
    setResults(data.employees || []);
    setSearchLoading(false);
  };

  useEffect(() => {
    const t = setTimeout(() => searchEmployees(query), 300);
    return () => clearTimeout(t);
  }, [query]);

  const handleImpersonate = async () => {
    if (!selected) return;
    setLoading(true);
    const res = await fetch('/api/admin/impersonate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetEmployeeNumber: selected.employee_number }),
    });
    const data = await res.json();
    setLoading(false);
    if (res.ok) {
      router.push('/dashboard');
      router.refresh();
    } else {
      showToast('error', data.error || 'Failed to impersonate user');
    }
  };

  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-900 mb-2">Impersonate User</h2>
      <p className="text-sm text-gray-500 mb-6">
        Sign in as any employee to test, verify, or troubleshoot their dashboard experience.
        An amber banner will appear indicating you are in impersonation mode.
      </p>

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6 flex items-start space-x-3">
        <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
        <div className="text-sm text-amber-800">
          <p className="font-semibold">Dev Admin Only Feature</p>
          <p className="mt-0.5">This uses the test password (Pass@123). The impersonated session is tracked. Click "Exit &amp; Return to Admin" in the banner to switch back.</p>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm max-w-lg">
        <label className="block text-sm font-medium text-gray-700 mb-1.5">Search Employee</label>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={selected ? `${selected.full_name} (${selected.employee_number})` : query}
            onChange={e => { setQuery(e.target.value); setSelected(null); }}
            placeholder="Search by name, employee ID, or email..."
            className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />
          {searchLoading && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 animate-spin" />}
        </div>

        {results.length > 0 && !selected && (
          <div className="border border-gray-200 rounded-lg mt-1 divide-y divide-gray-100 shadow-md bg-white">
            {results.map(emp => (
              <button key={emp.id} onClick={() => { setSelected(emp); setResults([]); setQuery(''); }}
                className="w-full text-left px-4 py-3 hover:bg-indigo-50 transition-colors text-sm">
                <p className="font-medium text-gray-900">{emp.full_name}</p>
                <p className="text-xs text-gray-500">{emp.employee_number} · {emp.work_email} · {emp.business_unit}</p>
              </button>
            ))}
          </div>
        )}

        {selected && (
          <div className="mt-3 bg-indigo-50 border border-indigo-200 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold text-indigo-900">{selected.full_name}</p>
                <p className="text-xs text-indigo-600 mt-0.5">{selected.employee_number} · {selected.work_email}</p>
                <p className="text-xs text-indigo-500 mt-0.5">{selected.business_unit} · {selected.job_title}</p>
              </div>
              <button onClick={() => setSelected(null)} className="text-indigo-400 hover:text-indigo-600"><X className="w-4 h-4" /></button>
            </div>
          </div>
        )}

        <button
          onClick={handleImpersonate}
          disabled={!selected || loading}
          className="mt-4 w-full flex items-center justify-center space-x-2 px-5 py-3 bg-amber-500 hover:bg-amber-600 disabled:bg-amber-200 text-white font-medium rounded-lg transition-colors"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogIn className="w-4 h-4" />}
          <span>{loading ? 'Switching session...' : 'Sign in as this user'}</span>
        </button>
      </div>
    </div>
  );
}
