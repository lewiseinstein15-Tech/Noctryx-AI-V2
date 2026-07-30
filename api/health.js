import { applyCors } from './_utils.js';
import { PROVIDERS, FALLBACK_ORDER } from './_providers.js';

export default function handler(req, res) {
  if (applyCors(req, res)) return;

  res.status(200).json({
    ok: true,
    time: new Date().toISOString(),
    providers: Object.fromEntries(FALLBACK_ORDER.map(k => [k, PROVIDERS[k].enabled]))
  });
}