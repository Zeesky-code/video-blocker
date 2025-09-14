/**
 * Storage Management Utility for Video Blocker Extension
 * Handles Chrome storage operations with enhanced error handling and logging
 */

import { STORAGE, LOG_CATEGORIES } from '../constants.js';

export class StorageManager {
  constructor(logger) {
    this.logger = logger.createCategoryLogger(LOG_CATEGORIES.STORAGE);
    this.cache = new Map();
    this.listeners = new Set();
  }

  /**
   * Initialize storage manager and set up listeners
   */
  async initialize() {
    this.logger.info('Initializing storage manager');

    // Set up storage change listener
    if (chrome && chrome.storage && chrome.storage.onChanged) {
      chrome.storage.onChanged.addListener((changes, area) => {
        this.handleStorageChange(changes, area);
      });
      this.logger.debug('Storage change listener registered');
    }

    // Load initial data
    await this.loadBlockedHashes();
  }

  /**
   * Load blocked hashes from storage
   * @returns {Promise<string[]>} Array of hash strings
   */
  async loadBlockedHashes() {
    try {
      const data = await this.getStorageData(STORAGE.KEY);
      const hashes = (data || [])
        .map(item => item.hash)
        .filter(hash => hash && typeof hash === 'string');

      this.cache.set('blocked_hashes', hashes);
      this.logger.info(`Loaded ${hashes.length} blocked hashes from storage`);

      return hashes;
    } catch (error) {
      this.logger.error('Failed to load blocked hashes', error);
      return [];
    }
  }

  /**
   * Save a new blocked hash
   * @param {string} hash - The hash to block
   * @returns {Promise<boolean>} Success status
   */
  async saveBlockedHash(hash) {
    if (!hash || typeof hash !== 'string') {
      this.logger.warn('Invalid hash provided for saving', { hash });
      return false;
    }

    try {
      const existingData = await this.getStorageData(STORAGE.KEY) || [];

      // Check if hash already exists
      if (existingData.some(item => item.hash === hash)) {
        this.logger.debug('Hash already exists in storage', { hash });
        return false;
      }

      // Add new hash with metadata
      const newItem = {
        hash,
        added: Date.now(),
        version: '1.0',
        source: 'manual' // Can be 'manual' or 'auto'
      };

      const updatedData = [...existingData, newItem];
      await this.setStorageData(STORAGE.KEY, updatedData);

      // Update cache
      const cachedHashes = this.cache.get('blocked_hashes') || [];
      cachedHashes.push(hash);
      this.cache.set('blocked_hashes', cachedHashes);

      this.logger.info('Successfully saved new blocked hash', {
        hash: hash.substring(0, 8) + '...',
        totalCount: updatedData.length
      });

      // Notify listeners
      this.notifyListeners('hashAdded', { hash, totalCount: updatedData.length });

      // Update statistics
      await this.updateStats('hashAdded');

      return true;
    } catch (error) {
      this.logger.error('Failed to save blocked hash', error);
      return false;
    }
  }

  /**
   * Get blocked hashes from cache or storage
   * @returns {Promise<string[]>} Array of hash strings
   */
  async getBlockedHashes() {
    const cached = this.cache.get('blocked_hashes');
    if (cached) {
      return cached;
    }

    return await this.loadBlockedHashes();
  }

  /**
   * Remove a blocked hash
   * @param {string} hash - The hash to remove
   * @returns {Promise<boolean>} Success status
   */
  async removeBlockedHash(hash) {
    try {
      const existingData = await this.getStorageData(STORAGE.KEY) || [];
      const filteredData = existingData.filter(item => item.hash !== hash);

      if (filteredData.length === existingData.length) {
        this.logger.debug('Hash not found for removal', { hash });
        return false;
      }

      await this.setStorageData(STORAGE.KEY, filteredData);

      // Update cache
      const cachedHashes = this.cache.get('blocked_hashes') || [];
      const updatedCache = cachedHashes.filter(h => h !== hash);
      this.cache.set('blocked_hashes', updatedCache);

      this.logger.info('Successfully removed blocked hash', {
        hash: hash.substring(0, 8) + '...',
        remainingCount: filteredData.length
      });

      // Notify listeners
      this.notifyListeners('hashRemoved', { hash, remainingCount: filteredData.length });

      // Update statistics
      await this.updateStats('hashRemoved');

      return true;
    } catch (error) {
      this.logger.error('Failed to remove blocked hash', error);
      return false;
    }
  }

  /**
   * Clear all blocked hashes
   * @returns {Promise<boolean>} Success status
   */
  async clearAllHashes() {
    try {
      await this.setStorageData(STORAGE.KEY, []);
      this.cache.set('blocked_hashes', []);

      this.logger.info('Successfully cleared all blocked hashes');
      this.notifyListeners('allHashesCleared', { totalCount: 0 });

      // Update statistics
      await this.updateStats('allCleared');

      return true;
    } catch (error) {
      this.logger.error('Failed to clear all hashes', error);
      return false;
    }
  }

  /**
   * Update statistics after hash operations
   * @param {string} action - The action performed
   * @private
   */
  async updateStats(action) {
    try {
      const statsKey = 'vb_stats_v1';
      const existingStats = await this.getStorageData(statsKey) || {};

      const now = Date.now();
      const today = new Date().toDateString();

      // Initialize stats if needed
      const stats = {
        totalOperations: 0,
        lastUpdated: now,
        dailyStats: {},
        ...existingStats
      };

      // Update daily stats
      if (!stats.dailyStats[today]) {
        stats.dailyStats[today] = { added: 0, removed: 0 };
      }

      // Update counters based on action
      switch (action) {
        case 'hashAdded':
          stats.totalOperations++;
          stats.dailyStats[today].added++;
          break;
        case 'hashRemoved':
          stats.dailyStats[today].removed++;
          break;
        case 'allCleared':
          // Keep the stats but note the clear operation
          stats.lastCleared = now;
          break;
      }

      stats.lastUpdated = now;

      // Clean up old daily stats (keep only last 30 days)
      const thirtyDaysAgo = now - (30 * 24 * 60 * 60 * 1000);
      Object.keys(stats.dailyStats).forEach(date => {
        if (new Date(date).getTime() < thirtyDaysAgo) {
          delete stats.dailyStats[date];
        }
      });

      await this.setStorageData(statsKey, stats);
    } catch (error) {
      this.logger.error('Failed to update statistics', error);
    }
  }

  /**
   * Get storage statistics
   * @returns {Promise<Object>} Storage statistics
   */
  async getStorageStats() {
    try {
      const data = await this.getStorageData(STORAGE.KEY) || [];
      const now = Date.now();

      const stats = {
        totalCount: data.length,
        oldestEntry: data.length > 0 ? Math.min(...data.map(item => item.added || 0)) : null,
        newestEntry: data.length > 0 ? Math.max(...data.map(item => item.added || 0)) : null,
        averageAge: 0,
        sizeEstimate: JSON.stringify(data).length
      };

      if (stats.totalCount > 0 && stats.oldestEntry) {
        const ages = data.map(item => now - (item.added || 0));
        stats.averageAge = ages.reduce((sum, age) => sum + age, 0) / ages.length;
      }

      return stats;
    } catch (error) {
      this.logger.error('Failed to get storage statistics', error);
      return { totalCount: 0, error: error.message };
    }
  }

  /**
   * Add change listener
   * @param {Function} callback - Callback function for changes
   */
  addChangeListener(callback) {
    this.listeners.add(callback);
    this.logger.debug('Change listener added', { totalListeners: this.listeners.size });
  }

  /**
   * Remove change listener
   * @param {Function} callback - Callback function to remove
   */
  removeChangeListener(callback) {
    this.listeners.delete(callback);
    this.logger.debug('Change listener removed', { totalListeners: this.listeners.size });
  }

  /**
   * Handle storage changes from Chrome API
   * @private
   */
  handleStorageChange(changes, area) {
    if (area !== 'local') return;

    if (changes[STORAGE.KEY]) {
      const newValue = changes[STORAGE.KEY].newValue || [];
      const hashes = newValue.map(item => item.hash).filter(Boolean);

      this.cache.set('blocked_hashes', hashes);
      this.logger.info('Storage updated via external change', {
        hashCount: hashes.length
      });

      this.notifyListeners('externalUpdate', {
        hashes,
        totalCount: hashes.length
      });
    }
  }

  /**
   * Notify all listeners of changes
   * @private
   */
  notifyListeners(event, data) {
    this.listeners.forEach(callback => {
      try {
        callback(event, data);
      } catch (error) {
        this.logger.error('Listener callback failed', error);
      }
    });
  }

  /**
   * Generic storage get operation
   * @private
   */
  async getStorageData(key) {
    return new Promise((resolve, reject) => {
      if (!chrome || !chrome.storage || !chrome.storage.local) {
        reject(new Error('Chrome storage API not available'));
        return;
      }

      chrome.storage.local.get([key], (result) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(result[key]);
        }
      });
    });
  }

  /**
   * Generic storage set operation
   * @private
   */
  async setStorageData(key, value) {
    return new Promise((resolve, reject) => {
      if (!chrome || !chrome.storage || !chrome.storage.local) {
        reject(new Error('Chrome storage API not available'));
        return;
      }

      chrome.storage.local.set({ [key]: value }, () => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve();
        }
      });
    });
  }
}
