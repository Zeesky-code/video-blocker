/**
 * UI Utilities for Video Blocker Extension
 * Handles toast notifications and visual feedback
 */

import { UI, LOG_CATEGORIES, TOASTIFY } from '../constants.js';
import Toastify from 'toastify-js';
import 'toastify-js/src/toastify.css';

export class UIUtils {
  constructor(logger) {
    this.logger = logger.createCategoryLogger(LOG_CATEGORIES.UI);
    this.activeToast = null;
    this.activeToasts = [];
  }

  /**
   * Clear all active toasts
   */
  clearToasts() {
    this.logger.debug('Clearing all active toasts');

    // Hide any active toasts
    this.activeToasts.forEach(toast => {
      if (toast && toast.hideToast) {
        toast.hideToast();
      }
    });

    // Reset the array
    this.activeToasts = [];
    this.activeToast = null;
  }

  /**
   * Show toast notification
   * @param {string} message - Message to display
   * @param {string} type - Toast type ('success', 'error', 'info')
   * @param {number} duration - Duration in milliseconds
   */
  showToast(message, type = 'info', duration = UI.TOAST_DURATION_MS) {
    this.logger.debug('Showing toast', { message, type, duration });

    // Set background color based on type
    let backgroundColor;
    switch (type) {
      case 'success':
        backgroundColor = TOASTIFY.GRADIENT.SUCCESS;
        break;
      case 'error':
        backgroundColor = TOASTIFY.GRADIENT.ERROR;
        break;
      case 'warning':
        backgroundColor = TOASTIFY.GRADIENT.WARNING;
        break;
      default:
        backgroundColor = TOASTIFY.GRADIENT.INFO;
    }

    // Create and show toast using Toastify
    const toast = Toastify({
      text: message,
      duration: duration,
      close: TOASTIFY.CLOSE,
      gravity: UI.TOAST_GRAVITY,
      position: UI.TOAST_POSITION,
      offset: UI.TOAST_OFFSET,
      stopOnFocus: TOASTIFY.STOP_ON_FOCUS,
      style: {
        background: backgroundColor,
      },
      onClick: () => {} // Prevents dismissing when clicked
    }).showToast();

    this.activeToast = toast;
    this.activeToasts.push(toast);

    return toast;
  }

  /**
   * Hide active toast
   */
  hideToast() {
    // Toastify handles its own cleanup
    if (this.activeToast && this.activeToast.hideToast) {
      this.activeToast.hideToast();
    }
    this.activeToast = null;

    // Remove from active toasts array
    this.activeToasts = this.activeToasts.filter(toast =>
      toast !== this.activeToast);
  }

  /**
   * Fade out and hide article element
   * @param {HTMLElement} article - Article element to hide
   * @returns {Promise<void>}
   */
  async hideArticle(article) {
    if (!article) return;

    return new Promise((resolve) => {
      this.logger.debug('Hiding article with fade animation');

      // Apply fade transition
      article.style.transition = `opacity ${UI.FADE_DURATION_MS}ms ease-out`;
      article.style.opacity = '0';

      setTimeout(() => {
        article.style.display = 'none';
        this.logger.debug('Article hidden');
        resolve();
      }, UI.HIDE_DELAY_MS);
    });
  }

  /**
   * Add visual feedback to video element
   * @param {HTMLVideoElement} video - Video element
   * @param {string} type - Feedback type ('processing', 'blocked', 'error')
   */
  addVideoFeedback(video, type) {
    if (!video) return;

    const overlay = document.createElement('div');
    overlay.className = `vb-video-overlay vb-${type}`;

    Object.assign(overlay.style, {
      position: 'absolute',
      top: '0',
      left: '0',
      right: '0',
      bottom: '0',
      background: this.getOverlayBackground(type),
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: 'white',
      fontSize: '14px',
      fontWeight: 'bold',
      zIndex: '1000',
      pointerEvents: 'none'
    });

    overlay.textContent = this.getOverlayText(type);

    // Make video container relative if needed
    const container = video.parentElement;
    if (container && getComputedStyle(container).position === 'static') {
      container.style.position = 'relative';
    }

    container.appendChild(overlay);

    // Remove after delay
    if (type !== 'blocked') {
      setTimeout(() => {
        if (overlay.parentNode) {
          overlay.parentNode.removeChild(overlay);
        }
      }, 2000);
    }
  }

  /**
   * Get overlay background for feedback type
   * @private
   */
  getOverlayBackground(type) {
    switch (type) {
      case 'processing':
        return 'rgba(59, 130, 246, 0.8)';
      case 'blocked':
        return 'rgba(239, 68, 68, 0.9)';
      case 'error':
        return 'rgba(245, 158, 11, 0.8)';
      default:
        return 'rgba(0, 0, 0, 0.7)';
    }
  }

  /**
   * Get overlay text for feedback type
   * @private
   */
  getOverlayText(type) {
    switch (type) {
      case 'processing':
        return '🔍 Analyzing...';
      case 'blocked':
        return '🚫 Blocked';
      case 'error':
        return '⚠️ Error';
      default:
        return '';
    }
  }

  /**
   * Clean up all UI elements
   */
  /**
   * Show toast with offset
   * @param {string} message - Message to display
   * @param {string} type - Toast type ('success', 'error', 'info')
   * @param {Object} offset - Offset object with x and y properties
   * @param {number} duration - Duration in milliseconds
   */
  showToastWithOffset(message, type = 'info', offset = { x: 0, y: 0 }, duration = UI.TOAST_DURATION_MS) {
    this.logger.debug('Showing toast with offset', { message, type, offset, duration });

    // Set background color based on type
    let backgroundColor;
    switch (type) {
      case 'success':
        backgroundColor = TOASTIFY.GRADIENT.SUCCESS;
        break;
      case 'error':
        backgroundColor = TOASTIFY.GRADIENT.ERROR;
        break;
      case 'warning':
        backgroundColor = TOASTIFY.GRADIENT.WARNING;
        break;
      default:
        backgroundColor = TOASTIFY.GRADIENT.INFO;
    }

    // Create and show toast using Toastify with offset
    const toast = Toastify({
      text: message,
      duration: duration,
      close: TOASTIFY.CLOSE,
      gravity: UI.TOAST_GRAVITY,
      position: UI.TOAST_POSITION,
      offset: offset,
      stopOnFocus: TOASTIFY.STOP_ON_FOCUS,
      style: {
        background: backgroundColor,
      },
      onClick: () => {} // Prevents dismissing when clicked
    }).showToast();

    return toast;
  }

  cleanup() {
    this.clearToasts();

    // Remove all video overlays
    const overlays = document.querySelectorAll('.vb-video-overlay');
    overlays.forEach(overlay => {
      if (overlay.parentNode) {
        overlay.parentNode.removeChild(overlay);
      }
    });

    this.logger.debug('UI cleanup completed');
  }
}
