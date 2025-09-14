/**
 * Video Blocker Extension - Main Content Script (ES Module Version)
 * Coordinates all modules and provides the main entry point for the extension
 */

import {
	DEBUG,
	ERROR_MESSAGES,
	EVENTS,
	HASH_CONFIG,
	LOG_CATEGORIES,
	SELECTORS,
	STORAGE,
	SUCCESS_MESSAGES,
} from "./constants.js";
import { VideoBlocker } from "./core/blocker.js";
import { ConcurrencyQueue } from "./core/queue.js";
import { VideoScanner } from "./core/scanner.js";
import { HashUtils } from "./utils/hash.js";
import { logger } from "./utils/logger.js";
import { StorageManager } from "./utils/storage.js";
import { UIUtils } from "./utils/ui.js";
import { VideoUtils } from "./utils/video.js";

/**
 * Main Application Class
 * Orchestrates all components of the Video Blocker extension
 */
class VideoBlockerApp {
	constructor() {
		this.logger = logger;
		this.appLogger = this.logger.createCategoryLogger(LOG_CATEGORIES.SYSTEM);

		this.storageManager = null;
		this.hashUtils = null;
		this.videoUtils = null;
		this.uiUtils = null;
		this.concurrencyQueue = null;
		this.videoBlocker = null;
		this.videoScanner = null;

		this.settings = {
			autoScan: true,
			sensitivity: 12,
			showNotifications: true,
			logLevel: "info",
			maxRetries: 2,
		};

		this.isInitialized = false;
		this.startTime = Date.now();

		this.appLogger.info("Video Blocker App created");
	}

	/**
	 * Initialize the entire application
	 */
	async initialize() {
		try {
			this.appLogger.info("Starting Video Blocker initialization");

			// Load settings
			await this.loadSettings();

			// Initialize core utilities
			await this.initializeUtilities();

			// Initialize core systems
			await this.initializeCoreSystems();

			// Set up event handlers
			this.setupEventHandlers();

			// Set up debug interface
			this.setupDebugInterface();

			// Set up error handlers
			this.setupErrorHandlers();

			this.isInitialized = true;

			const initTime = Date.now() - this.startTime;
			this.appLogger.info("Video Blocker initialized successfully", {
				initTime: `${initTime}ms`,
				components: this.getComponentStatus(),
			});

			// Log system metrics periodically
			this.startMetricsLogging();
		} catch (error) {
			this.appLogger.error("Failed to initialize Video Blocker", error);
			throw error;
		}
	}

	/**
	 * Load user settings from storage
	 * @private
	 */
	async loadSettings() {
		try {
			this.appLogger.info("Loading user settings");

			// Get settings from storage
			const settingsKey = STORAGE.SETTINGS_KEY;
			const storedSettings = await new Promise((resolve) => {
				chrome.storage.local.get([settingsKey], (result) => {
					resolve(result[settingsKey] || {});
				});
			});

			// Apply settings with defaults
			this.settings = {
				...this.settings, // Default settings
				...storedSettings, // User settings override defaults
			};

			// Apply log level
			if (this.settings.logLevel) {
				const logLevel = this.settings.logLevel.toUpperCase();
				this.logger.setLogLevel(logLevel);
				console.log(`[VideoBlocker] Setting log level to ${logLevel}`);
			}

			// Apply sensitivity to hash config
			if (typeof this.settings.sensitivity === "number") {
				HASH_CONFIG.HAMMING_THRESHOLD = this.settings.sensitivity;
			}

			this.appLogger.info("Settings loaded", {
				autoScan: this.settings.autoScan,
				sensitivity: this.settings.sensitivity,
				showNotifications: this.settings.showNotifications,
				logLevel: this.settings.logLevel,
				hammingThreshold: HASH_CONFIG.HAMMING_THRESHOLD,
			});
		} catch (error) {
			this.appLogger.error("Failed to load settings", error);
		}
	}

	/**
	 * Initialize utility modules
	 * @private
	 */
	async initializeUtilities() {
		this.appLogger.debug("Initializing utility modules");

		// Storage Manager
		this.storageManager = new StorageManager(this.logger);
		await this.storageManager.initialize();

		// Hash Utilities
		this.hashUtils = new HashUtils(this.logger);

		// Video Utilities
		this.videoUtils = new VideoUtils(this.logger);

		// UI Utilities
		this.uiUtils = new UIUtils(this.logger);

		// Concurrency Queue
		this.concurrencyQueue = new ConcurrencyQueue(this.logger);

		this.appLogger.info("Utility modules initialized");
	}

	/**
	 * Initialize core system modules
	 * @private
	 */
	async initializeCoreSystems() {
		this.appLogger.debug("Initializing core systems");

		// Video Blocker
		this.videoBlocker = new VideoBlocker(
			this.logger,
			this.storageManager,
			this.hashUtils,
			this.concurrencyQueue,
		);
		await this.videoBlocker.initialize();

		// Video Scanner
		this.videoScanner = new VideoScanner(
			this.logger,
			this.videoBlocker,
			this.concurrencyQueue,
		);

		// Inject utilities into scanner
		this.videoScanner.setUtils(this.videoUtils, this.uiUtils);

		// Pass settings to scanner
		this.videoScanner.setSettings({
			autoScan: this.settings.autoScan,
		});

		await this.videoScanner.initialize();

		this.appLogger.info("Core systems initialized");
	}

	/**
	 * Set up event handlers
	 * @private
	 */
	setupEventHandlers() {
		// Handle Ctrl+Click (or Cmd+Click on Mac) to block videos
		document.addEventListener("click", this.handleVideoBlockClick.bind(this), {
			capture: true,
			passive: false,
		});

		// Listen for storage changes to update settings
		chrome.storage.onChanged.addListener((changes, area) => {
			if (area === "local" && changes[STORAGE.SETTINGS_KEY]) {
				this.appLogger.info("Settings changed externally, reloading");
				this.loadSettings().then(() => {
					// Update settings in components
					if (this.videoScanner) {
						this.videoScanner.setSettings({
							autoScan: this.settings.autoScan,
						});
					}

					// Update notification settings in blocker
					if (this.videoBlocker) {
						this.videoBlocker.showNotifications =
							this.settings.showNotifications;
					}

					// Force log level update
					if (this.settings.logLevel) {
						const logLevel = this.settings.logLevel.toUpperCase();
						this.logger.setLogLevel(logLevel);
						console.log(
							`[VideoBlocker] Log level updated to ${logLevel} from settings change`,
						);
					}
				});
			}
		});

		this.appLogger.debug("Event handlers configured");
	}

	/**
	 * Handle click events for video blocking
	 * @private
	 */
	async handleVideoBlockClick(event) {
		// Check if modifier key is pressed
		if (!event[EVENTS.MODIFIER_KEY]) {
			return;
		}

		try {
			// Find video at click location
			const video = this.videoUtils.findVideoAtCoordinates(
				event.clientX,
				event.clientY,
			);

			if (!video) {
				if (this.settings.showNotifications) {
					this.uiUtils.showToast(ERROR_MESSAGES.NO_VIDEO_FOUND, "error");
				}
				return;
			}

			// Prevent default click behavior
			event.preventDefault();
			event.stopPropagation();

			this.appLogger.info("Video blocking requested via click");

			// Block the video
			const success = await this.videoBlocker.blockVideo(
				video,
				this.videoUtils,
				this.uiUtils,
			);

			if (success) {
				this.appLogger.info("Video blocked successfully via user action");

				// Only show notification if setting is enabled
				if (!this.settings.showNotifications) {
					// Clear any notifications that might have been shown during the blocking process
					this.uiUtils.clearToasts();
				}
			}
		} catch (error) {
			this.appLogger.error("Error handling video block click", error);
			if (this.settings.showNotifications) {
				this.uiUtils.showToast("Block failed: " + error.message, "error");
			}
		}
	}

	/**
	 * Set up debug interface
	 * @private
	 */
	setupDebugInterface() {
		window[DEBUG.GLOBAL_OBJECT] = {
			// System information
			getStats: () => this.getSystemStats(),
			getComponentStatus: () => this.getComponentStatus(),

			// Logging controls
			setLogLevel: (level) => this.logger.setLogLevel(level),
			getLogLevel: () => this.logger.logLevel,
			logMetrics: () => this.logger.logMetrics(),

			// Storage operations
			getBlockedHashes: () => this.storageManager.getBlockedHashes(),
			clearAllBlocked: () => this.videoBlocker.clearAllBlocked(),
			getStorageStats: () => this.storageManager.getStorageStats(),
			getSettings: () => this.settings,
			reloadSettings: async () => await this.loadSettings(),

			// Video operations
			scanAllVideos: () => this.videoScanner.scanAllVideos(),
			forceScan: () => this.videoScanner.forceScan(),
			pauseScanning: () => this.videoScanner.pauseScanning(),
			resumeScanning: () => this.videoScanner.resumeScanning(),

			// Hash operations
			computeHashNow: async (video) => {
				if (video && video instanceof HTMLVideoElement) {
					return await this.videoUtils.computeMultiFramePHash(video);
				}
				throw new Error("Invalid video element provided");
			},

			validateHash: (hash) => this.hashUtils.validateHash(hash),
			compareHashes: (hash1, hash2) => ({
				distance: this.hashUtils.hammingDistance(hash1, hash2),
				similar: this.hashUtils.areHashesSimilar(hash1, hash2),
				trivial1: this.hashUtils.isTrivialHash(hash1),
				trivial2: this.hashUtils.isTrivialHash(hash2),
			}),

			// Test Toastify notifications
			testToast: (message = "Test notification", type = "info") => {
				if (!this.uiUtils) {
					console.error("UI Utils not initialized");
					return;
				}
				this.uiUtils.showToast(message, type);
			},

			// Show different toast types
			showToastTypes: () => {
				if (!this.uiUtils) {
					console.error("UI Utils not initialized");
					return;
				}
				setTimeout(
					() => this.uiUtils.showToast("Success notification", "success"),
					0,
				);
				setTimeout(
					() => this.uiUtils.showToast("Info notification", "info"),
					1500,
				);
				setTimeout(
					() => this.uiUtils.showToast("Warning notification", "warning"),
					3000,
				);
				setTimeout(
					() => this.uiUtils.showToast("Error notification", "error"),
					4500,
				);
			},

			// Test toast with offset
			testToastOffset: (x = 20, y = 50) => {
				if (!this.uiUtils) {
					console.error("UI Utils not initialized");
					return;
				}
				this.uiUtils.showToastWithOffset("Toast with custom offset", "info", {
					x,
					y,
				});
			},

			// Queue operations
			getQueueStats: () => this.concurrencyQueue.getStats(),
			clearQueue: () => this.concurrencyQueue.clearQueue(),

			// App control
			cleanup: () => this.cleanup(),
			restart: () => this.restart(),
		};

		this.appLogger.debug("Debug interface configured");
	}

	/**
	 * Set up global error handlers
	 * @private
	 */
	setupErrorHandlers() {
		// Handle uncaught errors
		window.addEventListener("error", (event) => {
			this.appLogger.error("Uncaught error", {
				message: event.message,
				filename: event.filename,
				lineno: event.lineno,
				colno: event.colno,
				error: event.error,
			});
		});

		// Handle unhandled promise rejections
		window.addEventListener("unhandledrejection", (event) => {
			this.appLogger.error("Unhandled promise rejection", {
				reason: event.reason,
				promise: event.promise,
			});
		});

		this.appLogger.debug("Error handlers configured");
	}

	/**
	 * Start periodic metrics logging
	 * @private
	 */
	startMetricsLogging() {
		// Log metrics every 5 minutes
		setInterval(
			() => {
				if (this.isInitialized) {
					this.logSystemMetrics();
				}
			},
			5 * 60 * 1000,
		);

		// Initial metrics log after 1 minute
		setTimeout(() => {
			if (this.isInitialized) {
				this.logSystemMetrics();
			}
		}, 60 * 1000);
	}

	/**
	 * Log comprehensive system metrics
	 * @private
	 */
	logSystemMetrics() {
		const stats = this.getSystemStats();
		this.logger.logMetrics();
		this.appLogger.info("System metrics", stats);
	}

	/**
	 * Get comprehensive system statistics
	 */
	getSystemStats() {
		return {
			uptime: Date.now() - this.startTime,
			isInitialized: this.isInitialized,
			url: location.href,
			componentStatus: this.getComponentStatus(),
			blockerStats: this.videoBlocker ? this.videoBlocker.getStats() : null,
			scannerStats: this.videoScanner ? this.videoScanner.getStats() : null,
			queueStats: this.concurrencyQueue
				? this.concurrencyQueue.getStats()
				: null,
			storageStats: this.storageManager
				? {
						cachedHashCount:
							this.storageManager.cache.get("blocked_hashes")?.length || 0,
					}
				: null,
		};
	}

	/**
	 * Get status of all components
	 */
	getComponentStatus() {
		return {
			storageManager: !!this.storageManager,
			hashUtils: !!this.hashUtils,
			videoUtils: !!this.videoUtils,
			uiUtils: !!this.uiUtils,
			concurrencyQueue: !!this.concurrencyQueue,
			videoBlocker: !!this.videoBlocker,
			videoScanner: !!this.videoScanner,
		};
	}

	/**
	 * Restart the application
	 */
	async restart() {
		this.appLogger.info("Restarting Video Blocker");

		await this.cleanup();

		// Reset state
		this.isInitialized = false;
		this.startTime = Date.now();

		await this.initialize();
	}

	/**
	 * Clean up all resources
	 */
	async cleanup() {
		this.appLogger.info("Cleaning up Video Blocker");

		try {
			if (this.videoScanner) {
				this.videoScanner.cleanup();
			}

			if (this.videoBlocker) {
				this.videoBlocker.cleanup();
			}

			if (this.concurrencyQueue) {
				this.concurrencyQueue.cleanup();
			}

			if (this.uiUtils) {
				this.uiUtils.cleanup();
			}

			// Clear debug interface
			if (window[DEBUG.GLOBAL_OBJECT]) {
				delete window[DEBUG.GLOBAL_OBJECT];
			}

			this.isInitialized = false;
			this.appLogger.info("Cleanup completed");
		} catch (error) {
			this.appLogger.error("Error during cleanup", error);
		}
	}
}

// Initialize the application when DOM is ready
(async function initializeVideoBlocker() {
	try {
		const appLogger = logger.createCategoryLogger(LOG_CATEGORIES.SYSTEM);
		appLogger.info("Starting Video Blocker Extension (ES Module)");

		// Wait for DOM to be ready
		if (document.readyState === "loading") {
			await new Promise((resolve) => {
				document.addEventListener("DOMContentLoaded", resolve, { once: true });
			});
		}

		// Create and initialize the application
		const app = new VideoBlockerApp();
		await app.initialize();

		appLogger.info("Video Blocker Extension started successfully");

		// Store app reference globally for cleanup if needed
		window.__videoBlockerApp = app;
	} catch (error) {
		console.error("[VideoBlocker] Initialization failed:", error);
		logger
			.createCategoryLogger(LOG_CATEGORIES.SYSTEM)
			.error("Failed to start Video Blocker Extension", error);
	}
})();
