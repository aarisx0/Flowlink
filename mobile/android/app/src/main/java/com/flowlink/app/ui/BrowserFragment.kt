package com.flowlink.app.ui

import android.annotation.SuppressLint
import android.os.Bundle
import android.view.KeyEvent
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.view.inputmethod.EditorInfo
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Toast
import androidx.fragment.app.Fragment
import androidx.lifecycle.lifecycleScope
import com.flowlink.app.MainActivity
import com.flowlink.app.databinding.FragmentBrowserBinding
import kotlinx.coroutines.launch

class BrowserFragment : Fragment() {
    private var _binding: FragmentBrowserBinding? = null
    private val binding get() = _binding!!

    private var syncEnabled = true
    // Suppress incoming sync while user is actively navigating
    private var suppressIncomingSync = false
    private var suppressTimer: Runnable? = null
    // Debounce scroll sync — don't fire on every pixel
    private var scrollSyncTimer: Runnable? = null
    private var lastSyncedUrl = ""

    companion object {
        fun newInstance() = BrowserFragment()
        private const val DEFAULT_URL = "https://www.google.com"
    }

    override fun onCreateView(inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?): View {
        _binding = FragmentBrowserBinding.inflate(inflater, container, false)
        return binding.root
    }

    @SuppressLint("SetJavaScriptEnabled", "ClickableViewAccessibility")
    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        val mainActivity = activity as? MainActivity ?: return

        setupWebView(mainActivity)
        setupAddressBar()
        setupNavButtons()
        setupSyncToggle()
        observeBrowserSync(mainActivity)

        binding.webView.loadUrl(DEFAULT_URL)
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun setupWebView(mainActivity: MainActivity) {
        binding.webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            loadWithOverviewMode = true
            useWideViewPort = true
            builtInZoomControls = true
            displayZoomControls = false
            setSupportZoom(true)
        }

        binding.webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                return false
            }

            override fun onPageStarted(view: WebView, url: String, favicon: android.graphics.Bitmap?) {
                binding.progressBar.visibility = View.VISIBLE
                binding.etUrl.setText(url)
            }

            override fun onPageFinished(view: WebView, url: String) {
                binding.progressBar.visibility = View.GONE
                binding.etUrl.setText(url)
                // Only sync URL when the page fully loads AND it's a new URL
                if (syncEnabled && url != lastSyncedUrl && url.startsWith("http")) {
                    lastSyncedUrl = url
                    suppressIncoming(3000)   // suppress incoming for 3s after we navigate
                    mainActivity.webSocketManager.sendBrowserSync("url", url)
                }
            }
        }

        binding.webView.webChromeClient = object : WebChromeClient() {
            override fun onProgressChanged(view: WebView, newProgress: Int) {
                binding.progressBar.progress = newProgress
                if (newProgress == 100) binding.progressBar.visibility = View.GONE
            }
        }

        // Debounced scroll sync — only fire 500ms after user stops scrolling
        binding.webView.setOnScrollChangeListener { _, _, scrollY, _, oldScrollY ->
            if (!syncEnabled || suppressIncomingSync) return@setOnScrollChangeListener
            if (kotlin.math.abs(scrollY - oldScrollY) < 5) return@setOnScrollChangeListener
            scrollSyncTimer?.let { binding.root.removeCallbacks(it) }
            val r = Runnable {
                mainActivity.webSocketManager.sendBrowserSync("scroll", scrollY.toString())
            }
            scrollSyncTimer = r
            binding.root.postDelayed(r, 500)
        }
    }

    private fun setupAddressBar() {
        binding.etUrl.setOnEditorActionListener { _, actionId, event ->
            if (actionId == EditorInfo.IME_ACTION_GO ||
                (event?.keyCode == KeyEvent.KEYCODE_ENTER && event.action == KeyEvent.ACTION_DOWN)) {
                val input = binding.etUrl.text.toString().trim()
                binding.webView.loadUrl(normalizeUrl(input))
                true
            } else false
        }
    }

    private fun setupNavButtons() {
        binding.btnBrowserBack.setOnClickListener {
            if (binding.webView.canGoBack()) binding.webView.goBack()
        }
        binding.btnBrowserForward.setOnClickListener {
            if (binding.webView.canGoForward()) binding.webView.goForward()
        }
        binding.btnBrowserReload.setOnClickListener {
            binding.webView.reload()
        }
    }

    private fun setupSyncToggle() {
        updateSyncUI()
        binding.btnSyncToggle.setOnClickListener {
            syncEnabled = !syncEnabled
            updateSyncUI()
            Toast.makeText(requireContext(),
                if (syncEnabled) "Sync ON" else "Sync OFF — private browsing",
                Toast.LENGTH_SHORT).show()
        }
    }

    private fun updateSyncUI() {
        binding.btnSyncToggle.setColorFilter(
            android.graphics.Color.parseColor(if (syncEnabled) "#22C55E" else "#6B6890")
        )
        binding.tvSyncStatus.visibility = if (syncEnabled) View.VISIBLE else View.GONE
    }

    private fun observeBrowserSync(mainActivity: MainActivity) {
        viewLifecycleOwner.lifecycleScope.launch {
            mainActivity.webSocketManager.browserSyncEvents.collect { event ->
                if (suppressIncomingSync) return@collect
                when (event.mode) {
                    "url" -> {
                        val current = binding.webView.url ?: ""
                        // Only load if genuinely different (ignore fragment changes)
                        val newBase = event.value.substringBefore("#")
                        val curBase = current.substringBefore("#")
                        if (newBase != curBase && event.value.startsWith("http")) {
                            suppressIncoming(3000)
                            lastSyncedUrl = event.value
                            binding.webView.loadUrl(event.value)
                            binding.etUrl.setText(event.value)
                        }
                    }
                    "scroll" -> {
                        val scrollY = event.value.toIntOrNull() ?: 0
                        binding.webView.scrollTo(0, scrollY)
                    }
                    "highlight" -> {
                        val escaped = event.value.replace("\\", "\\\\").replace("'", "\\'")
                        binding.webView.evaluateJavascript("""
                            (function(){
                                var body=document.body,txt='$escaped';
                                var walker=document.createTreeWalker(body,NodeFilter.SHOW_TEXT);
                                while(walker.nextNode()){
                                    var idx=walker.currentNode.textContent.indexOf(txt);
                                    if(idx>=0){
                                        var r=document.createRange();
                                        r.setStart(walker.currentNode,idx);
                                        r.setEnd(walker.currentNode,idx+txt.length);
                                        window.getSelection().removeAllRanges();
                                        window.getSelection().addRange(r);
                                        walker.currentNode.parentElement.scrollIntoView({behavior:'smooth',block:'center'});
                                        break;
                                    }
                                }
                            })();
                        """.trimIndent(), null)
                    }
                }
            }
        }
    }

    private fun suppressIncoming(durationMs: Long) {
        suppressIncomingSync = true
        suppressTimer?.let { binding.root.removeCallbacks(it) }
        val r = Runnable { suppressIncomingSync = false }
        suppressTimer = r
        binding.root.postDelayed(r, durationMs)
    }

    private fun normalizeUrl(input: String): String {
        if (input.startsWith("http://") || input.startsWith("https://")) return input
        if (input.contains(".") && !input.contains(" ")) return "https://$input"
        return "https://www.google.com/search?q=${android.net.Uri.encode(input)}"
    }

    override fun onDestroyView() {
        binding.webView.destroy()
        super.onDestroyView()
        _binding = null
    }
}
