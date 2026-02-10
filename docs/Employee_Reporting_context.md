# Employee Reporting & Hierarchy Context - RNR Dashboard

**Last Updated:** February 9, 2026
**Version:** 1.0.0

---

## Table of Contents
1. [Reporting Hierarchy Structure](#reporting-hierarchy-structure)
2. [B2B Hierarchy (Net Sales File)](#b2b-hierarchy-net-sales-file)
3. [B2C/PW Hierarchy (Employee Master)](#b2cpw-hierarchy-employee-master)
4. [Role Hierarchy Mapping](#role-hierarchy-mapping)
5. [Tree Traversal Algorithms](#tree-traversal-algorithms)
6. [Historical Reporting Manager Tracking](#historical-reporting-manager-tracking)
7. [Team Aggregation Logic](#team-aggregation-logic)
8. [Access Control Based on Hierarchy](#access-control-based-on-hierarchy)
9. [Data Visibility Rules](#data-visibility-rules)
10. [Placeholder Employee Strategy](#placeholder-employee-strategy)

---

## Reporting Hierarchy Structure

### Overview

FundsIndia uses **vertical-specific hierarchy structures**:
- **B2B:** Hierarchy from Net Sales file (dynamic, sales-driven)
- **B2C & PW:** Hierarchy from Employee Master file (formal organizational structure)

### Why Two Different Sources?

**B2B Rationale:**
- Sales data is the source of truth for B2B relationships
- RM-Partner-Branch-Zone mappings change dynamically
- Net Sales file always has latest RM assignments
- BM/RGM/ZM columns reflect operational reality

**B2C/PW Rationale:**
- Formal organizational structure
- Stable reporting lines
- Employee Master maintained by HR
- Less frequent changes

---

## B2B Hierarchy (Net Sales File)

### Data Source
**File:** Final Net Sales [Month][Year].xlsx
**Columns:** RM, BM, Branch, Zone, RGM, ZM

### Hierarchy Levels

```
ZM (Zonal Manager)
  ↓
RGM (Regional Manager)
  ↓
BM (Branch Manager)
  ↓
RM (Relationship Manager)
```

### Column Mapping

| Sales File Column | Hierarchy Level | Description |
|-------------------|-----------------|-------------|
| RM                | Level 4 (Bottom)| Relationship Manager name |
| BM                | Level 3         | Branch Manager name (can be "-") |
| RGM               | Level 2         | Regional Manager name |
| ZM                | Level 1 (Top)   | Zonal Manager name |
| Branch            | Metadata        | Branch location |
| Zone              | Metadata        | Zone (North, South, East, West) |

### Special Cases

**1. Missing BM (value = "-"):**
```
If BM = "-":
    RM reports directly to RGM
    Hierarchy: RM → RGM → ZM
```

**2. Multiple RMs under same BM:**
```
BM has multiple RMs
  RM 1 → BM
  RM 2 → BM
  RM 3 → BM
```

**3. Same RM name under different BMs:**
```
Allowed (different people with same name)
Disambiguate by employee_email
```

### Extraction Logic

```typescript
interface B2BHierarchy {
  rm_name: string;
  rm_email: string;
  bm_name: string | null;
  rgm_name: string;
  zm_name: string;
  branch: string;
  zone: string;
}

function extractB2BHierarchy(salesRecord: SalesDataRow): B2BHierarchy {
  return {
    rm_name: salesRecord.RM,
    rm_email: salesRecord.employee_email || inferEmail(salesRecord.RM),
    bm_name: salesRecord.BM === '-' ? null : salesRecord.BM,
    rgm_name: salesRecord.RGM,
    zm_name: salesRecord.ZM,
    branch: salesRecord.Branch,
    zone: salesRecord.Zone
  };
}

function buildB2BHierarchyTree(salesData: SalesDataRow[]): HierarchyNode {
  // Group by ZM → RGM → BM → RM
  const tree = {};

  salesData.forEach(record => {
    const { zm_name, rgm_name, bm_name, rm_name } = extractB2BHierarchy(record);

    if (!tree[zm_name]) tree[zm_name] = {};
    if (!tree[zm_name][rgm_name]) tree[zm_name][rgm_name] = {};

    if (bm_name) {
      if (!tree[zm_name][rgm_name][bm_name]) tree[zm_name][rgm_name][bm_name] = [];
      tree[zm_name][rgm_name][bm_name].push(rm_name);
    } else {
      // RM reports directly to RGM
      if (!tree[zm_name][rgm_name]['_direct_rms']) tree[zm_name][rgm_name]['_direct_rms'] = [];
      tree[zm_name][rgm_name]['_direct_rms'].push(rm_name);
    }
  });

  return tree;
}
```

### Storage

```sql
-- Store in sales_data table
INSERT INTO sales_data (
    employee_email,
    rm_name,
    bm_name,
    rgm_name,
    zm_name,
    branch,
    zone,
    ...
) VALUES (...);

-- Update employee's reporting manager (if needed)
UPDATE employees
SET reporting_manager_emp_number = (
    SELECT employee_number FROM employees
    WHERE full_name = bm_name OR full_name = rgm_name
    LIMIT 1
)
WHERE work_email = rm_email
AND business_unit = 'B2B';
```

---

## B2C/PW Hierarchy (Employee Master)

### Data Source
**File:** Employee Master as on [DATE].xlsx
**Column:** Reporting Manager Employee Number

### Hierarchy Structure

```
CEO
  ↓
Zonal/Regional Managers
  ↓
Team Leads / Senior Advisors
  ↓
Advisors / RMs
```

### Column Mapping

| Employee Master Column          | Usage |
|---------------------------------|-------|
| Employee Number                 | Unique ID |
| Full Name                       | Display name |
| Work Email                      | Login + matching |
| Reporting To                    | Manager's name (display only) |
| Reporting Manager Employee Number | **KEY:** Manager's emp number |

### Extraction Logic

```typescript
interface EmployeeRecord {
  employee_number: string;
  full_name: string;
  work_email: string;
  reporting_to: string; // Display name
  reporting_manager_emp_number: string; // FK reference
  business_unit: string;
  job_title: string;
}

function buildEmployeeMasterHierarchy(employees: EmployeeRecord[]): Map<string, Employee[]> {
  const hierarchyMap = new Map<string, Employee[]>();

  employees.forEach(emp => {
    if (emp.reporting_manager_emp_number) {
      if (!hierarchyMap.has(emp.reporting_manager_emp_number)) {
        hierarchyMap.set(emp.reporting_manager_emp_number, []);
      }
      hierarchyMap.get(emp.reporting_manager_emp_number).push(emp);
    }
  });

  return hierarchyMap;
}

function getDirectReportees(managerEmpNumber: string, hierarchyMap: Map): Employee[] {
  return hierarchyMap.get(managerEmpNumber) || [];
}
```

### Storage

```sql
-- employees table
INSERT INTO employees (
    employee_number,
    full_name,
    work_email,
    reporting_manager_emp_number,
    business_unit,
    ...
) VALUES (
    'W1234',
    'John Doe',
    'john.doe@fundsindia.com',
    'W1000', -- Reports to W1000
    'B2C',
    ...
);
```

---

## Role Hierarchy Mapping

### Organizational Hierarchy

```
Level 0: Group CEO (Akshay Sapru)
           ↓
Level 1: Business CEOs (B2B CEO, B2C CEO, PW CEO)
           ↓
Level 2: Zonal Managers (ZM)
           ↓
Level 3: Regional Managers (RGM)
           ↓
Level 4: Branch Managers (BM)
           ↓
Level 5: Relationship Managers (RM)
           ↓
Level 6: IFAs (Independent Financial Advisors)
```

### Role Detection

```typescript
enum Role {
  ADMIN = 'admin',
  GROUP_CEO = 'group_ceo',
  CEO = 'ceo',
  ZONAL_MANAGER = 'manager',
  REGIONAL_MANAGER = 'manager',
  BRANCH_MANAGER = 'manager',
  RM = 'rm',
  IFA = 'ifa'
}

function detectRole(employee: Employee): Role {
  // Admin
  if (employee.employee_number === 'W2661') {
    return Role.ADMIN;
  }

  // Group CEO
  if (employee.full_name.toLowerCase().includes('akshay sapru')) {
    return Role.GROUP_CEO;
  }

  // Business CEOs
  if (
    ['B2B', 'B2C', 'PW'].includes(employee.business_unit) &&
    employee.job_title.toLowerCase().includes('ceo')
  ) {
    return Role.CEO;
  }

  // Managers (have reportees)
  const hasReportees = await checkIfHasReportees(employee.employee_number);
  if (hasReportees) {
    return Role.ZONAL_MANAGER; // Generic 'manager'
  }

  // IFA
  if (employee.job_title.toLowerCase().includes('ifa')) {
    return Role.IFA;
  }

  // Default: RM
  return Role.RM;
}
```

### Permission Matrix

| Role         | Can View                          | Can Upload | Can Configure |
|--------------|-----------------------------------|------------|---------------|
| Admin        | All employees, all verticals      | ✅ All     | ✅ All        |
| Group CEO    | All employees, all verticals      | ✅ All     | ✅ All        |
| CEO          | Own vertical only                 | ✅ Own     | ✅ Own        |
| ZM/RGM/BM    | Self + all downstream reportees   | ❌         | ❌            |
| RM/IFA       | Self only                         | ❌         | ❌            |

---

## Tree Traversal Algorithms

### Recursive CTE (PostgreSQL)

**Get All Downstream Reportees:**

```sql
-- Function: get_employee_hierarchy(emp_id UUID)
WITH RECURSIVE hierarchy AS (
    -- Base case: starting employee
    SELECT
        id AS employee_id,
        employee_number,
        full_name,
        job_title,
        business_unit,
        0 AS level,
        NULL::UUID AS parent_id
    FROM employees
    WHERE id = $1 -- emp_id parameter

    UNION ALL

    -- Recursive case: find direct reports
    SELECT
        e.id,
        e.employee_number,
        e.full_name,
        e.job_title,
        e.business_unit,
        h.level + 1,
        h.employee_id AS parent_id
    FROM employees e
    INNER JOIN hierarchy h
        ON e.reporting_manager_emp_number = (
            SELECT employee_number FROM employees WHERE id = h.employee_id
        )
    WHERE e.employment_status = 'Working'
)
SELECT * FROM hierarchy
ORDER BY level, full_name;
```

**Get Manager Chain (Upwards):**

```sql
WITH RECURSIVE manager_chain AS (
    -- Base case: starting employee
    SELECT
        id,
        employee_number,
        full_name,
        reporting_manager_emp_number,
        0 AS level
    FROM employees
    WHERE id = $1

    UNION ALL

    -- Recursive case: find manager
    SELECT
        e.id,
        e.employee_number,
        e.full_name,
        e.reporting_manager_emp_number,
        mc.level + 1
    FROM employees e
    INNER JOIN manager_chain mc
        ON e.employee_number = mc.reporting_manager_emp_number
    WHERE mc.level < 10 -- Prevent infinite loops
)
SELECT * FROM manager_chain
ORDER BY level;
```

### TypeScript Recursive Function

```typescript
interface HierarchyNode {
  employee: Employee;
  children: HierarchyNode[];
  level: number;
}

async function buildHierarchyTree(
  employeeId: string,
  level: number = 0
): Promise<HierarchyNode> {
  // Fetch employee
  const employee = await db.employees.findUnique({
    where: { id: employeeId }
  });

  // Fetch direct reportees
  const reportees = await db.employees.findMany({
    where: {
      reporting_manager_emp_number: employee.employee_number,
      employment_status: 'Working'
    }
  });

  // Recursively build child nodes
  const children = await Promise.all(
    reportees.map(reportee => buildHierarchyTree(reportee.id, level + 1))
  );

  return {
    employee,
    children,
    level
  };
}
```

### Iterative BFS (Breadth-First Search)

```typescript
function getHierarchyBFS(rootEmployeeId: string): Employee[] {
  const queue: string[] = [rootEmployeeId];
  const visited: Set<string> = new Set();
  const result: Employee[] = [];

  while (queue.length > 0) {
    const currentId = queue.shift()!;

    if (visited.has(currentId)) continue;
    visited.add(currentId);

    const employee = await db.employees.findUnique({
      where: { id: currentId }
    });

    result.push(employee);

    // Add direct reportees to queue
    const reportees = await db.employees.findMany({
      where: {
        reporting_manager_emp_number: employee.employee_number
      }
    });

    queue.push(...reportees.map(r => r.id));
  }

  return result;
}
```

---

## Historical Reporting Manager Tracking

### Purpose
Track manager changes over time to maintain historical context.

### Table: reporting_history

```sql
CREATE TABLE reporting_history (
    id UUID PRIMARY KEY,
    employee_id UUID REFERENCES employees(id),
    reporting_manager_emp_number TEXT,
    effective_from DATE,
    effective_to DATE, -- NULL = current
    created_at TIMESTAMP
);
```

### Update Logic

```typescript
async function updateReportingManager(
  employeeId: string,
  newManagerEmpNumber: string,
  effectiveDate: Date
) {
  // Step 1: Close current reporting relationship
  await db.reporting_history.updateMany({
    where: {
      employee_id: employeeId,
      effective_to: null // Current relationship
    },
    data: {
      effective_to: effectiveDate
    }
  });

  // Step 2: Create new reporting relationship
  await db.reporting_history.create({
    data: {
      employee_id: employeeId,
      reporting_manager_emp_number: newManagerEmpNumber,
      effective_from: effectiveDate,
      effective_to: null
    }
  });

  // Step 3: Update employees table
  await db.employees.update({
    where: { id: employeeId },
    data: {
      reporting_manager_emp_number: newManagerEmpNumber
    }
  });
}
```

### Query Historical Manager

```sql
-- Get manager on a specific date
SELECT
    e.full_name AS employee_name,
    m.full_name AS manager_name,
    rh.effective_from,
    rh.effective_to
FROM reporting_history rh
JOIN employees e ON rh.employee_id = e.id
JOIN employees m ON rh.reporting_manager_emp_number = m.employee_number
WHERE rh.employee_id = $1
AND $2 BETWEEN rh.effective_from AND COALESCE(rh.effective_to, '9999-12-31');
```

---

## Team Aggregation Logic

### Definition
**Team = Manager + All Downstream Reportees (Recursive)**

### Aggregation Formula

```
Team Total = Manager's Performance + Σ(All Reportees' Performance)
```

### Implementation

```typescript
async function getTeamPerformance(
  managerId: string,
  periodType: 'MTD' | 'QTD' | 'YTD' | 'Contest'
): Promise<TeamPerformance> {
  // Get all team members (including manager)
  const teamMembers = await getEmployeeHierarchy(managerId);

  // Get manager's performance
  const managerPerformance = await db.sales_data.aggregate({
    where: {
      employee_id: managerId,
      data_period: periodType
    },
    _sum: {
      total_net_sales_cob_100: true
    }
  });

  // Get team's performance (excluding manager)
  const teamMemberIds = teamMembers
    .map(tm => tm.employee_id)
    .filter(id => id !== managerId);

  const teamPerformance = await db.sales_data.aggregate({
    where: {
      employee_id: { in: teamMemberIds },
      data_period: periodType
    },
    _sum: {
      total_net_sales_cob_100: true
    }
  });

  return {
    manager_contribution: managerPerformance._sum.total_net_sales_cob_100 || 0,
    team_contribution: teamPerformance._sum.total_net_sales_cob_100 || 0,
    total: (managerPerformance._sum.total_net_sales_cob_100 || 0) +
           (teamPerformance._sum.total_net_sales_cob_100 || 0),
    num_team_members: teamMemberIds.length
  };
}
```

### Display Component

```tsx
<TeamPerformanceCard>
  <Toggle>
    <Option value="self">My Performance</Option>
    <Option value="team">Team Performance</Option>
  </Toggle>

  {view === 'team' && (
    <div>
      <MetricRow>
        <Label>Your Contribution</Label>
        <Value color="blue">{formatCurrency(managerContribution)}</Value>
        <Percentage>{(managerContribution / total * 100).toFixed(1)}%</Percentage>
      </MetricRow>

      <MetricRow>
        <Label>Team Contribution</Label>
        <Value color="green">{formatCurrency(teamContribution)}</Value>
        <Percentage>{(teamContribution / total * 100).toFixed(1)}%</Percentage>
      </MetricRow>

      <Divider />

      <MetricRow>
        <Label>Total</Label>
        <Value color="primary">{formatCurrency(total)}</Value>
      </MetricRow>

      <MetricRow>
        <Label>Team Size</Label>
        <Value>{numTeamMembers} members</Value>
      </MetricRow>
    </div>
  )}
</TeamPerformanceCard>
```

---

## Access Control Based on Hierarchy

### Rule: **View Self + All Downstream**

Each user can access:
1. Their own data
2. All downstream reportees' data (recursively)

### RLS Policy

```sql
-- Policy: Users can see their hierarchy
CREATE POLICY user_hierarchy_access ON employees
FOR SELECT
USING (
    -- Can see self
    id = (SELECT employee_id FROM users WHERE id = auth.uid())
    OR
    -- Can see downstream reportees
    employee_number IN (
        WITH RECURSIVE hierarchy AS (
            SELECT e.employee_number
            FROM employees e
            JOIN users u ON e.id = u.employee_id
            WHERE u.id = auth.uid()

            UNION

            SELECT e.employee_number
            FROM employees e
            JOIN hierarchy h ON e.reporting_manager_emp_number = h.employee_number
        )
        SELECT employee_number FROM hierarchy
    )
    OR
    -- Admins and Group CEO see all
    EXISTS (
        SELECT 1 FROM users
        WHERE id = auth.uid()
        AND role IN ('admin', 'group_ceo')
    )
    OR
    -- CEOs see their vertical
    business_unit = (
        SELECT e.business_unit
        FROM users u
        JOIN employees e ON u.employee_id = e.id
        WHERE u.id = auth.uid()
        AND u.role = 'ceo'
    )
);
```

### API Middleware

```typescript
async function checkHierarchyAccess(
  requestingUserId: string,
  targetEmployeeId: string
): Promise<boolean> {
  const user = await db.users.findUnique({
    where: { id: requestingUserId },
    include: { employee: true }
  });

  // Admin and Group CEO: full access
  if (user.role === 'admin' || user.role === 'group_ceo') {
    return true;
  }

  // CEO: access to their vertical
  if (user.role === 'ceo') {
    const targetEmployee = await db.employees.findUnique({
      where: { id: targetEmployeeId }
    });
    return targetEmployee.business_unit === user.employee.business_unit;
  }

  // Others: check if target is in hierarchy
  const hierarchy = await getEmployeeHierarchy(user.employee_id);
  const accessibleIds = hierarchy.map(h => h.employee_id);

  return accessibleIds.includes(targetEmployeeId);
}
```

---

## Data Visibility Rules

### Activity Logs

**Rule:** Activity logs visible to upper hierarchy

```sql
-- RLS Policy for activity_logs
CREATE POLICY activity_logs_hierarchy_access ON activity_logs
FOR SELECT
USING (
    -- Can see own logs
    employee_id = (SELECT employee_id FROM users WHERE id = auth.uid())
    OR
    -- Can see downstream reportees' logs
    employee_id IN (
        SELECT employee_id FROM get_employee_hierarchy(
            (SELECT employee_id FROM users WHERE id = auth.uid())
        )
    )
    OR
    -- Admins see all
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
);
```

### Dashboard Views

| User Type | Can View |
|-----------|----------|
| RM/IFA    | Own dashboard only |
| BM        | Own dashboard + all RMs under them |
| RGM       | Own dashboard + all BMs + RMs under them |
| ZM        | Own dashboard + entire zone |
| CEO       | Entire vertical |
| Group CEO | All verticals |
| Admin     | All data + logs |

---

## Placeholder Employee Strategy

### When to Create Placeholder

1. **Sales data upload:** Employee email not in `employees` table
2. **Advisory data upload:** Advisor email not in `employees` table

### Creation Logic

```typescript
async function createPlaceholderEmployee(salesRecord: SalesDataRow) {
  const email = salesRecord.employee_email;

  // Check if employee exists
  const exists = await db.employees.findUnique({
    where: { work_email: email }
  });

  if (exists) return exists;

  // Create placeholder
  const placeholder = await db.employees.create({
    data: {
      employee_number: `PH-${generateHash(email)}`, // PH = Placeholder
      full_name: salesRecord.employee_name || extractNameFromEmail(email),
      work_email: email,
      business_unit: salesRecord.business_unit || 'B2B',
      job_title: 'Relationship Manager', // Default
      employment_status: 'Working',
      is_placeholder: true, // FLAG
      date_joined: new Date()
    }
  });

  // Log placeholder creation
  await logActivity({
    action_type: 'placeholder_employee_created',
    action_details: {
      email,
      source: 'sales_data_upload'
    }
  });

  return placeholder;
}
```

### Placeholder Management

**Admin View:**
```tsx
<AdminPanel>
  <Section title="Placeholder Employees">
    <Table>
      {placeholderEmployees.map(emp => (
        <Row>
          <Cell>{emp.employee_number}</Cell>
          <Cell>{emp.work_email}</Cell>
          <Cell>{emp.full_name}</Cell>
          <Cell>
            <Button onClick={() => linkToRealEmployee(emp.id)}>
              Link to Real Employee
            </Button>
            <Button onClick={() => convertToReal(emp.id)}>
              Convert to Real
            </Button>
          </Cell>
        </Row>
      ))}
    </Table>
  </Section>
</AdminPanel>
```

**Linking Logic:**
```typescript
async function linkPlaceholderToRealEmployee(
  placeholderId: string,
  realEmployeeId: string
) {
  // Move all data from placeholder to real employee
  await db.sales_data.updateMany({
    where: { employee_id: placeholderId },
    data: { employee_id: realEmployeeId }
  });

  await db.advisory_data.updateMany({
    where: { employee_id: placeholderId },
    data: { employee_id: realEmployeeId }
  });

  // Delete placeholder
  await db.employees.delete({
    where: { id: placeholderId }
  });

  // Log
  await logActivity({
    action_type: 'placeholder_linked',
    action_details: { placeholderId, realEmployeeId }
  });
}
```

---

**End of Employee Reporting Context Document**
