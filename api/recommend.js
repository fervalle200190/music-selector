/*
 * Función de Vercel: recomienda artistas con la API de Claude.
 * La API key vive en la variable de entorno ANTHROPIC_API_KEY y nunca llega al navegador.
 *
 * GET  /api/recommend  -> { ok: true } si la IA está configurada (la página lo usa para mostrar los botones)
 * POST /api/recommend  -> { kind: "discover" | "mood", data: {...} }  ->  { result: [...] }
 */
import { buildPrompt } from "../src/lib/prompts.js";

const MODEL = process.env.ANTHROPIC_MODEL || "claude-haiku-4-5-20251001";

// Límite simple por IP para que nadie use la función como API gratis (se reinicia con cada instancia).
const hits = new Map();
const LIMIT = 20, WINDOW_MS = 10 * 60 * 1000;
function tooMany(ip) {
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > LIMIT;
}

// Solo se aceptan listas cortas de textos cortos: la página nunca manda instrucciones libres.
const str = (v, max = 40) => (typeof v === "string" ? v.replace(/[\u0000-\u001f]/g, " ").trim().slice(0, max) : "");
const strList = (v, n = 60, max = 40) => (Array.isArray(v) ? v.map((x) => str(x, max)).filter(Boolean).slice(0, n) : []);
const pairs = (v) =>
  Array.isArray(v)
    ? v.slice(0, 5).map((p) => [str(p?.[0]), Math.max(0, Math.min(999, Number(p?.[1]) || 0))]).filter((p) => p[0])
    : [];

function clean(kind, d = {}) {
  const h = d.history || {};
  return {
    likes: strList(d.likes),
    passed: strList(d.passed),
    exclude: strList(d.exclude, 150),
    mood: kind === "mood" ? str(d.mood) || "tranquila" : undefined,
    history: { moods: pairs(h.moods), artists: pairs(h.artists), recent: strList(h.recent, 6, 90) },
  };
}

// Toma el primer array JSON de la respuesta, aunque venga con texto alrededor.
function parseArray(text) {
  const start = text.indexOf("["), end = text.lastIndexOf("]");
  if (start === -1 || end <= start) return null;
  try { return JSON.parse(text.slice(start, end + 1)); } catch { return null; }
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method === "GET") {
    return res.status(200).json({ ok: Boolean(process.env.ANTHROPIC_API_KEY) });
  }
  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ code: "method_not_allowed" });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(503).json({ code: "not_configured" });
  }

  const ip = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "local";
  if (tooMany(ip)) return res.status(429).json({ code: "rate_limited" });

  const body = typeof req.body === "string" ? safeJson(req.body) : req.body;
  const kind = body?.kind;
  if (kind !== "discover" && kind !== "mood") return res.status(400).json({ code: "invalid_request" });

  const prompt = buildPrompt(kind, clean(kind, body.data));

  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: kind === "discover" ? 900 : 200,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (r.status === 429) return res.status(429).json({ code: "rate_limited" });
    if (!r.ok) {
      console.error("Anthropic API", r.status, await r.text());
      return res.status(502).json({ code: "upstream_error" });
    }
    const out = await r.json();
    const text = (out.content || []).filter((b) => b.type === "text").map((b) => b.text).join("");
    const result = parseArray(text);
    if (!result) return res.status(502).json({ code: "invalid_json" });
    return res.status(200).json({ result });
  } catch (e) {
    console.error(e);
    return res.status(502).json({ code: "upstream_error" });
  }
}

function safeJson(s) {
  try { return JSON.parse(s); } catch { return null; }
}
