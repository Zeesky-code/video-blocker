# Twitter Video Blocker Extension

A modern browser extension that lets you block unwanted videos on Twitter/X using advanced perceptual hashing technology.

## 🔍 Overview

This extension allows you to Control+Click (or Cmd+Click on Mac) any video on Twitter to fingerprint and automatically block similar videos from appearing in your feed. It uses sophisticated video analysis to identify and hide matching content, even when it's re-encoded or slightly modified.

## ✨ Key Features

- **One-Click Blocking**: Cmd/Ctrl+Click on any video to block it and similar content
- **Automatic Detection**: Smart scanning identifies and hides matching videos as you browse
- **Visual Feedback**: Toast notifications confirm when videos are blocked
- **Advanced Fingerprinting**: Uses DCT-based perceptual hashing for reliable matching
- **Memory Efficient**: Optimized for performance with minimal resource usage

## 🚀 Installation

1. **Clone or download the repository**

   ```bash
   git clone https://github.com/yourusername/video-blocker.git
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Build the extension**

   ```bash
   npm run build
   ```

4. **Load in browser**
   - Open Chrome/Edge and go to `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked" and select the `dist/` folder

## 🎮 How to Use

### Basic Usage

1. Navigate to Twitter/X
2. Find an unwanted video
3. Hold Cmd (Mac) or Ctrl (Windows/Linux) and click on the video
4. A toast notification will confirm the video has been blocked
5. Similar videos will be automatically blocked as you browse

### Options Page

Access the options page through your browser's extensions menu for:

- View blocking statistics
- Manage blocked video list
- Adjust sensitivity settings
- Import/export your blocklist

## 🧰 Architecture

The extension is built with modern ES modules and organized into a clean, maintainable structure:

```
esm-src/
├── constants.js           # Configuration settings
├── content.js            # Main application coordinator
├── utils/                # Utility modules (logger, storage, UI, etc.)
└── core/                 # Core functionality modules
```

## 🛠️ Development

### Available Scripts

- `npm run dev` - Development build with hot reload
- `npm run build` - Production build
- `npm run clean` - Clean build directory

### Debug Console

The extension provides a comprehensive debug interface via browser console:

```javascript
// System information
__videoBlockerDebug.getStats();
__videoBlockerDebug.getComponentStatus();

// Video operations
__videoBlockerDebug.scanAllVideos();
__videoBlockerDebug.pauseScanning();
__videoBlockerDebug.resumeScanning();

// Hash management
__videoBlockerDebug.getBlockedHashes();
__videoBlockerDebug.clearAllBlocked();

// Testing Toastify notifications
__videoBlockerDebug.testToast("Custom message", "success");
__videoBlockerDebug.showToastTypes();
__videoBlockerDebug.testToastOffset(50, 100);
```

## 🔧 Technical Details

### Video Fingerprinting

1. Captures multiple frames from video
2. Converts to grayscale matrices
3. Applies DCT transformation
4. Generates binary hash based on frequency patterns
5. Uses Hamming distance for similarity matching

### Notifications

- Toast notifications powered by Toastify-js
- Customizable position, duration, and style
- Different gradient styles for success, error, warning, and info notifications

### Browser Compatibility

- Chrome 88+ (Manifest V3)
- Microsoft Edge 88+
- Other Chromium-based browsers
- Firefox (with minor adaptations)

## 🤝 Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository
2. Create your feature branch: `git checkout -b feature/amazing-feature`
3. Make your changes and test thoroughly
4. Commit your changes: `git commit -m 'Add some amazing feature'`
5. Push to the branch: `git push origin feature/amazing-feature`
6. Open a Pull Request

## 📝 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🙏 Acknowledgments

- [Toastify-js](https://github.com/apvarun/toastify-js) for toast notifications
- Built with Vite for modern, efficient bundling
- Uses perceptual hashing techniques inspired by image similarity detection
