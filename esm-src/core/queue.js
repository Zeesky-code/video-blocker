/**
 * Concurrency Queue System for Video Blocker Extension
 * Manages concurrent video processing tasks with proper resource limits
 */

import { CONCURRENCY, LOG_CATEGORIES } from '../constants.js';

export class ConcurrencyQueue {
  constructor(logger) {
    this.logger = logger.createCategoryLogger(LOG_CATEGORIES.QUEUE);
    this.activeJobs = new Set();
    this.pendingJobs = [];
    this.maxConcurrent = CONCURRENCY.MAX_CONCURRENT;
    this.stats = {
      totalJobs: 0,
      completedJobs: 0,
      failedJobs: 0,
      queuedJobs: 0
    };
  }

  /**
   * Add a job to the queue
   * @param {Function} jobFn - Async function to execute
   * @param {string} id - Unique identifier for the job
   * @param {number} priority - Job priority (higher = more priority)
   * @returns {Promise} - Promise that resolves when job completes
   */
  async enqueue(jobFn, id = this.generateJobId(), priority = 0) {
    return new Promise((resolve, reject) => {
      const job = {
        id,
        fn: jobFn,
        priority,
        resolve,
        reject,
        createdAt: Date.now()
      };

      this.stats.totalJobs++;
      this.stats.queuedJobs++;

      this.logger.debug('Job enqueued', {
        jobId: id,
        priority,
        queueSize: this.pendingJobs.length,
        activeJobs: this.activeJobs.size
      });

      // Insert job based on priority (higher priority first)
      const insertIndex = this.pendingJobs.findIndex(j => j.priority < priority);
      if (insertIndex === -1) {
        this.pendingJobs.push(job);
      } else {
        this.pendingJobs.splice(insertIndex, 0, job);
      }

      this.processQueue();
    });
  }

  /**
   * Process queued jobs up to the concurrency limit
   * @private
   */
  processQueue() {
    while (this.activeJobs.size < this.maxConcurrent && this.pendingJobs.length > 0) {
      const job = this.pendingJobs.shift();
      this.stats.queuedJobs--;
      this.executeJob(job);
    }
  }

  /**
   * Execute a single job
   * @private
   */
  async executeJob(job) {
    const startTime = Date.now();
    this.activeJobs.add(job);

    this.logger.debug('Job started', {
      jobId: job.id,
      waitTime: startTime - job.createdAt,
      activeJobs: this.activeJobs.size
    });

    try {
      // Set up timeout
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Job timeout')), CONCURRENCY.QUEUE_TIMEOUT_MS);
      });

      // Race between job execution and timeout
      const result = await Promise.race([job.fn(), timeoutPromise]);

      const duration = Date.now() - startTime;
      this.stats.completedJobs++;

      this.logger.info('Job completed', {
        jobId: job.id,
        duration: `${duration}ms`,
        activeJobs: this.activeJobs.size - 1
      });

      job.resolve(result);

    } catch (error) {
      const duration = Date.now() - startTime;
      this.stats.failedJobs++;

      this.logger.error('Job failed', {
        jobId: job.id,
        duration: `${duration}ms`,
        error: error.message
      });

      job.reject(error);

    } finally {
      this.activeJobs.delete(job);
      // Process more jobs from queue
      this.processQueue();
    }
  }

  /**
   * Generate unique job ID
   * @private
   */
  generateJobId() {
    return `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get queue statistics
   * @returns {Object} - Current queue statistics
   */
  getStats() {
    return {
      ...this.stats,
      activeJobs: this.activeJobs.size,
      pendingJobs: this.pendingJobs.length,
      totalInProgress: this.activeJobs.size + this.pendingJobs.length
    };
  }

  /**
   * Clear all pending jobs
   * @param {string} reason - Reason for clearing
   */
  clearQueue(reason = 'Manual clear') {
    const clearedCount = this.pendingJobs.length;

    // Reject all pending jobs
    this.pendingJobs.forEach(job => {
      job.reject(new Error(`Queue cleared: ${reason}`));
    });

    this.pendingJobs = [];
    this.stats.queuedJobs = 0;
    this.stats.failedJobs += clearedCount;

    this.logger.info('Queue cleared', {
      clearedJobs: clearedCount,
      reason,
      activeJobs: this.activeJobs.size
    });
  }

  /**
   * Wait for all active jobs to complete
   * @returns {Promise<void>}
   */
  async waitForCompletion() {
    if (this.activeJobs.size === 0 && this.pendingJobs.length === 0) {
      return;
    }

    this.logger.debug('Waiting for queue completion', {
      activeJobs: this.activeJobs.size,
      pendingJobs: this.pendingJobs.length
    });

    return new Promise((resolve) => {
      const check = () => {
        if (this.activeJobs.size === 0 && this.pendingJobs.length === 0) {
          resolve();
        } else {
          setTimeout(check, 100);
        }
      };
      check();
    });
  }

  /**
   * Check if queue has capacity for more jobs
   * @returns {boolean}
   */
  hasCapacity() {
    return this.activeJobs.size < this.maxConcurrent;
  }

  /**
   * Get current queue size
   * @returns {number}
   */
  getQueueSize() {
    return this.pendingJobs.length;
  }

  /**
   * Get active job count
   * @returns {number}
   */
  getActiveJobCount() {
    return this.activeJobs.size;
  }

  /**
   * Set maximum concurrent jobs
   * @param {number} max - Maximum concurrent jobs
   */
  setMaxConcurrent(max) {
    if (max > 0 && max <= 10) {
      this.maxConcurrent = max;
      this.logger.info('Max concurrent jobs updated', { maxConcurrent: max });
      this.processQueue(); // Process more jobs if limit increased
    } else {
      this.logger.warn('Invalid max concurrent value', { provided: max });
    }
  }

  /**
   * Clean up the queue
   */
  cleanup() {
    this.clearQueue('Cleanup');
    this.logger.info('Queue cleanup completed');
  }
}
