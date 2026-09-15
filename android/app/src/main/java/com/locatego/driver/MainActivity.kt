package com.locatego.driver

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.net.Uri
import android.net.http.SslError
import android.os.Build
import android.os.Bundle
import android.os.PowerManager
import android.provider.Settings
import android.view.View
import android.webkit.*
import android.widget.FrameLayout
import android.widget.ProgressBar
import android.widget.Toast
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/**
 * MainActivity - Single App Architecture
 * دمج لوحة التحكم بالكامل داخل تطبيق الأندرويد كشاشة أساسية متكاملة (Web/React Integrated UI).
 * يتم تحميل لوحة التحكم من سيرفر Render أو محلياً، مع ربطها بجسر برمجي (JavascriptInterface)
 * للتحكم الفوري في إعدادات الأداة، تفعيل/إيقاف التتبع، فحص الطلبات، وإدارة صلاحيات النظام.
 */
class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private lateinit var progressBar: ProgressBar
    private lateinit var bridge: LocateGoNativeBridge
    private lateinit var renderClient: RenderApiClient

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
        syncStateToWeb()
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        renderClient = RenderApiClient(this)
        bridge = LocateGoNativeBridge(this)

        setupSingleAppUi()
        checkAndRequestPermissions()

        // معالجة زر الرجوع في الأندرويد لتصفح الـ WebView بسلاسة
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (webView.canGoBack()) {
                    webView.goBack()
                } else {
                    // تصغير التطبيق وإبقاؤه يعمل في الخلفية بدلاً من قفله
                    moveTaskToBack(true)
                }
            }
        })
    }

    override fun onResume() {
        super.onResume()
        syncStateToWeb()
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun setupSingleAppUi() {
        val rootLayout = FrameLayout(this).apply {
            setBackgroundColor(ContextCompat.getColor(context, R.color.background_dark))
        }

        webView = WebView(this).apply {
            layoutParams = FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT
            )
            setBackgroundColor(ContextCompat.getColor(context, R.color.background_dark))
        }

        progressBar = ProgressBar(this).apply {
            layoutParams = FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.WRAP_CONTENT,
                FrameLayout.LayoutParams.WRAP_CONTENT
            ).apply {
                gravity = android.view.Gravity.CENTER
            }
            visibility = View.VISIBLE
        }

        rootLayout.addView(webView)
        rootLayout.addView(progressBar)
        setContentView(rootLayout)

        // إعدادات الـ WebView المتقدمة لتشغيل واجهة React الحديثة بكامل قدراتها
        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            allowFileAccess = true
            allowContentAccess = true
            useWideViewPort = true
            loadWithOverviewMode = true
            setSupportZoom(false)
            builtInZoomControls = false
            displayZoomControls = false
            cacheMode = WebSettings.LOAD_DEFAULT
            mediaPlaybackRequiresUserGesture = false
            mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
            userAgentString = "${userAgentString} LocateGoDriverApp/1.0.0"
        }

        // ربط الجسر البرمجي بين Kotlin والـ Web
        webView.addJavascriptInterface(bridge, "LocateGoNative")

        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?): Boolean {
                val url = request?.url?.toString() ?: ""
                if (url.startsWith("vip://unlock")) {
                    runOnUiThread {
                        Toast.makeText(this@MainActivity, "👑 تم قبول كود VIP وفتح التطبيق بنجاح!", Toast.LENGTH_SHORT).show()
                        view?.evaluateJavascript("if (window.onVipUnlocked) window.onVipUnlocked();", null)
                    }
                    return true
                }
                if (url.startsWith("https://t.me/") || url.startsWith("tg://")) {
                    try {
                        startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
                        return true
                    } catch (e: Exception) {
                        // ignore if telegram not installed
                    }
                }
                return super.shouldOverrideUrlLoading(view, request)
            }

            override fun onPageStarted(view: WebView?, url: String?, favicon: Bitmap?) {
                progressBar.visibility = View.VISIBLE
            }

            override fun onPageFinished(view: WebView?, url: String?) {
                progressBar.visibility = View.GONE
                syncStateToWeb()
            }

            @SuppressLint("WebViewClientOnReceivedSslError")
            override fun onReceivedSslError(view: WebView?, handler: SslErrorHandler?, error: SslError?) {
                handler?.proceed() // تجاوز تحذيرات SSL للاتصال الداخلي الآمن
            }

            override fun onReceivedError(view: WebView?, request: WebResourceRequest?, error: WebResourceError?) {
                super.onReceivedError(view, request, error)
                if (request?.isForMainFrame == true) {
                    progressBar.visibility = View.GONE
                }
            }
        }

        webView.webChromeClient = object : WebChromeClient() {
            override fun onGeolocationPermissionsShowPrompt(
                origin: String?,
                callback: GeolocationPermissions.Callback?
            ) {
                // منح إذن الموقع تلقائياً لواجهة الويب داخل التطبيق
                callback?.invoke(origin, true, false)
            }
        }

        // تحميل واجهة لوحة التحكم من سيرفر Render المباشر
        val dashboardUrl = renderClient.baseUrl
        webView.loadUrl(dashboardUrl)
    }

    /**
     * إرسال حالة النظام والموقع الجغرافي الحي مباشرة إلى واجهة React داخل الـ WebView
     */
    fun syncStateToWeb() {
        lifecycleScope.launch {
            delay(300)
            val isRunning = LocationTrackingService.isServiceRunning
            val isOverlay = FloatingOverlayService.isOverlayShowing
            val lat = LocationTrackingService.currentLatitude ?: 0.0
            val lng = LocationTrackingService.currentLongitude ?: 0.0

            val jsCode = """
                if (window.onLocateGoNativeSync) {
                    window.onLocateGoNativeSync({
                        isNativeApp: true,
                        isTrackingRunning: $isRunning,
                        isOverlayShowing: $isOverlay,
                        lat: $lat,
                        lng: $lng
                    });
                }
            """.trimIndent()
            webView.evaluateJavascript(jsCode, null)
        }
    }

    fun startLocationService() {
        val intent = Intent(this, LocationTrackingService::class.java).apply {
            action = LocationTrackingService.ACTION_START
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            startForegroundService(intent)
        } else {
            startService(intent)
        }
    }

    fun stopLocationService() {
        val intent = Intent(this, LocationTrackingService::class.java).apply {
            action = LocationTrackingService.ACTION_STOP
        }
        startService(intent)
    }

    fun requestIgnoreBatteryOptimizations() {
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
                requestPermissions(
                    arrayOf(Manifest.permission.ACCESS_BACKGROUND_LOCATION),
                    1002
                )
            }
        }
    }
}
