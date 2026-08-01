/**
 * Noctryx AI V2 - OpenAI Inference Provider
 * Creator: Lewis Einstein
 */
class OpenAIProvider {
  constructor() {
    this.name = 'openai';
    this.apiKey = process.env.OPENAI_API_KEY;
    this.model = 'gpt-4o';
    this.priority = 3;
    this.endpoint = 'https://api.openai.com/v1/chat/completions';
  }

  async stream(messages, signal) {
    const res = await fetch(this.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${this.apiKey}` },
      body: JSON.stringify({ model: this.model, messages, stream: true }),
      signal
    });
    if (!res.ok) throw new Error(`OpenAI error: ${res.statusText}`);
    return res.body;
  }
}
module.exports = OpenAIProvider;
