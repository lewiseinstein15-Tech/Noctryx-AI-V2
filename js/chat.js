/**
 * Noctryx AI V2 - Chat Module
 * Real chat UI with streaming, markdown, and history.
 */

import { $, $$, parseMarkdown, escapeHtml, speak } from './utils.js';
import { streamChat } from './api.js';
import { getMessages, addMessage, clearMessages } from './memory.js';

let currentAbort = null;
let isTyping = false;

export function initChat() {
  const container = $('#chatContainer');
  const form = $('#chatForm');
  const input = $('#chatInput');
  
  // Load history
  renderHistory();
  
  form?.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text || isTyping) return;
    sendMessage(text);
    input.value = '';
  });
  
  // Quick action to chat
  document.addEventListener('click', (e) => {
    const qa = e.target.closest('[data-action="chat"]');
    if (qa) {
      window.dispatchEvent(new CustomEvent('navigate', { detail: { tab: 'chat' } }));
      setTimeout(() => $('#chatInput')?.focus(), 300);
    }
  });
}

function renderHistory() {
  const container = $('#chatContainer');
  if (!container) return;
  
  const msgs = getMessages();
  if (msgs.length === 0) return;
  
  // Remove welcome
  const welcome = container.querySelector('.chat-welcome');
  welcome?.remove();
  
  msgs.forEach(m => appendBubble(m.role, m.content, false));
  scrollToBottom();
}

function appendBubble(role, content, animate = true) {
  const container = $('#chatContainer');
  if (!container) return;
  
  const welcome = container.querySelector('.chat-welcome');
  welcome?.remove();
  
  const div = document.createElement('div');
  div.className = `chat-message ${role}${animate ? '' : ''}`;
  const initials = role === 'user' ? 'You' : 'NX';
  const html = parseMarkdown(content);
  
  div.innerHTML = `
    <div class="chat-avatar">${initials}</div>
    <div class="chat-bubble">${html}</div>
  `;
  
  container.appendChild(div);
  if (animate) scrollToBottom();
}

function scrollToBottom() {
  const container = $('#chatContainer');
  if (container) container.scrollTop = container.scrollHeight;
}

async function sendMessage(text) {
  const indicator = $('#typingIndicator');
  
  // User message
  appendBubble('user', text);
  addMessage('user', text);
  
  // AI placeholder
  isTyping = true;
  indicator?.classList.add('active');
  
  const aiDiv = document.createElement('div');
  aiDiv.className = 'chat-message';
  aiDiv.innerHTML = `
    <div class="chat-avatar">NX</div>
    <div class="chat-bubble" id="aiBubble"><em>Thinking...</em></div>
  `;
  $('#chatContainer')?.appendChild(aiDiv);
  scrollToBottom();
  
  const bubble = $('#aiBubble');
  let fullText = '';
  
  // If no API configured, show a helpful local response
  const config = JSON.parse(localStorage.getItem('noctryx_api_config') || '{}');
  if (!config.endpoint) {
    fullText = `**Noctryx AI** is ready, but no backend is configured yet.\n\nGo to **More > Settings** to set your API endpoint and key. I support any OpenAI-compatible endpoint.\n\nYou asked: "${text}"`;
    if (bubble) bubble.innerHTML = parseMarkdown(fullText);
    addMessage('assistant', fullText);
    finishTyping();
    return;
  }
  
  const history = getMessages().slice(-20).map(m => ({ role: m.role, content: m.content }));
  
  try {
    currentAbort = await streamChat(
      history,
      (chunk) => {
        fullText += chunk;
        if (bubble) bubble.innerHTML = parseMarkdown(fullText);
        scrollToBottom();
      },
      () => {
        addMessage('assistant', fullText);
        finishTyping();
      },
      (err) => {
        fullText += `\n\n_Error: ${err.message}_`;
        if (bubble) bubble.innerHTML = parseMarkdown(fullText);
        addMessage('assistant', fullText);
        finishTyping();
      }
    );
  } catch (err) {
    fullText += `\n\n_Error: ${err.message}_`;
    if (bubble) bubble.innerHTML = parseMarkdown(fullText);
    addMessage('assistant', fullText);
    finishTyping();
  }
}

function finishTyping() {
  isTyping = false;
  $('#typingIndicator')?.classList.remove('active');
  const bubble = $('#aiBubble');
  if (bubble) bubble.removeAttribute('id');
}

export function stopChat() {
  if (currentAbort) {
    currentAbort.abort();
    currentAbort = null;
  }
}
