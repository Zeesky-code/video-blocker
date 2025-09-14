/**
 * Enhanced Logger System for Video Blocker
 * Provides structured logging with levels, timestamps, and performance metrics
 */

import { STORAGE } from "../constants.js";

class Logger {
	constructor(prefix = "VideoBlocker") {
		this.prefix = prefix;
		this.logLevel = "INFO"; // Default log level until async load completes
		this.startTime = Date.now();
		this.metrics = {
			operations: 0,
			errors: 0,
			warnings: 0,
		};
		this.loadLogLevel();
	}

	/**
	 * Load log level from chrome storage
	 */
	loadLogLevel() {
		try {
			if (chrome && chrome.storage && chrome.storage.local) {
				chrome.storage.local.get([STORAGE.SETTINGS_KEY], (result) => {
					if (result && result[STORAGE.SETTINGS_KEY]) {
						const settings = result[STORAGE.SETTINGS_KEY];
						if (settings.logLevel) {
							// Convert from lowercase (error, info) to uppercase (ERROR, INFO)
							this.setLogLevel(settings.logLevel.toUpperCase());
						}
					}
				});
			}
		} catch (e) {
			console.error("Failed to load log level from storage", e);
		}
	}

	/**
	 * Set log level
	 */
	setLogLevel(level) {
		const validLevels = ["DEBUG", "INFO", "WARN", "ERROR"];
		level = level.toUpperCase(); // Convert to uppercase for standardization
		if (validLevels.includes(level)) {
			this.logLevel = level;
			console.log(`[VideoBlocker] Log level set to ${level}`);
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
		return `${now.toTimeString().split(" ")[0]}.${now.getMilliseconds().toString().padStart(3, "0")} (+${elapsed}ms)`;
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
		if (this.shouldLog("DEBUG")) {
			console.debug(...this.formatMessage("DEBUG", category, message, data));
		}
	}

	/**
	 * Info level logging
	 */
	info(category, message, data = null) {
		if (this.shouldLog("INFO")) {
			console.info(...this.formatMessage("INFO", category, message, data));
		}
	}

	/**
	 * Warning level logging
	 */
	warn(category, message, data = null) {
		if (this.shouldLog("WARN")) {
			console.warn(...this.formatMessage("WARN", category, message, data));
			this.metrics.warnings++;
		}
	}

	/**
	 * Error level logging
	 */
	error(category, message, error = null) {
		if (this.shouldLog("ERROR")) {
			const errorData = error
				? {
						message: error.message,
						stack: error.stack,
						name: error.name,
					}
				: null;
			console.error(
				...this.formatMessage("ERROR", category, message, errorData),
			);
			this.metrics.errors++;
		}
	}

	/**
	 * Log system metrics
	 */
	logMetrics() {
		const uptime = Date.now() - this.startTime;
		this.info("SYSTEM", "Runtime metrics", {
			uptime: `${(uptime / 1000).toFixed(1)}s`,
			operations: this.metrics.operations,
			warnings: this.metrics.warnings,
			errors: this.metrics.errors,
			logLevel: this.logLevel,
		});
	}

	/**
	 * Group related log messages
	 */
	group(category, title) {
		if (this.shouldLog("DEBUG")) {
			console.group(`[${this.prefix}] ${title}`);
		}
		return {
			end: () => {
				if (this.shouldLog("DEBUG")) {
					console.groupEnd();
				}
			},
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
			error: (message, error) => this.error(category, message, error),
		};
	}
}

// Create singleton logger instance
export const logger = new Logger("VideoBlocker");

// Export class for creating custom instances
export { Logger };
