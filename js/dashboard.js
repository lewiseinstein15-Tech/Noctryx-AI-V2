/**
 * Noctryx AI V2 - Dashboard Controller
 * Handles navigation, screen switching, and global UI events.
 */

import { $, $$ } from './utils.js';
import { updateOverviewUI } from './memory.js';

let currentTab = 'home';

export function initDashboard() {
  // Navigation
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const tab = item.dataset.tab;
      navigateTo(tab);
    });
  });

  // Back buttons
  document.addEventListener('click', (e) => {
    const back = e.target.closest('[data-back]');
    if (back) {
      navigateTo(back.dataset.back);
    }
  });

  // Custom navigate event
  window.addEventListener('navigate', (e) => {
    navigateTo(e.detail.tab);
  });

  // Quick actions
  document.querySelectorAll('.qa-item').forEach(btn => {
    btn.addEventListener('click', () => {
      const action = btn.dataset.action;
      const routes = {
        chat: 'chat',
        code: 'chat',
        vision: 'vision',
        voice: 'voice',
        agents: 'more',
      };
      if (routes[action]) navigateTo(routes[action]);
    });
  });

  // More screen items
  document.addEventListener('click', (e) => {
    const more = e.target.closest('[data-more]');
    if (!more) return;

    const key = more.dataset.more;
    const sections = {
      system: '#systemInfoSection',
      tasks: '#taskManagerSection',
    };

    // Hide all sub-sections first
    Object.values(sections).forEach(sel => {
      const el = $(sel);
      if (el) el.style.display = 'none';
    });

    // Show selected
    const target = sections[key];
    if (target) {
      const el = $(target);
      if (el) {
        el.style.display = 'block';
        el.scrollIntoView({ behavior: 'smooth' });
      }
    }

    // Handle special routes
    if (key === 'memory') {
      window.dispatchEvent(new CustomEvent('navigate', { detail: { tab: 'chat' } }));
    }
  });

  // Header buttons
  $('#menuBtn')?.addEventListener('click', () => {
    // Future: open sidebar menu
    console.log('[Menu] Open sidebar');
  });

  $('#expandBtn')?.addEventListener('click', () => {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else {
      document.documentElement.requestFullscreen().catch(() => {});
    }
  });

  $('#profileBtn')?.addEventListener('click', () => {
    navigateTo('more');
  });

  // Initial overview
  updateOverviewUI();
}

export function navigateTo(tab) {
  if (tab === currentTab && tab !== 'home') return;

  // Hide all screens
  $$('.screen').forEach(s => s.classList.remove('active'));

  // Show target
  const target = $(`#screen-${tab}`);
  if (target) target.classList.add('active');

  // Update nav
  $$('.nav-item').forEach(n => n.classList.remove('active'));
  const navItem = $(`.nav-item[data-tab="${tab}"]`);
  if (navItem) navItem.classList.add('active');

  currentTab = tab;

  // Screen-specific init
  if (tab === 'projects') {
    import('./github.js').then(m => m.loadProjects?.()).catch(() => {});
  }

  window.scrollTo(0, 0);
}

export function getCurrentTab() {
  return currentTab;
}
