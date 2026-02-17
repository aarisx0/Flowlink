/**
 * FlowLink Browser Extension - Background Service Worker
 * Handles WebSocket connection, clipboard monitoring, and message routing
 */

// Configuration
const BACKEND_URL = 'ws://localhost:8080'; // Change to production URL: wss://your-app.railway.app
let ws = null;
let deviceId = null;
let username = null;
let isConnected = false;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;
let connectionTimeout = null;

// Initialize extension
chrome.runtime.onInstalled.addListener(() => {
  console.log('FlowLink extension installed');
  
  // Load saved settings
  chrome.storage.local.get(['deviceId', 'username', 'settings'], (result) => {
    if (result.deviceId && result.username) {
      deviceId = result.deviceId;
      username = result.username;
      connectWebSocket();
    } else {
      // Generate device ID if not exists
      deviceId = generateDeviceId();
      chrome.storage.local.set({ deviceId });
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
    }
  });
});

// Generate unique device ID
function generateDeviceId() {
  return `ext-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
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
    
    // Set connection timeout
    connectionTimeout = setTimeout(() => {
      if (ws && ws.readyState !== WebSocket.OPEN) {
        console.error('Connection timeout - backend not responding');
        ws.close();
      }
    }, 10000); // 10 second timeout

    ws.onopen = () => {
      clearTimeout(connectionTimeout);
      console.log('✅ Connected to FlowLink backend');
      isConnected = true;
      reconnectAttempts = 0;
      
      // Register device
      if (username) {
        sendMessage({
          type: 'device_register',
          payload: {
            deviceId,
            deviceName: 'Browser Extension',
            deviceType: 'browser',
            username
          }
        });
      }
      
      // Update popup
      chrome.runtime.sendMessage({ type: 'connection_status', connected: true }).catch(() => {});
    };

    ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      handleMessage(message);
    };

    ws.onclose = (event) => {
      clearTimeout(connectionTimeout);
      console.log('❌ Disconnected from FlowLink backend. Code:', event.code, 'Reason:', event.reason);
      isConnected = false;
      ws = null;
      
      // Update popup
      chrome.runtime.sendMessage({ type: 'connection_status', connected: false }).catch(() => {});
      
      // Attempt reconnection
      if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
        reconnectAttempts++;
        const delay = 2000 * reconnectAttempts;
        console.log(`Reconnecting in ${delay/1000} seconds... (attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`);
        setTimeout(connectWebSocket, delay);
      } else {
        console.error('❌ Max reconnection attempts reached. Please check backend URL and try reloading extension.');
      }
    };

    ws.onerror = (error) => {
      console.error('❌ WebSocket error:', error);
      console.error('Backend URL:', BACKEND_URL);
      console.error('Make sure:');
      console.error('1. Backend server is running');
      console.error('2. Backend URL is correct in background.js');
      console.error('3. For Railway: Use wss://your-app.railway.app');
      console.error('4. For local: Use ws://localhost:8080');
    };
  } catch (error) {
    console.error('❌ Failed to create WebSocket:', error);
  }
}

// Send message to backend
function sendMessage(message) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    message.timestamp = Date.now();
    message.deviceId = deviceId;
    ws.send(JSON.stringify(message));
  } else {
    console.error('WebSocket not connected');
  }
}

// Handle incoming messages
function handleMessage(message) {
  console.log('Received message:', message.type);
  
  switch (message.type) {
    case 'device_registered':
      console.log('Device registered successfully');
      break;
      
    case 'media_handoff_offer':
      handleMediaHandoffOffer(message.payload);
      break;
      
    case 'clipboard_sync':
      handleClipboardSync(message.payload);
      break;
      
    case 'session_invitation':
      // Forward to popup if open
      chrome.runtime.sendMessage({ type: 'session_invitation', data: message.payload });
      break;
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
        // Open URL with timestamp
        let finalUrl = data.url;
        if (data.timestamp && data.url.includes('youtube.com')) {
          finalUrl += `${data.url.includes('?') ? '&' : '?'}t=${Math.floor(data.timestamp)}`;
        }
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
    
    const { text, image } = payload.clipboard;
    
    if (text) {
      // Write text to clipboard
      navigator.clipboard.writeText(text).then(() => {
        console.log('Clipboard synced:', text.substring(0, 50));
        
        // Show notification
        if (result.settings?.notifications) {
          chrome.notifications.create({
            type: 'basic',
            iconUrl: 'icons/icon128.png',
            title: 'Clipboard Synced',
            message: text.substring(0, 100) + (text.length > 100 ? '...' : ''),
            priority: 0
          });
        }
      }).catch(err => {
        console.error('Failed to write to clipboard:', err);
      });
    }
    
    if (image) {
      // Handle image clipboard (more complex)
      console.log('Image clipboard sync not yet implemented');
    }
  });
}

// Listen for messages from content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  switch (request.type) {
    case 'media_state_changed':
      handleMediaStateChanged(request.data, sender.tab);
      break;
      
    case 'clipboard_changed':
      handleClipboardChanged(request.data);
      break;
      
    case 'get_connection_status':
      sendResponse({ connected: isConnected, username });
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
      
    case 'disconnect':
      if (ws) {
        ws.close();
      }
      sendResponse({ success: true });
      break;
  }
  
  return true; // Keep channel open for async response
});

// Handle media state changes from content scripts
function handleMediaStateChanged(data, tab) {
  chrome.storage.local.get(['settings'], (result) => {
    if (!result.settings?.smartHandoff) return;
    
    const { state, title, url, timestamp, platform } = data;
    
    if (state === 'paused') {
      console.log('Media paused:', title);
      
      // Send to backend
      sendMessage({
        type: 'media_handoff',
        payload: {
          action: 'paused',
          title,
          url,
          timestamp,
          platform,
          tabId: tab.id
        }
      });
    }
  });
}

// Handle clipboard changes from content scripts
function handleClipboardChanged(data) {
  chrome.storage.local.get(['settings'], (result) => {
    if (!result.settings?.universalClipboard) return;
    
    console.log('Clipboard changed:', data.text?.substring(0, 50));
    
    // Send to backend
    sendMessage({
      type: 'clipboard_broadcast',
      payload: {
        clipboard: {
          text: data.text,
          image: data.image
        }
      }
    });
  });
}

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
