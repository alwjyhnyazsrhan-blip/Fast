package com.locatego.driver

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.PowerManager
import android.provider.Settings
import android.view.Gravity
import android.view.ViewGroup
import android.widget.*
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

class MainActivity : AppCompatActivity() {

    private lateinit var renderClient: RenderApiClient
    private lateinit var statusTextView: TextView
    private lateinit var locationTextView: TextView
    private lateinit var startServiceBtn: Button
    private lateinit var overlayBtn: Button
    private lateinit var accessibilityBtn: Button
    private lateinit var serverUrlInput: EditText

    private val requestLocationPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { permissions ->
        val fineGranted = permissions[Manifest.permission.ACCESS_FINE_LOCATION] ?: false
        val coarseGranted = permissions[Manifest.permission.ACCESS_COARSE_LOCATION] ?: false

        if (fineGranted || coarseGranted) {
            Toast.makeText(this, "تم منح إذن الموقع الجغرافي بنجاح", Toast.LENGTH_SHORT).show()
            startLocationService()
            requestBackgroundLocationIfNeeded()
        } else {
            Toast.makeText(this, "يجب منح إذن الموقع لتصفية الطلبات في نطاق 2 كم", Toast.LENGTH_LONG).show()
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        renderClient = RenderApiClient(this)

        setupNativeUi()
        checkAndRequestPermissions()
    }

    override fun onResume() {
        super.onResume()
        updateStatusDisplay()
    }

    private fun setupNativeUi() {
        val rootLayout = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(48, 48, 48, 48)
            setBackgroundColor(ContextCompat.getColor(context, R.color.background_dark))
            layoutParams = ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
        }

        val scroll = ScrollView(this).apply {
            addView(rootLayout)
        }
        setContentView(scroll)

        // Title
        val titleText = TextView(this).apply {
            text = "⚡ Locate Go Driver Native"
            textSize = 22f
            setTextColor(ContextCompat.getColor(context, R.color.text_primary))
            typeface = android.graphics.Typeface.DEFAULT_BOLD
            gravity = Gravity.CENTER_HORIZONTAL
        }
        rootLayout.addView(titleText)

        val subtitleText = TextView(this).apply {
            text = "اعتراض الطلبات في نطاق 2.0 كم والربط المباشر مع سيرفر Render"
            textSize = 13f
            setTextColor(ContextCompat.getColor(context, R.color.text_secondary))
            gravity = Gravity.CENTER_HORIZONTAL
            setPadding(0, 8, 0, 32)
        }
        rootLayout.addView(subtitleText)

        // Status Card
        statusTextView = TextView(this).apply {
            text = "الحالة: جاري الفحص..."
            textSize = 14f
            setTextColor(ContextCompat.getColor(context, R.color.primary))
            setBackgroundColor(ContextCompat.getColor(context, R.color.card_bg))
            setPadding(32, 24, 32, 24)
        }
        rootLayout.addView(statusTextView)

        locationTextView = TextView(this).apply {
            text = "إحداثيات المندوب: جاري التقاط GPS..."
            textSize = 12f
            setTextColor(ContextCompat.getColor(context, R.color.text_secondary))
            setPadding(0, 16, 0, 24)
        }
        rootLayout.addView(locationTextView)

        // Render Server URL Input
        val urlLabel = TextView(this).apply {
            text = "رابط خادم Render المباشر:"
            textSize = 12f
            setTextColor(ContextCompat.getColor(context, R.color.text_secondary))
        }
        rootLayout.addView(urlLabel)

        serverUrlInput = EditText(this).apply {
            setText(renderClient.baseUrl)
            setTextColor(ContextCompat.getColor(context, R.color.text_primary))
            setBackgroundColor(ContextCompat.getColor(context, R.color.card_bg))
            setPadding(24, 20, 24, 20)
            textSize = 13f
            isSingleLine = true
            inputType = android.text.InputType.TYPE_CLASS_TEXT or android.text.InputType.TYPE_TEXT_VARIATION_URI
        }
        rootLayout.addView(serverUrlInput)

        val saveUrlBtn = Button(this).apply {
            text = "حفظ واختبار اتصال السيرفر"
            setBackgroundColor(ContextCompat.getColor(context, R.color.accent))
            setTextColor(ContextCompat.getColor(context, R.color.background_dark))
            setOnClickListener {
                val newUrl = serverUrlInput.text.toString().trim()
                renderClient.baseUrl = newUrl
                testServerPing()
            }
        }
        rootLayout.addView(saveUrlBtn)

        addSpacer(rootLayout, 24)

        // Buttons
        startServiceBtn = Button(this).apply {
            text = "تشغيل خدمة التتبع (نطاق 2 كم)"
            setBackgroundColor(ContextCompat.getColor(context, R.color.primary))
            setTextColor(ContextCompat.getColor(context, R.color.background_dark))
            setOnClickListener {
                if (LocationTrackingService.isServiceRunning) {
                    stopLocationService()
                } else {
                    startLocationService()
                }
                updateStatusDisplay()
            }
        }
        rootLayout.addView(startServiceBtn)

        addSpacer(rootLayout, 12)

        accessibilityBtn = Button(this).apply {
            text = "تفعيل خدمة قراءة الشاشة (Accessibility)"
            setBackgroundColor(ContextCompat.getColor(context, R.color.card_bg))
            setTextColor(ContextCompat.getColor(context, R.color.text_primary))
            setOnClickListener {
                val intent = Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)
                startActivity(intent)
            }
        }
        rootLayout.addView(accessibilityBtn)

        addSpacer(rootLayout, 12)

        overlayBtn = Button(this).apply {
            text = "تفعيل النافذة العائمة (Overlay Pill)"
            setBackgroundColor(ContextCompat.getColor(context, R.color.card_bg))
            setTextColor(ContextCompat.getColor(context, R.color.text_primary))
            setOnClickListener {
                if (Settings.canDrawOverlays(this@MainActivity)) {
                    val intent = Intent(this@MainActivity, FloatingOverlayService::class.java)
                    startService(intent)
                } else {
                    val intent = Intent(
                        Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                        Uri.parse("package:$packageName")
                    )
                    startActivity(intent)
                }
            }
        }
        rootLayout.addView(overlayBtn)

        addSpacer(rootLayout, 12)

        val batteryBtn = Button(this).apply {
            text = "استثناء توفير الطاقة (عدم إغلاق الأداة)"
            setBackgroundColor(ContextCompat.getColor(context, R.color.card_bg))
            setTextColor(ContextCompat.getColor(context, R.color.text_secondary))
            setOnClickListener {
                requestIgnoreBatteryOptimizations()
            }
        }
        rootLayout.addView(batteryBtn)
    }

    private fun addSpacer(layout: LinearLayout, heightDp: Int) {
        val spacer = Space(this).apply {
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                (heightDp * resources.displayMetrics.density).toInt()
            )
        }
        layout.addView(spacer)
    }

    private fun checkAndRequestPermissions() {
        val permissions = mutableListOf(
            Manifest.permission.ACCESS_FINE_LOCATION,
            Manifest.permission.ACCESS_COARSE_LOCATION
        )

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            permissions.add(Manifest.permission.POST_NOTIFICATIONS)
        }

        val missing = permissions.filter {
            ContextCompat.checkSelfPermission(this, it) != PackageManager.PERMISSION_GRANTED
        }

        if (missing.isNotEmpty()) {
            requestLocationPermissionLauncher.launch(missing.toTypedArray())
        } else {
            startLocationService()
        }
    }

    private fun requestBackgroundLocationIfNeeded() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            if (ContextCompat.checkSelfPermission(
                    this,
                    Manifest.permission.ACCESS_BACKGROUND_LOCATION
                ) != PackageManager.PERMISSION_GRANTED
            ) {
                // Request background location
                requestPermissions(
                    arrayOf(Manifest.permission.ACCESS_BACKGROUND_LOCATION),
                    1002
                )
            }
        }
    }

    private fun requestIgnoreBatteryOptimizations() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
            if (!pm.isIgnoringBatteryOptimizations(packageName)) {
                val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
                    data = Uri.parse("package:$packageName")
                }
                startActivity(intent)
            } else {
                Toast.makeText(this, "التطبيق مستثنى بالفعل من توفير الطاقة!", Toast.LENGTH_SHORT).show()
            }
        }
    }

    private fun startLocationService() {
        val intent = Intent(this, LocationTrackingService::class.java).apply {
            action = LocationTrackingService.ACTION_START
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            startForegroundService(intent)
        } else {
            startService(intent)
        }
    }

    private fun stopLocationService() {
        val intent = Intent(this, LocationTrackingService::class.java).apply {
            action = LocationTrackingService.ACTION_STOP
        }
        startService(intent)
    }

    private fun updateStatusDisplay() {
        val isRunning = LocationTrackingService.isServiceRunning
        statusTextView.text = if (isRunning) {
            "الحالة: نشط • تتبع النطاق (2.0 كم) يعمل في الخلفية"
        } else {
            "الحالة: متوقف • اضغط الزر بالأسفل لتشغيل التتبع"
        }
        startServiceBtn.text = if (isRunning) "إيقاف خدمة التتبع" else "تشغيل خدمة التتبع (نطاق 2 كم)"

        val lat = LocationTrackingService.currentLatitude
        val lng = LocationTrackingService.currentLongitude
        locationTextView.text = if (lat != null && lng != null) {
            "الموقع الحي: $lat, $lng"
        } else {
            "إحداثيات المندوب: بانتظار إشارة GPS الدقيقة..."
        }
    }

    private fun testServerPing() {
        Toast.makeText(this@MainActivity, "جاري فحص الاتصال بسيرفر Render...", Toast.LENGTH_SHORT).show()
        lifecycleScope.launch {
            val pingResult = renderClient.pingServer()
            if (pingResult.isSuccess) {
                // أيضاً نقوم بتحديث موقع المندوب الحي إن توفر
                val lat = LocationTrackingService.currentLatitude
                val lng = LocationTrackingService.currentLongitude
                if (lat != null && lng != null) {
                    renderClient.updateDriverLocation(lat, lng)
                }
                Toast.makeText(
                    this@MainActivity,
                    "✅ تم الاتصال بنجاح! (${pingResult.getOrNull()})",
                    Toast.LENGTH_LONG
                ).show()
            } else {
                val errorMsg = pingResult.exceptionOrNull()?.message ?: "خطأ غير معروف"
                Toast.makeText(
                    this@MainActivity,
                    "❌ فشل الاتصال: $errorMsg",
                    Toast.LENGTH_LONG
                ).show()
            }
        }
    }
}
