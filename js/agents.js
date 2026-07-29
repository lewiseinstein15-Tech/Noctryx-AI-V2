/**
 * Noctryx AI V2 - Agents Module
 * Architecture for future agent system. Currently registers agents
 * and provides the foundation for automation, research, coding, etc.
 */

import { $ } from './utils.js';

const AGENTS = [
  { id: 'research', name: 'Research', icon: 'search', status: 'ready', description: 'Web research and data gathering' },
  { id: 'github', name: 'GitHub', icon: 'github', status: 'ready', description: 'Repository management and code review' },
  { id: 'code', name: 'Code', icon: 'code', status: 'ready', description: 'Code generation and debugging' },
  { id: 'memory', name: 'Memory', icon: 'database', status: 'ready', description: 'Long-term memory and recall' },
  { id: 'vision', name: 'Vision', icon: 'eye', status: 'ready', description: 'Image analysis and processing' },
  { id: 'automation', name: 'Automation', icon: 'settings', status: 'ready', description: 'Workflow automation and scheduling' },
];

export function initAgents() {
  // Agent grid clicks
  document.addEventListener('click', (e) => {
    const agent = e.target.closest('[data-agent]');
    if (!agent) return;

    const id = agent.dataset.agent;
    const agentData = AGENTS.find(a => a.id === id);

    // Future: open agent-specific panel
    // For now, route to relevant screen
    const routes = {
      github: 'projects',
      vision: 'vision',
      code: 'chat',
      research: 'chat',
      memory: 'more',
      automation: 'more',
    };

    const target = routes[id] || 'chat';
    window.dispatchEvent(new CustomEvent('navigate', { detail: { tab: target } }));

    // If chat, prepend context
    if (target === 'chat') {
      setTimeout(() => {
        const input = $('#chatInput');
        if (input && agentData) {
          input.value = `[${agentData.name} Agent] `;
          input.focus();
        }
      }, 300);
    }
  });

  $('#viewAllAgents')?.addEventListener('click', () => {
    window.dispatchEvent(new CustomEvent('navigate', { detail: { tab: 'more' } }));
  });
}

export function getAgent(id) {
  return AGENTS.find(a => a.id === id);
}

export function getAllAgents() {
  return [...AGENTS];
}

// Future: agent execution engine
export async function executeAgent(agentId, context) {
  console.log(`[Agent] ${agentId} executing with context:`, context);
  // Placeholder for future automation wiring
  return { success: true, agentId, result: null };
}
