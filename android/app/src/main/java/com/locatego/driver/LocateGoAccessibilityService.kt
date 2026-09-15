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
 * خدمة مراقبة شاشة تطبيقات التوصيل والاعتراض الفوري للطلبات (Zero-Delay Auto-Accept).
 *
 * التعديلات الحصرية:
 * 1. إلغاء ميزة السحب التلقائي (Swipe Down / Swipe Loop) نهائياً وبشكل كامل. لا يتم تنفيذ أي حركة سحب للشاشة.
 * 2. معيار الفحص والقبول الحصري:
 *    - الشرط الأساسي والوحيد للمسافة: "مسافة العميل / الوجهة" (Delivery Distance) <= الحد الأقصى للمسافة المحددة (مثلاً 2 كم).
 *    - "مسافة المطعم / الاستلام" (Pickup Distance): اختيارية ومفتوحة تماماً بغض النظر عن قيمتها، بحيث يتم قبول الطلب فوراً حتى لو كان المطعم بعيداً.
 * 3. بمجرد ظهور الطلب ومطابقته للشرط (مسافة العميل <= الحد الأقصى)، يتم النقر المباشر والفوري على زر القبول ("Accept") في أقل من 10ms دون أي تأخير،
 *    ودون الحاجة لأي عملية تحديث أو سحب للشاشة، مع إرسال تقرير الطلب لسيرفر Render في الخلفية.
 */
class LocateGoAccessibilityService : AccessibilityService() {

    companion object {
        // مصفوفة حزم تطبيقات التوصيل المستهدفة بالكامل
        val TARGET_PACKAGES = setOf(
            "sa.lg.android.locate",
            "sa.lg.android.locatcc",
            "sa.lg.android.locati",
            "sa.lg.android.locatm",
            "sa.lg.android.locatg",
            "sa.lg.android.locatf",
            "Sa.lg.android.locate",
            "Sa.lg.android.locati",
            "Sa.lg.android.locatf"
        )

        fun isTargetPackage(pkg: String?): Boolean {
            if (pkg.isNullOrBlank()) return false
            val p = pkg.trim()
            return TARGET_PACKAGES.contains(p) || TARGET_PACKAGES.contains(p.lowercase())
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

        // كلمات أزرار القبول المستهدفة للنقر التلقائي الفوري
        private val ACCEPT_BUTTON_KEYWORDS = listOf(
            "قبول", "قبول الطلب", "استلام الطلب", "تأكيد القبول", "تأكيد", "وافق", "موافق",
            "Accept", "Take Order", "Confirm", "Accept Order", "إسناد", "استلام", "موافقة"
        )

        // معرّفات عناصر أزرار القبول المحتملة في واجهات التطبيقات
        private val ACCEPT_VIEW_IDS = listOf(
            "btn_accept", "accept", "accept_order", "btnAccept", "btn_confirm",
            "order_accept", "take_order", "button_accept", "action_accept", "btn_take"
        )
    }

    private val serviceScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private lateinit var renderClient: RenderApiClient

    // تعابير نمطية مستهدفة بدقة عالية لبيانات عروض الطلبات
    // 1. مسافة المطعم / الاستلام
    private val pickupDistancePattern = Pattern.compile(
        "(?:مسافة\\s*(?:المتجر|المطعم|الاستلام)|المتجر\\s*يبعد|المطعم\\s*يبعد|مسافة\\s*الاستلام|الاستلام|المطعم|المتجر|pickup|store)\\s*[:]?\\s*(\\d+(?:[.,]\\d+)?)\\s*(?:كم|كيلو|km|k\\.m)",
        Pattern.CASE_INSENSITIVE or Pattern.UNICODE_CASE
    )

    // 2. مسافة العميل / التوصيل
    private val deliveryDistancePattern = Pattern.compile(
        "(?:مسافة\\s*(?:العميل|التوصيل|الوجهة)|العميل\\s*يبعد|مسافة\\s*التوصيل|التوصيل|العميل|الوجهة|delivery|dropoff|customer)\\s*[:]?\\s*(\\d+(?:[.,]\\d+)?)\\s*(?:كم|كيلو|km|k\\.m)",
        Pattern.CASE_INSENSITIVE or Pattern.UNICODE_CASE
    )

    // 3. المسافة العامة أو الإجمالية
    private val generalDistancePattern = Pattern.compile(
        "(?:المسافة\\s*الإجمالية|إجمالي\\s*المسافة|المسافة\\s*الكلية|المسافة|يبعد|تبعد|distance|total)?\\s*[:]?\\s*(\\d+(?:[.,]\\d+)?)\\s*(?:كم|كيلو|km|k\\.m)",
        Pattern.CASE_INSENSITIVE or Pattern.UNICODE_CASE
    )

    // 4. أجر التوصيل (بالريال السعودي)
    private val payoutPattern = Pattern.compile(
        "(?:الأجر|المبلغ|السعر|قيمة\\s*التوصيل|الربح|الأرباح|fee|sar|payout)?\\s*[:]?\\s*(\\d+(?:[.,]\\d+)?)\\s*(?:ر\\.س|ريال|sar|SAR|ر\\.\\s*س)",
        Pattern.CASE_INSENSITIVE or Pattern.UNICODE_CASE
    )

    // 5. رقم الطلب
    private val orderIdPattern = Pattern.compile(
        "(?:رقم\\s*الطلب|الطلب\\s*رقم|طلب\\s*#|Order\\s*#?|ID\\s*[:#]?|#)\\s*([A-Za-z0-9\\-_]{3,15})",
        Pattern.CASE_INSENSITIVE or Pattern.UNICODE_CASE
    )

    // 6. حي أو وجهة العميل
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
        Log.i("LocateGoService", "⚡ LocateGoAccessibilityService is ACTIVE (Pure Screen Observer • No-Swipe Mode • Zero-Delay Auto-Accept).")
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        if (event == null) return

        val packageName: String = event.packageName?.toString() ?: ""
        val isTarget = isTargetPackage(packageName)

        // تجاهل أي تطبيق ليس ضمن التطبيقات المستهدفة
        if (!isTarget) {
            currentForegroundPackage = ""
            return
        }

        currentForegroundPackage = packageName

        // مراقبة أي تحديث أو تغير في محتوى أو حالة النافذة
        if (event.eventType != AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED &&
            event.eventType != AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED) return

        val root = rootInActiveWindow ?: return
        inspectScreenForOrderOffer(root, packageName)
    }

    /**
     * فحص الشاشة بدقة فائقة لاستخراج تفاصيل الطلب والمقارنة مع الإعدادات والنقر الفوري
     */
    private fun inspectScreenForOrderOffer(root: AccessibilityNodeInfo, packageName: String) {
        // جمع وتصفية النصوص المعروضة فقط
        val orderTexts = mutableListOf<String>()
        collectOrderTextsOnly(root, orderTexts)

        if (orderTexts.isEmpty()) return

        val joinedContent = orderTexts.joinToString(" ")

        // 1. استخراج مسافة المطعم / الاستلام (Pickup Distance)
        var pickupDistKm: Double? = null
        val pickupMatcher = pickupDistancePattern.matcher(joinedContent)
        if (pickupMatcher.find()) {
            pickupDistKm = pickupMatcher.group(1)?.replace(',', '.')?.toDoubleOrNull()
        }

        // 2. استخراج مسافة العميل / التوصيل (Delivery Distance)
        var deliveryDistKm: Double? = null
        val deliveryMatcher = deliveryDistancePattern.matcher(joinedContent)
        if (deliveryMatcher.find()) {
            deliveryDistKm = deliveryMatcher.group(1)?.replace(',', '.')?.toDoubleOrNull()
        }

        // 3. استخراج المسافة العامة / الإجمالية
        var generalDistKm: Double? = null
        val genMatcher = generalDistancePattern.matcher(joinedContent)
        if (genMatcher.find()) {
            generalDistKm = genMatcher.group(1)?.replace(',', '.')?.toDoubleOrNull()
        }

        // التحقق الذكي من وجود أرقام مسافات بالكيلومتر في قائمة النصوص إن لم تكتشفها الأنماط الصريحة
        if (pickupDistKm == null && deliveryDistKm == null && generalDistKm == null) {
            val distList = extractAllDistancesFromTexts(orderTexts)
            if (distList.isNotEmpty()) {
                generalDistKm = distList.first()
            }
        }

        // المسافة الأساسية لتقييم الطلب:
        // الشرط الأساسي والوحيد للقبول هو أن تكون "مسافة العميل / الوجهة" <= الحد الأقصى المحدد في الإعدادات (مثلاً 2 كم).
        // أما "مسافة المطعم / الاستلام" فتكون اختيارية ومفتوحة بغض النظر عن قيمتها (حتى لو كان المطعم بعيداً).
        val targetEvaluationDistanceKm = deliveryDistKm ?: generalDistKm ?: pickupDistKm ?: return
        if (targetEvaluationDistanceKm <= 0.0) return

        // 4. استخراج رقم الطلب إن وجد
        var extractedOrderId: String? = null
        val idMatcher = orderIdPattern.matcher(joinedContent)
        if (idMatcher.find()) {
            extractedOrderId = idMatcher.group(1)
        }

        // 5. استخراج أجر وسعر التوصيل
        var payoutSar = 18.0
        val payoutMatcher = payoutPattern.matcher(joinedContent)
        if (payoutMatcher.find()) {
            payoutMatcher.group(1)?.replace(',', '.')?.toDoubleOrNull()?.let { payoutSar = it }
        }

        // 6. استخراج اسم المتجر من النصوص المصفاة
        val storeName = extractStoreName(orderTexts)

        // 7. استخراج تفاصيل الحي أو وجهة العميل
        val customerDistrict = extractCustomerDistrict(joinedContent, orderTexts)

        // 8. منع تكرار النقر على نفس الطلب خلال 8 ثوانٍ لتفادي النقر المزدوج غير الضروري
        val deduplicationKey = "${extractedOrderId ?: ""}|$targetEvaluationDistanceKm|$payoutSar|$storeName"
        val now = System.currentTimeMillis()
        if (processedOrdersCache[deduplicationKey]?.let { now - it < 8_000 } == true) return

        // قراءة إعدادات السائق المحددة محلياً من SharedPreferences
        val prefs = getSharedPreferences("locate_go_prefs", Context.MODE_PRIVATE)
        val maxAllowedKm = prefs.getFloat("max_distance_km", 2.0f).toDouble()
        val minPayoutSar = prefs.getFloat("min_payout_sar", 0.0f).toDouble()
        val isAutoAcceptEnabled = prefs.getBoolean("auto_accept", true)

        Log.i(
            "LocateGoService",
            "🎯 NEW OFFER DETECTED: Store='$storeName' | DeliveryDist=${deliveryDistKm ?: "N/A"} km (Strict Max: $maxAllowedKm km) | PickupDist=${pickupDistKm ?: "N/A"} km (Open/Optional) | EvalDist=$targetEvaluationDistanceKm km | Payout=$payoutSar SAR"
        )

        // =========================================================================
        // قاعدة الفحص والقبول الصارمة وفق متطلبات السائق:
        // 1. مسافة العميل / الوجهة <= الحد الأقصى للمسافة (مثلاً 2 كم).
        // 2. مسافة المطعم مفتوحة واختيارية تماماً ولا تعطل القبول أبداً.
        // =========================================================================
        val isDeliveryWithinLimit = targetEvaluationDistanceKm <= maxAllowedKm
        val isPayoutAccepted = payoutSar >= minPayoutSar
        val isOrderMatching = isAutoAcceptEnabled && isDeliveryWithinLimit && isPayoutAccepted

        val lowerPkg = packageName.lowercase()
        val resolvedAppName = when {
            lowerPkg.contains("locatcc") -> "Locate CC"
            lowerPkg.contains("locati") -> "Locate I"
            lowerPkg.contains("locatm") -> "Locate M"
            lowerPkg.contains("locatg") -> "Locate G"
            lowerPkg.contains("locatf") -> "Locate F"
            lowerPkg.contains("locate") -> "Locate Go"
            else -> "Locate Driver"
        }

        if (isOrderMatching) {
            // حفظ الطلب في الذاكرة لمنع تكراره
            processedOrdersCache[deduplicationKey] = now
            isEvaluatingOrder.set(true)

            // =========================================================================
            // تنفيذ النقر المباشر والفوري على زر القبول ("Accept") دون أي تأخير إطلاقاً
            // =========================================================================
            val clickSuccess = executeInstantDirectAccept(root)
            Log.i(
                "LocateGoService",
                "⚡⚡ ZERO-DELAY ACCEPT TRIGGERED! Click success = $clickSuccess for order at $storeName (Customer dist: ${deliveryDistKm ?: targetEvaluationDistanceKm} km <= $maxAllowedKm km, Restaurant dist: ${pickupDistKm ?: "N/A"} km - Open)"
            )

            // تنبيه صوتي واهتزاز فوري للمندوب بنجاح القبول
            notifyDriverAccepted()

            // إرسال تفاصيل الطلب المقبول لحظياً إلى سيرفر Render في الخلفية دون تعطيل واجهة المستخدم
            serviceScope.launch {
                renderClient.evaluateOrder(
                    appName = resolvedAppName,
                    storeName = storeName,
                    distanceKm = targetEvaluationDistanceKm,
                    payoutSar = payoutSar,
                    orderId = extractedOrderId,
                    customerDistrict = customerDistrict,
                    driverLat = LocationTrackingService.currentLatitude,
                    driverLng = LocationTrackingService.currentLongitude,
                    pickupDistanceKm = pickupDistKm,
                    deliveryDistanceKm = deliveryDistKm
                )
                delay(3000L)
                isEvaluatingOrder.set(false)
            }
        } else {
            // إذا لم تطابق مسافة العميل الحد الأقصى
            processedOrdersCache[deduplicationKey] = now
            val rejectReason = when {
                !isDeliveryWithinLimit -> "مسافة العميل/الوجهة (${deliveryDistKm ?: targetEvaluationDistanceKm} كم) تتجاوز الحد الأقصى المحدد ($maxAllowedKm كم)"
                !isPayoutAccepted -> "أجر التوصيل ($payoutSar ر.س) أقل من الحد الأدنى ($minPayoutSar ر.س)"
                else -> "القبول التلقائي متوقف في الإعدادات"
            }

            Log.w("LocateGoService", "🚫 ORDER REJECTED LOCALLY: $rejectReason")
            notifyDriverRejected()

            // إبلاغ السيرفر لتوثيق الإحصائيات في الخلفية
            serviceScope.launch {
                renderClient.evaluateOrder(
                    appName = resolvedAppName,
                    storeName = storeName,
                    distanceKm = targetEvaluationDistanceKm,
                    payoutSar = payoutSar,
                    orderId = extractedOrderId,
                    customerDistrict = customerDistrict,
                    driverLat = LocationTrackingService.currentLatitude,
                    driverLng = LocationTrackingService.currentLongitude,
                    pickupDistanceKm = pickupDistKm,
                    deliveryDistanceKm = deliveryDistKm
                )
            }
        }
    }

    /**
     * تنفيذ النقر الفوري والمباشر على زر القبول ("Accept") بأعلى سرعة ممكنة
     */
    private fun executeInstantDirectAccept(root: AccessibilityNodeInfo): Boolean {
        val currentRoot = rootInActiveWindow ?: root

        // الطريقة 1: البحث المباشر عن طريق نصوص كلمات أزرار القبول
        for (keyword in ACCEPT_BUTTON_KEYWORDS) {
            val nodes = currentRoot.findAccessibilityNodeInfosByText(keyword)
            for (node in nodes) {
                if (performFastClickAndTap(node)) {
                    Log.i("LocateGoService", "⚡ Accept clicked via text match: '$keyword'")
                    return true
                }
            }
        }

        // الطريقة 2: البحث عن طريق معرّفات عناصر زر القبول في الواجهة (View IDs)
        for (viewId in ACCEPT_VIEW_IDS) {
            val fullId = "${currentForegroundPackage}:id/$viewId"
            val nodes = currentRoot.findAccessibilityNodeInfosByViewId(fullId)
            for (node in nodes) {
                if (performFastClickAndTap(node)) {
                    Log.i("LocateGoService", "⚡ Accept clicked via view ID: '$fullId'")
                    return true
                }
            }
        }

        // الطريقة 3: البحث عن أي زر قابل للنقر في الجزء السفلي من الشاشة (موضع أزرار القبول المعتاد)
        val fallbackNodes = mutableListOf<AccessibilityNodeInfo>()
        findActionButtonsInLowerScreen(currentRoot, fallbackNodes)
        for (node in fallbackNodes) {
            if (performFastClickAndTap(node)) {
                Log.i("LocateGoService", "⚡ Accept clicked via lower screen action button fallback")
                return true
            }
        }

        return false
    }

    /**
     * تنفيذ النقر المزدوج (Accessibility Click + Touch Gesture Coordinate Tap) لضمان القبول الفوري
     */
    private fun performFastClickAndTap(node: AccessibilityNodeInfo): Boolean {
        var clicked = false

        // 1. استدعاء أمر النقر البرمجي ACTION_CLICK على العقدة أو العقدة الحاوية
        var current: AccessibilityNodeInfo? = node
        while (current != null) {
            if (current.isClickable) {
                clicked = current.performAction(AccessibilityNodeInfo.ACTION_CLICK)
                if (clicked) break
            }
            current = current.parent
        }

        // 2. نقر فوري عبر إحداثيات الشاشة بالعتاد (Coordinate Tap في 40ms) لضمان تفعيل أي زر
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            val bounds = Rect()
            node.getBoundsInScreen(bounds)
            if (!bounds.isEmpty && bounds.width() > 0 && bounds.height() > 0) {
                performInstantTapAtCoordinates(bounds.centerX().toFloat(), bounds.centerY().toFloat())
                clicked = true
            }
        }

        return clicked
    }

    /**
     * نقر لمس مباشر بإحداثيات الشاشة بدون أي تأخير
     */
    private fun performInstantTapAtCoordinates(x: Float, y: Float) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.N) return
        val tapPath = Path().apply { moveTo(x, y) }
        val stroke = GestureDescription.StrokeDescription(tapPath, 0, 35)
        val gesture = GestureDescription.Builder().addStroke(stroke).build()
        dispatchGesture(gesture, null, null)
    }

    /**
     * العثور على أزرار الإجراء في الثلث السفلي من الشاشة واستبعاد أزرار الرفض والإلغاء
     */
    private fun findActionButtonsInLowerScreen(node: AccessibilityNodeInfo?, list: MutableList<AccessibilityNodeInfo>) {
        if (node == null) return

        val bounds = Rect()
        node.getBoundsInScreen(bounds)
        val displayHeight = resources.displayMetrics.heightPixels

        // فحص الأزرار التي تقع في الثلث السفلي من الشاشة (حيث توضع أزرار قبول الطلبات)
        if (bounds.centerY() > (displayHeight * 0.65f)) {
            val txt = (node.text?.toString() ?: node.contentDescription?.toString() ?: "").trim()
            val isReject = txt.contains("رفض", true) || txt.contains("إلغاء", true) ||
                           txt.contains("تجاهل", true) || txt.contains("close", true) ||
                           txt.contains("reject", true) || txt.contains("cancel", true)

            if (!isReject && (node.isClickable || node.className?.toString()?.contains("Button", true) == true)) {
                list.add(node)
            }
        }

        for (i in 0 until node.childCount) {
            findActionButtonsInLowerScreen(node.getChild(i), list)
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
     * استخراج كافة أرقام الكيلومتر من النصوص بدقة
     */
    private fun extractAllDistancesFromTexts(texts: List<String>): List<Double> {
        val result = mutableListOf<Double>()
        val kmPattern = Pattern.compile("(\\d+(?:[.,]\\d+)?)\\s*(?:كم|كيلو|km|k\\.m)", Pattern.CASE_INSENSITIVE or Pattern.UNICODE_CASE)
        for (item in texts) {
            val m = kmPattern.matcher(item)
            while (m.find()) {
                m.group(1)?.replace(',', '.')?.toDoubleOrNull()?.let {
                    if (it > 0.0) result.add(it)
                }
            }
        }
        return result
    }

    /**
     * استخراج اسم المتجر الحقيقي من قائمة النصوص المصفاة
     */
    private fun extractStoreName(texts: List<String>): String {
        for (item in texts) {
            val trimmed = item.trim()
            if (trimmed.length in 3..35 &&
                !generalDistancePattern.matcher(trimmed).find() &&
                !payoutPattern.matcher(trimmed).find() &&
                !orderIdPattern.matcher(trimmed).find() &&
                !ACCEPT_BUTTON_KEYWORDS.any { trimmed.equals(it, ignoreCase = true) } &&
                !trimmed.contains("توصيل", true) &&
                !trimmed.contains("طلب", true) &&
                !trimmed.contains("رفض", true) &&
                !trimmed.contains("تجاهل", true) &&
                !trimmed.contains("استلام", true)
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
        serviceScope.cancel()
        super.onDestroy()
    }

    override fun onInterrupt() {
        // لا توجد مؤقتات أو مهام سحب بحاجة للإيقاف
    }
}
