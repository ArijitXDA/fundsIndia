-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 006: Knowledge Base — Gap-fill entries
--
-- Adds 8 new KB chunks covering schema-specific knowledge the agent needs
-- to write accurate queries and give correct explanations:
--   1. B2B vs B2C — business model difference
--   2. gs_overall_sales — column meanings
--   3. gs_overall_aum — segment breakdown and column meanings
--   4. Full YTD calculation (two-table addition)
--   5. Employee number format (W-prefix gotcha for JOINs)
--   6. Targets table — structure and attainment calculation
--   7. ALTERNATE / alternate products category
--   8. Private Wealth business segment
--
-- Embeddings are backfilled separately via POST /api/admin/backfill-kb
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO agent_knowledge_base (title, content, category, source) VALUES

(
  'B2B vs B2C — FundsIndia Business Model',
  'FundsIndia operates three distinct sales channels. B2B (Business-to-Business): FundsIndia Relationship Managers (RMs) work with IFA (Independent Financial Advisor) partners who have their own ARN numbers. The RM sources and supports IFA partners; the IFA brings their own clients. Sales are tracked in b2b_sales_current_month and btb_sales_YTD_minus_current_month tables. B2C (Business-to-Consumer): FundsIndia advisors directly manage end-investor clients. Performance is tracked in the b2c table. A third segment — Private Wealth — handles HNI clients with higher AUM. These three segments (B2B, B2C, Private Wealth) appear as business_segment values in gs_overall_aum and gs_overall_sales.',
  'general',
  'FundsIndia internal'
),

(
  'gs_overall_sales table — column guide',
  'gs_overall_sales is a Google-Sheets-synced monthly sales (one day of every month) table with one row per RM/advisor per day. Key columns: arn_rm = the ARN or RM employee number identifying the advisor/RM. name = full name. team_region = team or region label. zone = geographic zone. business_segment = B2B, B2C, or Private Wealth. daywise = the date period (e.g. "2024-05-01"). users_count = total registered users. reg_users_count = registered users. accountholders_count = users who have invested. firsttimeinvestors_count = new investors that day. sipinflow_amount = SIP inflow in Crores. lumpsuminflow_amount = lumpsum inflow in Crores. redemption_amount = redemptions in Crores. aum_amount = AUM as of that day in Crores. cob_amount = COB (Choice of Broker) inflow in Crores. switch_in_inflow / switch_out_inflow = switch transactions. To get net inflow: sipinflow_amount + lumpsuminflow_amount - redemption_amount.',
  'general',
  'FundsIndia internal'
),

(
  'gs_overall_aum table — column guide and segment breakdown',
  'gs_overall_aum is a Google-Sheets-synced monthly AUM summary table. One row per month per business segment. Key columns: month = text in "YYYY-MM" format (e.g. "2024-05"). business_segment = "B2B", "B2C", or "Private Wealth" — these are the only three valid values. mf_aum_cr = mutual fund AUM in Crores. eq_aum = equity AUM (may be null for some segments). overall_aum = total AUM in Crores. sipinflow_cr = SIP inflow that month in Crores. lumpsum_cr = lumpsum inflow in Crores. red_cr = redemptions in Crores. net_cr = net inflow (sipinflow_cr + lumpsum_cr - red_cr). monthly_net_sales = net sales for the month. overall_trail = total trail commission earned that month in Crores. synced_at = when the row was last synced from Google Sheets. To compare across segments for a month: WHERE month = ''2024-05'' GROUP BY business_segment.',
  'general',
  'FundsIndia internal'
),

(
  'Full YTD B2B Sales — Two-Table Calculation',
  'In FundsIndia B2B data, YTD (Year-to-Date from April 1) is split across two tables because Google Sheets syncs overwrite the current month. To get FULL YTD for a B2B RM or partner: (1) MTD (current month) lives in b2b_sales_current_month. (2) YTD excluding current month lives in btb_sales_YTD_minus_current_month. Full YTD = MTD + YTD-minus-current-month. Example SQL to get full YTD MF inflows per RM: SELECT m."RM Emp ID", COALESCE(NULLIF(m."MF+SIF+MSCI",'''')::numeric, 0) + COALESCE(NULLIF(y."MF+SIF+MSCI",'''')::numeric, 0) AS full_ytd_mf FROM b2b_sales_current_month m LEFT JOIN "btb_sales_YTD_minus_current_month" y ON m."RM Emp ID" = y."RM Emp ID". Note: the YTD table name is case-sensitive and must be double-quoted.',
  'faq',
  'FundsIndia internal'
),

(
  'Employee Number Format — W-prefix and JOIN patterns',
  'FundsIndia employee numbers follow different formats by role. B2B Relationship Managers have a "W" prefix: e.g. "W12345". This exact value appears in BOTH the employees.employee_number column AND the "RM Emp ID" column in b2b_sales_current_month and btb_sales_YTD_minus_current_month. So JOINs work directly: employees.employee_number = b2b_sales_current_month."RM Emp ID". B2C advisors and other staff may have numeric-only employee numbers without the W prefix. The employees table columns: employee_number (text, e.g. "W12345"), full_name, job_title, business_unit (e.g. "B2B Sales", "B2C"), department, reporting_manager_emp_number (also W-prefixed for B2B managers), employment_status ("Working" for active), work_email.',
  'faq',
  'FundsIndia internal'
),

(
  'Targets table — structure and attainment calculation',
  'The targets table stores performance targets per employee. Key columns: employee_id (uuid, FK to employees.id — not employee_number), business_unit (matches employees.business_unit, e.g. "B2B Sales"), target_type ("monthly" or "quarterly"), target_value (numeric, in Crores), period_start and period_end (date range for the target). To calculate attainment %: (actual_sales / target_value) * 100. To JOIN with sales: first join employees on employee_id, then join sales tables on employee_number. Example: SELECT e.full_name, t.target_value, NULLIF(s."Total Net Sales (COB 100%)",'''')::numeric AS mtd_sales FROM targets t JOIN employees e ON t.employee_id = e.id JOIN b2b_sales_current_month s ON e.employee_number = s."RM Emp ID" WHERE t.target_type = ''monthly''.',
  'faq',
  'FundsIndia internal'
),

(
  'ALTERNATE — Alternate Investment Products in B2B',
  'In FundsIndia B2B sales tables, the "ALTERNATE" column (in b2b_sales_current_month) and "SUM of ALT" (in btb_sales_YTD_minus_current_month) track inflows from alternate investment products. This category includes structured products, bonds, NCDs (Non-Convertible Debentures), fixed deposits routed through FundsIndia, and other non-standard financial instruments that do not fall under mutual funds (MF), PMS, AIF, or LAS. ALTERNATE is separate from "AIF+PMS+LAS+DYNAMO (TRAIL)". The "Total Net Sales (COB 100%)" column is the sum of MF+SIF+MSCI + COB (100%) + AIF+PMS+LAS+DYNAMO (TRAIL) + ALTERNATE for each RM.',
  'product',
  'FundsIndia internal'
),

(
  'Private Wealth — FundsIndia HNI business segment',
  'Private Wealth is FundsIndia''s third business segment (alongside B2B and B2C), focused on High Net Worth Individual (HNI) clients with higher AUM and more complex investment needs. In gs_overall_aum and gs_overall_sales, business_segment = ''Private Wealth'' represents this segment. Private Wealth advisors typically deal in AIF (Alternative Investment Funds), PMS (Portfolio Management Services), structured products, and large lumpsum mutual fund investments. Minimum ticket sizes are significantly higher than retail B2C. Private Wealth AUM is tracked separately in gs_overall_aum and contributes to overall_aum when aggregated across all segments.',
  'product',
  'FundsIndia internal'
)

ON CONFLICT DO NOTHING;
