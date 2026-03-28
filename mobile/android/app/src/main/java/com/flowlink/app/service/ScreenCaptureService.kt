package com.flowlink.app.service

import android.app.*
import android.content.Context
import android.content.Intent
import android.media.projection.MediaProjection
import android.media.projection.MediaProjectionManager
import android.os.Binder
import android.os.Build
import android.os.IBinder
import android.util.Log
import androidx.core.app.NotificationCompat
import com.flowlink.app.R

/**
 * Dedicated service for handling MediaProjection
 * This service receives the permission Intent and creates MediaProjection immediately
 */
class ScreenCaptureService : Service() {
    private var remoteDesktopManager: RemoteDesktopManager? = null
    private val binder = LocalBinder()
    
    inner class LocalBinder : Binder() {
        fun getService(): ScreenCaptureService = this@ScreenCaptureService
    }
    
    override fun onBind(intent: Intent?): IBinder = binder
    
    override fun onCreate() {
        super.onCreate()
        Log.d(TAG, "ScreenCaptureService created")
    }
    
    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        Log.d(TAG, "onStartCommand: action=${intent?.action}")
        
        when (intent?.action) {
            ACTION_START_FOREGROUND -> {
                // Start as foreground service
                startForeground(NOTIFICATION_ID, createNotification())
                Log.d(TAG, "Service started in foreground")
            }
            
            ACTION_START_CAPTURE -> {
                // This is the critical action - handle MediaProjection Intent IMMEDIATELY
                val resultCode = intent.getIntExtra(EXTRA_RESULT_CODE, Activity.RESULT_CANCELED)
                val data = intent.getParcelableExtra<Intent>(EXTRA_DATA)
                val sessionId = intent.getStringExtra(EXTRA_SESSION_ID)
                val sourceDeviceId = intent.getStringExtra(EXTRA_SOURCE_DEVICE_ID)
                val viewerDeviceId = intent.getStringExtra(EXTRA_VIEWER_DEVICE_ID)
                
                Log.d(TAG, "ACTION_START_CAPTURE received")
                Log.d(TAG, "resultCode=$resultCode, hasData=${data != null}")
                Log.d(TAG, "sessionId=$sessionId")
                Log.d(TAG, "sourceDeviceId=$sourceDeviceId")
                Log.d(TAG, "viewerDeviceId=$viewerDeviceId")
                
                if (data != null && sessionId != null && sourceDeviceId != null && viewerDeviceId != null) {
                    // Process IMMEDIATELY in service context
                    startScreenCapture(resultCode, data, sessionId, sourceDeviceId, viewerDeviceId)
                } else {
                    Log.e(TAG, "Missing required parameters for screen capture")
                    stopSelf()
                }
            }
            
            ACTION_STOP -> {
                Log.d(TAG, "ACTION_STOP received")
                stopScreenCapture()
                stopForeground(true)
                stopSelf()
            }
        }
        
        return START_STICKY
    }
    
    private fun startScreenCapture(
        resultCode: Int,
        data: Intent,
        sessionId: String,
        sourceDeviceId: String,
        viewerDeviceId: String
    ) {
        try {
            Log.d(TAG, "=== START SCREEN CAPTURE IN SERVICE ===")
            
            // Get WebSocketManager from application
            val app = application as? com.flowlink.app.FlowLinkApplication
            val webSocketManager = app?.webSocketManager
            
            if (webSocketManager == null) {
                Log.e(TAG, "WebSocketManager not available")
                stopSelf()
                return
            }
            
            // Clean up any existing manager
            remoteDesktopManager?.cleanup()
            remoteDesktopManager = null
            
            // Create RemoteDesktopManager
            Log.d(TAG, "Creating RemoteDesktopManager in service...")
            remoteDesktopManager = RemoteDesktopManager(
                this,
                webSocketManager,
                sessionId,
                sourceDeviceId,
                viewerDeviceId,
                true
            )
            webSocketManager.setRemoteDesktopManager(remoteDesktopManager)
            
            // Start screen share IMMEDIATELY with the Intent
            // This is the critical part - we're in the service context now
            Log.d(TAG, "Starting screen share IMMEDIATELY in service...")
            remoteDesktopManager?.startScreenShare(resultCode, data)
            
            Log.d(TAG, "✅ Screen capture started successfully in service")
            
            // Send ready message
            webSocketManager.sendMessage(org.json.JSONObject().apply {
                put("type", "remote_access_ready")
                put("sessionId", sessionId)
                put("deviceId", sourceDeviceId)
                put("payload", org.json.JSONObject().apply {
                    put("viewerDeviceId", viewerDeviceId)
                    put("sourceDeviceId", sourceDeviceId)
                })
                put("timestamp", System.currentTimeMillis())
            }.toString())
            
        } catch (e: Exception) {
            Log.e(TAG, "❌ Failed to start screen capture in service", e)
            stopSelf()
        }
    }
    
    private fun stopScreenCapture() {
        Log.d(TAG, "Stopping screen capture")
        try {
            (application as? com.flowlink.app.FlowLinkApplication)?.webSocketManager?.setRemoteDesktopManager(null)
        } catch (e: Exception) {
            Log.w(TAG, "WebSocketManager not available during cleanup")
        }
        remoteDesktopManager?.cleanup()
        remoteDesktopManager = null
    }
    
    private fun createNotification(): Notification {
        val channelId = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            createNotificationChannel()
        } else {
            ""
        }
        
        val stopIntent = Intent(this, ScreenCaptureService::class.java).apply {
            action = ACTION_STOP
        }
        val stopPendingIntent = PendingIntent.getService(
            this,
            0,
            stopIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        
        return NotificationCompat.Builder(this, channelId)
            .setContentTitle("FlowLink Screen Sharing")
            .setContentText("Your screen is being shared")
            .setSmallIcon(android.R.drawable.ic_menu_share)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .addAction(android.R.drawable.ic_menu_close_clear_cancel, "Stop", stopPendingIntent)
            .setOngoing(true)
            .build()
    }
    
    private fun createNotificationChannel(): String {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channelId = "screen_capture_service"
            val channelName = "Screen Capture Service"
            val channel = NotificationChannel(
                channelId,
                channelName,
                NotificationManager.IMPORTANCE_LOW
            )
            channel.description = "Shows when screen is being shared"
            val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            manager.createNotificationChannel(channel)
            return channelId
        }
        return ""
    }
    
    override fun onDestroy() {
        super.onDestroy()
        Log.d(TAG, "ScreenCaptureService destroyed")
        stopScreenCapture()
    }
    
    companion object {
        private const val TAG = "ScreenCaptureService"
        private const val NOTIFICATION_ID = 1002
        
        const val ACTION_START_FOREGROUND = "com.flowlink.app.ACTION_START_FOREGROUND"
        const val ACTION_START_CAPTURE = "com.flowlink.app.ACTION_START_CAPTURE"
        const val ACTION_STOP = "com.flowlink.app.ACTION_STOP"
        
        const val EXTRA_RESULT_CODE = "result_code"
        const val EXTRA_DATA = "data"
        const val EXTRA_SESSION_ID = "session_id"
        const val EXTRA_SOURCE_DEVICE_ID = "source_device_id"
        const val EXTRA_VIEWER_DEVICE_ID = "viewer_device_id"
    }
}
