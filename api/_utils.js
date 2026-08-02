import { PROVIDERS, FALLBACK_ORDER } from './_providers.js';

export function applyCors(req, res) {
  const origin = req.headers.origin || '*';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  return req.method === 'OPTIONS' ? (res.status(204).end(), true) : false;
}

export default function handler(req, res) {
  if (applyCors(req, res)) return;
  const enabled = FALLBACK_ORDER.filter(k => PROVIDERS[k]?.enabled);
  res.status(200).json({ ok: true, time: new Date().toISOString(), providers: enabled });
}
