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
  const [visibleLayers, setVisibleLayers] = useState<Set<string>>(new Set());
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

        // Initially only show current employee
        setVisibleLayers(new Set([currentEmployeeNumber]));
      }
    } catch (error) {
      console.error('Failed to fetch org data:', error);
    } finally {
      setLoading(false);
    }
  };

  const expandUp = (employeeNumber: string) => {
    const employee = employees.find(e => e.employeeNumber === employeeNumber);
    if (employee?.reportingManagerEmpNo) {
      const newVisible = new Set(visibleLayers);
      newVisible.add(employee.reportingManagerEmpNo);
      setVisibleLayers(newVisible);
    }
  };

  const expandDown = (employeeNumber: string) => {
    const directReports = getDirectReports(employeeNumber);
    const newVisible = new Set(visibleLayers);
    directReports.forEach(report => newVisible.add(report.employeeNumber));
    setVisibleLayers(newVisible);
  };

  const collapseUp = (employeeNumber: string) => {
    const employee = employees.find(e => e.employeeNumber === employeeNumber);
    if (employee?.reportingManagerEmpNo) {
      const newVisible = new Set(visibleLayers);
      newVisible.delete(employee.reportingManagerEmpNo);
      setVisibleLayers(newVisible);
    }
  };

  const collapseDown = (employeeNumber: string) => {
    const directReports = getDirectReports(employeeNumber);
    const newVisible = new Set(visibleLayers);
    directReports.forEach(report => newVisible.delete(report.employeeNumber));
    setVisibleLayers(newVisible);
  };

  const getDirectReports = (managerEmpNo: string) => {
    return employees.filter(emp => emp.reportingManagerEmpNo === managerEmpNo);
  };

  const hasManager = (employeeNumber: string) => {
    const employee = employees.find(e => e.employeeNumber === employeeNumber);
    return employee?.reportingManagerEmpNo ? true : false;
  };

  const hasReports = (employeeNumber: string) => {
    return getDirectReports(employeeNumber).length > 0;
  };

  const isManagerVisible = (employeeNumber: string) => {
    const employee = employees.find(e => e.employeeNumber === employeeNumber);
    return employee?.reportingManagerEmpNo ? visibleLayers.has(employee.reportingManagerEmpNo) : false;
  };

  const areReportsVisible = (employeeNumber: string) => {
    const directReports = getDirectReports(employeeNumber);
    return directReports.length > 0 && directReports.every(r => visibleLayers.has(r.employeeNumber));
  };

  const renderEmployeeCard = (employee: Employee, isCurrentUser: boolean = false) => {
    const directReports = getDirectReports(employee.employeeNumber);
    const managerVisible = isManagerVisible(employee.employeeNumber);
    const reportsVisible = areReportsVisible(employee.employeeNumber);
    const canExpandUp = hasManager(employee.employeeNumber) && !managerVisible;
    const canCollapseUp = hasManager(employee.employeeNumber) && managerVisible;
    const canExpandDown = hasReports(employee.employeeNumber) && !reportsVisible;
    const canCollapseDown = hasReports(employee.employeeNumber) && reportsVisible;

    return (
      <div className="flex flex-col items-center mb-4">
        {/* Up Arrow */}
        {(canExpandUp || canCollapseUp) && (
          <button
            onClick={() => canExpandUp ? expandUp(employee.employeeNumber) : collapseUp(employee.employeeNumber)}
            className="mb-2 w-10 h-10 flex items-center justify-center rounded-full bg-indigo-100 hover:bg-indigo-200 transition-colors shadow-md"
            title={canExpandUp ? "Show manager" : "Hide manager"}
          >
            <ChevronUp className="w-5 h-5 text-indigo-600" />
          </button>
        )}

        {/* Employee Card */}
        <div
          className={`relative rounded-xl shadow-lg transition-all duration-200 border-2 w-full max-w-md ${
            isCurrentUser
              ? 'bg-gradient-to-r from-indigo-50 to-purple-50 border-indigo-400 ring-4 ring-indigo-200'
              : 'bg-white border-gray-200 hover:border-indigo-300 hover:shadow-xl'
          }`}
        >
          <div className="p-5">
            {/* Header */}
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-bold text-gray-900 flex-1 truncate">{employee.name}</h3>
              {isCurrentUser && (
                <span className="ml-2 px-3 py-1 bg-indigo-600 text-white text-xs font-semibold rounded-full">
                  YOU
                </span>
              )}
            </div>

            {/* Details */}
            <div className="space-y-3 text-sm">
              <div className="flex items-start">
                <Building2 className="w-4 h-4 mr-2 text-gray-400 flex-shrink-0 mt-0.5" />
                <div>
                  <div className="font-medium text-gray-900">{employee.designation}</div>
                  <div className="text-xs text-gray-500">{employee.businessUnit} • {employee.location}</div>
                </div>
              </div>

              <div className="flex items-center">
                <TrendingUp className="w-4 h-4 mr-2 text-green-500 flex-shrink-0" />
                <span className="font-semibold text-gray-900">₹{employee.ytdPerformance} Cr</span>
                <span className="ml-1 text-gray-500">YTD</span>
              </div>

              <div className="flex items-center space-x-4 pt-2 border-t border-gray-200">
                <a
                  href={`tel:${employee.mobile}`}
                  className="flex items-center text-blue-600 hover:text-blue-800 transition-colors flex-1 truncate"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Phone className="w-4 h-4 mr-1 flex-shrink-0" />
                  <span className="truncate text-sm">{employee.mobile || 'N/A'}</span>
                </a>
              </div>

              <a
                href={`mailto:${employee.email}`}
                className="flex items-center text-blue-600 hover:text-blue-800 transition-colors truncate"
                onClick={(e) => e.stopPropagation()}
              >
                <Mail className="w-4 h-4 mr-1 flex-shrink-0" />
                <span className="truncate text-sm">{employee.email}</span>
              </a>

              {/* Team Size */}
              {directReports.length > 0 && (
                <div className="flex items-center text-sm text-gray-600 pt-2 border-t border-gray-200">
                  <Users className="w-4 h-4 mr-1 text-gray-400" />
                  <span className="font-medium">{directReports.length} Direct Report{directReports.length !== 1 ? 's' : ''}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Down Arrow */}
        {(canExpandDown || canCollapseDown) && (
          <button
            onClick={() => canExpandDown ? expandDown(employee.employeeNumber) : collapseDown(employee.employeeNumber)}
            className="mt-2 w-10 h-10 flex items-center justify-center rounded-full bg-indigo-100 hover:bg-indigo-200 transition-colors shadow-md"
            title={canExpandDown ? "Show team" : "Hide team"}
          >
            <ChevronDown className="w-5 h-5 text-indigo-600" />
          </button>
        )}
      </div>
    );
  };

  const renderVisibleEmployees = () => {
    if (!currentEmployee) return null;

    // Get all visible employees and organize them by layer
    const visibleEmployees = employees.filter(e => visibleLayers.has(e.employeeNumber));

    // Build hierarchy layers
    const layers: Employee[][] = [];
    const processed = new Set<string>();

    // Find the top-most visible employee
    let topEmployee = visibleEmployees.find(e =>
      !e.reportingManagerEmpNo || !visibleLayers.has(e.reportingManagerEmpNo)
    );

    if (!topEmployee) {
      topEmployee = currentEmployee;
    }

    // Build layers from top down
    const buildLayers = (employee: Employee, layerIndex: number) => {
      if (processed.has(employee.employeeNumber)) return;

      if (!layers[layerIndex]) layers[layerIndex] = [];
      layers[layerIndex].push(employee);
      processed.add(employee.employeeNumber);

      // Add visible children to next layer
      const children = getDirectReports(employee.employeeNumber)
        .filter(child => visibleLayers.has(child.employeeNumber));

      children.forEach(child => buildLayers(child, layerIndex + 1));
    };

    buildLayers(topEmployee, 0);

    return (
      <div className="space-y-6">
        {layers.map((layer, layerIndex) => (
          <div key={layerIndex} className="space-y-4">
            {layer.map(employee => (
              <div key={employee.employeeNumber}>
                {renderEmployeeCard(employee, employee.employeeNumber === currentEmployeeNumber)}
              </div>
            ))}
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
        <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
          {/* Header */}
          <div className="bg-gradient-to-r from-indigo-600 to-purple-600 px-6 py-4 rounded-t-2xl flex items-center justify-between flex-shrink-0">
            <div>
              <h2 className="text-2xl font-bold text-white">Organization View</h2>
              <p className="text-indigo-100 text-sm mt-1">
                Use ↑ ↓ arrows to navigate hierarchy
              </p>
            </div>
            <button
              onClick={onClose}
              className="w-10 h-10 flex items-center justify-center rounded-full bg-white/20 hover:bg-white/30 transition-colors"
            >
              <X className="w-6 h-6 text-white" />
            </button>
          </div>

          {/* Content - Single Column, Centered */}
          <div className="flex-1 overflow-y-auto p-6">
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
              <div className="max-w-md mx-auto">
                {renderVisibleEmployees()}
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
