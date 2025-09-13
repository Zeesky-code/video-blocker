(function () {
  const LOG = 'VideoBlockerClick:';
  const STORAGE_KEY = 'vb_blocked_hashes_v1';
  const FRAMES_TO_CAPTURE = 3;       // number of frames to sample: you can experiment
  const FRAME_DELAY_MS = 120;       
  const CANVAS_SIZE = 32;          
  const HAMMING_THRESHOLD = 12;     
  const MAX_CONCURRENT = 3;

  // concurrency queue
  const queue = [];
  let active = 0;
  function enqueue(task) {
    queue.push(task);
    runQueue();
  }
  function runQueue() {
    if (active >= MAX_CONCURRENT || queue.length === 0) return;
    active++;
    const fn = queue.shift();
    Promise.resolve()
      .then(() => fn())
      .catch(e => console.warn(LOG, 'queue task failed', e))
      .finally(() => {
        active--;
        runQueue();
      });
  }

  // blocked list (array of hash strings)
  let blocked = [];
  function loadBlocked() {
    console.info(LOG, 'loading blocked list');
    chrome.storage.local.get([STORAGE_KEY], (d) => {
      blocked = (d[STORAGE_KEY] || []).map(x => x.hash).filter(Boolean);
      console.info(LOG, 'loaded', blocked.length, 'fingerprints');
    });
  }
  loadBlocked();
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes[STORAGE_KEY]) {
      blocked = (changes[STORAGE_KEY].newValue || []).map(x => x.hash).filter(Boolean);
      console.info(LOG, 'blocked list updated', blocked.length);
    }
  });


  // DCT-II for matrix (matrix[y][x], y:rows, x:cols)
  function dct2D(matrix) {
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

  // compute pHash from grayscale matrix (32x32)
  function computePHashFromMatrix(matrix32) {
    const dct = dct2D(matrix32);
    const block = [];
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        if (x === 0 && y === 0) continue;
        block.push(dct[y][x]);
      }
    }
    const sorted = block.slice().sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    const bits = block.map(v => (v > median ? '1' : '0')).join('');
    return bits;
  }

  // Hamming distance
  function hamming(a, b) {
    if (!a || !b) return Infinity;
    const L = Math.min(a.length, b.length);
    let dist = 0;
    for (let i = 0; i < L; i++) if (a[i] !== b[i]) dist++;
    dist += Math.abs(a.length - b.length);
    return dist;
  }

  // detect unreliable hash (all same bit or extremely skewed)
  function isTrivialHash(hash) {
    if (!hash) return true;
    const ones = (hash.match(/1/g) || []).length;
    const zeros = hash.length - ones;
    // too few ones or zeros -> might be blank/poster
    if (ones <= 4 || zeros <= 4) return true;
    return false;
  }

  // ---------- capture multiple frames & build averaged grayscale matrix ----------
  async function computeMultiFramePHash(video, frames = FRAMES_TO_CAPTURE) {
    try {
      if (video.readyState < 2) {
        await new Promise((resolve) => {
          let resolved = false;
          const onLoaded = () => { if (!resolved) { resolved = true; cleanup(); resolve(); } };
          const onError = () => { if (!resolved) { resolved = true; cleanup(); resolve(); } };
          function cleanup() {
            video.removeEventListener('loadeddata', onLoaded);
            video.removeEventListener('error', onError);
          }
          video.addEventListener('loadeddata', onLoaded);
          video.addEventListener('error', onError);
          setTimeout(() => { if (!resolved) { resolved = true; cleanup(); resolve(); } }, 1500);
        });
      }

      // attempt to play (muted) to ensure frames update
      const prevMuted = video.muted;
      try { video.muted = true; const p = video.play(); if (p && typeof p.then === 'function') p.catch(() => { }); } catch (e) { /* ignore */ }

      // prepare canvas
      const canvas = document.createElement('canvas');
      canvas.width = CANVAS_SIZE;
      canvas.height = CANVAS_SIZE;
      const ctx = canvas.getContext('2d');

      // accumulator matrix
      const N = CANVAS_SIZE;
      const acc = Array.from({ length: N }, () => Array(N).fill(0));
      let captured = 0;

      for (let i = 0; i < frames; i++) {
        await new Promise((resolve) => {
          if (video.requestVideoFrameCallback) {
            try {
              video.requestVideoFrameCallback(() => { resolve(); });
            } catch (e) {
              setTimeout(resolve, FRAME_DELAY_MS);
            }
          } else {
            setTimeout(resolve, FRAME_DELAY_MS);
          }
        });

        try {
          // draw; if this throws (tainted canvas), bail out
          ctx.drawImage(video, 0, 0, N, N);
          const img = ctx.getImageData(0, 0, N, N).data;
          // accumulate grayscale
          let idx = 0;
          for (let y = 0; y < N; y++) {
            for (let x = 0; x < N; x++) {
              const r = img[idx++], g = img[idx++], b = img[idx++], a = img[idx++];
              // if alpha is 0 it may be blank; treat as black
              const gray = (r + g + b) / 3;
              acc[y][x] += gray;
            }
          }
          captured++;
        } catch (err) {
          console.warn(LOG, 'drawImage failed for frame', i, err);
        }
      }

      // restore muted state
      try { video.muted = prevMuted; } catch (e) { }

      if (captured === 0) {
        console.warn(LOG, 'No frames captured; returning null');
        return null;
      }

      // compute average matrix
      const avg = acc.map(row => row.map(v => v / captured));
      const hash = computePHashFromMatrix(avg);

      if (isTrivialHash(hash)) {
        console.warn(LOG, 'Trivial hash detected (likely poster/blank):', hash);
        return null;
      }

      return hash;
    } catch (e) {
      console.warn(LOG, 'computeMultiFramePHash error', e);
      return null;
    }
  }

  // ---------- helpers ----------
  function findArticleAncestor(el) {
    let cur = el;
    while (cur) {
      if (cur.tagName && cur.tagName.toLowerCase() === 'article') return cur;
      cur = cur.parentElement;
    }
    return null;
  }

  function showToast(msg, duration = 1200) {
    try {
      const id = 'vb-toast';
      let t = document.getElementById(id);
      if (!t) {
        t = document.createElement('div');
        t.id = id;
        t.style.position = 'fixed';
        t.style.right = '12px';
        t.style.bottom = '12px';
        t.style.zIndex = 2147483647;
        t.style.background = 'rgba(0,0,0,0.85)';
        t.style.color = 'white';
        t.style.padding = '8px 12px';
        t.style.borderRadius = '6px';
        t.style.fontSize = '13px';
        document.body.appendChild(t);
      }
      t.textContent = msg;
      t.style.opacity = '1';
      setTimeout(() => { t.style.transition = 'opacity 300ms'; t.style.opacity = '0'; }, duration);
    } catch (e) { console.warn(LOG, 'toast failed', e); }
  }

  // save a blocked hash object
  function saveBlockedHash(hash) {
    const obj = { hash, added: Date.now() };
    chrome.storage.local.get([STORAGE_KEY], (d) => {
      const arr = d[STORAGE_KEY] || [];
      if (!arr.some(x => x.hash === hash)) {
        arr.push(obj);
        chrome.storage.local.set({ [STORAGE_KEY]: arr }, () => {
          blocked.push(hash);
          console.info(LOG, 'Saved new blocked hash; total now', blocked.length);
        });
      } else {
        console.info(LOG, 'Hash already stored');
      }
    });
  }

  // ---------- click-to-block (use elementFromPoint to find exact target) ----------
  document.addEventListener('pointerdown', async (ev) => {
    try {
      if (!ev.metaKey) return; // Cmd+Click on Mac, feel free to change
      const x = ev.clientX, y = ev.clientY;
      const top = document.elementFromPoint(x, y) || ev.target;

      // locate video: closest, inside or in known container
      let video = top.closest && top.closest('video');
      if (!video) video = top.querySelector && top.querySelector('video');
      if (!video) video = top.closest && top.closest('[data-testid="videoComponent"]')?.querySelector('video');
      if (!video) {
        console.log(LOG, 'No video found at pointer location', top);
        return;
      }

      ev.preventDefault();
      ev.stopPropagation();

      console.info(LOG, 'Cmd+Click intercepted; video found', video);
      showToast('Fingerprinting video...');

      const hash = await computeMultiFramePHash(video, FRAMES_TO_CAPTURE);
      if (!hash) {
        showToast('Fingerprint failed (poster/blocked)');
        return;
      }
      console.info(LOG, 'Computed hash:', hash);

      saveBlockedHash(hash);
      showToast('Video blocked');

      // hide tweet
      const article = findArticleAncestor(video);
      if (article && article.isConnected) {
        article.style.transition = 'opacity 180ms';
        article.style.opacity = '0';
        setTimeout(() => { if (article.isConnected) article.style.display = 'none'; }, 200);
      }
    } catch (e) {
      console.warn(LOG, 'pointerdown handler error', e);
    }
  }, { passive: false });

  // ---------- auto-scan new videos when they appear (only if blocked list non-empty) ----------
  const processedVideos = new WeakSet();
  const mutationObserver = new MutationObserver((muts) => {
    if (!blocked || blocked.length === 0) return; // nothing to compare against
    for (const m of muts) {
      for (const node of m.addedNodes) {
        if (!(node instanceof Element)) continue;
        // find any videos in new subtree
        const vids = node.matches && node.matches('video') ? [node] : (node.querySelectorAll ? Array.from(node.querySelectorAll('video')) : []);
        vids.forEach((v) => {
          if (processedVideos.has(v)) return;
          processedVideos.add(v);
          enqueue(async () => {
            try {
              const hash = await computeMultiFramePHash(v, Math.max(2, FRAMES_TO_CAPTURE - 1)); // shorter sample for auto
              if (!hash) return;
              for (const bad of blocked) {
                const dist = hamming(hash, bad);
                if (dist <= HAMMING_THRESHOLD) {
                  const art = findArticleAncestor(v);
                  if (art && art.isConnected) {
                    art.style.transition = 'opacity 180ms';
                    art.style.opacity = '0';
                    setTimeout(() => { if (art.isConnected) art.style.display = 'none'; }, 200);
                  }
                  console.info(LOG, 'Auto-blocked video (hamming=', dist, ')');
                  return;
                }
              }
            } catch (e) {
              console.warn(LOG, 'Auto-scan error', e);
            }
          });
        });
      }
    }
  });

  try {
    mutationObserver.observe(document.body, { childList: true, subtree: true });
    // initial kick: scan existing videos only if blocked list non-empty
    setTimeout(() => {
      if (blocked && blocked.length > 0) {
        document.querySelectorAll('video').forEach(v => {
          if (!processedVideos.has(v)) {
            processedVideos.add(v);
            enqueue(async () => {
              try {
                const hash = await computeMultiFramePHash(v, Math.max(2, FRAMES_TO_CAPTURE - 1));
                if (!hash) return;
                for (const bad of blocked) {
                  if (hamming(hash, bad) <= HAMMING_THRESHOLD) {
                    const art = findArticleAncestor(v);
                    if (art && art.isConnected) {
                      art.style.transition = 'opacity 180ms';
                      art.style.opacity = '0';
                      setTimeout(() => { if (art.isConnected) art.style.display = 'none'; }, 200);
                    }
                    console.info(LOG, 'Initial auto-blocked video');
                    return;
                  }
                }
              } catch (e) {
                console.warn(LOG, 'Initial auto-scan error', e);
              }
            });
          }
        });
      }
    }, 800);
  } catch (e) {
    console.warn(LOG, 'mutationObserver init failed', e);
  }

  // small debug helper
  window.__videoBlockerDebug = {
    blockedHashes: () => blocked.slice(),
    computeHashNow: async (video) => {
      return await computeMultiFramePHash(video, FRAMES_TO_CAPTURE);
    },
  };
  function onUrlChange() {
    console.log(LOG, 'URL changed:', location.href);
    // Re-scan the page for videos immediately
    document.querySelectorAll('video').forEach(video => {
        enqueue(async ()=>{
            try {
                const blob = await recordSampleFromVideoElement(video, 400);
                const hash = await computePHashFromVideoBlob(blob);
                const isBlocked = blocked.some(h=>hamming(h, hash) <= HAMMING_THRESHOLD);
                if(isBlocked){
                    const article = findArticleAncestor(video);
                    if(article && article.isConnected){
                        article.style.display='none';
                        console.log(LOG,'auto-blocked video after URL change');
                    }
                }
            } catch(e) {
                console.warn(LOG,'scan on URL change failed', e);
            }
        });
    });
}
(function() {
    const pushState = history.pushState;
    history.pushState = function() {
        pushState.apply(this, arguments);
        window.dispatchEvent(new Event('urlchange'));
    };
    const replaceState = history.replaceState;
    history.replaceState = function() {
        replaceState.apply(this, arguments);
        window.dispatchEvent(new Event('urlchange'));
    };
})();
window.addEventListener('popstate', () => {
    window.dispatchEvent(new Event('urlchange'));
});
window.addEventListener('urlchange', onUrlChange);

// Also run once at startup
/**
 * Handle URL change: this is because Twitter is an SPA and navigation does not reload the page
 * We re-scan the page for videos and auto-block any that match
 * the blocked fingerprints
 */
onUrlChange();

})();


