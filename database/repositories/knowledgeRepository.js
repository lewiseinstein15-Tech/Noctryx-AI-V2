/**
 * ═══════════════════════════════════════════════
 * Noctryx AI V2 - Knowledge Repository
 * Creator: Lewis Einstein
 * ═══════════════════════════════════════════════
 */

const db = require('../db');
const crypto = require('crypto');

class KnowledgeRepository {
  static findByQuery(query) {
    const stmt = db.prepare(`
      SELECT * FROM knowledge 
      WHERE ? LIKE '%' || topic || '%' AND confidence >= 0.80
      ORDER BY confidence DESC LIMIT 1
    `);
    const q = query.toLowerCase().trim();
    return stmt.get(q);
  }

  static upsert(topic, content, category = 'general', confidence = 0.95) {
    const normalizedTopic = topic.toLowerCase().trim();
    const existing = db.prepare(`SELECT id FROM knowledge WHERE topic = ?`).get(normalizedTopic);

    if (existing) {
      const updateStmt = db.prepare(`
        UPDATE knowledge 
        SET content = ?, confidence = ?, updated_at = CURRENT_TIMESTAMP 
        WHERE topic = ?
      `);
      return updateStmt.run(content, confidence, normalizedTopic);
    } else {
      const insertStmt = db.prepare(`
        INSERT INTO knowledge (id, topic, content, category, confidence) 
        VALUES (?, ?, ?, ?, ?)
      `);
      return insertStmt.run(crypto.randomUUID(), normalizedTopic, content, category, confidence);
    }
  }
}

module.exports = KnowledgeRepository;
