'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Shield, ArrowLeft, Users, BarChart2, TrendingUp, Briefcase,
  UserCog, Trophy, Network, Search, Loader2, AlertCircle,
  CheckCircle, Trash2, Plus, LogIn, ChevronRight, X
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
          {activeSection === 'b2b' && <PlaceholderSection title="B2B Data Management" roles={[1,2,5,6,12]} adminRoles={adminRole.roles} />}
          {activeSection === 'b2c' && <PlaceholderSection title="B2C Data Management" roles={[3,7]} adminRoles={adminRole.roles} />}
          {activeSection === 'pw'  && <PlaceholderSection title="Private Wealth Data" roles={[8,9,10,13]} adminRoles={adminRole.roles} />}
          {activeSection === 'employees' && <PlaceholderSection title="Employee Management" roles={[4]} adminRoles={adminRole.roles} />}
          {activeSection === 'contests' && <PlaceholderSection title="Contest Management" roles={[11]} adminRoles={adminRole.roles} />}
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

// ── Placeholder Section ───────────────────────────────────────────────────────
function PlaceholderSection({ title, roles, adminRoles }: { title: string; roles: number[]; adminRoles: number[] }) {
  const allowedRoles = roles.filter(r => adminRoles?.includes(r));

  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-900 mb-2">{title}</h2>
      <p className="text-sm text-gray-500 mb-6">Manage data uploads and edits for this section.</p>

      <div className="grid grid-cols-1 gap-4">
        {allowedRoles.map(roleId => (
          <div key={roleId} className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
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
        ))}
      </div>
    </div>
  );
}
