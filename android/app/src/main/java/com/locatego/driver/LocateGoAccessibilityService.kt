package com.locatego.driver

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.AccessibilityServiceInfo
import android.accessibilityservice.GestureDescription
import android.content.Context
import android.graphics.Path
import android.graphics.Rect
import android.media.AudioManager
import android.media.ToneGenerator
import android.os.Build
import android.os.Handler
import android.os.Looper
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
 * التحديثات الحصرية:
 * 1. تقييد المراقبة وقراءة الشاشة حصرياً للحزمتين:
 *    - "Sa.lg.android.locate"
 *    - "sa.lg.android.locatcc"
 * 2. إيقاف وتطهير وسائط ومؤقتات السحب الآلي تماماً (Handler.removeCallbacksAndMessages) فور الخروج من التطبيقين
 * 3. تصفية النصوص برمجياً لاستخراج بيانات الطلبات فقط واستبعاد القوائم والأزرار الجانبية
 */
class LocateGoAccessibilityService : AccessibilityService() {

    companion object {
        // الحزمتان المستهدفتان حصرياً
        val TARGET_PACKAGES = setOf(
            "sa.lg.android.locate",
            "sa.lg.android.locatcc"
        )

        fun isTargetPackage(pkg: String?): Boolean {
            if (pkg.isNullOrBlank()) return false
            val p = pkg.trim()
            return p == "Sa.lg.android.locate" || p == "sa.lg.android.locatcc" || TARGET_PACKAGES.contains(p.lowercase())
        }

        // قائمة الكلمات والنصوص الواجب تجاهلها (القوائم، التبويبات، الإعدادات، وأزرار التنقل العامة)
        private val IGNORED_NAV_TEXTS = setOf(
            "الرئيسية", "حسابي", "الملف الشخصي", "الإعدادات", "المحفظة", "الدعم", "مساعدة",
            "المساعدة", "تسجيل الخروج", "تسجيل خروج", "خروج", "الأرشيف", "السجل", "الإشعارات",
            "شروط الاستخدام", "سياسة الخصوصية", "حول التطبيق", "تحديث التطبيق", "تقييم",
            "المظهر", "اللغة", "الوضع الليلي", "حفظ", "إغلاق", "رجوع", "تخطي", "موافق",
            "إلغاء", "تأكيد الهاتف", "رمز التحقق", "التفاصيل", "عرض التفاصيل", "التالي", "السابق",
            "home", "profile", "settings", "wallet", "support", "help", "logout", "history",
            "notifications", "about", "close", "back", "cancel", "menu", "next", "skip"
        )

        // كلمات أزرار القبول المستهدفة للنقر التلقائي
        private val ACCEPT_BUTTON_KEYWORDS = listOf(
            "قبول", "قبول الطلب", "استلام الطلب", "تأكيد القبول", "تأكيد", "Accept", "Take Order", "وافق"
        )
    }

    private val serviceScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private lateinit var renderClient: RenderApiClient

    // وسائط التحكم في السحب الآلي
    private val swipeHandler = Handler(Looper.getMainLooper())
    private var isSwipeLoopRunning = false

    // تعابير نمطية مستهدفة بدقة لبيانات عروض الطلبات
    private val distancePattern = Pattern.compile(
        "(?:المسافة|يبعد|تبعد|distance)?\\s*[:]?\\s*(\\d+(?:[.,]\\d+)?)\\s*(?:كم|كيلو|km|k\\.m)",
        Pattern.CASE_INSENSITIVE or Pattern.UNICODE_CASE
    )
    private val payoutPattern = Pattern.compile(
        "(?:الأجر|المبلغ|السعر|قيمة\\s*التوصيل|الربح|الأرباح|fee|sar|payout)?\\s*[:]?\\s*(\\d+(?:[.,]\\d+)?)\\s*(?:ر\\.س|ريال|sar|SAR|ر\\.\\s*س)",
        Pattern.CASE_INSENSITIVE or Pattern.UNICODE_CASE
    )
    private val orderIdPattern = Pattern.compile(
        "(?:رقم\\s*الطلب|الطلب\\s*رقم|طلب\\s*#|Order\\s*#?|ID\\s*[:#]?|#)\\s*([A-Za-z0-9\\-_]{3,15})",
        Pattern.CASE_INSENSITIVE or Pattern.UNICODE_CASE
    )
    private val districtPattern = Pattern.compile(
        "(?:التوصيل\\s*إلى|الوجهة|العميل|حي|district)?\\s*[:]?\\s*(حي\\s+[\\u0600-\\u06FF]+(?:\\s+[\\u0600-\\u06FF]+)?)",
        Pattern.CASE_INSENSITIVE or Pattern.UNICODE_CASE
    )

    private val isEvaluatingOrder = AtomicBoolean(false)
    private var currentForegroundPackage = ""
    private val processedOrdersCache = ConcurrentHashMap<String, Long>()

    override fun onServiceConnected() {
        super.onServiceConnected()
        renderClient = RenderApiClient(this)

        Log.i("LocateGoService", "⚡ LocateGoAccessibilityService is ACTIVE. Restricted exclusively to Sa.lg.android.locate & sa.lg.android.locatcc.")
    }

    /**
     * إيقاف وتطهير مؤقت وسائط السحب الآلي تماماً فوراً
     */
    private fun stopSwipeLoop() {
        isSwipeLoopRunning = false
        swipeHandler.removeCallbacksAndMessages(null)
        currentForegroundPackage = ""
    }

    /**
     * بدء السحب الآلي حصرياً داخل التطبيقين المستهدفين
     */
    private fun startSwipeLoop() {
        if (isSwipeLoopRunning) return
        if (!isTargetPackage(currentForegroundPackage)) return

        isSwipeLoopRunning = true
        swipeHandler.removeCallbacksAndMessages(null)
        swipeHandler.postDelayed(swipeRunnable, 1000L)
    }

    private val swipeRunnable = object : Runnable {
        override fun run() {
            if (!isSwipeLoopRunning) return

            // 1. التحقق من الحزمة المحفوظة
            if (!isTargetPackage(currentForegroundPackage)) {
                stopSwipeLoop()
                return
            }

            // 2. التحقق من النافذة النشطة في الشاشة حالياً
            val activeRoot = rootInActiveWindow
            val activePkg = activeRoot?.packageName?.toString() ?: ""
            if (activePkg.isNotEmpty() && !isTargetPackage(activePkg)) {
                stopSwipeLoop()
                return
            }

            // 3. تنفيذ السحب إذا لم يكن هناك طلب قيد الفحص
            if (!isEvaluatingOrder.get()) {
                performSwipeDownToRefresh()
            }

            // 4. إعادة الجدولة إذا ما زال التطبيق في الواجهة
            if (isSwipeLoopRunning && isTargetPackage(currentForegroundPackage)) {
                swipeHandler.postDelayed(this, 1500L)
            }
        }
    }

    /**
     * محاكاة حركة السحب للأسفل بالعتاد الأصلي في 160ms فقط لتحديث الشاشة
     */
    private fun performSwipeDownToRefresh() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.N) return
        if (isEvaluatingOrder.get()) return

        // فحص صارم قبل بث الإيماءة لضمان عدم لمس أي نافذة غير مصرح بها
        val activeRoot = rootInActiveWindow
        val activePkg = activeRoot?.packageName?.toString() ?: ""
        if (activePkg.isNotEmpty() && !isTargetPackage(activePkg)) {
            stopSwipeLoop()
            return
        }

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

        val packageName: String = event.packageName?.toString() ?: ""
        val lowerPkg: String = packageName.lowercase().trim()
        val isTarget = (packageName == "Sa.lg.android.locate" ||
                        packageName == "sa.lg.android.locatcc" ||
                        lowerPkg == "sa.lg.android.locate" ||
                        lowerPkg == "sa.lg.android.locatcc")

        // إذا كانت الحزمة الحالية ليست ضمن القائمة المسموحة: إيقاف وتطهير فوري للسحب والخروج
        if (!isTarget) {
            stopSwipeLoop()
            return
        }

        currentForegroundPackage = packageName
        startSwipeLoop()

        if (event.eventType != AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED &&
            event.eventType != AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED) return

        val root = rootInActiveWindow ?: return
        inspectScreenFilteredOrderOnly(root, packageName)
    }

    /**
     * تصفية الشاشة برمجياً واستخلاص بيانات عروض الطلبات فقط
     */
    private fun inspectScreenFilteredOrderOnly(root: AccessibilityNodeInfo, packageName: String) {
        // جمع وتصفية النصوص الهامة فقط مع استبعاد نصوص القوائم والأزرار الجانبية
        val orderTexts = mutableListOf<String>()
        collectOrderTextsOnly(root, orderTexts)

        if (orderTexts.isEmpty()) return

        val joinedContent = orderTexts.joinToString(" ")

        // 1. استخراج المسافة: إذا لم تتوفر مسافة واضحة، فالشاشة ليست شاشة عرض طلب
        val distMatcher = distancePattern.matcher(joinedContent)
        if (!distMatcher.find()) return
        val rawDistStr = distMatcher.group(1)?.replace(',', '.') ?: return
        val distanceKm = rawDistStr.toDoubleOrNull() ?: return
        if (distanceKm <= 0.0) return

        // 2. استخراج رقم الطلب إن وجد
        var extractedOrderId: String? = null
        val idMatcher = orderIdPattern.matcher(joinedContent)
        if (idMatcher.find()) {
            extractedOrderId = idMatcher.group(1)
        }

        // 3. استخراج سعر / أجر التوصيل
        var payoutSar = 18.0
        val payoutMatcher = payoutPattern.matcher(joinedContent)
        if (payoutMatcher.find()) {
            payoutMatcher.group(1)?.replace(',', '.')?.toDoubleOrNull()?.let { payoutSar = it }
        }

        // 4. استخراج اسم المتجر من النصوص المصفاة
        val storeName = extractStoreName(orderTexts)

        // 5. استخراج تفاصيل التوصيل أو الحي المستهدف
        val customerDistrict = extractCustomerDistrict(joinedContent, orderTexts)

        // 6. منع تكرار نفس الطلب خلال 12 ثانية لتجنب إرسال طلبات مكررة لنفس العرض
        val deduplicationKey = "${extractedOrderId ?: ""}|$distanceKm|$payoutSar|$storeName"
        val now = System.currentTimeMillis()
        if (processedOrdersCache[deduplicationKey]?.let { now - it < 12_000 } == true) return
        processedOrdersCache[deduplicationKey] = now

        // إيقاف السحب فوراً للتركيز على فحص الطلب
        isEvaluatingOrder.set(true)
        Log.i(
            "LocateGoService",
            "🎯 ORDER OFFER CAPTURED: ID=${extractedOrderId ?: "N/A"} | Store=$storeName | Dist=$distanceKm km | Payout=$payoutSar SAR | Dest=${customerDistrict ?: "N/A"}"
        )

        // فحص شرط المسافة محلياً (الحد الأقصى للنطاق)
        val maxAllowedKm = getSharedPreferences("locate_go_prefs", Context.MODE_PRIVATE)
            .getFloat("max_distance_km", 2.0f)
            .toDouble()

        if (distanceKm > maxAllowedKm) {
            Log.w("LocateGoService", "⚠️ Order distance ($distanceKm km) exceeds radius limit ($maxAllowedKm km). Ignored locally.")
            notifyDriverRejected()
            resumeRefreshAfterDelay(2000)
            return
        }

        // اسم التطبيق المستهدف
        val resolvedAppName = if (packageName.contains("locatcc", true)) "Locate CC" else "Locate Go"

        // إرسال البيانات المصفاة فقط إلى سيرفر Render
        serviceScope.launch {
            val result = renderClient.evaluateOrder(
                appName = resolvedAppName,
                storeName = storeName,
                distanceKm = distanceKm,
                payoutSar = payoutSar,
                orderId = extractedOrderId,
                customerDistrict = customerDistrict,
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
                // في حال انقطاع الشبكة، يتم الاعتماد على الفحص المحلي (نطاق الـ 2.0 كم) لضمان عدم ضياع الطلب
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
     * جمع نصوص عروض الطلبات وتصفية القوائم والأزرار غير المتعلقة بها
     */
    private fun collectOrderTextsOnly(node: AccessibilityNodeInfo?, list: MutableList<String>) {
        if (node == null) return

        val text = node.text?.toString()?.trim()
        val desc = node.contentDescription?.toString()?.trim()

        val candidate = when {
            !text.isNullOrEmpty() -> text
            !desc.isNullOrEmpty() -> desc
            else -> null
        }

        if (candidate != null && candidate.length in 2..120) {
            val normalizedLower = candidate.lowercase()
            val isIgnoredNav = IGNORED_NAV_TEXTS.any { ignored ->
                normalizedLower == ignored || normalizedLower.startsWith("$ignored ") || normalizedLower.endsWith(" $ignored")
            }

            if (!isIgnoredNav) {
                list.add(candidate)
            }
        }

        for (i in 0 until node.childCount) {
            collectOrderTextsOnly(node.getChild(i), list)
        }
    }

    /**
     * استخراج اسم المتجر الحقيقي من قائمة النصوص المصفاة
     */
    private fun extractStoreName(texts: List<String>): String {
        for (item in texts) {
            val trimmed = item.trim()
            if (trimmed.length in 3..35 &&
                !distancePattern.matcher(trimmed).find() &&
                !payoutPattern.matcher(trimmed).find() &&
                !orderIdPattern.matcher(trimmed).find() &&
                !ACCEPT_BUTTON_KEYWORDS.any { trimmed.equals(it, ignoreCase = true) } &&
                !trimmed.contains("توصيل", true) &&
                !trimmed.contains("طلب", true) &&
                !trimmed.contains("رفض", true) &&
                !trimmed.contains("تجاهل", true)
            ) {
                return trimmed
            }
        }
        return "متجر العرض"
    }

    /**
     * استخراج الحي أو تفاصيل وجهة التوصيل
     */
    private fun extractCustomerDistrict(fullContent: String, texts: List<String>): String? {
        val matcher = districtPattern.matcher(fullContent)
        if (matcher.find()) {
            return matcher.group(1)?.trim()
        }

        return texts.firstOrNull {
            it.contains("حي ", true) ||
            it.contains("شارع ", true) ||
            it.contains("طريق ", true) ||
            it.contains("مجمع ", true)
        }
    }

    /**
     * تنفيذ النقر الفوري الهجين على زر قبول الطلب
     */
    private fun executeInstantHybridAutoAccept(root: AccessibilityNodeInfo) {
        val currentRoot = rootInActiveWindow ?: root

        for (keyword in ACCEPT_BUTTON_KEYWORDS) {
            val nodes = currentRoot.findAccessibilityNodeInfosByText(keyword)
            for (node in nodes) {
                // المحاولة 1: النقر البرمجي على العقدة
                if (performClickOnNode(node)) {
                    Log.i("LocateGoService", "⚡ Auto-clicked Accept via Accessibility Action.")
                    return
                }

                // المحاولة 2: نقر الإحداثيات المباشرة على الشاشة
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

    override fun onDestroy() {
        stopSwipeLoop()
        serviceScope.cancel()
        super.onDestroy()
    }

    override fun onInterrupt() {
        stopSwipeLoop()
    }
}

