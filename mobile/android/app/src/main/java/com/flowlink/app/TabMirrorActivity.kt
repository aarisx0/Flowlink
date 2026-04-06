package com.flowlink.app

import android.annotation.SuppressLint
import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import com.flowlink.app.service.NotificationService
import org.json.JSONArray
import org.json.JSONObject

class TabMirrorActivity : AppCompatActivity() {
    private lateinit var webView: WebView
    private lateinit var titleView: TextView
    private lateinit var subtitleView: TextView
    private lateinit var previousButton: Button
    private lateinit var nextButton: Button

    private var tabs: JSONArray = JSONArray()
    private var currentIndex = 0

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val payloadText = intent.getStringExtra(NotificationService.EXTRA_TAB_HANDOFF)
        val payload = try {
            if (payloadText.isNullOrBlank()) null else JSONObject(payloadText)
        } catch (_: Exception) {
            null
        }

        tabs = payload?.optJSONArray("tabs") ?: JSONArray()
        currentIndex = payload?.optInt("activeIndex", 0)?.coerceIn(0, maxOf(tabs.length() - 1, 0)) ?: 0

        if (tabs.length() == 0) {
            finish()
            return
        }

        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(Color.parseColor("#F8FAFC"))
        }

        val header = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(Color.WHITE)
            setPadding(dp(16), dp(16), dp(16), dp(12))
            elevation = dp(4).toFloat()
        }

        titleView = TextView(this).apply {
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 18f)
            setTextColor(Color.parseColor("#0F172A"))
        }

        subtitleView = TextView(this).apply {
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 12f)
            setTextColor(Color.parseColor("#475569"))
            setPadding(0, dp(4), 0, 0)
        }

        val actions = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(0, dp(12), 0, 0)
        }

        previousButton = Button(this).apply {
            text = "Previous"
            setOnClickListener { loadTab(currentIndex - 1) }
        }

        nextButton = Button(this).apply {
            text = "Next"
            setOnClickListener { loadTab(currentIndex + 1) }
        }

        val openBrowserButton = Button(this).apply {
            text = "Open In Browser"
            setOnClickListener {
                val url = currentTab()?.optString("url", "") ?: ""
                if (url.isNotBlank()) {
                    startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
                }
            }
        }

        actions.addView(previousButton, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
        actions.addView(nextButton, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f).apply {
            marginStart = dp(8)
        })
        actions.addView(openBrowserButton, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1.2f).apply {
            marginStart = dp(8)
        })

        header.addView(titleView)
        header.addView(subtitleView)
        header.addView(actions)

        webView = WebView(this).apply {
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.loadsImagesAutomatically = true
            settings.allowFileAccess = false
            settings.databaseEnabled = true
            webChromeClient = WebChromeClient()
            webViewClient = object : WebViewClient() {
                override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?): Boolean {
                    return false
                }

                override fun onPageFinished(view: WebView?, url: String?) {
                    super.onPageFinished(view, url)
                    restoreScrollPosition()
                }
            }
        }

        root.addView(header, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT))
        root.addView(webView, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f))
        setContentView(root)

        loadTab(currentIndex)
    }

    private fun currentTab(): JSONObject? {
        if (currentIndex < 0 || currentIndex >= tabs.length()) {
            return null
        }
        return tabs.optJSONObject(currentIndex)
    }

    private fun loadTab(index: Int) {
        if (index < 0 || index >= tabs.length()) {
            return
        }

        currentIndex = index
        val tab = currentTab() ?: return
        val url = tab.optString("url", "")

        titleView.text = tab.optString("title", tab.optString("pageTitle", "Tab"))
        subtitleView.text = buildSubtitle(tab)
        previousButton.isEnabled = currentIndex > 0
        nextButton.isEnabled = currentIndex < tabs.length() - 1

        if (url.isBlank()) {
            return
        }

        webView.loadUrl(url)
    }

    private fun buildSubtitle(tab: JSONObject): String {
        val parts = mutableListOf<String>()
        parts.add("${currentIndex + 1}/${tabs.length()}")

        val selection = tab.optString("selectionText", "")
        if (selection.isNotBlank()) {
            parts.add(selection.take(80))
        }

        val scrollPercent = (tab.optDouble("scrollProgress", 0.0) * 100).toInt()
        if (scrollPercent > 0) {
            parts.add("$scrollPercent% read")
        }

        return parts.joinToString("  •  ")
    }

    private fun restoreScrollPosition() {
        val tab = currentTab() ?: return
        val scrollY = tab.optInt("scrollY", 0)
        val progress = tab.optDouble("scrollProgress", 0.0)
        val mediaTimestamp = tab.optInt("mediaTimestamp", 0)

        webView.postDelayed({
            val script = if (scrollY > 0) {
                "window.scrollTo(${tab.optInt("scrollX", 0)}, $scrollY);"
            } else {
                "(function(){const root=document.scrollingElement||document.documentElement||document.body;const max=Math.max((((root&&root.scrollHeight)||0)-window.innerHeight),0);window.scrollTo(0, Math.floor(max * $progress));})();"
            }
            val mediaScript = if (mediaTimestamp > 0) {
                "(function(){const media=document.querySelector('video, audio');if(media){try{media.currentTime=$mediaTimestamp;}catch(e){}}})();"
            } else {
                ""
            }
            webView.evaluateJavascript(script + mediaScript, null)
        }, 450)
    }

    private fun dp(value: Int): Int {
        return TypedValue.applyDimension(
            TypedValue.COMPLEX_UNIT_DIP,
            value.toFloat(),
            resources.displayMetrics
        ).toInt()
    }

    override fun onDestroy() {
        if (this::webView.isInitialized) {
            webView.stopLoading()
            webView.destroy()
        }
        super.onDestroy()
    }
}
