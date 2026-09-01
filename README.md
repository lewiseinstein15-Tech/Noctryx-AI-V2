# Noctryx

> A public AI model you can talk to.

Noctryx is an AI model — not a personal assistant, not an agent. You chat with it, ask it questions, have it search the internet for you, and study with it. That's it. No fluff, no "operating system" branding, no hidden agenda.

## What Noctryx Does

- **Chat** — Have natural conversations with an AI model. Ask anything.
- **Search** — Noctryx can search the internet and bring you cited, grounded answers.
- **Study** — Ask it to teach you a topic. It explains things clearly and concisely.
- **Code** — Write, debug, and refactor code across languages.
- **Vision** — Upload images and get analysis, OCR, and descriptions.

## What Noctryx Is NOT

Noctryx is **not** a personal AI. It has no memory of you between sessions, no agent capabilities, no autonomous task orchestration. It's a model — you use it, it responds, done.

If you're looking for a multi-agent AI operating system with 200+ specialists, persistent memory, and autonomous workflows, that's [Jexi OS](https://github.com/lewiseinstein15-Tech/jexi-os-) — a separate project that can use Noctryx as its underlying model.

## Tech Stack

- Frontend: Vanilla HTML/CSS/JS (PWA)
- Backend: Node.js (Express)
- AI Providers: Groq, OpenRouter, Cerebras, Gemini, OpenAI (auto-fallback)
- Deployment: Vercel (serverless)

## Quick Start

```bash
# Install
npm install

# Run locally
npm run dev

# Open
open http://localhost:8787
```

Set an API key in Settings (or as environment variables) to enable chat:

```bash
# Any of these work:
export GROQ_API_KEY=gsk_...
export OPENROUTER_API_KEY=sk-or-...
export GEMINI_API_KEY=...
export OPENAI_API_KEY=sk-...
```

## Environment Variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `GROQ_API_KEY` | one of two | Fast chat (Groq free tier) |
| `OPENROUTER_API_KEY` | one of two | Free text via OpenRouter |
| `CEREBRAS_API_KEY` | optional | Cerebras free tier fallback |
| `GEMINI_API_KEY` | optional | Gemini fallback + vision |
| `OPENAI_API_KEY` | optional | OpenAI fallback |

## License

MIT — Free for anyone to use.
