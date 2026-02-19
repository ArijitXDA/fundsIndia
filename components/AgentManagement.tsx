'use client';

import { useEffect, useState } from 'react';
import {
  Bot, Plus, Trash2, Edit3, Save, X, ChevronDown, ChevronUp,
  Search, User, Shield, Zap, Brain, Settings2, ToggleLeft, ToggleRight,
  CheckCircle, AlertCircle, Sliders, Database, Lock, Unlock, RefreshCw,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Persona {
  id: string;
  name: string;
  description: string;
  model: string;
  temperature: number;
  top_p: number;
  max_tokens: number;
  presence_penalty: number;
  frequency_penalty: number;
  agent_name: string;
  tone: string;
  output_format: string;
  language: string;
  can_proactively_surface_insights: boolean;
  can_make_recommendations: boolean;
  can_do_forecasting: boolean;
  can_suggest_contest_strategy: boolean;
  can_discuss_org_structure: boolean;
  system_prompt_override: string | null;
  is_active: boolean;
  created_at: string;
}

interface AccessRecord {
  id: string;
  employee_id: string;
  persona_id: string | null;
  access_description: string;
  no_access_description: string;
  allowed_tables: string[];
  denied_tables: string[];
  column_filters: Record<string, any>;
  row_scope: Record<string, string>;
  override_can_proactively_surface_insights: boolean | null;
  override_can_make_recommendations: boolean | null;
  show_widget_on_dashboard: boolean;
  widget_greeting: string | null;
  is_active: boolean;
  granted_at: string;
  employee: {
    id: string;
    employee_number: string;
    full_name: string;
    work_email: string;
    job_title: string;
    business_unit: string;
  };
  persona: {
    id: string;
    name: string;
    tone: string;
    model: string;
    temperature: number;
  } | null;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const TONES = ['professional', 'motivational', 'analytical', 'strategic', 'concise', 'friendly'];
const FORMATS = ['conversational', 'bullet_points', 'structured_report', 'executive_summary'];
const MODELS = ['gpt-4o', 'gpt-4o-mini'];
const ROW_SCOPE_OPTIONS = ['own_only', 'own_and_team', 'vertical_only', 'all'];

const KNOWN_TABLES = [
  { id: 'employees',                     label: 'Employees',          desc: 'Org structure, profiles, BU' },
  { id: 'b2b_sales_current_month',       label: 'B2B MTD Sales',      desc: 'Current month B2B data' },
  { id: 'btb_sales_YTD_minus_current_month', label: 'B2B YTD Sales', desc: 'Year-to-date B2B data' },
  { id: 'b2c',                           label: 'B2C Advisory',       desc: 'B2C advisor performance' },
  { id: 'agent_conversations',           label: 'Conversation History', desc: 'Own chat history only' },
  { id: 'agent_memory',                  label: 'Agent Memory',       desc: 'Own persistent memory' },
];

const TONE_COLORS: Record<string, string> = {
  professional: 'bg-blue-100 text-blue-700',
  motivational: 'bg-orange-100 text-orange-700',
  analytical:   'bg-purple-100 text-purple-700',
  strategic:    'bg-indigo-100 text-indigo-700',
  concise:      'bg-gray-100 text-gray-700',
  friendly:     'bg-green-100 text-green-700',
};

// ─── Empty persona template ───────────────────────────────────────────────────

const emptyPersona = (): Partial<Persona> => ({
  name: '', description: '',
  model: 'gpt-4o', temperature: 0.70, top_p: 0.90,
  max_tokens: 1500, presence_penalty: 0.00, frequency_penalty: 0.00,
  agent_name: 'FundsAgent', tone: 'professional', output_format: 'conversational', language: 'en',
  can_proactively_surface_insights: true,
  can_make_recommendations: true,
  can_do_forecasting: false,
  can_suggest_contest_strategy: false,
  can_discuss_org_structure: false,
  system_prompt_override: '',
  is_active: true,
});

// ─── Main Component ───────────────────────────────────────────────────────────

export default function AgentManagement({ showToast }: { showToast: (type: 'success' | 'error', msg: string) => void }) {
  const [tab, setTab] = useState<'personas' | 'access'>('access');
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [accessList, setAccessList] = useState<AccessRecord[]>([]);
  const [loading, setLoading] = useState(true);

  // Persona editor state
  const [editingPersona, setEditingPersona] = useState<Partial<Persona> | null>(null);
  const [isNewPersona, setIsNewPersona] = useState(false);
  const [savingPersona, setSavingPersona] = useState(false);
  const [expandedPersona, setExpandedPersona] = useState<string | null>(null);

  // Access editor state
  const [editingAccess, setEditingAccess] = useState<Partial<AccessRecord> | null>(null);
  const [isNewAccess, setIsNewAccess] = useState(false);
  const [savingAccess, setSavingAccess] = useState(false);
  const [empSearch, setEmpSearch] = useState('');
  const [empResults, setEmpResults] = useState<any[]>([]);
  const [empSearching, setEmpSearching] = useState(false);
  const [selectedEmp, setSelectedEmp] = useState<any>(null);

  useEffect(() => { fetchAll(); }, []);

  const fetchAll = async () => {
    setLoading(true);
    const [pRes, aRes] = await Promise.all([
      fetch('/api/agent/personas'),
      fetch('/api/agent/access'),
    ]);
    const [pd, ad] = await Promise.all([pRes.json(), aRes.json()]);
    setPersonas(pd.personas || []);
    setAccessList(ad.access || []);
    setLoading(false);
  };

  // ── Employee search ───────────────────────────────────────────────────────

  const searchEmployees = async (q: string) => {
    if (q.length < 2) { setEmpResults([]); return; }
    setEmpSearching(true);
    const res = await fetch(`/api/admin/search-employees?q=${encodeURIComponent(q)}&limit=8`);
    const data = await res.json();
    setEmpResults(data.employees || []);
    setEmpSearching(false);
  };

  // ── Persona CRUD ─────────────────────────────────────────────────────────

  const savePersona = async () => {
    if (!editingPersona?.name?.trim()) {
      showToast('error', 'Persona name is required'); return;
    }
    setSavingPersona(true);
    const method = isNewPersona ? 'POST' : 'PUT';
    const res = await fetch('/api/agent/personas', {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editingPersona),
    });
    const data = await res.json();
    if (!res.ok) { showToast('error', data.error || 'Failed to save persona'); setSavingPersona(false); return; }
    showToast('success', isNewPersona ? 'Persona created!' : 'Persona updated!');
    setEditingPersona(null);
    setIsNewPersona(false);
    setSavingPersona(false);
    fetchAll();
  };

  const deletePersona = async (id: string) => {
    if (!confirm('Delete this persona? Any employee assigned to it will lose their persona assignment.')) return;
    const res = await fetch(`/api/agent/personas?id=${id}`, { method: 'DELETE' });
    if (res.ok) { showToast('success', 'Persona deleted'); fetchAll(); }
    else showToast('error', 'Failed to delete persona');
  };

  // ── Access CRUD ───────────────────────────────────────────────────────────

  const saveAccess = async () => {
    const empId = selectedEmp?.id || editingAccess?.employee_id;
    if (!empId) { showToast('error', 'Select an employee first'); return; }
    setSavingAccess(true);
    const method = isNewAccess ? 'POST' : 'PUT';
    const payload = isNewAccess
      ? { ...editingAccess, employee_id: empId }
      : { ...editingAccess };
    const res = await fetch('/api/agent/access', {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) { showToast('error', data.error || 'Failed to save access'); setSavingAccess(false); return; }
    showToast('success', isNewAccess ? 'Agent access granted!' : 'Access updated!');
    setEditingAccess(null);
    setIsNewAccess(false);
    setSelectedEmp(null);
    setEmpSearch('');
    setEmpResults([]);
    setSavingAccess(false);
    fetchAll();
  };

  const deleteAccess = async (id: string, name: string) => {
    if (!confirm(`Revoke FundsAgent access for ${name}?`)) return;
    const res = await fetch(`/api/agent/access?id=${id}`, { method: 'DELETE' });
    if (res.ok) { showToast('success', 'Access revoked'); fetchAll(); }
    else showToast('error', 'Failed to revoke access');
  };

  const toggleAccessActive = async (record: AccessRecord) => {
    const res = await fetch('/api/agent/access', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: record.id, is_active: !record.is_active }),
    });
    if (res.ok) { showToast('success', record.is_active ? 'Access deactivated' : 'Access activated'); fetchAll(); }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <RefreshCw className="w-8 h-8 text-indigo-500 animate-spin mr-3" />
        <span className="text-gray-600">Loading FundsAgent configuration...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-gradient-to-br from-violet-500 to-indigo-600 rounded-xl flex items-center justify-center shadow-md">
            <Bot className="w-6 h-6 text-white" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-900">FundsAgent</h2>
            <p className="text-sm text-gray-500">AI Agent access control & persona management</p>
          </div>
        </div>
        <div className="flex items-center space-x-2 bg-gray-100 rounded-lg p-1">
          <button
            onClick={() => setTab('access')}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-all ${tab === 'access' ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}
          >
            <User className="w-4 h-4 inline mr-1.5" />
            Access ({accessList.length})
          </button>
          <button
            onClick={() => setTab('personas')}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-all ${tab === 'personas' ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}
          >
            <Brain className="w-4 h-4 inline mr-1.5" />
            Personas ({personas.length})
          </button>
        </div>
      </div>

      {/* ── ACCESS TAB ─────────────────────────────────────────────────────── */}
      {tab === 'access' && (
        <div className="space-y-4">
          {/* Add New Access button */}
          {!editingAccess && (
            <button
              onClick={() => {
                setEditingAccess({
                  persona_id: personas[0]?.id || null,
                  access_description: '',
                  no_access_description: '',
                  allowed_tables: ['employees', 'b2b_sales_current_month', 'btb_sales_YTD_minus_current_month', 'b2c'],
                  denied_tables: [],
                  column_filters: {},
                  row_scope: { b2b_sales_current_month: 'own_and_team', btb_sales_YTD_minus_current_month: 'own_and_team', employees: 'own_and_team' },
                  show_widget_on_dashboard: true,
                  widget_greeting: '',
                  is_active: true,
                });
                setIsNewAccess(true);
                setSelectedEmp(null);
                setEmpSearch('');
              }}
              className="flex items-center space-x-2 px-4 py-2.5 bg-gradient-to-r from-violet-600 to-indigo-600 text-white rounded-lg text-sm font-medium hover:from-violet-700 hover:to-indigo-700 transition-all shadow-md"
            >
              <Plus className="w-4 h-4" />
              <span>Grant Agent Access</span>
            </button>
          )}

          {/* Access editor form */}
          {editingAccess && (
            <AccessEditor
              record={editingAccess}
              onChange={setEditingAccess}
              personas={personas}
              isNew={isNewAccess}
              empSearch={empSearch}
              setEmpSearch={(q) => { setEmpSearch(q); searchEmployees(q); }}
              empResults={empResults}
              empSearching={empSearching}
              selectedEmp={selectedEmp}
              onSelectEmp={(emp) => { setSelectedEmp(emp); setEmpResults([]); setEmpSearch(''); }}
              onSave={saveAccess}
              onCancel={() => { setEditingAccess(null); setIsNewAccess(false); setSelectedEmp(null); setEmpSearch(''); setEmpResults([]); }}
              saving={savingAccess}
            />
          )}

          {/* Access list */}
          <div className="space-y-3">
            {accessList.length === 0 && !editingAccess && (
              <div className="text-center py-12 bg-gray-50 rounded-xl border-2 border-dashed border-gray-200">
                <Bot className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500 font-medium">No employees have FundsAgent access yet</p>
                <p className="text-sm text-gray-400 mt-1">Click "Grant Agent Access" to assign the AI agent to an employee</p>
              </div>
            )}
            {accessList.map((record) => (
              <AccessCard
                key={record.id}
                record={record}
                onEdit={() => {
                  setEditingAccess({ ...record });
                  setIsNewAccess(false);
                  setSelectedEmp(record.employee);
                  setEmpSearch('');
                }}
                onDelete={() => deleteAccess(record.id, record.employee?.full_name)}
                onToggle={() => toggleAccessActive(record)}
              />
            ))}
          </div>
        </div>
      )}

      {/* ── PERSONAS TAB ───────────────────────────────────────────────────── */}
      {tab === 'personas' && (
        <div className="space-y-4">
          {/* New Persona button */}
          {!editingPersona && (
            <button
              onClick={() => { setEditingPersona(emptyPersona()); setIsNewPersona(true); }}
              className="flex items-center space-x-2 px-4 py-2.5 bg-gradient-to-r from-violet-600 to-indigo-600 text-white rounded-lg text-sm font-medium hover:from-violet-700 hover:to-indigo-700 transition-all shadow-md"
            >
              <Plus className="w-4 h-4" />
              <span>Create Persona</span>
            </button>
          )}

          {/* Persona editor */}
          {editingPersona && (
            <PersonaEditor
              persona={editingPersona}
              onChange={setEditingPersona}
              isNew={isNewPersona}
              onSave={savePersona}
              onCancel={() => { setEditingPersona(null); setIsNewPersona(false); }}
              saving={savingPersona}
            />
          )}

          {/* Persona cards */}
          <div className="grid grid-cols-1 gap-4">
            {personas.map((p) => (
              <PersonaCard
                key={p.id}
                persona={p}
                expanded={expandedPersona === p.id}
                onToggleExpand={() => setExpandedPersona(expandedPersona === p.id ? null : p.id)}
                onEdit={() => { setEditingPersona({ ...p }); setIsNewPersona(false); }}
                onDelete={() => deletePersona(p.id)}
                assigneeCount={accessList.filter(a => a.persona_id === p.id).length}
              />
            ))}
            {personas.length === 0 && !editingPersona && (
              <div className="text-center py-12 bg-gray-50 rounded-xl border-2 border-dashed border-gray-200">
                <Brain className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500 font-medium">No personas yet</p>
                <p className="text-sm text-gray-400 mt-1">Create a persona to define agent behaviour and capabilities</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── PersonaCard ──────────────────────────────────────────────────────────────

function PersonaCard({ persona, expanded, onToggleExpand, onEdit, onDelete, assigneeCount }: {
  persona: Persona; expanded: boolean;
  onToggleExpand: () => void; onEdit: () => void; onDelete: () => void;
  assigneeCount: number;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-center justify-between p-4 cursor-pointer" onClick={onToggleExpand}>
        <div className="flex items-center space-x-3 flex-1 min-w-0">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-500 flex items-center justify-center shrink-0">
            <Brain className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center space-x-2 flex-wrap gap-1">
              <h3 className="font-semibold text-gray-900">{persona.name}</h3>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${TONE_COLORS[persona.tone] || 'bg-gray-100 text-gray-600'}`}>
                {persona.tone}
              </span>
              <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                {persona.model}
              </span>
              {assigneeCount > 0 && (
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700">
                  {assigneeCount} assigned
                </span>
              )}
            </div>
            {persona.description && (
              <p className="text-xs text-gray-500 truncate mt-0.5">{persona.description}</p>
            )}
          </div>
        </div>
        <div className="flex items-center space-x-2 ml-3">
          <button onClick={(e) => { e.stopPropagation(); onEdit(); }}
            className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors">
            <Edit3 className="w-4 h-4" />
          </button>
          <button onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
            <Trash2 className="w-4 h-4" />
          </button>
          {expanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
        </div>
      </div>

      {expanded && (
        <div className="border-t border-gray-100 px-4 pb-4 pt-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
            {[
              { label: 'Temperature', value: persona.temperature },
              { label: 'Top-P', value: persona.top_p },
              { label: 'Max Tokens', value: persona.max_tokens },
              { label: 'Output Format', value: persona.output_format.replace('_', ' ') },
            ].map(({ label, value }) => (
              <div key={label} className="bg-gray-50 rounded-lg p-2.5">
                <p className="text-[10px] text-gray-500 uppercase tracking-wide">{label}</p>
                <p className="text-sm font-semibold text-gray-800 mt-0.5">{value}</p>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {[
              { flag: persona.can_proactively_surface_insights, label: 'Proactive Insights' },
              { flag: persona.can_make_recommendations, label: 'Recommendations' },
              { flag: persona.can_do_forecasting, label: 'Forecasting' },
              { flag: persona.can_suggest_contest_strategy, label: 'Contest Strategy' },
              { flag: persona.can_discuss_org_structure, label: 'Org Structure' },
            ].map(({ flag, label }) => (
              <span key={label} className={`text-[11px] px-2.5 py-1 rounded-full font-medium flex items-center space-x-1 ${flag ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'}`}>
                {flag ? <CheckCircle className="w-3 h-3" /> : <X className="w-3 h-3" />}
                <span>{label}</span>
              </span>
            ))}
          </div>
          {persona.system_prompt_override && (
            <div className="mt-3 bg-amber-50 border border-amber-200 rounded-lg p-2.5">
              <p className="text-[10px] font-bold text-amber-700 mb-1">CUSTOM SYSTEM PROMPT</p>
              <p className="text-xs text-amber-800 line-clamp-3">{persona.system_prompt_override}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── PersonaEditor ────────────────────────────────────────────────────────────

function PersonaEditor({ persona, onChange, isNew, onSave, onCancel, saving }: {
  persona: Partial<Persona>;
  onChange: (p: Partial<Persona>) => void;
  isNew: boolean; onSave: () => void; onCancel: () => void; saving: boolean;
}) {
  const set = (key: keyof Persona, value: any) => onChange({ ...persona, [key]: value });

  return (
    <div className="bg-white rounded-xl border-2 border-indigo-200 shadow-lg p-5 space-y-5">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-gray-900 flex items-center space-x-2">
          <Brain className="w-5 h-5 text-indigo-600" />
          <span>{isNew ? 'Create New Persona' : `Edit: ${persona.name}`}</span>
        </h3>
        <button onClick={onCancel} className="text-gray-400 hover:text-gray-600">
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Basic info */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">Persona Name *</label>
          <input value={persona.name || ''} onChange={e => set('name', e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            placeholder="e.g. RM Motivator" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">Agent Display Name</label>
          <input value={persona.agent_name || 'FundsAgent'} onChange={e => set('agent_name', e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            placeholder="FundsAgent" />
        </div>
      </div>

      <div>
        <label className="block text-xs font-semibold text-gray-600 mb-1">Description</label>
        <textarea value={persona.description || ''} onChange={e => set('description', e.target.value)}
          rows={2}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
          placeholder="What is this persona for?" />
      </div>

      {/* LLM settings */}
      <div>
        <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3 flex items-center space-x-1">
          <Sliders className="w-3.5 h-3.5" /><span>LLM Settings</span>
        </p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Model</label>
            <select value={persona.model || 'gpt-4o'} onChange={e => set('model', e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500">
              {MODELS.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">
              Temperature <span className="font-normal text-indigo-600">{persona.temperature}</span>
            </label>
            <input type="range" min="0" max="1" step="0.05"
              value={persona.temperature ?? 0.70}
              onChange={e => set('temperature', parseFloat(e.target.value))}
              className="w-full accent-indigo-600" />
            <div className="flex justify-between text-[10px] text-gray-400 mt-0.5">
              <span>Precise</span><span>Creative</span>
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">
              Top-P <span className="font-normal text-indigo-600">{persona.top_p}</span>
            </label>
            <input type="range" min="0" max="1" step="0.05"
              value={persona.top_p ?? 0.90}
              onChange={e => set('top_p', parseFloat(e.target.value))}
              className="w-full accent-indigo-600" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Max Tokens</label>
            <input type="number" min="200" max="8000" step="100"
              value={persona.max_tokens ?? 1500}
              onChange={e => set('max_tokens', parseInt(e.target.value))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">
              Presence Penalty <span className="font-normal text-indigo-600">{persona.presence_penalty}</span>
            </label>
            <input type="range" min="-2" max="2" step="0.1"
              value={persona.presence_penalty ?? 0}
              onChange={e => set('presence_penalty', parseFloat(e.target.value))}
              className="w-full accent-indigo-600" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">
              Frequency Penalty <span className="font-normal text-indigo-600">{persona.frequency_penalty}</span>
            </label>
            <input type="range" min="-2" max="2" step="0.1"
              value={persona.frequency_penalty ?? 0}
              onChange={e => set('frequency_penalty', parseFloat(e.target.value))}
              className="w-full accent-indigo-600" />
          </div>
        </div>
      </div>

      {/* Style settings */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">Tone</label>
          <select value={persona.tone || 'professional'} onChange={e => set('tone', e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500">
            {TONES.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">Output Format</label>
          <select value={persona.output_format || 'conversational'} onChange={e => set('output_format', e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500">
            {FORMATS.map(f => <option key={f} value={f}>{f.replace(/_/g, ' ')}</option>)}
          </select>
        </div>
      </div>

      {/* Capability flags */}
      <div>
        <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3 flex items-center space-x-1">
          <Zap className="w-3.5 h-3.5" /><span>Capabilities</span>
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {([
            { key: 'can_proactively_surface_insights', label: 'Proactive Insights', desc: 'Agent surfaces insights before being asked' },
            { key: 'can_make_recommendations', label: 'Recommendations', desc: 'Agent suggests actions and next steps' },
            { key: 'can_do_forecasting', label: 'Forecasting', desc: 'Agent predicts trends and future performance' },
            { key: 'can_suggest_contest_strategy', label: 'Contest Strategy', desc: 'Agent advises on contest and incentive programs' },
            { key: 'can_discuss_org_structure', label: 'Org Structure', desc: 'Agent can discuss team hierarchy and structure' },
          ] as { key: keyof Persona; label: string; desc: string }[]).map(({ key, label, desc }) => (
            <label key={key} className="flex items-start space-x-3 p-2.5 rounded-lg hover:bg-gray-50 cursor-pointer border border-transparent hover:border-gray-200 transition-all">
              <div className="relative flex-shrink-0 mt-0.5">
                <input type="checkbox"
                  checked={!!persona[key]}
                  onChange={e => set(key, e.target.checked)}
                  className="sr-only" />
                <div onClick={() => set(key, !persona[key])}
                  className={`w-9 h-5 rounded-full transition-colors cursor-pointer ${persona[key] ? 'bg-indigo-600' : 'bg-gray-300'}`}>
                  <div className={`w-4 h-4 bg-white rounded-full shadow-sm transform transition-transform mt-0.5 ${persona[key] ? 'translate-x-4' : 'translate-x-0.5'}`} />
                </div>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-800">{label}</p>
                <p className="text-xs text-gray-500">{desc}</p>
              </div>
            </label>
          ))}
        </div>
      </div>

      {/* System prompt override */}
      <div>
        <label className="block text-xs font-semibold text-gray-600 mb-1">
          Custom System Prompt Override
          <span className="ml-1 font-normal text-gray-400">(optional — leave blank to use auto-generated)</span>
        </label>
        <textarea value={persona.system_prompt_override || ''} onChange={e => set('system_prompt_override', e.target.value)}
          rows={4}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
          placeholder="You are FundsAgent, a... (replaces the auto-generated base prompt entirely)" />
      </div>

      {/* Actions */}
      <div className="flex items-center space-x-3 pt-2 border-t border-gray-100">
        <button onClick={onSave} disabled={saving}
          className="flex items-center space-x-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-semibold transition-colors disabled:opacity-60">
          {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          <span>{saving ? 'Saving...' : isNew ? 'Create Persona' : 'Save Changes'}</span>
        </button>
        <button onClick={onCancel} className="px-4 py-2.5 text-gray-600 hover:text-gray-900 text-sm font-medium border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
          Cancel
        </button>
      </div>
    </div>
  );
}

// ─── AccessCard ───────────────────────────────────────────────────────────────

function AccessCard({ record, onEdit, onDelete, onToggle }: {
  record: AccessRecord;
  onEdit: () => void; onDelete: () => void; onToggle: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const emp = record.employee;

  return (
    <div className={`bg-white rounded-xl border shadow-sm transition-all ${record.is_active ? 'border-gray-200' : 'border-gray-100 opacity-60'}`}>
      <div className="flex items-center justify-between p-4">
        <div className="flex items-center space-x-3 flex-1 min-w-0">
          <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 font-bold text-sm ${record.is_active ? 'bg-violet-100 text-violet-700' : 'bg-gray-100 text-gray-400'}`}>
            {emp?.full_name?.[0] || '?'}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center space-x-2 flex-wrap gap-1">
              <p className="font-semibold text-gray-900 text-sm">{emp?.full_name || 'Unknown'}</p>
              <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{emp?.business_unit}</span>
              {record.persona && (
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-violet-100 text-violet-700">
                  {record.persona.name}
                </span>
              )}
              {!record.is_active && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-600">INACTIVE</span>
              )}
            </div>
            <p className="text-xs text-gray-500 truncate">{emp?.job_title} • {emp?.work_email}</p>
          </div>
        </div>
        <div className="flex items-center space-x-1 ml-2">
          <button onClick={onToggle} title={record.is_active ? 'Deactivate' : 'Activate'}
            className={`p-1.5 rounded-lg transition-colors ${record.is_active ? 'text-green-500 hover:bg-green-50' : 'text-gray-400 hover:bg-gray-100'}`}>
            {record.is_active ? <ToggleRight className="w-5 h-5" /> : <ToggleLeft className="w-5 h-5" />}
          </button>
          <button onClick={onEdit} className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors">
            <Edit3 className="w-4 h-4" />
          </button>
          <button onClick={onDelete} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
            <Trash2 className="w-4 h-4" />
          </button>
          <button onClick={() => setExpanded(!expanded)} className="p-1.5 text-gray-400 hover:bg-gray-100 rounded-lg">
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-gray-100 px-4 pb-4 pt-3 space-y-3">
          {record.access_description && (
            <div className="flex items-start space-x-2">
              <Unlock className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
              <div>
                <p className="text-[10px] font-bold text-green-700 uppercase">CAN ACCESS</p>
                <p className="text-xs text-gray-700 mt-0.5">{record.access_description}</p>
              </div>
            </div>
          )}
          {record.no_access_description && (
            <div className="flex items-start space-x-2">
              <Lock className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
              <div>
                <p className="text-[10px] font-bold text-red-700 uppercase">CANNOT ACCESS</p>
                <p className="text-xs text-gray-700 mt-0.5">{record.no_access_description}</p>
              </div>
            </div>
          )}
          {record.allowed_tables?.length > 0 && (
            <div>
              <p className="text-[10px] font-bold text-gray-500 uppercase mb-1">Allowed Tables</p>
              <div className="flex flex-wrap gap-1.5">
                {record.allowed_tables.map(t => (
                  <span key={t} className="text-[11px] px-2 py-0.5 bg-green-100 text-green-700 rounded-full font-medium">{t}</span>
                ))}
              </div>
            </div>
          )}
          {Object.keys(record.row_scope || {}).length > 0 && (
            <div>
              <p className="text-[10px] font-bold text-gray-500 uppercase mb-1">Row Scope</p>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(record.row_scope).map(([table, scope]) => (
                  <span key={table} className="text-[11px] px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full font-medium">
                    {table}: <strong>{scope}</strong>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── AccessEditor ─────────────────────────────────────────────────────────────

function AccessEditor({ record, onChange, personas, isNew, empSearch, setEmpSearch, empResults, empSearching,
  selectedEmp, onSelectEmp, onSave, onCancel, saving }: {
  record: Partial<AccessRecord>;
  onChange: (r: Partial<AccessRecord>) => void;
  personas: Persona[];
  isNew: boolean;
  empSearch: string; setEmpSearch: (q: string) => void;
  empResults: any[]; empSearching: boolean;
  selectedEmp: any; onSelectEmp: (e: any) => void;
  onSave: () => void; onCancel: () => void; saving: boolean;
}) {
  const set = (key: keyof AccessRecord, value: any) => onChange({ ...record, [key]: value });

  const toggleTable = (table: string, list: 'allowed_tables' | 'denied_tables') => {
    const current = (record[list] as string[]) || [];
    const updated = current.includes(table) ? current.filter(t => t !== table) : [...current, table];
    set(list, updated);
  };

  const setRowScope = (table: string, scope: string) => {
    const current = { ...(record.row_scope as Record<string, string> || {}) };
    if (scope === '') delete current[table]; else current[table] = scope;
    set('row_scope', current);
  };

  return (
    <div className="bg-white rounded-xl border-2 border-violet-200 shadow-lg p-5 space-y-5">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-gray-900 flex items-center space-x-2">
          <User className="w-5 h-5 text-violet-600" />
          <span>{isNew ? 'Grant Agent Access' : `Edit Access: ${selectedEmp?.full_name}`}</span>
        </h3>
        <button onClick={onCancel}><X className="w-5 h-5 text-gray-400 hover:text-gray-600" /></button>
      </div>

      {/* Employee selector */}
      <div>
        <label className="block text-xs font-semibold text-gray-600 mb-1">Employee *</label>
        {selectedEmp && !isNew ? (
          <div className="flex items-center space-x-2 p-2.5 bg-violet-50 rounded-lg border border-violet-200">
            <div className="w-7 h-7 rounded-full bg-violet-200 flex items-center justify-center text-violet-700 font-bold text-xs">{selectedEmp.full_name?.[0]}</div>
            <div>
              <p className="text-sm font-semibold text-gray-900">{selectedEmp.full_name}</p>
              <p className="text-xs text-gray-500">{selectedEmp.job_title} • {selectedEmp.business_unit}</p>
            </div>
          </div>
        ) : (
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input value={empSearch} onChange={e => setEmpSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-violet-500 focus:border-transparent"
              placeholder="Search employee by name or ID..." />
            {selectedEmp && (
              <div className="mt-1.5 p-2.5 bg-violet-50 rounded-lg border border-violet-200 flex items-center space-x-2">
                <CheckCircle className="w-4 h-4 text-violet-600" />
                <span className="text-sm font-medium text-gray-900">{selectedEmp.full_name}</span>
                <span className="text-xs text-gray-500">({selectedEmp.business_unit})</span>
              </div>
            )}
            {empResults.length > 0 && !selectedEmp && (
              <div className="absolute z-10 w-full bg-white border border-gray-200 rounded-lg shadow-lg mt-1 max-h-48 overflow-y-auto">
                {empResults.map((emp: any) => (
                  <button key={emp.id} onClick={() => onSelectEmp(emp)}
                    className="w-full text-left px-3 py-2 hover:bg-violet-50 transition-colors border-b border-gray-50 last:border-0">
                    <p className="text-sm font-medium text-gray-900">{emp.full_name}</p>
                    <p className="text-xs text-gray-500">{emp.employee_number} • {emp.job_title} • {emp.business_unit}</p>
                  </button>
                ))}
              </div>
            )}
            {empSearching && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                <RefreshCw className="w-4 h-4 text-gray-400 animate-spin" />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Persona selector */}
      <div>
        <label className="block text-xs font-semibold text-gray-600 mb-1">Assign Persona</label>
        <select value={record.persona_id || ''} onChange={e => set('persona_id', e.target.value || null)}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-violet-500">
          <option value="">— No persona assigned —</option>
          {personas.filter(p => p.is_active).map(p => (
            <option key={p.id} value={p.id}>{p.name} ({p.tone})</option>
          ))}
        </select>
      </div>

      {/* Access narrative */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-semibold text-green-700 mb-1 flex items-center space-x-1">
            <Unlock className="w-3.5 h-3.5" /><span>What this employee CAN access</span>
          </label>
          <textarea value={record.access_description || ''} onChange={e => set('access_description', e.target.value)}
            rows={3} className="w-full border border-green-200 bg-green-50 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-400 resize-none"
            placeholder="e.g. Own MTD/YTD performance, own team's data, B2B leaderboard rankings, org chart of direct reportees..." />
        </div>
        <div>
          <label className="block text-xs font-semibold text-red-700 mb-1 flex items-center space-x-1">
            <Lock className="w-3.5 h-3.5" /><span>What this employee CANNOT access</span>
          </label>
          <textarea value={record.no_access_description || ''} onChange={e => set('no_access_description', e.target.value)}
            rows={3} className="w-full border border-red-200 bg-red-50 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-red-400 resize-none"
            placeholder="e.g. Other employees' personal contact details, salary data, B2C data, admin configuration..." />
        </div>
      </div>

      {/* Table access */}
      <div>
        <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3 flex items-center space-x-1">
          <Database className="w-3.5 h-3.5" /><span>Table Access</span>
        </p>
        <div className="space-y-2">
          {KNOWN_TABLES.map(table => {
            const allowed = (record.allowed_tables || []).includes(table.id);
            const denied = (record.denied_tables || []).includes(table.id);
            const scopeValue = (record.row_scope as Record<string, string> || {})[table.id] || '';
            return (
              <div key={table.id} className={`p-3 rounded-lg border transition-all ${allowed ? 'border-green-200 bg-green-50' : 'border-gray-200 bg-gray-50'}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <input type="checkbox" checked={allowed}
                      onChange={() => { toggleTable(table.id, 'allowed_tables'); if (denied) toggleTable(table.id, 'denied_tables'); }}
                      className="w-4 h-4 text-green-600 rounded" />
                    <div>
                      <p className="text-sm font-semibold text-gray-800">{table.label}</p>
                      <p className="text-xs text-gray-500">{table.desc}</p>
                    </div>
                  </div>
                  {allowed && (
                    <select value={scopeValue} onChange={e => setRowScope(table.id, e.target.value)}
                      className="text-xs border border-green-300 bg-white rounded-lg px-2 py-1 text-green-800 focus:ring-1 focus:ring-green-400">
                      <option value="">All rows</option>
                      {ROW_SCOPE_OPTIONS.map(s => (
                        <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
                      ))}
                    </select>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Widget settings */}
      <div>
        <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Dashboard Widget</p>
        <div className="flex items-center space-x-3 mb-3">
          <label className="flex items-center space-x-2 cursor-pointer">
            <input type="checkbox" checked={record.show_widget_on_dashboard ?? true}
              onChange={e => set('show_widget_on_dashboard', e.target.checked)}
              className="w-4 h-4 text-violet-600 rounded" />
            <span className="text-sm font-medium text-gray-700">Show FundsAgent widget on dashboard</span>
          </label>
        </div>
        <input value={record.widget_greeting || ''} onChange={e => set('widget_greeting', e.target.value)}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-violet-500"
          placeholder='Custom greeting, e.g. "Ready to crush today, {name}? 🚀"' />
      </div>

      {/* Actions */}
      <div className="flex items-center space-x-3 pt-2 border-t border-gray-100">
        <button onClick={onSave} disabled={saving}
          className="flex items-center space-x-2 px-5 py-2.5 bg-violet-600 hover:bg-violet-700 text-white rounded-lg text-sm font-semibold transition-colors disabled:opacity-60">
          {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          <span>{saving ? 'Saving...' : isNew ? 'Grant Access' : 'Save Changes'}</span>
        </button>
        <button onClick={onCancel} className="px-4 py-2.5 text-gray-600 text-sm font-medium border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
          Cancel
        </button>
      </div>
    </div>
  );
}
