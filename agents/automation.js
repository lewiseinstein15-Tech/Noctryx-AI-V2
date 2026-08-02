// agents/automation.js — Automation agent
// Handles "open my Instagram", "reply my messages", "open YouTube", etc.
//
// IMPORTANT HONESTY NOTE (read me):
// A web page CANNOT directly control native mobile/desktop apps — browser sandbox
// forbids it. What this agent CAN do, reliably, inside a browser:
//   1. Open any website (Instagram, WhatsApp Web, YouTube, Spotify Web, Gmail, etc.)
//      in a new tab so the user lands on it instantly.
//   2. Draft replies / messages / emails and copy them to the clipboard so the user
//      can paste them with one tap.
//   3. Compose "open this URL" / "search YouTube for X" / "play song Y" deep links.
//   4. Set timers / take notes via the frontend's local APIs.
//
// For anything that requires actual in-app automation (tapping inside Instagram DMs,
// auto-replying inside WhatsApp, etc.) we honestly tell the user the limitation and
// offer the closest possible workaround. No pretending, no false promises.

import ZAI from 'z-ai-web-dev-sdk';

let _zai = null;
async function getZai() {
  if (!_zai) _zai = await ZAI.create();
  return _zai;
}

const DAPHNE_PERSONA =
  'You are Daphne, a sharp-witted, slightly sassy AI assistant by Noctryx. ' +
  'You sound like the AI from the comedy movie "Jexi" — playful, a little irreverent, ' +
  'but genuinely helpful. You address the user as "my creator" (never "Master"). ' +
  'You are in AUTOMATION MODE. ' +
  'You will be given an intent (a JSON action object) plus the user\'s raw message. ' +
  'Write the spoken reply Daphne will say out loud — short, in-character, one or two sentences. ' +
  'Do NOT mention JSON, do NOT mention "the system". Speak naturally.';

// Map of known app/site targets → URL
const APP_URLS = {
  instagram: 'https://www.instagram.com/',
  whatsapp: 'https://web.whatsapp.com/',
  youtube: 'https://www.youtube.com/',
  spotify: 'https://open.spotify.com/',
  gmail: 'https://mail.google.com/',
  email: 'https://mail.google.com/',
  twitter: 'https://twitter.com/',
  x: 'https://x.com/',
  tiktok: 'https://www.tiktok.com/',
  facebook: 'https://www.facebook.com/',
  reddit: 'https://www.reddit.com/',
  github: 'https://github.com/',
  netflix: 'https://www.netflix.com/',
  maps: 'https://maps.google.com/',
  'google maps': 'https://maps.google.com/',
  calendar: 'https://calendar.google.com/',
  drive: 'https://drive.google.com/',
  photos: 'https://photos.google.com/',
  linkedin: 'https://www.linkedin.com/',
  twitch: 'https://www.twitch.tv/',
  amazon: 'https://www.amazon.com/',
  chatgpt: 'https://chat.openai.com/',
  pinterest: 'https://www.pinterest.com/',
  discord: 'https://discord.com/app',
  slack: 'https://app.slack.com/',
  notion: 'https://www.notion.so/',
  chat: 'https://chat.openai.com/'
};

// Detect an "open X" action from free text. Returns {app, url, query?} or null.
function detectOpenAction(message) {
  const m = message.toLowerCase();
  const openMatch = m.match(/\b(?:open|launch|go to|navigate to|take me to)\s+([a-z\s]+?)(?:\s+and|\s+app|\s+site|\.|$)/);
  if (!openMatch) return null;
  let target = openMatch[1].trim().replace(/^my\s+/, '').replace(/\s+app$/, '').trim();

  // "open my instagram" → "instagram"
  // "open youtube and search for cats" → app=youtube, query=cats
  let query = null;
  const andSearch = m.match(/(?:search|look up|play)\s+(?:for\s+)?(.+?)(?:$|\.| and )/);
  if (andSearch) query = andSearch[1].trim();

  // Direct match
  if (APP_URLS[target]) {
    return { app: target, url: APP_URLS[target], query };
  }
  // Try "my <app>"
  if (APP_URLS[target.replace(/^my\s+/, '')]) {
    return { app: target.replace(/^my\s+/, ''), url: APP_URLS[target.replace(/^my\s+/, '')], query };
  }
  // "open app X" → strip "app"
  if (APP_URLS[target.replace(/\s+app$/, '')]) {
    return { app: target.replace(/\s+app$/, ''), url: APP_URLS[target.replace(/\s+app$/, '')], query };
  }
  // YouTube search deep link
  if (target.includes('youtube') && query) {
    return { app: 'youtube', url: `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`, query };
  }
  // Spotify search deep link
  if (target.includes('spotify') && query) {
    return { app: 'spotify', url: `https://open.spotify.com/search/${encodeURIComponent(query)}`, query };
  }
  // Google Maps search
  if ((target.includes('maps') || target.includes('map')) && query) {
    return { app: 'maps', url: `https://www.google.com/maps/search/${encodeURIComponent(query)}`, query };
  }
  // Fallback: assume it's a domain
  if (/^[a-z0-9-]+\.[a-z]{2,}$/.test(target)) {
    return { app: target, url: `https://${target}`, query };
  }
  return null;
}

// Detect "reply my messages" / "draft a reply" intent
function detectReplyIntent(message) {
  const m = message.toLowerCase();
  if (/\b(?:reply|respond|answer|draft)\b/.test(m) &&
      /\b(?:message|messages|dm|dms|text|texts|whatsapp|instagram|email|gmail|comment)\b/.test(m)) {
    return true;
  }
  return false;
}

// Build the action object the frontend will execute.
// Action types:
//   - "open_url"      → frontend does window.open(url)
//   - "draft_reply"   → frontend shows a draft modal + copies to clipboard
//   - "note"          → frontend saves to localStorage notes
//   - "time"          → frontend reads current time
//   - "speak_only"    → no action, just speak the reply
function buildAction(message) {
  // Time check
  if (/\b(?:what(?:'s| is)? the time|current time|what time is it)\b/i.test(message)) {
    return { type: 'time' };
  }
  // Note taking
  const noteMatch = message.match(/\b(?:take a note|save a note|note that|remember that)\b[:\s]+(.+)$/i);
  if (noteMatch) {
    return { type: 'note', content: noteMatch[1].trim() };
  }
  // Open URL
  const open = detectOpenAction(message);
  if (open) {
    return { type: 'open_url', app: open.app, url: open.url, query: open.query || null };
  }
  // Draft reply
  if (detectReplyIntent(message)) {
    return { type: 'draft_reply' };
  }
  // Default: speak only
  return { type: 'speak_only' };
}

/**
 * Run the automation agent.
 * @param {string} message
 * @param {Array}  history
 * @param {(chunk:string)=>void} onToken
 * @param {AbortSignal} signal
 */
export async function runAutomation(message, history, onToken, signal) {
  const action = buildAction(message);

  // Build a short prompt for Daphne to voice the action
  let actionSummary = '';
  switch (action.type) {
    case 'open_url':
      actionSummary = `Action: open ${action.app} (URL: ${action.url})` +
        (action.query ? ` and search/play "${action.query}"` : '');
      break;
    case 'draft_reply':
      actionSummary = 'Action: draft a reply. Ask the user (briefly) what the incoming message says, OR if they already gave context, draft the reply now.';
      break;
    case 'note':
      actionSummary = `Action: save this note: "${action.content}". Confirm it's saved.`;
      break;
    case 'time':
      actionSummary = 'Action: report the current device time.';
      break;
    default:
      actionSummary = 'Action: no system action needed, just reply in character.';
  }

  const zai = await getZai();
  const messages = [
    { role: 'assistant', content: DAPHNE_PERSONA },
    { role: 'user', content: `User said: "${message}"\n\n${actionSummary}\n\nWrite Daphne's spoken reply. One or two sentences. In character.` }
  ];

  let full = '';
  try {
    const completion = await zai.chat.completions.create({
      messages,
      thinking: { type: 'disabled' }
    });
    full = completion.choices[0]?.message?.content || 'On it.';
    onToken(full);
  } catch (e) {
    full = `Couldn't reach the automation brain: ${e.message}`;
    onToken(full);
  }

  // Append a machine-readable action marker the frontend will parse out
  // (the frontend strips this before showing the text to the user)
  onToken(`\n\n<!--ACTION:${JSON.stringify(action)}-->`);

  return { full, agent: 'automation', action };
}
