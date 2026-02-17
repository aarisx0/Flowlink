/**
 * FlowLink Browser Extension - Background Service Worker
 * Handles WebSocket connection, clipboard monitoring, and message routing
 */

// Configuration
const BACKEND_URL = 'wss://sparkling-courtesy-production-1cb0.up.railway.app'; // Railway production (secure WebSocket)
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
    console.log('Loaded from storage:', result);
    
    // ALWAYS ensure deviceId exists
    if (result.deviceId) {
      deviceId = result.deviceId;
      console.log('Using existing deviceId:', deviceId);
    } else {
      deviceId = generateDeviceId();
      chrome.storage.local.set({ deviceId });
      console.log('Generated new deviceId:', deviceId);
    }
    
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
  });
});

// Also connect on startup (when browser starts)
chrome.runtime.onStartup.addListener(() => {
  console.log('Browser started, checking for saved username...');
  chrome.storage.local.get(['deviceId', 'username'], (result) => {
    // ALWAYS ensure deviceId exists
    if (result.deviceId) {
      deviceId = result.deviceId;
    } else {
      deviceId = generateDeviceId();
      chrome.storage.local.set({ deviceId });
    }
    
    if (result.username) {
      username = result.username;
      console.log('Reconnecting with username:', username);
      connectWebSocket();
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
    message.timestamp = Date.now();
    message.deviceId = deviceId; // Always set deviceId
    
    // Ensure deviceId is not null
    if (!message.deviceId) {
      console.error('❌ Cannot send message: deviceId is null!');
      console.error('   Regenerating deviceId...');
      deviceId = generateDeviceId();
      chrome.storage.local.set({ deviceId });
      message.deviceId = deviceId;
    }
    
    const msgStr = JSON.stringify(message);
    console.log('📤 Sending to backend:', message.type, message);
    ws.send(msgStr);
  } else {
    console.error('❌ WebSocket not connected. Cannot send:', message.type);
    console.error('   Connection state:', ws ? ws.readyState : 'null');
    console.error('   Username:', username);
    console.error('   Device ID:', deviceId);
  }
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
  // Handle messages synchronously - no async responses needed
  
  switch (request.type) {
    case 'media_state_changed':
      handleMediaStateChanged(request.data, sender.tab);
      return false; // Synchronous
      
    case 'clipboard_changed':
      handleClipboardChanged(request.data);
      return false; // Synchronous
      
    case 'get_connection_status':
      sendResponse({ connected: isConnected, username });
      return false; // Synchronous
      
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
      return false; // Synchronous
      
    case 'disconnect':
      if (ws) {
        ws.close();
      }
      sendResponse({ success: true });
      return false; // Synchronous
  }
  
  return false; // Don't keep channel open
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
          tabId: tab.id
        }
      };
      console.log('📤 Sending media handoff to backend...');
      sendMessage(msg);
    }
  });
}

// Handle clipboard changes from content scripts
function handleClipboardChanged(data) {
  console.log('📋 Clipboard changed:', data.text?.substring(0, 50));
  
  chrome.storage.local.get(['settings'], (result) => {
    if (!result.settings?.universalClipboard) {
      console.log('⚠️ Universal Clipboard is disabled in settings');
      return;
    }
    
    console.log('📤 Sending clipboard to backend...');
    
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
