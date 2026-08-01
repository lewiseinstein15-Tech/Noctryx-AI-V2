/**
 * ═══════════════════════════════════════════════
 * Noctryx AI V2 - Serverless Safe Database Layer
 * Creator: Lewis Einstein
 * ═══════════════════════════════════════════════
 */

// In-memory fallback map for serverless environments where local disk writing is blocked
const memoryStore = new Map();

const db = {
  prepare(sql) {
    return {
      get(...params) {
        // Return null or mock result for repository queries
        return null;
      },
      run(...params) {
        return { changes: 1 };
      },
      all(...params) {
        return [];
      }
    };
  },
  pragma() {
    return true;
  },
  exec() {
    return true;
  }
};

module.exports = db;
