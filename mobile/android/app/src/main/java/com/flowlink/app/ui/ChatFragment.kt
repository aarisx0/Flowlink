package com.flowlink.app.ui

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.media.MediaPlayer
import android.media.MediaRecorder
import android.net.Uri
import android.os.Bundle
import android.text.Editable
import android.text.TextWatcher
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import androidx.fragment.app.Fragment
import androidx.lifecycle.lifecycleScope
import androidx.recyclerview.widget.LinearLayoutManager
import com.flowlink.app.BuildConfig
import com.flowlink.app.MainActivity
import com.flowlink.app.R
import com.flowlink.app.databinding.FragmentChatBinding
import com.flowlink.app.model.ChatMessage
import com.flowlink.app.service.SessionManager
import com.flowlink.app.service.WebSocketManager
import kotlinx.coroutines.launch
import java.io.File

class ChatFragment : Fragment() {
    private var _binding: FragmentChatBinding? = null
    private val binding get() = _binding!!
    private var sessionManager: SessionManager? = null
    private var chatAdapter: ChatMessageAdapter? = null
    private val typingByDevice = mutableMapOf<String, Boolean>()
    private var chatTypingStopRunnable: Runnable? = null
    private var typingIndicatorRunnable: Runnable? = null
    private var replyToMessage: ChatMessage? = null
    private var mediaRecorder: MediaRecorder? = null
    private var voiceFile: File? = null
    private var isRecording = false

    private val requestMicPermission = registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        if (granted) startVoiceRecording() else Toast.makeText(requireContext(), "Microphone permission needed", Toast.LENGTH_SHORT).show()
    }

    // Access persistent list from MainActivity
    private val chatMessages: MutableList<ChatMessage> get() = (activity as? MainActivity)?.chatMessages ?: mutableListOf()

    private val pickFileLauncher = registerForActivityResult(ActivityResultContracts.OpenDocument()) { uri: Uri? ->
        uri ?: return@registerForActivityResult
        val mainActivity = activity as? MainActivity ?: return@registerForActivityResult
        val ctx = requireContext()
        try {
            val resolver = ctx.contentResolver
            val name = resolver.query(uri, null, null, null, null)?.use { cursor ->
                val idx = cursor.getColumnIndex(android.provider.OpenableColumns.DISPLAY_NAME)
                if (idx != -1 && cursor.moveToFirst()) cursor.getString(idx) else uri.lastPathSegment ?: "file"
            } ?: (uri.lastPathSegment ?: "file")
            val type = resolver.getType(uri) ?: "application/octet-stream"
            val size = resolver.query(uri, null, null, null, null)?.use { cursor ->
                val idx = cursor.getColumnIndex(android.provider.OpenableColumns.SIZE)
                if (idx != -1 && cursor.moveToFirst()) cursor.getLong(idx) else 0L
            } ?: 0L
            val bytes = resolver.openInputStream(uri)?.readBytes() ?: return@registerForActivityResult
            val base64 = android.util.Base64.encodeToString(bytes, android.util.Base64.NO_WRAP)
            val selfId = sessionManager?.getDeviceId() ?: return@registerForActivityResult
            val messageId = "mob-file-${System.currentTimeMillis()}"
            val msg = ChatMessage(
                messageId = messageId, text = "📎 $name",
                username = sessionManager?.getUsername().orEmpty(),
                sourceDevice = selfId, targetDevice = "",
                sentAt = System.currentTimeMillis(), delivered = false, seen = false,
                fileId = messageId, fileName = name, fileType = type, fileSize = size,
                fileData = base64,
                replyToId = replyToMessage?.messageId,
                replyToText = replyToMessage?.text,
                replyToUsername = replyToMessage?.username
            )
            chatMessages.add(msg)
            chatAdapter?.notifyItemInserted(chatMessages.size - 1)
            binding.rvChatMessages.scrollToPosition(chatMessages.size - 1)
            clearReply()
            // Send to all devices
            mainActivity.webSocketManager.sessionDevices.value
                .filter { it.id != selfId }
                .forEach { device ->
                    mainActivity.webSocketManager.sendChatFile(device.id, messageId, name, type, size, base64, replyToMessage?.messageId)
                }
            Toast.makeText(ctx, "Sending $name", Toast.LENGTH_SHORT).show()
        } catch (e: Exception) {
            Toast.makeText(ctx, "Failed: ${e.message}", Toast.LENGTH_SHORT).show()
        }
    }

    companion object {
        fun newInstance() = ChatFragment()
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        sessionManager = SessionManager(requireContext())
    }

    override fun onCreateView(inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?): View {
        _binding = FragmentChatBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        val mainActivity = activity as? MainActivity ?: return
        val selfId = sessionManager?.getDeviceId() ?: ""

        // Apply chat background if set
        val prefs = requireContext().getSharedPreferences("flowlink_settings", Context.MODE_PRIVATE)
        val bgUri = prefs.getString("chat_bg_uri", null)
        if (bgUri != null) {
            try {
                binding.root.background = null
                binding.rvChatMessages.background = android.graphics.drawable.BitmapDrawable(
                    resources,
                    android.provider.MediaStore.Images.Media.getBitmap(
                        requireContext().contentResolver, Uri.parse(bgUri)
                    )
                )
            } catch (_: Exception) {}
        }

        // Setup RecyclerView with persistent messages
        val layoutManager = LinearLayoutManager(requireContext()).apply { stackFromEnd = true }
        binding.rvChatMessages.layoutManager = layoutManager
        chatAdapter = ChatMessageAdapter(
            messages = chatMessages,
            selfDeviceId = selfId,
            onReply = { msg -> setReply(msg) },
            onFileDownload = { msg -> downloadChatFile(msg) }
        )
        binding.rvChatMessages.adapter = chatAdapter
        chatAdapter?.attachSwipeToReply(binding.rvChatMessages)
        if (chatMessages.isNotEmpty()) {
            binding.rvChatMessages.scrollToPosition(chatMessages.size - 1)
        }

        val code = sessionManager?.getCurrentSessionCode()
        binding.tvChatSubtitle.text = "Session: ${code ?: "N/A"}"

        binding.btnSendChat.setOnClickListener { sendChatMessage() }
        binding.btnAttach.setOnClickListener { pickFileLauncher.launch(arrayOf("*/*")) }
        binding.btnCancelReply.setOnClickListener { clearReply() }

        // Voice message: hold to record, release to send
        binding.btnVoice.setOnTouchListener { _, event ->
            when (event.action) {
                android.view.MotionEvent.ACTION_DOWN -> {
                    if (ContextCompat.checkSelfPermission(requireContext(), Manifest.permission.RECORD_AUDIO)
                        == PackageManager.PERMISSION_GRANTED) {
                        startVoiceRecording()
                    } else {
                        requestMicPermission.launch(Manifest.permission.RECORD_AUDIO)
                    }
                    true
                }
                android.view.MotionEvent.ACTION_UP, android.view.MotionEvent.ACTION_CANCEL -> {
                    stopVoiceRecordingAndSend()
                    true
                }
                else -> false
            }
        }

        binding.etChatInput.addTextChangedListener(object : TextWatcher {
            override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) = Unit
            override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) = Unit
            override fun afterTextChanged(s: Editable?) {
                sendTypingState(s?.toString().orEmpty().isNotBlank())
            }
        })

        viewLifecycleOwner.lifecycleScope.launch {
            mainActivity.webSocketManager.chatEvents.collect { event ->
                when (event) {
                    is WebSocketManager.ChatEvent.Message -> {
                        val msg = ChatMessage(
                            messageId = event.messageId, text = event.text,
                            username = event.username, sourceDevice = event.sourceDevice,
                            targetDevice = event.targetDevice, sentAt = event.sentAt,
                            delivered = true, seen = true,
                            fileId = event.fileId, fileName = event.fileName,
                            fileType = event.fileType, fileSize = event.fileSize,
                            fileData = event.fileData,
                            replyToId = event.replyToId, replyToText = event.replyToText,
                            replyToUsername = event.replyToUsername
                        )
                        // Avoid duplicates
                        if (chatMessages.none { it.messageId == event.messageId }) {
                            chatMessages.add(msg)
                            chatAdapter?.notifyItemInserted(chatMessages.size - 1)
                            binding.rvChatMessages.scrollToPosition(chatMessages.size - 1)
                        }
                        val readReceipts = prefs.getBoolean("read_receipts", true)
                        if (readReceipts) {
                            mainActivity.webSocketManager.sendChatReceipt("chat_seen", event.messageId, event.sourceDevice)
                        }
                    }
                    is WebSocketManager.ChatEvent.Delivered -> {
                        chatAdapter?.updateMessage(event.messageId, delivered = true, seen = false)
                    }
                    is WebSocketManager.ChatEvent.Seen -> {
                        chatAdapter?.updateMessage(event.messageId, delivered = true, seen = true)
                    }
                    is WebSocketManager.ChatEvent.Typing -> {
                        if (event.sourceDevice.isNotBlank()) {
                            typingByDevice[event.sourceDevice] = event.isTyping
                            renderTypingIndicator()
                        }
                    }
                }
            }
        }
    }

    private fun setReply(msg: ChatMessage) {
        replyToMessage = msg
        binding.replyPreviewContainer.visibility = View.VISIBLE
        binding.tvReplyPreview.text = "↩ ${msg.username}: ${msg.text.take(60)}"
    }

    private fun clearReply() {
        replyToMessage = null
        binding.replyPreviewContainer.visibility = View.GONE
    }

    private fun sendChatMessage() {
        val mainActivity = activity as? MainActivity ?: return
        val text = binding.etChatInput.text?.toString()?.trim().orEmpty()
        if (text.isEmpty()) return
        val selfId = sessionManager?.getDeviceId().orEmpty()
        val devices = mainActivity.webSocketManager.sessionDevices.value.filter { it.id != selfId }
        if (devices.isEmpty()) {
            Toast.makeText(requireContext(), "No devices connected", Toast.LENGTH_SHORT).show()
            return
        }
        val messageId = "mob-chat-${System.currentTimeMillis()}"
        val target = devices.first()
        val msg = ChatMessage(
            messageId = messageId, text = text,
            username = sessionManager?.getUsername().orEmpty(),
            sourceDevice = selfId, targetDevice = target.id,
            sentAt = System.currentTimeMillis(), delivered = false, seen = false,
            replyToId = replyToMessage?.messageId,
            replyToText = replyToMessage?.text,
            replyToUsername = replyToMessage?.username
        )
        chatMessages.add(msg)
        chatAdapter?.notifyItemInserted(chatMessages.size - 1)
        binding.rvChatMessages.scrollToPosition(chatMessages.size - 1)
        binding.etChatInput.setText("")
        clearReply()
        sendTypingState(false)
        mainActivity.webSocketManager.sendChatMessage(
            target.id, messageId, text,
            replyToMessage?.messageId, replyToMessage?.text, replyToMessage?.username
        )
    }

    private fun downloadChatFile(msg: ChatMessage) {
        val ctx = requireContext()
        val data = msg.fileData ?: run {
            Toast.makeText(ctx, "No file data available", Toast.LENGTH_SHORT).show()
            return
        }
        try {
            val bytes = android.util.Base64.decode(data, android.util.Base64.DEFAULT)
            val downloadsDir = android.os.Environment.getExternalStoragePublicDirectory(
                android.os.Environment.DIRECTORY_DOWNLOADS)
            val dir = File(downloadsDir, "FlowLink")
            dir.mkdirs()
            val file = File(dir, msg.fileName ?: "flowlink-file")
            file.writeBytes(bytes)
            val uri = FileProvider.getUriForFile(ctx, "${BuildConfig.APPLICATION_ID}.fileprovider", file)
            val intent = Intent(Intent.ACTION_VIEW).apply {
                setDataAndType(uri, msg.fileType ?: "*/*")
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            startActivity(Intent.createChooser(intent, "Open ${msg.fileName}"))
            Toast.makeText(ctx, "Saved to Downloads/FlowLink", Toast.LENGTH_SHORT).show()
        } catch (e: Exception) {
            Toast.makeText(ctx, "Download failed: ${e.message}", Toast.LENGTH_SHORT).show()
        }
    }

    private fun sendTypingState(isTyping: Boolean) {
        val mainActivity = activity as? MainActivity ?: return
        val selfId = sessionManager?.getDeviceId().orEmpty()
        val target = mainActivity.webSocketManager.sessionDevices.value
            .firstOrNull { it.id != selfId } ?: return
        chatTypingStopRunnable?.let { binding.etChatInput.removeCallbacks(it) }
        mainActivity.webSocketManager.sendChatTyping(target.id, isTyping)
        if (isTyping) {
            val stop = Runnable { mainActivity.webSocketManager.sendChatTyping(target.id, false) }
            chatTypingStopRunnable = stop
            binding.etChatInput.postDelayed(stop, 1400)
        }
    }

    private fun renderTypingIndicator() {
        val selfId = sessionManager?.getDeviceId().orEmpty()
        val devices = (activity as? MainActivity)?.webSocketManager?.sessionDevices?.value ?: emptyList()
        val typingDevice = devices.firstOrNull { it.id != selfId && typingByDevice[it.id] == true }
        typingIndicatorRunnable?.let { binding.tvChatTyping.removeCallbacks(it) }
        typingIndicatorRunnable = null
        if (typingDevice == null) { binding.tvChatTyping.visibility = View.GONE; return }
        val dotCount = ((System.currentTimeMillis() / 350L) % 3L).toInt() + 1
        binding.tvChatTyping.text = "${typingDevice.name} is typing${".".repeat(dotCount)}"
        binding.tvChatTyping.visibility = View.VISIBLE
        val loop = Runnable { renderTypingIndicator() }
        typingIndicatorRunnable = loop
        binding.tvChatTyping.postDelayed(loop, 350)
    }

    private fun startVoiceRecording() {
        if (isRecording) return
        try {
            val file = File(requireContext().cacheDir, "voice_${System.currentTimeMillis()}.m4a")
            voiceFile = file
            @Suppress("DEPRECATION")
            val recorder = if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.S) {
                MediaRecorder(requireContext())
            } else {
                MediaRecorder()
            }
            recorder.setAudioSource(MediaRecorder.AudioSource.MIC)
            recorder.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
            recorder.setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
            recorder.setOutputFile(file.absolutePath)
            recorder.prepare()
            recorder.start()
            mediaRecorder = recorder
            isRecording = true
            binding.btnVoice.setBackgroundResource(R.drawable.btn_danger_bg)
            Toast.makeText(requireContext(), "🎙 Recording…", Toast.LENGTH_SHORT).show()
        } catch (e: Exception) {
            Toast.makeText(requireContext(), "Recording failed: ${e.message}", Toast.LENGTH_SHORT).show()
        }
    }

    private fun stopVoiceRecordingAndSend() {
        if (!isRecording) return
        try {
            mediaRecorder?.stop()
            mediaRecorder?.release()
            mediaRecorder = null
            isRecording = false
            binding.btnVoice.setBackgroundResource(R.drawable.glass_card_bg_dark)

            val file = voiceFile ?: return
            if (!file.exists() || file.length() < 100) {
                Toast.makeText(requireContext(), "Recording too short", Toast.LENGTH_SHORT).show()
                file.delete()
                return
            }

            val mainActivity = activity as? MainActivity ?: return
            val selfId = sessionManager?.getDeviceId() ?: return

            // Read file and send on IO thread to avoid blocking UI
            viewLifecycleOwner.lifecycleScope.launch(kotlinx.coroutines.Dispatchers.IO) {
                try {
                    val bytes = file.readBytes()
                    val base64 = android.util.Base64.encodeToString(bytes, android.util.Base64.NO_WRAP)
                    val messageId = "mob-voice-${System.currentTimeMillis()}"
                    val name = "voice_${System.currentTimeMillis()}.m4a"
                    val fileSize = file.length()
                    file.delete()

                    kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.Main) {
                        val msg = ChatMessage(
                            messageId = messageId, text = "🎙 Voice message",
                            username = sessionManager?.getUsername().orEmpty(),
                            sourceDevice = selfId, targetDevice = "",
                            sentAt = System.currentTimeMillis(), delivered = false, seen = false,
                            fileId = messageId, fileName = name, fileType = "audio/mp4",
                            fileSize = fileSize, fileData = base64
                        )
                        chatMessages.add(msg)
                        chatAdapter?.notifyItemInserted(chatMessages.size - 1)
                        binding.rvChatMessages.scrollToPosition(chatMessages.size - 1)
                        Toast.makeText(requireContext(), "Voice message sent", Toast.LENGTH_SHORT).show()
                    }

                    mainActivity.webSocketManager.sessionDevices.value
                        .filter { it.id != selfId }
                        .forEach { device ->
                            mainActivity.webSocketManager.sendChatFile(
                                device.id, messageId, name, "audio/mp4", fileSize, base64
                            )
                        }
                } catch (e: Exception) {
                    kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.Main) {
                        Toast.makeText(requireContext(), "Failed to send voice: ${e.message}", Toast.LENGTH_SHORT).show()
                    }
                }
            }
        } catch (e: Exception) {
            Toast.makeText(requireContext(), "Failed to send voice: ${e.message}", Toast.LENGTH_SHORT).show()
        }
    }

    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }
}
