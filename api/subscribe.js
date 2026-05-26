// api/subscribe.js
// Validates email and writes it to a Notion database.
// Requires NOTION_API_KEY and NOTION_DATABASE_ID env vars on Vercel.

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { email } = req.body || {};
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Valid email required.' });
  }

  const DISPOSABLE_DOMAINS = ['mailinator.com','guerrillamail.com','tempmail.com','throwam.com','sharklasers.com','yopmail.com','trashmail.com','dispostable.com','maildrop.cc','getairmail.com'];
  const domain = email.split('@')[1].toLowerCase();
  if (DISPOSABLE_DOMAINS.includes(domain)) {
    return res.status(400).json({ error: 'Please use a real email address.' });
  }

  const notionKey = process.env.NOTION_API_KEY;
  const dbId = process.env.NOTION_DATABASE_ID;

  // Silently succeed if env vars not yet configured
  if (!notionKey || !dbId) return res.status(200).json({ ok: true });

  try {
    await fetch('https://api.notion.com/v1/pages', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${notionKey}`,
        'Content-Type': 'application/json',
        'Notion-Version': '2022-06-28',
      },
      body: JSON.stringify({
        parent: { database_id: dbId },
        properties: {
          Email: { title: [{ text: { content: email } }] },
          'Signed Up': { date: { start: new Date().toISOString() } },
        },
      }),
    });
  } catch (e) {
    console.error('Notion error:', e);
    // Don't block the user if Notion write fails
  }

  return res.status(200).json({ ok: true });
}
