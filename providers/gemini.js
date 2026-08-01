/**
 * Noctryx AI V2 - Gemini Inference Provider
 * Creator: Lewis Einstein
 */
class GeminiProvider {
  constructor() {
    this.name = 'gemini';
    this.apiKey = process.env.GEMINI_API_KEY;
    this.model = 'gemini-1.5-pro';
    this.priority = 2;
    this.endpoint = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:streamGenerateContent';
  }

  async stream(messages, signal) {
    const contents = messages.map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }]
    }));
    const res = await fetch(`${this.endpoint}?alt=sse&key=${this.apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents }),
      signal
    });
    if (!res.ok) throw new Error(`Gemini error: ${res.statusText}`);
    return res.body;
  }
}
module.exports = GeminiProvider;
