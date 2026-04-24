package com.flowlink.app.ui

import android.net.Uri
import android.os.Bundle
import android.text.Editable
import android.text.TextWatcher
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.fragment.app.Fragment
import androidx.lifecycle.lifecycleScope
import androidx.recyclerview.widget.LinearLayoutManager
import com.flowlink.app.MainActivity
import com.flowlink.app.databinding.FragmentChatBinding
import com.flowlink.app.model.ChatMessage
import com.flowlink.app.service.SessionManager
import com.flowlink.app.service.WebSocketManager
import kotlinx.coroutines.launch
import org.json.JSONObject

class ChatFragment : Fragment() {
    private var _binding: FragmentChatBinding? = null
    private val binding get() = _binding!!
    private var sessionManager: SessionManager? = null
    private val chatMessages = mutableListOf<ChatMessage>()
    private var chatAdapter: ChatMessageAdapter? = null
    private val typingByDevice = mutableMapOf<String, Boolean>()
    private var chatTypingStopRunnable: Runnable? = null
    private var typingIndicatorRunnable: Runnable? = null
    private var unreadCount = 0

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
            // Send to all online devices in session
            val mainAct = activity as? MainActivity ?: return@registerForActivityResult
            val selfId = sessionManager?.getDeviceId() ?: return@registerForActivityResult
            mainAct.webSocketManager.sessionDevices.value
                .filter { it.id != selfId }
                .forEach { device ->
                    mainAct.webSocketManager.sendFileUri(device.id, uri, name, type, size)
                }
            Toast.makeText(ctx, "Sending $name to all devices", Toast.LENGTH_SHORT).show()
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

        // Setup RecyclerView
        val layoutManager = LinearLayoutManager(requireContext()).apply { stackFromEnd = true }
        binding.rvChatMessages.layoutManager = layoutManager
        chatAdapter = ChatMessageAdapter(chatMessages, selfId)
        binding.rvChatMessages.adapter = chatAdapter

        // Subtitle
        val code = sessionManager?.getCurrentSessionCode()
        binding.tvChatSubtitle.text = "Session: ${code ?: "N/A"}"

        // Send button
        binding.btnSendChat.setOnClickListener { sendChatMessage() }

        // Attach button
        binding.btnAttach.setOnClickListener {
            pickFileLauncher.launch(arrayOf("*/*"))
        }

        // Typing indicator
        binding.etChatInput.addTextChangedListener(object : TextWatcher {
            override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) = Unit
            override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) = Unit
            override fun afterTextChanged(s: Editable?) {
                sendTypingState(s?.toString().orEmpty().isNotBlank())
            }
        })

        // Observe chat events
        viewLifecycleOwner.lifecycleScope.launch {
            mainActivity.webSocketManager.chatEvents.collect { event ->
                when (event) {
                    is WebSocketManager.ChatEvent.Message -> {
                        val msg = ChatMessage(
                            messageId = event.messageId, text = event.text,
                            username = event.username, sourceDevice = event.sourceDevice,
                            targetDevice = event.targetDevice, sentAt = event.sentAt,
                            delivered = true, seen = true
                        )
                        chatMessages.add(msg)
                        chatAdapter?.notifyItemInserted(chatMessages.size - 1)
                        binding.rvChatMessages.scrollToPosition(chatMessages.size - 1)
                        mainActivity.webSocketManager.sendChatReceipt("chat_seen", event.messageId, event.sourceDevice)
                        // Notify home fragment of message count
                        (parentFragmentManager.findFragmentByTag("home") as? HomeFragment)
                            ?.updateMessageCount(chatMessages.size)
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
            sentAt = System.currentTimeMillis(), delivered = false, seen = false
        )
        chatMessages.add(msg)
        chatAdapter?.notifyItemInserted(chatMessages.size - 1)
        binding.rvChatMessages.scrollToPosition(chatMessages.size - 1)
        binding.etChatInput.setText("")
        sendTypingState(false)
        mainActivity.webSocketManager.sendChatMessage(target.id, messageId, text)
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

        if (typingDevice == null) {
            binding.tvChatTyping.visibility = View.GONE
            return
        }
        val dotCount = ((System.currentTimeMillis() / 350L) % 3L).toInt() + 1
        binding.tvChatTyping.text = "${typingDevice.name} is typing${".".repeat(dotCount)}"
        binding.tvChatTyping.visibility = View.VISIBLE
        val loop = Runnable { renderTypingIndicator() }
        typingIndicatorRunnable = loop
        binding.tvChatTyping.postDelayed(loop, 350)
    }

    fun getUnreadCount() = unreadCount

    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }
}
