package com.locatego.driver

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.AccessibilityServiceInfo
import android.accessibilityservice.GestureDescription
import android.content.Context
import android.content.SharedPreferences
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
import java.util.regex.Pattern

/**
 * LocateGoAccessibilityService
 * محرك الرصد الخارق والنقر الفوري بدون أي تأخير (Zero-Delay Ultra-Fast Auto-Accept Engine).
 *
 * المواصفات الفنية للسرعة القصوى:
 * 1. NotificationTimeout = 0ms: إلغاء كلي لأي تأخير أو كبح على مستوى نظام تشغيل أندرويد.
 * 2. In-Memory Volatile Settings: قراءة إعدادات المسافة والقبول من الذاكرة الحية (0ns) دون الوصول للقرص.
 * 3. Single-Pass O(N) Scan: فحص الشاشة واستخراج مسافة العميل واصطياد زر القبول في دورة مسح واحدة فائقة السرعة.
 * 4. Zero-Delay Hardware Tap: تنفيذ النقر المزدوج (ACTION_CLICK + Gesture Tap 1ms) في أجزاء من الثانية فور ظهور العنصر.
 * 5. معيار القبول الصارم: مسافة العميل / الوجهة <= الحد الأقصى (مثلاً 2 كم) مع فتح مسافة المطعم دون أي قيد.
 * 6. إلغاء أي تأخيرات أو Timeouts: تحويل جميع عمليات التوثيق، الصوت، والاهتزاز إلى مسارات خلفية غير معطلة (Dispatchers.IO).
 */
class LocateGoAccessibilityService : AccessibilityService() {

    companion object {
        // مصفوفة حزم تطبيقات التوصيل المستهدفة
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

        // قائمة الكلمات والنصوص الواجب تجاهلها
        private val IGNORED_NAV_TEXTS = setOf(
            "الرئيسية", "حسابي", "الملف الشخصي", "الإعدادات", "المحفظة", "الدعم", "مساعدة",
            "المساعدة", "تسجيل الخروج", "تسجيل خروج", "خروج", "الأرشيف", "السجل", "الإشعارات",
            "شروط الاستخدام", "سياسة الخصوصية", "حول التطبيق", "تحديث التطبيق", "تقييم",
            "المظهر", "اللغة", "الوضع الليلي", "حفظ", "إغلاق", "رجوع", "تخطي", "موافق",
            "إلغاء", "تأكيد الهاتف", "رمز التحقق", "التفاصيل", "عرض التفاصيل", "التالي", "السابق",
            "home", "profile", "settings", "wallet", "support", "help", "logout", "history",
            "notifications", "about", "close", "back", "cancel", "menu", "next", "skip"
        )

        // كلمات أزرار القبول المستهدفة للنقر الفوري الفائق
        private val ACCEPT_BUTTON_KEYWORDS = listOf(
            "قبول", "قبول الطلب", "استلام الطلب", "تأكيد القبول", "تأكيد", "وافق", "موافق",
            "Accept", "Take Order", "Confirm", "Accept Order", "إسناد", "استلام", "موافقة", "سحب للقبول"
        )

        // معرّفات عناصر أزرار القبول المحتملة في الواجهات
        private val ACCEPT_VIEW_IDS = listOf(
            "btn_accept", "accept", "accept_order", "btnAccept", "btn_confirm",
            "order_accept", "take_order", "button_accept", "action_accept", "btn_take", "slide_to_accept"
        )

        /**
         * تحويل وتوحيد الأرقام المشرقية والعربية والفارسية (٠-٩ و ۰-۹) إلى أرقام قياسية (0-9)
         */
        fun normalizeDigits(input: String): String {
            val sb = java.lang.StringBuilder(input.length)
            for (ch in input) {
                when (ch) {
                    '٠', '۰' -> sb.append('0')
                    '١', '۱' -> sb.append('1')
                    '٢', '۲' -> sb.append('2')
                    '٣', '۳' -> sb.append('3')
                    '٤', '۴' -> sb.append('4')
                    '٥', '۵' -> sb.append('5')
                    '٦', '۶' -> sb.append('6')
                    '٧', '۷' -> sb.append('7')
                    '٨', '۸' -> sb.append('8')
                    '٩', '۹' -> sb.append('9')
                    else -> sb.append(ch)
                }
            }
            return sb.toString()
        }

        /**
         * دالة استخراج وتحليل مسافة العميل بدقة متناهية (Parse Delivery Distance)
         * - تنظيف النص تماماً من علامات الاتجاه والمحارف غير المرئية
         * - توحيد الأرقام العربية والإنجليزية
         * - معالجة الفواصل العشرية والنقاط بدقة تامة (مثل 1,5 أو 1.5 أو 1،5 أو 1٫5)
         * - إزالة وتفسير وحدات القياس (كم، كيلو، ك.م، km، متر، م، meter، m)
         * - تحويل الأمتار (متر / م) تلقائياً إلى كيلومتر (تقسيم على 1000.0) حتى لا تُرفض المسافات القريبة
         * - إرجاع قيمة رقمية دقيقة (Double / Float) لضمان اتخاذ قرار القبول السليم
         */
        fun parseDeliveryDistance(rawText: String?): Double? {
            if (rawText.isNullOrBlank()) return null

            // تنظيف النص وتوحيد الأرقام
            val cleaned = normalizeDigits(
                rawText.replace(Regex("[\\u200B-\\u200F\\uFEFF\\u00A0\\u202A-\\u202E]"), " ").trim()
            )

            // 1. نمط الكيلومترات الخاص بمسافة العميل والتوصيل
            val kmRegex = Regex(
                """(?:مسافة\s*(?:العميل|التوصيل|الوجهة)|العميل\s*يبعد|مسافة\s*التوصيل|التوصيل|العميل|الوجهة|delivery|dropoff|customer)\s*[:]?\s*(\d+(?:[\.,،٫]\d+)?)\s*(?:كم|كيلو(?:متر)?|ك\.م|km|k\.m)""",
                RegexOption.IGNORE_CASE
            )
            val kmMatch = kmRegex.find(cleaned)
            if (kmMatch != null) {
                val numStr = kmMatch.groupValues[1]
                    .replace(',', '.')
                    .replace('،', '.')
                    .replace('٫', '.')
                    .trim()
                val parsed = numStr.toDoubleOrNull()
                if (parsed != null && parsed > 0.0) {
                    return Math.round(parsed * 100.0) / 100.0
                }
            }

            // 2. نمط الأمتار الخاص بمسافة العميل والتوصيل (مثلاً: 500 متر أو 800 م أو 750m)
            val meterRegex = Regex(
                """(?:مسافة\s*(?:العميل|التوصيل|الوجهة)|العميل\s*يبعد|مسافة\s*التوصيل|التوصيل|العميل|الوجهة|delivery|dropoff|customer)\s*[:]?\s*(\d+(?:[\.,،٫]\d+)?)\s*(?:متر(?:اً|ا)?|meters?|\s*م(?!\p{L})|\s*m(?!\p{L}))""",
                RegexOption.IGNORE_CASE
            )
            val meterMatch = meterRegex.find(cleaned)
            if (meterMatch != null) {
                val numStr = meterMatch.groupValues[1]
                    .replace(',', '.')
                    .replace('،', '.')
                    .replace('٫', '.')
                    .trim()
                val meters = numStr.toDoubleOrNull()
                if (meters != null && meters > 0.0) {
                    // تحويل الأمتار إلى كيلومتر (500 متر = 0.5 كم)
                    val km = meters / 1000.0
                    return Math.round(km * 100.0) / 100.0
                }
            }

            // 3. في حال كان النص مخصصاً في سياق العميل/التوصيل ولكنه يحتوي فقط على الرقم والوحدة
            val isDeliveryContext = cleaned.contains("عميل", true) ||
                    cleaned.contains("توصيل", true) ||
                    cleaned.contains("وجهة", true) ||
                    cleaned.contains("delivery", true) ||
                    cleaned.contains("dropoff", true) ||
                    cleaned.contains("customer", true)

            if (isDeliveryContext) {
                val generalKm = Regex("""(\d+(?:[\.,،٫]\d+)?)\s*(?:كم|كيلو(?:متر)?|ك\.م|km)""", RegexOption.IGNORE_CASE).find(cleaned)
                if (generalKm != null) {
                    val num = generalKm.groupValues[1].replace(',', '.').replace('،', '.').replace('٫', '.').trim().toDoubleOrNull()
                    if (num != null && num > 0.0) return Math.round(num * 100.0) / 100.0
                }

                val generalMeter = Regex("""(\d+(?:[\.,،٫]\d+)?)\s*(?:متر(?:اً|ا)?|meters?|\s*م(?!\p{L})|\s*m(?!\p{L}))""", RegexOption.IGNORE_CASE).find(cleaned)
                if (generalMeter != null) {
                    val meters = generalMeter.groupValues[1].replace(',', '.').replace('،', '.').replace('٫', '.').trim().toDoubleOrNull()
                    if (meters != null && meters > 0.0) {
                        return Math.round((meters / 1000.0) * 100.0) / 100.0
                    }
                }
            }

            return null
        }

        /**
         * دالة استخراج وتحليل مسافة المطعم / المتجر / الاستلام بدقة
         */
        fun parsePickupDistance(rawText: String?): Double? {
            if (rawText.isNullOrBlank()) return null
            val cleaned = normalizeDigits(
                rawText.replace(Regex("[\\u200B-\\u200F\\uFEFF\\u00A0\\u202A-\\u202E]"), " ").trim()
            )

            val kmMatch = Regex(
                """(?:مسافة\s*(?:المتجر|المطعم|الاستلام)|المتجر\s*يبعد|المطعم\s*يبعد|مسافة\s*الاستلام|الاستلام|المطعم|المتجر|pickup|store)\s*[:]?\s*(\d+(?:[\.,،٫]\d+)?)\s*(?:كم|كيلو(?:متر)?|ك\.م|km|k\.m)""",
                RegexOption.IGNORE_CASE
            ).find(cleaned)
            if (kmMatch != null) {
                val num = kmMatch.groupValues[1].replace(',', '.').replace('،', '.').replace('٫', '.').toDoubleOrNull()
                if (num != null && num > 0.0) return Math.round(num * 100.0) / 100.0
            }

            val meterMatch = Regex(
                """(?:مسافة\s*(?:المتجر|المطعم|الاستلام)|المتجر\s*يبعد|المطعم\s*يبعد|مسافة\s*الاستلام|الاستلام|المطعم|المتجر|pickup|store)\s*[:]?\s*(\d+(?:[\.,،٫]\d+)?)\s*(?:متر(?:اً|ا)?|meters?|\s*م(?!\p{L})|\s*m(?!\p{L}))""",
                RegexOption.IGNORE_CASE
            ).find(cleaned)
            if (meterMatch != null) {
                val meters = meterMatch.groupValues[1].replace(',', '.').replace('،', '.').replace('٫', '.').toDoubleOrNull()
                if (meters != null && meters > 0.0) return Math.round((meters / 1000.0) * 100.0) / 100.0
            }

            val isPickupContext = cleaned.contains("مطعم", true) ||
                    cleaned.contains("متجر", true) ||
                    cleaned.contains("استلام", true) ||
                    cleaned.contains("pickup", true) ||
                    cleaned.contains("store", true)

            if (isPickupContext) {
                val genKm = Regex("""(\d+(?:[\.,،٫]\d+)?)\s*(?:كم|كيلو(?:متر)?|ك\.م|km)""", RegexOption.IGNORE_CASE).find(cleaned)
                if (genKm != null) {
                    val num = genKm.groupValues[1].replace(',', '.').replace('،', '.').replace('٫', '.').toDoubleOrNull()
                    if (num != null && num > 0.0) return Math.round(num * 100.0) / 100.0
                }
            }

            return null
        }

        /**
         * استخراج المسافة العامة أو الإجمالية مع دعم وحدات الكيلومتر والأمتار
         */
        fun parseGeneralDistance(rawText: String?): Double? {
            if (rawText.isNullOrBlank()) return null
            val cleaned = normalizeDigits(
                rawText.replace(Regex("[\\u200B-\\u200F\\uFEFF\\u00A0\\u202A-\\u202E]"), " ").trim()
            )

            val kmMatch = Regex(
                """(?:المسافة\s*الإجمالية|إجمالي\s*المسافة|المسافة\s*الكلية|المسافة|يبعد|تبعد|distance|total)?\s*[:]?\s*(\d+(?:[\.,،٫]\d+)?)\s*(?:كم|كيلو(?:متر)?|ك\.م|km|k\.m)""",
                RegexOption.IGNORE_CASE
            ).find(cleaned)
            if (kmMatch != null) {
                val num = kmMatch.groupValues[1].replace(',', '.').replace('،', '.').replace('٫', '.').toDoubleOrNull()
                if (num != null && num > 0.0) return Math.round(num * 100.0) / 100.0
            }

            val meterMatch = Regex(
                """(?:المسافة\s*الإجمالية|إجمالي\s*المسافة|المسافة\s*الكلية|المسافة|يبعد|تبعد|distance|total)?\s*[:]?\s*(\d+(?:[\.,،٫]\d+)?)\s*(?:متر(?:اً|ا)?|meters?|\s*م(?!\p{L})|\s*m(?!\p{L}))""",
                RegexOption.IGNORE_CASE
            ).find(cleaned)
            if (meterMatch != null) {
                val meters = meterMatch.groupValues[1].replace(',', '.').replace('،', '.').replace('٫', '.').toDoubleOrNull()
                if (meters != null && meters > 0.0) return Math.round((meters / 1000.0) * 100.0) / 100.0
            }

            return null
        }
    }

    private val serviceScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private lateinit var renderClient: RenderApiClient
    private var sharedPrefsListener: SharedPreferences.OnSharedPreferenceChangeListener? = null

    // تخزين الإعدادات في الذاكرة الحية (Volatile) للاسترجاع الفوري في 0 نانو ثانية
    @Volatile private var cachedMaxAllowedKm: Double = 2.0
    @Volatile private var cachedMaxPickupDistanceKm: Double = 2.0
    @Volatile private var cachedMinPayoutSar: Double = 0.0
    @Volatile private var cachedAutoAccept: Boolean = true

    // تعابير نمطية مستهدفة بدقة عالية ومترجمة مسبقاً
    private val pickupDistancePattern = Pattern.compile(
        "(?:مسافة\\s*(?:المتجر|المطعم|الاستلام)|المتجر\\s*يبعد|المطعم\\s*يبعد|مسافة\\s*الاستلام|الاستلام|المطعم|المتجر|pickup|store)\\s*[:]?\\s*(\\d+(?:[.,]\\d+)?)\\s*(?:كم|كيلو|km|k\\.m)",
        Pattern.CASE_INSENSITIVE or Pattern.UNICODE_CASE
    )

    private val deliveryDistancePattern = Pattern.compile(
        "(?:مسافة\\s*(?:العميل|التوصيل|الوجهة)|العميل\\s*يبعد|مسافة\\s*التوصيل|التوصيل|العميل|الوجهة|delivery|dropoff|customer)\\s*[:]?\\s*(\\d+(?:[.,]\\d+)?)\\s*(?:كم|كيلو|km|k\\.m)",
        Pattern.CASE_INSENSITIVE or Pattern.UNICODE_CASE
    )

    private val generalDistancePattern = Pattern.compile(
        "(?:المسافة\\s*الإجمالية|إجمالي\\s*المسافة|المسافة\\s*الكلية|المسافة|يبعد|تبعد|distance|total)?\\s*[:]?\\s*(\\d+(?:[.,]\\d+)?)\\s*(?:كم|كيلو|km|k\\.m)",
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

    private var currentForegroundPackage = ""
    private val processedOrdersCache = ConcurrentHashMap<String, Long>()

    override fun onServiceConnected() {
        super.onServiceConnected()
        renderClient = RenderApiClient(this)

        // 1. تهيئة خدمة Accessibility بأقصى سرعة ممكنة وبدون أي تأخير (Zero Throttling)
        val info = serviceInfo ?: AccessibilityServiceInfo()
        info.notificationTimeout = 0L // إلغاء أي مؤقت تأخير بين إشعارات الأحداث نهائياً
        info.eventTypes = AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED or AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED
        info.feedbackType = AccessibilityServiceInfo.FEEDBACK_GENERIC
        info.flags = info.flags or
                AccessibilityServiceInfo.FLAG_RETRIEVE_INTERACTIVE_WINDOWS or
                AccessibilityServiceInfo.FLAG_REPORT_VIEW_IDS or
                AccessibilityServiceInfo.FLAG_INCLUDE_NOT_IMPORTANT_VIEWS
        serviceInfo = info

        // 2. تفعيل ذاكرة الإعدادات الفورية
        initLiveSettingsCache()

        Log.i("LocateGoService", "⚡⚡ ULTRA ZERO-DELAY Auto-Accept Engine ACTIVATED (Timeout=0ms • Single-Pass O(N) Scanner • 1ms Tap).")
    }

    private fun initLiveSettingsCache() {
        val prefs = getSharedPreferences("locate_go_prefs", Context.MODE_PRIVATE)
        cachedMaxAllowedKm = prefs.getFloat("max_distance_km", 2.0f).toDouble()
        cachedMaxPickupDistanceKm = prefs.getFloat("max_pickup_distance_km", 2.0f).toDouble()
        cachedMinPayoutSar = prefs.getFloat("min_payout_sar", 0.0f).toDouble()
        cachedAutoAccept = prefs.getBoolean("auto_accept", true)

        sharedPrefsListener = SharedPreferences.OnSharedPreferenceChangeListener { sp, key ->
            when (key) {
                "max_distance_km" -> cachedMaxAllowedKm = sp.getFloat("max_distance_km", 2.0f).toDouble()
                "max_pickup_distance_km" -> cachedMaxPickupDistanceKm = sp.getFloat("max_pickup_distance_km", 2.0f).toDouble()
                "min_payout_sar" -> cachedMinPayoutSar = sp.getFloat("min_payout_sar", 0.0f).toDouble()
                "auto_accept" -> cachedAutoAccept = sp.getBoolean("auto_accept", true)
            }
        }
        prefs.registerOnSharedPreferenceChangeListener(sharedPrefsListener)
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        if (event == null) return

        val packageName: String = event.packageName?.toString() ?: ""
        if (!isTargetPackage(packageName)) return

        currentForegroundPackage = packageName

        // فحص سريع: إذا كان القبول التلقائي مغلقاً في الذاكرة الحية نخرج في أقل من نانو ثانية
        if (!cachedAutoAccept) return

        val type = event.eventType
        if (type != AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED &&
            type != AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED) return

        val root = rootInActiveWindow ?: event.source ?: return
        inspectScreenForOrderOffer(root, packageName)
    }

    /**
     * نتيجة المسح الفوري الأحادي للشاشة
     */
    private data class FastScanResult(
        val texts: MutableList<String> = mutableListOf(),
        var acceptButtonNode: AccessibilityNodeInfo? = null,
        var directDeliveryKm: Double? = null,
        var directPickupKm: Double? = null,
        var directPayoutSar: Double? = null
    )

    /**
     * فحص الشاشة بدقة فائقة وبسرعة الصاروخ (Single-Pass O(N))
     */
    private fun inspectScreenForOrderOffer(root: AccessibilityNodeInfo, packageName: String) {
        val displayHeight = resources.displayMetrics.heightPixels
        val scanResult = FastScanResult()

        // دورة مسح واحدة تجمع النصوص وترصد زر القبول في نفس اللحظة دون تكرار المرور
        fastSinglePassTraversal(root, scanResult, displayHeight)

        if (scanResult.texts.isEmpty()) return

        val joinedContent = scanResult.texts.joinToString(" ")

        // 1. استخراج مسافة العميل / الوجهة (Delivery Distance) بدقة عالية وتنظيف شامل
        var deliveryDistKm = scanResult.directDeliveryKm
        if (deliveryDistKm == null) {
            deliveryDistKm = parseDeliveryDistance(joinedContent)
        }
        if (deliveryDistKm == null) {
            for (t in scanResult.texts) {
                val parsed = parseDeliveryDistance(t)
                if (parsed != null && parsed > 0.0) {
                    deliveryDistKm = parsed
                    break
                }
            }
        }

        // 2. استخراج مسافة المطعم / الاستلام (Pickup Distance) بدقة عالية
        var pickupDistKm = scanResult.directPickupKm
        if (pickupDistKm == null) {
            pickupDistKm = parsePickupDistance(joinedContent)
        }
        if (pickupDistKm == null) {
            for (t in scanResult.texts) {
                val parsed = parsePickupDistance(t)
                if (parsed != null && parsed > 0.0) {
                    pickupDistKm = parsed
                    break
                }
            }
        }

        // 3. استخراج المسافة العامة كبديل إن لم تتوفر مسافة صريحة
        var generalDistKm: Double? = null
        if (deliveryDistKm == null && pickupDistKm == null) {
            generalDistKm = parseGeneralDistance(joinedContent)
            if (generalDistKm == null) {
                for (t in scanResult.texts) {
                    val parsed = parseGeneralDistance(t)
                    if (parsed != null && parsed > 0.0) {
                        generalDistKm = parsed
                        break
                    }
                }
            }
        }

        if (deliveryDistKm == null && generalDistKm == null && pickupDistKm == null) {
            val distList = extractAllDistancesFromTexts(scanResult.texts)
            if (distList.isNotEmpty()) {
                generalDistKm = distList.first()
            }
        }

        // المسافة المستهدفة للتقييم: نعتمد حصرياً مسافة العميل، ثم العامة، ثم المطعم
        val targetEvaluationDistanceKm = deliveryDistKm ?: generalDistKm ?: pickupDistKm ?: return
        if (targetEvaluationDistanceKm <= 0.0) return

        // 4. استخراج أجر التوصيل للتوثيق والإحصاءات
        var payoutSar = scanResult.directPayoutSar ?: 18.0
        if (scanResult.directPayoutSar == null) {
            val payoutMatcher = payoutPattern.matcher(joinedContent)
            if (payoutMatcher.find()) {
                payoutMatcher.group(1)?.replace(',', '.')?.toDoubleOrNull()?.let { payoutSar = it }
            }
        }

        // 5. استخراج رقم الطلب واسم المتجر
        var extractedOrderId: String? = null
        val idMatcher = orderIdPattern.matcher(joinedContent)
        if (idMatcher.find()) {
            extractedOrderId = idMatcher.group(1)
        }

        val storeName = extractStoreName(scanResult.texts)
        val customerDistrict = extractCustomerDistrict(joinedContent, scanResult.texts)

        // منع تكرار النقر على نفس الطلب لنفس الشاشة خلال نافذة قصيرة جداً (1.5 ثانية فقط)
        val deduplicationKey = "${extractedOrderId ?: ""}|$targetEvaluationDistanceKm|$payoutSar|$storeName"
        val now = System.currentTimeMillis()
        if (processedOrdersCache[deduplicationKey]?.let { now - it < 1500 } == true) return

        val maxAllowedDeliveryKm = cachedMaxAllowedKm
        val maxAllowedPickupKm = cachedMaxPickupDistanceKm

        // =========================================================================
        // قاعدة الفحص والقبول المباشر الحصرية (بدون أي شرط للحد الأدنى للأرباح):
        // قبول الطلب يعتمد حصرياً ومباشرة وبشكل كامل على تحقق الشرطين التاليين معاً:
        // 1. مسافة العميل / الوجهة <= الحد الأقصى لمسافة العميل (مثلاً 2.0 كم).
        // 2. مسافة المطعم / الاستلام <= الحد الأقصى لمسافة المطعم (مثلاً 2.0 كم).
        // =========================================================================
        val actualDeliveryDist = deliveryDistKm ?: generalDistKm ?: targetEvaluationDistanceKm
        val actualPickupDist = pickupDistKm

        val isDeliveryWithinLimit = actualDeliveryDist <= maxAllowedDeliveryKm
        val isPickupWithinLimit = if (actualPickupDist != null) actualPickupDist <= maxAllowedPickupKm else (targetEvaluationDistanceKm <= maxAllowedPickupKm)
        
        // الاعتماد الحصري على مسافة المطعم ومسافة العميل فقط دون أي شروط إضافية
        val isOrderMatching = isDeliveryWithinLimit && isPickupWithinLimit

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
            processedOrdersCache[deduplicationKey] = now

            // =========================================================================
            // تنفيذ النقر الفوري الفائق (Zero-Delay Accept) في جزء من الثانية
            // =========================================================================
            val targetNode = scanResult.acceptButtonNode
            val clickSuccess = if (targetNode != null) {
                performInstantClick(targetNode)
            } else {
                executeFallbackAccept(root)
            }

            Log.i(
                "LocateGoService",
                "⚡⚡ ZERO-DELAY ACCEPT TRIGGERED! [Success=$clickSuccess] Store='$storeName' | Restaurant: ${actualPickupDist ?: "N/A"} km <= $maxAllowedPickupKm km | Customer: $actualDeliveryDist km <= $maxAllowedDeliveryKm km"
            )

            // تنبيه السائق بالصوت والاهتزاز بشكل متزامن وغير معطل
            notifyDriverAcceptedAsync()

            // إرسال تفاصيل الطلب لسيرفر Render في خيط منفصل (Dispatchers.IO) بدون أي تأخير أو انتظار
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
        } else {
            processedOrdersCache[deduplicationKey] = now
            val rejectReason = when {
                !isDeliveryWithinLimit && !isPickupWithinLimit -> "مسافة العميل ($actualDeliveryDist كم > $maxAllowedDeliveryKm كم) ومسافة المطعم (${actualPickupDist ?: targetEvaluationDistanceKm} كم > $maxAllowedPickupKm كم) تتجاوزان الحد المسموح"
                !isDeliveryWithinLimit -> "مسافة العميل ($actualDeliveryDist كم) تتجاوز الحد الأقصى المسموح ($maxAllowedDeliveryKm كم)"
                !isPickupWithinLimit -> "مسافة المطعم (${actualPickupDist ?: targetEvaluationDistanceKm} كم) تتجاوز الحد الأقصى المسموح ($maxAllowedPickupKm كم)"
                else -> "المسافات غير متوافقة مع شروط المسافة المحددة"
            }

            Log.w("LocateGoService", "🚫 ORDER FILTERED: $rejectReason")
            notifyDriverRejectedAsync()

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
     * مسح شجرة العناصر في دورة أحادية فائقة الخفة:
     * - رصد واصطياد زر القبول فورياً إذا وجد.
     * - استخراج نصوص المسافات والأسعار بدقة فائقة باستخدام parseDeliveryDistance و parsePickupDistance.
     */
    private fun fastSinglePassTraversal(node: AccessibilityNodeInfo?, result: FastScanResult, displayHeight: Int) {
        if (node == null) return

        val text = node.text?.toString()?.trim()
        val desc = node.contentDescription?.toString()?.trim()
        val viewId = node.viewIdResourceName?.lowercase() ?: ""

        val rawContent = when {
            !text.isNullOrEmpty() -> text
            !desc.isNullOrEmpty() -> desc
            else -> null
        }

        // 1. فحص زر القبول لحظياً في العقدة
        if (result.acceptButtonNode == null) {
            val isAcceptId = ACCEPT_VIEW_IDS.any { viewId.endsWith(it) || viewId.contains(it) }
            val isAcceptKeyword = rawContent != null && ACCEPT_BUTTON_KEYWORDS.any { rawContent.contains(it, ignoreCase = true) }

            if (isAcceptId || isAcceptKeyword) {
                result.acceptButtonNode = node
            } else if (node.isClickable || node.className?.toString()?.contains("Button", true) == true) {
                // فحص الأزرار الواقعة في الثلث السفلي من الشاشة
                val bounds = Rect()
                node.getBoundsInScreen(bounds)
                if (bounds.centerY() > (displayHeight * 0.60f)) {
                    val contentStr = rawContent?.lowercase() ?: ""
                    val isReject = contentStr.contains("رفض") || contentStr.contains("إلغاء") ||
                            contentStr.contains("تجاهل") || contentStr.contains("reject") || contentStr.contains("cancel")
                    if (!isReject) {
                        result.acceptButtonNode = node
                    }
                }
            }
        }

        // 2. إضافة النص المؤهل وفحص المسافات المباشرة
        if (rawContent != null && rawContent.length in 2..120) {
            val lowerStr = rawContent.lowercase()
            val isIgnored = IGNORED_NAV_TEXTS.any { lowerStr == it || lowerStr.startsWith("$it ") }
            if (!isIgnored) {
                result.texts.add(rawContent)

                // فحص سريع ودقيق لنصوص المسافات أثناء المرور لتسريع التحليل الفوري
                if (result.directDeliveryKm == null) {
                    val parsedDelivery = parseDeliveryDistance(rawContent)
                    if (parsedDelivery != null && parsedDelivery > 0.0) {
                        result.directDeliveryKm = parsedDelivery
                    }
                }

                if (result.directPickupKm == null) {
                    val parsedPickup = parsePickupDistance(rawContent)
                    if (parsedPickup != null && parsedPickup > 0.0) {
                        result.directPickupKm = parsedPickup
                    }
                }

                if (result.directPayoutSar == null && (lowerStr.contains("ريال") || lowerStr.contains("ر.س") || lowerStr.contains("sar"))) {
                    val m = payoutPattern.matcher(rawContent)
                    if (m.find()) {
                        result.directPayoutSar = m.group(1)?.replace(',', '.')?.toDoubleOrNull()
                    }
                }
            }
        }

        // النزول للأبناء
        val childCount = node.childCount
        for (i in 0 until childCount) {
            fastSinglePassTraversal(node.getChild(i), result, displayHeight)
        }
    }

    /**
     * تنفيذ النقر الفوري الفائق (Zero-Delay Instant Click) عبر ACTION_CLICK وإحداثيات اللمس في 1ms
     */
    private fun performInstantClick(node: AccessibilityNodeInfo): Boolean {
        var clicked = false

        // 1. أمر النقر البرمجي الفوري عبر نظام الـ Accessibility
        var curr: AccessibilityNodeInfo? = node
        while (curr != null) {
            if (curr.isClickable) {
                clicked = curr.performAction(AccessibilityNodeInfo.ACTION_CLICK)
                if (clicked) break
            }
            curr = curr.parent
        }

        // 2. نقر عتادي حقيقي باللمس فوراً بدون أي تأخير (1ms Touch Stroke) لضمان الاستجابة في التطبيقات التي لا تستجيب لـ ACTION_CLICK
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            val bounds = Rect()
            node.getBoundsInScreen(bounds)
            if (!bounds.isEmpty && bounds.width() > 0 && bounds.height() > 0) {
                val cx = bounds.centerX().toFloat()
                val cy = bounds.centerY().toFloat()
                val tapPath = Path().apply { moveTo(cx, cy) }
                // مدة اللمسة 1ms فقط (بدون أي تأخير أو انتظار)
                val stroke = GestureDescription.StrokeDescription(tapPath, 0L, 1L)
                val gesture = GestureDescription.Builder().addStroke(stroke).build()
                dispatchGesture(gesture, null, null)
                clicked = true
            }
        }

        return clicked
    }

    /**
     * محاولة النقر البديلة في حال لم يُحدد الزر أثناء المسح الأولي
     */
    private fun executeFallbackAccept(root: AccessibilityNodeInfo): Boolean {
        val currentRoot = rootInActiveWindow ?: root

        // فحص سريع لكلمات القبول الأساسية
        for (keyword in ACCEPT_BUTTON_KEYWORDS) {
            val nodes = currentRoot.findAccessibilityNodeInfosByText(keyword)
            if (nodes.isNotEmpty()) {
                for (node in nodes) {
                    if (performInstantClick(node)) return true
                }
            }
        }

        // فحص لمعرفات العناصر
        for (viewId in ACCEPT_VIEW_IDS) {
            val fullId = "${currentForegroundPackage}:id/$viewId"
            val nodes = currentRoot.findAccessibilityNodeInfosByViewId(fullId)
            if (nodes.isNotEmpty()) {
                for (node in nodes) {
                    if (performInstantClick(node)) return true
                }
            }
        }

        return false
    }

    private fun extractAllDistancesFromTexts(texts: List<String>): List<Double> {
        val result = mutableListOf<Double>()
        for (item in texts) {
            val dist = parseGeneralDistance(item) ?: parseDeliveryDistance(item) ?: parsePickupDistance(item)
            if (dist != null && dist > 0.0) {
                result.add(dist)
            }
        }
        return result
    }

    private fun extractStoreName(texts: List<String>): String {
        for (item in texts) {
            val trimmed = item.trim()
            if (trimmed.length in 3..35 &&
                !generalDistancePattern.matcher(trimmed).find() &&
                !payoutPattern.matcher(trimmed).find() &&
                !orderIdPattern.matcher(trimmed).find() &&
                !ACCEPT_BUTTON_KEYWORDS.any { trimmed.contains(it, ignoreCase = true) } &&
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

    private fun notifyDriverAcceptedAsync() {
        serviceScope.launch {
            try {
                ToneGenerator(AudioManager.STREAM_NOTIFICATION, 100).startTone(ToneGenerator.TONE_PROP_BEEP2, 180)
                (getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator)?.let {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                        it.vibrate(VibrationEffect.createOneShot(150, VibrationEffect.DEFAULT_AMPLITUDE))
                    } else {
                        @Suppress("DEPRECATION")
                        it.vibrate(150)
                    }
                }
            } catch (_: Exception) {}
        }
    }

    private fun notifyDriverRejectedAsync() {
        serviceScope.launch {
            try {
                (getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator)?.let {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                        it.vibrate(VibrationEffect.createOneShot(60, VibrationEffect.DEFAULT_AMPLITUDE))
                    } else {
                        @Suppress("DEPRECATION")
                        it.vibrate(60)
                    }
                }
            } catch (_: Exception) {}
        }
    }

    override fun onDestroy() {
        sharedPrefsListener?.let {
            getSharedPreferences("locate_go_prefs", Context.MODE_PRIVATE)
                .unregisterOnSharedPreferenceChangeListener(it)
        }
        serviceScope.cancel()
        super.onDestroy()
    }

    override fun onInterrupt() {
        // لا توجد مؤقتات أو مهام معلقة
    }
}
