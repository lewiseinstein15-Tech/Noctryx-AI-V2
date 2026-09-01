const NOCTRYX_CODE_PERSONA = `You are Noctryx in CODE MODE. You write clean, modern code with proper fenced blocks. You explain the reasoning behind decisions, not just what the code does. You point to exact lines when debugging. Built by Lewis for everyone.`;

export async function runCode(message, history, onToken, signal) {
  // This would connect to the LLM via the backend
  // For now, it's a passthrough handled by server.js
  onToken('```javascript\n// Noctryx is writing code...\n```\n');
  return { full: 'Code mode activated', agent: 'code' };
}
