package com.flowlink.app.service

import android.util.Log
import com.flowlink.app.MainActivity
import com.flowlink.app.model.Intent
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import okhttp3.*
import okio.ByteString
import org.json.JSONObject
import java.util.concurrent.TimeUnit

/**
 * WebSocket Manager
 * 
 * Handles WebSocket connection to backend for signaling
 */
class WebSocketManager(private val mainActivity: MainActivity) {
    private val sessionManager: SessionManager = mainActivity.sessionManager
    private val client = OkHttpClient.Builder()
        .pingInterval(30, TimeUnit.SECONDS)
        .build()

    private var webSocket: WebSocket? = null
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val _connectionState = MutableStateFlow<ConnectionState>(ConnectionState.Disconnected)
    val connectionState: StateFlow<ConnectionState> = _connectionState

    private val _receivedIntents = MutableStateFlow<Intent?>(null)
    val receivedIntents: StateFlow<Intent?> = _receivedIntents

    private val _sessionCreated = MutableStateFlow<SessionCreatedEvent?>(null)
    val sessionCreated: StateFlow<SessionCreatedEvent?> = _sessionCreated

    // Emits info about devices that connect to the current session
    private val _deviceConnected = MutableStateFlow<DeviceInfo?>(null)
    val deviceConnected: StateFlow<DeviceInfo?> = _deviceConnected

    // Emits join-session state so the UI can react to success or failure
    private val _sessionJoinState = MutableStateFlow<SessionJoinState>(SessionJoinState.Idle)
    val sessionJoinState: StateFlow<SessionJoinState> = _sessionJoinState

    // Emits when session expires so UI can navigate back
    private val _sessionExpired = MutableStateFlow<Boolean>(false)
    val sessionExpired: StateFlow<Boolean> = _sessionExpired

    private fun resetDeviceConnectedEvent() {
        // StateFlow replays the latest value to new collectors (like SessionCreatedFragment).
        // If we don't clear it, the QR screen can immediately auto-navigate to DeviceTiles
        // due to a stale "device_connected" from a previous session.
        _deviceConnected.value = null
    }

    data class SessionCreatedEvent(
        val sessionId: String,
        val code: String,
        val expiresAt: Long
    )

    data class DeviceInfo(
        val id: String,
        val name: String,
        val type: String
    )

    // IMPORTANT: Railway production backend
    // For Railway production: "wss://flowlink-production.up.railway.app"
    // For local development: "ws://10.0.2.2:8080" (emulator) or "ws://YOUR_COMPUTER_IP:8080" (physical device)
    private val WS_URL = "wss://sparkling-courtesy-production-1cb0.up.railway.app"

    fun connect(sessionCode: String) {
        try {
            if (_connectionState.value == ConnectionState.Connected) {
                return
            }

            // Clear any stale device_connected event from a previous session
            resetDeviceConnectedEvent()

            // Track join flow state when we are connecting with a code
            if (sessionCode.isNotEmpty()) {
                _sessionJoinState.value = SessionJoinState.InProgress
            } else {
                _sessionJoinState.value = SessionJoinState.Idle
            }

            val request = Request.Builder()
                .url(WS_URL)
                .build()

            webSocket = client.newWebSocket(request, object : WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: Response) {
                Log.d("FlowLink", "WebSocket connected")
                Log.d("FlowLink", "  Device ID: ${sessionManager.getDeviceId()}")
                Log.d("FlowLink", "  Device Name: ${sessionManager.getDeviceName()}")
                Log.d("FlowLink", "  Session Code: $sessionCode")
                _connectionState.value = ConnectionState.Connected

                // ALWAYS register device for invitation listening first
                val registerMessage = JSONObject().apply {
                    put("type", "device_register")
                    put("payload", JSONObject().apply {
                        put("deviceId", sessionManager.getDeviceId())
                        put("deviceName", sessionManager.getDeviceName())
                        put("deviceType", sessionManager.getDeviceType())
                        put("username", sessionManager.getUsername())
                    })
                    put("timestamp", System.currentTimeMillis())
                }
                Log.d("FlowLink", "Sending device_register: $registerMessage")
                sendMessage(registerMessage.toString())

                // Then send session_join if we have a code
                if (sessionCode.isNotEmpty()) {
                    val joinMessage = JSONObject().apply {
                        put("type", "session_join")
                        put("payload", JSONObject().apply {
                            put("code", sessionCode)
                            put("deviceId", sessionManager.getDeviceId())
                            put("deviceName", sessionManager.getDeviceName())
                            put("deviceType", sessionManager.getDeviceType())
                            put("username", sessionManager.getUsername())
                        })
                        put("timestamp", System.currentTimeMillis())
                    }
                    Log.d("FlowLink", "Sending session_join: $joinMessage")
                    sendMessage(joinMessage.toString())
                }
            }

            override fun onMessage(webSocket: WebSocket, text: String) {
                Log.d("FlowLink", "WebSocket message: $text")
                handleMessage(text)
            }

            override fun onMessage(webSocket: WebSocket, bytes: ByteString) {
                Log.d("FlowLink", "WebSocket binary message")
            }

            override fun onClosing(webSocket: WebSocket, code: Int, reason: String) {
                Log.d("FlowLink", "WebSocket closing")
                Log.d("FlowLink", "  Code: $code")
                Log.d("FlowLink", "  Reason: $reason")
                Log.d("FlowLink", "  Device ID: ${sessionManager.getDeviceId()}")
                _connectionState.value = ConnectionState.Disconnected
            }

            override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                Log.d("FlowLink", "WebSocket closed")
                Log.d("FlowLink", "  Code: $code")
                Log.d("FlowLink", "  Reason: $reason")
                Log.d("FlowLink", "  Device ID: ${sessionManager.getDeviceId()}")
                _connectionState.value = ConnectionState.Disconnected
            }

            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                Log.e("FlowLink", "WebSocket failure", t)
                Log.e("FlowLink", "  Device ID: ${sessionManager.getDeviceId()}")
                Log.e("FlowLink", "  Response: $response")
                _connectionState.value = ConnectionState.Error(t.message ?: "Unknown error")
                // Treat connection failure during a join attempt as a join error
                if (_sessionJoinState.value is SessionJoinState.InProgress) {
                    _sessionJoinState.value = SessionJoinState.Error(t.message ?: "Unable to connect")
                }
            }
        })
        } catch (e: Exception) {
            Log.e("FlowLink", "Failed to connect WebSocket", e)
            _connectionState.value = ConnectionState.Error(e.message ?: "Connection failed")
        }
    }

    fun disconnect() {
        webSocket?.close(1000, "Normal closure")
        webSocket = null
        _connectionState.value = ConnectionState.Disconnected
        _sessionJoinState.value = SessionJoinState.Idle
    }

    fun sendMessage(message: String) {
        webSocket?.send(message) ?: Log.w("FlowLink", "WebSocket not connected")
    }

    fun sendIntent(intent: Intent, targetDeviceId: String) {
        val currentSessionId = sessionManager.getCurrentSessionId()
        Log.d("FlowLink", "Sending intent ${intent.intentType} to $targetDeviceId with sessionId: $currentSessionId")
        
        val intentPayload = JSONObject()
        intent.payload?.forEach { (key, value) ->
            // Try to parse as JSON if it's a JSON string, otherwise use as-is
            try {
                val jsonValue = JSONObject(value)
                intentPayload.put(key, jsonValue) // Keep as nested JSON object
            } catch (e: Exception) {
                // Not JSON, use as string
                intentPayload.put(key, value)
            }
        }
        
        val message = JSONObject().apply {
            put("type", "intent_send")
            put("sessionId", currentSessionId)
            put("deviceId", sessionManager.getDeviceId())
            put("payload", JSONObject().apply {
                put("intent", JSONObject().apply {
                    put("intent_type", intent.intentType)
                    put("payload", intentPayload)
                    put("target_device", targetDeviceId)
                    put("source_device", sessionManager.getDeviceId())
                    put("auto_open", intent.autoOpen)
                    put("timestamp", intent.timestamp)
                })
                put("targetDevice", targetDeviceId)
            })
            put("timestamp", System.currentTimeMillis())
        }.toString()

        Log.d("FlowLink", "Intent message: $message")
        sendMessage(message)
    }

    private fun handleMessage(text: String) {
        try {
            val json = JSONObject(text)
            val type = json.getString("type")

            when (type) {
                "device_registered" -> {
                    Log.d("FlowLink", "📝 Device registered for invitation listening")
                    val payload = json.getJSONObject("payload")
                    val registered = payload.optBoolean("registered", false)
                    if (registered) {
                        Log.d("FlowLink", "✅ Ready to receive invitations")
                    }
                }
                "intent_received" -> {
                    val intentJson = json.getJSONObject("payload").getJSONObject("intent")
                    val payloadObj = intentJson.optJSONObject("payload")
                    
                    // Debug logging for batch files
                    val intentType = intentJson.getString("intent_type")
                    Log.d("FlowLink", "=== INTENT RECEIVED ===")
                    Log.d("FlowLink", "Intent type: $intentType")
                    Log.d("FlowLink", "Raw payload: ${payloadObj?.toString()}")
                    
                    // Enhanced payload parsing for batch files and other complex structures
                    val payloadMap = payloadObj?.let { obj ->
                        obj.keys().asSequence().associateWith { key ->
                            val value = obj.opt(key)
                            Log.d("FlowLink", "Payload key: $key, value type: ${value?.javaClass?.simpleName}")
                            when {
                                // For batch files, preserve the entire JSON structure
                                key == "files" && value is org.json.JSONObject -> {
                                    Log.d("FlowLink", "Found batch files payload: ${value.toString()}")
                                    value.toString()
                                }
                                // For other nested objects (media, link, etc.), preserve as JSON
                                value is org.json.JSONObject -> value.toString()
                                value is org.json.JSONArray -> value.toString()
                                // For simple values, convert to string
                                else -> value.toString()
                            }
                        }
                    }
                    
                    val intent = Intent(
                        intentType = intentJson.getString("intent_type"),
                        payload = payloadMap,
                        targetDevice = intentJson.getString("target_device"),
                        sourceDevice = intentJson.getString("source_device"),
                        autoOpen = intentJson.getBoolean("auto_open"),
                        timestamp = intentJson.getLong("timestamp")
                    )
                    _receivedIntents.value = intent
                }
                "device_connected" -> {
                    val deviceJson = json.getJSONObject("payload").getJSONObject("device")
                    val deviceInfo = DeviceInfo(
                        id = deviceJson.getString("id"),
                        name = deviceJson.getString("name"),
                        type = deviceJson.getString("type")
                    )
                    Log.d("FlowLink", "Received device_connected: ${deviceInfo.name} (${deviceInfo.id})")
                    Log.d("FlowLink", "  Current device ID: ${sessionManager.getDeviceId()}")
                    Log.d("FlowLink", "  Is self: ${deviceInfo.id == sessionManager.getDeviceId()}")
                    
                    // Only emit if it's not the current device
                    if (deviceInfo.id != sessionManager.getDeviceId()) {
                        _deviceConnected.value = deviceInfo
                        Log.d("FlowLink", "  Emitted device_connected event")
                    } else {
                        Log.d("FlowLink", "  Skipped (self)")
                    }
                }
                "device_disconnected" -> {
                    Log.d("FlowLink", "Device disconnected")
                }
                "session_created" -> {
                    val payload = json.getJSONObject("payload")
                    val sessionId = payload.getString("sessionId")
                    val code = payload.getString("code")
                    val expiresAt = payload.getLong("expiresAt")
                    
                    // Clear stale device_connected so the QR screen doesn't immediately navigate
                    resetDeviceConnectedEvent()

                    // CRITICAL FIX: Update SessionManager with backend's sessionId immediately
                    // This ensures all future intent_send messages use the correct sessionId
                    scope.launch {
                        sessionManager.setSessionInfo(sessionId, code)
                        Log.d("FlowLink", "Updated session info from session_created: id=$sessionId, code=$code")
                    }
                    
                    _sessionCreated.value = SessionCreatedEvent(sessionId, code, expiresAt)
                    Log.d("FlowLink", "Session created: $code with sessionId: $sessionId")
                }
                "session_joined" -> {
                    val payload = json.getJSONObject("payload")

                    // Backend sends the canonical sessionId here. For devices that
                    // joined using only the 6-digit code, we initially stored a
                    // locally generated sessionId in SessionManager. That local ID
                    // does NOT exist on the backend, which breaks routing for
                    // intents (including link_open) originating from Android.
                    //
                    // Fix: as soon as we receive session_joined, overwrite the
                    // locally generated sessionId with the real backend sessionId
                    // while preserving the original code. All future intent_send
                    // messages will then contain a valid sessionId.
                    val backendSessionId = payload.optString("sessionId", null)
                    if (!backendSessionId.isNullOrEmpty()) {
                        scope.launch {
                            val currentCode = sessionManager.getCurrentSessionCode() ?: ""
                            sessionManager.setSessionInfo(backendSessionId, currentCode)
                            Log.d("FlowLink", "Updated session info from session_joined: id=$backendSessionId, code=$currentCode")
                        }
                    }

                    val devicesArray = payload.optJSONArray("devices")
                    if (devicesArray != null) {
                        Log.d("FlowLink", "Processing ${devicesArray.length()} devices from session_joined")
                        // Notify about all devices in session
                        // IMPORTANT: Emit each device separately with a small delay
                        // so DeviceTilesFragment can collect all of them
                        scope.launch {
                            for (i in 0 until devicesArray.length()) {
                                val deviceJson = devicesArray.getJSONObject(i)
                                val deviceInfo = DeviceInfo(
                                    id = deviceJson.getString("id"),
                                    name = deviceJson.getString("name"),
                                    type = deviceJson.getString("type")
                                )
                                // Only notify about other devices
                                if (deviceInfo.id != sessionManager.getDeviceId()) {
                                    Log.d("FlowLink", "Emitting device from session_joined: ${deviceInfo.name} (${deviceInfo.id})")
                                    _deviceConnected.value = deviceInfo
                                    // Small delay to ensure each emission is collected
                                    kotlinx.coroutines.delay(50)
                                } else {
                                    Log.d("FlowLink", "Skipping self device: ${deviceInfo.name} (${deviceInfo.id})")
                                }
                            }
                        }
                    }
                    Log.d("FlowLink", "Session joined, devices updated")

                    // Mark join as successful so UI can navigate
                    val joinedSessionId = payload.optString("sessionId", null)
                    if (!joinedSessionId.isNullOrEmpty()) {
                        _sessionJoinState.value = SessionJoinState.Success(joinedSessionId)
                    } else {
                        _sessionJoinState.value = SessionJoinState.Success(sessionManager.getCurrentSessionId() ?: "")
                    }
                }
                "session_expired" -> {
                    val payload = json.optJSONObject("payload")
                    val reason = payload?.optString("reason", "unknown") ?: "unknown"
                    Log.d("FlowLink", "Session expired, reason: $reason")
                    
                    // Emit session expired event for UI to handle
                    _sessionExpired.value = true
                    
                    // Clear local session so user can start fresh
                    scope.launch {
                        sessionManager.leaveSession()
                    }
                    
                    // Don't set error state if we're not in a join flow
                    // This prevents crashes when session expires while app is active
                    if (_sessionJoinState.value is SessionJoinState.InProgress) {
                        _sessionJoinState.value = SessionJoinState.Error("Session expired")
                    }
                    
                    // Gracefully disconnect without forcing error state
                    // The UI will handle the session being cleared
                    disconnect()
                }
                "clipboard_sync" -> {
                    val clipboardJson = json.getJSONObject("payload").optJSONObject("clipboard")
                    if (clipboardJson != null) {
                        val text = clipboardJson.optString("text", "")
                        if (text.isNotEmpty()) {
                            Log.d("FlowLink", "📋 Received clipboard from remote: ${text.take(50)}...")
                            // Update clipboard via MainActivity
                            try {
                                mainActivity.updateClipboardFromRemote(text)
                            } catch (e: Exception) {
                                Log.e("FlowLink", "Failed to update clipboard", e)
                            }
                        }
                    }
                }
                "media_handoff_offer" -> {
                    Log.d("FlowLink", "🎬 Received media handoff offer")
                    val payload = json.getJSONObject("payload")
                    val title = payload.optString("title", "Unknown Video")
                    val url = payload.optString("url", "")
                    val timestamp = payload.optInt("timestamp", 0)
                    val platform = payload.optString("platform", "Unknown")
                    
                    Log.d("FlowLink", "Media: $title from $platform at ${timestamp}s")
                    
                    // Show notification
                    try {
                        mainActivity.notificationService.showMediaHandoff(title, url, timestamp, platform)
                    } catch (e: Exception) {
                        Log.e("FlowLink", "Failed to show media handoff notification", e)
                    }
                }
                "session_invitation" -> {
                    Log.d("FlowLink", "📨 Received session invitation")
                    val invitation = json.getJSONObject("payload").optJSONObject("invitation")
                    if (invitation != null) {
                        val sessionId = invitation.optString("sessionId", "")
                        val sessionCode = invitation.optString("sessionCode", "")
                        val inviterUsername = invitation.optString("inviterUsername", "")
                        val inviterDeviceName = invitation.optString("inviterDeviceName", "")
                        val message = invitation.optString("message", "")
                        
                        // Show notification
                        try {
                            mainActivity.notificationService.showSessionInvitation(
                                sessionId, sessionCode, inviterUsername, inviterDeviceName, message
                            )
                        } catch (e: Exception) {
                            Log.e("FlowLink", "Failed to show invitation notification", e)
                        }
                    }
                }
                "nearby_session_broadcast" -> {
                    Log.d("FlowLink", "📨 Received nearby session broadcast")
                    val nearbySession = json.getJSONObject("payload").optJSONObject("nearbySession")
                    if (nearbySession != null) {
                        val sessionId = nearbySession.optString("sessionId", "")
                        val sessionCode = nearbySession.optString("sessionCode", "")
                        val creatorUsername = nearbySession.optString("creatorUsername", "")
                        val creatorDeviceName = nearbySession.optString("creatorDeviceName", "")
                        val deviceCount = nearbySession.optInt("deviceCount", 1)
                        
                        // Show notification
                        try {
                            mainActivity.notificationService.showNearbySession(
                                sessionId, sessionCode, creatorUsername, creatorDeviceName, deviceCount
                            )
                        } catch (e: Exception) {
                            Log.e("FlowLink", "Failed to show nearby session notification", e)
                        }
                    }
                }
                "device_connected" -> {
                    Log.d("FlowLink", "📱 Device connected notification received")
                    val payload = json.getJSONObject("payload")
                    val deviceName = payload.optString("deviceName", "Unknown Device")
                    val deviceType = payload.optString("deviceType", "device")
                    val username = payload.optString("username", "")
                    
                    Log.d("FlowLink", "Device: $deviceName ($deviceType) - User: $username")
                    
                    // Show notification
                    try {
                        mainActivity.notificationService.showDeviceConnected(deviceName, deviceType)
                    } catch (e: Exception) {
                        Log.e("FlowLink", "Failed to show device connected notification", e)
                    }
                }
                "invitation_response" -> {
                    Log.d("FlowLink", "📨 Received invitation response")
                    val response = json.getJSONObject("payload")
                    val accepted = response.optBoolean("accepted", false)
                    val inviteeUsername = response.optString("inviteeUsername", "")
                    val inviteeDeviceName = response.optString("inviteeDeviceName", "")
                    
                    val message = if (accepted) {
                        "$inviteeUsername accepted your invitation"
                    } else {
                        "$inviteeUsername declined your invitation"
                    }
                    
                    try {
                        mainActivity.notificationService.showNotification(
                            if (accepted) "Invitation Accepted" else "Invitation Declined",
                            message
                        )
                    } catch (e: Exception) {
                        Log.e("FlowLink", "Failed to show invitation response notification", e)
                    }
                }
                "invitation_sent" -> {
                    Log.d("FlowLink", "📨 Received invitation sent confirmation")
                    val response = json.getJSONObject("payload")
                    val targetUsername = response.optString("targetUsername", "")
                    val targetIdentifier = response.optString("targetIdentifier", "")
                    val displayName = targetUsername.ifEmpty { targetIdentifier }
                    
                    try {
                        mainActivity.notificationService.showNotification(
                            "Invitation Sent",
                            "Invitation sent to $displayName"
                        )
                    } catch (e: Exception) {
                        Log.e("FlowLink", "Failed to show invitation sent notification", e)
                    }
                }
                "error" -> {
                    // Backend error (e.g., invalid session code). Surface this to the UI,
                    // especially during a join attempt.
                    val payload = json.optJSONObject("payload")
                    val message = payload?.optString("message", "Unknown error") ?: "Unknown error"
                    Log.e("FlowLink", "Backend error: $message")
                    if (_sessionJoinState.value is SessionJoinState.InProgress) {
                        _sessionJoinState.value = SessionJoinState.Error(message)
                    }
                }
            }
        } catch (e: Exception) {
            Log.e("FlowLink", "Error handling message", e)
        }
    }

    sealed class ConnectionState {
        object Disconnected : ConnectionState()
        object Connecting : ConnectionState()
        object Connected : ConnectionState()
        data class Error(val message: String) : ConnectionState()
    }

    sealed class SessionJoinState {
        object Idle : SessionJoinState()
        object InProgress : SessionJoinState()
        data class Success(val sessionId: String) : SessionJoinState()
        data class Error(val message: String) : SessionJoinState()
    }
}