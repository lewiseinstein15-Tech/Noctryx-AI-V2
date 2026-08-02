class GroqProvider {
  constructor() {
    this.name = 'groq';
    this.apiKey = process.env.GROQ_API_KEY;
    this.model = 'llama-3.3-70b-versatile';
    this.priority = 1;
    this.endpoint = 'https://api.groq.com/openai/v1/chat/completions';
  }
  async stream(messages, signal) {
    const res = await fetch(this.endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${this.apiKey}` }, body: JSON.stringify({ model: this.model, messages, stream: true }), signal });
    if (!res.ok) throw new Error(`Groq error: ${res.statusText}`);
    return res.body;
  }
}
module.exports = GroqProvider;
