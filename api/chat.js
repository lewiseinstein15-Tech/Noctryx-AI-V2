// api/chat.js — Vercel Serverless Function
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
const SYSTEM_PROMPT = process.env.SYSTEM_PROMPT || "You are Noctryx AI, a helpful, knowledgeable, and precise AI assistant. Provide clear, well-structured responses. Use markdown formatting. Be concise but thorough.";

const PROVIDERS = {
  openai: { name: "OpenAI", key: OPENAI_API_KEY, models: ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-3.5-turbo"], endpoint: "https://api.openai.com/v1/chat/completions", supportsStream: true },
  anthropic: { name: "Anthropic", key: ANTHROPIC_API_KEY, models: ["claude-3-5-sonnet-20241022", "claude-3-opus-20240229", "claude-3-haiku-20240307"], endpoint: "https://api.anthropic.com/v1/messages", supportsStream: true },
  gemini: { name: "Google Gemini", key: GEMINI_API_KEY, models: ["gemini-1.5-pro-latest", "gemini-1.5-flash-latest"], endpoint: "https://generativelanguage.googleapis.com/v1beta/models", supportsStream: true },
  groq: { name: "Groq", key: GROQ_API_KEY, models: ["llama-3.1-70b-versatile", "llama-3.1-8b-instant", "mixtral-8x7b-32768", "gemma2-9b-it"], endpoint: "https://api.groq.com/openai/v1/chat/completions", supportsStream: true },
  deepseek: { name: "DeepSeek", key: DEEPSEEK_API_KEY, models: ["deepseek-chat", "deepseek-coder"], endpoint: "https://api.deepseek.com/chat/completions", supportsStream: true },
  xai: { name: "xAI (Grok)", key: XAI_API_KEY, models: ["grok-beta", "grok-vision-beta"], endpoint: "https://api.x.ai/v1/chat/completions", supportsStream: true },
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

// CORS headers
function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": origin || "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
  };
}

// Streaming helpers
function createStreamResponse(readable, headers) {
  return new Response(readable, { status: 200, headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", "Connection": "keep-alive", ...headers } });
}

function encodeSSE(data) {
  return "data: " + JSON.stringify(data) + "\n\n";
}

// OpenAI-compatible streaming
async function streamOpenAI(provider, body, encoder, controller) {
  const model = getModel(provider, body.model);
  const messages = [{ role: "system", content: SYSTEM_PROMPT }];
  if (body.history) messages.push(...body.history);
  messages.push({ role: "user", content: body.message });

  const res = await fetch(provider.endpoint, {
    method: "POST",
    headers: { "Authorization": "Bearer " + provider.key, "Content-Type": "application/json" },
    body: JSON.stringify({ model, messages, stream: true, temperature: 0.7, max_tokens: 4096 }),
  });

  if (!res.ok) {
    const err = await res.text();
    controller.enqueue(encoder.encode(encodeSSE({ object: "error", message: err })));
    controller.close();
    return;
  }

  const reader = res.body.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      controller.enqueue(encoder.encode(new TextDecoder().decode(value)));
    }
  } finally {
    controller.enqueue(encoder.encode("data: [DONE]\n\n"));
    controller.close();
  }
}

// Anthropic streaming
async function streamAnthropic(provider, body, encoder, controller) {
  const model = getModel(provider, body.model);
  const messages = [];
  if (body.history) {
    for (const m of body.history) {
      if (m.role === "system") continue;
      messages.push({ role: m.role === "assistant" ? "assistant" : "user", content: m.content });
    }
  }
  messages.push({ role: "user", content: body.message });

  const res = await fetch(provider.endpoint, {
    method: "POST",
    headers: { "x-api-key": provider.key, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
    body: JSON.stringify({ model, max_tokens: 4096, system: SYSTEM_PROMPT, messages, stream: true }),
  });

  if (!res.ok) {
    const err = await res.text();
    controller.enqueue(encoder.encode(encodeSSE({ object: "error", message: err })));
    controller.close();
    return;
  }

  const reader = res.body.getReader();
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
            controller.enqueue(encoder.encode(encodeSSE({ choices: [{ delta: { content: parsed.delta.text } }] })));
          }
        } catch {}
      }
    }
  } finally {
    controller.enqueue(encoder.encode("data: [DONE]\n\n"));
    controller.close();
  }
}

// Gemini streaming
async function streamGemini(provider, body, encoder, controller) {
  const model = getModel(provider, body.model);
  const contents = [];
  if (body.history) {
    for (const m of body.history) {
      contents.push({ role: m.role === "user" ? "user" : "model", parts: [{ text: m.content }] });
    }
  }
  contents.push({ role: "user", parts: [{ text: body.message }] });

  const url = provider.endpoint + "/" + model + ":streamGenerateContent?alt=sse&key=" + provider.key;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents, generationConfig: { temperature: 0.7, maxOutputTokens: 4096 }, systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] } }),
  });

  if (!res.ok) {
    const err = await res.text();
    controller.enqueue(encoder.encode(encodeSSE({ object: "error", message: err })));
    controller.close();
    return;
  }

  const reader = res.body.getReader();
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
          const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text || "";
          if (text) controller.enqueue(encoder.encode(encodeSSE({ choices: [{ delta: { content: text } }] })));
        } catch {}
      }
    }
  } finally {
    controller.enqueue(encoder.encode("data: [DONE]\n\n"));
    controller.close();
  }
}

// Cohere streaming
async function streamCohere(provider, body, encoder, controller) {
  const model = getModel(provider, body.model);
  const chatHistory = [];
  if (body.history) {
    for (const m of body.history) {
      if (m.role === "system") continue;
      chatHistory.push({ role: m.role === "assistant" ? "CHATBOT" : "USER", message: m.content });
    }
  }

  const res = await fetch(provider.endpoint, {
    method: "POST",
    headers: { "Authorization": "Bearer " + provider.key, "Content-Type": "application/json" },
    body: JSON.stringify({ model, message: body.message, chat_history: chatHistory, preamble: SYSTEM_PROMPT, stream: true, temperature: 0.7 }),
  });

  if (!res.ok) {
    const err = await res.text();
    controller.enqueue(encoder.encode(encodeSSE({ object: "error", message: err })));
    controller.close();
    return;
  }

  const reader = res.body.getReader();
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
            controller.enqueue(encoder.encode(encodeSSE({ choices: [{ delta: { content: parsed.text } }] })));
          }
        } catch {}
      }
    }
  } finally {
    controller.enqueue(encoder.encode("data: [DONE]\n\n"));
    controller.close();
  }
}

// Non-streaming fallback
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

// Hugging Face non-streaming
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

// Vision analysis
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

// GitHub repos
async function fetchGitHubRepos(username) {
  const headers = GITHUB_TOKEN ? { "Authorization": "token " + GITHUB_TOKEN, "User-Agent": "Noctryx-AI" } : { "User-Agent": "Noctryx-AI" };
  const res = await fetch("https://api.github.com/users/" + encodeURIComponent(username) + "/repos?sort=updated&per_page=30", { headers });
  if (!res.ok) throw new Error("GitHub API error: " + res.status);
  const repos = await res.json();
  return repos.map(r => ({
    name: r.name,
    description: r.description,
    language: r.language,
    stars: r.stargazers_count,
    forks: r.forks_count,
    private: r.private,
    updated_at: r.updated_at,
    html_url: r.html_url,
  }));
}

// Main handler
export default async function handler(req, res) {
  const origin = req.headers.origin || "*";
  const headers = corsHeaders(origin);

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers });
  }

  const url = new URL(req.url, "http://localhost");
  const path = url.pathname;

  // Health check
  if (path === "/api/health") {
    const enabled = getEnabledProviders();
    return new Response(JSON.stringify({ status: "ok", providers: enabled, defaultProvider: DEFAULT_PROVIDER, timestamp: new Date().toISOString() }), { status: 200, headers: { ...headers, "Content-Type": "application/json" } });
  }

  // GitHub repos
  if (path.startsWith("/api/github/")) {
    const username = decodeURIComponent(path.replace("/api/github/", ""));
    if (!username) return new Response(JSON.stringify({ error: "Username required" }), { status: 400, headers: { ...headers, "Content-Type": "application/json" } });
    try {
      const repos = await fetchGitHubRepos(username);
      return new Response(JSON.stringify(repos), { status: 200, headers: { ...headers, "Content-Type": "application/json" } });
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { ...headers, "Content-Type": "application/json" } });
    }
  }

  // Vision
  if (path === "/api/vision") {
    try {
      const body = await req.json();
      if (!body.imageBase64) return new Response(JSON.stringify({ error: "imageBase64 required" }), { status: 400, headers: { ...headers, "Content-Type": "application/json" } });
      const analysis = await analyzeVision(body);
      return new Response(JSON.stringify({ analysis }), { status: 200, headers: { ...headers, "Content-Type": "application/json" } });
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { ...headers, "Content-Type": "application/json" } });
    }
  }

  // Chat
  if (path === "/api/chat") {
    try {
      const body = await req.json();
      if (!body.message) return new Response(JSON.stringify({ error: "message required" }), { status: 400, headers: { ...headers, "Content-Type": "application/json" } });

      const providerName = (body.provider || DEFAULT_PROVIDER).toLowerCase();
      const provider = getProvider(providerName);
      if (!provider) return new Response(JSON.stringify({ error: "Provider not configured: " + providerName }), { status: 400, headers: { ...headers, "Content-Type": "application/json" } });
      if (!provider.key) return new Response(JSON.stringify({ error: "API key not set for " + provider.name }), { status: 400, headers: { ...headers, "Content-Type": "application/json" } });

      // Streaming
      if (body.stream !== false && provider.supportsStream) {
        const encoder = new TextEncoder();
        const { readable, writable } = new TransformStream();
        const writer = writable.getWriter();

        const streamPromise = (async () => {
          try {
            if (providerName === "anthropic") await streamAnthropic(provider, body, encoder, writer);
            else if (providerName === "gemini") await streamGemini(provider, body, encoder, writer);
            else if (providerName === "cohere") await streamCohere(provider, body, encoder, writer);
            else await streamOpenAI(provider, body, encoder, writer);
          } catch (err) {
            writer.write(encoder.encode(encodeSSE({ object: "error", message: err.message })));
            writer.close();
          }
        })();

        return createStreamResponse(readable, headers);
      }

      // Non-streaming
      let reply;
      if (providerName === "huggingface") reply = await huggingfaceChat(provider, body);
      else reply = await nonStreamingChat(provider, body);

      return new Response(JSON.stringify({ reply, provider: providerName, model: getModel(provider, body.model) }), { status: 200, headers: { ...headers, "Content-Type": "application/json" } });

    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { ...headers, "Content-Type": "application/json" } });
    }
  }

  return new Response(JSON.stringify({ error: "Not found" }), { status: 404, headers: { ...headers, "Content-Type": "application/json" } });
}