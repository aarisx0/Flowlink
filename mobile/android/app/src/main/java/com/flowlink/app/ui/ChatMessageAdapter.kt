package com.flowlink.app.ui

import android.graphics.Color
import android.view.Gravity
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import androidx.recyclerview.widget.ItemTouchHelper
import androidx.recyclerview.widget.RecyclerView
import com.flowlink.app.R
import com.flowlink.app.model.ChatMessage
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

class ChatMessageAdapter(
    private val messages: MutableList<ChatMessage>,
    private val selfDeviceId: String,
    private val onReply: (ChatMessage) -> Unit = {},
    private val onFileDownload: (ChatMessage) -> Unit = {}
) : RecyclerView.Adapter<ChatMessageAdapter.MessageViewHolder>() {

    private val timeFormatter = SimpleDateFormat("HH:mm", Locale.getDefault())

    class MessageViewHolder(itemView: View) : RecyclerView.ViewHolder(itemView) {
        val tvSenderName: TextView = itemView.findViewById(R.id.tv_sender_name)
        val bubbleContainer: FrameLayout = itemView.findViewById(R.id.bubble_container)
        val bubble: LinearLayout = itemView.findViewById(R.id.bubble)
        val replyStrip: LinearLayout = itemView.findViewById(R.id.reply_strip)
        val tvReplyPreview: TextView = itemView.findViewById(R.id.tv_reply_preview)
        // File card
        val fileCard: LinearLayout = itemView.findViewById(R.id.file_card)
        val tvFileTypeBadge: TextView = itemView.findViewById(R.id.tv_file_type_badge)
        val tvFileNameBubble: TextView = itemView.findViewById(R.id.tv_file_name_bubble)
        val tvFileMetaBubble: TextView = itemView.findViewById(R.id.tv_file_meta_bubble)
        val btnFileDownload: FrameLayout = itemView.findViewById(R.id.btn_file_download)
        // Text
        val tvMessageText: TextView = itemView.findViewById(R.id.tv_message_text)
        val tvMessageTime: TextView = itemView.findViewById(R.id.tv_message_time)
        val tvTicks: TextView = itemView.findViewById(R.id.tv_ticks)
        val rootLayout: LinearLayout = itemView as LinearLayout
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): MessageViewHolder {
        val view = LayoutInflater.from(parent.context)
            .inflate(R.layout.item_chat_message, parent, false)
        return MessageViewHolder(view)
    }

    override fun onBindViewHolder(holder: MessageViewHolder, position: Int) {
        val msg = messages[position]
        val isSelf = msg.sourceDevice == selfDeviceId

        // Reply strip
        if (msg.replyToId != null && msg.replyToText != null) {
            holder.replyStrip.visibility = View.VISIBLE
            holder.tvReplyPreview.text = "${msg.replyToUsername ?: "User"}: ${msg.replyToText.take(60)}"
        } else {
            holder.replyStrip.visibility = View.GONE
        }

        // File or text
        if (msg.fileId != null && msg.fileName != null) {
            holder.fileCard.visibility = View.VISIBLE
            holder.tvMessageText.visibility = View.GONE
            val ext = msg.fileName.substringAfterLast('.', "").uppercase().take(4)
            holder.tvFileTypeBadge.text = ext.ifEmpty { "FILE" }
            holder.tvFileNameBubble.text = msg.fileName
            val sizeStr = if (msg.fileSize > 0) " · ${formatBytes(msg.fileSize)}" else ""
            val typeLabel = when {
                msg.fileType?.startsWith("image") == true -> "Image"
                msg.fileType?.startsWith("video") == true -> "Video"
                msg.fileType?.startsWith("audio") == true -> "Audio"
                else -> ext.ifEmpty { "File" }
            }
            holder.tvFileMetaBubble.text = "$typeLabel$sizeStr"
            holder.btnFileDownload.setOnClickListener { onFileDownload(msg) }
        } else {
            holder.fileCard.visibility = View.GONE
            holder.tvMessageText.visibility = View.VISIBLE
            holder.tvMessageText.text = msg.text
        }

        holder.tvMessageTime.text = timeFormatter.format(Date(msg.sentAt))

        if (isSelf) {
            holder.rootLayout.gravity = Gravity.END
            holder.tvSenderName.visibility = View.GONE
            holder.bubble.setBackgroundResource(R.drawable.chat_bubble_self)
            holder.tvMessageText.setTextColor(Color.WHITE)
            holder.tvTicks.visibility = View.VISIBLE
            // ✓ = sent, ✓✓ grey = delivered, ✓✓ blue = seen
            holder.tvTicks.text = when {
                msg.seen -> "✓✓"
                msg.delivered -> "✓✓"
                else -> "✓"
            }
            holder.tvTicks.setTextColor(
                if (msg.seen) Color.parseColor("#60A5FA")   // blue ticks
                else Color.parseColor("#AAFFFFFF")           // grey ticks
            )
        } else {
            holder.rootLayout.gravity = Gravity.START
            holder.tvSenderName.visibility = View.VISIBLE
            holder.tvSenderName.text = msg.username
            holder.bubble.setBackgroundResource(R.drawable.chat_bubble_other)
            holder.tvMessageText.setTextColor(Color.WHITE)
            holder.tvTicks.visibility = View.GONE
        }

        // Long press to reply
        holder.bubble.setOnLongClickListener {
            onReply(msg)
            true
        }
    }

    override fun getItemCount(): Int = messages.size

    fun updateMessage(messageId: String, delivered: Boolean, seen: Boolean) {
        val index = messages.indexOfFirst { it.messageId == messageId }
        if (index >= 0) {
            messages[index] = messages[index].copy(delivered = delivered, seen = seen)
            notifyItemChanged(index)
        }
    }

    /** Attach swipe-to-reply gesture to the RecyclerView */
    fun attachSwipeToReply(recyclerView: RecyclerView) {
        val callback = object : ItemTouchHelper.SimpleCallback(0, ItemTouchHelper.RIGHT) {
            override fun onMove(rv: RecyclerView, vh: RecyclerView.ViewHolder, t: RecyclerView.ViewHolder) = false
            override fun onSwiped(viewHolder: RecyclerView.ViewHolder, direction: Int) {
                val pos = viewHolder.adapterPosition
                if (pos != RecyclerView.NO_ID.toInt() && pos < messages.size) {
                    onReply(messages[pos])
                }
                notifyItemChanged(pos) // reset swipe
            }
            override fun getSwipeThreshold(viewHolder: RecyclerView.ViewHolder) = 0.3f
        }
        ItemTouchHelper(callback).attachToRecyclerView(recyclerView)
    }

    private fun formatBytes(bytes: Long): String {
        if (bytes <= 0) return "0 B"
        val units = arrayOf("B", "KB", "MB", "GB")
        var size = bytes.toDouble(); var i = 0
        while (size >= 1024 && i < units.lastIndex) { size /= 1024; i++ }
        return "${if (size >= 10 || i == 0) size.toInt() else String.format("%.1f", size)} ${units[i]}"
    }
}
