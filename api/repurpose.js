// api/repurpose.js
// Vercel serverless function — keeps the Anthropic API key server-side.
// Receives { content, sourceLabel } from the frontend, returns repurposed JSON.

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

export default async function handler(req, res) {
  // CORS — allow your frontend origin in production
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { content, sourceLabel } = req.body || {};

  if (!content || typeof content !== 'string' || content.trim().length < 100) {
    return res.status(400).json({ error: 'Content is too short or missing.' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Server is not configured with an API key. Contact the site owner.' });
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
        model: 'claude-opus-4-6',
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        messages: [{
          role: 'user',
          content: `Repurpose this content:\n\n<source label="${sourceLabel || 'unknown'}">\n${truncated}\n</source>\n\nReturn valid JSON only.`
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
