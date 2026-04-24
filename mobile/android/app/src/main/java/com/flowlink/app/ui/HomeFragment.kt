package com.flowlink.app.ui

import android.animation.ObjectAnimator
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Toast
import androidx.fragment.app.Fragment
import androidx.lifecycle.lifecycleScope
import androidx.recyclerview.widget.LinearLayoutManager
import com.flowlink.app.MainActivity
import com.flowlink.app.databinding.FragmentHomeBinding
import com.flowlink.app.model.Device
import com.flowlink.app.model.TransferStatus
import com.flowlink.app.service.SessionManager
import com.flowlink.app.service.WebSocketManager
import kotlinx.coroutines.launch

class HomeFragment : Fragment() {
    private var _binding: FragmentHomeBinding? = null
    private val binding get() = _binding!!
    private var sessionManager: SessionManager? = null
    private val connectedDevices = mutableMapOf<String, Device>()
    private val transferStatuses = mutableMapOf<String, TransferStatus>()
    private var deviceAdapter: DeviceTileAdapter? = null
    private var studyPage = 1
    private var isDrawerOpen = false
    private val transferClearRunnables = mutableMapOf<String, Runnable>()

    companion object {
        fun newInstance() = HomeFragment()
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        sessionManager = SessionManager(requireContext())
    }

    override fun onCreateView(inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?): View {
        _binding = FragmentHomeBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        val mainActivity = activity as? MainActivity ?: return

        // Session code
        val code = sessionManager?.getCurrentSessionCode()
        binding.tvSessionCode.text = code ?: "------"

        // Hamburger drawer
        binding.btnHamburger.setOnClickListener { toggleDrawer() }
        binding.drawerOverlay.setOnClickListener { closeDrawer() }
        binding.drawerLeaveSession.setOnClickListener {
            closeDrawer()
            mainActivity.leaveSession()
        }
        binding.drawerSessionDetails.setOnClickListener {
            closeDrawer()
            Toast.makeText(requireContext(), "Session: ${code ?: "N/A"}", Toast.LENGTH_SHORT).show()
        }
        binding.drawerPermissions.setOnClickListener {
            closeDrawer()
            Toast.makeText(requireContext(), "Permissions coming soon", Toast.LENGTH_SHORT).show()
        }
        binding.drawerSettings.setOnClickListener {
            closeDrawer()
            Toast.makeText(requireContext(), "Settings coming soon", Toast.LENGTH_SHORT).show()
        }
        binding.drawerHelp.setOnClickListener {
            closeDrawer()
            Toast.makeText(requireContext(), "Help & Support coming soon", Toast.LENGTH_SHORT).show()
        }

        // Avatar initial
        val username = sessionManager?.getUsername() ?: "U"
        binding.tvAvatarInitial.text = username.firstOrNull()?.uppercaseChar()?.toString() ?: "U"
        binding.tvDrawerUsername.text = username

        // Invite others
        binding.btnInviteOthers.setOnClickListener {
            showInvitationDialog()
        }

        // Study controls
        binding.btnStudyPrev.setOnClickListener {
            studyPage = maxOf(1, studyPage - 1)
            updateStudyStatus()
            mainActivity.webSocketManager.sendStudySync("page", studyPage)
        }
        binding.btnStudyNext.setOnClickListener {
            studyPage += 1
            updateStudyStatus()
            mainActivity.webSocketManager.sendStudySync("page", studyPage)
        }

        // Setup devices RecyclerView
        binding.rvDevices.layoutManager = LinearLayoutManager(requireContext())
        deviceAdapter = DeviceTileAdapter(
            devices = mutableListOf(),
            onDeviceClick = { device -> (activity as? MainActivity)?.let { handleDeviceTileClick(device, it) } },
            onBrowseFilesClick = { device -> (parentFragment as? ShareFragment)?.triggerFilePicker(device.id)
                ?: (activity as? MainActivity)?.let { /* fallback */ } },
            transferStatuses = transferStatuses
        )
        binding.rvDevices.adapter = deviceAdapter

        // Observe devices
        viewLifecycleOwner.lifecycleScope.launch {
            mainActivity.webSocketManager.sessionDevices.collect { deviceInfos ->
                val selfId = sessionManager?.getDeviceId()
                connectedDevices.clear()
                deviceInfos.filter { it.id != selfId }.forEach { info ->
                    connectedDevices[info.id] = Device(
                        id = info.id, name = info.name, type = info.type, online = true,
                        permissions = emptyMap(), joinedAt = System.currentTimeMillis(),
                        lastSeen = System.currentTimeMillis()
                    )
                }
                updateDeviceList()
                updateStats()
            }
        }

        // Observe file transfer progress
        viewLifecycleOwner.lifecycleScope.launch {
            mainActivity.webSocketManager.fileTransferProgress.collect { progress ->
                val targetId = progress?.deviceId ?: return@collect
                transferStatuses[targetId] = TransferStatus(
                    fileName = progress.fileName, direction = progress.direction,
                    progress = progress.progress, totalBytes = progress.totalBytes,
                    transferredBytes = progress.transferredBytes, speedBytesPerSec = progress.speedBytesPerSec,
                    etaSeconds = progress.etaSeconds, startedAt = progress.startedAt,
                    completed = progress.progress >= 100
                )
                updateDeviceList()
                if (progress.progress >= 100) {
                    val r = Runnable { transferStatuses.remove(targetId); updateDeviceList(); transferClearRunnables.remove(targetId) }
                    transferClearRunnables[targetId]?.let { binding.root.removeCallbacks(it) }
                    transferClearRunnables[targetId] = r
                    binding.root.postDelayed(r, 1500)
                }
            }
        }

        // Observe study store
        viewLifecycleOwner.lifecycleScope.launch {
            mainActivity.webSocketManager.studyStore.collect { files ->
                binding.tvStudyStore.text = if (files.isEmpty()) "No docs in store yet."
                else files.joinToString("\n") { "• ${it.name} (${maxOf(1, it.size / 1024)} KB)" }
            }
        }

        // Observe study sync
        viewLifecycleOwner.lifecycleScope.launch {
            mainActivity.webSocketManager.studySyncEvents.collect { event ->
                if (event.mode == "page") {
                    val page = when (val v = event.value) {
                        is Number -> v.toInt()
                        is String -> v.toIntOrNull() ?: studyPage
                        else -> studyPage
                    }
                    studyPage = maxOf(1, page)
                    updateStudyStatus()
                }
            }
        }

        mainActivity.webSocketManager.requestStudyStore()
        updateStats()
    }

    private fun updateDeviceList() {
        deviceAdapter?.updateData(connectedDevices.values.toList(), transferStatuses)
    }

    private fun updateStats() {
        val online = connectedDevices.values.count { it.online }
        binding.tvStatActive.text = connectedDevices.size.toString()
        binding.tvStatOnline.text = online.toString()
    }

    fun updateMessageCount(count: Int) {
        binding.tvStatMessages.text = count.toString()
    }

    fun updateFileCount(count: Int) {
        binding.tvStatFiles.text = count.toString()
    }

    private fun updateStudyStatus() {
        binding.tvStudyStatus.text = "Page $studyPage"
    }

    private fun toggleDrawer() {
        if (isDrawerOpen) closeDrawer() else openDrawer()
    }

    private fun openDrawer() {
        isDrawerOpen = true
        binding.drawerOverlay.visibility = View.VISIBLE
        binding.drawerOverlay.alpha = 0f
        binding.drawerOverlay.animate().alpha(1f).setDuration(200).start()
        binding.sideDrawer.animate().translationX(0f).setDuration(280).start()
    }

    private fun closeDrawer() {
        isDrawerOpen = false
        binding.drawerOverlay.animate().alpha(0f).setDuration(180)
            .withEndAction { binding.drawerOverlay.visibility = View.GONE }.start()
        binding.sideDrawer.animate().translationX(-binding.sideDrawer.width.toFloat()).setDuration(250).start()
    }

    private fun showInvitationDialog() {
        val dialog = InvitationDialogFragment.newInstance()
        dialog.show(parentFragmentManager, InvitationDialogFragment.TAG)
    }

    private fun handleDeviceTileClick(device: Device, mainActivity: MainActivity) {
        val ctx = requireContext()
        try {
            val clipboard = ctx.getSystemService(android.content.Context.CLIPBOARD_SERVICE) as android.content.ClipboardManager
            val text = clipboard.primaryClip?.getItemAt(0)?.coerceToText(ctx)?.toString()?.trim() ?: ""
            if (text.isNotEmpty()) {
                val intent = com.flowlink.app.model.Intent(
                    intentType = "clipboard_sync",
                    payload = mapOf("clipboard" to org.json.JSONObject().apply { put("text", text) }.toString()),
                    targetDevice = device.id,
                    sourceDevice = sessionManager?.getDeviceId() ?: "",
                    autoOpen = true,
                    timestamp = System.currentTimeMillis()
                )
                mainActivity.webSocketManager.sendIntent(intent, device.id)
                Toast.makeText(ctx, "Sent clipboard to ${device.name}", Toast.LENGTH_SHORT).show()
            } else {
                Toast.makeText(ctx, "Clipboard empty. Use Select Files to send files.", Toast.LENGTH_SHORT).show()
            }
        } catch (e: Exception) {
            Toast.makeText(ctx, "Failed: ${e.message}", Toast.LENGTH_SHORT).show()
        }
    }

    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }
}
