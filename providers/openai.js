class OpenAIProvider {
  constructor() {
    this.name = 'openai';
    this.apiKey = process.env.OPENAI_API_KEY;
    this.model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
    this.priority = 2;
    this.endpoint = 'https://api.openai.com/v1/chat/completions';
  }
  async stream(messages, signal) {
    const res = await fetch(this.endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${this.apiKey}` }, body: JSON.stringify({ model: this.model, messages, stream: true }), signal });
    if (!res.ok) throw new Error(`OpenAI error: ${res.statusText}`);
    return res.body;
  }
}
module.exports = OpenAIProvider;
