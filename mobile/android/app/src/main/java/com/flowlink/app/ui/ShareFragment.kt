package com.flowlink.app.ui

import android.content.ClipboardManager
import android.content.Context
import android.net.Uri
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.fragment.app.Fragment
import androidx.lifecycle.lifecycleScope
import androidx.recyclerview.widget.LinearLayoutManager
import com.flowlink.app.MainActivity
import com.flowlink.app.databinding.FragmentShareBinding
import com.flowlink.app.model.Device
import com.flowlink.app.model.Intent as FlowIntent
import com.flowlink.app.model.TransferStatus
import com.flowlink.app.service.SessionManager
import kotlinx.coroutines.launch
import org.json.JSONObject

class ShareFragment : Fragment() {
    private var _binding: FragmentShareBinding? = null
    private val binding get() = _binding!!
    private var sessionManager: SessionManager? = null
    private val connectedDevices = mutableMapOf<String, Device>()
    private val transferStatuses = mutableMapOf<String, TransferStatus>()
    private var deviceAdapter: DeviceTileAdapter? = null
    private var pendingFileTargetDeviceId: String? = null
    private val transferClearRunnables = mutableMapOf<String, Runnable>()

    private val pickFileLauncher = registerForActivityResult(ActivityResultContracts.OpenDocument()) { uri: Uri? ->
        val targetId = pendingFileTargetDeviceId
        pendingFileTargetDeviceId = null
        uri ?: return@registerForActivityResult
        targetId ?: return@registerForActivityResult
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
            mainActivity.webSocketManager.sendFileUri(targetId, uri, name, type, size)
            Toast.makeText(ctx, "Sending $name", Toast.LENGTH_SHORT).show()
        } catch (e: Exception) {
            Toast.makeText(ctx, "Failed: ${e.message}", Toast.LENGTH_SHORT).show()
        }
    }

    companion object {
        fun newInstance() = ShareFragment()
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        sessionManager = SessionManager(requireContext())
    }

    override fun onCreateView(inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?): View {
        _binding = FragmentShareBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        val mainActivity = activity as? MainActivity ?: return

        binding.rvDevices.layoutManager = LinearLayoutManager(requireContext())
        deviceAdapter = DeviceTileAdapter(
            devices = mutableListOf(),
            onDeviceClick = { device -> handleDeviceTileClick(device) },
            onBrowseFilesClick = { device -> triggerFilePicker(device.id) },
            transferStatuses = transferStatuses
        )
        binding.rvDevices.adapter = deviceAdapter

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
                deviceAdapter?.updateData(connectedDevices.values.toList(), transferStatuses)
            }
        }

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
                deviceAdapter?.updateData(connectedDevices.values.toList(), transferStatuses)
                if (progress.progress >= 100) {
                    val r = Runnable {
                        transferStatuses.remove(targetId)
                        deviceAdapter?.updateData(connectedDevices.values.toList(), transferStatuses)
                        transferClearRunnables.remove(targetId)
                    }
                    transferClearRunnables[targetId]?.let { binding.root.removeCallbacks(it) }
                    transferClearRunnables[targetId] = r
                    binding.root.postDelayed(r, 1500)
                }
            }
        }
    }

    fun triggerFilePicker(deviceId: String) {
        pendingFileTargetDeviceId = deviceId
        pickFileLauncher.launch(arrayOf("*/*"))
    }

    private fun handleDeviceTileClick(device: Device) {
        val ctx = requireContext()
        val mainActivity = activity as? MainActivity ?: return
        try {
            val clipboard = ctx.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
            val text = clipboard.primaryClip?.getItemAt(0)?.coerceToText(ctx)?.toString()?.trim() ?: ""
            if (text.isNotEmpty()) {
                val intent = FlowIntent(
                    intentType = "clipboard_sync",
                    payload = mapOf("clipboard" to JSONObject().apply { put("text", text) }.toString()),
                    targetDevice = device.id,
                    sourceDevice = sessionManager?.getDeviceId() ?: "",
                    autoOpen = true,
                    timestamp = System.currentTimeMillis()
                )
                mainActivity.webSocketManager.sendIntent(intent, device.id)
                Toast.makeText(ctx, "Sent clipboard to ${device.name}", Toast.LENGTH_SHORT).show()
            } else {
                Toast.makeText(ctx, "Clipboard empty. Use Select Files.", Toast.LENGTH_SHORT).show()
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
