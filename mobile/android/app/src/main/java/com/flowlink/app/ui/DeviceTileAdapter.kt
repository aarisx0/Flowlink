package com.flowlink.app.ui

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.ProgressBar
import android.widget.TextView
import androidx.recyclerview.widget.RecyclerView
import com.flowlink.app.R
import com.flowlink.app.model.Device
import com.flowlink.app.model.TransferStatus

class DeviceTileAdapter(
    private val devices: List<Device>,
    private val onDeviceClick: (Device) -> Unit,
    private val onBrowseFilesClick: (Device) -> Unit,
    private val transferStatuses: Map<String, TransferStatus> = emptyMap()
) : RecyclerView.Adapter<DeviceTileAdapter.DeviceViewHolder>() {

    class DeviceViewHolder(itemView: View) : RecyclerView.ViewHolder(itemView) {
        val deviceName: TextView = itemView.findViewById(R.id.device_name)
        val deviceType: TextView = itemView.findViewById(R.id.device_type)
        val deviceStatus: TextView = itemView.findViewById(R.id.device_status)
        val devicePermissions: TextView = itemView.findViewById(R.id.device_permissions)
        val transferStatusContainer: View = itemView.findViewById(R.id.transfer_status_container)
        val transferStatusText: TextView = itemView.findViewById(R.id.tv_transfer_status)
        val transferStatusPercent: TextView = itemView.findViewById(R.id.tv_transfer_percent)
        val transferProgressBar: ProgressBar = itemView.findViewById(R.id.transfer_progress_bar)
        val transferMeta: TextView = itemView.findViewById(R.id.tv_transfer_meta)
        val btnBrowseFiles: Button = itemView.findViewById(R.id.btn_browse_files)
        val tvTapHint: TextView = itemView.findViewById(R.id.tv_tap_hint)
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): DeviceViewHolder {
        val view = LayoutInflater.from(parent.context)
            .inflate(R.layout.item_device_tile, parent, false)
        return DeviceViewHolder(view)
    }

    override fun onBindViewHolder(holder: DeviceViewHolder, position: Int) {
        val device = devices[position]
        holder.deviceName.text = device.name
        holder.deviceType.text = device.type
        
        holder.deviceStatus.text = if (device.online) "Online" else "Offline"
        holder.deviceStatus.setTextColor(
            if (device.online) {
                android.graphics.Color.parseColor("#4CAF50")
            } else {
                android.graphics.Color.parseColor("#999999")
            }
        )
        
        // Show permissions
        val permissionList = mutableListOf<String>()
        device.permissions.forEach { (key, value) ->
            if (value) {
                permissionList.add(key.replace("_", " ").replaceFirstChar { it.uppercaseChar() })
            }
        }
        holder.devicePermissions.text = if (permissionList.isEmpty()) {
            "No permissions"
        } else {
            permissionList.joinToString(", ")
        }

        // Enable/disable buttons based on device status
        val isOnline = device.online
        holder.btnBrowseFiles.isEnabled = isOnline
        holder.btnBrowseFiles.alpha = if (isOnline) 1.0f else 0.5f

        // Update hint text based on device status
        holder.tvTapHint.text = if (isOnline) {
            "Tap tile to send clipboard"
        } else {
            "Device offline"
        }
        holder.tvTapHint.setTextColor(
            if (isOnline) {
                android.graphics.Color.parseColor("#666666")
            } else {
                android.graphics.Color.parseColor("#999999")
            }
        )

        val transferStatus = transferStatuses[device.id]
        if (transferStatus != null) {
            holder.transferStatusContainer.visibility = View.VISIBLE
            holder.transferStatusText.text = if (transferStatus.direction == "sending") {
                "Sending ${transferStatus.fileName}"
            } else {
                "Receiving ${transferStatus.fileName}"
            }
            holder.transferStatusPercent.text = "${transferStatus.progress.coerceIn(0, 100)}%"
            holder.transferProgressBar.progress = transferStatus.progress.coerceIn(0, 100)
            holder.transferMeta.text = "${formatBytes(transferStatus.transferredBytes)} / ${formatBytes(transferStatus.totalBytes)} · ${formatBytes(transferStatus.speedBytesPerSec)}/s · ETA ${formatDuration(transferStatus.etaSeconds)}"
        } else {
            holder.transferStatusContainer.visibility = View.GONE
        }

        // When a device tile is tapped, send clipboard content (URL/text)
        holder.itemView.setOnClickListener {
            if (isOnline) {
                onDeviceClick(device)
            }
        }

        // When browse files button is clicked, open file picker
        holder.btnBrowseFiles.setOnClickListener {
            if (isOnline) {
                onBrowseFilesClick(device)
            }
        }
    }

    override fun getItemCount(): Int = devices.size

    private fun formatBytes(bytes: Long): String {
        if (bytes <= 0) return "0 B"
        val units = arrayOf("B", "KB", "MB", "GB")
        var size = bytes.toDouble()
        var unitIndex = 0
        while (size >= 1024 && unitIndex < units.lastIndex) {
            size /= 1024
            unitIndex++
        }
        val formatted = if (size >= 10 || unitIndex == 0) size.toInt().toString() else String.format("%.1f", size)
        return "$formatted ${units[unitIndex]}"
    }

    private fun formatDuration(seconds: Int): String {
        val total = seconds.coerceAtLeast(0)
        val mins = total / 60
        val secs = total % 60
        return String.format("%02d:%02d", mins, secs)
    }
}
