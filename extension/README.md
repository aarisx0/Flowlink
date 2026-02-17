# FlowLink Browser Extension

Seamlessly continue media playback and sync clipboard across all your devices.

## 🎯 Features

### 🎬 Smart Handoff
Pause a video on YouTube, Netflix, or Spotify and instantly continue watching on your phone or another device. The extension detects when you pause media and offers to resume it on your other devices at the exact same timestamp.

**Supported Platforms:**
- YouTube
- Netflix
- Spotify Web Player
- Twitch
- Vimeo
- Dailymotion

### 📋 Universal Clipboard
Copy text on your computer and instantly paste it on your phone, or vice versa. The extension automatically syncs your clipboard across all devices with the same username.

**Features:**
- Automatic text sync
- Works across browser, mobile, and web app
- No manual action required
- Instant synchronization

### 🔔 Smart Notifications
Get notified when media is paused on another device or when clipboard is synced. Notifications include action buttons for quick access.

## 🚀 Quick Start

1. **Install Extension**: Load unpacked in Chrome from `chrome://extensions/`
2. **Set Username**: Click extension icon and enter your username
3. **Connect**: Extension automatically connects to FlowLink backend
4. **Use**: Pause videos or copy text - it just works!

## ⚙️ Settings

Open the extension popup to configure:

- **Smart Handoff**: Toggle media detection on/off
- **Universal Clipboard**: Toggle clipboard sync on/off
- **Notifications**: Toggle notification popups on/off

All settings are saved automatically.

## 🔧 Configuration

Before loading the extension, update the backend URL in `background.js`:

```javascript
const BACKEND_URL = 'ws://localhost:8080'; // Change to your backend URL
```

For production, use `wss://` protocol:
```javascript
const BACKEND_URL = 'wss://your-app.railway.app';
```

## 📦 Installation

See [EXTENSION_INSTALLATION_GUIDE.md](../EXTENSION_INSTALLATION_GUIDE.md) for detailed installation and testing instructions.

## 🎨 Icons

Generate extension icons using `generate-icons.html`:

1. Open `generate-icons.html` in browser
2. Download all three icon sizes
3. Save to `icons/` folder as:
   - `icon16.png`
   - `icon48.png`
   - `icon128.png`

## 🏗️ Architecture

### Files:
- `manifest.json` - Extension configuration (Manifest V3)
- `background.js` - Service worker, WebSocket connection, message routing
- `content-media.js` - Media detection on video sites
- `content-clipboard.js` - Clipboard monitoring on all sites
- `popup.html/js/css` - Extension popup UI

### Message Flow:

**Smart Handoff:**
```
Video Pause → content-media.js → background.js → Backend → Other Devices
```

**Universal Clipboard:**
```
Copy Event → content-clipboard.js → background.js → Backend → Other Devices
```

## 🔒 Permissions

The extension requires these permissions:

- **tabs**: Detect active tab for media handoff
- **activeTab**: Access current page content
- **storage**: Save username and settings
- **notifications**: Show handoff and sync notifications
- **clipboardRead**: Read clipboard content
- **clipboardWrite**: Write synced clipboard content
- **host_permissions**: Access all websites for clipboard monitoring

## 🐛 Troubleshooting

### Not Connecting?
- Check backend URL in `background.js`
- Verify backend server is running
- Check browser console for errors

### Media Handoff Not Working?
- Verify Smart Handoff is enabled in popup
- Check you're on a supported platform
- Make sure other device has same username

### Clipboard Not Syncing?
- Verify Universal Clipboard is enabled
- Grant clipboard permissions when prompted
- Try copying text again

See [EXTENSION_INSTALLATION_GUIDE.md](../EXTENSION_INSTALLATION_GUIDE.md) for detailed troubleshooting.

## 📱 Cross-Platform

The extension works seamlessly with:
- **FlowLink Mobile App** (Android)
- **FlowLink Web App** (Browser)
- **Other Browser Extensions** (same username)

All devices with the same username are automatically synced.

## 🎯 Use Cases

1. **Watch Later**: Pause a video on your computer, continue on your phone during commute
2. **Quick Copy**: Copy a link on your phone, paste on your computer
3. **Multi-Device Work**: Copy code snippets between devices
4. **Seamless Browsing**: Start reading on one device, continue on another

## 🔐 Privacy

- No data is stored permanently on backend
- All communication is encrypted (wss://)
- Username is stored locally in browser
- No tracking or analytics
- Open source - audit the code yourself

## 📊 Performance

- Minimal resource usage (< 10MB RAM)
- Efficient event-based monitoring
- No polling or continuous background tasks
- WebSocket connection is lightweight

## 🚀 Future Enhancements

- [ ] Image clipboard sync
- [ ] Clipboard history
- [ ] Custom keyboard shortcuts
- [ ] More media platforms
- [ ] Firefox version
- [ ] Safari version

## 📄 License

Part of the FlowLink project. See main repository for license information.

## 🤝 Contributing

Contributions welcome! Please test thoroughly before submitting PRs.

## 📞 Support

For issues or questions, check the main FlowLink repository.

---

Made with ❤️ for seamless cross-device experiences
