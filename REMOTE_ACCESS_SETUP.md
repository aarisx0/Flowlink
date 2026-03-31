# FlowLink Remote Access Setup & Troubleshooting Guide

## ✅ Backend Server Status

The backend server is **running and healthy**:
- ✅ WebSocket: `ws://localhost:8080` (OPEN)
- ✅ HTTP Health Check: `http://localhost:8080/health` (RESPONDING)
- ✅ Device Registration: WORKING
- ✅ Device Registry: 4 devices registered

## 🚀 How to Start the System

### 1. Start the Backend Server

```bash
cd backend
npm install  # If not already installed
npm start    # Starts on port 8080
```

The backend should output:
```
✅ FlowLink backend server running on 0.0.0.0:8080
🔗 WebSocket: ws://localhost:8080 (local) or ws://<your-ip>:8080 (remote)
🏥 Health check: http://localhost:8080/health
📊 Debug endpoint: http://localhost:8080/debug
```

### 2. Start the Frontend (in another terminal)

```bash
cd frontend
npm install  # If not already installed
npm run dev  # Starts on port 5173
```

The frontend will automatically connect to the backend.

### 3. (Optional) Start the Extension

Load `extension/` as an unpacked extension in Chrome:
1. Open `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select the `extension/` directory

## 🔌 Connection Details

### Frontend WebSocket URL Configuration

The frontend **automatically detects** the backend URL based on where it's loaded from:

- **Local Development** (`localhost`): `ws://localhost:8080`
- **Remote/Production** (IP address): `ws://<your-ip>:8080`

Environment variable override:
```bash
VITE_SIGNALING_URL=ws://your-custom-backend:8080 npm run dev
```

### Backend Listening Interface

Backend listens on **all interfaces** (`0.0.0.0:8080`), so it can be accessed from:
- Same machine: `ws://localhost:8080`
- Other machines on LAN: `ws://<backend-ip>:8080`
- Mobile devices: `ws://<backend-ip>:8080`

## ❌ Troubleshooting

### Error: "Connection closed (code: 1006). The server may not be running..."

**Cause**: WebSocket connection failed or server not responding

**Solutions**:
1. ✅ **Verify backend is running**:
   ```bash
   curl http://localhost:8080/health
   ```
   Should return: `{"status":"healthy",...}`

2. ✅ **Check port 8080 is not blocked**:
   ```bash
   netstat -tuln | grep 8080
   ```
   Should show: `LISTEN`

3. ✅ **Verify firewall allows port 8080**:
   - Windows: Check Windows Defender Firewall
   - macOS: Check System Preferences > Security & Privacy
   - Linux: `sudo ufw allow 8080`

4. ✅ **Check if backend crashed**:
   - Look at backend terminal for error messages
   - Restart backend: `npm start`

5. ✅ **Mobile/LAN connection**:
   - Use IP address instead of localhost
   - Example: `ws://192.168.0.104:8080`
   - Check both devices are on the same network

### Error: "Connection timeout. Make sure the backend server is running..."

**Cause**: Frontend couldn't reach backend within 10 seconds

**Solutions**:
1. Check backend startup logs
2. Verify network connectivity between frontend and backend
3. Try increasing timeout in RemoteAccess.tsx (line 81)

### Error: "Connection lost" or "Abnormal closure"

**Cause**: Connection was established but then dropped

**Solutions**:
1. Check backend error logs
2. Ensure stable network connection
3. Check for firewall/proxy issues
4. Restart both frontend and backend

### Remote Access shows "Waiting for source device to start screen sharing..."

**Cause**: Connection successful, but source device hasn't started sharing

**Solutions**:
1. On the source device (the one with screen to share):
   - Click the remote access button
   - Select "Share Entire Screen" or "Share Single App"
   - Grant the permission when prompted

2. Verify source device is in the same session

3. Check for browser permissions:
   - Allow screen capture
   - Allow microphone (if audio needed)

## 🧪 Testing the Connection

### Test 1: Backend Health Check

```bash
curl http://localhost:8080/health
```

Expected output:
```json
{
  "status": "healthy",
  "sessions": 0,
  "connections": 4,
  "globalDevices": 4,
  "uptime": 256.51
}
```

### Test 2: WebSocket Connection

Run the test script:
```bash
cd backend
node test-websocket.js
```

Expected output:
```
✅ All tests passed!
```

### Test 3: Debug Endpoint

```bash
curl http://localhost:8080/debug
```

Shows detailed information about:
- Active sessions
- Connected devices
- Global device registry
- WebSocket connections

## 📊 Key Files

- **Backend**: `backend/src/server.js` - Main signaling server
- **Frontend**: `frontend/src/components/RemoteAccess.tsx` - Remote access UI
- **Config**: `frontend/src/config/signaling.ts` - WebSocket URL configuration
- **WebRTC Manager**: `frontend/src/services/RemoteDesktopManager.ts` - Screen share logic

## 🔐 Security Notes

1. **Port 8080**: Currently open to all interfaces (0.0.0.0)
   - For production, restrict to localhost or add authentication

2. **WebSocket**: No encryption
   - For production, use WSS (secure WebSocket) with valid SSL certificate

3. **Device Registration**: No authentication
   - Currently accepts any device ID
   - For production, add device token validation

4. **Session Codes**: 6-digit numeric codes
   - Should be distributed securely (not in logs or unencrypted channels)

## 🎯 Next Steps

1. ✅ Start backend: `cd backend && npm start`
2. ✅ Start frontend: `cd frontend && npm run dev`
3. ✅ Test health check: `curl http://localhost:8080/health`
4. ✅ Open frontend in browser: `http://localhost:5173`
5. ✅ Create a session
6. ✅ Join with another device
7. ✅ Start remote access

## 📝 Notes

- All WebSocket connections are logged with client IP and port
- Devices remain in registry even when offline (for invitation delivery)
- Sessions expire after 1 hour (configurable via SESSION_EXPIRY_MS)
- Connection timeout is 10 seconds (configurable in RemoteAccess.tsx)

## 💡 Tips

- **Development**: Use `npm run dev` in backend for auto-restart on file changes
- **Debugging**: Check browser console (F12) and backend terminal for detailed logs
- **Performance**: Monitor `/debug` endpoint for active connections and sessions
- **Testing**: Use the built-in test script: `node backend/test-websocket.js`

---

**Last Updated**: 2024
**Status**: ✅ All systems operational
