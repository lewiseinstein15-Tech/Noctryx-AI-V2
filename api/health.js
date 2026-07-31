import { applyCors } from './_utils.js';
import { PROVIDERS, FALLBACK_ORDER } from './_providers.js';

export default function handler(req, res) {
  if (applyCors(req, res)) return;

  // Build an array of enabled provider names (strings)
  const enabledProviders = FALLBACK_ORDER.filter(key => PROVIDERS[key]?.enabled);

  res.status(200).json({
    status: 'ok',           // optional, but nice to have
    timestamp: Date.now(),
    providers: enabledProviders,  // now an array, e.g. ['openai', 'anthropic']
    // Keep backward compatibility for any other code that might expect 'ok' and 'time'
    ok: true,
    time: new Date().toISOString()
  });
}
