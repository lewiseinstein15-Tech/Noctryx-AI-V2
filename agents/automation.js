const APP_URLS = {
  instagram: 'https://www.instagram.com/',
  whatsapp: 'https://web.whatsapp.com/',
  youtube: 'https://www.youtube.com/',
  spotify: 'https://open.spotify.com/',
  gmail: 'https://mail.google.com/',
  twitter: 'https://x.com/',
  github: 'https://github.com/',
  maps: 'https://maps.google.com/',
  netflix: 'https://www.netflix.com/'
};

const NOCTRYX_AUTO_PERSONA = `You are Noctryx in AUTOMATION MODE. You open apps, draft messages, set notes. You speak naturally — no JSON talk. Short, punchy replies.`;

export async function runAutomation(message, history, onToken, signal) {
  const m = message.toLowerCase();
  let action = { type: 'speak_only' };

  for (const [app, url] of Object.entries(APP_URLS)) {
    if (m.includes(`open ${app}`) || m.includes(`launch ${app}`)) {
      action = { type: 'open_url', app, url };
      break;
    }
  }

  if (m.includes('take a note') || m.includes('save a note')) {
    const note = message.replace(/.*note (that )?/i, '').trim();
    action = { type: 'note', content: note };
  }

  onToken(`On it, creator.`);
  return { full: 'Done', agent: 'automation', action };
}
