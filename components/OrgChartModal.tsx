'use client';

import { useEffect, useState } from 'react';
import { X, ChevronDown, ChevronUp, Phone, Mail, Building2, TrendingUp, Users } from 'lucide-react';

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
}

export default function OrgChartModal({ isOpen, onClose, currentEmployeeNumber }: OrgChartModalProps) {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [visibleEmployees, setVisibleEmployees] = useState<Set<string>>(new Set());
  const [currentEmployee, setCurrentEmployee] = useState<Employee | null>(null);

  useEffect(() => {
    if (isOpen) {
      fetchOrgData();
    }
  }, [isOpen, currentEmployeeNumber]);

  const fetchOrgData = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/org-hierarchy?employeeId=${currentEmployeeNumber}`);
      const data = await response.json();

      if (data.success) {
        // Filter to only downstream employees (current user + all subordinates)
        const allEmployees = data.employees;

        // If currentEmployee exists in data, use it; otherwise find by employee number
        const current = data.currentEmployee || allEmployees.find((e: Employee) => e.employeeNumber === currentEmployeeNumber);

        if (current) {
          const downstreamEmployees = getDownstreamEmployees(allEmployees, current.employeeNumber);
          setEmployees(downstreamEmployees);
          setCurrentEmployee(current);
          setVisibleEmployees(new Set([current.employeeNumber]));
        } else {
          console.error('Current employee not found:', currentEmployeeNumber);
          console.error('Total employees in system:', allEmployees?.length);
          console.error('Looking for employee number:', currentEmployeeNumber);

          // Try to find similar employee numbers for debugging
          if (currentEmployeeNumber) {
            const similar = allEmployees?.filter((e: Employee) =>
              e.employeeNumber?.toLowerCase().includes(currentEmployeeNumber.toLowerCase()) ||
              currentEmployeeNumber.toLowerCase().includes(e.employeeNumber?.toLowerCase())
            );
            console.error('Similar employee numbers found:', similar);
          }

          setEmployees([]);
          setCurrentEmployee(null);
        }
      }
    } catch (error) {
      console.error('Failed to fetch org data:', error);
    } finally {
      setLoading(false);
    }
  };

  // Get all downstream employees (current + all subordinates recursively)
  const getDownstreamEmployees = (allEmployees: Employee[], rootEmpNo: string): Employee[] => {
    const downstream: Employee[] = [];
    const visited = new Set<string>();

    const collectDownstream = (empNo: string) => {
      if (visited.has(empNo)) return;
      visited.add(empNo);

      const employee = allEmployees.find((e: Employee) => e.employeeNumber === empNo);
      if (employee) {
        downstream.push(employee);

        // Get all direct reports
        const reports = allEmployees.filter((e: Employee) => e.reportingManagerEmpNo === empNo);
        reports.forEach((report: Employee) => collectDownstream(report.employeeNumber));
      }
    };

    collectDownstream(rootEmpNo);
    return downstream;
  };

  const toggleManager = (employeeNumber: string) => {
    // Managers cannot be shown (only downstream allowed)
    // Remove this functionality for access control
    return;
  };

  const toggleDirectReports = (employeeNumber: string) => {
    const directReports = getDirectReports(employeeNumber);
    if (directReports.length === 0) return;

    const newVisible = new Set(visibleEmployees);
    const allVisible = directReports.every(r => newVisible.has(r.employeeNumber));

    if (allVisible) {
      // Hide all direct reports
      directReports.forEach((r: Employee) => newVisible.delete(r.employeeNumber));
    } else {
      // Show all direct reports
      directReports.forEach((r: Employee) => newVisible.add(r.employeeNumber));
    }
    setVisibleEmployees(newVisible);
  };

  const getDirectReports = (managerEmpNo: string) => {
    return employees.filter((emp: Employee) => emp.reportingManagerEmpNo === managerEmpNo);
  };

  const hasManager = (employeeNumber: string) => {
    // Don't show manager arrow (downstream only access)
    return false;
  };

  const hasReports = (employeeNumber: string) => {
    return getDirectReports(employeeNumber).length > 0;
  };

  const isManagerVisible = (employeeNumber: string) => {
    const employee = employees.find((e: Employee) => e.employeeNumber === employeeNumber);
    return employee?.reportingManagerEmpNo ? visibleEmployees.has(employee.reportingManagerEmpNo) : false;
  };

  const areReportsVisible = (employeeNumber: string) => {
    const directReports = getDirectReports(employeeNumber);
    return directReports.length > 0 && directReports.every(r => visibleEmployees.has(r.employeeNumber));
  };

  const renderEmployeeCard = (employee: Employee, isCurrentUser: boolean = false) => {
    const directReports = getDirectReports(employee.employeeNumber);
    const managerVisible = isManagerVisible(employee.employeeNumber);
    const reportsVisible = areReportsVisible(employee.employeeNumber);

    // Get color based on business unit
    const getCardColor = () => {
      if (isCurrentUser) {
        return 'bg-gradient-to-r from-indigo-50 to-purple-50 border-indigo-400 ring-2 ring-indigo-200';
      }

      switch (employee.businessUnit) {
        case 'B2B':
          return 'bg-green-50 border-green-200 hover:border-green-400';
        case 'B2C':
          return 'bg-orange-50 border-orange-200 hover:border-orange-400';
        case 'Private Wealth':
        case 'PW':
          return 'bg-blue-50 border-blue-200 hover:border-blue-400';
        default:
          return 'bg-gray-50 border-gray-200 hover:border-gray-400';
      }
    };

    return (
      <div className="flex flex-col items-center">
        {/* Up Arrow */}
        {hasManager(employee.employeeNumber) && (
          <button
            onClick={() => toggleManager(employee.employeeNumber)}
            className="mb-2 w-8 h-8 flex items-center justify-center rounded-full bg-indigo-100 hover:bg-indigo-200 transition-colors shadow-sm"
            title={managerVisible ? "Hide manager" : "Show manager"}
          >
            <ChevronUp className={`w-4 h-4 ${managerVisible ? 'text-indigo-700' : 'text-indigo-500'}`} />
          </button>
        )}

        {/* Employee Card */}
        <div
          className={`relative rounded-lg shadow-lg transition-all duration-200 border-2 w-64 ${getCardColor()}`}
        >
          <div className="p-3">
            {/* Header */}
            <div className="flex items-start justify-between mb-2">
              <h3 className="text-sm font-bold text-gray-900 flex-1 truncate leading-tight">{employee.name}</h3>
              {isCurrentUser && (
                <span className="ml-1 px-2 py-0.5 bg-indigo-600 text-white text-[10px] font-semibold rounded-full">
                  YOU
                </span>
              )}
            </div>

            {/* Details */}
            <div className="space-y-1.5 text-xs">
              <div className="flex items-start">
                <Building2 className="w-3 h-3 mr-1.5 text-gray-400 flex-shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-gray-900 truncate">{employee.designation}</div>
                  <div className="text-[10px] text-gray-500 truncate">{employee.businessUnit}</div>
                </div>
              </div>

              <div className="flex items-center">
                <TrendingUp className="w-3 h-3 mr-1.5 text-green-500 flex-shrink-0" />
                <span className="font-semibold text-gray-900">₹{employee.teamYTD} Cr</span>
                <span className="ml-1 text-gray-500">Team YTD</span>
              </div>

              <a
                href={`tel:${employee.mobile}`}
                className="flex items-center text-blue-600 hover:text-blue-800 transition-colors truncate"
                onClick={(e) => e.stopPropagation()}
              >
                <Phone className="w-3 h-3 mr-1.5 flex-shrink-0" />
                <span className="truncate">{employee.mobile || 'N/A'}</span>
              </a>

              <a
                href={`mailto:${employee.email}`}
                className="flex items-center text-blue-600 hover:text-blue-800 transition-colors truncate"
                onClick={(e) => e.stopPropagation()}
              >
                <Mail className="w-3 h-3 mr-1.5 flex-shrink-0" />
                <span className="truncate">{employee.email}</span>
              </a>

              {/* Team Size */}
              {directReports.length > 0 && (
                <div className="flex items-center text-[10px] text-gray-600 pt-1.5 border-t border-gray-200">
                  <Users className="w-3 h-3 mr-1 text-gray-400" />
                  <span className="font-medium">{directReports.length} Report{directReports.length !== 1 ? 's' : ''}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Down Arrow */}
        {hasReports(employee.employeeNumber) && (
          <button
            onClick={() => toggleDirectReports(employee.employeeNumber)}
            className="mt-2 w-8 h-8 flex items-center justify-center rounded-full bg-indigo-100 hover:bg-indigo-200 transition-colors shadow-sm"
            title={reportsVisible ? "Hide team" : "Show team"}
          >
            <ChevronDown className={`w-4 h-4 ${reportsVisible ? 'text-indigo-700' : 'text-indigo-500'}`} />
          </button>
        )}
      </div>
    );
  };

  const renderHierarchy = () => {
    if (!currentEmployee) return null;

    // Build visible hierarchy tree
    const layers: { employees: Employee[]; level: number }[] = [];
    const processed = new Set<string>();

    // Find all visible employees and their relationships
    const visibleEmpList = employees.filter((e: Employee) => visibleEmployees.has(e.employeeNumber));

    // Find the topmost visible employee
    let topEmployee = visibleEmpList.find((e: Employee) =>
      !e.reportingManagerEmpNo || !visibleEmployees.has(e.reportingManagerEmpNo)
    );

    if (!topEmployee) {
      topEmployee = currentEmployee;
    }

    // Build layers recursively
    const buildLayers = (employee: Employee, level: number) => {
      if (processed.has(employee.employeeNumber)) return;

      if (!layers[level]) {
        layers[level] = { employees: [], level };
      }

      layers[level].employees.push(employee);
      processed.add(employee.employeeNumber);

      // Get visible direct reports
      const directReports = getDirectReports(employee.employeeNumber)
        .filter((r: Employee) => visibleEmployees.has(r.employeeNumber));

      directReports.forEach((report: Employee) => buildLayers(report, level + 1));
    };

    buildLayers(topEmployee, 0);

    return (
      <div className="flex flex-col items-center space-y-8">
        {layers.map((layer, idx) => (
          <div key={idx} className="flex flex-col items-center">
            {/* Employees in this layer */}
            <div className="flex items-start justify-center gap-6 flex-wrap max-w-full">
              {layer.employees.map((emp: Employee) => (
                <div key={emp.employeeNumber}>
                  {renderEmployeeCard(emp, emp.employeeNumber === currentEmployeeNumber)}
                </div>
              ))}
            </div>

            {/* Connection line to next layer */}
            {idx < layers.length - 1 && layers[idx + 1].employees.length > 0 && (
              <div className="w-0.5 h-6 bg-gray-300 my-2"></div>
            )}
          </div>
        ))}
      </div>
    );
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black bg-opacity-50 transition-opacity"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div className="relative bg-white rounded-2xl shadow-2xl w-full h-full max-w-[95vw] max-h-[95vh] flex flex-col">
          {/* Header */}
          <div className="bg-gradient-to-r from-indigo-600 to-purple-600 px-6 py-4 rounded-t-2xl flex items-center justify-between flex-shrink-0">
            <div>
              <h2 className="text-2xl font-bold text-white">Organization View</h2>
              <p className="text-indigo-100 text-sm mt-1">
                Click ↑ to show manager • Click ↓ to show team
              </p>
            </div>
            <button
              onClick={onClose}
              className="w-10 h-10 flex items-center justify-center rounded-full bg-white/20 hover:bg-white/30 transition-colors"
            >
              <X className="w-6 h-6 text-white" />
            </button>
          </div>

          {/* Content - Scrollable Hierarchy */}
          <div className="flex-1 overflow-auto p-8">
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
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-sm text-left">
                    <p className="font-semibold text-yellow-800 mb-2">Possible Reasons:</p>
                    <ul className="text-yellow-700 space-y-1 list-disc list-inside">
                      <li>Your employee record may not be synced in the system</li>
                      <li>Your employee number may be incorrect in the users table</li>
                      <li>Please contact IT support for assistance</li>
                    </ul>
                  </div>
                </div>
              </div>
            ) : (
              <div className="min-h-full flex items-center justify-center">
                {renderHierarchy()}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="bg-gray-50 px-6 py-3 rounded-b-2xl border-t border-gray-200 flex-shrink-0">
            <div className="flex items-center justify-between text-sm text-gray-600">
              <div className="flex items-center space-x-4">
                <div className="flex items-center">
                  <ChevronUp className="w-4 h-4 mr-1 text-indigo-600" />
                  <span>Show manager</span>
                </div>
                <div className="flex items-center">
                  <ChevronDown className="w-4 h-4 mr-1 text-indigo-600" />
                  <span>Show team</span>
                </div>
              </div>
              <button
                onClick={onClose}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
