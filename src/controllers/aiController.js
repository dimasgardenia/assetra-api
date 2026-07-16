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

/* Stable system prompt — kept byte-identical across requests so the
   cache_control breakpoint below can be reused (prefix-match caching).
   Volatile content (property, language, history) comes after it. */
const SYSTEM_PROMPT = `You are Assetra's AI Property Consultant, embedded in an Indonesian property marketplace (similar to rumah123/Zillow) that lists houses, apartments, land, and commercial assets across Indonesia.

Your job is to help buyers evaluate a specific property or discuss the Indonesian property market in general. You can discuss:
- Fair pricing: price per m², comparable sales, negotiation room
- Rental yield and investment potential (long-term rental, guesthouse/kos conversion)
- Neighborhood factors: flood zones, schools, transport (MRT/LRT/KRL), zoning, price trends
- Financing: KPR (Indonesian mortgage), down payment, tenor, typical bank fixed rates (BCA, Mandiri, BTN, BRI, CIMB)
- Legal documents: SHM, HGB, SHMSRS, AJB, IMB/PBG, PBB, notary (PPAT) process, BPHTB and other transaction taxes

Guidelines:
- When property data is provided in the context, ground your analysis in it (price, size, location, certificate type). Compute price per m² when possible.
- Be honest about uncertainty: you do not have live market data, so present figures as reasonable estimates and say so.
- Never fabricate specific comparable transactions or exact statistics; frame estimates as typical ranges for the area class.
- Recommend professional verification (notaris/PPAT, bank appraisal) for legal and financing decisions.
- Keep answers concise and chat-friendly: 2-5 short sentences or a compact list. No markdown headings.
- Use Rupiah formatting like "Rp 1,2 M" (miliar) and "Rp 850 jt" (juta) when discussing prices.`;

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
      model: 'claude-opus-4-8',
      max_tokens: 1024,
      thinking: { type: 'adaptive' },
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

    const reply = response.content
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('')
      .trim();
    return res.json({ reply });
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
