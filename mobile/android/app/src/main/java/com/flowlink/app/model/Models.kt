package com.flowlink.app.model

/**
 * Data models for FlowLink Android app
 */

data class Session(
    val sessionId: String,
    val code: String,
    val createdBy: String,
    val createdAt: Long,
    val expiresAt: Long
)

data class Device(
    val id: String,
    val name: String,
    val type: String,
    val online: Boolean,
    val permissions: Map<String, Boolean> = emptyMap(),
    val joinedAt: Long = System.currentTimeMillis(),
    val lastSeen: Long = System.currentTimeMillis()
)

data class Intent(
    val intentType: String,
    val payload: Map<String, String>?,
    val targetDevice: String,
    val sourceDevice: String,
    val autoOpen: Boolean,
    val timestamp: Long
)

data class TransferStatus(
    val fileName: String,
    val direction: String,
    val progress: Int,
    val totalBytes: Long,
    val transferredBytes: Long,
    val speedBytesPerSec: Long,
    val etaSeconds: Int,
    val startedAt: Long,
    val completed: Boolean = false
)

data class ChatMessage(
    val messageId: String,
    val text: String,
    val username: String,
    val sourceDevice: String,
    val targetDevice: String,
    val sentAt: Long,
    val delivered: Boolean = false,
    val seen: Boolean = false
)

