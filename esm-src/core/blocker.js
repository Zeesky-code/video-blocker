/**
 * Video Blocker Core Module for Video Blocker Extension
 * Handles video blocking logic and hash management
 */

import { LOG_CATEGORIES, SUCCESS_MESSAGES, ERROR_MESSAGES, SELECTORS } from '../constants.js';

export class VideoBlocker {
  constructor(logger, storageManager, hashUtils, queue) {
    this.logger = logger.createCategoryLogger(LOG_CATEGORIES.BLOCKER);
    this.storageManager = storageManager;
    this.hashUtils = hashUtils;
    this.queue = queue;
    this.blockedHashes = new Set();
    this.processedVideos = new WeakSet();
    this.showNotifications = true; // Default value, will be updated from settings
    this.stats = {
      videosBlocked: 0,
      hashesAdded: 0,
      matchesFound: 0
    };
  }

  /**
   * Initialize the blocker
   */
  async initialize() {
    this.logger.info('Initializing video blocker');

    // Load blocked hashes
    const hashes = await this.storageManager.getBlockedHashes();
    this.blockedHashes = new Set(hashes);

    // Try to load settings
    try {
      const settingsKey = 'vb_settings';
      const settings = await new Promise((resolve) => {
        chrome.storage.local.get([settingsKey], (result) => {
          resolve(result[settingsKey] || {});
        });
      });

      if (settings && typeof settings.showNotifications === 'boolean') {
        this.showNotifications = settings.showNotifications;
        this.logger.debug('Notification setting loaded', { showNotifications: this.showNotifications });
      }
    } catch (error) {
      this.logger.warn('Could not load notification settings', error);
    }

    this.logger.info('Video blocker initialized', {
      blockedHashCount: this.blockedHashes.size,
      showNotifications: this.showNotifications
    });
  }

  /**
   * Block a video by computing its hash and adding to blocked list
   * @param {HTMLVideoElement} video - Video to block
   * @param {VideoUtils} videoUtils - Video processing utilities
   * @param {UIUtils} uiUtils - UI utilities
   * @returns {Promise<boolean>} - Success status
   */
  async blockVideo(video, videoUtils, uiUtils) {
    return this.queue.enqueue(async () => {
      try {
        if (!video || !(video instanceof HTMLVideoElement)) {
          throw new Error('Invalid video element');
        }

        this.logger.info('Starting video blocking process');

        // Show processing feedback
        uiUtils.addVideoFeedback(video, 'processing');
        if (this.showNotifications) {
          uiUtils.showToast(SUCCESS_MESSAGES.FINGERPRINTING, 'info');
        }

        // Show retry feedback if this takes longer
        let retryFeedbackTimeout = setTimeout(() => {
          if (this.showNotifications) {
            uiUtils.showToast(SUCCESS_MESSAGES.FINGERPRINTING_RETRY, 'info');
          }
        }, 2000);

        // Compute video hash with retries
        const hash = await videoUtils.computeMultiFramePHash(video);
        clearTimeout(retryFeedbackTimeout);

        if (!hash) {
          this.logger.warn('Could not compute video hash - likely poster frame or loading screen');
          if (this.showNotifications) {
            uiUtils.showToast(ERROR_MESSAGES.VIDEO_POSTER_FRAME, 'warning');
          }
          uiUtils.addVideoFeedback(video, 'error');
          return false;
        }

        // Check if already blocked
        if (this.blockedHashes.has(hash)) {
          this.logger.info('Video hash already in blocked list');
          if (this.showNotifications) {
            uiUtils.showToast(SUCCESS_MESSAGES.VIDEO_ALREADY_BLOCKED, 'info');
          }
          uiUtils.addVideoFeedback(video, 'blocked');
          return false;
        }

        // Save hash to storage
        const saved = await this.storageManager.saveBlockedHash(hash);
        if (!saved) {
          throw new Error('Failed to save hash to storage');
        }

        // Update local cache
        this.blockedHashes.add(hash);
        this.stats.hashesAdded++;

        // Hide the current video's article
        const article = video.closest(SELECTORS.ARTICLE);
        if (article) {
          await uiUtils.hideArticle(article);
          this.stats.videosBlocked++;
        }

        if (this.showNotifications) {
          uiUtils.showToast(SUCCESS_MESSAGES.VIDEO_BLOCKED, 'success');
        }
        this.logger.info('Video blocked successfully', {
          hashPreview: hash.substring(0, 16) + '...',
          totalBlocked: this.blockedHashes.size
        });

        return true;

      } catch (error) {
        this.logger.error('Failed to block video', error);
        if (this.showNotifications) {
          uiUtils.showToast(`Block failed: ${error.message}`, 'error');
        }
        uiUtils.addVideoFeedback(video, 'error');
        return false;
      } finally {
        // Clean up any processing feedback
        uiUtils.addVideoFeedback(video, null);
      }
    }, `block-video-${Date.now()}`);
  }

  /**
   * Check if a video should be blocked based on its hash
   * @param {HTMLVideoElement} video - Video to check
   * @param {VideoUtils} videoUtils - Video processing utilities
   * @param {UIUtils} uiUtils - UI utilities
   * @returns {Promise<boolean>} - True if video was blocked
   */
  async checkAndBlockVideo(video, videoUtils, uiUtils) {
    if (!video || this.processedVideos.has(video)) {
      return false;
    }

    return this.queue.enqueue(async () => {
      try {
        // Mark as processed to avoid duplicate checks
        this.processedVideos.add(video);

        // Skip if video is already hidden
        const article = video.closest(SELECTORS.ARTICLE);
        if (!article || article.style.display === 'none') {
          return false;
        }

        this.logger.debug('Checking video for blocking');

        // Compute hash with fewer frames for performance
        const hash = await videoUtils.computeMultiFramePHash(video, 2);

        if (!hash) {
          this.logger.debug('Could not compute hash for video check');
          return false;
        }

        // Check against blocked hashes
        const isBlocked = this.isHashBlocked(hash);

        if (isBlocked) {
          this.logger.info('Matching blocked hash found - auto-blocking video');

          await uiUtils.hideArticle(article);
          uiUtils.addVideoFeedback(video, 'blocked');
          if (this.showNotifications) {
            uiUtils.showToast(SUCCESS_MESSAGES.AUTO_BLOCKED, 'success');
          }

          this.stats.videosBlocked++;
          this.stats.matchesFound++;

          return true;
        }

        return false;

      } catch (error) {
        this.logger.warn('Error during video check', error);
        return false;
      }
    }, `check-video-${Date.now()}`, 1);
  }

  /**
   * Check if a hash matches any blocked hash
   * @param {string} hash - Hash to check
   * @returns {boolean} - True if hash is blocked
   */
  isHashBlocked(hash) {
    if (!hash) return false;

    // Direct match
    if (this.blockedHashes.has(hash)) {
      return true;
    }

    // Similar hash check
    for (const blockedHash of this.blockedHashes) {
      if (this.hashUtils.areHashesSimilar(hash, blockedHash)) {
        this.logger.debug('Similar hash match found', {
          newHash: hash.substring(0, 16) + '...',
          blockedHash: blockedHash.substring(0, 16) + '...'
        });
        return true;
      }
    }

    return false;
  }

  /**
   * Clear all blocked hashes
   * @returns {Promise<boolean>} - Success status
   */
  async clearAllBlocked() {
    try {
      const success = await this.storageManager.clearAllHashes();
      if (success) {
        this.blockedHashes.clear();
        this.processedVideos = new WeakSet();
        this.stats.hashesAdded = 0;
        this.logger.info('All blocked hashes cleared');
      }
      return success;
    } catch (error) {
      this.logger.error('Failed to clear blocked hashes', error);
      return false;
    }
  }

  /**
   * Get blocker statistics
   * @returns {Object} - Current statistics
   */
  getStats() {
    return {
      ...this.stats,
      totalBlockedHashes: this.blockedHashes.size,
      showNotifications: this.showNotifications
    };
  }

  /**
   * Add hash directly to blocked list
   * @param {string} hash - Hash to add
   * @returns {Promise<boolean>} - Success status
   */
  async addBlockedHash(hash) {
    try {
      if (!hash || typeof hash !== 'string') {
        throw new Error('Invalid hash provided');
      }

      const validation = this.hashUtils.validateHash(hash);
      if (!validation.valid) {
        throw new Error(`Invalid hash: ${validation.issues.join(', ')}`);
      }

      const saved = await this.storageManager.saveBlockedHash(hash);
      if (saved) {
        this.blockedHashes.add(hash);
        this.stats.hashesAdded++;
      }

      return saved;
    } catch (error) {
      this.logger.error('Failed to add blocked hash', error);
      return false;
    }
  }

  /**
   * Remove hash from blocked list
   * @param {string} hash - Hash to remove
   * @returns {Promise<boolean>} - Success status
   */
  async removeBlockedHash(hash) {
    try {
      const success = await this.storageManager.removeBlockedHash(hash);
      if (success) {
        this.blockedHashes.delete(hash);
        this.logger.info('Hash removed from blocked list');
      }
      return success;
    } catch (error) {
      this.logger.error('Failed to remove blocked hash', error);
      return false;
    }
  }

  /**
   * Get all blocked hashes as array
   * @returns {string[]} - Array of blocked hashes
   */
  getBlockedHashes() {
    return Array.from(this.blockedHashes);
  }

  /**
   * Refresh blocked hashes from storage
   */
  async refreshBlockedHashes() {
    const hashes = await this.storageManager.getBlockedHashes();
    this.blockedHashes = new Set(hashes);

    // Refresh settings too
    try {
      const settingsKey = 'vb_settings';
      const settings = await new Promise((resolve) => {
        chrome.storage.local.get([settingsKey], (result) => {
          resolve(result[settingsKey] || {});
        });
      });

      if (settings && typeof settings.showNotifications === 'boolean') {
        this.showNotifications = settings.showNotifications;
      }
    } catch (error) {
      this.logger.warn('Could not refresh notification settings', error);
    }

    this.logger.info('Blocked hashes refreshed', {
      count: this.blockedHashes.size,
      showNotifications: this.showNotifications
    });
  }

  /**
   * Clean up resources
   */
  cleanup() {
    this.processedVideos = new WeakSet();
    this.logger.info('Video blocker cleanup completed');
  }
}
