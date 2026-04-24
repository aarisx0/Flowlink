package com.flowlink.app.ui

import android.net.Uri
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.ImageButton
import android.widget.TextView
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.fragment.app.Fragment
import androidx.lifecycle.lifecycleScope
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.flowlink.app.MainActivity
import com.flowlink.app.R
import com.flowlink.app.databinding.FragmentFilesBinding
import com.flowlink.app.service.SessionManager
import com.flowlink.app.service.WebSocketManager
import kotlinx.coroutines.launch

class FilesFragment : Fragment() {
    private var _binding: FragmentFilesBinding? = null
    private val binding get() = _binding!!
    private var sessionManager: SessionManager? = null
    private var studyPage = 1
    private var studyFiles = listOf<WebSocketManager.StudyFile>()
    private var filesAdapter: StudyFilesAdapter? = null

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
            mainActivity.webSocketManager.uploadStudyFile(uri, name, type, size)
            Toast.makeText(ctx, "Uploading $name to study store", Toast.LENGTH_SHORT).show()
        } catch (e: Exception) {
            Toast.makeText(ctx, "Failed: ${e.message}", Toast.LENGTH_SHORT).show()
        }
    }

    companion object {
        fun newInstance() = FilesFragment()
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        sessionManager = SessionManager(requireContext())
    }

    override fun onCreateView(inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?): View {
        _binding = FragmentFilesBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        val mainActivity = activity as? MainActivity ?: return

        binding.rvFiles.layoutManager = LinearLayoutManager(requireContext())
        filesAdapter = StudyFilesAdapter(
            files = mutableListOf(),
            isHost = sessionManager?.getDeviceId() == mainActivity.webSocketManager.sessionDevices.value.firstOrNull()?.id,
            onOpen = { file -> mainActivity.webSocketManager.sendStudySync("open", file.id) },
            onDelete = { file ->
                mainActivity.webSocketManager.deleteStudyFile(file.id)
                Toast.makeText(requireContext(), "Deleted ${file.name}", Toast.LENGTH_SHORT).show()
            }
        )
        binding.rvFiles.adapter = filesAdapter

        binding.btnSelectFiles.setOnClickListener {
            pickFileLauncher.launch(arrayOf("*/*"))
        }

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

        viewLifecycleOwner.lifecycleScope.launch {
            mainActivity.webSocketManager.studyStore.collect { files ->
                studyFiles = files
                filesAdapter?.setFiles(files)
                binding.tvFilesSubtitle.text = "${files.size} file(s) shared"
                // Update home fragment file count
                (parentFragmentManager.findFragmentByTag("home") as? HomeFragment)
                    ?.updateFileCount(files.size)
            }
        }

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
        updateStudyStatus()
    }

    private fun updateStudyStatus() {
        binding.tvStudyStatus.text = "Page $studyPage"
        binding.tvSyncInfo.text = "Synced with all devices"
    }

    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }
}

class StudyFilesAdapter(
    private val files: MutableList<WebSocketManager.StudyFile>,
    private val isHost: Boolean,
    private val onOpen: (WebSocketManager.StudyFile) -> Unit,
    private val onDelete: (WebSocketManager.StudyFile) -> Unit
) : RecyclerView.Adapter<StudyFilesAdapter.FileViewHolder>() {

    class FileViewHolder(itemView: View) : RecyclerView.ViewHolder(itemView) {
        val tvFileIcon: TextView = itemView.findViewById(R.id.tv_file_icon)
        val tvFileName: TextView = itemView.findViewById(R.id.tv_file_name)
        val tvFileSize: TextView = itemView.findViewById(R.id.tv_file_size)
        val btnOpen: ImageButton = itemView.findViewById(R.id.btn_open_file)
        val btnDelete: ImageButton = itemView.findViewById(R.id.btn_delete_file)
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): FileViewHolder {
        val view = LayoutInflater.from(parent.context).inflate(R.layout.item_study_file, parent, false)
        return FileViewHolder(view)
    }

    override fun onBindViewHolder(holder: FileViewHolder, position: Int) {
        val file = files[position]
        holder.tvFileName.text = file.name
        holder.tvFileSize.text = "${maxOf(1, file.size / 1024)} KB"
        holder.tvFileIcon.text = when {
            file.name.endsWith(".pdf", true) -> "📄"
            file.name.endsWith(".jpg", true) || file.name.endsWith(".png", true) -> "🖼️"
            file.name.endsWith(".mp4", true) || file.name.endsWith(".mov", true) -> "🎬"
            file.name.endsWith(".mp3", true) || file.name.endsWith(".wav", true) -> "🎵"
            else -> "📁"
        }
        holder.btnOpen.setOnClickListener { onOpen(file) }
        holder.btnDelete.visibility = if (isHost) View.VISIBLE else View.GONE
        holder.btnDelete.setOnClickListener { onDelete(file) }
    }

    override fun getItemCount() = files.size

    fun setFiles(newFiles: List<WebSocketManager.StudyFile>) {
        files.clear()
        files.addAll(newFiles)
        notifyDataSetChanged()
    }
}
