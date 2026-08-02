const db = require('../db');

class KnowledgeRepository {
  static findByQuery(query) {
    try {
      const stmt = db.prepare(`SELECT * FROM knowledge WHERE query = ?`);
      return stmt.get(query) || null;
    } catch { return null; }
  }
  static upsert(query, content, topic = 'general') {
    try {
      const stmt = db.prepare(`INSERT OR REPLACE INTO knowledge (id, query, topic, content, created_at) VALUES (?, ?, ?, ?, datetime('now'))`);
      stmt.run(crypto.randomUUID(), query, topic, content);
    } catch {}
  }
}
module.exports = KnowledgeRepository;
