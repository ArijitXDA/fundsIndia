-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 005: pgvector — Semantic Memory + Knowledge Base
--
-- REQUIRES: pgvector extension enabled in Supabase (Dashboard → Database → Extensions)
--
-- What this adds:
--   1. vector(1536) column on agent_memory   → semantic memory retrieval
--   2. agent_knowledge_base table            → RAG for product/policy questions
--   3. IVFFlat indexes for fast cosine search
--   4. Supabase RPC functions for similarity search (callable from service_role)
-- ─────────────────────────────────────────────────────────────────────────────

-- Ensure pgvector is enabled (run this manually in Supabase SQL editor if needed)
CREATE EXTENSION IF NOT EXISTS vector;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Semantic memory: add embedding column to agent_memory
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE agent_memory
  ADD COLUMN IF NOT EXISTS embedding vector(1536);

-- IVFFlat index for cosine similarity on memory embeddings
-- lists=50 is appropriate for < 100k rows; increase to 100 if memory table grows large
CREATE INDEX IF NOT EXISTS agent_memory_embedding_idx
  ON agent_memory
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 50);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Knowledge base table for RAG (product docs, policies, FAQs)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS agent_knowledge_base (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  title        text        NOT NULL,                  -- short descriptor shown in citations
  content      text        NOT NULL,                  -- full chunk text (≤ 500 tokens ideally)
  category     text        NOT NULL DEFAULT 'general' -- product | policy | faq | contest | general
    CHECK (category IN ('product', 'policy', 'faq', 'contest', 'general')),
  source       text,                                  -- source doc/URL for traceability
  embedding    vector(1536),                          -- OpenAI text-embedding-3-small
  is_active    boolean     NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_knowledge_base_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_kb_updated_at ON agent_knowledge_base;
CREATE TRIGGER trg_kb_updated_at
  BEFORE UPDATE ON agent_knowledge_base
  FOR EACH ROW EXECUTE FUNCTION update_knowledge_base_updated_at();

-- IVFFlat index for fast cosine search on knowledge base
CREATE INDEX IF NOT EXISTS agent_knowledge_base_embedding_idx
  ON agent_knowledge_base
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 50);

-- Index for category filtering
CREATE INDEX IF NOT EXISTS agent_knowledge_base_category_idx
  ON agent_knowledge_base (category, is_active);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. RPC: semantic memory search
--    Callable by service_role from the API route.
--    Returns top-k memories for this employee ranked by cosine similarity.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION search_agent_memory(
  p_employee_id uuid,
  p_query_embedding vector(1536),
  p_limit int DEFAULT 8,
  p_min_similarity float DEFAULT 0.25
)
RETURNS TABLE (
  key          text,
  value        text,
  memory_type  text,
  similarity   float
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    key,
    value,
    memory_type,
    1 - (embedding <=> p_query_embedding) AS similarity
  FROM agent_memory
  WHERE
    employee_id = p_employee_id
    AND embedding IS NOT NULL
    AND (expires_at IS NULL OR expires_at > now())
    AND 1 - (embedding <=> p_query_embedding) >= p_min_similarity
  ORDER BY embedding <=> p_query_embedding
  LIMIT p_limit;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. RPC: knowledge base search
--    Returns top-k knowledge chunks ranked by cosine similarity to the query.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION search_knowledge_base(
  p_query_embedding vector(1536),
  p_limit int DEFAULT 5,
  p_min_similarity float DEFAULT 0.30,
  p_category text DEFAULT NULL
)
RETURNS TABLE (
  id         uuid,
  title      text,
  content    text,
  category   text,
  source     text,
  similarity float
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    id,
    title,
    content,
    category,
    source,
    1 - (embedding <=> p_query_embedding) AS similarity
  FROM agent_knowledge_base
  WHERE
    is_active = true
    AND embedding IS NOT NULL
    AND (p_category IS NULL OR category = p_category)
    AND 1 - (embedding <=> p_query_embedding) >= p_min_similarity
  ORDER BY embedding <=> p_query_embedding
  LIMIT p_limit;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Seed: initial knowledge base entries (FundsIndia product/policy basics)
--    Embeddings will be computed and backfilled by the API route on first use.
--    Add more entries via admin panel or direct SQL INSERT.
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO agent_knowledge_base (title, content, category, source) VALUES

-- Mutual Fund basics
(
  'Mutual Fund SIP — How it works',
  'A Systematic Investment Plan (SIP) allows investors to invest a fixed amount in a mutual fund scheme at regular intervals (monthly, weekly, quarterly). SIPs benefit from rupee-cost averaging — more units are bought when prices are low, fewer when high. SIPs can be started from as low as ₹500/month. FundsIndia tracks SIP inflows as "new_sip_inflow_ytd" (in Crores) in the B2C performance data.',
  'product',
  'FundsIndia internal'
),
(
  'ELSS — Tax Saving Mutual Funds',
  'Equity Linked Savings Scheme (ELSS) funds offer tax deduction under Section 80C of the Income Tax Act, up to ₹1.5 lakh per financial year. ELSS has the shortest lock-in period among 80C instruments — 3 years per SIP instalment. Returns are market-linked and not guaranteed. FundsIndia advisors often recommend ELSS for clients seeking tax saving with equity growth potential.',
  'product',
  'FundsIndia internal'
),
(
  'COB — Choice of Broker commission model',
  'COB (Choice of Broker) is a commission model where the mutual fund distributor (FundsIndia RM) earns trail commission on the AUM brought in. COB 100% means 100% of the trail commission flows to the distributor. In B2B sales data, "COB (100%)" column tracks this MTD inflow in Crores. It is distinct from MF+SIF+MSCI inflows.',
  'product',
  'FundsIndia internal'
),
(
  'AIF, PMS, LAS — Alternative Investment Products',
  'AIF (Alternative Investment Funds) are pooled investment vehicles regulated by SEBI for HNI investors. PMS (Portfolio Management Services) are individually managed equity portfolios, minimum investment ₹50 lakhs. LAS (Loan Against Securities) allows borrowing against mutual fund or equity holdings. Dynamo is FundsIndia''s proprietary algorithm-based investment product. In B2B sales, these are tracked together as "AIF+PMS+LAS+DYNAMO (TRAIL)".',
  'product',
  'FundsIndia internal'
),

-- Sales process
(
  'Trail Commission — How RMs earn',
  'Trail commission is a recurring fee paid by the AMC (Asset Management Company) to the distributor based on AUM. It is typically 0.5–1% per annum of AUM, paid monthly. As AUM grows, trail income compounds. FundsIndia B2B RMs earn trail on all investments routed through them. Higher AUM = higher monthly trail income even without new sales.',
  'policy',
  'FundsIndia internal'
),
(
  'ARN — AMFI Registration Number',
  'ARN (AMFI Registration Number) is the mandatory identifier for mutual fund distributors in India, issued by AMFI (Association of Mutual Funds in India). Each IFA (Independent Financial Advisor) or distributor has a unique ARN. In FundsIndia B2B sales data, "RM Emp ID" identifies the FundsIndia RM, while "Partner Name" identifies the IFA/ARN partner firm they support.',
  'policy',
  'FundsIndia internal'
),
(
  'Lumpsum vs SIP — Difference in inflow tracking',
  'Lumpsum investments are one-time investments made in a mutual fund. SIP (Systematic Investment Plan) investments are recurring. In FundsIndia performance data, B2B tables track both under "MF+SIF+MSCI" (which includes lumpsum and SIP MF inflows). B2C tracks "net_inflow_mtd" as the net of SIP + lumpsum inflows minus redemptions, and "new_sip_inflow_ytd" specifically for new SIPs registered.',
  'product',
  'FundsIndia internal'
),

-- Performance metrics
(
  'MTD vs YTD — What these periods mean',
  'MTD (Month-to-Date) = sales from the 1st of the current month to today. YTD (Year-to-Date) = sales from April 1st of the current financial year to today (Indian FY: April–March). In FundsIndia B2B data, MTD is in "b2b_sales_current_month" table. YTD excluding current month is in "btb_sales_YTD_minus_current_month". Full YTD = MTD + YTD-minus-current-month.',
  'faq',
  'FundsIndia internal'
),
(
  'AUM — Assets Under Management',
  'AUM (Assets Under Management) is the total market value of investments managed on behalf of clients. For FundsIndia B2C advisors, "current_aum_mtm [cr.]" is the AUM as of month-to-market valuation in Crores. AUM growth % shows month-on-month change. Higher AUM generates higher trail income. For B2B, AUM data is in "gs_overall_aum" Google Sheets sync table.',
  'faq',
  'FundsIndia internal'
),
(
  'Net Inflow — What it means for B2C advisors',
  'Net Inflow = Gross Inflow (SIP + Lumpsum purchases) minus Redemptions. A positive net inflow means more money is coming in than going out. For B2C advisors, "net_inflow_mtd[cr]" and "net_inflow_ytd[cr]" track this in Crores. Net inflow is the primary KPI for B2C advisor performance ranking.',
  'faq',
  'FundsIndia internal'
),

-- Compliance/Regulatory
(
  'KYC — Know Your Customer requirements',
  'KYC is mandatory for all mutual fund investors in India. Investors must complete KYC once with a KYC Registration Agency (KRA) — it is then valid across all mutual funds. Documents needed: PAN card, address proof, photograph. eKYC using Aadhaar is available. FundsIndia advisors must ensure clients are KYC-compliant before placing any investment.',
  'policy',
  'SEBI/AMFI regulatory requirement'
),
(
  'SEBI regulations for mutual fund distributors',
  'SEBI (Securities and Exchange Board of India) regulates mutual fund distributors in India. Key requirements: ARN registration with AMFI, NISM Series V-A certification (mandatory, renewed every 3 years), disclosure of commissions to clients, and compliance with SEBI Circular on Scheme-wise Commission Disclosure. Distributors cannot guarantee returns. All investments must be in client''s best interest (suitability assessment).',
  'policy',
  'SEBI regulations'
)

ON CONFLICT DO NOTHING;

-- Grant service_role access to new table and functions
GRANT SELECT, INSERT, UPDATE ON agent_knowledge_base TO service_role;
GRANT EXECUTE ON FUNCTION search_agent_memory TO service_role;
GRANT EXECUTE ON FUNCTION search_knowledge_base TO service_role;
