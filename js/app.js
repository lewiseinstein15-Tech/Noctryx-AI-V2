/**
 * Noctryx AI V2 - Application Bootstrap
 * Initializes all modules in dependency order.
 */

import { initDashboard } from './dashboard.js';
import { initSystemMonitor } from './system.js';
import { initChat } from './chat.js';
import { initVoice } from './voice.js';
import { initAgents } from './agents.js';
import { updateOverviewUI } from './memory.js';
import { $ } from './utils.js';
import { fetchRepositories, renderProjectItem } from './github.js';

// Register Service Worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js')
      .then(reg => console.log('[SW] Registered:', reg.scope))
      .catch(err => console.log('[SW] Registration failed:', err));
  });
}

// Greeting updater
function updateGreeting() {
  const h = new Date().getHours();
  const line = $('#greetingLine');
  if (!line) return;
  if (h < 5) line.textContent = 'Still up,';
  else if (h < 12) line.textContent = 'Good morning,';
  else if (h < 17) line.textContent = 'Good afternoon,';
  else if (h < 21) line.textContent = 'Good evening,';
  else line.textContent = 'Good night,';
}

// Search form handler
function initSearch() {
  $('#searchForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const val = $('#askInput')?.value.trim();
    if (!val) return;
    // Route to chat with the query
    window.dispatchEvent(new CustomEvent('navigate', { detail: { tab: 'chat' } }));
    setTimeout(() => {
      const chatInput = $('#chatInput');
      if (chatInput) {
        chatInput.value = val;
        $('#chatForm')?.dispatchEvent(new Event('submit'));
      }
    }, 300);
  });
}

// Task manager init
function initTaskManager() {
  const form = $('#taskForm');
  const list = $('#taskList');
  if (!form || !list) return;

  function render() {
    import('./memory.js').then(m => {
      const tasks = m.getTasks();
      list.innerHTML = tasks.map(t => `
        <div class="task-item" data-task-id="${t.id}">
          <div class="task-check ${t.done ? 'checked' : ''}">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
          </div>
          <div class="task-text ${t.done ? 'done' : ''}">${t.text}</div>
          <button class="task-delete" data-delete="${t.id}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
      `).join('');
      updateOverviewUI();
    });
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const input = $('#taskInput');
    const text = input?.value.trim();
    if (!text) return;
    import('./memory.js').then(m => {
      m.addTask(text);
      input.value = '';
      render();
    });
  });

  list.addEventListener('click', (e) => {
    const check = e.target.closest('.task-check');
    const del = e.target.closest('[data-delete]');
    if (check) {
      const id = check.closest('[data-task-id]')?.dataset.taskId;
      if (id) import('./memory.js').then(m => { m.toggleTask(id); render(); });
    }
    if (del) {
      const id = del.dataset.delete;
      if (id) import('./memory.js').then(m => { m.deleteTask(id); render(); });
    }
  });

  render();
}

// System info panel
function initSystemInfo() {
  const panel = $('#systemInfoPanel');
  if (!panel) return;

  function render() {
    const sys = window.__noctryx_system || {};
    const net = window.__noctryx_network || {};
    const storage = window.__noctryx_storage || {};
    const heap = window.__noctryx_heap || {};
    const battery = window.__noctryx_system?.battery;

    const rows = [
      ['Time', window.__noctryx_time || '--'],
      ['Date', window.__noctryx_date || '--'],
      ['Browser', sys.browser || 'Unavailable'],
      ['Platform', sys.platform || 'Unavailable'],
      ['Online Status', sys.online || 'Unavailable'],
      ['Resolution', sys.resolution || 'Unavailable'],
      ['Language', sys.language || 'Unavailable'],
      ['CPU Cores', sys.cores || 'Unavailable'],
      ['Connection', net.type ? `${net.type} (${net.downlink} Mbps)` : 'Unavailable'],
      ['Device Memory', navigator.deviceMemory ? `~${navigator.deviceMemory} GB` : 'Unavailable'],
      ['Storage Used', storage.used ? `${storage.used} / ${storage.total}` : 'Unavailable'],
      ['JS Heap Used', heap.used || 'Unavailable'],
      ['Battery', battery ? `${battery.level}%${battery.charging ? ' (Charging)' : ''}` : 'Unavailable'],
    ];

    panel.innerHTML = rows.map(([label, value]) => `
      <div class="sys-row">
        <span class="sys-label">${label}</span>
        <span class="sys-value">${value}</span>
      </div>
    `).join('');
  }

  render();
  setInterval(render, 2000);
}

// GitHub projects loader
async function loadProjects() {
  const panel = $('#projectsPanel');
  const list = $('#projectsList');
  if (!panel && !list) return;

  const repos = await fetchRepositories();
  const html = repos.length
    ? repos.slice(0, 3).map(renderProjectItem).join('')
    : `<div class="project-item project-empty">
         <div class="project-info">
           <div class="project-name">No repositories found</div>
           <div class="project-meta">Set GitHub username in Settings</div>
         </div>
       </div>`;

  if (panel) panel.innerHTML = html;

  if (list) {
    if (repos.length === 0) {
      list.innerHTML = '<div class="project-loading">No repositories. Configure GitHub in Settings.</div>';
    } else {
      const { renderRepoCard } = await import('./github.js');
      list.innerHTML = repos.map(renderRepoCard).join('');
    }
  }
}

// Vision camera
function initVision() {
  const video = $('#visionVideo');
  const preview = $('#visionPreview');
  const captureBtn = $('#visionCaptureBtn');
  const analyzeBtn = $('#visionAnalyzeBtn');
  const output = $('#visionOutput');

  if (!video || !preview) return;

  let stream = null;

  async function startCamera() {
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      video.srcObject = stream;
      preview.classList.add('active');
    } catch (err) {
      console.warn('Camera access denied:', err);
      if (output) output.innerHTML = '<div class="vision-output-text">Camera access denied. Check permissions.</div>';
    }
  }

  captureBtn?.addEventListener('click', () => {
    if (!stream) {
      startCamera();
      return;
    }
    const canvas = $('#visionCanvas');
    if (!canvas) return;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0);
    // Flash effect
    preview.style.filter = 'brightness(2)';
    setTimeout(() => preview.style.filter = '', 150);
  });

  analyzeBtn?.addEventListener('click', () => {
    if (!stream) {
      startCamera();
      return;
    }
    if (output) {
      output.innerHTML = '<div class="vision-output-text"><em>Analyzing image...</em></div>';
      setTimeout(() => {
        output.innerHTML = '<div class="vision-output-text">Vision analysis ready. Connect a vision model backend to process frames.</div>';
      }, 1500);
    }
  });
}

// Main init
document.addEventListener('DOMContentLoaded', () => {
  updateGreeting();
  setInterval(updateGreeting, 60000);

  initDashboard();
  initSystemMonitor();
  initChat();
  initVoice();
  initAgents();
  initSearch();
  initTaskManager();
  initSystemInfo();
  initVision();

  // Load GitHub projects
  loadProjects();

  // Refresh overview periodically
  setInterval(updateOverviewUI, 5000);

  console.log('[Noctryx] System initialized');
});
