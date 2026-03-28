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
  let mediaElements = Array.from(document.querySelectorAll('video, audio'));
  let candidate = mediaElements.find((element) => {
    const media = element;
    return media.currentSrc || media.src || !media.paused || media.readyState > 0;
  });
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

// Monitor video state
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
  
  // Real media element listeners
  video.addEventListener('play', () => {
    console.log('▶️ Video playing');
    lastState = 'playing';
    sendMediaState('playing');
  });
  
  // Listen for pause event
  video.addEventListener('pause', () => {
    console.log('⏸️ Video paused');
    
    // Ignore if video ended
    if (video.ended) return;
    
    // Ignore very short pauses (buffering)
    setTimeout(() => {
      if (video.paused && !video.ended) {
        lastState = 'paused';
        sendMediaState('paused');
      }
    }, 1000);
  });
  
  // Listen for ended event
  video.addEventListener('ended', () => {
    console.log('🏁 Video ended');
    lastState = 'ended';
  });
  
  // Listen for seeking (timestamp change)
  video.addEventListener('seeked', () => {
    console.log('📍 Video seeked to:', video.currentTime);
  });
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

// Send media state to background script
function sendMediaState(state) {
  if (!currentVideo || !checkExtensionContext()) return;
  
  const data = {
    state,
    title: getVideoTitle(),
    url: window.location.href,
    timestamp: Math.floor(currentVideo.currentTime),
    duration: Math.floor(currentVideo.duration),
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

function samplePlaybackState() {
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
      sendMediaState(state);
    }
  }
}

// Initialize
function init() {
  console.log('🎬 Initializing media detection on:', getPlatform());
  
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
  
  // Watch for dynamically added videos (SPA navigation)
  const observer = new MutationObserver(() => {
    if (!currentVideo || !document.contains(currentVideo)) {
      const video = findVideoElement();
      if (video && video !== currentVideo) {
        console.log('🆕 New media element detected');
        monitorVideo(video);
      }
    }
  });
  
  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
  
  // Periodic check for video element with faster polling (1500ms for better responsiveness)
  checkInterval = setInterval(() => {
    if (!currentVideo || !document.contains(currentVideo)) {
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
    samplePlaybackState();
  }, 1500);

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
