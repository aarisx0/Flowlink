/**
 * FlowLink Browser Extension - Popup UI Script
 * Handles user interactions, settings, and connection status
 */

// DOM Elements
let setupScreen, mainScreen, statusDot, statusText;
let usernameInput, setupBtn;
let userName, smartHandoffToggle, clipboardToggle, notificationsToggle;
let activityList, openWebAppBtn, logoutBtn;
let receiverUsernameInput, saveReceiverBtn, receiverStatus;

// State
let isConnected = false;
let currentUsername = null;
let currentReceiverUsername = null;
let lastTargetStatus = null;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  // Get DOM elements
  setupScreen = document.getElementById('setupScreen');
  mainScreen = document.getElementById('mainScreen');
  statusDot = document.getElementById('statusDot');
  statusText = document.getElementById('statusText');
  
  usernameInput = document.getElementById('usernameInput');
  setupBtn = document.getElementById('setupBtn');
  
  userName = document.getElementById('userName');
  smartHandoffToggle = document.getElementById('smartHandoffToggle');
  clipboardToggle = document.getElementById('clipboardToggle');
  notificationsToggle = document.getElementById('notificationsToggle');
  
  activityList = document.getElementById('activityList');
  openWebAppBtn = document.getElementById('openWebAppBtn');
  logoutBtn = document.getElementById('logoutBtn');
  receiverUsernameInput = document.getElementById('receiverUsernameInput');
  saveReceiverBtn = document.getElementById('saveReceiverBtn');
  receiverStatus = document.getElementById('receiverStatus');
  
  // Load saved data
  loadUserData();
  
  // Set up event listeners
  setupBtn.addEventListener('click', handleSetup);
  usernameInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleSetup();
  });
  
  smartHandoffToggle.addEventListener('change', handleSettingChange);
  clipboardToggle.addEventListener('change', handleSettingChange);
  notificationsToggle.addEventListener('change', handleSettingChange);
  saveReceiverBtn.addEventListener('click', handleReceiverSave);
  receiverUsernameInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleReceiverSave();
  });
  
  openWebAppBtn.addEventListener('click', () => {
    chrome.tabs.create({ url: 'https://flowlink-weld.vercel.app' });
  });
  
  logoutBtn.addEventListener('click', handleLogout);
  
  // Listen for connection status updates
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'connection_status') {
      updateConnectionStatus(message.connected);
    } else if (message.type === 'target_connection_result') {
      lastTargetStatus = message.data || null;
      updateReceiverUI();
    }
  });
  
  // Request current connection status
  chrome.runtime.sendMessage({ type: 'get_connection_status' }, (response) => {
    if (chrome.runtime.lastError) {
      console.error('Error getting connection status:', chrome.runtime.lastError.message);
      updateConnectionStatus(false);
      return;
    }
    
    if (response) {
      updateConnectionStatus(response.connected);
      if (response.username) {
        currentUsername = response.username;
        userName.textContent = response.username;
      }
      currentReceiverUsername = response.targetUsername || null;
      lastTargetStatus = response.lastTargetStatus || null;
      updateReceiverUI();
    }
  });
});

// Load user data from storage
function loadUserData() {
  chrome.storage.local.get(['username', 'targetUsername', 'settings'], (result) => {
    if (result.username) {
      // User is logged in
      currentUsername = result.username;
      userName.textContent = result.username;
      showMainScreen();
    } else {
      // Show setup screen
      showSetupScreen();
    }

    currentReceiverUsername = result.targetUsername || null;
    updateReceiverUI();
    
    // Load settings
    if (result.settings) {
      smartHandoffToggle.checked = result.settings.smartHandoff !== false;
      clipboardToggle.checked = result.settings.universalClipboard !== false;
      notificationsToggle.checked = result.settings.notifications !== false;
    }
  });
}

// Handle setup/login
function handleSetup() {
  const username = usernameInput.value.trim();
  
  if (!username) {
    alert('Please enter a username');
    return;
  }
  
  if (username.length < 3) {
    alert('Username must be at least 3 characters');
    return;
  }
  
  // Save username and connect
  chrome.runtime.sendMessage({ 
    type: 'set_username', 
    username 
  }, (response) => {
    if (chrome.runtime.lastError) {
      console.error('Error setting username:', chrome.runtime.lastError.message);
      alert('Failed to connect. Please reload the extension and try again.');
      return;
    }
    
    if (response && response.success) {
      currentUsername = username;
      userName.textContent = username;
      showMainScreen();
    } else {
      alert('Failed to connect. Please try again.');
    }
  });
}

// Handle logout
function handleLogout() {
  if (confirm('Are you sure you want to logout?')) {
    // Disconnect
    chrome.runtime.sendMessage({ type: 'disconnect' }, (response) => {
      if (chrome.runtime.lastError) {
        console.warn('Error disconnecting:', chrome.runtime.lastError.message);
      }
      
      // Clear storage regardless of disconnect result
      chrome.storage.local.remove(['username', 'deviceId', 'targetUsername'], () => {
        currentUsername = null;
        currentReceiverUsername = null;
        usernameInput.value = '';
        showSetupScreen();
      });
    });
  }
}

function handleReceiverSave() {
  const targetUsername = receiverUsernameInput.value.trim();

  chrome.runtime.sendMessage({ type: 'set_target_username', targetUsername }, (response) => {
    if (chrome.runtime.lastError) {
      console.error('Error saving receiver username:', chrome.runtime.lastError.message);
      alert('Failed to save receiver username.');
      return;
    }

    if (!response?.success) {
      alert(response?.error || 'Failed to save receiver username.');
      return;
    }

    currentReceiverUsername = targetUsername || null;
    lastTargetStatus = response.status || (targetUsername ? { pending: true, connected: false, targetUsername } : null);
    updateReceiverUI();
  });
}

function updateReceiverUI() {
  if (!receiverUsernameInput || !receiverStatus) return;

  receiverUsernameInput.value = currentReceiverUsername || '';

  if (!currentReceiverUsername) {
    receiverStatus.textContent = 'No receiver selected';
    return;
  }

  if (lastTargetStatus?.pending) {
    receiverStatus.textContent = `Checking ${currentReceiverUsername}...`;
    return;
  }

  if (lastTargetStatus?.connected) {
    const targetDeviceName = lastTargetStatus.targetDeviceName || 'device';
    receiverStatus.textContent = `${currentReceiverUsername} connected on ${targetDeviceName}`;
    return;
  }

  receiverStatus.textContent = `Sending to ${currentReceiverUsername}`;
}

// Handle setting changes
function handleSettingChange() {
  const settings = {
    smartHandoff: smartHandoffToggle.checked,
    universalClipboard: clipboardToggle.checked,
    notifications: notificationsToggle.checked
  };
  
  chrome.storage.local.set({ settings }, () => {
    console.log('Settings saved:', settings);
  });
}

// Update connection status
function updateConnectionStatus(connected) {
  isConnected = connected;
  
  if (connected) {
    statusDot.className = 'status-dot connected';
    statusText.textContent = 'Connected';
    console.log('✅ Extension connected to backend');
    if (currentUsername) {
      console.log('👤 Username:', currentUsername);
    }
  } else {
    statusDot.className = 'status-dot disconnected';
    statusText.textContent = 'Disconnected';
    console.log('❌ Extension disconnected from backend');
  }
}

// Show setup screen
function showSetupScreen() {
  setupScreen.style.display = 'block';
  mainScreen.style.display = 'none';
  usernameInput.focus();
}

// Show main screen
function showMainScreen() {
  setupScreen.style.display = 'none';
  mainScreen.style.display = 'block';
}

// Add activity item (for future use)
function addActivity(type, message) {
  const empty = activityList.querySelector('.activity-empty');
  if (empty) {
    empty.remove();
  }
  
  const item = document.createElement('div');
  item.className = 'activity-item';
  
  const icon = document.createElement('div');
  icon.className = 'activity-icon';
  icon.textContent = type === 'media' ? '🎬' : '📋';
  
  const text = document.createElement('div');
  text.className = 'activity-text';
  text.textContent = message;
  
  const time = document.createElement('div');
  time.className = 'activity-time';
  time.textContent = 'Just now';
  
  item.appendChild(icon);
  item.appendChild(text);
  item.appendChild(time);
  
  activityList.insertBefore(item, activityList.firstChild);
  
  // Keep only last 5 items
  while (activityList.children.length > 5) {
    activityList.removeChild(activityList.lastChild);
  }
}
