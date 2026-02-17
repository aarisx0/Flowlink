# FlowLink Browser Extension - Installation & Testing Guide

## 📦 What You'll Need

- Google Chrome or Microsoft Edge (Chromium-based browsers)
- FlowLink backend running (locally or on Railway)
- FlowLink mobile app or web app for testing

## 🎨 Step 1: Generate Extension Icons

1. Open `extension/generate-icons.html` in your browser
2. You'll see three canvas elements showing the FlowLink icon in different sizes
3. Click each download button to save the icons:
   - Download 16x16 → Save as `icon16.png`
   - Download 48x48 → Save as `icon48.png`
   - Download 128x128 → Save as `icon128.png`
4. Move all three PNG files to the `extension/icons/` folder

## ⚙️ Step 2: Configure Backend URL

1. Open `extension/background.js`
2. Find line 8: `const BACKEND_URL = 'ws://localhost:8080';`
3. Update to your backend URL:
   - **Local development**: `ws://localhost:8080`
   - **Railway production**: `wss://your-app.railway.app` (replace with your Railway URL)
   - **Note**: Use `wss://` for HTTPS sites, `ws://` for HTTP

## 🔧 Step 3: Load Extension in Chrome

1. Open Chrome and go to `chrome://extensions/`
2. Enable **Developer mode** (toggle in top-right corner)
3. Click **Load unpacked**
4. Navigate to your FlowLink project folder
5. Select the `extension` folder
6. Click **Select Folder**

The extension should now appear in your extensions list!

## 🚀 Step 4: Set Up Your Username

1. Click the FlowLink extension icon in your browser toolbar
2. You'll see the setup screen
3. Enter your username (same username you use on mobile/web)
4. Click **Get Started**
5. The extension will connect to the backend
6. Status should change to "Connected" (green dot)

## ✅ Step 5: Test Smart Handoff

### Test on YouTube:

1. Open [YouTube](https://www.youtube.com) and play any video
2. Pause the video
3. Check your mobile device or web app - you should see a notification:
   - **Mobile**: System notification "Continue watching [video title]?"
   - **Web**: In-app notification with video title
4. Click "Continue" on the other device
5. The video should open at the same timestamp

### Test on Netflix:

1. Open [Netflix](https://www.netflix.com) and play any show/movie
2. Pause the video
3. Check other devices for handoff notification
4. Click "Continue" to resume on another device

### Test on Spotify:

1. Open [Spotify Web Player](https://open.spotify.com)
2. Play a song and pause it
3. Check other devices for handoff notification

## 📋 Step 6: Test Universal Clipboard

### Test Text Sync:

1. On your computer, select and copy any text (Ctrl+C or Cmd+C)
2. Check your mobile device - the text should be automatically copied
3. Paste on mobile (long press → Paste) - you should see the same text
4. Try the reverse: copy text on mobile, paste on computer

### Test from Web Pages:

1. Visit any website
2. Select and copy text from the page
3. The extension will detect the copy event
4. Text should sync to all your devices with the same username

### Verify Sync:

1. Open extension popup
2. Check "Recent Activity" section
3. You should see clipboard sync events listed

## 🔔 Step 7: Test Notifications

1. Make sure "Notifications" toggle is ON in extension popup
2. When media is paused or clipboard is synced, you should see:
   - Chrome notification (top-right corner)
   - Notification with action buttons for media handoff
   - Brief notification for clipboard sync

## ⚙️ Step 8: Configure Settings

Open the extension popup and toggle features:

- **Smart Handoff**: Enable/disable media detection and handoff
- **Universal Clipboard**: Enable/disable clipboard sync
- **Notifications**: Enable/disable notification popups

Settings are saved automatically and persist across browser sessions.

## 🐛 Troubleshooting

### Extension Not Connecting

**Problem**: Status shows "Disconnected" (red dot)

**Solutions**:
1. Check backend URL in `background.js` is correct
2. Verify backend server is running
3. Check browser console for errors:
   - Right-click extension icon → Inspect popup
   - Go to Console tab
4. Try disconnecting and reconnecting:
   - Click "Logout" in popup
   - Enter username again

### Media Handoff Not Working

**Problem**: Pausing video doesn't trigger notifications

**Solutions**:
1. Check that Smart Handoff is enabled in extension popup
2. Verify you're on a supported platform (YouTube, Netflix, Spotify, etc.)
3. Check content script is loaded:
   - Right-click on page → Inspect
   - Go to Console tab
   - Look for "FlowLink media detection loaded"
4. Make sure other device has same username
5. Check backend logs for `media_handoff` messages

### Clipboard Not Syncing

**Problem**: Copied text doesn't appear on other devices

**Solutions**:
1. Check that Universal Clipboard is enabled in extension popup
2. Grant clipboard permissions:
   - Go to `chrome://extensions/`
   - Find FlowLink extension
   - Check that "Clipboard" permission is granted
3. Try copying text again (Ctrl+C or Cmd+C)
4. Check extension console for errors:
   - Go to `chrome://extensions/`
   - Click "Inspect views: background page"
   - Look for clipboard-related errors

### Notifications Not Showing

**Problem**: No notifications appear

**Solutions**:
1. Check that Notifications toggle is ON in extension popup
2. Grant notification permissions:
   - Click extension icon
   - Browser should prompt for notification permission
   - Click "Allow"
3. Check Chrome notification settings:
   - Go to `chrome://settings/content/notifications`
   - Make sure notifications are allowed
4. Check system notification settings (Windows/Mac)

### Icons Not Showing

**Problem**: Extension shows default icon

**Solutions**:
1. Make sure you generated and saved all three icon files
2. Verify icons are in `extension/icons/` folder:
   - `icon16.png`
   - `icon48.png`
   - `icon128.png`
3. Reload extension:
   - Go to `chrome://extensions/`
   - Click reload icon on FlowLink extension

## 🔍 Debugging Tips

### View Extension Logs

1. **Background Script Logs**:
   - Go to `chrome://extensions/`
   - Find FlowLink extension
   - Click "Inspect views: background page"
   - Check Console tab

2. **Content Script Logs**:
   - Open any webpage (e.g., YouTube)
   - Right-click → Inspect
   - Go to Console tab
   - Look for FlowLink messages

3. **Popup Logs**:
   - Click extension icon to open popup
   - Right-click inside popup → Inspect
   - Check Console tab

### Check Backend Connection

1. Open background script console (see above)
2. Look for connection messages:
   - "Connecting to FlowLink backend..."
   - "Connected to FlowLink backend"
   - "Device registered successfully"

### Test WebSocket Connection

1. Open background script console
2. Run this command:
   ```javascript
   chrome.runtime.sendMessage({ type: 'get_connection_status' }, console.log)
   ```
3. Should return: `{ connected: true, username: "your-username" }`

## 📱 Testing with Mobile App

1. Install FlowLink mobile app on Android
2. Open app and set same username as extension
3. Create or join a session
4. Test handoff:
   - Pause video in browser
   - Check mobile for notification
   - Click "Continue" on mobile
5. Test clipboard:
   - Copy text in browser
   - Paste on mobile
   - Should see same text

## 🌐 Testing with Web App

1. Open FlowLink web app in another browser tab
2. Set same username
3. Create or join a session
4. Test handoff between browser tabs
5. Test clipboard sync between tabs

## 🎯 Expected Behavior

### Smart Handoff:
- ✅ Pausing video triggers notification on other devices
- ✅ Notification shows video title and platform
- ✅ Clicking "Continue" opens video at same timestamp
- ✅ Works across browser, mobile, and web app

### Universal Clipboard:
- ✅ Copying text syncs to all devices instantly
- ✅ Notification shows first 100 characters
- ✅ Text is automatically written to clipboard on other devices
- ✅ Works even when not in a session (username-based)

### Connection:
- ✅ Extension auto-connects on browser start
- ✅ Auto-reconnects if connection drops
- ✅ Shows connection status in popup
- ✅ Persists username across browser sessions

## 📊 Performance Notes

- Extension uses minimal resources (< 10MB RAM)
- WebSocket connection is persistent but lightweight
- Content scripts only load on supported media sites
- Clipboard monitoring uses efficient event listeners
- No polling or continuous background tasks

## 🔒 Privacy & Security

- Extension only accesses clipboard when you copy
- Media detection only works on supported sites
- No data is stored on backend (in-memory only)
- WebSocket connection is encrypted (wss://)
- Username is stored locally in browser
- No tracking or analytics

## 🚀 Next Steps

Once testing is complete:

1. Update `BACKEND_URL` to production URL
2. Create promotional images for Chrome Web Store
3. Write detailed description for store listing
4. Package extension for submission
5. Submit to Chrome Web Store
6. Create Firefox version (minimal changes needed)

## 📝 Feedback

If you encounter any issues not covered here:

1. Check browser console for errors
2. Check backend logs for message handling
3. Verify all devices have same username
4. Try reloading extension
5. Try restarting browser

Happy testing! 🎉
