package com.flowlink.app.service

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Build
import android.os.IBinder
import android.net.Uri
import android.util.Log
import androidx.core.app.NotificationCompat
import com.flowlink.app.MainActivity
import com.flowlink.app.R
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import org.json.JSONObject
import java.util.concurrent.TimeUnit

/**
 * Background service to listen for invitations even when app is closed
 */
class InvitationListenerService : Service() {
    
    companion object {
        const val CHANNEL_ID = "invitation_listener"
        const val NOTIFICATION_ID = 1000
        const val ACTION_START_LISTENING = "start_listening"
        const val ACTION_STOP_LISTENING = "stop_listening"
        
        fun startService(context: Context, username: String, deviceId: String, deviceName: String) {
            val intent = Intent(context, InvitationListenerService::class.java).apply {
                action = ACTION_START_LISTENING
                putExtra("username", username)
                putExtra("deviceId", deviceId)
                putExtra("deviceName", deviceName)
            }
            context.startForegroundService(intent)
        }
        
        fun stopService(context: Context) {
            val intent = Intent(context, InvitationListenerService::class.java).apply {
                action = ACTION_STOP_LISTENING
            }
            context.startService(intent)
        }
    }
    
    private val client = OkHttpClient.Builder()
        .pingInterval(30, TimeUnit.SECONDS)
        .build()
    
    private var webSocket: WebSocket? = null
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private lateinit var notificationService: NotificationService
    private lateinit var sessionManager: SessionManager
    
    private var username: String = ""
    private var deviceId: String = ""
    private var deviceName: String = ""
    
    private val WS_URL = BackendConfig.WS_URL

    private val clipboardReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            if (intent?.action != ClipboardSyncService.ACTION_CLIPBOARD_CHANGED) {
                return
            }

            val text = intent.getStringExtra(ClipboardSyncService.EXTRA_TEXT)
            val url = intent.getStringExtra(ClipboardSyncService.EXTRA_URL)
            sendClipboardToDevices(text, url)
        }
    }
    
    override fun onCreate() {
        super.onCreate()
        sessionManager = SessionManager(this)
        notificationService = NotificationService(this)
        createNotificationChannel()
        val filter = IntentFilter(ClipboardSyncService.ACTION_CLIPBOARD_CHANGED)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            registerReceiver(clipboardReceiver, filter, Context.RECEIVER_NOT_EXPORTED)
        } else {
            registerReceiver(clipboardReceiver, filter)
        }
    }
    
    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_START_LISTENING -> {
                username = intent.getStringExtra("username") ?: ""
                deviceId = intent.getStringExtra("deviceId") ?: ""
                deviceName = intent.getStringExtra("deviceName") ?: ""
                
                if (username.isNotEmpty() && deviceId.isNotEmpty()) {
                    startForeground(NOTIFICATION_ID, createForegroundNotification())
                    startClipboardSync()
                    connectWebSocket()
                }
            }
            ACTION_STOP_LISTENING -> {
                stopSelf()
            }
        }
        return START_STICKY // Restart if killed
    }
    
    override fun onBind(intent: Intent?): IBinder? = null
    
    override fun onDestroy() {
        super.onDestroy()
        try {
            unregisterReceiver(clipboardReceiver)
        } catch (_: Exception) {
        }
        webSocket?.close(1000, "Service destroyed")
        scope.cancel()
    }
    
    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Invitation Listener",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Keeps FlowLink running to receive invitations"
                setShowBadge(false)
            }
            
            val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            manager.createNotificationChannel(channel)
        }
    }
    
    private fun createForegroundNotification(): Notification {
        val intent = Intent(this, MainActivity::class.java)
        val pendingIntent = PendingIntent.getActivity(
            this, 0, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("FlowLink Active")
            .setContentText("Ready to sync clipboard and handoff events")
            .setSmallIcon(R.drawable.ic_notification)
            .setContentIntent(pendingIntent)
            .setOngoing(true)
            .setSilent(true)
            .build()
    }
    
    private fun connectWebSocket() {
        if (webSocket != null) return
        
        val request = Request.Builder()
            .url(WS_URL)
            .build()
        
        webSocket = client.newWebSocket(request, object : WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: Response) {
                Log.d("FlowLink", "Background WebSocket connected")
                
                // Register device for invitation listening
                val registerMessage = JSONObject().apply {
                    put("type", "device_register")
                    put("payload", JSONObject().apply {
                        put("deviceId", deviceId)
                        put("deviceName", deviceName)
                        put("deviceType", "phone")
                        put("username", username)
                    })
                    put("timestamp", System.currentTimeMillis())
                }
                
                webSocket.send(registerMessage.toString())
                Log.d("FlowLink", "Background device registered for invitations")
            }
            
            override fun onMessage(webSocket: WebSocket, text: String) {
                Log.d("FlowLink", "Background WebSocket message: $text")
                handleMessage(text)
            }
            
            override fun onClosing(webSocket: WebSocket, code: Int, reason: String) {
                Log.d("FlowLink", "Background WebSocket closing: $reason")
            }
            
            override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                Log.d("FlowLink", "Background WebSocket closed: $reason")
                this@InvitationListenerService.webSocket = null
                
                // Reconnect after delay
                scope.launch {
                    delay(5000)
                    connectWebSocket()
                }
            }
            
            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                Log.e("FlowLink", "Background WebSocket failure", t)
                this@InvitationListenerService.webSocket = null
                
                // Reconnect after delay
                scope.launch {
                    delay(5000)
                    connectWebSocket()
                }
            }
        })
    }
    
    private fun handleMessage(text: String) {
        try {
            val json = JSONObject(text)
            val type = json.getString("type")
            
            when (type) {
                "device_registered" -> {
                    Log.d("FlowLink", "Background device registered successfully")
                }

                "clipboard_sync" -> {
                    val clipboardJson = json.getJSONObject("payload").optJSONObject("clipboard")
                    if (clipboardJson != null) {
                        val intent = Intent(this, ClipboardSyncService::class.java).apply {
                            action = ClipboardSyncService.ACTION_UPDATE_CLIPBOARD
                            putExtra(ClipboardSyncService.EXTRA_TEXT, clipboardJson.optString("text", "").ifBlank { null })
                            putExtra(ClipboardSyncService.EXTRA_HTML, clipboardJson.optString("html", "").ifBlank { null })
                            putExtra(ClipboardSyncService.EXTRA_IMAGE_DATA_URL, clipboardJson.optString("image", "").ifBlank { null })
                            putExtra(ClipboardSyncService.EXTRA_URL, clipboardJson.optString("url", "").ifBlank { null })
                        }
                        startService(intent)
                    }
                }

                "media_handoff_offer" -> {
                    val payload = json.getJSONObject("payload")
                    notificationService.showMediaHandoff(
                        payload.optString("title", "Unknown Media"),
                        payload.optString("url", ""),
                        payload.optInt("timestamp", 0),
                        payload.optString("platform", "Browser")
                    )
                }

                "tab_handoff_offer" -> {
                    val payload = json.getJSONObject("payload")
                    val tabs = payload.optJSONArray("tabs")
                    val tabCount = tabs?.length() ?: 0
                    if (tabCount > 0) {
                        notificationService.showTabHandoff(
                            payload.optString("collectionTitle", if (tabCount > 1) "$tabCount tabs" else "Tab handoff"),
                            payload.toString(),
                            payload.optString("sourceDeviceName", "Browser Extension"),
                            tabCount
                        )
                    }
                }

                "target_connection_request" -> {
                    val payload = json.getJSONObject("payload")
                    val sourceDeviceId = payload.optString("sourceDeviceId", "")
                    val sourceUsername = payload.optString("sourceUsername", "Unknown")
                    val sourceDeviceName = payload.optString("sourceDeviceName", "Unknown Device")

                    sessionManager.setPreferredTargetUsername(sourceUsername)
                    notificationService.showReceiverConnected(sourceUsername, sourceDeviceName)

                    val ackMessage = JSONObject().apply {
                        put("type", "target_connection_ack")
                        put("deviceId", deviceId)
                        put("sessionId", JSONObject.NULL)
                        put("payload", JSONObject().apply {
                            put("sourceDeviceId", sourceDeviceId)
                            put("sourceUsername", sourceUsername)
                            put("targetUsername", username)
                            put("targetDeviceName", deviceName)
                        })
                        put("timestamp", System.currentTimeMillis())
                    }
                    webSocket?.send(ackMessage.toString())
                }
                
                "session_invitation" -> {
                    Log.d("FlowLink", "📨 Background received session invitation")
                    val invitation = json.getJSONObject("payload").optJSONObject("invitation")
                    if (invitation != null) {
                        val sessionId = invitation.optString("sessionId", "")
                        val sessionCode = invitation.optString("sessionCode", "")
                        val inviterUsername = invitation.optString("inviterUsername", "")
                        val inviterDeviceName = invitation.optString("inviterDeviceName", "")
                        val message = invitation.optString("message", "")
                        
                        // Show notification
                        notificationService.showSessionInvitation(
                            sessionId, sessionCode, inviterUsername, inviterDeviceName, message
                        )
                    }
                }
                
                "nearby_session_broadcast" -> {
                    Log.d("FlowLink", "📨 Background received nearby session broadcast")
                    val nearbySession = json.getJSONObject("payload").optJSONObject("nearbySession")
                    if (nearbySession != null) {
                        val sessionId = nearbySession.optString("sessionId", "")
                        val sessionCode = nearbySession.optString("sessionCode", "")
                        val creatorUsername = nearbySession.optString("creatorUsername", "")
                        val creatorDeviceName = nearbySession.optString("creatorDeviceName", "")
                        val deviceCount = nearbySession.optInt("deviceCount", 1)
                        
                        // Show notification
                        notificationService.showNearbySession(
                            sessionId, sessionCode, creatorUsername, creatorDeviceName, deviceCount
                        )
                    }
                }
            }
        } catch (e: Exception) {
            Log.e("FlowLink", "Error handling background message", e)
        }
    }

    private fun startClipboardSync() {
        startService(Intent(this, ClipboardSyncService::class.java))
        startService(Intent(this, ClipboardSyncService::class.java).apply {
            action = ClipboardSyncService.ACTION_ENABLE
        })
    }

    private fun sendClipboardToDevices(text: String?, url: String?) {
        if (text.isNullOrBlank() && url.isNullOrBlank()) {
            return
        }

        val payload = JSONObject().apply {
            put("clipboard", JSONObject().apply {
                if (!text.isNullOrBlank()) {
                    put("text", text)
                }
                if (!url.isNullOrBlank()) {
                    put("url", url)
                }
            })
            sessionManager.getPreferredTargetUsername()?.takeIf { it.isNotBlank() }?.let {
                put("targetUsername", it)
            }
        }

        val message = JSONObject().apply {
            put("type", "clipboard_broadcast")
            put("deviceId", deviceId)
            put("sessionId", JSONObject.NULL)
            put("payload", payload)
            put("timestamp", System.currentTimeMillis())
        }

        webSocket?.send(message.toString())
    }
}
