package com.flowlink.app.ui

import android.content.Intent
import android.graphics.BitmapFactory
import android.os.Bundle
import android.util.Base64
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.webkit.WebSettings
import android.widget.Toast
import androidx.core.content.FileProvider
import androidx.fragment.app.Fragment
import androidx.lifecycle.lifecycleScope
import com.flowlink.app.BuildConfig
import com.flowlink.app.MainActivity
import com.flowlink.app.R
import com.flowlink.app.databinding.FragmentFileViewerBinding
import com.flowlink.app.service.WebSocketManager
import kotlinx.coroutines.launch
import java.io.File

class FileViewerFragment : Fragment() {
    private var _binding: FragmentFileViewerBinding? = null
    private val binding get() = _binding!!

    private var fileId: String = ""
    private var fileName: String = ""
    private var fileType: String = ""
    private var fileData: String = ""   // base64
    private var currentPage = 1
    private var isHost = false

    companion object {
        fun newInstance(file: WebSocketManager.StudyFile, isHost: Boolean): FileViewerFragment {
            return FileViewerFragment().apply {
                arguments = Bundle().apply {
                    putString("file_id", file.id)
                    putString("file_name", file.name)
                    putString("file_type", file.type)
                    putString("file_data", file.data)
                    putBoolean("is_host", isHost)
                }
            }
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        fileId = arguments?.getString("file_id") ?: ""
        fileName = arguments?.getString("file_name") ?: ""
        fileType = arguments?.getString("file_type") ?: ""
        fileData = arguments?.getString("file_data") ?: ""
        isHost = arguments?.getBoolean("is_host") ?: false
    }

    override fun onCreateView(inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?): View {
        _binding = FragmentFileViewerBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        val mainActivity = activity as? MainActivity ?: return

        binding.tvFileTitle.text = fileName
        binding.btnBack.setOnClickListener { parentFragmentManager.popBackStack() }
        binding.btnDownload.setOnClickListener { downloadFile() }

        // Page controls (only meaningful for multi-page docs)
        binding.btnPrevPage.setOnClickListener {
            if (currentPage > 1) {
                currentPage--
                updatePageInfo()
                if (isHost) mainActivity.webSocketManager.sendStudySync("page", currentPage)
            }
        }
        binding.btnNextPage.setOnClickListener {
            currentPage++
            updatePageInfo()
            if (isHost) mainActivity.webSocketManager.sendStudySync("page", currentPage)
        }

        // Highlight button
        binding.btnHighlight.setOnClickListener {
            val selected = binding.tvContent.text?.toString()?.take(100) ?: ""
            if (selected.isNotEmpty() && isHost) {
                mainActivity.webSocketManager.sendStudySync("highlight", selected)
                Toast.makeText(requireContext(), "Highlight synced", Toast.LENGTH_SHORT).show()
            }
        }

        // Observe sync events from other devices
        viewLifecycleOwner.lifecycleScope.launch {
            mainActivity.webSocketManager.studySyncEvents.collect { event ->
                when (event.mode) {
                    "page" -> {
                        val page = when (val v = event.value) {
                            is Number -> v.toInt()
                            is String -> v.toIntOrNull() ?: currentPage
                            else -> currentPage
                        }
                        currentPage = maxOf(1, page)
                        updatePageInfo()
                    }
                    "scroll_px" -> {
                        val px = when (val v = event.value) {
                            is Number -> v.toInt()
                            else -> 0
                        }
                        binding.scrollContent.smoothScrollTo(0, px)
                    }
                    "highlight" -> {
                        val text = event.value?.toString() ?: ""
                        binding.tvHighlightInfo.text = "Highlighted: \"${text.take(40)}…\""
                    }
                }
            }
        }

        // Sync scroll position when user scrolls (host only)
        if (isHost) {
            binding.scrollContent.viewTreeObserver.addOnScrollChangedListener {
                val scrollY = binding.scrollContent.scrollY
                mainActivity.webSocketManager.sendStudySync("scroll_px", scrollY)
            }
        }

        renderContent()
        updatePageInfo()

        // Notify others that this file is open
        if (isHost) {
            mainActivity.webSocketManager.sendStudySync("open_pdf", fileId)
        }
    }

    private fun renderContent() {
        if (fileData.isEmpty()) {
            showUnsupported()
            return
        }
        try {
            val bytes = Base64.decode(fileData, Base64.DEFAULT)
            when {
                fileType.startsWith("image/") -> {
                    val bmp = BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
                    binding.ivContent.setImageBitmap(bmp)
                    binding.ivContent.visibility = View.VISIBLE
                }
                fileType == "text/plain" || fileName.endsWith(".txt", true) -> {
                    binding.tvContent.text = String(bytes, Charsets.UTF_8)
                    binding.tvContent.visibility = View.VISIBLE
                }
                fileType == "application/pdf" || fileName.endsWith(".pdf", true) -> {
                    // Render PDF via WebView using data URI
                    val base64Str = android.util.Base64.encodeToString(bytes, android.util.Base64.NO_WRAP)
                    binding.wvContent.settings.apply {
                        javaScriptEnabled = true
                        builtInZoomControls = true
                        displayZoomControls = false
                        loadWithOverviewMode = true
                        useWideViewPort = true
                    }
                    binding.wvContent.loadData(
                        "<html><body style='margin:0;background:#0D0B1E'>" +
                        "<embed src='data:application/pdf;base64,$base64Str' " +
                        "width='100%' height='100%' type='application/pdf'/>" +
                        "</body></html>",
                        "text/html", "base64"
                    )
                    binding.wvContent.visibility = View.VISIBLE
                }
                else -> showUnsupported()
            }
        } catch (e: Exception) {
            showUnsupported()
        }
    }

    private fun showUnsupported() {
        binding.tvUnsupportedName.text = fileName
        binding.llUnsupported.visibility = View.VISIBLE
    }

    private fun updatePageInfo() {
        binding.tvPageInfo.text = "Page $currentPage"
    }

    private fun downloadFile() {
        if (fileData.isEmpty()) { Toast.makeText(requireContext(), "No data", Toast.LENGTH_SHORT).show(); return }
        try {
            val bytes = Base64.decode(fileData, Base64.DEFAULT)
            val dir = File(android.os.Environment.getExternalStoragePublicDirectory(
                android.os.Environment.DIRECTORY_DOWNLOADS), "FlowLink")
            dir.mkdirs()
            val file = File(dir, fileName)
            file.writeBytes(bytes)
            val uri = FileProvider.getUriForFile(requireContext(), "${BuildConfig.APPLICATION_ID}.fileprovider", file)
            val intent = Intent(Intent.ACTION_VIEW).apply {
                setDataAndType(uri, fileType.ifEmpty { "*/*" })
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            startActivity(Intent.createChooser(intent, "Open $fileName"))
            Toast.makeText(requireContext(), "Saved to Downloads/FlowLink", Toast.LENGTH_SHORT).show()
        } catch (e: Exception) {
            Toast.makeText(requireContext(), "Download failed: ${e.message}", Toast.LENGTH_SHORT).show()
        }
    }

    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }
}
