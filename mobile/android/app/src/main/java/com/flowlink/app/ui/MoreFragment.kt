package com.flowlink.app.ui

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Toast
import androidx.fragment.app.Fragment
import com.flowlink.app.MainActivity
import com.flowlink.app.databinding.FragmentMoreBinding
import com.flowlink.app.service.SessionManager

class MoreFragment : Fragment() {
    private var _binding: FragmentMoreBinding? = null
    private val binding get() = _binding!!
    private var sessionManager: SessionManager? = null

    companion object {
        fun newInstance() = MoreFragment()
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        sessionManager = SessionManager(requireContext())
    }

    override fun onCreateView(inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?): View {
        _binding = FragmentMoreBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        val mainActivity = activity as? MainActivity ?: return

        binding.btnCreateGroup.setOnClickListener {
            Toast.makeText(requireContext(), "Group creation coming soon", Toast.LENGTH_SHORT).show()
        }

        binding.moreSessionDetails.setOnClickListener {
            val code = sessionManager?.getCurrentSessionCode()
            Toast.makeText(requireContext(), "Session Code: ${code ?: "N/A"}", Toast.LENGTH_SHORT).show()
        }

        binding.morePermissions.setOnClickListener {
            Toast.makeText(requireContext(), "Permissions coming soon", Toast.LENGTH_SHORT).show()
        }

        binding.moreSettings.setOnClickListener {
            Toast.makeText(requireContext(), "Settings coming soon", Toast.LENGTH_SHORT).show()
        }

        binding.moreHelp.setOnClickListener {
            Toast.makeText(requireContext(), "Help & Support coming soon", Toast.LENGTH_SHORT).show()
        }

        binding.moreAbout.setOnClickListener {
            Toast.makeText(requireContext(), "FlowLink v1.0 - Cross-Device Continuity", Toast.LENGTH_SHORT).show()
        }

        binding.moreLeaveSession.setOnClickListener {
            mainActivity.leaveSession()
        }
    }

    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }
}
