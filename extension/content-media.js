/**
 * FlowLink - Media Detection Content Script
 * Detects video/audio playback and sends state changes to background script
 */

if (window.__flowlinkMediaMonitorLoaded) {
  console.log('🎬 FlowLink media detection already active on:', window.location.hostname);
} else {
  window.__flowlinkMediaMonitorLoaded = true;

console.log('🎬 FlowLink media detection loaded on:', window.location.hostname);

let currentVideo = null;
let lastState = null;
let checkInterval = null;
let isExtensionValid = true;
let lastSentFingerprint = '';
let lastKnownUrl = window.location.href;
const monitoredMedia = new WeakSet();
const observedRoots = new WeakSet();

function isDomMediaNode(value) {
  return value instanceof HTMLMediaElement;
}

function getAllSearchRoots() {
  const roots = [document];
  const queue = [document.documentElement || document.body].filter(Boolean);
  const seen = new Set(queue);

  while (queue.length) {
    const node = queue.shift();
    if (!node) continue;

    if (node.shadowRoot && !roots.includes(node.shadowRoot)) {
      roots.push(node.shadowRoot);
      const shadowChildren = Array.from(node.shadowRoot.children || []);
      for (const child of shadowChildren) {
        if (!seen.has(child)) {
          seen.add(child);
          queue.push(child);
        }
      }
    }

    const children = Array.from(node.children || []);
    for (const child of children) {
      if (!seen.has(child)) {
        seen.add(child);
        queue.push(child);
      }
    }
  }

  return roots;
}

function getAllMediaElements() {
  const results = [];
  for (const root of getAllSearchRoots()) {
    const media = root.querySelectorAll ? Array.from(root.querySelectorAll('video, audio')) : [];
    results.push(...media);
  }
  return results;
}

function scoreMediaElement(media) {
  let score = 0;
  if (!media.paused) score += 100;
  if (!media.ended) score += 20;
  if (media.currentSrc || media.src) score += 15;
  if (media.readyState > 0) score += 10;
  if (media.duration && Number.isFinite(media.duration)) score += 5;
  if (media.videoWidth > 0 || media.videoHeight > 0) score += 8;

  const rect = typeof media.getBoundingClientRect === 'function' ? media.getBoundingClientRect() : null;
  if (rect && rect.width * rect.height > 0) {
    score += Math.min(rect.width * rect.height / 5000, 25);
  }

  return score;
}

function getMediaSnapshot(media) {
  return {
    currentTime: Number.isFinite(media?.currentTime) ? Math.floor(media.currentTime) : 0,
    duration: Number.isFinite(media?.duration) ? Math.floor(media.duration) : 0,
    paused: Boolean(media?.paused),
    ended: Boolean(media?.ended)
  };
}

function bindMediaElement(media) {
  if (!isDomMediaNode(media) || monitoredMedia.has(media)) {
    return;
  }

  monitoredMedia.add(media);

  const syncCurrentMedia = (reason) => {
    currentVideo = media;
    samplePlaybackState(reason);
  };

  media.addEventListener('play', () => syncCurrentMedia('play_event'));
  media.addEventListener('playing', () => syncCurrentMedia('playing_event'));
  media.addEventListener('pause', () => {
    if (media.ended) {
      lastState = 'ended';
      return;
    }

    currentVideo = media;
    window.setTimeout(() => {
      if (media.paused && !media.ended) {
        samplePlaybackState('pause_event');
      }
    }, 350);
  });
  media.addEventListener('ended', () => {
    currentVideo = media;
    lastState = 'ended';
  });
  media.addEventListener('seeked', () => syncCurrentMedia('seeked_event'));
  media.addEventListener('emptied', () => syncCurrentMedia('emptied_event'));
}

function scanAndBindMediaElements() {
  const mediaElements = getAllMediaElements();
  for (const media of mediaElements) {
    bindMediaElement(media);
  }
  return mediaElements;
}

// Check if extension context is valid
function checkExtensionContext() {
  try {
    chrome.runtime.id;
    return true;
  } catch (err) {
    if (!isExtensionValid) return false;
    isExtensionValid = false;
    return false;
  }
}

// Safe message sending
function sendToBackground(message) {
  if (!checkExtensionContext()) return;
  
  try {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        const errorMessage = chrome.runtime.lastError.message || '';
        if (
          errorMessage.includes('context invalidated') ||
          errorMessage.includes('Receiving end does not exist') ||
          errorMessage.includes('Could not establish connection')
        ) {
          isExtensionValid = false;
        }
      }
    });
  } catch (err) {
    if (
      err.message.includes('context invalidated') ||
      err.message.includes('Receiving end does not exist') ||
      err.message.includes('Could not establish connection')
    ) {
      isExtensionValid = false;
    }
  }
}

// Platform detection
function getPlatform() {
  const hostname = window.location.hostname;
  if (hostname.includes('youtube.com')) return 'YouTube';
  if (hostname.includes('hotstar.com')) return 'Hotstar';
  if (hostname.includes('hianime.re')) return 'hianime';
  if (hostname.includes('netflix.com')) return 'Netflix';
  if (hostname.includes('spotify.com')) return 'Spotify';
  if (hostname.includes('whatsapp.com')) return 'WhatsApp';
  if (hostname.includes('instagram.com')) return 'Instagram';
  if (hostname.includes('jiosaavn.com')) return 'JioSaavn';
  if (hostname.includes('gaana.com')) return 'Gaana';
  if (hostname.includes('isaidub')) return 'iSaiDub';
  if (hostname.includes('moviesda')) return 'Moviesda';
  if (hostname.includes('twitch.tv')) return 'Twitch';
  if (hostname.includes('vimeo.com')) return 'Vimeo';
  if (hostname.includes('dailymotion.com')) return 'Dailymotion';
  return 'Unknown';
}

// Get video title based on platform
function getVideoTitle() {
  const platform = getPlatform();
  
  switch (platform) {
    case 'YouTube':
      return document.querySelector('h1.ytd-watch-metadata yt-formatted-string')?.textContent ||
             document.querySelector('h1.title')?.textContent ||
             document.title;
    
    case 'Netflix':
      return document.querySelector('.video-title')?.textContent ||
             document.title;
    
    case 'Spotify':
      // Try multiple Spotify selectors
      return document.querySelector('[data-testid="now-playing-widget"] a')?.textContent ||
             document.querySelector('a[href*="/track/"]')?.textContent ||
             document.querySelector('[data-testid="context-item-link"]')?.textContent ||
             document.title;

    case 'WhatsApp':
      return document.querySelector('[data-testid="conversation-info-header-chat-title"]')?.textContent ||
             document.querySelector('[title]')?.getAttribute('title') ||
             document.title;

    case 'Instagram':
      // Check for video in feed or story
      return document.querySelector('article h1, article header h2, span.x1iyjqo2')?.textContent || 
             document.querySelector('a[href*="/stories/"]')?.textContent ||
             document.title;

    case 'JioSaavn':
    case 'Gaana':
      // Music player title
      return document.querySelector('[class*="song-title"], [class*="track-name"], h1')?.textContent || 
             document.querySelector('span[title]')?.getAttribute('title') ||
             document.title;
    
    case 'Twitch':
      return document.querySelector('h2[data-a-target="stream-title"]')?.textContent ||
             document.title;
    
    case 'Vimeo':
      return document.querySelector('.player-title')?.textContent ||
             document.title;
    
    default:
      return document.title;
  }
}

// Find video/audio element with multiple strategies
function findVideoElement() {
  const platform = getPlatform();
  
  // Strategy 1: Direct media element search
  const mediaElements = scanAndBindMediaElements();
  let candidate = mediaElements
    .map((element) => ({ element, score: scoreMediaElement(element) }))
    .sort((a, b) => b.score - a.score)[0]?.element || null;
  if (candidate) return candidate;
  
  // Strategy 2: Platform-specific searches
  switch (platform) {
    case 'Spotify':
      // Check Spotify player state via mediaSession or look for active player
      if (navigator.mediaSession?.playbackState) {
        // Create a synthetic object for Spotify
        return {
          paused: navigator.mediaSession.playbackState !== 'playing',
          currentTime: 0,
          duration: 0,
          _isSpotifyMediaSession: true
        };
      }
      break;
      
    case 'Instagram':
      // Look for video in feed or stories (nested in containers)
      candidate = document.querySelector('.x1yztbdb video, [role="article"] video, video[style*="display"]');
      if (candidate) return candidate;
      break;
      
    case 'JioSaavn':
    case 'Gaana':
      // Music player video/audio
      candidate = document.querySelector('[class*="player"] video, [class*="player"] audio, .player video, .player audio');
      if (candidate) return candidate;
      // Also check for hidden audio
      candidate = document.querySelector('audio[style*="display:none"], audio[hidden]');
      if (candidate) return candidate;
      break;
      
    case 'WhatsApp':
      // Video call or media playback
      candidate = document.querySelector('[data-testid="video-stream"] video, video[id*="call"], video[id*="stream"]');
      if (candidate) return candidate;
      break;
      
    case 'iSaiDub':
    case 'Moviesda':
      // Movie player
      candidate = document.querySelector('.video-player video, [class*="video-container"] video, video[controls]');
      if (candidate) return candidate;
      break;
  }
  
  return null;
}

function monitorVideo(video) {
  if (!video) return;
  if (video === currentVideo) return;
  
  currentVideo = video;
  
  // Handle synthetic Spotify mediaSession object
  if (video._isSpotifyMediaSession) {
    console.log('📱 Monitoring Spotify via mediaSession');
    setupSpotifyMediaSessionListeners();
    return;
  }
  
  bindMediaElement(video);
}

// Setup Spotify mediaSession listeners for pause/play events
function setupSpotifyMediaSessionListeners() {
  if (!navigator.mediaSession) return;
  
  // These handlers get called when user presses play/pause controls
  navigator.mediaSession.setActionHandler('play', () => {
    console.log('🎵 Spotify play action triggered');
    lastState = 'playing';
    sendMediaState('playing');
  });
  
  navigator.mediaSession.setActionHandler('pause', () => {
    console.log('🎵 Spotify pause action triggered');
    lastState = 'paused';
    sendMediaState('paused');
  });
}

function installGlobalMediaListeners() {
  const captureEvent = (event) => {
    const target = event.target;
    if (!isDomMediaNode(target)) {
      return;
    }

    bindMediaElement(target);
    currentVideo = target;

    if (event.type === 'ended') {
      lastState = 'ended';
      return;
    }

    const delay = event.type === 'pause' ? 250 : 0;
    window.setTimeout(() => samplePlaybackState(`captured_${event.type}`), delay);
  };

  for (const eventName of ['play', 'playing', 'pause', 'ended', 'seeked']) {
    document.addEventListener(eventName, captureEvent, true);
  }
}

function installMediaMethodHooks() {
  const proto = window.HTMLMediaElement?.prototype;
  if (!proto || proto.__flowlinkHooksInstalled) {
    return;
  }

  proto.__flowlinkHooksInstalled = true;

  const originalPlay = proto.play;
  const originalPause = proto.pause;

  proto.play = function patchedPlay(...args) {
    bindMediaElement(this);
    currentVideo = this;
    const result = originalPlay.apply(this, args);
    Promise.resolve(result).finally(() => {
      window.setTimeout(() => samplePlaybackState('play_method'), 0);
    });
    return result;
  };

  proto.pause = function patchedPause(...args) {
    bindMediaElement(this);
    currentVideo = this;
    const result = originalPause.apply(this, args);
    window.setTimeout(() => samplePlaybackState('pause_method'), 50);
    return result;
  };
}

function observeRoot(root) {
  if (!root || observedRoots.has(root)) {
    return;
  }

  observedRoots.add(root);

  const observer = new MutationObserver((mutations) => {
    let shouldScan = false;

    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (!(node instanceof Element)) {
          continue;
        }

        shouldScan = true;
        if (node.shadowRoot) {
          observeRoot(node.shadowRoot);
        }

        for (const child of node.querySelectorAll ? node.querySelectorAll('*') : []) {
          if (child.shadowRoot) {
            observeRoot(child.shadowRoot);
          }
        }
      }
    }

    if (shouldScan) {
      scanAndBindMediaElements();
      samplePlaybackState('mutation_observer');
    }
  });

  observer.observe(root, {
    childList: true,
    subtree: true
  });
}

function installShadowRootHook() {
  const originalAttachShadow = Element.prototype.attachShadow;
  if (!originalAttachShadow || originalAttachShadow.__flowlinkPatched) {
    return;
  }

  const patched = function patchedAttachShadow(...args) {
    const shadowRoot = originalAttachShadow.apply(this, args);
    observeRoot(shadowRoot);
    window.setTimeout(() => {
      scanAndBindMediaElements();
      samplePlaybackState('shadow_attach');
    }, 0);
    return shadowRoot;
  };

  patched.__flowlinkPatched = true;
  Element.prototype.attachShadow = patched;
}

// Send media state to background script
function sendMediaState(state) {
  if (!currentVideo || !checkExtensionContext()) return;

  const snapshot = currentVideo._isSpotifyMediaSession
    ? {
        currentTime: 0,
        duration: 0,
        paused: state !== 'playing',
        ended: false
      }
    : getMediaSnapshot(currentVideo);
  
  const data = {
    state,
    title: getVideoTitle(),
    url: window.location.href,
    timestamp: snapshot.currentTime,
    duration: snapshot.duration,
    platform: getPlatform()
  };

  const fingerprint = JSON.stringify([state, data.url, data.title, data.timestamp]);
  if (fingerprint === lastSentFingerprint) {
    return;
  }
  lastSentFingerprint = fingerprint;
  
  console.log('📤 Sending media state:', state, data.title);

  sendToBackground({
    type: 'media_state_changed',
    data
  });
}

function samplePlaybackState(reason = 'poll') {
  const media = currentVideo || findVideoElement();
  const mediaSessionState = navigator.mediaSession?.playbackState;

  if (!media && !mediaSessionState) return;

  if (media && media !== currentVideo) {
    monitorVideo(media);
  }

  // Determine current state with fallbacks
  let state;
  if (media?._isSpotifyMediaSession || mediaSessionState) {
    // Use mediaSession state as primary for Spotify
    state = mediaSessionState === 'playing' ? 'playing' : 'paused';
  } else if (media) {
    // Use real media element state
    state = media.paused ? 'paused' : 'playing';
  } else {
    return;
  }
  
  // Check if state changed
  if (state !== lastState) {
    lastState = state;
    if (!(state === 'paused' && media?.ended)) {
      console.log('🎬 Playback state changed:', state, 'via', reason);
      sendMediaState(state);
    }
  }
}

// Initialize
function init() {
  console.log('🎬 Initializing media detection on:', getPlatform());
  installGlobalMediaListeners();
  installMediaMethodHooks();
  installShadowRootHook();
  
  // Find video immediately
  const video = findVideoElement();
  if (video) {
    monitorVideo(video);
  }
  
  // Also setup Spotify mediaSession listeners even if no media element found
  const platform = getPlatform();
  if (platform === 'Spotify' && navigator.mediaSession) {
    setupSpotifyMediaSessionListeners();
  }
  
  observeRoot(document);
  for (const root of getAllSearchRoots()) {
    if (root !== document) {
      observeRoot(root);
    }
  }
  
  // Periodic check for video element with faster polling (1200ms for better responsiveness)
  checkInterval = setInterval(() => {
    if (!isDomMediaNode(currentVideo) || !document.contains(currentVideo)) {
      const video = findVideoElement();
      if (video && video !== currentVideo) {
        console.log('🔄 Media element reacquired via polling');
        monitorVideo(video);
      }
    }
    
    // Detect URL/SPA navigation changes
    if (window.location.href !== lastKnownUrl) {
      console.log('🗺️ URL changed, resetting media state');
      lastKnownUrl = window.location.href;
      currentVideo = null;
      lastState = null;
      samplePlaybackState();
    }
    
    // Always sample state - critical for Spotify and other non-DOM media
    scanAndBindMediaElements();
    samplePlaybackState();
  }, 1200);

  window.addEventListener('focus', samplePlaybackState);
  document.addEventListener('visibilitychange', samplePlaybackState);
}

// Wait for page to load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

// Clean up on page unload
window.addEventListener('beforeunload', () => {
  if (checkInterval) {
    clearInterval(checkInterval);
  }
});
}
