/**
 * Configuration Constants for Video Blocker Extension
 */

// Storage configuration
export const STORAGE = {
  KEY: 'vb_blocked_hashes_v1',
  LOG_LEVEL_KEY: 'vb_log_level',
  SETTINGS_KEY: 'vb_settings'
};

// Video processing configuration
export const VIDEO_PROCESSING = {
  FRAMES_TO_CAPTURE: 3,           // Number of frames to sample for fingerprinting
  FRAME_DELAY_MS: 120,           // Delay between frame captures
  CANVAS_SIZE: 32,               // Canvas size for image processing (32x32)
  DCT_BLOCK_SIZE: 8,             // DCT block size for hash computation
  AUTO_SCAN_FRAMES: 2            // Reduced frames for auto-scanning
};

// Hash comparison configuration
// Using let instead of const to allow runtime modification of threshold
export let HASH_CONFIG = {
  HAMMING_THRESHOLD: 12,         // Maximum Hamming distance for match (modified by sensitivity setting)
  MIN_ONES_ZEROS: 4             // Minimum ones/zeros to avoid trivial hashes
};

// Concurrency configuration
export const CONCURRENCY = {
  MAX_CONCURRENT: 3,             // Maximum concurrent video processing tasks
  QUEUE_TIMEOUT_MS: 5000         // Timeout for queue operations
};

// UI configuration
export const UI = {
  TOAST_DURATION_MS: 1200,       // Toast notification duration
  TOAST_ID: 'vb-toast',          // Toast element ID
  FADE_DURATION_MS: 180,         // Article fade out duration
  HIDE_DELAY_MS: 200,            // Delay before hiding article
  TOAST_GRAVITY: 'top',          // Toast position vertical (top/bottom)
  TOAST_POSITION: 'right',       // Toast position horizontal (left/center/right)
  TOAST_OFFSET: {                // Toast offset from position
    y: 10,
    x: 10
  }
};

// Toastify specific configuration
export const TOASTIFY = {
  GRADIENT: {
    SUCCESS: 'linear-gradient(to right, #00b09b, #96c93d)',
    ERROR: 'linear-gradient(to right, #ff5f6d, #ffc371)',
    WARNING: 'linear-gradient(to right, #f7b733, #fc4a1a)',
    INFO: 'linear-gradient(to right, #3b82f6, #2563eb)'
  },
  CLOSE: true,                  // Show close button
  STOP_ON_FOCUS: true,          // Stop timer when toast is focused
};

// Video loading configuration
export const VIDEO_LOAD = {
  TIMEOUT_MS: 1500,              // Timeout for video loading
  READY_STATE_THRESHOLD: 2       // Minimum readyState for processing
};

// Timing configuration
export const TIMING = {
  INITIAL_SCAN_DELAY_MS: 800,    // Delay before initial video scan
  URL_CHANGE_SCAN_DELAY_MS: 300  // Delay after URL change before scanning
};

// Selector configuration
export const SELECTORS = {
  ARTICLE: 'article',
  VIDEO: 'video',
  VIDEO_COMPONENT: '[data-testid="videoComponent"]'
};

// Event configuration
export const EVENTS = {
  MODIFIER_KEY: 'metaKey',       // Key for blocking (Cmd on Mac, Ctrl on others)
  URL_CHANGE: 'urlchange'
};

// Debug configuration
export const DEBUG = {
  GLOBAL_OBJECT: '__videoBlockerDebug'
};

// Log categories
export const LOG_CATEGORIES = {
  SYSTEM: 'SYSTEM',
  STORAGE: 'STORAGE',
  HASH: 'HASH',
  VIDEO: 'VIDEO',
  UI: 'UI',
  SCANNER: 'SCANNER',
  BLOCKER: 'BLOCKER',
  QUEUE: 'QUEUE',
  EVENT: 'EVENT'
};

// Error messages
export const ERROR_MESSAGES = {
  NO_VIDEO_FOUND: 'No video found at pointer location',
  FINGERPRINT_FAILED: 'Fingerprint failed (poster/blocked)',
  CANVAS_TAINTED: 'Canvas is tainted - cannot process video',
  VIDEO_NOT_READY: 'Video not ready for processing',
  STORAGE_ERROR: 'Storage operation failed',
  HASH_COMPUTATION_ERROR: 'Hash computation failed',
  VIDEO_POSTER_FRAME: 'Cannot block: video not ready or is poster frame',
  VIDEO_LOADING: 'Video is still loading, please try again',
  VIDEO_TRIVIAL: 'Cannot block: video appears to be blank or loading screen'
};

// Success messages
export const SUCCESS_MESSAGES = {
  VIDEO_BLOCKED: 'Video blocked',
  FINGERPRINTING: 'Fingerprinting video...',
  FINGERPRINTING_RETRY: 'Analyzing video (retry attempt)...',
  HASH_SAVED: 'Hash saved to blocked list',
  AUTO_BLOCKED: 'Video auto-blocked',
  VIDEO_ALREADY_BLOCKED: 'Video already blocked'
};
