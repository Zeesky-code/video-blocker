/**
 * Enhanced Logger System for Video Blocker
 * Provides structured logging with levels, timestamps, and performance metrics
 */

import { STORAGE } from '../constants.js';

class Logger {
  constructor(prefix = 'VideoBlocker') {
    this.prefix = prefix;
    this.logLevel = this.getLogLevel();
    this.startTime = Date.now();
    this.metrics = {
      operations: 0,
      errors: 0,
      warnings: 0
    };
  }

  /**
   * Get log level from storage or default to INFO
   */
  getLogLevel() {
    try {
      const stored = localStorage.getItem(STORAGE.LOG_LEVEL_KEY);
      return stored || 'INFO';
    } catch (e) {
      return 'INFO';
    }
  }

  /**
   * Set log level and persist to storage
   */
  setLogLevel(level) {
    const validLevels = ['DEBUG', 'INFO', 'WARN', 'ERROR'];
    if (validLevels.includes(level)) {
      this.logLevel = level;
      try {
        localStorage.setItem(STORAGE.LOG_LEVEL_KEY, level);
      } catch (e) {
        // Storage might be restricted
      }
    }
  }

  /**
   * Check if message should be logged based on current log level
   */
  shouldLog(messageLevel) {
    const levels = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 };
    return levels[messageLevel] >= levels[this.logLevel];
  }

  /**
   * Format timestamp for logs
   */
  getTimestamp() {
    const now = new Date();
    const elapsed = now.getTime() - this.startTime;
    return `${now.toTimeString().split(' ')[0]}.${now.getMilliseconds().toString().padStart(3, '0')} (+${elapsed}ms)`;
  }

  /**
   * Format log message with metadata
   */
  formatMessage(level, category, message, data = null) {
    const timestamp = this.getTimestamp();
    const prefix = `[${this.prefix}:${level}] ${timestamp} [${category}]`;

    if (data) {
      return [prefix, message, data];
    }
    return [prefix, message];
  }

  /**
   * Debug level logging
   */
  debug(category, message, data = null) {
    if (this.shouldLog('DEBUG')) {
      console.debug(...this.formatMessage('DEBUG', category, message, data));
    }
  }

  /**
   * Info level logging
   */
  info(category, message, data = null) {
    if (this.shouldLog('INFO')) {
      console.info(...this.formatMessage('INFO', category, message, data));
    }
  }

  /**
   * Warning level logging
   */
  warn(category, message, data = null) {
    if (this.shouldLog('WARN')) {
      console.warn(...this.formatMessage('WARN', category, message, data));
      this.metrics.warnings++;
    }
  }

  /**
   * Error level logging
   */
  error(category, message, error = null) {
    if (this.shouldLog('ERROR')) {
      const errorData = error ? {
        message: error.message,
        stack: error.stack,
        name: error.name
      } : null;
      console.error(...this.formatMessage('ERROR', category, message, errorData));
      this.metrics.errors++;
    }
  }



  /**
   * Log system metrics
   */
  logMetrics() {
    const uptime = Date.now() - this.startTime;
    this.info('SYSTEM', 'Runtime metrics', {
      uptime: `${(uptime / 1000).toFixed(1)}s`,
      operations: this.metrics.operations,
      warnings: this.metrics.warnings,
      errors: this.metrics.errors,
      logLevel: this.logLevel
    });
  }

  /**
   * Group related log messages
   */
  group(category, title) {
    if (this.shouldLog('DEBUG')) {
      console.group(`[${this.prefix}] ${title}`);
    }
    return {
      end: () => {
        if (this.shouldLog('DEBUG')) {
          console.groupEnd();
        }
      }
    };
  }

  /**
   * Create a specialized logger for a specific category
   */
  createCategoryLogger(category) {
    return {
      debug: (message, data) => this.debug(category, message, data),
      info: (message, data) => this.info(category, message, data),
      warn: (message, data) => this.warn(category, message, data),
      error: (message, error) => this.error(category, message, error)
    };
  }
}

// Create singleton logger instance
export const logger = new Logger('VideoBlocker');

// Export class for creating custom instances
export { Logger };
