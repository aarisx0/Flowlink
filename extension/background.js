/**
 * FlowLink Browser Extension - Background Service Worker
 * Handles WebSocket connection, clipboard monitoring, and message routing
 */

// Configuration
const BACKEND_URL = 'ws://localhost:8080';
let ws = null;
let deviceId = null;
let username = null;
let isConnected = false;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;
let connectionTimeout = null;
let isInitializing = false;
let lastClipboardFingerprint = null;
let lastClipboardSyncedAt = 0;
let lastMediaHandoffFingerprint = null;
let lastMediaHandoffAt = 0;
let lastClipboardSkipReason = null;
let lastClipboardSkipAt = 0;
let targetUsername = null;
let lastTargetStatus = null;

// Initialize extension
chrome.runtime.onInstalled.addListener(() => {
  console.log('FlowLink extension installed');
  injectClipboardScriptIntoTabs();
  initializeExtension();
});

// Also connect on startup (when browser starts)
chrome.runtime.onStartup.addListener(() => {
  console.log('Browser started, initializing extension...');
  injectClipboardScriptIntoTabs();
  initializeExtension();
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'complete') {
    return;
  }

  if (!tab?.url || !isInjectableUrl(tab.url)) {
    return;
  }

  injectClipboardScript(tabId);
});

// Initialize extension function
function initializeExtension() {
  if (isInitializing) {
    return;
  }

  isInitializing = true;

  // FIRST: Ensure deviceId exists
  chrome.storage.local.get(['deviceId'], (result) => {
    if (result.deviceId) {
      deviceId = result.deviceId;
      console.log('Using existing deviceId:', deviceId);
    } else {
      deviceId = generateDeviceId();
      chrome.storage.local.set({ deviceId });
      console.log('Generated new deviceId:', deviceId);
    }
    
    // THEN: Check for username and connect
    chrome.storage.local.get(['username', 'targetUsername', 'settings'], (result) => {
      console.log('Loaded from storage:', result);
      targetUsername = result.targetUsername || null;
      
      if (result.username) {
        username = result.username;
        console.log('Found existing user:', username);
        connectWebSocket();
      } else {
        console.log('⚠️ No username found. Please set username in popup.');
      }
      
      // Set default settings
      if (!result.settings) {
        chrome.storage.local.set({
          settings: {
            smartHandoff: true,
            universalClipboard: true,
            notifications: true
          }
        });
        console.log('Set default settings');
      }

      isInitializing = false;
    });
  });
}

// Generate unique device ID
function generateDeviceId() {
  return `ext-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}

function isInjectableUrl(url) {
  return /^https?:\/\//.test(url);
}

function injectClipboardScript(tabId) {
  if (!chrome.scripting?.executeScript) {
    return;
  }

  chrome.scripting.executeScript({
    target: { tabId },
    files: ['content-clipboard.js']
  }).catch(() => {
    // Ignore restricted tabs or transient navigation failures.
  });
}

function injectClipboardScriptIntoTabs() {
  if (!chrome.tabs?.query) {
    return;
  }

  chrome.tabs.query({}, (tabs) => {
    for (const tab of tabs) {
      if (tab.id && tab.url && isInjectableUrl(tab.url)) {
        injectClipboardScript(tab.id);
      }
    }
  });
}

// WebSocket Connection
function connectWebSocket() {
  if (ws && ws.readyState === WebSocket.OPEN) {
    return;
  }

  console.log('Connecting to FlowLink backend:', BACKEND_URL);
  
  // Clear any existing timeout
  if (connectionTimeout) {
    clearTimeout(connectionTimeout);
  }
  
  try {
    ws = new WebSocket(BACKEND_URL);
    
    // Set connection timeout (30 seconds for Railway cold start)
    connectionTimeout = setTimeout(() => {
      if (ws && ws.readyState !== WebSocket.OPEN) {
        console.error('⏱️ Connection timeout - backend not responding');
        ws.close();
      }
    }, 30000); // 30 second timeout for Railway

    ws.onopen = () => {
      clearTimeout(connectionTimeout);
      console.log('✅ Connected to FlowLink backend');
      console.log('📝 Username:', username);
      console.log('🆔 Device ID:', deviceId);
      isConnected = true;
      reconnectAttempts = 0;
      
      // Register device
      if (username) {
        const registerMsg = {
          type: 'device_register',
          payload: {
            deviceId,
            deviceName: 'Browser Extension',
            deviceType: 'browser',
            username
          }
        };
        console.log('📤 Sending registration:', registerMsg);
        sendMessage(registerMsg);

        if (targetUsername) {
          setTimeout(() => {
            sendMessage({
              type: 'target_connection_ping',
              payload: {
                targetUsername,
                sourceUsername: username,
                sourceDeviceName: 'Browser Extension'
              }
            });
          }, 500);
        }
      } else {
        console.warn('⚠️ No username set! Please open extension popup and set username.');
      }
      
      // Update popup
      try {
        chrome.runtime.sendMessage({ type: 'connection_status', connected: true });
      } catch (e) {
        // Popup might not be open
      }
    };

    ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      handleMessage(message);
    };

    ws.onclose = (event) => {
      clearTimeout(connectionTimeout);
      console.log('❌ Disconnected from FlowLink backend');
      console.log('   Close code:', event.code);
      console.log('   Close reason:', event.reason || 'No reason provided');
      isConnected = false;
      ws = null;
      
      // Update popup
      try {
        chrome.runtime.sendMessage({ type: 'connection_status', connected: false });
      } catch (e) {
        // Popup might not be open
      }
      
      // Attempt reconnection with exponential backoff
      if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
        reconnectAttempts++;
        const delay = Math.min(2000 * Math.pow(2, reconnectAttempts - 1), 30000); // Max 30s
        console.log(`🔄 Reconnecting in ${delay/1000}s... (attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`);
        setTimeout(connectWebSocket, delay);
      } else {
        console.error('❌ Max reconnection attempts reached.');
        console.error('   Please reload the extension or check backend status.');
      }
    };

    ws.onerror = (error) => {
      console.error('❌ WebSocket error:', error);
      console.error('   Backend URL:', BACKEND_URL);
      console.error('   Make sure Railway backend is running!');
    };
  } catch (error) {
    console.error('❌ Failed to create WebSocket:', error);
  }
}

// Send message to backend
function sendMessage(message) {
  if (ws && ws.readyState === WebSocket.OPEN) {

    const finalMessage = {
      type: message.type,
      deviceId: deviceId,
      sessionId: null,
      payload: message.payload || {},   // 🔥 ALWAYS ensure payload exists
      timestamp: Date.now()
    };

    console.log('📤 Sending to backend:', finalMessage);
    ws.send(JSON.stringify(finalMessage));
    return true;

  } else {
    return false;
  }
}

function logClipboardSkip(reason) {
  const now = Date.now();
  if (reason === lastClipboardSkipReason && now - lastClipboardSkipAt < 5000) {
    return;
  }

  lastClipboardSkipReason = reason;
  lastClipboardSkipAt = now;
  console.warn(reason);
}

function normalizeClipboardPayload(clipboard = {}) {
  const normalized = {
    text: typeof clipboard.text === 'string' ? clipboard.text : '',
    html: typeof clipboard.html === 'string' ? clipboard.html : '',
    url: typeof clipboard.url === 'string' ? clipboard.url : '',
    image: typeof clipboard.image === 'string' ? clipboard.image : '',
    mimeType: typeof clipboard.mimeType === 'string' ? clipboard.mimeType : '',
    sourceUrl: typeof clipboard.sourceUrl === 'string' ? clipboard.sourceUrl : '',
    pageTitle: typeof clipboard.pageTitle === 'string' ? clipboard.pageTitle : ''
  };

  if (!normalized.url && normalized.text) {
    try {
      const parsed = new URL(normalized.text);
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        normalized.url = normalized.text;
      }
    } catch (_err) {
      // Not a URL, ignore.
    }
  }

  return normalized;
}

function getClipboardFingerprint(clipboard) {
  return JSON.stringify([
    clipboard.text || '',
    clipboard.url || '',
    clipboard.html || '',
    clipboard.image ? clipboard.image.slice(0, 96) : '',
    clipboard.mimeType || ''
  ]);
}

function shouldSkipClipboard(clipboard) {
  const fingerprint = getClipboardFingerprint(clipboard);
  const now = Date.now();

  if (fingerprint === lastClipboardFingerprint && now - lastClipboardSyncedAt < 2000) {
    return true;
  }

  lastClipboardFingerprint = fingerprint;
  lastClipboardSyncedAt = now;
  return false;
}

function buildTimestampedMediaUrl(url, timestamp) {
  if (!url || !timestamp || timestamp <= 0) {
    return url;
  }

  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes('youtube.com') || parsed.hostname === 'youtu.be') {
      parsed.searchParams.set('t', Math.floor(timestamp).toString());
      return parsed.toString();
    }
  } catch (_err) {
    if (url.includes('youtube.com')) {
      return `${url}${url.includes('?') ? '&' : '?'}t=${Math.floor(timestamp)}`;
    }
  }

  return url;
}

// Handle incoming messages
function handleMessage(message) {
  console.log('📥 Received from backend:', message.type, message);
  
  switch (message.type) {
    case 'device_registered':
      console.log('✅ Device registered successfully!');
      console.log('   Username:', username);
      console.log('   Device ID:', deviceId);
      console.log('   Ready to send/receive notifications!');
      
      // Wait 2 seconds to ensure other devices are also registered
      setTimeout(() => {
        console.log('📤 Sending device connected notification to other devices...');
        sendMessage({
          type: 'device_connected_notification',
          payload: {
            deviceName: 'Browser Extension',
            deviceType: 'browser',
            username: username
          }
        });
      }, 2000);
      break;
      
    case 'media_handoff_offer':
      console.log('🎬 Media handoff offer received:', message.payload);
      handleMediaHandoffOffer(message.payload);
      break;
      
    case 'clipboard_sync':
      console.log('📋 Clipboard sync received:', message.payload);
      handleClipboardSync(message.payload);
      break;

    case 'target_connection_request':
      handleTargetConnectionRequest(message.payload);
      break;

    case 'target_connection_result':
      handleTargetConnectionResult(message.payload);
      break;
      
    case 'session_invitation':
      console.log('📨 Session invitation received:', message.payload);
      // Forward to popup if open (safely)
      try {
        chrome.runtime.sendMessage({ type: 'session_invitation', data: message.payload });
      } catch (e) {
        // Popup not open, ignore
      }
      break;
      
    case 'pong':
      // Keepalive response - no action needed
      break;
      
    case 'error':
      console.error('❌ Backend error:', message.payload);
      if (message.payload && message.payload.message) {
        console.error('   Error message:', message.payload.message);
      }
      break;
      
    default:
      console.log('❓ Unknown message type:', message.type);
  }
}

// Handle media handoff offer from another device
function handleMediaHandoffOffer(payload) {
  chrome.storage.local.get(['settings'], (result) => {
    if (!result.settings?.smartHandoff) return;
    
    const { title, url, timestamp, platform } = payload;
    
    // Show notification
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon128.png',
      title: 'Continue Watching?',
      message: `${title}\nFrom: ${platform}`,
      buttons: [
        { title: 'Continue' },
        { title: 'Dismiss' }
      ],
      requireInteraction: true
    }, (notificationId) => {
      // Store data for button click
      chrome.storage.local.set({
        [`handoff_${notificationId}`]: { url, timestamp }
      });
    });
  });
}

// Handle notification button clicks
chrome.notifications.onButtonClicked.addListener((notificationId, buttonIndex) => {
  if (buttonIndex === 0) { // Continue button
    chrome.storage.local.get([`handoff_${notificationId}`], (result) => {
      const data = result[`handoff_${notificationId}`];
      if (data) {
        const finalUrl = buildTimestampedMediaUrl(data.url, data.timestamp);
        chrome.tabs.create({ url: finalUrl });
        
        // Clean up
        chrome.storage.local.remove([`handoff_${notificationId}`]);
      }
    });
  }
  chrome.notifications.clear(notificationId);
});

// Handle clipboard sync from another device
function handleClipboardSync(payload) {
  chrome.storage.local.get(['settings'], (result) => {
    if (!result.settings?.universalClipboard) return;

    const clipboard = normalizeClipboardPayload(payload.clipboard);
    if (shouldSkipClipboard(clipboard)) {
      return;
    }

    const textToWrite = clipboard.text || clipboard.url;

    if (textToWrite) {
      // Write text to clipboard
      navigator.clipboard.writeText(textToWrite).then(() => {
        console.log('Clipboard synced:', textToWrite.substring(0, 50));
        
        // Show notification
        if (result.settings?.notifications) {
          chrome.notifications.create({
            type: 'basic',
            iconUrl: 'icons/icon128.png',
            title: 'Clipboard Synced',
            message: textToWrite.substring(0, 100) + (textToWrite.length > 100 ? '...' : ''),
            priority: 0
          });
        }
      }).catch(err => {
        console.error('Failed to write to clipboard:', err);
      });
    }
    
    if (clipboard.image && result.settings?.notifications) {
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon128.png',
        title: 'Image Clipboard Synced',
        message: clipboard.pageTitle || clipboard.sourceUrl || 'Image copied from another device',
        priority: 0
      });
    }
  });
}

function handleTargetConnectionRequest(payload) {
  const sourceUsername = payload?.sourceUsername || 'Someone';
  const sourceDeviceName = payload?.sourceDeviceName || 'Browser Extension';

  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'icons/icon128.png',
    title: 'FlowLink Receiver Connected',
    message: `${sourceUsername} connected to ${sourceDeviceName}`,
    priority: 1
  });

  sendMessage({
    type: 'target_connection_ack',
    payload: {
      sourceDeviceId: payload?.sourceDeviceId,
      sourceUsername,
      targetUsername: username,
      targetDeviceName: 'Browser Extension'
    }
  });
}

function handleTargetConnectionResult(payload) {
  lastTargetStatus = payload || null;

  try {
    chrome.runtime.sendMessage({
      type: 'target_connection_result',
      data: payload
    });
  } catch (_err) {
    // Popup may be closed.
  }

  if (payload?.connected) {
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon128.png',
      title: 'Receiver Available',
      message: `${payload.targetUsername} is connected on ${payload.targetDeviceName || 'a device'}`,
      priority: 0
    });
  }
}

// Listen for messages from content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('📨 Received message from content script:', request.type);
  
  try {
    switch (request.type) {
      case 'media_state_changed':
        handleMediaStateChanged(request.data, sender.tab);
        sendResponse({ success: true });
        break;
        
      case 'clipboard_changed':
        handleClipboardChanged(request.data);
        sendResponse({ success: true });
        break;
        
      case 'get_connection_status':
        sendResponse({ connected: isConnected, username, targetUsername, lastTargetStatus });
        break;
        
      case 'set_username':
        username = request.username;
        chrome.storage.local.set({ username });
        if (isConnected) {
          // Re-register with new username
          sendMessage({
            type: 'device_register',
            payload: {
              deviceId,
              deviceName: 'Browser Extension',
              deviceType: 'browser',
              username
            }
          });
        } else {
          connectWebSocket();
        }
        sendResponse({ success: true });
        break;

      case 'set_target_username':
        targetUsername = request.targetUsername?.trim() || null;
        chrome.storage.local.set({ targetUsername });
        lastTargetStatus = targetUsername
          ? { connected: false, pending: true, targetUsername }
          : null;

        if (!targetUsername) {
          sendResponse({ success: true, targetUsername, status: lastTargetStatus });
          break;
        }

        if (!isConnected) {
          connectWebSocket();
        }

        const sent = sendMessage({
          type: 'target_connection_ping',
          payload: {
            targetUsername,
            sourceUsername: username,
            sourceDeviceName: 'Browser Extension'
          }
        });

        sendResponse({
          success: true,
          targetUsername,
          status: sent ? lastTargetStatus : { connected: false, pending: true, targetUsername }
        });
        break;
        
      case 'disconnect':
        if (ws) {
          ws.close();
        }
        sendResponse({ success: true });
        break;
        
      default:
        console.warn('Unknown message type:', request.type);
        sendResponse({ success: false, error: 'Unknown message type' });
    }
  } catch (error) {
    console.error('Error handling message:', error);
    sendResponse({ success: false, error: error.message });
  }
  
  return true; // Keep channel open for async response
});

// Handle media state changes from content scripts
function handleMediaStateChanged(data, tab) {
  console.log('🎬 Media state changed:', data);
  
  chrome.storage.local.get(['settings'], (result) => {
    if (!result.settings?.smartHandoff) {
      console.log('⚠️ Smart Handoff is disabled in settings');
      return;
    }
    
    const { state, title, url, timestamp, platform } = data;
    
    if (state === 'paused') {
      const mediaFingerprint = JSON.stringify([url || '', Math.floor(timestamp || 0), state]);
      if (mediaFingerprint === lastMediaHandoffFingerprint && Date.now() - lastMediaHandoffAt < 8000) {
        return;
      }

      lastMediaHandoffFingerprint = mediaFingerprint;
      lastMediaHandoffAt = Date.now();

      console.log('⏸️ Media paused:', title);
      console.log('   Platform:', platform);
      console.log('   Timestamp:', timestamp);
      console.log('   URL:', url);
      
      // Send to backend
      const msg = {
        type: 'media_handoff',
        payload: {
          action: 'paused',
          title,
          url,
          timestamp,
          platform,
          tabId: tab.id,
          targetUsername
        }
      };
      console.log('📤 Sending media handoff to backend...');
      sendMessage(msg);
    }
  });
}

// Handle clipboard changes from content scripts
function handleClipboardChanged(data) {
  const clipboard = normalizeClipboardPayload(data);
  if (shouldSkipClipboard(clipboard)) {
    return;
  }

  if (!username) {
    logClipboardSkip('⚠️ Clipboard skipped: set extension username first.');
    return;
  }

  if (!isConnected) {
    logClipboardSkip('⚠️ Clipboard skipped: backend WebSocket is not connected.');
    connectWebSocket();
    return;
  }

  console.log('📋 Clipboard changed:', {
    hasText: Boolean(clipboard.text),
    hasHtml: Boolean(clipboard.html),
    hasImage: Boolean(clipboard.image),
    url: clipboard.url || null
  });
  
  chrome.storage.local.get(['settings'], (result) => {
    if (!result.settings?.universalClipboard) {
      console.log('⚠️ Universal Clipboard is disabled in settings');
      return;
    }
    
    console.log('📤 Sending clipboard to backend...');

    const sent = sendMessage({
      type: 'clipboard_broadcast',
      payload: {
        clipboard,
        targetUsername
      }
    });

    if (!sent) {
      logClipboardSkip('⚠️ Clipboard skipped: backend WebSocket is not connected.');
    }
  });
}

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'local') {
    return;
  }

  if (changes.username?.newValue && changes.username.newValue !== username) {
    username = changes.username.newValue;
    reconnectAttempts = 0;
    connectWebSocket();
  }

  if (Object.prototype.hasOwnProperty.call(changes, 'targetUsername')) {
    targetUsername = changes.targetUsername?.newValue || null;
  }
});

// Keep service worker alive
if (chrome.alarms) {
  chrome.alarms.create('keepAlive', { periodInMinutes: 1 });
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'keepAlive') {
      // Ping to keep alive
      if (ws && ws.readyState === WebSocket.OPEN) {
        sendMessage({ type: 'ping' });
      }
    }
  });
} else {
  console.warn('chrome.alarms API not available');
}

console.log('FlowLink background service worker loaded');
initializeExtension();
