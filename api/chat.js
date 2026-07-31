// api/chat.js — Vercel Node.js Serverless Function
// Handles: /api/chat, /api/vision, /api/github/:user, /api/health

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const GROQ_API_KEY = process.env.GROQ_API_KEY || "";
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || "";
const XAI_API_KEY = process.env.XAI_API_KEY || "";
const PERPLEXITY_API_KEY = process.env.PERPLEXITY_API_KEY || "";
const HUGGINGFACE_API_KEY = process.env.HUGGINGFACE_API_KEY || "";
const COHERE_API_KEY = process.env.COHERE_API_KEY || "";
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || "";
const DEFAULT_PROVIDER = (process.env.DEFAULT_PROVIDER || "openai").toLowerCase();
const DEFAULT_MODEL = process.env.DEFAULT_MODEL || "";
const SYSTEM_PROMPT = process.env.SYSTEM_PROMPT || "You are Noctryx AI, a helpful, knowledgeable, and precise AI assistant. Provide clear, well-structured responses. Use markdown formatting. For math, use LaTeX with $...$ for inline and $$...$$ for display. For code, use fenced code blocks with language tags. Be concise but thorough.";

const PROVIDERS = {
  openai: { name: "OpenAI", key: OPENAI_API_KEY, models: ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-3.5-turbo"], endpoint: "https://api.openai.com/v1/chat/completions", supportsStream: true },
  anthropic: { name: "Anthropic", key: ANTHROPIC_API_KEY, models: ["claude-3-5-sonnet-20241022", "claude-3-opus-20240229", "claude-3-haiku-20240307"], endpoint: "https://api.anthropic.com/v1/messages", supportsStream: true },
  gemini: { name: "Google Gemini", key: GEMINI_API_KEY, models: ["gemini-1.5-pro-latest", "gemini-1.5-flash-latest"], endpoint: "https://generativelanguage.googleapis.com/v1beta/models", supportsStream: true },
  groq: { name: "Groq", key: GROQ_API_KEY, models: ["llama-3.1-70b-versatile", "llama-3.1-8b-instant", "mixtral-8x7b-32768", "gemma2-9b-it"], endpoint: "https://api.groq.com/openai/v1/chat/completions", supportsStream: true },
  deepseek: { name: "DeepSeek", key: DEEPSEEK_API_KEY, models: ["deepseek-chat", "deepseek-coder"], endpoint: "https://api.deepseek.com/chat/completions", supportsStream: true },
  xai: { name: "xAI (Grok)", key: XAI_API_KEY, models: ["grok-2-latest", "grok-beta", "grok-vision-beta"], endpoint: "https://api.x.ai/v1/chat/completions", supportsStream: true },
  perplexity: { name: "Perplexity", key: PERPLEXITY_API_KEY, models: ["llama-3.1-sonar-large-128k-online", "llama-3.1-sonar-small-128k-online"], endpoint: "https://api.perplexity.ai/chat/completions", supportsStream: true },
  huggingface: { name: "Hugging Face", key: HUGGINGFACE_API_KEY, models: ["meta-llama/Meta-Llama-3.1-70B-Instruct"], endpoint: "https://api-inference.huggingface.co/models", supportsStream: false },
  cohere: { name: "Cohere", key: COHERE_API_KEY, models: ["command-r-plus", "command-r", "command"], endpoint: "https://api.cohere.ai/v1/chat", supportsStream: true },
};

function getEnabledProviders() {
  return Object.entries(PROVIDERS).filter(([_, p]) => p.key).map(([k]) => k);
}

function getProvider(name) {
  const key = (name || DEFAULT_PROVIDER).toLowerCase();
  return PROVIDERS[key] || PROVIDERS[DEFAULT_PROVIDER] || null;
}

function getModel(provider, requested) {
  if (requested && provider.models.includes(requested)) return requested;
  if (DEFAULT_MODEL && provider.models.includes(DEFAULT_MODEL)) return DEFAULT_MODEL;
  return provider.models[0];
}

function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": origin || "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
  };
}

function encodeSSE(data) {
  return "data: " + JSON.stringify(data) + "\n\n";
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", chunk => body += chunk);
    req.on("end", () => {
      try { resolve(JSON.parse(body || "{}")); } catch (e) { resolve({}); }
    });
    req.on("error", reject);
  });
}

async function streamOpenAICompatible(provider, body, res) {
  const model = getModel(provider, body.model);
  const messages = [{ role: "system", content: SYSTEM_PROMPT }];
  if (body.history) messages.push(...body.history.filter(m => m.role === "user" || m.role === "assistant"));
  messages.push({ role: "user", content: body.message });

  const upstream = await fetch(provider.endpoint, {
    method: "POST",
    headers: { "Authorization": "Bearer " + provider.key, "Content-Type": "application/json" },
    body: JSON.stringify({ model, messages, stream: true, temperature: 0.7, max_tokens: 4096 }),
  });

  if (!upstream.ok) {
    const err = await upstream.text();
    res.write(encodeSSE({ object: "error", message: err }));
    res.end();
    return;
  }

  const reader = upstream.body.getReader();
  const decoder = new TextDecoder();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const text = decoder.decode(value, { stream: true });
      const lines = text.split("\n");
      for (const line of lines) {
        if (!line.trim() || !line.startsWith("data: ")) continue;
        const data = line.slice(6);
        if (data === "[DONE]") continue;
        res.write(line + "\n\n");
      }
    }
  } finally {
    res.write("data: [DONE]\n\n");
    res.end();
  }
}

async function streamAnthropic(provider, body, res) {
  const model = getModel(provider, body.model);
  const messages = [];
  if (body.history) {
    for (const m of body.history) {
      if (m.role === "system") continue;
      messages.push({ role: m.role === "assistant" ? "assistant" : "user", content: m.content });
    }
  }
  messages.push({ role: "user", content: body.message });

  const upstream = await fetch(provider.endpoint, {
    method: "POST",
    headers: { "x-api-key": provider.key, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
    body: JSON.stringify({ model, max_tokens: 4096, system: SYSTEM_PROMPT, messages, stream: true }),
  });

  if (!upstream.ok) {
    const err = await upstream.text();
    res.write(encodeSSE({ object: "error", message: err }));
    res.end();
    return;
  }

  const reader = upstream.body.getReader();
  const decoder = new TextDecoder();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const text = decoder.decode(value, { stream: true });
      const lines = text.split("\n");
      for (const line of lines) {
        if (!line.trim() || !line.startsWith("data: ")) continue;
        const data = line.slice(6);
        if (data === "[DONE]") continue;
        try {
          const parsed = JSON.parse(data);
          if (parsed.type === "content_block_delta" && parsed.delta?.text) {
            res.write(encodeSSE({ choices: [{ delta: { content: parsed.delta.text } }] }));
          }
        } catch {}
      }
    }
  } finally {
    res.write("data: [DONE]\n\n");
    res.end();
  }
}

async function streamGemini(provider, body, res) {
  const model = getModel(provider, body.model);
  const contents = [];
  if (body.history) {
    for (const m of body.history) {
      contents.push({ role: m.role === "user" ? "user" : "model", parts: [{ text: m.content }] });
    }
  }
  contents.push({ role: "user", parts: [{ text: body.message }] });

  const url = provider.endpoint + "/" + model + ":streamGenerateContent?alt=sse&key=" + provider.key;
  const upstream = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents, generationConfig: { temperature: 0.7, maxOutputTokens: 4096 }, systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] } }),
  });

  if (!upstream.ok) {
    const err = await upstream.text();
    res.write(encodeSSE({ object: "error", message: err }));
    res.end();
    return;
  }

  const reader = upstream.body.getReader();
  const decoder = new TextDecoder();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const text = decoder.decode(value, { stream: true });
      const lines = text.split("\n");
      for (const line of lines) {
        if (!line.trim() || !line.startsWith("data: ")) continue;
        const data = line.slice(6);
        try {
          const parsed = JSON.parse(data);
          const txt = parsed.candidates?.[0]?.content?.parts?.[0]?.text || "";
          if (txt) res.write(encodeSSE({ choices: [{ delta: { content: txt } }] }));
        } catch {}
      }
    }
  } finally {
    res.write("data: [DONE]\n\n");
    res.end();
  }
}

async function streamCohere(provider, body, res) {
  const model = getModel(provider, body.model);
  const chatHistory = [];
  if (body.history) {
    for (const m of body.history) {
      if (m.role === "system") continue;
      chatHistory.push({ role: m.role === "assistant" ? "CHATBOT" : "USER", message: m.content });
    }
  }

  const upstream = await fetch(provider.endpoint, {
    method: "POST",
    headers: { "Authorization": "Bearer " + provider.key, "Content-Type": "application/json" },
    body: JSON.stringify({ model, message: body.message, chat_history: chatHistory, preamble: SYSTEM_PROMPT, stream: true, temperature: 0.7 }),
  });

  if (!upstream.ok) {
    const err = await upstream.text();
    res.write(encodeSSE({ object: "error", message: err }));
    res.end();
    return;
  }

  const reader = upstream.body.getReader();
  const decoder = new TextDecoder();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const text = decoder.decode(value, { stream: true });
      const lines = text.split("\n");
      for (const line of lines) {
        if (!line.trim() || !line.startsWith("data: ")) continue;
        const data = line.slice(6);
        try {
          const parsed = JSON.parse(data);
          if (parsed.eventType === "text-generation" && parsed.text) {
            res.write(encodeSSE({ choices: [{ delta: { content: parsed.text } }] }));
          }
        } catch {}
      }
    }
  } finally {
    res.write("data: [DONE]\n\n");
    res.end();
  }
}

async function nonStreamingChat(provider, body) {
  const model = getModel(provider, body.model);
  const messages = [{ role: "system", content: SYSTEM_PROMPT }];
  if (body.history) messages.push(...body.history);
  messages.push({ role: "user", content: body.message });

  const res = await fetch(provider.endpoint, {
    method: "POST",
    headers: { "Authorization": "Bearer " + provider.key, "Content-Type": "application/json" },
    body: JSON.stringify({ model, messages, stream: false, temperature: 0.7, max_tokens: 4096 }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(err);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content || data.response || data.text || "No response";
}

async function huggingfaceChat(provider, body) {
  const model = getModel(provider, body.model);
  const messages = [{ role: "system", content: SYSTEM_PROMPT }];
  if (body.history) messages.push(...body.history);
  messages.push({ role: "user", content: body.message });

  const res = await fetch(provider.endpoint + "/" + model, {
    method: "POST",
    headers: { "Authorization": "Bearer " + provider.key, "Content-Type": "application/json" },
    body: JSON.stringify({ inputs: messages.map(m => m.content).join("\n\n"), parameters: { max_new_tokens: 4096, temperature: 0.7 } }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(err);
  }

  const data = await res.json();
  if (Array.isArray(data) && data[0]?.generated_text) return data[0].generated_text;
  return data.generated_text || JSON.stringify(data);
}

async function analyzeVision(body) {
  const provider = getProvider("openai");
  if (!provider || !provider.key) throw new Error("Vision requires OpenAI API key");

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Authorization": "Bearer " + provider.key, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-4o",
      messages: [
        { role: "system", content: "You are a vision analysis assistant. Describe what you see in detail." },
        { role: "user", content: [
          { type: "text", text: "Describe what you see in this image in detail." },
          { type: "image_url", image_url: { url: "data:" + (body.mimeType || "image/jpeg") + ";base64," + body.imageBase64 } }
        ]}
      ],
      max_tokens: 2048,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(err);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content || "No analysis available";
}

async function fetchGitHubRepos(username) {
  const headers = GITHUB_TOKEN ? { "Authorization": "token " + GITHUB_TOKEN, "User-Agent": "Noctryx-AI" } : { "User-Agent": "Noctryx-AI" };
  const res = await fetch("https://api.github.com/users/" + encodeURIComponent(username) + "/repos?sort=updated&per_page=30", { headers });
  if (!res.ok) throw new Error("GitHub API error: " + res.status);
  const repos = await res.json();
  return repos.map(r => ({
    name: r.name, description: r.description, language: r.language,
    stars: r.stargazers_count, forks: r.forks_count, private: r.private,
    updated_at: r.updated_at, html_url: r.html_url,
  }));
}

export default async function handler(req, res) {
  const origin = req.headers.origin || "*";
  const headers = corsHeaders(origin);

  if (req.method === "OPTIONS") {
    res.writeHead(204, headers);
    res.end();
    return;
  }

  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);

  const path = req.url.split("?")[0];

  if (path === "/api/health") {
    const enabled = getEnabledProviders();
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ status: "ok", providers: enabled, defaultProvider: DEFAULT_PROVIDER, timestamp: new Date().toISOString() }));
    return;
  }

  if (path.startsWith("/api/github/")) {
    const username = decodeURIComponent(path.replace("/api/github/", ""));
    if (!username) {
      res.statusCode = 400;
      res.end(JSON.stringify({ error: "Username required" }));
      return;
    }
    try {
      const repos = await fetchGitHubRepos(username);
      res.statusCode = 200;
      res.end(JSON.stringify(repos));
    } catch (err) {
      res.statusCode = 500;
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  if (path === "/api/vision") {
    try {
      const body = await parseBody(req);
      if (!body.imageBase64) {
        res.statusCode = 400;
        res.end(JSON.stringify({ error: "imageBase64 required" }));
        return;
      }
      const analysis = await analyzeVision(body);
      res.statusCode = 200;
      res.end(JSON.stringify({ analysis }));
    } catch (err) {
      res.statusCode = 500;
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  if (path === "/api/chat") {
    try {
      const body = await parseBody(req);
      if (!body.message) {
        res.statusCode = 400;
        res.end(JSON.stringify({ error: "message required" }));
        return;
      }

      const providerName = (body.provider || DEFAULT_PROVIDER).toLowerCase();
      const provider = getProvider(providerName);
      if (!provider) {
        res.statusCode = 400;
        res.end(JSON.stringify({ error: "Provider not configured: " + providerName }));
        return;
      }
      if (!provider.key) {
        res.statusCode = 400;
        res.end(JSON.stringify({ error: "API key not set for " + provider.name }));
        return;
      }

      if (body.stream !== false && provider.supportsStream) {
        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");
        res.statusCode = 200;

        try {
          if (providerName === "anthropic") await streamAnthropic(provider, body, res);
          else if (providerName === "gemini") await streamGemini(provider, body, res);
          else if (providerName === "cohere") await streamCohere(provider, body, res);
          else await streamOpenAICompatible(provider, body, res);
        } catch (err) {
          res.write(encodeSSE({ object: "error", message: err.message }));
          res.end();
        }
        return;
      }

      let reply;
      if (providerName === "huggingface") reply = await huggingfaceChat(provider, body);
      else reply = await nonStreamingChat(provider, body);

      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ reply, provider: providerName, model: getModel(provider, body.model) }));

    } catch (err) {
      res.statusCode = 500;
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  res.statusCode = 404;
  res.end(JSON.stringify({ error: "Not found" }));
}