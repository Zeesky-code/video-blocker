/**
 * Video Processing Utilities for Video Blocker Extension
 * Handles video frame capture, processing, and hash computation
 */

import { VIDEO_PROCESSING, VIDEO_LOAD, LOG_CATEGORIES, ERROR_MESSAGES } from '../constants.js';
import { HashUtils } from './hash.js';

export class VideoUtils {
  constructor(logger) {
    this.logger = logger.createCategoryLogger(LOG_CATEGORIES.VIDEO);
    this.hashUtils = new HashUtils(logger);
  }

  /**
   * Compute multi-frame perceptual hash from video element
   * @param {HTMLVideoElement} video - Video element to process
   * @param {number} frameCount - Number of frames to capture
   * @param {number} retryCount - Number of retries for failed attempts
   * @returns {Promise<string|null>} - Perceptual hash or null if failed
   */
  async computeMultiFramePHash(video, frameCount = VIDEO_PROCESSING.FRAMES_TO_CAPTURE, retryCount = 2) {
    for (let attempt = 0; attempt <= retryCount; attempt++) {
      try {
        if (!this.isValidVideoElement(video)) {
          // If video isn't ready on first attempt, wait and try again
          if (attempt < retryCount) {
            this.logger.debug(`Video not ready, attempt ${attempt + 1}/${retryCount + 1}, waiting...`);
            await new Promise(resolve => setTimeout(resolve, 500));
            continue;
          }
          throw new Error('Invalid video element provided');
        }

        this.logger.debug('Starting multi-frame hash computation', {
          attempt: attempt + 1,
          maxAttempts: retryCount + 1,
          frameCount,
          videoSrc: video.src || 'no-src',
          readyState: video.readyState,
          duration: video.duration
        });

        // Ensure video is ready for processing
        await this.ensureVideoReady(video);

        // Setup video for frame capture
        const originalMuted = await this.prepareVideoForCapture(video);

        // Create canvas for frame processing
        const canvas = this.createProcessingCanvas();
        const ctx = canvas.getContext('2d');

        try {
          // Wait a bit longer if this is a retry to let video stabilize
          if (attempt > 0) {
            await new Promise(resolve => setTimeout(resolve, 300));
          }

          // Capture and process frames
          const averageMatrix = await this.captureAndAverageFrames(
            video, ctx, canvas, frameCount
          );

          if (!averageMatrix) {
            throw new Error('Failed to capture video frames');
          }

          // Compute hash from averaged matrix
          const hash = this.hashUtils.computePHashFromMatrix(averageMatrix);

          if (!hash) {
            throw new Error('Hash computation failed');
          }

          // Validate hash quality
          if (this.hashUtils.isTrivialHash(hash)) {
            // On first attempts, this might be a poster frame, try again
            if (attempt < retryCount) {
              this.logger.debug('Trivial hash detected on attempt, retrying with different timing...');
              video.muted = originalMuted;
              canvas.remove();
              await new Promise(resolve => setTimeout(resolve, 800));
              continue;
            }
            this.logger.warn('Trivial hash detected after all attempts - likely poster frame or blank video');
            video.muted = originalMuted;
            canvas.remove();
            return null;
          }

          this.logger.info('Multi-frame hash computed successfully', {
            attempt: attempt + 1,
            hashLength: hash.length,
            framesCaptured: frameCount,
            hashPreview: hash.substring(0, 16) + '...'
          });

          video.muted = originalMuted;
          canvas.remove();
          return hash;

        } finally {
          // Restore video state
          video.muted = originalMuted;
          canvas.remove();
        }

      } catch (error) {
        this.logger.debug(`Hash computation attempt ${attempt + 1} failed:`, error);

        // If this is the last attempt, log as error and return null
        if (attempt === retryCount) {
          this.logger.error('Multi-frame hash computation failed after all attempts', error);
          return null;
        }

        // Wait before retrying
        await new Promise(resolve => setTimeout(resolve, 300));
      }
    }

    return null;
  }

  /**
   * Validate video element for processing
   * @param {HTMLVideoElement} video - Video element to check
   * @returns {boolean} - True if valid for processing
   */
  isValidVideoElement(video) {
    if (!video || !(video instanceof HTMLVideoElement)) {
      this.logger.debug('Invalid video element - not HTMLVideoElement');
      return false;
    }

    if (video.readyState < VIDEO_LOAD.READY_STATE_THRESHOLD) {
      this.logger.debug('Video not ready for processing', {
        readyState: video.readyState,
        required: VIDEO_LOAD.READY_STATE_THRESHOLD
      });
      return false;
    }

    if (!video.videoWidth || !video.videoHeight) {
      this.logger.debug('Video has no dimensions');
      return false;
    }

    return true;
  }

  /**
   * Wait for video to be ready for processing
   * @param {HTMLVideoElement} video - Video to wait for
   * @returns {Promise<void>}
   */
  async ensureVideoReady(video) {
    return new Promise((resolve, reject) => {
      if (video.readyState >= VIDEO_LOAD.READY_STATE_THRESHOLD) {
        resolve();
        return;
      }

      const timeout = setTimeout(() => {
        cleanup();
        reject(new Error('Video ready timeout'));
      }, VIDEO_LOAD.TIMEOUT_MS);

      const onReady = () => {
        if (video.readyState >= VIDEO_LOAD.READY_STATE_THRESHOLD) {
          cleanup();
          resolve();
        }
      };

      const cleanup = () => {
        clearTimeout(timeout);
        video.removeEventListener('loadeddata', onReady);
        video.removeEventListener('canplay', onReady);
      };

      video.addEventListener('loadeddata', onReady);
      video.addEventListener('canplay', onReady);
    });
  }

  /**
   * Prepare video for frame capture
   * @param {HTMLVideoElement} video - Video element
   * @returns {Promise<boolean>} - Original muted state
   */
  async prepareVideoForCapture(video) {
    const originalMuted = video.muted;

    // Mute to avoid audio interference
    video.muted = true;

    // Seek to a more stable position for better frame capture
    if (video.duration > 2) {
      // Try to get past any intro/loading frames
      const seekTime = Math.min(video.duration * 0.1, 2); // 10% in or 2 seconds max
      if (Math.abs(video.currentTime - seekTime) > 0.5) {
        video.currentTime = seekTime;
        await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            video.removeEventListener('seeked', onSeeked);
            resolve(); // Don't fail completely, just continue
          }, 2000);

          const onSeeked = () => {
            clearTimeout(timeout);
            video.removeEventListener('seeked', onSeeked);
            resolve();
          };
          video.addEventListener('seeked', onSeeked);
        });
      }
    } else if (video.currentTime === 0 && video.duration > 0.5) {
      video.currentTime = 0.3;
      await new Promise(resolve => {
        const onSeeked = () => {
          video.removeEventListener('seeked', onSeeked);
          resolve();
        };
        video.addEventListener('seeked', onSeeked);
        setTimeout(resolve, 1000); // Fallback timeout
      });
    }

    return originalMuted;
  }

  /**
   * Create canvas for video processing
   * @returns {HTMLCanvasElement} - Processing canvas
   */
  createProcessingCanvas() {
    const canvas = document.createElement('canvas');
    canvas.width = VIDEO_PROCESSING.CANVAS_SIZE;
    canvas.height = VIDEO_PROCESSING.CANVAS_SIZE;
    canvas.style.display = 'none';
    document.body.appendChild(canvas);
    return canvas;
  }

  /**
   * Capture frames and compute average matrix
   * @param {HTMLVideoElement} video - Source video
   * @param {CanvasRenderingContext2D} ctx - Canvas context
   * @param {HTMLCanvasElement} canvas - Canvas element
   * @param {number} frameCount - Number of frames to capture
   * @returns {Promise<Array<Array<number>>|null>} - Average grayscale matrix
   */
  async captureAndAverageFrames(video, ctx, canvas, frameCount) {
    const matrices = [];
    const size = VIDEO_PROCESSING.CANVAS_SIZE;

    for (let i = 0; i < frameCount; i++) {
      try {
        // Draw current frame to canvas
        ctx.drawImage(video, 0, 0, size, size);

        // Get image data and convert to grayscale matrix
        const imageData = ctx.getImageData(0, 0, size, size);
        const matrix = this.imageDataToGrayscaleMatrix(imageData, size);

        if (matrix) {
          matrices.push(matrix);
          this.logger.debug(`Frame ${i + 1} captured and processed`);
        }

        // Wait before next frame
        if (i < frameCount - 1) {
          await new Promise(resolve =>
            setTimeout(resolve, VIDEO_PROCESSING.FRAME_DELAY_MS)
          );
        }

      } catch (error) {
        this.logger.warn(`Failed to capture frame ${i + 1}`, error);
      }
    }

    if (matrices.length === 0) {
      this.logger.error('No frames captured successfully');
      return null;
    }

    // Average all captured matrices
    return this.averageMatrices(matrices);
  }

  /**
   * Convert ImageData to grayscale matrix
   * @param {ImageData} imageData - Canvas image data
   * @param {number} size - Matrix size
   * @returns {Array<Array<number>>|null} - Grayscale matrix
   */
  imageDataToGrayscaleMatrix(imageData, size) {
    try {
      const matrix = Array.from({ length: size }, () => Array(size).fill(0));
      const data = imageData.data;

      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const idx = (y * size + x) * 4;
          const r = data[idx];
          const g = data[idx + 1];
          const b = data[idx + 2];

          // Convert to grayscale using luminance formula
          const gray = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
          matrix[y][x] = gray;
        }
      }

      return matrix;
    } catch (error) {
      this.logger.error('Failed to convert image data to matrix', error);
      return null;
    }
  }

  /**
   * Average multiple matrices
   * @param {Array<Array<Array<number>>>} matrices - Array of matrices to average
   * @returns {Array<Array<number>>} - Averaged matrix
   */
  averageMatrices(matrices) {
    if (matrices.length === 0) return null;
    if (matrices.length === 1) return matrices[0];

    const size = matrices[0].length;
    const averaged = Array.from({ length: size }, () => Array(size).fill(0));

    // Sum all matrices
    for (const matrix of matrices) {
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          averaged[y][x] += matrix[y][x];
        }
      }
    }

    // Divide by count to get average
    const count = matrices.length;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        averaged[y][x] = Math.round(averaged[y][x] / count);
      }
    }

    this.logger.debug('Matrices averaged', {
      inputCount: count,
      outputSize: `${size}x${size}`
    });

    return averaged;
  }

  /**
   * Find video element at screen coordinates
   * @param {number} clientX - X coordinate
   * @param {number} clientY - Y coordinate
   * @returns {HTMLVideoElement|null} - Video element or null
   */
  findVideoAtCoordinates(clientX, clientY) {
    try {
      const elements = document.elementsFromPoint(clientX, clientY);

      for (const element of elements) {
        // Direct video element
        if (element instanceof HTMLVideoElement) {
          return element;
        }

        // Video within element
        const video = element.querySelector('video');
        if (video) {
          return video;
        }
      }

      this.logger.debug('No video found at coordinates', { clientX, clientY });
      return null;

    } catch (error) {
      this.logger.error('Error finding video at coordinates', error);
      return null;
    }
  }

  /**
   * Check if video appears to be blocked/hidden
   * @param {HTMLVideoElement} video - Video to check
   * @returns {boolean} - True if video appears blocked
   */
  isVideoBlocked(video) {
    if (!video) return false;

    const article = video.closest('article');
    if (!article) return false;

    const style = window.getComputedStyle(article);
    return style.display === 'none' ||
           style.visibility === 'hidden' ||
           style.opacity === '0' ||
           article.style.display === 'none';
  }
}
