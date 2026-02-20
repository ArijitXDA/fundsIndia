-- ─────────────────────────────────────────────────────────────────────────────
-- BACKFILL: Fix NULL employee_id on agent_conversations and agent_messages
--
-- Run this in: Supabase Dashboard → SQL Editor → New query
--
-- Context:
--   Before commit 2d07ded, persistMessages() never set employee_id when
--   inserting agent_messages rows. All existing messages have employee_id = NULL,
--   which causes conversation history to appear blank for real user logins
--   (the history GET filters by employee_id = <user's employee id>).
--
-- Run these 3 statements IN ORDER.
-- ─────────────────────────────────────────────────────────────────────────────


-- ── Step 1: Fix users.employee_id (permanent FK link) ────────────────────────
-- Links every users row to their employees row via matching work_email/email.
-- Without this, real user logins fall back to session cookie (which works but
-- is not as robust). Running this once permanently fixes the root cause.

UPDATE users u
SET employee_id = e.id
FROM employees e
WHERE u.email = e.work_email
  AND u.employee_id IS NULL;

-- Verify: should show 0 unlinked users (or only users without employee records)
SELECT u.email, u.employee_id, e.full_name
FROM users u
LEFT JOIN employees e ON u.employee_id = e.id
ORDER BY u.email;


-- ── Step 2: Backfill agent_conversations.employee_id ─────────────────────────
-- All existing conversations have employee_id = NULL. Link them to the
-- employee who actually had them (using the users table → employees lookup).
-- Since this is a small team with one real user (Akshay Sapru / W2225A),
-- all NULL conversations are assumed to belong to him.
-- If you have multiple real users, adjust the WHERE clause.

UPDATE agent_conversations ac
SET employee_id = e.id
FROM users u
JOIN employees e ON u.employee_id = e.id
WHERE ac.employee_id IS NULL
  AND u.email = 'akshay.sapru@fundsindia.com';  -- adjust if needed

-- Alternatively, if ALL conversations so far belong to Akshay:
-- UPDATE agent_conversations
-- SET employee_id = '21bd7811-91a0-4815-9173-69cf8f188639'
-- WHERE employee_id IS NULL;

-- Verify: count should be 0 after backfill
SELECT COUNT(*) as null_conversations FROM agent_conversations WHERE employee_id IS NULL;


-- ── Step 3: Backfill agent_messages.employee_id ───────────────────────────────
-- Inherit employee_id from each message's parent conversation.
-- This works regardless of which employee owns each conversation.

UPDATE agent_messages am
SET employee_id = ac.employee_id
FROM agent_conversations ac
WHERE am.conversation_id = ac.id
  AND am.employee_id IS NULL
  AND ac.employee_id IS NOT NULL;

-- Verify: count should be 0 after backfill
SELECT COUNT(*) as null_messages FROM agent_messages WHERE employee_id IS NULL;


-- ── Final check: conversation history should now work ─────────────────────────
-- Replace the UUID below with Akshay's employee ID to spot-check
SELECT
  ac.id,
  ac.title,
  ac.message_count,
  ac.last_active_at,
  COUNT(am.id) as actual_message_count
FROM agent_conversations ac
LEFT JOIN agent_messages am ON am.conversation_id = ac.id
WHERE ac.employee_id = '21bd7811-91a0-4815-9173-69cf8f188639'
GROUP BY ac.id, ac.title, ac.message_count, ac.last_active_at
ORDER BY ac.last_active_at DESC;
