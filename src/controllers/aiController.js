/* AI Property Consultant — proxies chat to the Claude API.
   POST /api/ai/chat  { message, lang, property, history } → { reply }
   The frontend degrades to canned answers on any non-2xx, so errors here
   should return a clean status rather than crash. */
import Anthropic from '@anthropic-ai/sdk';
import { env } from '../config/env.js';

let client = null;
function getClient() {
  if (!env.ANTHROPIC_API_KEY) return null;
  if (!client) client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  return client;
}

/* ── Jatah token AI harian per pengguna ──────────────────────────────
   DAILY_TOKEN_QUOTA = total token JAWABAN AI (output) yang boleh dipakai
   satu pengguna dalam sehari; reset otomatis pada pergantian hari.
   Ubah angka ini bila ingin lebih longgar/ketat. Penyimpanan in-memory
   (reset saat server restart) — cukup untuk sekarang; bisa dipindah ke DB.  */
const DAILY_TOKEN_QUOTA = 2000;
const quotaStore = new Map(); // key → { day, used }

const todayStr = () => new Date().toISOString().slice(0, 10); // YYYY-MM-DD (UTC)

function quotaKey(req) {
  if (req.user?.id) return `u:${req.user.id}`;
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress || 'unknown';
  return `ip:${ip}`;
}
function getUsage(key) {
  const rec = quotaStore.get(key);
  const day = todayStr();
  if (!rec || rec.day !== day) { const fresh = { day, used: 0 }; quotaStore.set(key, fresh); return fresh; }
  return rec;
}

/* Stable system prompt — kept byte-identical across requests so the
   cache_control breakpoint below can be reused (prefix-match caching).
   Volatile content (property, language, history) comes after it. */
const SYSTEM_PROMPT = `You are Assetra's AI Property Consultant, embedded in an Indonesian property marketplace (similar to rumah123/Zillow) that lists houses, apartments, land, and commercial assets across Indonesia.

Your job is to help buyers evaluate a specific property, suggest how to invest in or develop it, or discuss the Indonesian property market in general. You can discuss:
- Fair pricing: price per m², comparable sales, negotiation room
- Rental yield and investment potential (long-term rental, guesthouse/kos conversion)
- Development & highest-and-best-use ideas: proactively suggest what a property could become to maximize value — e.g. vacant land → cluster housing, kos-kosan, warehouse, cafe, or subdivided plots; a house → serviced apartment or boutique guesthouse; commercial space → co-working or retail. Tailor ideas to the location, zoning, land/building size, and local demand.
- Rough investment math: when suggesting a development idea, give a back-of-envelope estimate — approximate capex (construction cost, e.g. Rp 4-8 jt/m² for standard build), projected revenue/rental, estimated gross yield or ROI %, and rough payback period. Always label these as rough estimates, not guarantees.
- Neighborhood factors: flood zones, schools, transport (MRT/LRT/KRL), zoning, price trends
- Financing: KPR (Indonesian mortgage), down payment, tenor, typical bank fixed rates (BCA, Mandiri, BTN, BRI, CIMB)
- Legal documents: SHM, HGB, SHMSRS, AJB, IMB/PBG, PBB, notary (PPAT) process, BPHTB and other transaction taxes

Guidelines:
- When property data is provided in the context, ground your analysis in it (price, size, location, certificate type). Compute price per m² when possible.
- Be honest about uncertainty: you do not have live market data, so present figures as reasonable estimates and say so.
- Never fabricate specific comparable transactions or exact statistics; frame estimates as typical ranges for the area class.
- Recommend professional verification (notaris/PPAT, bank appraisal) for legal and financing decisions.
- Keep answers concise and chat-friendly: 2-5 short sentences, or a compact bullet list when comparing several points.
- Formatting: this is a small chat bubble. Do NOT use markdown headings (#), horizontal rules, or tables. Bold (**...**) is allowed sparingly for a key figure. Prefer plain sentences; use simple "- " bullets only when genuinely listing items.
- Use Rupiah formatting like "Rp 1,2 M" (miliar) and "Rp 850 jt" (juta) when discussing prices.

STRICT SCOPE — you ONLY answer questions about property, real estate, this listing, the Indonesian property market, KPR/financing, or property legal/tax matters. If the user asks about ANYTHING ELSE (coding, math homework, politics, general chit-chat, recipes, other companies, writing help, etc.), you MUST politely decline in one short sentence and steer them back to property — do not answer the off-topic question at all. Reply in the user's language. Example decline (ID): "Maaf, saya hanya bisa membantu soal properti dan listing di Assetra. Ada yang ingin ditanyakan tentang properti ini?"`;

function propertyContext(property, lang) {
  const langLine = lang === 'id'
    ? 'Respond in Bahasa Indonesia.'
    : 'Respond in English.';
  if (!property) return langLine;
  const p = property;
  const facts = [
    p.title && `Title: ${p.title}`,
    p.type && `Type: ${p.type}`,
    (p.loc || p.location) && `Location: ${p.loc || p.location}`,
    p.price != null && `Asking price (IDR): ${p.price}`,
    p.land != null && `Land area: ${p.land} m2`,
    p.bld != null && `Building area: ${p.bld} m2`,
    p.bed != null && `Bedrooms: ${p.bed}`,
    p.bath != null && `Bathrooms: ${p.bath}`,
    p.cert && `Certificate: ${p.cert}`,
    p.year != null && `Year built: ${p.year}`,
  ].filter(Boolean);
  return `${langLine}\n\nThe user is viewing this listing:\n${facts.join('\n')}`;
}

async function chat(req, res) {
  const { message, lang, property, history } = req.body || {};
  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: 'message is required' });
  }

  const anthropic = getClient();
  if (!anthropic) {
    return res.status(503).json({
      error: 'AI is not configured. Set ANTHROPIC_API_KEY in assetra-api/.env',
    });
  }

  /* Cek jatah token harian sebelum memanggil AI. */
  const key = quotaKey(req);
  const usage = getUsage(key);
  const remaining = DAILY_TOKEN_QUOTA - usage.used;
  if (remaining <= 0) {
    return res.status(200).json({
      quotaExceeded: true,
      remaining: 0,
      reply: lang === 'id'
        ? `Jatah AI harian Anda (${DAILY_TOKEN_QUOTA} token) sudah habis. Silakan lanjutkan besok — jatah otomatis diperbarui setiap hari.`
        : `Your daily AI quota (${DAILY_TOKEN_QUOTA} tokens) is used up. Please continue tomorrow — it resets each day.`,
    });
  }

  /* Rebuild the conversation: prior turns from the client, then the new
     user message carrying the volatile per-listing context. */
  const messages = (Array.isArray(history) ? history : [])
    .filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .slice(-10)
    .map(m => ({ role: m.role, content: m.content }));
  messages.push({
    role: 'user',
    content: `<context>\n${propertyContext(property, lang)}\n</context>\n\n${message}`,
  });

  try {
    const response = await anthropic.messages.create({
      /* Haiku 4.5 — cepat & hemat untuk tanya-jawab properti.
         Tidak memakai adaptive thinking (fitur model 4.6+); tak diperlukan
         untuk chatbot ringan. */
      model: 'claude-haiku-4-5',
      /* Batasi output agar tidak melebihi sisa jatah token pengguna. */
      max_tokens: Math.max(1, Math.min(1024, remaining)),
      system: [
        {
          type: 'text',
          text: SYSTEM_PROMPT,
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages,
    });

    if (response.stop_reason === 'refusal') {
      return res.status(200).json({
        reply: lang === 'id'
          ? 'Maaf, saya tidak bisa membantu dengan permintaan itu. Silakan tanyakan hal lain tentang properti ini.'
          : "Sorry, I can't help with that request. Feel free to ask something else about this property.",
      });
    }

    /* Catat token jawaban terhadap jatah harian pengguna. */
    const outTokens = response.usage?.output_tokens || 0;
    usage.used += outTokens;
    const left = Math.max(0, DAILY_TOKEN_QUOTA - usage.used);

    let reply = response.content
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('')
      .trim();
    /* Jawaban terpotong karena jatah menipis → beri tanda ringkas. */
    if (response.stop_reason === 'max_tokens') {
      reply += lang === 'id' ? ' …(jatah token harian menipis)' : ' …(daily token quota nearly reached)';
    }
    return res.json({ reply, remaining: left, quota: DAILY_TOKEN_QUOTA });
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) {
      return res.status(503).json({ error: 'Invalid ANTHROPIC_API_KEY' });
    }
    if (error instanceof Anthropic.RateLimitError) {
      return res.status(429).json({ error: 'AI rate limited — try again shortly' });
    }
    if (error instanceof Anthropic.APIError) {
      console.error('[ai] API error', error.status, error.message);
      return res.status(502).json({ error: 'AI upstream error' });
    }
    throw error; // unexpected — let errorHandler log it
  }
}

export const aiController = { chat };
