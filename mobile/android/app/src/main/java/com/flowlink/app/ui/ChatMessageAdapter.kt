package com.flowlink.app.ui

import android.view.Gravity
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import androidx.recyclerview.widget.RecyclerView
import com.flowlink.app.R
import com.flowlink.app.model.ChatMessage
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

class ChatMessageAdapter(
    private val messages: MutableList<ChatMessage>,
    private val selfDeviceId: String
) : RecyclerView.Adapter<ChatMessageAdapter.MessageViewHolder>() {

    private val timeFormatter = SimpleDateFormat("HH:mm", Locale.getDefault())

    class MessageViewHolder(itemView: View) : RecyclerView.ViewHolder(itemView) {
        val tvSenderName: TextView = itemView.findViewById(R.id.tv_sender_name)
        val bubbleContainer: FrameLayout = itemView.findViewById(R.id.bubble_container)
        val bubble: LinearLayout = itemView.findViewById(R.id.bubble)
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

        holder.tvMessageText.text = msg.text
        holder.tvMessageTime.text = timeFormatter.format(Date(msg.sentAt))

        if (isSelf) {
            // Right-aligned self bubble
            holder.rootLayout.gravity = Gravity.END
            holder.tvSenderName.visibility = View.GONE
            holder.bubble.setBackgroundResource(R.drawable.chat_bubble_self)
            holder.tvMessageText.setTextColor(android.graphics.Color.WHITE)
            holder.tvTicks.visibility = View.VISIBLE
            holder.tvTicks.text = when {
                msg.seen -> "✓✓"
                msg.delivered -> "✓✓"
                else -> "✓"
            }
            holder.tvTicks.setTextColor(
                if (msg.seen) android.graphics.Color.parseColor("#60A5FA")
                else android.graphics.Color.parseColor("#AAFFFFFF")
            )
        } else {
            // Left-aligned incoming bubble
            holder.rootLayout.gravity = Gravity.START
            holder.tvSenderName.visibility = View.VISIBLE
            holder.tvSenderName.text = msg.username
            holder.bubble.setBackgroundResource(R.drawable.chat_bubble_other)
            holder.tvMessageText.setTextColor(android.graphics.Color.WHITE)
            holder.tvTicks.visibility = View.GONE
        }
    }

    override fun getItemCount(): Int = messages.size

    fun addMessage(msg: ChatMessage) {
        messages.add(msg)
        notifyItemInserted(messages.size - 1)
    }

    fun updateMessage(messageId: String, delivered: Boolean, seen: Boolean) {
        val index = messages.indexOfFirst { it.messageId == messageId }
        if (index >= 0) {
            messages[index] = messages[index].copy(delivered = delivered, seen = seen)
            notifyItemChanged(index)
        }
    }

    fun setMessages(newMessages: List<ChatMessage>) {
        messages.clear()
        messages.addAll(newMessages)
        notifyDataSetChanged()
    }
}
