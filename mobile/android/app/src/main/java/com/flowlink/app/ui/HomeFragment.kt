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
import com.flowlink.app.R
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
    private var storeAdapter: HomeStoreAdapter? = null
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

        // Setup store RecyclerView
        binding.rvStoreFiles.layoutManager = LinearLayoutManager(requireContext())
        storeAdapter = HomeStoreAdapter(
            files = mutableListOf(),
            onDownload = { file ->
                if (file.data.isEmpty()) { Toast.makeText(requireContext(), "No data", Toast.LENGTH_SHORT).show(); return@HomeStoreAdapter }
                try {
                    val bytes = android.util.Base64.decode(file.data, android.util.Base64.DEFAULT)
                    val dir = java.io.File(android.os.Environment.getExternalStoragePublicDirectory(android.os.Environment.DIRECTORY_DOWNLOADS), "FlowLink")
                    dir.mkdirs()
                    val outFile = java.io.File(dir, file.name)
                    outFile.writeBytes(bytes)
                    Toast.makeText(requireContext(), "Saved: ${file.name}", Toast.LENGTH_SHORT).show()
                } catch (e: Exception) {
                    Toast.makeText(requireContext(), "Failed: ${e.message}", Toast.LENGTH_SHORT).show()
                }
            }
        )
        binding.rvStoreFiles.adapter = storeAdapter

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

        // Observe study store — show in home as "Store"
        viewLifecycleOwner.lifecycleScope.launch {
            mainActivity.webSocketManager.studyStore.collect { files ->
                if (files.isEmpty()) {
                    binding.tvStudyStore.visibility = View.VISIBLE
                    binding.rvStoreFiles.visibility = View.GONE
                    binding.tvStoreCount.text = "0 files"
                } else {
                    binding.tvStudyStore.visibility = View.GONE
                    binding.rvStoreFiles.visibility = View.VISIBLE
                    binding.tvStoreCount.text = "${files.size} file(s)"
                    storeAdapter?.setFiles(files)
                }
                updateStats()
            }
        }

        // Observe study sync (page changes from Files tab)
        viewLifecycleOwner.lifecycleScope.launch {
            mainActivity.webSocketManager.studySyncEvents.collect { _ -> /* handled in FilesFragment */ }
        }

        mainActivity.webSocketManager.requestStudyStore()
        updateStats()
    }

    private fun updateDeviceList() {
        deviceAdapter?.updateData(connectedDevices.values.toList(), transferStatuses)
    }

    private fun updateStats() {
        binding.tvStatActive.text = connectedDevices.size.toString()
        binding.tvStatOnline.text = connectedDevices.values.count { it.online }.toString()
    }

    fun updateMessageCount(count: Int) {
        binding.tvStatMessages.text = count.toString()
    }

    fun updateFileCount(count: Int) {
        binding.tvStatFiles.text = count.toString()
    }

    private fun updateStudyStatus() {
        // Study status is now managed in FilesFragment
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

// Compact store adapter for Home page
class HomeStoreAdapter(
    private val files: MutableList<WebSocketManager.StudyFile>,
    private val onDownload: (WebSocketManager.StudyFile) -> Unit
) : androidx.recyclerview.widget.RecyclerView.Adapter<HomeStoreAdapter.VH>() {

    class VH(v: View) : androidx.recyclerview.widget.RecyclerView.ViewHolder(v) {
        val tvIcon: android.widget.TextView = v.findViewById(R.id.tv_file_icon)
        val tvName: android.widget.TextView = v.findViewById(R.id.tv_file_name)
        val tvMeta: android.widget.TextView = v.findViewById(R.id.tv_file_meta)
        val btnDownload: android.widget.ImageButton = v.findViewById(R.id.btn_download_file)
        val btnOpen: android.widget.ImageButton = v.findViewById(R.id.btn_open_file)
        val btnDelete: android.widget.ImageButton = v.findViewById(R.id.btn_delete_file)
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int) =
        VH(LayoutInflater.from(parent.context).inflate(R.layout.item_study_file, parent, false))

    override fun onBindViewHolder(holder: VH, position: Int) {
        val file = files[position]
        holder.tvName.text = file.name
        val ext = file.name.substringAfterLast('.', "").uppercase()
        holder.tvMeta.text = if (ext.isNotEmpty()) "$ext · ${maxOf(1, file.size / 1024)} KB" else "${maxOf(1, file.size / 1024)} KB"
        holder.tvIcon.text = when {
            file.name.endsWith(".pdf", true) -> "📄"
            file.name.endsWith(".jpg", true) || file.name.endsWith(".png", true) -> "🖼️"
            file.name.endsWith(".mp4", true) -> "🎬"
            file.name.endsWith(".mp3", true) -> "🎵"
            else -> "📁"
        }
        holder.btnDownload.setOnClickListener { onDownload(file) }
        holder.btnOpen.visibility = View.GONE
        holder.btnDelete.visibility = View.GONE
    }

    override fun getItemCount() = files.size

    fun setFiles(newFiles: List<WebSocketManager.StudyFile>) {
        files.clear(); files.addAll(newFiles); notifyDataSetChanged()
    }
}
