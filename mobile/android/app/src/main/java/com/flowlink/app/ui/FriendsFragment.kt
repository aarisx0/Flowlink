package com.flowlink.app.ui

import android.Manifest
import android.app.AlertDialog
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.location.LocationManager
import android.net.Uri
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.ImageButton
import android.widget.TextView
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
import androidx.fragment.app.Fragment
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.flowlink.app.MainActivity
import com.flowlink.app.R
import com.flowlink.app.databinding.FragmentFriendsBinding
import com.flowlink.app.model.Friend
import com.google.gson.Gson
import com.google.gson.reflect.TypeToken
import org.json.JSONObject

class FriendsFragment : Fragment() {
    private var _binding: FragmentFriendsBinding? = null
    private val binding get() = _binding!!
    private val friends = mutableListOf<Friend>()
    private var friendsAdapter: FriendsAdapter? = null

    private val requestLocation = registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { perms ->
        if (perms[Manifest.permission.ACCESS_FINE_LOCATION] == true ||
            perms[Manifest.permission.ACCESS_COARSE_LOCATION] == true) {
            sendSOS()
        } else {
            Toast.makeText(requireContext(), "Location permission needed for SOS", Toast.LENGTH_SHORT).show()
        }
    }

    companion object {
        private const val PREFS_KEY = "flowlink_friends"

        fun newInstance() = FriendsFragment()

        fun saveFriend(ctx: Context, friend: Friend) {
            val prefs = ctx.getSharedPreferences(PREFS_KEY, Context.MODE_PRIVATE)
            val list = loadFriends(ctx).toMutableList()
            if (list.none { it.deviceId == friend.deviceId }) {
                list.add(friend)
                prefs.edit().putString("list", Gson().toJson(list)).apply()
            }
        }

        fun loadFriends(ctx: Context): List<Friend> {
            val prefs = ctx.getSharedPreferences(PREFS_KEY, Context.MODE_PRIVATE)
            val json = prefs.getString("list", null) ?: return emptyList()
            return try {
                Gson().fromJson(json, object : TypeToken<List<Friend>>() {}.type)
            } catch (_: Exception) { emptyList() }
        }
    }

    override fun onCreateView(inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?): View {
        _binding = FragmentFriendsBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        binding.btnBack.setOnClickListener { parentFragmentManager.popBackStack() }

        friends.clear()
        friends.addAll(loadFriends(requireContext()))

        binding.rvFriends.layoutManager = LinearLayoutManager(requireContext())
        friendsAdapter = FriendsAdapter(friends) { friend ->
            AlertDialog.Builder(requireContext())
                .setTitle("Remove Friend")
                .setMessage("Remove ${friend.username} from friends?")
                .setPositiveButton("Remove") { _, _ ->
                    friends.remove(friend)
                    friendsAdapter?.notifyDataSetChanged()
                    saveFriendsList()
                    updateEmptyState()
                }
                .setNegativeButton("Cancel", null)
                .show()
        }
        binding.rvFriends.adapter = friendsAdapter
        updateEmptyState()

        binding.btnSos.setOnClickListener {
            AlertDialog.Builder(requireContext())
                .setTitle("🆘 Send SOS?")
                .setMessage("This will send your current location to all ${friends.size} friend(s) immediately.")
                .setPositiveButton("Send SOS") { _, _ -> checkLocationAndSend() }
                .setNegativeButton("Cancel", null)
                .show()
        }
    }

    private fun checkLocationAndSend() {
        val ctx = requireContext()
        val fineGranted = ContextCompat.checkSelfPermission(ctx, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
        val coarseGranted = ContextCompat.checkSelfPermission(ctx, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED
        if (fineGranted || coarseGranted) {
            sendSOS()
        } else {
            requestLocation.launch(arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION))
        }
    }

    private fun sendSOS() {
        val ctx = requireContext()
        val mainActivity = activity as? MainActivity ?: return
        try {
            val lm = ctx.getSystemService(Context.LOCATION_SERVICE) as LocationManager
            val location = lm.getLastKnownLocation(LocationManager.GPS_PROVIDER)
                ?: lm.getLastKnownLocation(LocationManager.NETWORK_PROVIDER)

            val lat = location?.latitude ?: 0.0
            val lng = location?.longitude ?: 0.0
            val mapsUrl = "https://maps.google.com/?q=$lat,$lng"
            val username = mainActivity.sessionManager.getUsername()

            // Send SOS to all friends via WebSocket
            val sosPayload = JSONObject().apply {
                put("type", "sos_alert")
                put("sessionId", mainActivity.sessionManager.getCurrentSessionId())
                put("deviceId", mainActivity.sessionManager.getDeviceId())
                put("payload", JSONObject().apply {
                    put("username", username)
                    put("lat", lat)
                    put("lng", lng)
                    put("mapsUrl", mapsUrl)
                    put("message", "🆘 $username needs help!")
                })
                put("timestamp", System.currentTimeMillis())
            }
            mainActivity.webSocketManager.sendMessage(sosPayload.toString())

            Toast.makeText(ctx, "🆘 SOS sent to ${friends.size} friend(s)!", Toast.LENGTH_LONG).show()
        } catch (e: Exception) {
            Toast.makeText(ctx, "SOS failed: ${e.message}", Toast.LENGTH_SHORT).show()
        }
    }

    private fun saveFriendsList() {
        val prefs = requireContext().getSharedPreferences(PREFS_KEY, Context.MODE_PRIVATE)
        prefs.edit().putString("list", Gson().toJson(friends)).apply()
    }

    private fun updateEmptyState() {
        if (friends.isEmpty()) {
            binding.rvFriends.visibility = View.GONE
            binding.llEmpty.visibility = View.VISIBLE
        } else {
            binding.rvFriends.visibility = View.VISIBLE
            binding.llEmpty.visibility = View.GONE
        }
    }

    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }
}

class FriendsAdapter(
    private val friends: MutableList<Friend>,
    private val onRemove: (Friend) -> Unit
) : RecyclerView.Adapter<FriendsAdapter.FriendVH>() {

    class FriendVH(v: View) : RecyclerView.ViewHolder(v) {
        val tvInitial: TextView = v.findViewById(R.id.tv_friend_initial)
        val tvUsername: TextView = v.findViewById(R.id.tv_friend_username)
        val tvDevice: TextView = v.findViewById(R.id.tv_friend_device)
        val btnRemove: ImageButton = v.findViewById(R.id.btn_remove_friend)
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int) =
        FriendVH(LayoutInflater.from(parent.context).inflate(R.layout.item_friend, parent, false))

    override fun onBindViewHolder(holder: FriendVH, position: Int) {
        val f = friends[position]
        holder.tvInitial.text = f.username.firstOrNull()?.uppercaseChar()?.toString() ?: "U"
        holder.tvUsername.text = f.username
        holder.tvDevice.text = f.deviceName
        holder.btnRemove.setOnClickListener { onRemove(f) }
    }

    override fun getItemCount() = friends.size
}
