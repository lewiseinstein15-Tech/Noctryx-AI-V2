import db from '../database/db.js';
import crypto from 'crypto';

class MetricsService {
  constructor() { this.activeStreams = 0; }
  incrementActiveStreams() { this.activeStreams++; }
  decrementActiveStreams() { this.activeStreams--; }
  record(providerName, latencyMs, success, errorMessage = null) {
    try {
      const stmt = db.prepare(`INSERT INTO provider_metrics (id, provider_name, latency_ms, success, error_message) VALUES (?, ?, ?, ?, ?)`);
      stmt.run(crypto.randomUUID(), providerName, latencyMs, success ? 1 : 0, errorMessage);
    } catch {}
  }
  getOverview() {
    try {
      const stats = db.prepare(`SELECT provider_name, COUNT(*) as requests, SUM(success) as successes, AVG(latency_ms) as avg_latency FROM provider_metrics GROUP BY provider_name`).all();
      return { activeStreams: this.activeStreams, uptime: process.uptime(), providers: stats };
    } catch { return { activeStreams: this.activeStreams, uptime: process.uptime(), providers: [] }; }
  }
}

export default new MetricsService();
