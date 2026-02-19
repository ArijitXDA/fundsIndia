-- ============================================================
-- FundsAgent — Phase 1 Database Schema
-- Run this in Supabase SQL Editor
-- ============================================================

-- ─── 1. agent_personas ───────────────────────────────────────
-- Reusable behavioural profiles. Created by Dev Admin.
-- Many personas can exist; one is assigned per employee.
CREATE TABLE IF NOT EXISTS agent_personas (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  description text,

  -- LLM knobs
  model               text    NOT NULL DEFAULT 'gpt-4o',
  temperature         numeric(3,2) NOT NULL DEFAULT 0.70,
  top_p               numeric(3,2) NOT NULL DEFAULT 0.90,
  max_tokens          integer NOT NULL DEFAULT 1500,
  presence_penalty    numeric(3,2) NOT NULL DEFAULT 0.00,
  frequency_penalty   numeric(3,2) NOT NULL DEFAULT 0.00,

  -- Identity & tone
  agent_name    text NOT NULL DEFAULT 'FundsAgent',
  tone          text NOT NULL DEFAULT 'professional',
  -- 'professional' | 'motivational' | 'analytical' | 'strategic' | 'concise' | 'friendly'
  output_format text NOT NULL DEFAULT 'conversational',
  -- 'conversational' | 'bullet_points' | 'structured_report' | 'executive_summary'
  language      text NOT NULL DEFAULT 'en',

  -- Capability flags
  can_proactively_surface_insights boolean NOT NULL DEFAULT true,
  can_make_recommendations         boolean NOT NULL DEFAULT true,
  can_do_forecasting               boolean NOT NULL DEFAULT false,
  can_suggest_contest_strategy     boolean NOT NULL DEFAULT false,
  can_discuss_org_structure        boolean NOT NULL DEFAULT false,

  -- Optional full system prompt override (replaces auto-generated base prompt)
  system_prompt_override text,

  -- Meta
  created_by  uuid,   -- references users(id) — kept loose to avoid FK issues
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- ─── 2. agent_access ─────────────────────────────────────────
-- One row per employee who has FundsAgent access.
-- Defines persona assignment + data access scope.
CREATE TABLE IF NOT EXISTS agent_access (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  persona_id  uuid REFERENCES agent_personas(id) ON DELETE SET NULL,

  -- Human-readable access narrative (injected into system prompt)
  access_description    text NOT NULL DEFAULT '',
  no_access_description text NOT NULL DEFAULT '',

  -- Table-level whitelist/blacklist
  -- e.g. ARRAY['employees','b2b_sales_current_month','b2c']
  allowed_tables text[] NOT NULL DEFAULT '{}',
  denied_tables  text[] NOT NULL DEFAULT '{}',

  -- Column-level filters per table
  -- e.g. {"employees": {"business_unit": ["B2B"]}}
  column_filters jsonb NOT NULL DEFAULT '{}',

  -- Row-scope rules
  -- Tokens: 'own_only' | 'own_and_team' | 'vertical_only' | 'all'
  -- e.g. {"default": "own_and_team"}
  row_scope jsonb NOT NULL DEFAULT '{"default": "own_only"}',

  -- Per-employee overrides (null = use persona default)
  override_proactive_insights  boolean,
  override_recommendations     boolean,

  -- Dashboard widget
  show_widget_on_dashboard boolean NOT NULL DEFAULT true,
  widget_greeting          text,

  -- Status & audit
  is_active   boolean NOT NULL DEFAULT true,
  granted_by  uuid,
  granted_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),

  UNIQUE(employee_id)
);

-- ─── 3. agent_conversations ──────────────────────────────────
-- One row per conversation session.
CREATE TABLE IF NOT EXISTS agent_conversations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  persona_id  uuid REFERENCES agent_personas(id) ON DELETE SET NULL,

  title              text,
  started_at         timestamptz NOT NULL DEFAULT now(),
  last_active_at     timestamptz NOT NULL DEFAULT now(),
  message_count      integer NOT NULL DEFAULT 0,
  is_archived        boolean NOT NULL DEFAULT false,

  -- Rolling summary for future session context
  conversation_summary text
);

-- ─── 4. agent_messages ───────────────────────────────────────
-- Individual messages within a conversation.
-- employee_id is denormalised here for fast per-employee queries.
CREATE TABLE IF NOT EXISTS agent_messages (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES agent_conversations(id) ON DELETE CASCADE,
  employee_id     uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,

  role    text NOT NULL CHECK (role IN ('user','assistant','system','tool')),
  content text NOT NULL,

  -- Traceability
  data_sources_used text[],
  tokens_used       integer,
  model_used        text,

  -- Proactive insight metadata
  is_proactive       boolean NOT NULL DEFAULT false,
  proactive_trigger  text,
  -- 'partner_inactivity' | 'target_gap' | 'rank_change' | 'team_outlier' | 'zone_opportunity'

  created_at timestamptz NOT NULL DEFAULT now()
);

-- ─── 5. agent_memory ─────────────────────────────────────────
-- Persistent per-user key-value memory across sessions.
-- Columns are named memory_key / memory_value to avoid reserved word
-- conflicts and to match the application query layer.
CREATE TABLE IF NOT EXISTS agent_memory (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,

  memory_type  text NOT NULL DEFAULT 'fact',
  -- 'preference' | 'fact' | 'goal' | 'context' | 'alert_dismissed'
  memory_key   text NOT NULL,
  memory_value text NOT NULL,

  source      text NOT NULL DEFAULT 'user_stated',
  -- 'user_stated' | 'agent_inferred' | 'admin_set'
  confidence  numeric(3,2),   -- 0.0–1.0 (for inferred memories only)

  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  expiry_at   timestamptz,    -- null = permanent

  UNIQUE(employee_id, memory_key)
);

-- ─── Indexes ─────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_agent_access_employee    ON agent_access(employee_id);
CREATE INDEX IF NOT EXISTS idx_agent_access_persona     ON agent_access(persona_id);
CREATE INDEX IF NOT EXISTS idx_agent_conversations_emp  ON agent_conversations(employee_id);
CREATE INDEX IF NOT EXISTS idx_agent_conversations_last ON agent_conversations(last_active_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_messages_conv      ON agent_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_agent_messages_emp       ON agent_messages(employee_id);
CREATE INDEX IF NOT EXISTS idx_agent_messages_created   ON agent_messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_memory_emp         ON agent_memory(employee_id);

-- ─── Seed: 4 default personas ────────────────────────────────
INSERT INTO agent_personas (
  name, description, model, temperature, top_p, max_tokens,
  agent_name, tone, output_format,
  can_proactively_surface_insights, can_make_recommendations,
  can_do_forecasting, can_suggest_contest_strategy, can_discuss_org_structure
) VALUES (
  'RM Motivator',
  'Energetic, concise agent for B2B RMs. Focuses on personal performance, rankings, and actionable next steps.',
  'gpt-4o', 0.75, 0.90, 1200,
  'FundsAgent', 'motivational', 'bullet_points',
  true, true, false, true, false
), (
  'Manager Analyst',
  'Data-focused agent for team managers. Surfaces team breakdowns, flags underperformers, tracks team vs target.',
  'gpt-4o', 0.55, 0.90, 2000,
  'FundsAgent', 'analytical', 'structured_report',
  true, true, true, false, true
), (
  'CEO Strategist',
  'Strategic, org-wide intelligence for senior leadership. Scenario analysis, trend identification, business strategy.',
  'gpt-4o', 0.60, 0.95, 3000,
  'FundsAgent', 'strategic', 'executive_summary',
  true, true, true, true, true
), (
  'B2C Advisor Coach',
  'Supportive agent for B2C advisors. Tracks AUM growth, net inflow trends, lead conversion and SIP performance.',
  'gpt-4o', 0.70, 0.90, 1500,
  'FundsAgent', 'friendly', 'conversational',
  true, true, false, true, false
) ON CONFLICT DO NOTHING;
