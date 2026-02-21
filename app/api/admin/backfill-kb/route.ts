// ─────────────────────────────────────────────────────────────────────────────
// app/api/admin/backfill-kb/route.ts
//
// One-time admin route to seed embeddings for all knowledge base entries that
// have no embedding yet.
//
// POST /api/admin/backfill-kb
//   → Fetches all agent_knowledge_base rows where embedding IS NULL
//   → Generates embeddings in batches via OpenAI text-embedding-3-small
//   → Updates each row with its embedding
//   → Returns { updated: N, skipped: M }
//
// Security: requires ADMIN_SECRET header matching ADMIN_SECRET env var.
// Run once after deploying migration 005_pgvector.sql.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin }            from '@/lib/supabase';
import { embedBatch }               from '@/lib/agent/embeddings';

export async function POST(req: NextRequest) {
  // ── Simple secret auth ────────────────────────────────────────────────────
  const secret = req.headers.get('x-admin-secret');
  if (!secret || secret !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // ── Fetch all KB rows without embeddings ──────────────────────────────────
  const { data: rows, error: fetchErr } = await supabaseAdmin
    .from('agent_knowledge_base')
    .select('id, title, content')
    .is('embedding', null)
    .eq('is_active', true);

  if (fetchErr) {
    return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  }

  if (!rows || rows.length === 0) {
    return NextResponse.json({ updated: 0, skipped: 0, message: 'All KB entries already have embeddings.' });
  }

  // ── Build text to embed: "title: content" ─────────────────────────────────
  const texts = rows.map(r => `${r.title}: ${r.content}`);

  // ── Batch embed (single OpenAI call for all rows) ─────────────────────────
  const embeddings = await embedBatch(texts);

  // ── Update each row ───────────────────────────────────────────────────────
  let updated = 0;
  let skipped = 0;

  for (let i = 0; i < rows.length; i++) {
    const vec = embeddings[i];
    if (!vec) {
      skipped++;
      continue;
    }

    const { error: updateErr } = await supabaseAdmin
      .from('agent_knowledge_base')
      .update({ embedding: vec })
      .eq('id', rows[i].id);

    if (updateErr) {
      console.error(`[backfill-kb] Failed to update ${rows[i].id}:`, updateErr.message);
      skipped++;
    } else {
      updated++;
    }
  }

  return NextResponse.json({
    updated,
    skipped,
    total: rows.length,
    message: `Backfill complete. ${updated} entries embedded, ${skipped} skipped.`,
  });
}
