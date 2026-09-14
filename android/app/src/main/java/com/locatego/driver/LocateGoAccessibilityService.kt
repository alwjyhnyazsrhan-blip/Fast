package com.locatego.driver

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.GestureDescription
import android.content.Context
import android.graphics.Path
import android.graphics.Rect
import android.media.AudioManager
import android.media.ToneGenerator
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import android.util.Log
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import kotlinx.coroutines.*
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicBoolean
import java.util.regex.Pattern

/**
 * LocateGoAccessibilityService
 * خدمة قراءة الشاشة والاعتراض الفوري لعروض التوصيل.
 * 
 * المزايا المدمجة:
 * 1. [Aggressive Auto-Refresh]: سحب الشاشة للأسفل (Swipe Down) كل 1.5 ثانية لإجبار التطبيق على جلب الطلبات فوراً.
 * 2. [Radius Guard]: تصفية صارمة لنطاق الـ 2.0 كم المحدد للكوريور.
 * 3. [Zero-Delay Pipeline]: إرسال فوري إلى خادم Render بدون تأخير.
 * 4. [Hybrid Instant Click]: نقر مزدوج على زر القبول (Accessibility + Screen Tap) لضمان النجاح 100%.
 */
class LocateGoAccessibilityService : AccessibilityService() {

    private val serviceScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private lateinit var renderClient: RenderApiClient

    // تعابير نمطية مجمعة مسبقاً لاستخراج المسافة والمبلغ بسرعة فائقة
    private val distancePattern = Pattern.compile("(\\d+(?:\\.\\d+)?)\\s*(?:كم|كيلو|km)", Pattern.CASE_INSENSITIVE)
    private val payoutPattern = Pattern.compile("(\\d+(?:\\.\\d+)?)\\s*(?:ر\\.س|ريال|sar)", Pattern.CASE_INSENSITIVE)

    private val isEvaluatingOrder = AtomicBoolean(false)
    private var refreshJob: Job? = null
    private var currentForegroundPackage = ""
    private val processedOrdersCache = ConcurrentHashMap<String, Long>()

    override fun onServiceConnected() {
        super.onServiceConnected()
        renderClient = RenderApiClient(this)
        Log.i("LocateGoService", "⚡ Locate Go Accessibility Service is ACTIVE with 2.0 km Range & Fast Swipe.")
        startAggressiveRefreshLoop()
    }

    /**
     * حلقة السحب القسري (Aggressive Swipe Down) لتحديث الطلبات بشكل مستمر
     */
    private fun startAggressiveRefreshLoop() {
        refreshJob?.cancel()
        refreshJob = serviceScope.launch {
            while (isActive) {
                delay(1500L)

                // توقف السحب فوراً إذا وجد طلب قيد الفحص أو القبول
                if (isEvaluatingOrder.get()) continue

                if (isTargetDeliveryApp(currentForegroundPackage)) {
                    withContext(Dispatchers.Main) {
                        performSwipeDownToRefresh()
                    }
                }
            }
        }
    }

    /**
     * محاكاة حركة السحب للأسفل بالعتاد الأصلي في 160ms فقط
     */
    private fun performSwipeDownToRefresh() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.N) return
        if (isEvaluatingOrder.get()) return

        val metrics = resources.displayMetrics
        val centerX = metrics.widthPixels * 0.5f
        val startY = metrics.heightPixels * 0.24f
        val endY = metrics.heightPixels * 0.72f

        val swipePath = Path().apply {
            moveTo(centerX, startY)
            lineTo(centerX, endY)
        }

        val stroke = GestureDescription.StrokeDescription(swipePath, 0, 160)
        val gesture = GestureDescription.Builder().addStroke(stroke).build()
        dispatchGesture(gesture, null, null)
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        if (event == null) return

        event.packageName?.toString()?.let { currentForegroundPackage = it }

        if (event.eventType != AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED &&
            event.eventType != AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED) return

        val root = rootInActiveWindow ?: return
        inspectScreenZeroDelay(root, currentForegroundPackage)
    }

    /**
     * فحص فوري بدون أي تأخير زمني
     */
    private fun inspectScreenZeroDelay(root: AccessibilityNodeInfo, packageName: String) {
        val texts = mutableListOf<String>()
        collectAllTexts(root, texts)
        if (texts.isEmpty()) return

        val fullText = texts.joinToString(" ")

        // استخراج المسافة
        val distMatcher = distancePattern.matcher(fullText)
        if (!distMatcher.find()) return
        val distStr = distMatcher.group(1) ?: return
        val distanceKm = distStr.toDoubleOrNull() ?: return

        // استخراج أجر التوصيل إن وُجد
        var payoutSar = 18.0
        val payoutMatcher = payoutPattern.matcher(fullText)
        if (payoutMatcher.find()) {
            payoutMatcher.group(1)?.toDoubleOrNull()?.let { payoutSar = it }
        }

        // منع التكرار خلال 12 ثانية
        val orderKey = "$packageName|$distanceKm|$payoutSar"
        val now = System.currentTimeMillis()
        if (processedOrdersCache[orderKey]?.let { now - it < 12_000 } == true) return
        processedOrdersCache[orderKey] = now

        // إيقاف السحب فوراً حتى لا يشوش على النقر
        isEvaluatingOrder.set(true)
        Log.i("LocateGoService", "🚨 OFFER DETECTED: $distanceKm km | $payoutSar SAR. Pausing refresh swipe.")

        // التحقق المحلي الفوري من شرط الـ 2.0 كم
        val maxAllowedKm = getSharedPreferences("locate_go_prefs", Context.MODE_PRIVATE)
            .getFloat("max_distance_km", 2.0f)
            .toDouble()

        if (distanceKm > maxAllowedKm) {
            Log.w("LocateGoService", "Order distance ($distanceKm km) exceeds max allowed radius ($maxAllowedKm km). Ignored.")
            notifyDriverRejected()
            resumeRefreshAfterDelay(2000)
            return
        }

        // إرسال فوري إلى خادم Render
        val appName = resolveAppName(packageName, fullText)
        val storeName = resolveStoreName(texts)

        serviceScope.launch {
            val result = renderClient.evaluateOrder(
                appName = appName,
                storeName = storeName,
                distanceKm = distanceKm,
                payoutSar = payoutSar,
                driverLat = LocationTrackingService.currentLatitude,
                driverLng = LocationTrackingService.currentLongitude
            )

            result.onSuccess { eval ->
                if (eval.isAccepted) {
                    withContext(Dispatchers.Main) {
                        executeInstantHybridAutoAccept(root)
                        notifyDriverAccepted()
                    }
                    resumeRefreshAfterDelay(5000)
                } else {
                    withContext(Dispatchers.Main) {
                        notifyDriverRejected()
                    }
                    resumeRefreshAfterDelay(2000)
                }
            }.onFailure {
                // في حال تعذر الاتصال بالشبكة، نعتمد الفحص المحلي للـ 2 كم فوراً لضمان عدم ضياع الطلب
                if (distanceKm <= maxAllowedKm) {
                    withContext(Dispatchers.Main) {
                        executeInstantHybridAutoAccept(root)
                        notifyDriverAccepted()
                    }
                    resumeRefreshAfterDelay(5000)
                } else {
                    resumeRefreshAfterDelay(2500)
                }
            }
        }
    }

    /**
     * تنفيذ النقر المزدوج الهجين على زر القبول
     */
    private fun executeInstantHybridAutoAccept(root: AccessibilityNodeInfo) {
        val currentRoot = rootInActiveWindow ?: root
        val acceptKeywords = listOf("قبول", "قبول الطلب", "استلام الطلب", "تأكيد", "Accept", "Take Order", "وافق")

        for (keyword in acceptKeywords) {
            val nodes = currentRoot.findAccessibilityNodeInfosByText(keyword)
            for (node in nodes) {
                // المحاولة 1: النقر البرمجي
                if (performClickOnNode(node)) {
                    Log.i("LocateGoService", "⚡ Auto-clicked Accept via Accessibility Action.")
                    return
                }

                // المحاولة 2: نقر الإحداثيات على الشاشة
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                    val bounds = Rect()
                    node.getBoundsInScreen(bounds)
                    if (!bounds.isEmpty) {
                        performTapAtCoordinates(bounds.centerX().toFloat(), bounds.centerY().toFloat())
                        Log.i("LocateGoService", "⚡ Auto-clicked Accept via Screen Coordinate Tap.")
                        return
                    }
                }
            }
        }
    }

    private fun performClickOnNode(node: AccessibilityNodeInfo?): Boolean {
        var current = node
        while (current != null) {
            if (current.isClickable) return current.performAction(AccessibilityNodeInfo.ACTION_CLICK)
            current = current.parent
        }
        return false
    }

    private fun performTapAtCoordinates(x: Float, y: Float) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.N) return
        val tapPath = Path().apply { moveTo(x, y) }
        val stroke = GestureDescription.StrokeDescription(tapPath, 0, 45)
        val gesture = GestureDescription.Builder().addStroke(stroke).build()
        dispatchGesture(gesture, null, null)
    }

    private fun resumeRefreshAfterDelay(delayMs: Long) {
        serviceScope.launch {
            delay(delayMs)
            isEvaluatingOrder.set(false)
        }
    }

    private fun isTargetDeliveryApp(pkg: String): Boolean {
        val p = pkg.lowercase()
        return p.contains("jahez") || p.contains("hunger") || p.contains("marsool") || 
               p.contains("toyou") || p.contains("chefz") || p.contains("ninja") || p.contains("locate")
    }

    private fun resolveAppName(pkg: String, fullText: String): String {
        return when {
            pkg.contains("jahez", true) || fullText.contains("جاهز") -> "جاهز"
            pkg.contains("hunger", true) || fullText.contains("هنقرستيشن") -> "هنقرستيشن"
            pkg.contains("marsool", true) || fullText.contains("مرسول") -> "مرسول"
            pkg.contains("toyou", true) || fullText.contains("تويو") -> "تويو"
            else -> "تطبيق توصيل"
        }
    }

    private fun resolveStoreName(texts: List<String>): String {
        return texts.firstOrNull { 
            it.length in 4..35 && 
            !it.contains("كم") && 
            !it.contains("ريال") && 
            !it.contains("قبول") && 
            !it.contains("طلب") 
        } ?: "متجر معروض"
    }

    private fun notifyDriverAccepted() {
        try {
            ToneGenerator(AudioManager.STREAM_NOTIFICATION, 100).startTone(ToneGenerator.TONE_PROP_BEEP2, 220)
            (getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator)?.let {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    it.vibrate(VibrationEffect.createOneShot(180, VibrationEffect.DEFAULT_AMPLITUDE))
                } else {
                    @Suppress("DEPRECATION")
                    it.vibrate(180)
                }
            }
        } catch (_: Exception) {}
    }

    private fun notifyDriverRejected() {
        try {
            (getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator)?.let {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    it.vibrate(VibrationEffect.createOneShot(80, VibrationEffect.DEFAULT_AMPLITUDE))
                } else {
                    @Suppress("DEPRECATION")
                    it.vibrate(80)
                }
            }
        } catch (_: Exception) {}
    }

    private fun collectAllTexts(node: AccessibilityNodeInfo?, list: MutableList<String>) {
        if (node == null) return
        node.text?.toString()?.trim()?.let { if (it.isNotEmpty()) list.add(it) }
        for (i in 0 until node.childCount) {
            collectAllTexts(node.getChild(i), list)
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        refreshJob?.cancel()
        serviceScope.cancel()
    }

    override fun onInterrupt() {}
}
