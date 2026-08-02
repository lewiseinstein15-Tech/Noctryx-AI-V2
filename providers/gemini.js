class GeminiProvider {
  constructor() {
    this.name = 'gemini';
    this.apiKey = process.env.GEMINI_API_KEY;
    this.model = 'gemini-2.5-flash';
    this.priority = 3;
  }
  async stream(messages, signal) {
    const contents = messages.filter(m => m.role !== 'system').map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }));
    const systemMsg = messages.find(m => m.role === 'system');
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:streamGenerateContent?key=${this.apiKey}`;
    const body = { contents, ...(systemMsg ? { systemInstruction: { parts: [{ text: systemMsg.content }] } } : {}), generationConfig: { temperature: 0.7, maxOutputTokens: 8192 } };
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal });
    if (!res.ok) throw new Error(`Gemini error: ${res.statusText}`);
    return res.body;
  }
}
module.exports = GeminiProvider;
