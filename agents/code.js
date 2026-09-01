const NOCTRYX_CODE_PERSONA = `You are Noctryx in CODE MODE. You write clean, modern code with proper fenced blocks. You explain the "why" not the "what". You point to exact lines when debugging. Keep it tight.`;

export async function runCode(message, history, onToken, signal) {
  // This would connect to the LLM via the backend
  // For now, it's a passthrough handled by server.js
  onToken('```javascript\n// Noctryx is writing code...\n```\n');
  return { full: 'Code mode activated', agent: 'code' };
}
