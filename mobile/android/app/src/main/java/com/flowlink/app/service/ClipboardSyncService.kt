package com.flowlink.app.service

import android.app.Service
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.IBinder
import android.util.Base64
import android.util.Log
import androidx.core.content.FileProvider
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import java.io.File

/**
 * Background service to monitor clipboard changes and sync with other devices
 */
class ClipboardSyncService : Service() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    private var clipboardManager: ClipboardManager? = null
    private var lastClipboardText: String = ""
    private var lastRemoteFingerprint: String = ""
    private var lastRemoteAppliedAt: Long = 0L
    private var isEnabled = false
    
    private val clipboardListener = ClipboardManager.OnPrimaryClipChangedListener {
        if (!isEnabled) return@OnPrimaryClipChangedListener
        
        val clip = clipboardManager?.primaryClip
        if (clip != null && clip.itemCount > 0) {
            val item = clip.getItemAt(0)
            val text = item.coerceToText(this).toString()
            val url = extractUrl(text, item.uri)
             
            // Ignore if same as last text (avoid loops)
            if (text == lastClipboardText || text.isBlank()) {
                return@OnPrimaryClipChangedListener
            }
            
            // Ignore sensitive data patterns
            if (isSensitiveData(text)) {
                Log.d("FlowLink", "Clipboard sync: Skipping sensitive data")
                return@OnPrimaryClipChangedListener
            }
            
            lastClipboardText = text
            Log.d("FlowLink", "📋 Clipboard changed: ${text.take(50)}...")
            
            // Send to all connected devices
            sendClipboardToDevices(text, url)
        }
    }
    
    override fun onCreate() {
        super.onCreate()
        clipboardManager = getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
        Log.d("FlowLink", "ClipboardSyncService created")
    }
    
    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_ENABLE -> {
                isEnabled = true
                clipboardManager?.addPrimaryClipChangedListener(clipboardListener)
                Log.d("FlowLink", "📋 Clipboard sync ENABLED")
            }
            ACTION_DISABLE -> {
                isEnabled = false
                clipboardManager?.removePrimaryClipChangedListener(clipboardListener)
                Log.d("FlowLink", "📋 Clipboard sync DISABLED")
            }
            ACTION_UPDATE_CLIPBOARD -> {
                val text = intent.getStringExtra(EXTRA_TEXT)
                val html = intent.getStringExtra(EXTRA_HTML)
                val imageDataUrl = intent.getStringExtra(EXTRA_IMAGE_DATA_URL)
                val url = intent.getStringExtra(EXTRA_URL)
                if (text != null || html != null || imageDataUrl != null || url != null) {
                    updateClipboard(text, html, imageDataUrl, url)
                }
            }
        }
        return START_STICKY
    }
    
    override fun onBind(intent: Intent?): IBinder? = null
    
    override fun onDestroy() {
        super.onDestroy()
        clipboardManager?.removePrimaryClipChangedListener(clipboardListener)
        scope.cancel()
        Log.d("FlowLink", "ClipboardSyncService destroyed")
    }
    
    private fun updateClipboard(text: String?, html: String?, imageDataUrl: String?, url: String?) {
        val remoteFingerprint = listOf(text ?: "", html ?: "", imageDataUrl?.take(64) ?: "", url ?: "").joinToString("|")
        if (remoteFingerprint == lastRemoteFingerprint && System.currentTimeMillis() - lastRemoteAppliedAt < 30000) {
            Log.d("FlowLink", "📋 Ignoring duplicate clipboard sync (same fingerprint within 30s)")
            return
        }

        lastRemoteFingerprint = remoteFingerprint
        lastRemoteAppliedAt = System.currentTimeMillis()

        val effectiveUrl = url?.takeIf { it.isNotBlank() }
            ?: text?.takeIf { it.startsWith("http://") || it.startsWith("https://") }

        val textToCopy = text?.takeIf { it.isNotBlank() } ?: effectiveUrl

        if (!imageDataUrl.isNullOrBlank()) {
            val imageUri = persistImageToCache(imageDataUrl)
            if (imageUri != null) {
                lastClipboardText = textToCopy ?: imageDataUrl.take(32)
                val clip = ClipData.newUri(contentResolver, "FlowLink Image", imageUri)
                clipboardManager?.setPrimaryClip(clip)
                Log.d("FlowLink", "📋 Image clipboard updated from remote")
                return
            }
        }

        if (textToCopy.isNullOrBlank()) {
            return
        }

        lastClipboardText = textToCopy
        val clip = if (!html.isNullOrBlank()) {
            ClipData.newHtmlText("FlowLink", textToCopy, html)
        } else {
            ClipData.newPlainText("FlowLink", textToCopy)
        }
        clipboardManager?.setPrimaryClip(clip)
        Log.d("FlowLink", "📋 Clipboard updated from remote: ${textToCopy.take(50)}...")

        if (!effectiveUrl.isNullOrBlank()) {
            try {
                openUrl(effectiveUrl)
                Log.d("FlowLink", "🌐 Opened URL from remote clipboard: $effectiveUrl")
            } catch (e: Exception) {
                Log.e("FlowLink", "Failed to open URL from remote clipboard", e)
            }
        }
    }

    private fun persistImageToCache(dataUrl: String): Uri? {
        return try {
            val parts = dataUrl.split(",", limit = 2)
            if (parts.size != 2) {
                return null
            }

            val metadata = parts[0]
            val encoded = parts[1]
            val extension = when {
                metadata.contains("image/png") -> "png"
                metadata.contains("image/webp") -> "webp"
                metadata.contains("image/gif") -> "gif"
                else -> "jpg"
            }

            val bytes = Base64.decode(encoded, Base64.DEFAULT)
            val clipboardDir = File(cacheDir, "clipboard")
            if (!clipboardDir.exists()) {
                clipboardDir.mkdirs()
            }

            val imageFile = File(clipboardDir, "clipboard_${System.currentTimeMillis()}.$extension")
            imageFile.writeBytes(bytes)

            FileProvider.getUriForFile(this, "$packageName.fileprovider", imageFile)
        } catch (e: Exception) {
            Log.e("FlowLink", "Failed to persist clipboard image", e)
            null
        }
    }
    
    private fun sendClipboardToDevices(text: String, url: String?) {
        // Broadcast to MainActivity to send via WebSocket
        val broadcastIntent = Intent(ACTION_CLIPBOARD_CHANGED)
        broadcastIntent.putExtra(EXTRA_TEXT, text)
        broadcastIntent.putExtra(EXTRA_URL, url)
        broadcastIntent.setPackage(packageName)
        sendBroadcast(broadcastIntent)
    }

    private fun extractUrl(text: String, itemUri: Uri?): String? {
        val candidate = itemUri?.toString()?.takeIf { it.startsWith("http://") || it.startsWith("https://") }
            ?: text.takeIf { it.startsWith("http://") || it.startsWith("https://") }
        return candidate?.takeIf { it.isNotBlank() }
    }

    private fun openUrl(url: String) {
        try {
            val openIntent = Intent(Intent.ACTION_VIEW, Uri.parse(url)).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            startActivity(openIntent)
            Log.d("FlowLink", "🌐 Successfully opened URL: $url")
        } catch (e: Exception) {
            Log.e("FlowLink", "Failed to open URL from Service context: $url", e)
        }
    }
    
    private fun isSensitiveData(text: String): Boolean {
        // Check for common sensitive patterns
        val sensitivePatterns = listOf(
            Regex("\\b\\d{13,19}\\b"), // Credit card numbers
            Regex("\\b\\d{3}-\\d{2}-\\d{4}\\b"), // SSN
            Regex("password", RegexOption.IGNORE_CASE),
            Regex("\\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}\\b.*password", RegexOption.IGNORE_CASE),
            Regex("\\bpin\\b.*\\d{4,6}", RegexOption.IGNORE_CASE)
        )
        
        return sensitivePatterns.any { it.containsMatchIn(text) }
    }
    
    companion object {
        const val ACTION_ENABLE = "com.flowlink.app.ENABLE_CLIPBOARD_SYNC"
        const val ACTION_DISABLE = "com.flowlink.app.DISABLE_CLIPBOARD_SYNC"
        const val ACTION_UPDATE_CLIPBOARD = "com.flowlink.app.UPDATE_CLIPBOARD"
        const val ACTION_CLIPBOARD_CHANGED = "com.flowlink.app.CLIPBOARD_CHANGED"
        const val EXTRA_TEXT = "text"
        const val EXTRA_HTML = "html"
        const val EXTRA_IMAGE_DATA_URL = "image_data_url"
        const val EXTRA_URL = "url"
    }
}
