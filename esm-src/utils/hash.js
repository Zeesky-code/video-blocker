/**
 * Hash Computation Utilities for Video Blocker Extension
 * Implements perceptual hashing using DCT and provides hash comparison utilities
 */

import { VIDEO_PROCESSING, HASH_CONFIG, LOG_CATEGORIES } from '../constants.js';

export class HashUtils {
  constructor(logger) {
    this.logger = logger.createCategoryLogger(LOG_CATEGORIES.HASH);
  }

  /**
   * Compute perceptual hash from grayscale matrix using DCT
   * @param {Array<Array<number>>} matrix32 - 32x32 grayscale matrix
   * @returns {string|null} - Binary hash string or null if failed
   */
  computePHashFromMatrix(matrix32) {
    try {
      if (!matrix32 || matrix32.length !== VIDEO_PROCESSING.CANVAS_SIZE) {
        throw new Error('Invalid matrix size');
      }

      this.logger.debug('Computing DCT for perceptual hash');
      const dct = this.dct2D(matrix32);

      // Extract 8x8 block (excluding DC component)
      const block = [];
      for (let y = 0; y < VIDEO_PROCESSING.DCT_BLOCK_SIZE; y++) {
        for (let x = 0; x < VIDEO_PROCESSING.DCT_BLOCK_SIZE; x++) {
          if (x === 0 && y === 0) continue; // Skip DC component
          block.push(dct[y][x]);
        }
      }

      // Calculate median
      const sorted = block.slice().sort((a, b) => a - b);
      const median = sorted[Math.floor(sorted.length / 2)];

      // Generate binary hash
      const bits = block.map(v => (v > median ? '1' : '0')).join('');

      this.logger.debug('Hash computed successfully', {
        hashLength: bits.length,
        median: median.toFixed(4),
        ones: (bits.match(/1/g) || []).length,
        zeros: (bits.match(/0/g) || []).length
      });

      return bits;
    } catch (error) {
      this.logger.error('Failed to compute perceptual hash', error);
      return null;
    }
  }

  /**
   * 2D Discrete Cosine Transform (DCT-II)
   * @param {Array<Array<number>>} matrix - Input matrix
   * @returns {Array<Array<number>>} - DCT transformed matrix
   */
  dct2D(matrix) {
    const N = matrix.length;
    const result = Array.from({ length: N }, () => Array(N).fill(0));

    const alpha = (u) => (u === 0 ? 1 / Math.sqrt(2) : 1);

    for (let u = 0; u < N; u++) {
      for (let v = 0; v < N; v++) {
        let sum = 0;

        for (let y = 0; y < N; y++) {
          for (let x = 0; x < N; x++) {
            sum += matrix[y][x] *
              Math.cos(((2 * x + 1) * u * Math.PI) / (2 * N)) *
              Math.cos(((2 * y + 1) * v * Math.PI) / (2 * N));
          }
        }

        result[u][v] = (2 / N) * alpha(u) * alpha(v) * sum;
      }
    }

    return result;
  }

  /**
   * Calculate Hamming distance between two hash strings
   * @param {string} hash1 - First hash
   * @param {string} hash2 - Second hash
   * @returns {number} - Hamming distance (0 = identical)
   */
  hammingDistance(hash1, hash2) {
    if (!hash1 || !hash2) {
      this.logger.warn('Invalid hashes provided for comparison', {
        hash1: !!hash1,
        hash2: !!hash2
      });
      return Infinity;
    }

    if (typeof hash1 !== 'string' || typeof hash2 !== 'string') {
      this.logger.warn('Non-string hashes provided', {
        hash1Type: typeof hash1,
        hash2Type: typeof hash2
      });
      return Infinity;
    }

    const minLength = Math.min(hash1.length, hash2.length);
    let distance = 0;

    // Count bit differences
    for (let i = 0; i < minLength; i++) {
      if (hash1[i] !== hash2[i]) {
        distance++;
      }
    }

    // Add length difference as additional distance
    distance += Math.abs(hash1.length - hash2.length);

    this.logger.debug('Hamming distance calculated', {
      distance,
      hash1Length: hash1.length,
      hash2Length: hash2.length,
      similarity: ((minLength - distance) / minLength * 100).toFixed(1) + '%'
    });

    return distance;
  }

  /**
   * Check if two hashes are similar based on threshold
   * @param {string} hash1 - First hash
   * @param {string} hash2 - Second hash
   * @param {number} threshold - Maximum allowed distance (default from config)
   * @returns {boolean} - True if hashes are similar
   */
  areHashesSimilar(hash1, hash2, threshold = HASH_CONFIG.HAMMING_THRESHOLD) {
    const distance = this.hammingDistance(hash1, hash2);
    const similar = distance <= threshold;

    this.logger.debug('Hash similarity check', {
      distance,
      threshold,
      similar,
      hash1Preview: hash1 ? hash1.substring(0, 8) + '...' : 'null',
      hash2Preview: hash2 ? hash2.substring(0, 8) + '...' : 'null'
    });

    return similar;
  }

  /**
   * Detect if hash is trivial (all same bits or extremely skewed)
   * @param {string} hash - Hash to check
   * @returns {boolean} - True if hash is trivial/unreliable
   */
  isTrivialHash(hash) {
    if (!hash || typeof hash !== 'string') {
      this.logger.debug('Invalid hash detected as trivial');
      return true;
    }

    const ones = (hash.match(/1/g) || []).length;
    const zeros = hash.length - ones;

    // Check for extremely skewed distributions
    const isTrivial = ones <= HASH_CONFIG.MIN_ONES_ZEROS ||
                     zeros <= HASH_CONFIG.MIN_ONES_ZEROS;

    if (isTrivial) {
      this.logger.warn('Trivial hash detected', {
        hashLength: hash.length,
        ones,
        zeros,
        onesPercent: (ones / hash.length * 100).toFixed(1) + '%',
        zerosPercent: (zeros / hash.length * 100).toFixed(1) + '%'
      });
    }

    return isTrivial;
  }

  /**
   * Validate hash format and quality
   * @param {string} hash - Hash to validate
   * @returns {Object} - Validation result with details
   */
  validateHash(hash) {
    const result = {
      valid: false,
      issues: [],
      metrics: {}
    };

    if (!hash) {
      result.issues.push('Hash is null or undefined');
      return result;
    }

    if (typeof hash !== 'string') {
      result.issues.push('Hash is not a string');
      return result;
    }

    // Check format (should be binary string)
    if (!/^[01]+$/.test(hash)) {
      result.issues.push('Hash contains non-binary characters');
      return result;
    }

    // Calculate metrics
    const ones = (hash.match(/1/g) || []).length;
    const zeros = hash.length - ones;
    result.metrics = {
      length: hash.length,
      ones,
      zeros,
      onesPercent: (ones / hash.length * 100),
      zerosPercent: (zeros / hash.length * 100),
      entropy: this.calculateEntropy(hash)
    };

    // Check if trivial
    if (this.isTrivialHash(hash)) {
      result.issues.push('Hash appears to be trivial (low entropy)');
    }

    // Check length
    const expectedLength = (VIDEO_PROCESSING.DCT_BLOCK_SIZE * VIDEO_PROCESSING.DCT_BLOCK_SIZE) - 1;
    if (hash.length !== expectedLength) {
      result.issues.push(`Unexpected hash length: ${hash.length}, expected: ${expectedLength}`);
    }

    result.valid = result.issues.length === 0;

    this.logger.debug('Hash validation completed', {
      valid: result.valid,
      issueCount: result.issues.length,
      metrics: result.metrics
    });

    return result;
  }

  /**
   * Calculate Shannon entropy of a binary string
   * @param {string} binaryString - Binary string to analyze
   * @returns {number} - Entropy value (0-1)
   */
  calculateEntropy(binaryString) {
    if (!binaryString) return 0;

    const ones = (binaryString.match(/1/g) || []).length;
    const zeros = binaryString.length - ones;
    const total = binaryString.length;

    if (ones === 0 || zeros === 0) return 0;

    const p1 = ones / total;
    const p0 = zeros / total;

    return -(p1 * Math.log2(p1) + p0 * Math.log2(p0));
  }

  /**
   * Find the most similar hash from a list
   * @param {string} targetHash - Hash to compare against
   * @param {string[]} hashList - List of hashes to search
   * @returns {Object|null} - Best match with distance and hash
   */
  findMostSimilarHash(targetHash, hashList) {
    if (!targetHash || !hashList || hashList.length === 0) {
      return null;
    }

    let bestMatch = null;
    let minDistance = Infinity;

    for (const hash of hashList) {
      const distance = this.hammingDistance(targetHash, hash);
      if (distance < minDistance) {
        minDistance = distance;
        bestMatch = {
          hash,
          distance,
          similarity: ((Math.min(targetHash.length, hash.length) - distance) /
                      Math.min(targetHash.length, hash.length) * 100)
        };
      }
    }

    this.logger.debug('Best hash match found', {
      targetPreview: targetHash.substring(0, 8) + '...',
      bestMatchPreview: bestMatch ? bestMatch.hash.substring(0, 8) + '...' : 'none',
      distance: bestMatch ? bestMatch.distance : 'N/A',
      similarity: bestMatch ? bestMatch.similarity.toFixed(1) + '%' : 'N/A'
    });

    return bestMatch;
  }
}
