'use client';

import { useEffect, useState } from 'react';
import { X, ChevronDown, ChevronUp, Phone, Mail, Building2, TrendingUp, Users, ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';

interface Employee {
  id: number;
  employeeNumber: string;
  name: string;
  email: string;
  mobile: string;
  designation: string;
  businessUnit: string;
  reportingManagerEmpNo: string;
  location: string;
  ytdPerformance: string;
  performanceType: string | null;
  teamYTD: string;
}

interface OrgChartModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentEmployeeNumber: string;
  /** When set, shows ALL employees of this business unit (vertical view) instead of user's downstream */
  verticalFilter?: string | null;
}

export default function OrgChartModal({ isOpen, onClose, currentEmployeeNumber, verticalFilter }: OrgChartModalProps) {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [visibleEmployees, setVisibleEmployees] = useState<Set<string>>(new Set());
  const [currentEmployee, setCurrentEmployee] = useState<Employee | null>(null);
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    if (isOpen) {
      setZoom(1);
      fetchOrgData();
    }
  }, [isOpen, currentEmployeeNumber, verticalFilter]);

  const fetchOrgData = async () => {
    try {
      setLoading(true);

      let url = `/api/org-hierarchy?employeeId=${currentEmployeeNumber}`;
      if (verticalFilter) {
        const buParam = verticalFilter === 'PW' ? 'Private Wealth' : verticalFilter;
        url += `&businessUnit=${encodeURIComponent(buParam)}`;
      }

      const response = await fetch(url);
      const data = await response.json();

      if (data.success) {
        const allEmployees = data.employees;

        if (verticalFilter) {
          const empNumbers = new Set(allEmployees.map((e: Employee) => e.employeeNumber));
          const roots = allEmployees.filter(
            (e: Employee) => !e.reportingManagerEmpNo || !empNumbers.has(e.reportingManagerEmpNo)
          );
          setEmployees(allEmployees);
          const actualCurrent = allEmployees.find((e: Employee) => e.employeeNumber === currentEmployeeNumber);
          setCurrentEmployee(actualCurrent || roots[0] || null);
          setVisibleEmployees(new Set(roots.map((e: Employee) => e.employeeNumber)));
        } else {
          const current = data.currentEmployee || allEmployees.find((e: Employee) => e.employeeNumber === currentEmployeeNumber);
          if (current) {
            const downstreamEmployees = getDownstreamEmployees(allEmployees, current.employeeNumber);
            setEmployees(downstreamEmployees);
            setCurrentEmployee(current);
            setVisibleEmployees(new Set([current.employeeNumber]));
          } else {
            setEmployees([]);
            setCurrentEmployee(null);
          }
        }
      }
    } catch (error) {
      console.error('Failed to fetch org data:', error);
    } finally {
      setLoading(false);
    }
  };

  const getDownstreamEmployees = (allEmployees: Employee[], rootEmpNo: string): Employee[] => {
    const downstream: Employee[] = [];
    const visited = new Set<string>();
    const collectDownstream = (empNo: string) => {
      if (visited.has(empNo)) return;
      visited.add(empNo);
      const employee = allEmployees.find((e: Employee) => e.employeeNumber === empNo);
      if (employee) {
        downstream.push(employee);
        const reports = allEmployees.filter((e: Employee) => e.reportingManagerEmpNo === empNo);
        reports.forEach((report: Employee) => collectDownstream(report.employeeNumber));
      }
    };
    collectDownstream(rootEmpNo);
    return downstream;
  };

  const getDirectReports = (managerEmpNo: string): Employee[] => {
    return employees.filter((emp: Employee) => emp.reportingManagerEmpNo === managerEmpNo);
  };

  const toggleDirectReports = (employeeNumber: string) => {
    const directReports = getDirectReports(employeeNumber);
    if (directReports.length === 0) return;

    const newVisible = new Set(visibleEmployees);
    const allVisible = directReports.every(r => newVisible.has(r.employeeNumber));

    if (allVisible) {
      // Collapse: recursively hide all descendants
      const hideDescendants = (empNo: string) => {
        const reports = getDirectReports(empNo);
        reports.forEach(r => {
          newVisible.delete(r.employeeNumber);
          hideDescendants(r.employeeNumber);
        });
      };
      hideDescendants(employeeNumber);
    } else {
      // Expand: show only direct reports (one level at a time)
      directReports.forEach(r => newVisible.add(r.employeeNumber));
    }
    setVisibleEmployees(newVisible);
  };

  const getCardBorderColor = (emp: Employee, isCurrentUser: boolean): string => {
    if (isCurrentUser) return 'border-indigo-500';
    switch (emp.businessUnit) {
      case 'B2B': return 'border-green-400';
      case 'B2C': return 'border-orange-400';
      case 'Private Wealth':
      case 'PW': return 'border-blue-400';
      default: return 'border-gray-300';
    }
  };

  const getCardBg = (emp: Employee, isCurrentUser: boolean): string => {
    if (isCurrentUser) return 'bg-gradient-to-br from-indigo-50 to-purple-50 ring-2 ring-indigo-300';
    switch (emp.businessUnit) {
      case 'B2B': return 'bg-green-50';
      case 'B2C': return 'bg-orange-50';
      case 'Private Wealth':
      case 'PW': return 'bg-blue-50';
      default: return 'bg-gray-50';
    }
  };

  const getBadgeColor = (bu: string): string => {
    switch (bu) {
      case 'B2B': return 'bg-green-100 text-green-700';
      case 'B2C': return 'bg-orange-100 text-orange-700';
      case 'Private Wealth':
      case 'PW': return 'bg-blue-100 text-blue-700';
      default: return 'bg-gray-100 text-gray-600';
    }
  };

  // ─── Recursive tree node renderer ────────────────────────────────────────────
  //
  // Structure per node:
  //
  //   [card + toggle button]          ← rendered by renderCard()
  //        |                          ← vertical stem down (connector-stem)
  //   ─────┼─────┬─────┬─────        ← horizontal bar (connector-bar)
  //        |     |     |             ← vertical stubs up into each child
  //      [c1]  [c2]  [c3]           ← child nodes (recursive)
  //
  // All lines are pure CSS divs — no SVG, no absolute positioning.

  const renderCard = (emp: Employee) => {
    const isCurrentUser = emp.employeeNumber === currentEmployeeNumber;
    const directReports = getDirectReports(emp.employeeNumber);
    const hasReports = directReports.length > 0;
    const reportsExpanded = hasReports && directReports.every(r => visibleEmployees.has(r.employeeNumber));

    return (
      <div className="flex flex-col items-center">
        {/* Employee Card */}
        <div
          className={`rounded-xl shadow-md border-2 w-56 transition-all duration-200 hover:shadow-lg ${getCardBg(emp, isCurrentUser)} ${getCardBorderColor(emp, isCurrentUser)}`}
        >
          <div className="p-3">
            {/* Name row */}
            <div className="flex items-start justify-between mb-1.5">
              <h3 className="text-sm font-bold text-gray-900 leading-tight flex-1 truncate pr-1">{emp.name}</h3>
              {isCurrentUser && (
                <span className="shrink-0 px-1.5 py-0.5 bg-indigo-600 text-white text-[9px] font-bold rounded-full">YOU</span>
              )}
            </div>

            {/* Designation */}
            <p className="text-[11px] text-gray-600 truncate mb-1.5">{emp.designation}</p>

            {/* BU Badge */}
            <span className={`inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full mb-2 ${getBadgeColor(emp.businessUnit)}`}>
              {emp.businessUnit}
            </span>

            {/* Team YTD */}
            <div className="flex items-center text-[11px] mb-1.5">
              <TrendingUp className="w-3 h-3 mr-1 text-green-500 shrink-0" />
              <span className="font-semibold text-gray-800">₹{emp.teamYTD} Cr</span>
              <span className="ml-1 text-gray-500">Team YTD</span>
            </div>

            {/* Contact */}
            <div className="space-y-0.5 border-t border-gray-200 pt-1.5">
              <a
                href={`tel:${emp.mobile}`}
                onClick={e => e.stopPropagation()}
                className="flex items-center text-[11px] text-blue-600 hover:text-blue-800 truncate"
              >
                <Phone className="w-3 h-3 mr-1 shrink-0" />
                <span className="truncate">{emp.mobile || 'N/A'}</span>
              </a>
              <a
                href={`mailto:${emp.email}`}
                onClick={e => e.stopPropagation()}
                className="flex items-center text-[11px] text-blue-600 hover:text-blue-800 truncate"
              >
                <Mail className="w-3 h-3 mr-1 shrink-0" />
                <span className="truncate">{emp.email}</span>
              </a>
            </div>

            {/* Report count */}
            {hasReports && (
              <div className="flex items-center text-[10px] text-gray-500 mt-1.5 pt-1.5 border-t border-gray-200">
                <Users className="w-3 h-3 mr-1 text-gray-400" />
                <span>{directReports.length} direct report{directReports.length !== 1 ? 's' : ''}</span>
              </div>
            )}
          </div>
        </div>

        {/* Expand / Collapse toggle button */}
        {hasReports && (
          <button
            onClick={() => toggleDirectReports(emp.employeeNumber)}
            className={`mt-2 w-7 h-7 flex items-center justify-center rounded-full shadow-sm transition-all duration-200 border ${
              reportsExpanded
                ? 'bg-indigo-600 border-indigo-600 text-white hover:bg-indigo-700'
                : 'bg-white border-indigo-300 text-indigo-600 hover:bg-indigo-50'
            }`}
            title={reportsExpanded ? `Collapse ${emp.name}'s team` : `Expand ${emp.name}'s team (${directReports.length})`}
          >
            {reportsExpanded
              ? <ChevronUp className="w-3.5 h-3.5" />
              : <ChevronDown className="w-3.5 h-3.5" />
            }
          </button>
        )}
      </div>
    );
  };

  const renderNode = (emp: Employee): React.ReactNode => {
    const directReports = getDirectReports(emp.employeeNumber);
    const visibleReports = directReports.filter(r => visibleEmployees.has(r.employeeNumber));
    const hasVisibleReports = visibleReports.length > 0;

    return (
      <div key={emp.employeeNumber} className="flex flex-col items-center">
        {/* The card itself */}
        {renderCard(emp)}

        {/* Connector + children — only rendered when this node is expanded */}
        {hasVisibleReports && (
          <div className="flex flex-col items-center w-full">

            {/* Vertical stem down from the toggle button to the crossbar */}
            <div className="w-px h-5 bg-gray-300" />

            {visibleReports.length === 1 ? (
              /* ── Single child: just a straight vertical line, no T-bar ── */
              <div className="flex flex-col items-center">
                <div className="w-px h-5 bg-gray-300" />
                {renderNode(visibleReports[0])}
              </div>
            ) : (
              /* ── Multiple children: T-bar connector ── */
              <div className="flex flex-col items-center w-full">
                {/*
                  The T-bar is built as a flex row where each child gets:
                    [half-crossbar] [vertical-stub] [half-crossbar]
                  The crossbar halves of adjacent children visually merge
                  into one continuous horizontal line.
                */}
                <div className="flex items-start">
                  {visibleReports.map((child, idx) => {
                    const isFirst = idx === 0;
                    const isLast  = idx === visibleReports.length - 1;
                    return (
                      <div key={child.employeeNumber} className="flex flex-col items-center">
                        {/* Crossbar row: left-arm | stub | right-arm */}
                        <div className="flex items-center">
                          {/* Left arm — invisible for the first child */}
                          <div
                            className="h-px bg-gray-300"
                            style={{ width: isFirst ? 0 : '28px' }}
                          />
                          {/* Vertical stub down to child card */}
                          <div className="w-px h-5 bg-gray-300" />
                          {/* Right arm — invisible for the last child */}
                          <div
                            className="h-px bg-gray-300"
                            style={{ width: isLast ? 0 : '28px' }}
                          />
                        </div>

                        {/* Recursive child subtree, centred under its stub */}
                        <div className="flex flex-col items-center px-3">
                          {renderNode(child)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  // ─── Root rendering ───────────────────────────────────────────────────────────
  // Find all top-level visible nodes (nodes whose manager is not visible)
  const getRoots = (): Employee[] => {
    return employees.filter(
      emp =>
        visibleEmployees.has(emp.employeeNumber) &&
        (!emp.reportingManagerEmpNo || !visibleEmployees.has(emp.reportingManagerEmpNo))
    );
  };

  const renderTree = (): React.ReactNode => {
    const roots = getRoots();
    if (roots.length === 0) return null;

    if (roots.length === 1) {
      return renderNode(roots[0]);
    }

    // Multiple roots (vertical filter with multiple top-level managers)
    return (
      <div className="flex items-start gap-10 flex-wrap justify-center">
        {roots.map(root => (
          <div key={root.employeeNumber}>
            {renderNode(root)}
          </div>
        ))}
      </div>
    );
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black bg-opacity-50" onClick={onClose} />

      {/* Modal */}
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div className="relative bg-white rounded-2xl shadow-2xl w-full h-full max-w-[95vw] max-h-[95vh] flex flex-col">

          {/* Header */}
          <div className="bg-gradient-to-r from-indigo-600 to-purple-600 px-6 py-4 rounded-t-2xl flex items-center justify-between flex-shrink-0">
            <div>
              <h2 className="text-2xl font-bold text-white">
                {verticalFilter
                  ? `${verticalFilter === 'PW' ? 'Private Wealth' : verticalFilter} Vertical — Org View`
                  : 'Organization View'}
              </h2>
              <p className="text-indigo-100 text-sm mt-0.5">
                Click <ChevronDown className="inline w-3.5 h-3.5" /> to expand a team &nbsp;•&nbsp; Click <ChevronUp className="inline w-3.5 h-3.5" /> to collapse
              </p>
            </div>
            <div className="flex items-center gap-2">
              {/* Zoom controls */}
              <button
                onClick={() => setZoom(z => Math.max(0.4, +(z - 0.1).toFixed(1)))}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-white/20 hover:bg-white/30 text-white transition-colors"
                title="Zoom out"
              >
                <ZoomOut className="w-4 h-4" />
              </button>
              <span className="text-white text-sm font-medium w-10 text-center">{Math.round(zoom * 100)}%</span>
              <button
                onClick={() => setZoom(z => Math.min(2, +(z + 0.1).toFixed(1)))}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-white/20 hover:bg-white/30 text-white transition-colors"
                title="Zoom in"
              >
                <ZoomIn className="w-4 h-4" />
              </button>
              <button
                onClick={() => setZoom(1)}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-white/20 hover:bg-white/30 text-white transition-colors ml-1"
                title="Reset zoom"
              >
                <Maximize2 className="w-4 h-4" />
              </button>
              <button
                onClick={onClose}
                className="w-10 h-10 flex items-center justify-center rounded-full bg-white/20 hover:bg-white/30 transition-colors ml-2"
              >
                <X className="w-6 h-6 text-white" />
              </button>
            </div>
          </div>

          {/* Legend */}
          <div className="bg-gray-50 border-b border-gray-200 px-6 py-2 flex items-center gap-6 flex-shrink-0 flex-wrap">
            <span className="text-xs text-gray-500 font-medium">Business Unit:</span>
            {[
              { label: 'B2B', color: 'bg-green-400' },
              { label: 'B2C', color: 'bg-orange-400' },
              { label: 'Private Wealth', color: 'bg-blue-400' },
              { label: 'Corporate / Other', color: 'bg-gray-300' },
            ].map(({ label, color }) => (
              <div key={label} className="flex items-center gap-1.5">
                <div className={`w-3 h-3 rounded-sm ${color}`} />
                <span className="text-xs text-gray-600">{label}</span>
              </div>
            ))}
          </div>

          {/* Scrollable tree canvas */}
          <div className="flex-1 overflow-auto">
            {loading ? (
              <div className="flex items-center justify-center h-full">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-4 border-indigo-600 mx-auto" />
                  <p className="mt-4 text-gray-600">Loading organization structure...</p>
                </div>
              </div>
            ) : employees.length === 0 ? (
              <div className="flex items-center justify-center h-full">
                <div className="text-center max-w-md">
                  <Users className="w-20 h-20 text-gray-300 mx-auto mb-4" />
                  <p className="text-xl font-semibold text-gray-600 mb-2">No Organization Data</p>
                  <p className="text-gray-500 mb-4">
                    {currentEmployeeNumber
                      ? `Unable to find employee record for: ${currentEmployeeNumber}`
                      : 'Employee number not found in your profile'}
                  </p>
                </div>
              </div>
            ) : (
              // The zoom wrapper — scales the whole tree from its top-centre
              <div className="min-w-full min-h-full flex items-start justify-center p-10">
                <div
                  style={{
                    transform: `scale(${zoom})`,
                    transformOrigin: 'top center',
                    transition: 'transform 0.2s ease',
                  }}
                >
                  {renderTree()}
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="bg-gray-50 px-6 py-3 rounded-b-2xl border-t border-gray-200 flex items-center justify-between flex-shrink-0">
            <p className="text-xs text-gray-500">
              {employees.length} employee{employees.length !== 1 ? 's' : ''} in view
              {currentEmployee ? ` • Root: ${currentEmployee.name}` : ''}
            </p>
            <button
              onClick={onClose}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
