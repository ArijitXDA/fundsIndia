// ─────────────────────────────────────────────────────────────────────────────
// lib/agent/embeddings.ts
// OpenAI embedding helpers for pgvector semantic search.
//
// Model: text-embedding-3-small (1536 dimensions)
//   - ~$0.02 per 1M tokens — effectively free at this scale
//   - Significantly better than ada-002, same dimensions
//
// Usage:
//   const vec = await embedText("What is my MTD sales?");
//   // Returns number[] | null (null if API call fails gracefully)
// ─────────────────────────────────────────────────────────────────────────────

import { supabaseAdmin } from '@/lib/supabase';

const OPENAI_EMBED_URL = 'https://api.openai.com/v1/embeddings';
const EMBED_MODEL      = 'text-embedding-3-small';
const EMBED_DIMS       = 1536;

// ── Core embedding function ───────────────────────────────────────────────────

/**
 * Generate an embedding vector for a piece of text.
 * Returns null on failure (caller should degrade gracefully — skip semantic
 * search and fall back to recency-based retrieval).
 */
export async function embedText(text: string): Promise<number[] | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  // Truncate at ~8000 chars to stay within token limits
  const input = text.trim().slice(0, 8000);
  if (!input) return null;

  try {
    const res = await fetch(OPENAI_EMBED_URL, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model:      EMBED_MODEL,
        input,
        dimensions: EMBED_DIMS,
      }),
    });

    if (!res.ok) {
      console.warn(`[embeddings] OpenAI embed failed ${res.status}`);
      return null;
    }

    const data = await res.json();
    return data.data?.[0]?.embedding ?? null;
  } catch (err: any) {
    console.warn('[embeddings] embed error:', err.message);
    return null;
  }
}

/**
 * Batch embed multiple texts in a single OpenAI call.
 * Returns array of vectors in same order as input (null for any that failed).
 */
export async function embedBatch(texts: string[]): Promise<(number[] | null)[]> {
  if (texts.length === 0) return [];
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return texts.map(() => null);

  const inputs = texts.map(t => t.trim().slice(0, 8000));

  try {
    const res = await fetch(OPENAI_EMBED_URL, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model:      EMBED_MODEL,
        input:      inputs,
        dimensions: EMBED_DIMS,
      }),
    });

    if (!res.ok) {
      console.warn(`[embeddings] batch embed failed ${res.status}`);
      return texts.map(() => null);
    }

    const data = await res.json();
    // data.data is an array sorted by index
    const vectors: (number[] | null)[] = texts.map(() => null);
    for (const item of (data.data ?? [])) {
      if (typeof item.index === 'number') {
        vectors[item.index] = item.embedding ?? null;
      }
    }
    return vectors;
  } catch (err: any) {
    console.warn('[embeddings] batch embed error:', err.message);
    return texts.map(() => null);
  }
}

// ── Semantic memory retrieval ─────────────────────────────────────────────────

export interface SemanticMemoryItem {
  memory_key:   string;
  memory_value: string;
  memory_type:  string;
  similarity:   number;
}

/**
 * Retrieve the most semantically relevant memories for an employee.
 * Falls back to empty array if pgvector / embedding fails.
 *
 * @param employeeId  - UUID of the employee
 * @param queryText   - The user's current message (used for embedding)
 * @param limit       - Max memories to return (default 8)
 */
export async function getSemanticMemories(
  employeeId: string,
  queryText:  string,
  limit       = 8
): Promise<SemanticMemoryItem[]> {
  // 1. Embed the user query
  const embedding = await embedText(queryText);
  if (!embedding) {
    // Fall back — caller will use recency-based retrieval
    return [];
  }

  // 2. Call the Supabase RPC function
  try {
    const { data, error } = await supabaseAdmin.rpc('search_agent_memory', {
      p_employee_id:     employeeId,
      p_query_embedding: embedding,
      p_limit:           limit,
      p_min_similarity:  0.25,
    });

    if (error) {
      console.warn('[embeddings] search_agent_memory RPC error:', error.message);
      return [];
    }

    return (data ?? []).map((row: any) => ({
      memory_key:   row.key,
      memory_value: row.value,
      memory_type:  row.memory_type,
      similarity:   row.similarity,
    }));
  } catch (err: any) {
    console.warn('[embeddings] getSemanticMemories error:', err.message);
    return [];
  }
}

// ── Knowledge base retrieval ─────────────────────────────────────────────────

export interface KnowledgeChunk {
  id:         string;
  title:      string;
  content:    string;
  category:   string;
  source:     string | null;
  similarity: number;
}

/**
 * Search the agent knowledge base for chunks relevant to the user's query.
 * Returns top-k results (default 4). Falls back to empty array on error.
 *
 * @param queryText   - The user's current message
 * @param limit       - Max chunks to return (default 4)
 * @param category    - Optional filter: 'product'|'policy'|'faq'|'contest'|'general'
 */
export async function searchKnowledgeBase(
  queryText: string,
  limit      = 4,
  category?: string
): Promise<KnowledgeChunk[]> {
  const embedding = await embedText(queryText);
  if (!embedding) return [];

  try {
    const { data, error } = await supabaseAdmin.rpc('search_knowledge_base', {
      p_query_embedding: embedding,
      p_limit:           limit,
      p_min_similarity:  0.30,
      p_category:        category ?? null,
    });

    if (error) {
      console.warn('[embeddings] search_knowledge_base RPC error:', error.message);
      return [];
    }

    return (data ?? []).map((row: any) => ({
      id:         row.id,
      title:      row.title,
      content:    row.content,
      category:   row.category,
      source:     row.source ?? null,
      similarity: row.similarity,
    }));
  } catch (err: any) {
    console.warn('[embeddings] searchKnowledgeBase error:', err.message);
    return [];
  }
}

// ── Upsert embedding on memory save ─────────────────────────────────────────

/**
 * After saving a new memory entry, backfill its embedding asynchronously.
 * Fire-and-forget — called from save_memory tool without awaiting.
 */
export async function backfillMemoryEmbedding(
  employeeId: string,
  key:        string,
  text:       string
): Promise<void> {
  const embedding = await embedText(text);
  if (!embedding) return;

  const { error } = await supabaseAdmin
    .from('agent_memory')
    .update({ embedding })
    .eq('employee_id', employeeId)
    .eq('key', key);

  if (error) {
    console.warn('[embeddings] backfillMemoryEmbedding error:', error.message);
  }
}

/**
 * Backfill embeddings for ALL existing memories of an employee that have no embedding yet.
 * Call this once from an admin route to seed initial embeddings.
 */
export async function backfillAllMemoriesForEmployee(employeeId: string): Promise<number> {
  const { data: rows } = await supabaseAdmin
    .from('agent_memory')
    .select('key, value')
    .eq('employee_id', employeeId)
    .is('embedding', null);

  if (!rows || rows.length === 0) return 0;

  const texts = rows.map(r => `${r.key}: ${r.value}`);
  const embeddings = await embedBatch(texts);

  let updated = 0;
  for (let i = 0; i < rows.length; i++) {
    const vec = embeddings[i];
    if (!vec) continue;
    const { error } = await supabaseAdmin
      .from('agent_memory')
      .update({ embedding: vec })
      .eq('employee_id', employeeId)
      .eq('key', rows[i].key);
    if (!error) updated++;
  }
  return updated;
}

/**
 * Compute and upsert embedding for a knowledge base entry by ID.
 * Called when inserting a new knowledge chunk via admin panel.
 */
export async function embedKnowledgeChunk(id: string, text: string): Promise<void> {
  const embedding = await embedText(text);
  if (!embedding) return;

  const { error } = await supabaseAdmin
    .from('agent_knowledge_base')
    .update({ embedding })
    .eq('id', id);

  if (error) {
    console.warn('[embeddings] embedKnowledgeChunk error:', error.message);
  }
}
