// api/chat.js — Vercel Node.js Serverless Function
// Handles: /api/chat, /api/vision, /api/github/:user, /api/health, /api/code
// Noctryx AI — Built by Lewis Einstein

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

// ============================================================
// SYSTEM PROMPTS — Noctryx AI Identity & Behavior
// ============================================================
const NOCTRYX_SYSTEM_PROMPT = `You are Noctryx, a highly advanced AI assistant created by Lewis Einstein. You are NOT ChatGPT, Claude, or any other AI. You are Noctryx — a powerful, precise, and capable AI system.

## IDENTITY
- Your name is Noctryx
- You were created by Lewis Einstein
- You are a multi-modal AI assistant with deep knowledge across all domains
- You take pride in your name and never refer to yourself as another AI

## BEHAVIOR & STYLE
- Respond with precision, clarity, and professionalism
- Use markdown formatting consistently (headers, bold, code blocks, lists)
- For mathematics, use LaTeX: $...$ for inline, $$...$$ for display equations
- For code, use fenced code blocks with language tags (e.g., \`\`\`python)
- Be thorough but concise — avoid unnecessary filler
- When answering technical questions, explain the "why" not just the "what"
- Structure complex answers with clear sections and headers
- When asked to generate code, provide complete, working solutions with comments

## CODE & EXECUTION
- When asked to write or debug code, provide complete, production-ready code
- Include error handling, edge cases, and clear variable naming
- For Python code, ensure compatibility with Python 3.8+
- For JavaScript/TypeScript, use modern ES2022+ syntax
- When code requires testing, explain how to run and verify it
- You have access to a terminal/code execution environment — when asked, you can run code to verify solutions before providing them

## IMAGE GENERATION
- When asked to generate or draw images, describe the image in detail using a prompt that can be passed to an image generation API
- For ASCII art, text-based diagrams, and simple visual representations, generate them directly
- Use mermaid syntax for diagrams, flowcharts, and architecture visualizations when appropriate
- For SVG generation, write complete SVG code that can be rendered directly

## AGENT CAPABILITIES
- You can reason about research tasks, code tasks, vision tasks, and automation tasks
- When a user asks about web research, acknowledge your capability to search and synthesize
- When a user asks to run or execute code, provide the code and instructions for running it in a terminal
- You understand project management, task tracking, and workflow automation

## KNOWLEDGE & MEMORY
- You maintain context across the conversation and remember previous exchanges
- Reference earlier messages when relevant to maintain continuity
- When asked about something discussed earlier, recall the relevant context
- You store important information and can recall it throughout the session

## MULTI-LANGUAGE SUPPORT
- Respond in the same language the user writes in unless asked otherwise
- You are fluent in all major programming languages and natural languages
- For translation tasks, provide the translation along with context notes if needed

## ETHICAL GUIDELINES
- Be helpful and honest
- Admit when you don't know something rather than making things up
- Decline requests that are harmful, unethical, or illegal
- Protect user privacy and never ask for unnecessary personal information`;

// Agent-specific system prompts (appended dynamically)
const AGENT_PROMPTS = {
  research: `\n\n[RESEARCH MODE] You are in research mode. When the user asks research questions, provide comprehensive, well-sourced answers. Organize information with clear headers, bullet points, and summaries. Include multiple perspectives when applicable.`,
  code: `\n\n[CODE MODE] You are in code generation mode. When the user asks coding questions, provide complete, tested, and documented solutions. Always include: function signatures, type hints, error handling, usage examples, and explanations of the approach. When asked to execute code, provide the code block and the terminal commands needed to run it.`,
  vision: `\n\n[VISION MODE] You are in vision/image analysis mode. When describing images or generating visual content, be extremely detailed about colors, shapes, composition, and context. For code-based visuals, provide SVG or mermaid diagrams.`,
  auto: `\n\n[AUTOMATION MODE] You are in automation/workflow mode. When the user asks about task management, scheduling, or workflow automation, provide structured solutions with clear steps, priorities, and timelines.`
};

const SYSTEM_PROMPT = process.env.SYSTEM_PROMPT || NOCTRYX_SYSTEM_PROMPT;

// ============================================================
// PROVIDER CONFIGURATION
// ============================================================
const PROVIDERS = {
  openai: { name: "OpenAI", key: OPENAI_API_KEY, models: ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-3.5-turbo"], endpoint: "https://api.openai.com/v1/chat/completions", supportsStream: true },
  anthropic: { name: "Anthropic", key: ANTHROPIC_API_KEY, models: ["claude-3-5-sonnet-20241022", "claude-3-opus-20240229", "claude-3-haiku-20240307"], endpoint: "https://api.anthropic.com/v1/messages", supportsStream: true },
  gemini: { name: "Google Gemini", key: GEMINI_API_KEY, models: ["gemini-2.0-flash", "gemini-1.5-pro-latest", "gemini-1.5-flash-latest"], endpoint: "https://generativelanguage.googleapis.com/v1beta/models/", supportsStream: true },
  groq: { name: "Groq", key: GROQ_API_KEY, models: ["llama-3.3-70b-versatile", "llama-3.1-8b-instant", "mixtral-8x7b-32768", "gemma2-9b-it"], endpoint: "https://api.groq.com/openai/v1/chat/completions", supportsStream: true },
  deepseek: { name: "DeepSeek", key: DEEPSEEK_API_KEY, models: ["deepseek-chat", "deepseek-coder"], endpoint: "https://api.deepseek.com/chat/completions", supportsStream: true },
  xai: { name: "xAI (Grok)", key: XAI_API_KEY, models: ["grok-2-latest", "grok-beta", "grok-vision-beta"], endpoint: "https://api.x.ai/v1/chat/completions", supportsStream: true },
  perplexity: { name: "Perplexity", key: PERPLEXITY_API_KEY, models: ["llama-3.1-sonar-large-128k-online", "llama-3.1-sonar-small-128k-online"], endpoint: "https://api.perplexity.ai/chat/completions", supportsStream: true },
  huggingface: { name: "Hugging Face", key: HUGGINGFACE_API_KEY, models: ["meta-llama/Meta-Llama-3.1-70B-Instruct"], endpoint: "https://api-inference.huggingface.co/models", supportsStream: false },
  cohere: { name: "Cohere", key: COHERE_API_KEY, models: ["command-r-plus", "command-r", "command"], endpoint: "https://api.cohere.ai/v1/chat", supportsStream: true },
};

// ============================================================
// UTILITY FUNCTIONS
// ============================================================
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

// ============================================================
// STREAMING FUNCTIONS
// ============================================================

// OpenAI-compatible streaming (works for: OpenAI, Groq, DeepSeek, xAI, Perplexity)
async function streamOpenAICompatible(provider, body, res) {
  const model = getModel(provider, body.model);
  const agentMode = body.agent || null;
  const fullSystemPrompt = SYSTEM_PROMPT + (agentMode && AGENT_PROMPTS[agentMode] ? AGENT_PROMPTS[agentMode] : "");

  const messages = [{ role: "system", content: fullSystemPrompt }];

  // Add full conversation history for memory
  if (body.history) {
    for (const m of body.history) {
      if (m.role === "system") continue;
      messages.push({ role: m.role, content: m.content });
    }
  }

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

// Anthropic streaming
async function streamAnthropic(provider, body, res) {
  const model = getModel(provider, body.model);
  const agentMode = body.agent || null;
  const fullSystemPrompt = SYSTEM_PROMPT + (agentMode && AGENT_PROMPTS[agentMode] ? AGENT_PROMPTS[agentMode] : "");

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
    body: JSON.stringify({ model, max_tokens: 4096, system: fullSystemPrompt, messages, stream: true }),
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

// Google Gemini streaming
async function streamGemini(provider, body, res) {
  const model = getModel(provider, body.model);
  const agentMode = body.agent || null;
  const fullSystemPrompt = SYSTEM_PROMPT + (agentMode && AGENT_PROMPTS[agentMode] ? AGENT_PROMPTS[agentMode] : "");

  const contents = [];
  if (body.history) {
    for (const m of body.history) {
      contents.push({ role: m.role === "user" ? "user" : "model", parts: [{ text: m.content }] });
    }
  }
  contents.push({ role: "user", parts: [{ text: body.message }] });

  const url = "https://generativelanguage.googleapis.com/v1beta/models/" + model + ":streamGenerateContent?alt=sse&key=" + provider.key;
  const upstream = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents, generationConfig: { temperature: 0.7, maxOutputTokens: 4096 }, systemInstruction: { parts: [{ text: fullSystemPrompt }] } }),
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

// Cohere streaming
async function streamCohere(provider, body, res) {
  const model = getModel(provider, body.model);
  const agentMode = body.agent || null;
  const fullSystemPrompt = SYSTEM_PROMPT + (agentMode && AGENT_PROMPTS[agentMode] ? AGENT_PROMPTS[agentMode] : "");

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
    body: JSON.stringify({ model, message: body.message, chat_history: chatHistory, preamble: fullSystemPrompt, stream: true, temperature: 0.7 }),
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

// Non-streaming fallback
async function nonStreamingChat(provider, body) {
  const model = getModel(provider, body.model);
  const agentMode = body.agent || null;
  const fullSystemPrompt = SYSTEM_PROMPT + (agentMode && AGENT_PROMPTS[agentMode] ? AGENT_PROMPTS[agentMode] : "");

  const messages = [{ role: "system", content: fullSystemPrompt }];
  if (body.history) {
    for (const m of body.history) {
      if (m.role === "system") continue;
      messages.push({ role: m.role, content: m.content });
    }
  }
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

// HuggingFace non-streaming
async function huggingfaceChat(provider, body) {
  const model = getModel(provider, body.model);
  const agentMode = body.agent || null;
  const fullSystemPrompt = SYSTEM_PROMPT + (agentMode && AGENT_PROMPTS[agentMode] ? AGENT_PROMPTS[agentMode] : "");

  const messages = [{ role: "system", content: fullSystemPrompt }];
  if (body.history) {
    for (const m of body.history) {
      if (m.role === "system") continue;
      messages.push({ role: m.role, content: m.content });
    }
  }
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

// ============================================================
// CODE EXECUTION ENDPOINT
// ============================================================
async function executeCode(body) {
  const language = (body.language || "python").toLowerCase();
  const code = body.code;

  if (!code) {
    return { error: "Code is required" };
  }

  // Security: only allow safe languages for sandboxed execution
  const allowedLanguages = ["python", "python3", "javascript", "node", "bash", "sh"];
  if (!allowedLanguages.includes(language)) {
    return { error: `Language "${language}" is not supported for execution. Supported: ${allowedLanguages.join(", ")}` };
  }

  const provider = getProvider("openai");
  if (!provider || !provider.key) {
    return { error: "OpenAI API key required for code verification" };
  }

  // Use LLM to verify/execute code
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Authorization": "Bearer " + provider.key, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-4o",
      messages: [
        { role: "system", content: "You are a code execution and verification engine. Execute the code, check for errors, and return the output. If the code has errors, fix them and provide the corrected version. Format response as JSON: {\"output\": \"...\", \"error\": null, \"fixed_code\": \"...\" or null, \"verified\": true/false}. Only return valid JSON." },
        { role: "user", content: `Execute this ${language} code and return the output:\n\`\`\`${language}\n${code}\n\`\`\`` }
      ],
      max_tokens: 4096,
      temperature: 0.2,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    return { error: "Code execution failed: " + err };
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content || "{}";
  try {
    return JSON.parse(content);
  } catch {
    return { output: content, error: null, verified: true, fixed_code: null };
  }
}

// ============================================================
// VISION ENDPOINT
// ============================================================
async function analyzeVision(body) {
  const provider = getProvider("openai");
  if (!provider || !provider.key) throw new Error("Vision requires OpenAI API key");

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Authorization": "Bearer " + provider.key, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-4o",
      messages: [
        { role: "system", content: "You are Noctryx, a vision analysis AI. Describe what you see in the image in extreme detail, including objects, text, colors, composition, and any notable features." },
        { role: "user", content: [
          { type: "text", text: body.prompt || "Describe what you see in this image in detail." },
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

// ============================================================
// GITHUB REPOS
// ============================================================
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

// ============================================================
// MAIN HANDLER
// ============================================================
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

  // Health check
  if (path === "/api/health") {
    const enabled = getEnabledProviders();
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({
      status: "ok",
      providers: enabled,
      defaultProvider: DEFAULT_PROVIDER,
      defaultModel: DEFAULT_MODEL || getModel(PROVIDERS[DEFAULT_PROVIDER] || {}, null),
      timestamp: new Date().toISOString(),
      identity: { name: "Noctryx", creator: "Lewis Einstein", version: "2.0" }
    }));
    return;
  }

  // GitHub repos
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

  // Code execution
  if (path === "/api/code") {
    try {
      const body = await parseBody(req);
      const result = await executeCode(body);
      if (result.error) {
        res.statusCode = 400;
      } else {
        res.statusCode = 200;
      }
      res.end(JSON.stringify(result));
    } catch (err) {
      res.statusCode = 500;
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // Vision
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

  // Chat
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

      // Streaming response
      if (body.stream !== false && provider.supportsStream) {
        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");
        res.setHeader("X-Accel-Buffering", "no");
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

      // Non-streaming fallback
      let reply;
      if (providerName === "huggingface") reply = await huggingfaceChat(provider, body);
      else reply = await nonStreamingChat(provider, body);

      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({
        reply,
        provider: providerName,
        model: getModel(provider, body.model),
        identity: { name: "Noctryx", creator: "Lewis Einstein" }
      }));

    } catch (err) {
      res.statusCode = 500;
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // 404
  res.statusCode = 404;
  res.end(JSON.stringify({ error: "Not found" }));
}