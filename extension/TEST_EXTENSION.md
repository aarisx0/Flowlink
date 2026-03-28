# Extension Testing Guide

## Issues Fixed

1. **Duplicate variable declarations** - Removed duplicate `currentVideo`, `lastState`, `checkInterval` declarations in content-media.js
2. **Message passing errors** - Added proper error handling and response callbacks for chrome.runtime.sendMessage
3. **Extension context invalidation** - Added checks and graceful error handling when extension is reloaded
4. **Connection status handling** - Improved error handling in popup.js for all message passing

## How to Test

### 1. Reload the Extension

1. Open Chrome and go to `chrome://extensions/`
2. Find "FlowLink - Cross-Device Continuity"
3. Click the **Reload** button (circular arrow icon)
4. Check for any errors in the extension card

### 2. Check Background Script Console

1. On the extension card, click **"Service worker"** or **"background page"**
2. This opens the background script console
3. You should see:
   ```
   FlowLink background service worker loaded
   Using existing deviceId: ext-...
   Found existing user: [your username]
   Connecting to FlowLink backend: wss://...
   ✅ Connected to FlowLink backend
   📤 Sending registration: ...
   ✅ Device registered successfully!
   ```

### 3. Test the Popup

1. Click the FlowLink extension icon in your browser toolbar
2. You should see:
   - Green status dot with "Connected"
   - Your username displayed
   - All features toggles working
3. If not connected, try:
   - Logout and login again
   - Check your username is correct
   - Verify backend is running

### 4. Test Universal Clipboard

1. Open any webpage
2. Select and copy some text (Ctrl+C or Cmd+C)
3. Check background console - should see:
   ```
   📋 Clipboard copied: [your text]
   📤 Sending clipboard to backend...
   ```
4. Open mobile app or web app - clipboard should sync

### 5. Test Smart Handoff

1. Open YouTube: https://www.youtube.com/watch?v=dQw4w9WgXcQ
2. Play a video
3. Pause the video
4. Check background console - should see:
   ```
   🎬 Media state changed: ...
   ⏸️ Media paused: [video title]
   📤 Sending media handoff to backend...
   ```
5. Check mobile app - should receive handoff notification

### 6. Test on Mobile/Web

1. Open the mobile app or web app
2. Login with the SAME username
3. You should see a notification: "Browser Extension connected"
4. Try copying text on mobile - should sync to browser
5. Try pausing YouTube on browser - should get notification on mobile

## Common Issues

### "Could not establish connection. Receiving end does not exist"

**Fixed!** This was caused by:
- Content scripts trying to send messages before background script was ready
- Missing error handling in message passing
- Duplicate variable declarations causing script errors

**Solution Applied:**
- Added proper error handling with callbacks
- Added extension context validation
- Fixed duplicate declarations
- Added retry logic for message sending

### Extension Not Connecting to Backend

1. Check backend is running: https://sparkling-courtesy-production-1cb0.up.railway.app/health
2. Should return: `{"status":"healthy",...}`
3. If not, backend might be sleeping (Railway cold start)
4. Wait 30 seconds and try again

### Features Not Working

1. Open extension popup
2. Check all feature toggles are ON (green)
3. If OFF, toggle them ON
4. Settings are saved automatically

### No Notifications on Mobile

1. Verify mobile app is connected (check WebSocket status)
2. Verify same username on both devices
3. Check mobile app has notification permissions
4. Try restarting mobile app

## Debug Commands

### Check Extension Status
```javascript
// In background console
console.log('Connected:', isConnected);
console.log('Username:', username);
console.log('Device ID:', deviceId);
console.log('WebSocket state:', ws?.readyState);
```

### Check Storage
```javascript
// In background console
chrome.storage.local.get(null, (data) => console.log(data));
```

### Force Reconnect
```javascript
// In background console
connectWebSocket();
```

## Success Indicators

✅ No errors in extension console
✅ Green "Connected" status in popup
✅ Device registered message in backend logs
✅ Clipboard syncs between devices
✅ Media handoff notifications appear
✅ Mobile app shows "Browser Extension connected"

## Next Steps

If everything works:
1. Test with multiple devices
2. Test session invitations
3. Test group features
4. Test file transfers (if implemented)

If issues persist:
1. Check browser console for errors
2. Check backend logs
3. Verify network connectivity
4. Try different browser/device
