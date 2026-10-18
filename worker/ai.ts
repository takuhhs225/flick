import { Hono } from 'hono';
import type { Env, Vars } from './types';
import { requireUser } from './auth';

const DEFAULT_MODEL = '@cf/google/gemma-4-26b-a4b-it';
const DAILY_LIMIT = 60;
const MAX_INPUT = 500;

export const ai = new Hono<{ Bindings: Env; Variables: Vars }>();
ai.use('*', requireUser);

/** モデルによって返却形式が違う (旧: {response}, 新: OpenAI 互換 choices[]) ため両対応にする */
export function extractText(res: unknown): string {
  if (typeof res === 'string') return res;
  if (!res || typeof res !== 'object') return '';
  const r = res as {
    response?: unknown;
    choices?: { message?: { content?: unknown }; text?: unknown }[];
  };
  if (typeof r.response === 'string') return r.response;
  const choice = r.choices?.[0];
  const content = choice?.message?.content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content.map((p) => (p && typeof p === 'object' && 'text' in p ? String((p as { text: unknown }).text) : '')).join('');
  }
  if (typeof choice?.text === 'string') return choice.text;
  return '';
}

export function parseTitle(raw: string): string | null {
  const line = raw
    .replace(/```[a-z]*\n?|```/gi, '')
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l.length > 0);
  if (!line) return null;
  const t = line
    .replace(/^(タスク名|タイトル|title)\s*[:：]\s*/i, '')
    .replace(/^[-*・\d.)\s]+/, '')
    .replace(/^["'「『“]+|["'」』”]+$/g, '')
    .trim();
  return t.length >= 1 ? t.slice(0, 120) : null;
}

export function parseSteps(raw: string): string[] {
  let items: unknown[] = [];
  const m = raw.match(/\[[\s\S]*\]/);
  if (m) {
    try {
      const parsed = JSON.parse(m[0]);
      if (Array.isArray(parsed)) items = parsed;
    } catch {
      /* 行ベースにフォールバック */
    }
  }
  if (items.length === 0) {
    items = raw
      .split('\n')
      .map((l) => l.replace(/^[\s\-*・\d.)]+/, '').trim())
      .filter((l) => l && !l.startsWith('```') && !/^[[\]{}]$/.test(l));
  }
  const seen = new Set<string>();
  const out: string[] = [];
  for (const it of items) {
    if (typeof it !== 'string') continue;
    const s = it.replace(/\s+/g, ' ').trim().slice(0, 120);
    if (s && !seen.has(s)) {
      seen.add(s);
      out.push(s);
    }
    if (out.length >= 6) break;
  }
  return out;
}

async function charge(c: { env: Env; get: (k: 'user') => { id: string } }): Promise<boolean> {
  const day = new Date().toISOString().slice(0, 10);
  const row = await c.env.DB.prepare(
    `INSERT INTO ai_usage (user_id, day, count) VALUES (?1, ?2, 1)
     ON CONFLICT(user_id, day) DO UPDATE SET count = count + 1
     RETURNING count`,
  )
    .bind(c.get('user').id, day)
    .first<{ count: number }>();
  return (row?.count ?? 0) <= DAILY_LIMIT;
}

async function run(env: Env, system: string, user: string): Promise<string> {
  if (!env.AI) throw new Error('ai_unavailable');
  const res = await env.AI.run((env.AI_MODEL || DEFAULT_MODEL) as keyof AiModels, {
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    // 推論(thinking)対応モデルは、考える分のトークンで上限を使い切ると本文が空になる。
    // 考える機能は切り、上限にも余裕を持たせる(未対応のモデルでは無視される)。
    max_completion_tokens: 2048,
    chat_template_kwargs: { enable_thinking: false },
    temperature: 0.3,
  } as never);
  const text = extractText(res);
  if (!text.trim()) {
    // 原因調査用(`wrangler tail` で確認できる): 返却の形だけを記録し、本文は残さない
    console.error('ai empty output', JSON.stringify(res, (_k, v) => (typeof v === 'string' ? v.slice(0, 80) : v)).slice(0, 1500));
  }
  return text;
}

async function readText(c: { req: { json: () => Promise<unknown> } }): Promise<string | null> {
  const body = (await c.req.json().catch(() => null)) as { text?: unknown } | null;
  if (!body || typeof body.text !== 'string') return null;
  const t = body.text.replace(/\s+/g, ' ').trim();
  return t.length >= 1 && t.length <= MAX_INPUT ? t : null;
}

/** メモを実行しやすい短いタスク名に整える */
ai.post('/refine', async (c) => {
  const text = await readText(c);
  if (!text) return c.json({ error: 'invalid_text' }, 400);
  if (!c.env.AI) return c.json({ error: 'ai_unavailable' }, 503);
  if (!(await charge(c))) return c.json({ error: 'rate_limited' }, 429);

  try {
    const out = await run(
      c.env,
      'あなたはタスク管理アシスタントです。ユーザーのメモを、動詞で終わる簡潔で実行可能なタスク名に書き直してください。' +
        '40文字以内・1行。入力と同じ言語で書く。説明・記号・引用符は付けず、タスク名だけを出力する。',
      text,
    );
    const title = parseTitle(out);
    if (!title) return c.json({ error: 'ai_empty' }, 502);
    return c.json({ title });
  } catch (e) {
    console.error('ai refine failed', e);
    return c.json({ error: 'ai_failed' }, 502);
  }
});

/** タスクを実行順の小さなサブタスクに分解する */
ai.post('/breakdown', async (c) => {
  const text = await readText(c);
  if (!text) return c.json({ error: 'invalid_text' }, 400);
  if (!c.env.AI) return c.json({ error: 'ai_unavailable' }, 503);
  if (!(await charge(c))) return c.json({ error: 'rate_limited' }, 429);

  try {
    const out = await run(
      c.env,
      'あなたはタスク管理アシスタントです。与えられたタスクを、実行順に並んだ3〜5個の小さなサブタスクに分解してください。' +
        '各サブタスクは40文字以内。入力と同じ言語で書く。出力はJSONの文字列配列のみ。例: ["…","…","…"]',
      text,
    );
    const steps = parseSteps(out);
    if (steps.length < 2) return c.json({ error: 'ai_empty' }, 502);
    return c.json({ steps });
  } catch (e) {
    console.error('ai breakdown failed', e);
    return c.json({ error: 'ai_failed' }, 502);
  }
});
