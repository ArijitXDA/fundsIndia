# Contest Logic Context - RNR Dashboard

**Last Updated:** February 9, 2026
**Version:** 1.0.0

---

## Table of Contents
1. [Period Definitions](#period-definitions)
2. [Ranking Calculation Algorithm](#ranking-calculation-algorithm)
3. [Achievement Percentage Formula](#achievement-percentage-formula)
4. [Target Calculation Methodology](#target-calculation-methodology)
5. [Period Aggregation Logic](#period-aggregation-logic)
6. [Tie-Breaking Rules](#tie-breaking-rules)
7. [Team Performance Roll-up](#team-performance-roll-up)
8. [Business Rules by Vertical](#business-rules-by-vertical)
9. [Data Upsert Strategy](#data-upsert-strategy)
10. [Edge Cases & Special Scenarios](#edge-cases--special-scenarios)

---

## Period Definitions

### Financial Year 2026
- **Start Date:** April 1, 2025
- **End Date:** March 31, 2026
- **Quarters:**
  - Q1: Apr 1, 2025 - Jun 30, 2025
  - Q2: Jul 1, 2025 - Sep 30, 2025
  - Q3: Oct 1, 2025 - Dec 31, 2025
  - Q4: Jan 1, 2026 - Mar 31, 2026 **(Current Contest Period)**

### Period Types

#### 1. MTD (Month-to-Date)
- **Definition:** From the 1st day of current month to current date
- **Example (Jan 15):** Jan 1, 2026 to Jan 15, 2026
- **Data Source:** Current month sheet from Net Sales file (e.g., "Jan26")
- **Calculation:** Direct values from MTD sheet
- **Use Case:** Short-term daily tracking

#### 2. QTD (Quarter-to-Date)
- **Definition:** From the 1st day of current quarter to current date
- **For Q4:** Jan 1, 2026 to current date
- **Data Source:** Aggregation of monthly data
- **Calculation:** Sum of all months in current quarter up to current month
  - January: QTD = Jan MTD
  - February: QTD = Jan + Feb MTD
  - March: QTD = Jan + Feb + Mar MTD
- **Use Case:** Quarterly performance tracking

#### 3. YTD (Year-to-Date)
- **Definition:** From April 1, 2025 (FY start) to current date
- **Data Source:** YTD sheet + Current month MTD
- **Calculation:**
  - YTD sheet contains Apr 2025 - Dec 2025 cumulative
  - Add current month MTD (Jan 2026) to get full YTD
  - Formula: `YTD_Total = YTD_Sheet_Value + Current_Month_MTD`
- **Use Case:** Annual performance tracking

#### 4. Contest Period
- **Definition:** Configurable period set by admin (default: Q4)
- **Current Default:** Jan 1, 2026 - Mar 31, 2026 (same as Q4)
- **Data Source:** Aggregation based on contest dates
- **Calculation:** Sum of all data within contest period dates
- **Use Case:** Contest-specific rankings

---

## Ranking Calculation Algorithm

### Primary Ranking Metric
**Net Sales (total_net_sales_cob_100)** - Cost of Business at 100%

### Algorithm Steps

```
FUNCTION calculate_rankings(period_type, business_unit):

  1. Fetch all active employees in the business_unit
     WHERE employment_status = 'Working'
     AND business_unit = specified_unit (or ALL if not specified)

  2. For each employee:
     a. Aggregate total_net_sales_cob_100 for the period
        - MTD: SUM where data_period = 'MTD' AND data_date = latest_date
        - QTD: SUM where data_period = 'MTD' AND month IN current_quarter_months
        - YTD: SUM of YTD_sheet + current_MTD
        - Contest: SUM where data_date BETWEEN contest_start AND contest_end

     b. Fetch target_value for the employee
        - FROM targets table
        - WHERE parameter_name = 'net_sales'
        - AND target_type matches period (monthly/quarterly/yearly/contest)

     c. Calculate metrics:
        - achievement_value = aggregated_net_sales
        - achievement_pct = (achievement_value / target_value) × 100
        - shortfall = target_value - achievement_value

  3. Sort employees within business_unit:
     ORDER BY achievement_value DESC, achievement_pct DESC, employee_number ASC

  4. Assign rank_vertical using ROW_NUMBER()
     PARTITION BY business_unit
     ORDER BY (same as step 3)

  5. Insert/Update rankings table
     - DELETE existing rankings for (period_type, business_unit, calculation_date)
     - INSERT new rankings

  6. Return number of records processed

END FUNCTION
```

### Pseudo-code

```typescript
function calculateRankings(periodType: 'MTD' | 'QTD' | 'YTD' | 'Contest', businessUnit?: string) {
  // Step 1: Get active employees
  const employees = await db.employees.findMany({
    where: {
      employment_status: 'Working',
      ...(businessUnit && { business_unit: businessUnit })
    }
  });

  // Step 2: Calculate achievement for each employee
  const employeePerformance = await Promise.all(
    employees.map(async (emp) => {
      const achievement = await getAchievementValue(emp.id, periodType);
      const target = await getTarget(emp.id, periodType);

      return {
        employee_id: emp.id,
        business_unit: emp.business_unit,
        achievement_value: achievement,
        target_value: target,
        achievement_pct: target > 0 ? (achievement / target) * 100 : 0,
        shortfall: target - achievement
      };
    })
  );

  // Step 3 & 4: Sort and rank within each business unit
  const ranked = employeePerformance
    .sort((a, b) => {
      if (b.achievement_value !== a.achievement_value) {
        return b.achievement_value - a.achievement_value; // DESC
      }
      if (b.achievement_pct !== a.achievement_pct) {
        return b.achievement_pct - a.achievement_pct; // DESC
      }
      return a.employee_number.localeCompare(b.employee_number); // ASC
    });

  // Assign rank_vertical by business unit
  const businessUnits = [...new Set(ranked.map(r => r.business_unit))];

  businessUnits.forEach(bu => {
    const buRankings = ranked.filter(r => r.business_unit === bu);
    buRankings.forEach((ranking, index) => {
      ranking.rank_vertical = index + 1;
    });
  });

  // Step 5: Save to database
  await db.rankings.deleteMany({
    where: {
      period_type: periodType,
      calculation_date: new Date(),
      ...(businessUnit && { business_unit: businessUnit })
    }
  });

  await db.rankings.createMany({
    data: ranked
  });

  return ranked.length;
}
```

---

## Achievement Percentage Formula

### Basic Formula

```
Achievement % = (Actual Achievement / Target Value) × 100
```

### Implementation

```typescript
function calculateAchievementPercentage(actual: number, target: number): number {
  if (target === 0 || target === null) {
    return 0; // No target set, 0%
  }

  const percentage = (actual / target) * 100;

  // Round to 2 decimal places
  return Math.round(percentage * 100) / 100;
}
```

### Special Cases

1. **No Target Set:**
   - achievement_pct = 0
   - Display: "No Target"

2. **Negative Achievement:**
   - achievement_pct can be negative (e.g., -50%)
   - Still participates in ranking based on actual value

3. **Over-achievement:**
   - achievement_pct > 100% is valid
   - Example: 150% means 1.5x the target

4. **Zero Achievement:**
   - achievement_pct = 0%
   - Rank at bottom

---

## Target Calculation Methodology

### Target Setting Approach
**Individual Employee Level** - Each employee has unique targets

### Target Types

1. **Monthly Target**
   - target_type = 'monthly'
   - period: 1st to last day of month
   - Example: Jan target = 100 Cr

2. **Quarterly Target**
   - target_type = 'quarterly'
   - period: 3 months
   - Example: Q4 target = 300 Cr

3. **Yearly Target**
   - target_type = 'yearly'
   - period: Apr 1 to Mar 31
   - Example: FY26 target = 1200 Cr

4. **Contest Target**
   - target_type = 'contest'
   - period: Contest start to end dates
   - Example: Q4 Contest target = 300 Cr

### Sample Target Generation (for testing)

```typescript
function generateSampleTargets(employee: Employee) {
  const baseFactor = {
    'RM': 50,    // RMs get 50 Cr monthly
    'BM': 200,   // BMs get 200 Cr monthly
    'RGM': 500,  // RGMs get 500 Cr monthly
    'ZM': 1000   // ZMs get 1000 Cr monthly
  };

  const roleKey = extractRole(employee.job_title); // Extract RM, BM, etc.
  const monthlyBase = baseFactor[roleKey] || 30;

  return {
    monthly: monthlyBase,
    quarterly: monthlyBase * 3,
    yearly: monthlyBase * 12,
    contest: monthlyBase * 3 // Q4 = 3 months
  };
}
```

### Target Upload Format

CSV/Excel with columns:
```
employee_email, parameter_name, target_type, period_start, period_end, target_value
```

Example:
```csv
employee@fundsindia.com,net_sales,monthly,2026-01-01,2026-01-31,50.00
employee@fundsindia.com,aum,quarterly,2026-01-01,2026-03-31,500.00
```

---

## Period Aggregation Logic

### Data Storage Strategy

Each upload stores data with:
- `data_date`: Date of upload (e.g., 2026-01-15)
- `data_period`: Period type ('MTD', 'YTD', 'QTD')

**Rule:** Keep only latest data for each period (UPSERT, not APPEND)

### MTD Aggregation

```
MTD = Latest MTD record for current month
```

**Query:**
```sql
SELECT SUM(total_net_sales_cob_100)
FROM sales_data
WHERE employee_id = ?
AND data_period = 'MTD'
AND data_date = (SELECT MAX(data_date) FROM sales_data WHERE data_period = 'MTD')
```

### QTD Aggregation

```
QTD = SUM of all monthly MTD records in current quarter
```

**For Q4 (Jan-Feb-Mar):**

- **January:** QTD = Jan MTD
- **February:** QTD = Jan MTD + Feb MTD
- **March:** QTD = Jan MTD + Feb MTD + Mar MTD

**Query:**
```sql
SELECT SUM(total_net_sales_cob_100)
FROM sales_data
WHERE employee_id = ?
AND data_period = 'MTD'
AND EXTRACT(MONTH FROM data_date) BETWEEN 1 AND 3  -- Q4 months
AND EXTRACT(YEAR FROM data_date) = 2026
GROUP BY employee_id
```

**Important:** We store MTD for each month. QTD is calculated by summing MTDs.

### YTD Aggregation

```
YTD = YTD_Sheet_Value + Current_Month_MTD
```

**Two sources:**
1. YTD sheet from file: Apr 2025 - Dec 2025 cumulative
2. Current month MTD: Jan 2026 (from Jan26 sheet)

**Query:**
```sql
-- Get YTD cumulative (Apr-Dec)
SELECT total_net_sales_cob_100
FROM sales_data
WHERE employee_id = ?
AND data_period = 'YTD'
AND data_date = (SELECT MAX(data_date) FROM sales_data WHERE data_period = 'YTD')

UNION ALL

-- Get current month MTD (Jan)
SELECT total_net_sales_cob_100
FROM sales_data
WHERE employee_id = ?
AND data_period = 'MTD'
AND EXTRACT(MONTH FROM data_date) = EXTRACT(MONTH FROM CURRENT_DATE)
```

Then SUM both values.

### Contest Period Aggregation

```
Contest = SUM of all MTD records within contest date range
```

**Query:**
```sql
SELECT SUM(total_net_sales_cob_100)
FROM sales_data
WHERE employee_id = ?
AND data_period = 'MTD'
AND data_date BETWEEN contest_start_date AND contest_end_date
GROUP BY employee_id
```

**For Q4 Contest (Jan 1 - Mar 31):**
- Same as QTD calculation

---

## Tie-Breaking Rules

When two or more employees have the **same Net Sales value**, apply tie-breakers in order:

### Ranking Priority

```
1. total_net_sales_cob_100 (DESC) - Primary
2. achievement_pct (DESC) - First tie-breaker
3. employee_number (ASC) - Second tie-breaker
```

### Example

| Employee | Net Sales | Target | Achievement % | Employee # | Final Rank |
|----------|-----------|--------|---------------|------------|------------|
| Alice    | 100.00    | 80.00  | 125.00%       | W1001      | 1          |
| Bob      | 100.00    | 100.00 | 100.00%       | W1002      | 2          |
| Charlie  | 100.00    | 100.00 | 100.00%       | W1003      | 3          |
| David    | 95.00     | 80.00  | 118.75%       | W1000      | 4          |

**Explanation:**
- Alice, Bob, Charlie all have 100.00 Net Sales
- Alice ranks #1 because 125% > 100%
- Bob ranks #2 over Charlie because W1002 < W1003 (alphabetically)
- David ranks #4 despite higher achievement % because Net Sales (95) < 100

### SQL Implementation

```sql
SELECT
    employee_id,
    total_net_sales_cob_100,
    achievement_pct,
    employee_number,
    ROW_NUMBER() OVER (
        PARTITION BY business_unit
        ORDER BY
            total_net_sales_cob_100 DESC,
            achievement_pct DESC,
            employee_number ASC
    ) AS rank_vertical
FROM (
    -- Subquery to calculate achievement_pct
    SELECT
        e.id AS employee_id,
        e.business_unit,
        e.employee_number,
        COALESCE(SUM(sd.total_net_sales_cob_100), 0) AS total_net_sales_cob_100,
        CASE
            WHEN t.target_value > 0
            THEN (COALESCE(SUM(sd.total_net_sales_cob_100), 0) / t.target_value) * 100
            ELSE 0
        END AS achievement_pct
    FROM employees e
    LEFT JOIN sales_data sd ON e.id = sd.employee_id
    LEFT JOIN targets t ON e.id = t.employee_id
    GROUP BY e.id, e.business_unit, e.employee_number, t.target_value
) ranked_employees;
```

---

## Team Performance Roll-up

### Aggregation Method

**Team Total = Manager's Individual Performance + Sum of All Downstream Reportees**

### Algorithm

```
FUNCTION get_team_aggregate(manager_id, period_type):

  1. Get all downstream reportees recursively
     - Use get_employee_hierarchy(manager_id) function
     - Returns manager + all direct and indirect reports

  2. Get manager's individual performance
     - FROM sales_data WHERE employee_id = manager_id AND period = period_type
     - SUM(total_net_sales_cob_100) AS manager_contribution

  3. Get team's performance (excluding manager)
     - FROM sales_data
     - WHERE employee_id IN (reportees_list)
     - AND employee_id != manager_id
     - SUM(total_net_sales_cob_100) AS team_contribution

  4. Calculate totals
     - total_net_sales = manager_contribution + team_contribution
     - num_team_members = COUNT(reportees) - 1 (exclude manager)

  5. Return aggregated metrics

END FUNCTION
```

### Display Format

```
╔════════════════════════════════════╗
║  Team Performance - QTD           ║
╠════════════════════════════════════╣
║  Your Contribution:    ₹ 125.50 Cr║
║  Team Contribution:    ₹ 874.50 Cr║
║  ────────────────────────────────  ║
║  Total:               ₹1,000.00 Cr║
║  Team Members:         12 people   ║
╚════════════════════════════════════╝
```

### Recursive Example

```
ZM (Zonal Manager)
├── RGM 1
│   ├── BM 1
│   │   ├── RM 1: 10 Cr
│   │   └── RM 2: 15 Cr
│   └── BM 2
│       └── RM 3: 20 Cr
└── RGM 2
    └── BM 3
        ├── RM 4: 12 Cr
        └── RM 5: 18 Cr

ZM's individual: 50 Cr

Team Total = ZM (50) + RGM1 (0) + RGM2 (0) + BM1 (0) + BM2 (0) + BM3 (0)
             + RM1 (10) + RM2 (15) + RM3 (20) + RM4 (12) + RM5 (18)
           = 50 + 75 = 125 Cr

Display:
  Your Contribution: 50 Cr (40%)
  Team Contribution: 75 Cr (60%)
  Total: 125 Cr
  Team Members: 8 people (5 RMs + 3 BMs + 2 RGMs + ZM = 11, minus ZM = 8 reportees)
```

---

## Business Rules by Vertical

### B2B (Business-to-Business)

**Primary Metric:** Net Sales (total_net_sales_cob_100)

**Hierarchy Source:** Net Sales file (RM → BM → RGM → ZM columns)

**Special Rules:**
- ARN-based tracking (partner-level granularity)
- COB 100% is the standard for ranking
- COB 50% is tracked but not used for ranking
- Alternate products (AIF, PMS) tracked separately

**Data Columns:**
- `mf_sif_msci`: Mutual Fund + SIF + MSCI inflows
- `cob_100`: Cost of Business at 100%
- `aif_pms_las_trail`: Alternative products trail
- `total_net_sales_cob_100`: **Primary ranking metric**

**Target Parameters:**
- net_sales (primary)
- aum (secondary)
- revenue (tertiary)

---

### B2C (Digital / Advisory)

**Primary Metric:** Net Inflow or AUM (configurable)

**Hierarchy Source:** Employee Master file

**Special Rules:**
- No ARN tracking (direct retail clients)
- AUM growth % is important metric
- SIP inflows tracked separately from lumpsum
- Team-based grouping (DIGITAL team, etc.)

**Data Columns:**
- `net_inflow_mtd / net_inflow_ytd`: Primary for ranking
- `current_aum_mtm`: Mark-to-market AUM
- `new_sip_inflow`: New SIP acquisitions
- `assigned_leads`: Lead assignment count

**Target Parameters:**
- aum (primary)
- net_inflow (secondary)
- new_sip (tertiary)

---

### PW (Private Wealth)

**Primary Metric:** AUM or Revenue (configurable)

**Hierarchy Source:** Employee Master file

**Special Rules:**
- High-value client focus
- Relationship-based (not product-based)
- May have different data source (TBD)

**Data Columns:** (TBD - similar to B2C for now)

**Target Parameters:**
- aum (primary)
- revenue (secondary)

---

### Cross-Vertical Rules

1. **No Organization-Wide Rankings:**
   - Each vertical has independent leaderboards
   - B2B Top 10 ≠ B2C Top 10 ≠ PW Top 10

2. **Group CEO View:**
   - Can see all verticals
   - No combined ranking, but can view side-by-side

3. **Contest Configuration:**
   - Contests can be vertical-specific or multi-vertical
   - Each vertical uses its own primary metric

---

## Data Upsert Strategy

### Philosophy: **REPLACE, NOT APPEND**

When admin uploads new data, **replace** existing data for that period, don't append.

### Rationale

- **Avoids Duplicates:** No risk of double-counting
- **Corrections:** Allows correcting previous uploads
- **Simplicity:** No need to track incremental changes
- **Storage:** Saves database space

### Implementation

```typescript
async function upsertSalesData(data: SalesRecord[], period: 'MTD' | 'YTD') {
  // Step 1: Delete existing records for this period and date
  await db.sales_data.deleteMany({
    where: {
      data_period: period,
      data_date: new Date() // Today's upload
    }
  });

  // Step 2: Insert new records
  await db.sales_data.createMany({
    data: data.map(record => ({
      ...record,
      data_period: period,
      data_date: new Date()
    }))
  });

  // Step 3: Recalculate rankings
  await calculateRankings(period);
}
```

### Edge Case: Mid-Day Updates

If admin uploads data twice in one day:
- Second upload **replaces** first upload
- Ranking recalculated with latest data
- Activity log captures both uploads

### SQL Upsert Pattern

```sql
-- PostgreSQL UPSERT (INSERT ... ON CONFLICT)
INSERT INTO sales_data (
    employee_email,
    data_period,
    data_date,
    total_net_sales_cob_100,
    ...
) VALUES (
    'employee@fundsindia.com',
    'MTD',
    CURRENT_DATE,
    100.50,
    ...
)
ON CONFLICT (employee_email, data_period, data_date)
DO UPDATE SET
    total_net_sales_cob_100 = EXCLUDED.total_net_sales_cob_100,
    updated_at = NOW();
```

---

## Edge Cases & Special Scenarios

### 1. Employee Not in Employee Master

**Scenario:** Sales data has email not in employees table

**Handling:**
```typescript
// Create placeholder employee
if (!employeeExists(email)) {
  createPlaceholderEmployee({
    employee_number: `PH-${generateHash(email)}`,
    work_email: email,
    full_name: nameFromSalesData,
    business_unit: 'B2B',
    is_placeholder: true
  });
}
```

**Display:** Show placeholder flag in admin panel for correction

---

### 2. Zero Target Set

**Scenario:** Employee has no target in targets table

**Handling:**
- achievement_pct = 0
- shortfall = 0 - achievement (negative)
- Still ranked by achievement value
- Display: "No Target Set"

---

### 3. Negative Sales

**Scenario:** Refunds/reversals cause negative net sales

**Handling:**
- Allow negative values
- Rank normally (negative < 0)
- Display with red color
- achievement_pct can be negative

---

### 4. Manager with No Reportees

**Scenario:** Employee flagged as manager but has 0 reportees

**Handling:**
- Team view = Individual view
- No "Team Contribution" shown
- Display: "No team members"

---

### 5. Mid-Month Resignation

**Scenario:** Employee resigns mid-month

**Handling:**
- Keep data until month-end
- Set employment_status = 'Resigned'
- Exclude from future rankings
- Historical data retained

---

### 6. Reporting Manager Change

**Scenario:** RM changes from BM1 to BM2 mid-period

**Handling:**
- Update employees.reporting_manager_emp_number
- Insert new row in reporting_history:
  - Old: effective_to = change_date
  - New: effective_from = change_date, effective_to = NULL
- Data remains with employee
- New manager sees from change_date onwards

---

### 7. Multiple Contests Active

**Scenario:** Admin activates 2 contests simultaneously

**Handling:**
- is_active flag allows only ONE active contest
- Admin must deactivate current before activating new
- UI validation prevents overlap

---

### 8. Late Data Upload

**Scenario:** Admin uploads January data on Feb 5

**Handling:**
- Allow backdated uploads
- data_date can be set manually
- Recalculate rankings for that period
- Activity log shows upload time vs data date

---

### 9. Partial Month Data

**Scenario:** MTD upload for Jan 15 (not full month)

**Handling:**
- Store as-is with data_date = 2026-01-15
- MTD queries use latest data_date
- Projection: (MTD / days_elapsed) × days_in_month (optional)

---

### 10. Duplicate ARNs Across RMs

**Scenario:** Same ARN appears under 2 different RMs

**Handling:**
- Allow (legitimate: ARN can work with multiple RMs)
- Both RMs get credit for their respective sales
- No de-duplication

---

**End of Contest Logic Context Document**
