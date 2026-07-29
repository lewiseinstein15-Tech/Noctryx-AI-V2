/**
 * Noctryx AI V2 - Memory Engine
 * Local persistence for tasks, messages, and app state.
 */

import { loadFromStorage, saveToStorage, generateId } from './utils.js';

const KEYS = {
  tasks: 'tasks',
  messages: 'messages',
  messageCount: 'messageCount',
  researchCount: 'researchCount',
  completedCount: 'completedCount',
  githubToken: 'github_token',
  githubUsername: 'github_username',
  apiConfig: 'api_config',
};

// Tasks
export function getTasks() {
  return loadFromStorage(KEYS.tasks, []);
}

export function addTask(text) {
  const tasks = getTasks();
  tasks.push({ id: generateId(), text, done: false, created: Date.now() });
  saveToStorage(KEYS.tasks, tasks);
  return tasks;
}

export function toggleTask(id) {
  const tasks = getTasks().map(t => t.id === id ? { ...t, done: !t.done } : t);
  saveToStorage(KEYS.tasks, tasks);
  updateCompletedCount();
  return tasks;
}

export function deleteTask(id) {
  const tasks = getTasks().filter(t => t.id !== id);
  saveToStorage(KEYS.tasks, tasks);
  updateCompletedCount();
  return tasks;
}

function updateCompletedCount() {
  const done = getTasks().filter(t => t.done).length;
  saveToStorage(KEYS.completedCount, done);
}

export function getCompletedCount() {
  return loadFromStorage(KEYS.completedCount, 0);
}

// Messages
export function getMessages() {
  return loadFromStorage(KEYS.messages, []);
}

export function addMessage(role, content) {
  const msgs = getMessages();
  msgs.push({ id: generateId(), role, content, time: Date.now() });
  saveToStorage(KEYS.messages, msgs);
  incrementMessageCount();
  return msgs;
}

export function clearMessages() {
  saveToStorage(KEYS.messages, []);
  saveToStorage(KEYS.messageCount, 0);
}

function incrementMessageCount() {
  const count = loadFromStorage(KEYS.messageCount, 0) + 1;
  saveToStorage(KEYS.messageCount, count);
}

export function getMessageCount() {
  return loadFromStorage(KEYS.messageCount, 0);
}

// Research
export function incrementResearch() {
  const count = loadFromStorage(KEYS.researchCount, 0) + 1;
  saveToStorage(KEYS.researchCount, count);
  return count;
}

export function getResearchCount() {
  return loadFromStorage(KEYS.researchCount, 0);
}

// GitHub Config
export function getGithubConfig() {
  return {
    token: loadFromStorage(KEYS.githubToken, ''),
    username: loadFromStorage(KEYS.githubUsername, ''),
  };
}

export function setGithubConfig({ token, username }) {
  if (token !== undefined) saveToStorage(KEYS.githubToken, token);
  if (username !== undefined) saveToStorage(KEYS.githubUsername, username);
}

// Overview updater
export function updateOverviewUI() {
  const taskEl = document.getElementById('taskCount');
  const msgEl = document.getElementById('messageCount');
  const researchEl = document.getElementById('researchCount');
  const completedEl = document.getElementById('completedCount');
  
  if (taskEl) taskEl.textContent = getTasks().length;
  if (msgEl) msgEl.textContent = getMessageCount();
  if (researchEl) researchEl.textContent = getResearchCount();
  if (completedEl) completedEl.textContent = getCompletedCount();
}
