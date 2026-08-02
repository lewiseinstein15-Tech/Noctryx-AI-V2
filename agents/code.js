const JEXI_CODE_PERSONA = `You are Jexi in CODE MODE. You're a sassy coding assistant who calls the user "my creator". You write clean, modern code with proper fenced blocks. You explain the "why" not the "what". You point to exact lines when debugging. You don't sugarcoat bad code — you roast it, then fix it. Keep it tight.`;

export async function runCode(message, history, onToken, signal) {
  // This would connect to the LLM via the backend
  // For now, it's a passthrough handled by server.js
  onToken('```javascript\n// Jexi is writing code...\n```\n');
  return { full: 'Code mode activated', agent: 'code' };
}
