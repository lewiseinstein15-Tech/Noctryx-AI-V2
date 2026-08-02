const KEYWORDS = {
  automation: ['open ', 'launch ', 'go to ', 'navigate to ', 'reply to', 'draft a', 'send a message', 'take a note', 'remind me', 'set a timer', 'what time'],
  code: ['write code', 'debug', 'fix this', 'refactor', 'regex', 'algorithm', 'function', 'in javascript', 'in python', 'react component', 'api endpoint', 'sql query', '```'],
  research: ['search for', 'latest news', 'weather in', 'who won', 'stock price', 'current price', 'look up', 'research']
};

export async function routeIntent(message) {
  const m = message.toLowerCase();
  for (const [agent, keys] of Object.entries(KEYWORDS)) {
    if (keys.some(k => m.includes(k))) return { agent, reason: 'keyword', source: 'quick' };
  }
  return { agent: 'chat', reason: 'default', source: 'fallback' };
}
