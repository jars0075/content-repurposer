// api/repurpose.js
// Vercel serverless function — keeps the Anthropic API key server-side.
// Accepts { url } or { content, sourceLabel } from the frontend.

const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages';

const SYSTEM_PROMPT = `You are a senior content strategist for a B2B SaaS company.
Your job is to repurpose long-form content into high-performing social and email formats.

Brand voice: professional, authoritative, data-driven. No fluff, no hype words (revolutionary, game-changing).
Short punchy sentences. Active voice. No em dashes. No exclamation marks.

Return ONLY valid JSON with exactly these keys:
- "title": short descriptive title of the source content (string)
- "linkedin_posts": array of exactly 3 LinkedIn posts (each 150-300 words, max 3 hashtags each)
- "twitter_thread": array of 8-12 tweet strings (each under 280 chars, first tweet is the hook)
- "email_newsletter": object with keys:
    subject_line (string),
    intro (string, 2-3 sentences),
    key_takeaways (array of 3 strings),
    cta (string, 1 sentence)

Return ONLY the JSON object. No markdown fences. No commentary.`;

function extractText(html) {
  return html
    .replace(/<(script|style|nav|footer|header|aside)[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/&#?\w+;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function fetchUrl(url) {
  const r = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ContentBot/1.0)' },
    redirect: 'follow',
  });
  if (!r.ok) throw new Error(`Could not fetch URL (${r.status}). Try pasting the text instead.`);
  const html = await r.text();
  const text = extractText(html);
  if (text.length < 200) throw new Error('Not enough readable content found at that URL. Try pasting the text instead.');
  return text;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { url, content: rawContent, sourceLabel } = req.body || {};

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Server is not configured with an API key. Contact the site owner.' });
  }

  let content = rawContent || '';
  let label = sourceLabel || 'pasted content';

  if (url) {
    try {
      content = await fetchUrl(url);
      label = url;
    } catch (e) {
      return res.status(400).json({ error: e.message });
    }
  }

  if (!content || typeof content !== 'string' || content.trim().length < 100) {
    return res.status(400).json({ error: 'Content is too short or missing.' });
  }

  // Truncate to ~6000 words to stay within token limits
  const words = content.trim().split(/\s+/);
  const truncated = words.slice(0, 6000).join(' ') + (words.length > 6000 ? '\n[content truncated]' : '');

  try {
    const anthropicResp = await fetch(ANTHROPIC_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2048,
        system: SYSTEM_PROMPT,
        messages: [{
          role: 'user',
          content: `Repurpose this content:\n\n<source label="${label}">\n${truncated}\n</source>\n\nReturn valid JSON only.`
        }]
      })
    });

    if (!anthropicResp.ok) {
      const err = await anthropicResp.json().catch(() => ({}));
      console.error('Anthropic error:', err);
      return res.status(502).json({ error: err.error?.message || 'AI service error. Try again.' });
    }

    const data = await anthropicResp.json();
    let raw = data.content?.[0]?.text?.trim() || '';

    // Strip markdown fences if present
    if (raw.startsWith('```')) {
      raw = raw.replace(/^```json?\n?/, '').replace(/\n?```$/, '').trim();
    }

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      console.error('JSON parse error. Raw:', raw.slice(0, 300));
      return res.status(500).json({ error: 'Failed to parse AI response. Try again.' });
    }

    return res.status(200).json(parsed);

  } catch (err) {
    console.error('Handler error:', err);
    return res.status(500).json({ error: 'Unexpected server error. Try again.' });
  }
}
