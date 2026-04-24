package com.flowlink.app.ui

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatDelegate
import androidx.core.content.ContextCompat
import androidx.fragment.app.Fragment
import com.flowlink.app.databinding.FragmentSettingsBinding

class SettingsFragment : Fragment() {
    private var _binding: FragmentSettingsBinding? = null
    private val binding get() = _binding!!

    private val pickBgLauncher = registerForActivityResult(ActivityResultContracts.GetContent()) { uri: Uri? ->
        uri ?: return@registerForActivityResult
        val prefs = requireContext().getSharedPreferences("flowlink_settings", Context.MODE_PRIVATE)
        prefs.edit().putString("chat_bg_uri", uri.toString()).apply()
        Toast.makeText(requireContext(), "Chat background updated", Toast.LENGTH_SHORT).show()
    }

    companion object {
        fun newInstance() = SettingsFragment()
    }

    override fun onCreateView(inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?): View {
        _binding = FragmentSettingsBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        val prefs = requireContext().getSharedPreferences("flowlink_settings", Context.MODE_PRIVATE)

        binding.btnBack.setOnClickListener { parentFragmentManager.popBackStack() }

        // Dark theme toggle
        val isDark = prefs.getBoolean("dark_theme", true)
        binding.switchDarkTheme.isChecked = isDark
        binding.switchDarkTheme.setOnCheckedChangeListener { _, checked ->
            prefs.edit().putBoolean("dark_theme", checked).apply()
            AppCompatDelegate.setDefaultNightMode(
                if (checked) AppCompatDelegate.MODE_NIGHT_YES else AppCompatDelegate.MODE_NIGHT_NO
            )
        }

        // Read receipts
        binding.switchReadReceipts.isChecked = prefs.getBoolean("read_receipts", true)
        binding.switchReadReceipts.setOnCheckedChangeListener { _, checked ->
            prefs.edit().putBoolean("read_receipts", checked).apply()
        }

        // Active status
        binding.switchActiveStatus.isChecked = prefs.getBoolean("active_status", true)
        binding.switchActiveStatus.setOnCheckedChangeListener { _, checked ->
            prefs.edit().putBoolean("active_status", checked).apply()
        }

        // Chat background
        binding.btnChatBg.setOnClickListener {
            pickBgLauncher.launch("image/*")
        }
    }

    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }
}
