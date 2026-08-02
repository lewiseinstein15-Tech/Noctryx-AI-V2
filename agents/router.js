// agents/router.js — Intent classifier that picks the right agent
// Decides between: research | code | automation | chat (default)
// Designed for SPEED: uses a tiny fast LLM call with a strict JSON-only prompt.

import ZAI from 'z-ai-web-dev-sdk';

let _zai = null;
async function getZai() {
  if (!_zai) _zai = await ZAI.create();
  return _zai;
}

// Quick keyword pre-filter — if it's an obvious match, skip the LLM call entirely.
// This makes routing near-instant for clear commands, satisfying the "no gaps" requirement.
function quickRoute(message) {
  const m = message.toLowerCase().trim();

  // Automation: opening apps / sites / drafting messages / system actions
  const autoKeys = [
    'open ', 'launch ', 'go to ', 'navigate to ',
    'reply my', 'reply to', 'draft a', 'draft a message', 'compose',
    'send a message', 'open my instagram', 'open my whatsapp', 'open my youtube',
    'open spotify', 'open gmail', 'open twitter', 'open x ', 'open tiktok',
    'open facebook', 'open reddit', 'open github', 'open netflix',
    'open my email', 'check my email', 'play ', 'search youtube for',
    'open maps', 'open google maps', 'set a timer', 'set an alarm',
    'what time is it', 'what\'s the time', 'current time',
    'take a note', 'save a note', 'remind me'
  ];
  for (const k of autoKeys) {
    if (m.startsWith(k) || m.includes(k)) return 'automation';
  }

  // Code: any time the user asks to write, fix, explain, or paste code
  const codeKeys = [
    'write code', 'write a function', 'write a script', 'write a program',
    'generate code', 'code:', 'debug', 'fix this code', 'fix the code',
    'explain this code', 'explain the code', 'refactor',
    'regex', 'algorithm', 'leetcode', 'complexity',
    'in javascript', 'in python', 'in typescript', 'in java', 'in c++', 'in c#',
    'in go', 'in rust', 'in ruby', 'in php', 'in swift', 'in kotlin',
    'sql query', 'html and css', 'react component', 'vue component',
    'api endpoint', 'express route', 'node script'
  ];
  for (const k of codeKeys) {
    if (m.includes(k)) return 'code';
  }
  // Fenced code block in the user's message
  if (/```/.test(message)) return 'code';

  // Research: anything that needs current/external info
  const researchKeys = [
    'search for', 'search the web', 'look up', 'look this up',
    'latest news', 'news about', 'what\'s happening',
    'current price', 'stock price', 'weather in', 'weather today',
    'who won', 'score of', 'when is', 'release date',
    'according to', 'sources', 'cite', 'research'
  ];
  for (const k of researchKeys) {
    if (m.includes(k)) return 'research';
  }

  return null; // no obvious match — ask the LLM router
}

// LLM-based router for ambiguous messages. Strict JSON output, very small prompt.
async function llmRoute(message) {
  try {
    const zai = await getZai();
    const completion = await zai.chat.completions.create({
      messages: [
        {
          role: 'assistant',
          content:
            'You are a fast intent router. Read the user message and reply with ONLY a JSON object, no prose, no markdown fences. ' +
            'Schema: {"agent":"research"|"code"|"automation"|"chat","reason":"<one short sentence>"}\n' +
            'Rules:\n' +
            '- "automation": user wants to open an app/website, draft/send a message, control the device, set timers/alarms, play media.\n' +
            '- "code": user wants code written, explained, debugged, refactored, or pasted code for analysis.\n' +
            '- "research": user wants fresh/external information (news, prices, weather, current events, citations).\n' +
            '- "chat": general conversation, opinions, explanations the model already knows, creative writing.'
        },
        { role: 'user', content: message }
      ],
      thinking: { type: 'disabled' }
    });
    const raw = completion.choices[0]?.message?.content || '';
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return { agent: 'chat', reason: 'unparseable' };
    const parsed = JSON.parse(match[0]);
    if (!['research', 'code', 'automation', 'chat'].includes(parsed.agent)) {
      return { agent: 'chat', reason: 'bad agent value' };
    }
    return parsed;
  } catch (e) {
    return { agent: 'chat', reason: 'router error: ' + e.message };
  }
}

export async function routeIntent(message) {
  const quick = quickRoute(message);
  if (quick) {
    return { agent: quick, reason: 'keyword match', source: 'quick' };
  }
  const llm = await llmRoute(message);
  return { ...llm, source: 'llm' };
}
