-- ============================================================
-- Migration 003: Google Sheets sync tables
-- Run in Supabase Dashboard → SQL Editor → New query → Run
-- ============================================================

-- ── 1. gs_overall_aum ────────────────────────────────────────
-- Monthly AUM data by business segment, synced from Google Sheets tab "overall_aum"
CREATE TABLE IF NOT EXISTS gs_overall_aum (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  month            text NOT NULL,              -- e.g. "2024-04"
  business_segment text NOT NULL,              -- "B2B" | "B2C" | "Private Wealth"
  mf_aum           numeric,                   -- Raw MF AUM value
  mf_aum_cr        numeric,                   -- MF AUM in Crores
  eq_aum           numeric,                   -- Equity AUM
  other_products   numeric,
  trail            numeric,
  upfront          numeric,
  aif              numeric,
  bonds            numeric,
  fixed_deposits   numeric,
  insurance        numeric,
  mutual_funds     numeric,
  pms              numeric,
  sif              numeric,
  structured_product numeric,
  unlisted_shares  numeric,
  overall_aum      numeric,                   -- Total AUM in Crores
  sipinflow_cr     numeric,
  lumpsum_cr       numeric,
  red_cr           numeric,                   -- Redemption
  cob_cr           numeric,
  net_cr           numeric,
  monthly_net_sales numeric,
  overall_other_products numeric,
  overall_trail    numeric,

  -- Sync metadata
  synced_at        timestamptz NOT NULL DEFAULT now(),

  UNIQUE(month, business_segment)
);

CREATE INDEX IF NOT EXISTS idx_gs_overall_aum_month    ON gs_overall_aum(month);
CREATE INDEX IF NOT EXISTS idx_gs_overall_aum_segment  ON gs_overall_aum(business_segment);

COMMENT ON TABLE gs_overall_aum IS
  'Monthly AUM data by business segment — synced from Google Sheets tab "overall_aum"';

-- ── 2. gs_overall_sales ───────────────────────────────────────
-- Daily sales data by advisor/RM, synced from Google Sheets tab "overall_sales"
CREATE TABLE IF NOT EXISTS gs_overall_sales (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  arn_rm                   text,              -- Advisor/RM email or ARN
  name                     text,              -- Advisor/RM name
  team_region              text,              -- e.g. "GOLD", "SILVER"
  zone                     text,
  business_segment         text,              -- "B2B" | "B2C" | "Private Wealth"
  daywise                  text,              -- Period e.g. "2024-04"
  users_count              integer,
  reg_users_count          integer,
  accountholders_count     integer,
  firsttimeinvestors_count integer,
  sipinflow_amount         numeric,
  lumpsuminflow_amount     numeric,
  redemption_amount        numeric,
  aum_amount               numeric,
  cob_amount               numeric,
  cob_out                  numeric,
  switch_in_inflow         numeric,
  switch_out_inflow        numeric,

  -- Sync metadata
  synced_at                timestamptz NOT NULL DEFAULT now(),

  UNIQUE(arn_rm, daywise)
);

CREATE INDEX IF NOT EXISTS idx_gs_overall_sales_arn      ON gs_overall_sales(arn_rm);
CREATE INDEX IF NOT EXISTS idx_gs_overall_sales_daywise  ON gs_overall_sales(daywise);
CREATE INDEX IF NOT EXISTS idx_gs_overall_sales_segment  ON gs_overall_sales(business_segment);
CREATE INDEX IF NOT EXISTS idx_gs_overall_sales_zone     ON gs_overall_sales(zone);

COMMENT ON TABLE gs_overall_sales IS
  'Daily sales data by advisor/RM — synced from Google Sheets tab "overall_sales"';

-- ── 3. Sync log table ─────────────────────────────────────────
-- Tracks every sync run for auditing / debugging
CREATE TABLE IF NOT EXISTS gs_sync_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sheet_tab   text NOT NULL,
  rows_synced integer NOT NULL DEFAULT 0,
  rows_total  integer NOT NULL DEFAULT 0,
  status      text NOT NULL DEFAULT 'success', -- 'success' | 'error'
  error_msg   text,
  synced_at   timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE gs_sync_log IS
  'Audit log for Google Sheets sync runs';
