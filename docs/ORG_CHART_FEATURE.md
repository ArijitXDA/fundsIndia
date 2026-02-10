# Organization Chart Feature

## Overview
Interactive organizational hierarchy view showing reporting structure, employee details, and performance metrics.

## Access
- **Location**: Dashboard header, top-right corner
- **Button**: "Org View" (with Network icon)
- **Who can access**: All authenticated users

## Features

### 1. Automatic Path Expansion
- Opens with the current user's position visible
- Auto-expands the reporting chain from top manager to user
- User's card is highlighted with purple gradient and "YOU" badge

### 2. Interactive Tree Navigation
- **Up Arrow (ChevronUp)**: Collapse direct reports
- **Down Arrow (ChevronDown)**: Expand direct reports
- Navigation is layer-by-layer (hierarchical expansion)
- Connection lines show reporting relationships

### 3. Employee Card Details
Each card displays:
- **Name**: Full employee name (e.g., "Amarnath Sahu")
- **Designation**: Job title (e.g., "Relationship Manager")
- **Business Unit**: B2B, B2C, PW, or Corporate
- **YTD Performance**: Sales or net inflow in Crores (₹)
- **Mobile**: Click-to-call phone link (e.g., "91-88826 51719")
- **Email**: Click-to-mailto email link
- **Team Size**: Shows count of direct reports for managers

### 4. Performance Integration
- **B2B Employees**: Shows YTD sales from B2B sales tables
- **B2C Advisors**: Shows Net Inflow YTD from advisory data
- **Others**: Shows ₹0.00 if no performance data

### 5. Visual Hierarchy
- **Level 0**: Top-most manager (no indentation)
- **Level 1**: Direct reports (40px indentation)
- **Level 2**: Team members (80px indentation)
- **Level N**: Continues with 40px increments

## Example Hierarchy

```
Raj Singh (W1392) - Branch Manager
├── Amarnath Sahu (W1564) - Relationship Manager ⭐ YOU
│   └── [Team members if any]
└── [Other direct reports]
```

## Data Source
- **API Endpoint**: `/api/org-hierarchy?employeeId=W1564`
- **Employee Data**: From `employees` table (1,000+ employees)
- **Performance Data**:
  - B2B: `b2b_sales_current_month` + `btb_sales_YTD_minus_current_month`
  - B2C: `b2c` table (Net Inflow YTD)

## Technical Implementation

### API Response Structure
```json
{
  "success": true,
  "totalEmployees": 1000,
  "currentEmployee": {
    "employeeNumber": "W1564",
    "name": "Amarnath Sahu",
    "email": "amarnath@fundsindia.com",
    "mobile": "91-88826 51719",
    "designation": "Relationship Manager",
    "businessUnit": "B2B",
    "reportingManagerEmpNo": "W1392",
    "location": "New Delhi - Janakpuri",
    "ytdPerformance": "70.35",
    "performanceType": "B2B"
  },
  "employees": [...]
}
```

### Key Functions
1. **getDirectReports(managerEmpNo)**: Finds all employees reporting to a manager
2. **getManagerChain(employee)**: Builds chain from employee to top manager
3. **toggleNode(employeeNumber)**: Expands/collapses direct reports
4. **renderEmployeeCard()**: Recursive rendering with indentation

### State Management
- `expandedNodes`: Set of employee numbers with expanded reports
- `currentEmployee`: Highlighted user's data
- `employees`: Full employee list with performance data

## User Experience Flow

1. **User clicks "Org View" button**
2. **Modal opens** with loading spinner
3. **API fetches** employee data and performance metrics
4. **Tree renders** starting from top manager in chain
5. **Auto-expands** path to current user
6. **User's card** highlighted with special styling
7. **User can**:
   - Click phone numbers to call
   - Click emails to compose message
   - Expand/collapse teams with arrows
   - Scroll through large hierarchies
8. **Close modal** via X button or "Close" footer button

## Styling Details

### Card Colors
- **Current User**: Indigo-purple gradient with ring
- **Managers with Reports**: White background, hover effects
- **Top 3 in Chain**: Visible in expanded view

### Icons Used
- **Network**: Org View button
- **Building2**: Business unit/designation indicator
- **TrendingUp**: Performance metric
- **Phone**: Click-to-call
- **Mail**: Click-to-email
- **Users**: Team size indicator
- **ChevronUp/Down**: Expand/collapse controls
- **X**: Close modal

## Performance Optimization
- Lazy loading: Only expanded nodes render children
- Efficient lookups: Employee map for O(1) access
- Minimal re-renders: React state optimization
- Smooth animations: CSS transitions

## Future Enhancements
- Search functionality to jump to any employee
- Filter by business unit or location
- Export org chart as image/PDF
- Show team performance aggregates
- Add photos/avatars for employees
- Show team ranking badges
