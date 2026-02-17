# FlowLink Extension - Quick Start Guide

Get up and running with the FlowLink browser extension in 5 minutes!

## 🚀 Quick Setup (5 Steps)

### Step 1: Generate Icons (2 minutes)
1. Open `generate-icons.html` in your browser
2. Click "Download 16x16" → Save as `icon16.png`
3. Click "Download 48x48" → Save as `icon48.png`
4. Click "Download 128x128" → Save as `icon128.png`
5. Move all three files to the `icons/` folder

### Step 2: Configure Backend (30 seconds)
1. Open `background.js` in a text editor
2. Find line 8: `const BACKEND_URL = 'ws://localhost:8080';`
3. Change to your backend URL:
   - **Local**: `ws://localhost:8080` (keep as is)
   - **Railway**: `wss://your-app.railway.app` (replace with your URL)

### Step 3: Load Extension (1 minute)
1. Open Chrome
2. Go to `chrome://extensions/`
3. Enable "Developer mode" (top-right toggle)
4. Click "Load unpacked"
5. Select the `extension` folder
6. Done! Extension icon appears in toolbar

### Step 4: Set Username (30 seconds)
1. Click the FlowLink extension icon
2. Enter your username (same as mobile/web)
3. Click "Get Started"
4. Status should show "Connected" ✅

### Step 5: Test It! (1 minute)
1. Open [YouTube](https://www.youtube.com)
2. Play any video
3. Pause the video
4. Check your mobile device
5. You should see: "Continue watching [video title]?"
6. Click "Continue" - video opens at same timestamp!

## ✨ That's It!

Your extension is now:
- ✅ Detecting media playback
- ✅ Syncing clipboard across devices
- ✅ Showing smart notifications
- ✅ Connected to all your devices

## 🎯 Quick Tests

### Test Clipboard Sync:
1. Copy any text (Ctrl+C)
2. Paste on your phone
3. Should see the same text!

### Test Media Handoff:
1. Pause YouTube video
2. Check phone for notification
3. Click "Continue"
4. Video opens at same spot!

### Test Settings:
1. Click extension icon
2. Toggle features on/off
3. Settings save automatically

## 🐛 Quick Troubleshooting

**Not connecting?**
- Check backend URL in `background.js`
- Verify backend is running
- Check console: Right-click extension icon → Inspect popup

**No notifications?**
- Click extension icon
- Make sure "Notifications" toggle is ON
- Grant notification permission when prompted

**Media not detected?**
- Check "Smart Handoff" toggle is ON
- Make sure you're on YouTube/Netflix/Spotify
- Try refreshing the page

**Clipboard not syncing?**
- Check "Universal Clipboard" toggle is ON
- Grant clipboard permission when prompted
- Try copying text again

## 📚 More Help

- **Full Guide**: See `EXTENSION_INSTALLATION_GUIDE.md`
- **Test Page**: Open `test-extension.html` in browser
- **Features**: See `README.md`

## 🎉 Enjoy!

You're all set! The extension will now:
- Automatically detect when you pause videos
- Instantly sync your clipboard across devices
- Show helpful notifications
- Work seamlessly in the background

No more manually copying links or losing your place in videos. Just pause, switch devices, and continue where you left off!

---

**Need help?** Check the full installation guide or test page for detailed troubleshooting.
