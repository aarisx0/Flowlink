package com.flowlink.app.ui

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Toast
import androidx.fragment.app.Fragment
import com.flowlink.app.databinding.FragmentHelpBinding

class HelpFragment : Fragment() {
    private var _binding: FragmentHelpBinding? = null
    private val binding get() = _binding!!

    companion object {
        fun newInstance() = HelpFragment()
    }

    override fun onCreateView(inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?): View {
        _binding = FragmentHelpBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        binding.btnBack.setOnClickListener { parentFragmentManager.popBackStack() }

        binding.btnSubmitReport.setOnClickListener {
            val text = binding.etReport.text?.toString()?.trim().orEmpty()
            if (text.isEmpty()) {
                Toast.makeText(requireContext(), "Please describe the issue", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }
            // In production: send to backend or email
            binding.etReport.setText("")
            Toast.makeText(requireContext(), "Report submitted. Thank you!", Toast.LENGTH_SHORT).show()
        }

        binding.btnSubmitFeedback.setOnClickListener {
            val text = binding.etFeedback.text?.toString()?.trim().orEmpty()
            if (text.isEmpty()) {
                Toast.makeText(requireContext(), "Please enter your feedback", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }
            binding.etFeedback.setText("")
            Toast.makeText(requireContext(), "Feedback sent. Thank you!", Toast.LENGTH_SHORT).show()
        }
    }

    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }
}
