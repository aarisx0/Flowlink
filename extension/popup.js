/**
 * FlowLink Browser Extension - Popup UI Script
 * Handles user interactions, settings, and connection status
 */

// DOM Elements
let setupScreen, mainScreen, statusDot, statusText;
let usernameInput, setupBtn;
let userName, smartHandoffToggle, clipboardToggle, notificationsToggle;
let activityList, openWebAppBtn, logoutBtn;

// State
let isConnected = false;
let currentUsername = null;

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
  
  openWebAppBtn.addEventListener('click', () => {
    chrome.tabs.create({ url: 'https://flowlink.vercel.app' });
  });
  
  logoutBtn.addEventListener('click', handleLogout);
  
  // Listen for connection status updates
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'connection_status') {
      updateConnectionStatus(message.connected);
    }
  });
  
  // Request current connection status
  chrome.runtime.sendMessage({ type: 'get_connection_status' }, (response) => {
    if (response) {
      updateConnectionStatus(response.connected);
      if (response.username) {
        currentUsername = response.username;
        userName.textContent = response.username;
      }
    }
  });
});

// Load user data from storage
function loadUserData() {
  chrome.storage.local.get(['username', 'settings'], (result) => {
    if (result.username) {
      // User is logged in
      currentUsername = result.username;
      userName.textContent = result.username;
      showMainScreen();
    } else {
      // Show setup screen
      showSetupScreen();
    }
    
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
    chrome.runtime.sendMessage({ type: 'disconnect' });
    
    // Clear storage
    chrome.storage.local.remove(['username', 'deviceId'], () => {
      currentUsername = null;
      usernameInput.value = '';
      showSetupScreen();
    });
  }
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
  } else {
    statusDot.className = 'status-dot disconnected';
    statusText.textContent = 'Disconnected';
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
