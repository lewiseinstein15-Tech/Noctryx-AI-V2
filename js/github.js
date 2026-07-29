/**
 * Noctryx AI V2 - GitHub Integration
 * Fetches real repository data via GitHub REST API.
 */

import { getGithubConfig } from './memory.js';
import { timeAgo, escapeHtml } from './utils.js';

const API_BASE = 'https://api.github.com';

export async function fetchRepositories(username = null) {
  const config = getGithubConfig();
  const user = username || config.username || 'octocat'; // fallback demo user if none set
  
  const headers = {
    'Accept': 'application/vnd.github.v3+json',
  };
  if (config.token) {
    headers['Authorization'] = `token ${config.token}`;
  }

  try {
    const res = await fetch(`${API_BASE}/users/${encodeURIComponent(user)}/repos?sort=updated&per_page=10`, { headers });
    if (!res.ok) throw new Error(`GitHub API ${res.status}`);
    const repos = await res.json();
    return repos.map(r => ({
      id: r.id,
      name: r.name,
      fullName: r.full_name,
      description: r.description || '',
      private: r.private,
      stars: r.stargazers_count,
      forks: r.forks_count,
      issues: r.open_issues_count,
      language: r.language,
      updated: r.updated_at,
      url: r.html_url,
      defaultBranch: r.default_branch,
    }));
  } catch (err) {
    console.error('GitHub fetch failed:', err);
    return [];
  }
}

export async function fetchRepoDetails(owner, repo) {
  const config = getGithubConfig();
  const headers = {};
  if (config.token) headers['Authorization'] = `token ${config.token}`;
  
  try {
    const [repoRes, commitsRes, branchesRes] = await Promise.all([
      fetch(`${API_BASE}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`, { headers }),
      fetch(`${API_BASE}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/commits?per_page=5`, { headers }),
      fetch(`${API_BASE}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/branches?per_page=5`, { headers }),
    ]);
    
    const repoData = repoRes.ok ? await repoRes.json() : {};
    const commits = commitsRes.ok ? await commitsRes.json() : [];
    const branches = branchesRes.ok ? await branchesRes.json() : [];
    
    return {
      ...repoData,
      recentCommits: commits.map(c => ({
        sha: c.sha?.slice(0, 7),
        message: c.commit?.message,
        author: c.commit?.author?.name,
        date: c.commit?.author?.date,
      })),
      branches: branches.map(b => b.name),
    };
  } catch (err) {
    console.error('Repo details failed:', err);
    return null;
  }
}

export function renderRepoCard(repo) {
  const langColors = {
    JavaScript: '#f1e05a', TypeScript: '#2b7489', Python: '#3572A5',
    Java: '#b07219', Go: '#00ADD8', Rust: '#dea584',
    'C++': '#f34b7d', C: '#555555', HTML: '#e34c26',
    CSS: '#563d7c', Shell: '#89e051', null: '#8b949e',
  };
  
  const color = langColors[repo.language] || '#8b949e';
  
  return `
    <div class="repo-card" data-repo="${escapeHtml(repo.fullName)}">
      <div class="repo-header">
        <div class="repo-name">${escapeHtml(repo.name)}</div>
        ${repo.private ? '<span class="repo-private">Private</span>' : ''}
      </div>
      <div class="repo-desc">${escapeHtml(repo.description)}</div>
      <div class="repo-stats">
        <div class="repo-stat">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
          ${repo.stars}
        </div>
        <div class="repo-stat">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><circle cx="18" cy="6" r="3"/><line x1="6" y1="9" x2="6" y2="15"/><line x1="18" y1="9" x2="18" y2="15"/></svg>
          ${repo.forks}
        </div>
        <div class="repo-stat">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          ${repo.issues}
        </div>
        <div class="repo-lang">
          <span class="lang-dot" style="background:${color}"></span>
          ${repo.language || 'Unknown'}
        </div>
        <div class="repo-stat" style="margin-left:auto;">
          ${timeAgo(repo.updated)}
        </div>
      </div>
    </div>
  `;
}

export function renderProjectItem(repo) {
  // Simplified project row for home screen
  const pct = Math.min(100, Math.max(5, repo.stars * 2 + 10));
  return `
    <div class="project-item">
      <div class="project-icon">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"/></svg>
      </div>
      <div class="project-info">
        <div class="project-name">${escapeHtml(repo.name)}</div>
        <div class="project-meta">${repo.language || 'No language'} · Updated ${timeAgo(repo.updated)}</div>
        <div class="project-track"><div class="project-fill" style="width:${pct}%"></div></div>
      </div>
      <div class="project-pct">${repo.stars}★</div>
    </div>
  `;
}
