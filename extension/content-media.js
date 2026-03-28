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
      return document.querySelector('[data-testid="now-playing-widget"] a')?.textContent ||
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

// Find video element
function findVideoElement() {
  // Try to find video element
  const video = document.querySelector('video');
  if (video) return video;
  
  // Try to find audio element
  const audio = document.querySelector('audio');
  if (audio) return audio;
  
  return null;
}

// Monitor video state
function monitorVideo(video) {
  if (!video) return;
  if (video === currentVideo) return;
  
  currentVideo = video;
  
  // Listen for play event
  video.addEventListener('play', () => {
    console.log('Video playing');
    lastState = 'playing';
    sendMediaState('playing');
  });
  
  // Listen for pause event
  video.addEventListener('pause', () => {
    console.log('Video paused');
    
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
    console.log('Video ended');
    lastState = 'ended';
  });
  
  // Listen for seeking (timestamp change)
  video.addEventListener('seeked', () => {
    console.log('Video seeked to:', video.currentTime);
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
  if (!media) return;

  if (media !== currentVideo) {
    monitorVideo(media);
  }

  const state = media.paused ? 'paused' : 'playing';
  if (state !== lastState) {
    lastState = state;
    if (!(state === 'paused' && media.ended)) {
      sendMediaState(state);
    }
  }
}

// Initialize
function init() {
  console.log('Initializing media detection on:', getPlatform());
  
  // Find video immediately
  const video = findVideoElement();
  if (video) {
    monitorVideo(video);
  }
  
  // Watch for dynamically added videos (SPA navigation)
  const observer = new MutationObserver(() => {
    if (!currentVideo || !document.contains(currentVideo)) {
      const video = findVideoElement();
      if (video && video !== currentVideo) {
        console.log('New video element detected');
        monitorVideo(video);
      }
    }
  });
  
  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
  
  // Periodic check for video element (fallback)
  checkInterval = setInterval(() => {
    if (!currentVideo || !document.contains(currentVideo)) {
      const video = findVideoElement();
      if (video) {
        monitorVideo(video);
      }
    }
    samplePlaybackState();
  }, 2000);

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
