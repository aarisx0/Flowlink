/**
 * FlowLink - Media Detection Content Script
 * Detects video/audio playback and sends state changes to background script
 */

console.log('FlowLink media detection loaded');

let currentVideo = null;
let lastState = null;
let checkInterval = null;

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
  if (!currentVideo) return;
  
  const data = {
    state,
    title: getVideoTitle(),
    url: window.location.href,
    timestamp: Math.floor(currentVideo.currentTime),
    duration: Math.floor(currentVideo.duration),
    platform: getPlatform()
  };
  
  console.log('Sending media state:', data);
  
  chrome.runtime.sendMessage({
    type: 'media_state_changed',
    data
  });
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
  }, 2000);
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
