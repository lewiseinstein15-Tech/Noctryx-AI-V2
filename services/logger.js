/**
 * ═══════════════════════════════════════════════
 * Noctryx AI V2 - Logger Service
 * Creator: Lewis Einstein
 * ═══════════════════════════════════════════════
 */

class Logger {
  static format(level, message, meta = {}) {
    return JSON.stringify({
      timestamp: new Date().toISOString(),
      app: 'Noctryx AI V2',
      level,
      message,
      ...meta
    });
  }

  static info(msg, meta) {
    console.log(Logger.format('INFO', msg, meta));
  }

  static warn(msg, meta) {
    console.warn(Logger.format('WARN', msg, meta));
  }

  static error(msg, meta) {
    console.error(Logger.format('ERROR', msg, meta));
  }
}

module.exports = Logger;
