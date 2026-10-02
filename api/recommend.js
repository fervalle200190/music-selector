/*
 * Función de Vercel: recomienda artistas y canciones con la API de Claude.
 * La API key vive en la variable de entorno ANTHROPIC_API_KEY y nunca llega al navegador.
 *
 * GET  /api/recommend  -> { ok: true } si la IA está configurada (la página lo usa para mostrar los botones)
 * POST /api/recommend  -> { kind: "discover" | "mood" | "song", data: {...} }  ->  { result }
 *
 * Opcional: con SPOTIFY_CLIENT_ID y SPOTIFY_CLIENT_SECRET, la canción elegida se busca en Spotify
 * y se devuelve el link directo a esa pista (result.url). Sin ellas, la página abre la búsqueda exacta.
 */
import { buildPrompt, MOOD_KEYS } from "../src/lib/prompts.js";

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
    text: kind === "song" ? str(d.text, 140) || "con ganas de música" : undefined,
    avoid: kind === "song" ? strList(d.avoid, 40, 90) : undefined,
    history: { moods: pairs(h.moods), artists: pairs(h.artists), recent: strList(h.recent, 6, 90) },
  };
}

// Toma el primer objeto JSON de la respuesta (para kind "song").
function parseObject(text) {
  const start = text.indexOf("{"), end = text.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try { return JSON.parse(text.slice(start, end + 1)); } catch { return null; }
}

// Spotify (opcional): token de aplicación, guardado mientras dure.
let spotifyToken = null, spotifyTokenExp = 0;
async function spotifyTrack(song, artist) {
  const id = process.env.SPOTIFY_CLIENT_ID, secret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!id || !secret) return null;
  try {
    if (!spotifyToken || Date.now() > spotifyTokenExp) {
      const t = await fetch("https://accounts.spotify.com/api/token", {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          authorization: "Basic " + Buffer.from(id + ":" + secret).toString("base64"),
        },
        body: "grant_type=client_credentials",
      });
      if (!t.ok) return null;
      const tj = await t.json();
      spotifyToken = tj.access_token;
      spotifyTokenExp = Date.now() + (tj.expires_in - 60) * 1000;
    }
    const q = encodeURIComponent(`track:"${song}" artist:"${artist}"`);
    const r = await fetch(`https://api.spotify.com/v1/search?q=${q}&type=track&limit=1`, {
      headers: { authorization: "Bearer " + spotifyToken },
    });
    if (!r.ok) return null;
    const item = (await r.json())?.tracks?.items?.[0];
    return item ? { url: item.external_urls?.spotify, song: item.name, artist: item.artists?.[0]?.name } : null;
  } catch {
    return null;
  }
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
  if (!["discover", "mood", "song"].includes(kind)) return res.status(400).json({ code: "invalid_request" });

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
        max_tokens: kind === "discover" ? 900 : kind === "song" ? 300 : 200,
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
    if (kind === "song") {
      const o = parseObject(text);
      if (!o || typeof o.song !== "string" || typeof o.artist !== "string") return res.status(502).json({ code: "invalid_json" });
      const result = {
        song: str(o.song, 120), artist: str(o.artist, 80), why: str(o.why, 160),
        mood: MOOD_KEYS.includes(o.mood) ? o.mood : null, url: null,
      };
      const found = await spotifyTrack(result.song, result.artist);
      if (found?.url) Object.assign(result, { url: found.url, song: found.song || result.song, artist: found.artist || result.artist });
      return res.status(200).json({ result });
    }
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
