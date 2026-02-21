-- ============================================================
-- Migration 004: Agent message feedback (upvote/downvote)
-- Run in Supabase Dashboard → SQL Editor → New query → Run
-- ============================================================

CREATE TABLE IF NOT EXISTS agent_message_feedback (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id      uuid        NOT NULL REFERENCES agent_messages(id) ON DELETE CASCADE,
  employee_id     uuid        NOT NULL REFERENCES employees(id)     ON DELETE CASCADE,
  engine          text        NOT NULL DEFAULT 'engine1'
                              CHECK (engine IN ('engine1', 'engine2', 'engine3')),
  rating          text        NOT NULL CHECK (rating IN ('up', 'down')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE(message_id, employee_id, engine)
);

CREATE INDEX IF NOT EXISTS idx_amf_message   ON agent_message_feedback(message_id);
CREATE INDEX IF NOT EXISTS idx_amf_employee  ON agent_message_feedback(employee_id);
CREATE INDEX IF NOT EXISTS idx_amf_rating    ON agent_message_feedback(rating);

COMMENT ON TABLE agent_message_feedback IS
  'Per-message upvote/downvote feedback from employees. Used to update agent memory for personalisation.';
