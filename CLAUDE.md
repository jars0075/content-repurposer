# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Architecture

Two-file Vercel project — no build step, no package.json:

- **`index.html`** — single-page app, all JS inline. Handles URL fetching via the `allorigins.win` proxy, calls `/api/repurpose`, and renders tabbed output (LinkedIn / Twitter / Email).
- **`api/repurpose.js`** — Vercel serverless function (ESM `export default`). Receives `{ content, sourceLabel }`, calls the Anthropic Messages API, parses the JSON response, and returns structured content. The Anthropic API key is kept server-side here.
- **`vercel.json`** — sets the function timeout to 30s.

## Deployment

Push to `main` on GitHub — Vercel auto-deploys. For manual deploy:

```
npx vercel --prod
```

**Required env var on Vercel:** `ANTHROPIC_API_KEY` (set under Project → Settings → Environment Variables).

## Key constraints

- **No `Co-Authored-By:` in commit messages** — Vercel interprets it as a team account and halts deployment.
- Model in use: `claude-haiku-4-5-20251001`. Must stay fast — Vercel's function timeout is tight. Do not switch to Sonnet or Opus (too slow, causes 504).
- The serverless function must stay under 30s total (Anthropic call + parsing). Input is truncated to 6000 words before sending.
- The frontend calls `resp.ok` before `resp.json()` — keep this order to handle non-JSON gateway errors gracefully.
