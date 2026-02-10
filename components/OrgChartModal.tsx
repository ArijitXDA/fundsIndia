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
}

interface OrgChartModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentEmployeeNumber: string;
}

export default function OrgChartModal({ isOpen, onClose, currentEmployeeNumber }: OrgChartModalProps) {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
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
        setEmployees(data.employees);
        setCurrentEmployee(data.currentEmployee);

        // Auto-expand path to current employee
        if (data.currentEmployee) {
          const pathToExpand = new Set<string>();
          let emp = data.currentEmployee;

          // Add current employee
          pathToExpand.add(emp.employeeNumber);

          // Add all managers up the chain
          const visited = new Set<string>();
          let maxDepth = 20;
          while (emp.reportingManagerEmpNo && maxDepth > 0) {
            if (visited.has(emp.reportingManagerEmpNo)) break;
            pathToExpand.add(emp.reportingManagerEmpNo);
            visited.add(emp.reportingManagerEmpNo);
            emp = data.employees.find((e: Employee) => e.employeeNumber === emp.reportingManagerEmpNo);
            if (!emp) break;
            maxDepth--;
          }

          setExpandedNodes(pathToExpand);
        }
      }
    } catch (error) {
      console.error('Failed to fetch org data:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleNode = (employeeNumber: string) => {
    const newExpanded = new Set(expandedNodes);
    if (newExpanded.has(employeeNumber)) {
      newExpanded.delete(employeeNumber);
    } else {
      newExpanded.add(employeeNumber);
    }
    setExpandedNodes(newExpanded);
  };

  const getDirectReports = (managerEmpNo: string) => {
    return employees.filter(emp => emp.reportingManagerEmpNo === managerEmpNo);
  };

  const getManagerChain = (employee: Employee): Employee[] => {
    const chain: Employee[] = [];
    const visited = new Set<string>([employee.employeeNumber]);
    let current = employee;
    let maxDepth = 20;

    while (current.reportingManagerEmpNo && maxDepth > 0) {
      if (visited.has(current.reportingManagerEmpNo)) {
        console.warn('Circular reference detected:', current.reportingManagerEmpNo);
        break;
      }

      const manager = employees.find(e => e.employeeNumber === current.reportingManagerEmpNo);
      if (!manager) break;

      visited.add(manager.employeeNumber);
      chain.unshift(manager);
      current = manager;
      maxDepth--;
    }

    return chain;
  };

  const renderEmployeeCard = (employee: Employee, isCurrentUser: boolean = false) => {
    const directReports = getDirectReports(employee.employeeNumber);
    const hasReports = directReports.length > 0;
    const isExpanded = expandedNodes.has(employee.employeeNumber);

    return (
      <div key={employee.employeeNumber} className="flex flex-col items-center">
        {/* Employee Card */}
        <div
          className={`relative rounded-xl shadow-lg transition-all duration-200 border-2 min-w-[320px] max-w-[380px] ${
            isCurrentUser
              ? 'bg-gradient-to-r from-indigo-50 to-purple-50 border-indigo-400 ring-4 ring-indigo-200'
              : 'bg-white border-gray-200 hover:border-indigo-300 hover:shadow-xl'
          }`}
        >
          <div className="p-4">
            {/* Name and Badge */}
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center space-x-2 flex-1 min-w-0">
                <h3 className="text-base font-bold text-gray-900 truncate">{employee.name}</h3>
                {isCurrentUser && (
                  <span className="px-2 py-1 bg-indigo-600 text-white text-xs font-semibold rounded-full flex-shrink-0">
                    YOU
                  </span>
                )}
              </div>
              {hasReports && (
                <button
                  onClick={() => toggleNode(employee.employeeNumber)}
                  className="ml-2 flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-full bg-indigo-100 hover:bg-indigo-200 transition-colors"
                >
                  {isExpanded ? (
                    <ChevronUp className="w-4 h-4 text-indigo-600" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-indigo-600" />
                  )}
                </button>
              )}
            </div>

            {/* Details Grid */}
            <div className="space-y-2 text-xs">
              <div className="flex items-center text-gray-700">
                <Building2 className="w-3 h-3 mr-2 text-gray-400 flex-shrink-0" />
                <div className="truncate">
                  <span className="font-medium">{employee.designation}</span>
                  <span className="text-gray-500"> • {employee.businessUnit}</span>
                </div>
              </div>

              <div className="flex items-center text-gray-700">
                <TrendingUp className="w-3 h-3 mr-2 text-green-500 flex-shrink-0" />
                <span className="font-medium">₹{employee.ytdPerformance} Cr YTD</span>
              </div>

              <div className="flex items-center space-x-3">
                <a
                  href={`tel:${employee.mobile}`}
                  className="flex items-center text-blue-600 hover:text-blue-800 transition-colors truncate flex-1"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Phone className="w-3 h-3 mr-1 flex-shrink-0" />
                  <span className="truncate text-xs">{employee.mobile || 'N/A'}</span>
                </a>
              </div>

              <a
                href={`mailto:${employee.email}`}
                className="flex items-center text-blue-600 hover:text-blue-800 transition-colors truncate"
                onClick={(e) => e.stopPropagation()}
              >
                <Mail className="w-3 h-3 mr-1 flex-shrink-0" />
                <span className="truncate text-xs">{employee.email}</span>
              </a>
            </div>

            {/* Team Size */}
            {hasReports && (
              <div className="mt-3 pt-3 border-t border-gray-200">
                <div className="flex items-center text-xs text-gray-600">
                  <Users className="w-3 h-3 mr-1 text-gray-400" />
                  <span className="font-medium">{directReports.length} Direct Report{directReports.length !== 1 ? 's' : ''}</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Vertical Connector Line and Children */}
        {hasReports && isExpanded && directReports.length > 0 && (
          <div className="flex flex-col items-center mt-6">
            {/* Vertical line from parent */}
            <div className="w-0.5 h-8 bg-gray-300"></div>

            {/* Horizontal line connecting all children */}
            <div className="relative flex items-start">
              {directReports.length > 1 && (
                <div
                  className="absolute top-0 h-0.5 bg-gray-300"
                  style={{
                    left: '50%',
                    right: '50%',
                    width: `${(directReports.length - 1) * 400}px`,
                    transform: 'translateX(-50%)',
                  }}
                ></div>
              )}

              {/* Children Cards */}
              <div className="flex gap-6 items-start">
                {directReports.map((report) => (
                  <div key={report.employeeNumber} className="flex flex-col items-center">
                    {/* Vertical line to child */}
                    <div className="w-0.5 h-8 bg-gray-300"></div>
                    {renderEmployeeCard(report, report.employeeNumber === currentEmployeeNumber)}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderOrgTree = () => {
    if (!currentEmployee) {
      console.warn('No current employee found');
      return null;
    }

    const managerChain = getManagerChain(currentEmployee);
    console.log('Manager chain length:', managerChain.length);

    const topManager = managerChain.length > 0 ? managerChain[0] : currentEmployee;
    console.log('Top manager:', topManager.name, topManager.employeeNumber);

    return renderEmployeeCard(topManager, topManager.employeeNumber === currentEmployeeNumber);
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
          <div className="bg-gradient-to-r from-indigo-600 to-purple-600 px-6 py-5 rounded-t-2xl flex items-center justify-between flex-shrink-0">
            <div>
              <h2 className="text-2xl font-bold text-white">Organization View</h2>
              <p className="text-indigo-100 text-sm mt-1">
                Reporting hierarchy • {employees.length} employees
              </p>
            </div>
            <button
              onClick={onClose}
              className="w-10 h-10 flex items-center justify-center rounded-full bg-white/20 hover:bg-white/30 transition-colors"
            >
              <X className="w-6 h-6 text-white" />
            </button>
          </div>

          {/* Content - Scrollable Tree */}
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
                <div className="text-center">
                  <Users className="w-20 h-20 text-gray-300 mx-auto mb-4" />
                  <p className="text-xl font-semibold text-gray-600 mb-2">No Organization Data</p>
                  <p className="text-gray-500">Unable to load organizational structure</p>
                </div>
              </div>
            ) : (
              <div className="flex justify-center min-w-max">
                {renderOrgTree()}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="bg-gray-50 px-6 py-4 rounded-b-2xl border-t border-gray-200 flex-shrink-0">
            <div className="flex items-center justify-between text-sm text-gray-600">
              <div className="flex items-center space-x-4">
                <div className="flex items-center">
                  <ChevronDown className="w-4 h-4 mr-1 text-indigo-600" />
                  <span>Click arrows to expand/collapse teams</span>
                </div>
                <div className="flex items-center">
                  <Phone className="w-4 h-4 mr-1 text-blue-600" />
                  <span>Click to call</span>
                </div>
              </div>
              <button
                onClick={onClose}
                className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-800 font-medium rounded-lg transition-colors"
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
