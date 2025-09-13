/**
 * Video Scanner Core Module for Video Blocker Extension
 * Handles automatic video detection and scanning on page changes
 */

import { TIMING, SELECTORS, LOG_CATEGORIES } from '../constants.js';

export class VideoScanner {
  constructor(logger, videoBlocker, queue) {
    this.logger = logger.createCategoryLogger(LOG_CATEGORIES.SCANNER);
    this.videoBlocker = videoBlocker;
    this.queue = queue;
    this.isScanning = false;
    this.isPaused = false;
    this.scanCount = 0;
    this.lastUrl = '';
    this.observer = null;
    this.scanTimeout = null;
    this.settings = {
      autoScan: true
    };
    this.stats = {
      totalScans: 0,
      videosFound: 0,
      videosProcessed: 0
    };
  }

  /**
   * Initialize the scanner
   */
  async initialize() {
    this.logger.info('Initializing video scanner');

    // Set up mutation observer
    this.setupMutationObserver();

    // Set up URL change detection
    this.setupUrlChangeDetection();

    // Initial scan
    this.scheduleInitialScan();

    this.logger.info('Video scanner initialized');
  }

  /**
   * Set up mutation observer to detect new videos
   * @private
   */
  setupMutationObserver() {
    this.observer = new MutationObserver((mutations) => {
      if (this.isPaused) return;

      let shouldScan = false;

      for (const mutation of mutations) {
        // Check for added nodes that might contain videos
        for (const node of mutation.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE) {
            if (node.tagName === 'VIDEO' ||
                node.querySelector('video') ||
                node.matches && node.matches(SELECTORS.ARTICLE)) {
              shouldScan = true;
              break;
            }
          }
        }
        if (shouldScan) break;
      }

      if (shouldScan) {
        this.scheduleScan();
      }
    });

    // Start observing
    this.observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    this.logger.debug('Mutation observer set up');

    // Only observe if autoScan is enabled
    if (!this.settings.autoScan) {
      this.pauseScanning();
      this.logger.debug('Auto-scanning disabled by user settings');
    }
  }

  /**
   * Set up URL change detection
   * @private
   */
  setupUrlChangeDetection() {
    // Override pushState and replaceState
    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;

    const handleUrlChange = () => {
      if (location.href !== this.lastUrl) {
        this.lastUrl = location.href;
        this.logger.debug('URL change detected', { newUrl: this.lastUrl });
        this.scheduleUrlChangeScan();
      }
    };

    history.pushState = function(...args) {
      originalPushState.apply(history, args);
      handleUrlChange();
    };

    history.replaceState = function(...args) {
      originalReplaceState.apply(history, args);
      handleUrlChange();
    };

    // Listen for popstate events
    window.addEventListener('popstate', handleUrlChange);

    this.lastUrl = location.href;
    this.logger.debug('URL change detection set up');
  }

  /**
   * Schedule initial scan after page load
   * @private
   */
  scheduleInitialScan() {
    if (!this.settings.autoScan) {
      this.logger.debug('Initial scan skipped - auto-scanning disabled');
      return;
    }

    setTimeout(() => {
      this.scanAllVideos();
    }, TIMING.INITIAL_SCAN_DELAY_MS);
  }

  /**
   * Schedule scan after URL change
   * @private
   */
  scheduleUrlChangeScan() {
    // Clear existing timeout
    if (this.scanTimeout) {
      clearTimeout(this.scanTimeout);
    }

    // Skip if auto-scanning is disabled
    if (!this.settings.autoScan) {
      this.logger.debug('URL change scan skipped - auto-scanning disabled');
      return;
    }

    // Schedule new scan
    this.scanTimeout = setTimeout(() => {
      this.scanAllVideos();
    }, TIMING.URL_CHANGE_SCAN_DELAY_MS);
  }

  /**
   * Schedule regular scan with debouncing
   * @private
   */
  scheduleScan() {
    if (this.scanTimeout) {
      clearTimeout(this.scanTimeout);
    }

    // Skip if auto-scanning is disabled
    if (!this.settings.autoScan) {
      this.logger.debug('Scheduled scan skipped - auto-scanning disabled');
      return;
    }

    this.scanTimeout = setTimeout(() => {
      this.scanAllVideos();
    }, 500);
  }

  /**
   * Scan all videos on the page
   * @returns {Promise<void>}
   */
  async scanAllVideos() {
    if (this.isScanning || this.isPaused) {
      this.logger.debug('Scan skipped - already scanning or paused');
      return;
    }

    return this.queue.enqueue(async () => {
      this.isScanning = true;
      this.stats.totalScans++;

      try {
        this.logger.info('Starting video scan');

        const videos = this.findAllVideos();
        this.stats.videosFound += videos.length;

        if (videos.length === 0) {
          this.logger.debug('No videos found on page');
          return;
        }

        this.logger.info(`Found ${videos.length} videos to scan`);

        // Process videos
        await this.processVideos(videos);

        this.logger.info('Video scan completed', {
          videosFound: videos.length,
          totalScans: this.stats.totalScans
        });

      } catch (error) {
        this.logger.error('Error during video scan', error);
      } finally {
        this.isScanning = false;
      }
    }, `scan-all-videos-${Date.now()}`, 2);
  }

  /**
   * Find all video elements on the page
   * @returns {HTMLVideoElement[]} Array of video elements
   * @private
   */
  findAllVideos() {
    const videos = Array.from(document.querySelectorAll(SELECTORS.VIDEO));

    this.logger.debug(`Found ${videos.length} video elements`);

    // Filter out invalid videos
    return videos.filter(video => {
      if (!video.videoWidth || !video.videoHeight) {
        return false;
      }

      // Check if video is visible
      const rect = video.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) {
        return false;
      }

      // Check if video is in viewport or close to it
      const isInViewport = rect.top < window.innerHeight + 200 &&
                          rect.bottom > -200;

      return isInViewport;
    });
  }

  /**
   * Process array of videos
   * @param {HTMLVideoElement[]} videos - Videos to process
   * @private
   */
  async processVideos(videos) {
    const videoUtils = this.getVideoUtils();
    const uiUtils = this.getUIUtils();

    for (const video of videos) {
      if (this.isPaused) break;

      try {
        await this.videoBlocker.checkAndBlockVideo(video, videoUtils, uiUtils);
        this.stats.videosProcessed++;
      } catch (error) {
        this.logger.warn('Error processing video', error);
      }
    }
  }

  /**
   * Force immediate scan
   * @returns {Promise<void>}
   */
  async forceScan() {
    this.logger.info('Force scan requested');

    // Cancel any scheduled scans
    if (this.scanTimeout) {
      clearTimeout(this.scanTimeout);
      this.scanTimeout = null;
    }

    await this.scanAllVideos();
  }

  /**
   * Pause scanning
   */
  pauseScanning() {
    this.isPaused = true;
    this.logger.info('Video scanning paused');
  }

  /**
   * Resume scanning
   */
  resumeScanning() {
    this.isPaused = false;
    this.logger.info('Video scanning resumed');

    // Trigger immediate scan after resuming
    this.scheduleScan();
  }

  /**
   * Get scanner statistics
   * @returns {Object} Current statistics
   */
  getStats() {
    return {
      ...this.stats,
      isScanning: this.isScanning,
      isPaused: this.isPaused,
      scanCount: this.scanCount,
      currentUrl: this.lastUrl
    };
  }

  /**
   * Get video utilities instance (to be injected by main app)
   * @private
   */
  getVideoUtils() {
    // This will be set by the main application
    return this._videoUtils;
  }

  /**
   * Get UI utilities instance (to be injected by main app)
   * @private
   */
  getUIUtils() {
    // This will be set by the main application
    return this._uiUtils;
  }

  /**
   * Set utilities (called by main app)
   */
  setUtils(videoUtils, uiUtils) {
    this._videoUtils = videoUtils;
    this._uiUtils = uiUtils;
  }

  /**
   * Set scanner settings
   * @param {Object} settings - Scanner settings
   */
  setSettings(settings) {
    this.settings = {
      ...this.settings,
      ...settings
    };

    this.logger.debug('Scanner settings updated', this.settings);

    // Apply settings immediately
    if (!this.settings.autoScan && !this.isPaused) {
      this.pauseScanning();
    } else if (this.settings.autoScan && this.isPaused) {
      this.resumeScanning();
    }
  }

  /**
   * Clean up resources
   */
  cleanup() {
    // Stop mutation observer
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }

    // Clear timeouts
    if (this.scanTimeout) {
      clearTimeout(this.scanTimeout);
      this.scanTimeout = null;
    }

    this.isScanning = false;
    this.isPaused = false;

    this.logger.info('Video scanner cleanup completed');
  }
}
