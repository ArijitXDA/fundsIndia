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
  reportingManager: string;
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
          while (emp.reportingManagerEmpNo) {
            pathToExpand.add(emp.reportingManagerEmpNo);
            emp = data.employees.find((e: Employee) => e.employeeNumber === emp.reportingManagerEmpNo);
            if (!emp) break;
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
    let current = employee;

    while (current.reportingManagerEmpNo) {
      const manager = employees.find(e => e.employeeNumber === current.reportingManagerEmpNo);
      if (!manager) break;
      chain.unshift(manager);
      current = manager;
    }

    return chain;
  };

  const renderEmployeeCard = (employee: Employee, level: number = 0, isCurrentUser: boolean = false) => {
    const directReports = getDirectReports(employee.employeeNumber);
    const hasReports = directReports.length > 0;
    const isExpanded = expandedNodes.has(employee.employeeNumber);

    return (
      <div key={employee.employeeNumber} className="mb-3">
        <div
          className={`relative rounded-xl shadow-md transition-all duration-200 border-2 ${
            isCurrentUser
              ? 'bg-gradient-to-r from-indigo-50 to-purple-50 border-indigo-400 ring-4 ring-indigo-200'
              : 'bg-white border-gray-200 hover:border-indigo-300 hover:shadow-lg'
          }`}
          style={{ marginLeft: `${level * 40}px` }}
        >
          {/* Card Content */}
          <div className="p-4">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center space-x-3 mb-2">
                  <h3 className="text-lg font-bold text-gray-900">{employee.name}</h3>
                  {isCurrentUser && (
                    <span className="px-2 py-1 bg-indigo-600 text-white text-xs font-semibold rounded-full">
                      YOU
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="flex items-center text-gray-600">
                    <Building2 className="w-4 h-4 mr-2 text-gray-400" />
                    <div>
                      <span className="font-medium">{employee.designation}</span>
                      <p className="text-xs text-gray-500">{employee.businessUnit}</p>
                    </div>
                  </div>

                  <div className="flex items-center text-gray-600">
                    <TrendingUp className="w-4 h-4 mr-2 text-green-500" />
                    <div>
                      <span className="font-medium">₹{employee.ytdPerformance} Cr</span>
                      <p className="text-xs text-gray-500">YTD Performance</p>
                    </div>
                  </div>

                  <a
                    href={`tel:${employee.mobile}`}
                    className="flex items-center text-blue-600 hover:text-blue-800 transition-colors"
                  >
                    <Phone className="w-4 h-4 mr-2" />
                    <span>{employee.mobile || 'N/A'}</span>
                  </a>

                  <a
                    href={`mailto:${employee.email}`}
                    className="flex items-center text-blue-600 hover:text-blue-800 transition-colors truncate"
                  >
                    <Mail className="w-4 h-4 mr-2 flex-shrink-0" />
                    <span className="truncate">{employee.email}</span>
                  </a>
                </div>
              </div>

              {/* Expand/Collapse Button */}
              {hasReports && (
                <button
                  onClick={() => toggleNode(employee.employeeNumber)}
                  className="ml-4 flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-full bg-indigo-100 hover:bg-indigo-200 transition-colors"
                >
                  {isExpanded ? (
                    <ChevronUp className="w-5 h-5 text-indigo-600" />
                  ) : (
                    <ChevronDown className="w-5 h-5 text-indigo-600" />
                  )}
                </button>
              )}
            </div>

            {/* Team Size Badge */}
            {hasReports && (
              <div className="mt-3 pt-3 border-t border-gray-200">
                <div className="flex items-center text-sm text-gray-600">
                  <Users className="w-4 h-4 mr-2 text-gray-400" />
                  <span className="font-medium">{directReports.length}</span>
                  <span className="ml-1">Direct Report{directReports.length !== 1 ? 's' : ''}</span>
                </div>
              </div>
            )}
          </div>

          {/* Connection Line */}
          {level > 0 && (
            <div className="absolute left-0 top-1/2 w-10 h-0.5 bg-gray-300 -translate-x-full" />
          )}
        </div>

        {/* Direct Reports */}
        {hasReports && isExpanded && (
          <div className="mt-3 relative">
            {directReports.map(report =>
              renderEmployeeCard(
                report,
                level + 1,
                report.employeeNumber === currentEmployeeNumber
              )
            )}
          </div>
        )}
      </div>
    );
  };

  const renderOrgTree = () => {
    if (!currentEmployee) return null;

    // Get manager chain
    const managerChain = getManagerChain(currentEmployee);

    // Find the top-most manager in the chain
    const topManager = managerChain.length > 0 ? managerChain[0] : currentEmployee;

    // Render from top manager down
    return renderEmployeeCard(topManager, 0, topManager.employeeNumber === currentEmployeeNumber);
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
        <div className="relative bg-white rounded-2xl shadow-2xl max-w-6xl w-full max-h-[90vh] flex flex-col">
          {/* Header */}
          <div className="bg-gradient-to-r from-indigo-600 to-purple-600 px-6 py-5 rounded-t-2xl flex items-center justify-between">
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

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6">
            {loading ? (
              <div className="flex items-center justify-center py-20">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-4 border-indigo-600 mx-auto" />
                  <p className="mt-4 text-gray-600">Loading organization structure...</p>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {renderOrgTree()}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="bg-gray-50 px-6 py-4 rounded-b-2xl border-t border-gray-200">
            <div className="flex items-center justify-between text-sm text-gray-600">
              <div className="flex items-center space-x-4">
                <div className="flex items-center">
                  <ChevronUp className="w-4 h-4 mr-1 text-indigo-600" />
                  <span>Click arrows to expand/collapse</span>
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
