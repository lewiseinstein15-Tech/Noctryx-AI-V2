class Logger {
  static format(level, message, meta = {}) {
    return JSON.stringify({ timestamp: new Date().toISOString(), app: 'Noctryx', level, message, ...meta });
  }
  static info(msg, meta) { console.log(Logger.format('INFO', msg, meta)); }
  static warn(msg, meta) { console.warn(Logger.format('WARN', msg, meta)); }
  static error(msg, meta) { console.error(Logger.format('ERROR', msg, meta)); }
}

export default Logger;
