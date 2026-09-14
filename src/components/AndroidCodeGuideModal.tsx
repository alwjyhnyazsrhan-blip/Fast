import React, { useState } from 'react';
import { 
  Code2, 
  Copy, 
  Check, 
  Terminal, 
  FileCode, 
  Layers, 
  ShieldCheck, 
  Globe, 
  Send,
  Zap,
  Smartphone,
  ExternalLink,
  Cpu
} from 'lucide-react';

export const AndroidCodeGuideModal: React.FC = () => {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'service' | 'client' | 'xml' | 'manifest' | 'gradle'>('service');
  const [renderUrl, setRenderUrl] = useState<string>('https://your-locate-go.onrender.com');

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const normalizedUrl = renderUrl.trim().replace(/\/+$/, '');

  // ----------------------------------------------------
  // 1. Production-Ready Kotlin Accessibility Service
  // ----------------------------------------------------
  const ACCESSIBILITY_SERVICE_CODE = `package com.locatego.service

import android.accessibilityservice.AccessibilityService
import android.content.Context
import android.media.AudioManager
import android.media.ToneGenerator
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import android.util.Log
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.TimeUnit
import java.util.regex.Pattern

/**
 * LocateGoAccessibilityService
 * خدمة أندرويد حقيقية لقراءة شاشة تطبيقات التوصيل وتصفية الطلبات جغرافياً.
 * 
 * الميزات المدمجة:
 * 1. استخراج فوري لمسافة الطلب بدقة (سواء بالعربية "1.8 كم" أو الإنجليزية "2.4 km").
 * 2. استخراج اسم المتجر وقيمة أجر التوصيل (ر.س / SAR).
 * 3. منع تكرار الطلبات (Deduplication Cache) لتفادي إرسال نفس الطلب عدة مرات.
 * 4. إرسال بيانات الطلب الحقيقية مباشرة عبر HTTP POST لسيرفر Render.
 * 5. تنفيذ نقرة القبول الآلية (Auto-Click) فوراً إذا وافق السيرفر على المسافة.
 */
class LocateGoAccessibilityService : AccessibilityService() {

    private val serviceScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val httpClient = OkHttpClient.Builder()
        .connectTimeout(3, TimeUnit.SECONDS)
        .readTimeout(5, TimeUnit.SECONDS)
        .build()

    // رابط سيرفرك المرفوع على Render لمعالجة الطلبات
    private val RENDER_EVALUATE_URL = "${normalizedUrl}/api/orders/evaluate"

    // تعابير نمطية دقيقة لرصد المسافات ومبالغ التوصيل
    private val distancePattern = Pattern.compile("(\\\\d+(?:\\\\.\\\\d+)?)\\\\s*(?:كم|كيلو|km)", Pattern.CASE_INSENSITIVE)
    private val payoutPattern = Pattern.compile("(\\\\d+(?:\\\\.\\\\d+)?)\\\\s*(?:ر\\\\.س|ريال|sar)", Pattern.CASE_INSENSITIVE)

    // ذاكرة مؤقتة لحظر تكرار فحص الطلب نفسه في أقل من 15 ثانية
    private val processedOrderCache = ConcurrentHashMap<String, Long>()

    override fun onServiceConnected() {
        super.onServiceConnected()
        Log.i(TAG, "Locate Go Accessibility Service is ACTIVE and listening to screen events.")
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        if (event == null) return

        // الفحص فقط عند تغير محتوى النافذة أو ظهور نافذة جديدة
        val eventType = event.eventType
        if (eventType != AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED &&
            eventType != AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED
        ) {
            return
        }

        val rootNode = rootInActiveWindow ?: return
        val packageName = event.packageName?.toString() ?: ""

        try {
            // استخراج نصوص الشاشة
            inspectScreenAndProcess(rootNode, packageName)
        } catch (e: Exception) {
            Log.e(TAG, "Error parsing screen hierarchy: \${e.message}", e)
        }
    }

    /**
     * استخراج بيانات الطلب وتمريرها للسيرفر
     */
    private fun inspectScreenAndProcess(root: AccessibilityNodeInfo, packageName: String) {
        val extractedTexts = mutableListOf<String>()
        collectAllTexts(root, extractedTexts)

        if (extractedTexts.isEmpty()) return

        val fullScreenText = extractedTexts.joinToString(" ")

        // 1. استخراج المسافة
        val distMatcher = distancePattern.matcher(fullScreenText)
        if (!distMatcher.find()) return

        val distanceStr = distMatcher.group(1) ?: return
        val distanceKm = distanceStr.toDoubleOrNull() ?: return

        // 2. استخراج الأجر (إن وُجد)
        var payoutSar = 18.0
        val payoutMatcher = payoutPattern.matcher(fullScreenText)
        if (payoutMatcher.find()) {
            payoutMatcher.group(1)?.toDoubleOrNull()?.let { payoutSar = it }
        }

        // 3. تحديد اسم التطبيق والمتجر
        val appName = when {
            packageName.contains("jahez", ignoreCase = true) || fullScreenText.contains("جاهز") -> "جاهز"
            packageName.contains("hunger", ignoreCase = true) || fullScreenText.contains("هنقرستيشن") -> "هنقرستيشن"
            packageName.contains("marsool", ignoreCase = true) || fullScreenText.contains("مرسول") -> "مرسول"
            packageName.contains("toyou", ignoreCase = true) || fullScreenText.contains("تويو") -> "تويو"
            else -> "تطبيق توصيل"
        }

        // استخراج أول نص ذي دلالة لاسم المطجر
        val storeName = extractedTexts.firstOrNull { 
            it.length in 4..35 && 
            !it.contains("كم") && 
            !it.contains("ريال") && 
            !it.contains("قبول") && 
            !it.contains("طلب") 
        } ?: "متجر معروض على الشاشة"

        // منع تكرار معالجة نفس العرض
        val orderFingerprint = "\$appName|\$storeName|\$distanceKm|\$payoutSar"
        val now = System.currentTimeMillis()
        val lastProcessed = processedOrderCache[orderFingerprint]
        if (lastProcessed != null && (now - lastProcessed) < 15_000) {
            return // تم فحصه مسبقاً خلال الـ 15 ثانية الماضية
        }
        processedOrderCache[orderFingerprint] = now

        Log.i(TAG, "New delivery offer detected on screen: \$appName | \$storeName | \$distanceKm km")

        // 4. إرسال الطلب للسيرفر الحقيقي على Render
        sendOrderToRenderServer(appName, storeName, distanceKm, payoutSar)
    }

    /**
     * إرسال طلب HTTP POST حقيقي بدون بيانات وهمية
     */
    private fun sendOrderToRenderServer(
        appName: String,
        storeName: String,
        distanceKm: Double,
        payoutSar: Double
    ) {
        serviceScope.launch {
            try {
                val jsonPayload = JSONObject().apply {
                    put("appName", appName)
                    put("storeName", storeName)
                    put("distanceKm", distanceKm)
                    put("payoutSar", payoutSar)
                    put("customerDistrict", "موقع العميل")
                }

                val body = jsonPayload.toString().toRequestBody("application/json; charset=utf-8".toMediaType())
                val request = Request.Builder()
                    .url(RENDER_EVALUATE_URL)
                    .post(body)
                    .build()

                httpClient.newCall(request).execute().use { response ->
                    if (!response.isSuccessful) {
                        Log.e(TAG, "Server evaluation failed with HTTP code: \${response.code}")
                        return@launch
                    }

                    val responseString = response.body?.string() ?: return@launch
                    val resultJson = JSONObject(responseString)
                    val decision = resultJson.optString("decision", "rejected")

                    Log.i(TAG, "Server Decision: \$decision for \$distanceKm km")

                    if (decision.equals("accepted", ignoreCase = true)) {
                        // قرار السيرفر: الطلب ضمن المسافة المقبولة -> تنفيذ القبول التلقائي!
                        withContext(Dispatchers.Main) {
                            executeAutoAcceptClick()
                            notifyDriverAccepted()
                        }
                    } else {
                        // الطلب يتجاوز المسافة المسموحة
                        withContext(Dispatchers.Main) {
                            notifyDriverRejected()
                        }
                    }
                }
            } catch (e: Exception) {
                Log.e(TAG, "Network connection error to Render server: \${e.message}")
            }
        }
    }

    /**
     * البحث التلقائي عن زر القبول في الشاشة والنقر عليه برمجياً
     */
    private fun executeAutoAcceptClick() {
        val root = rootInActiveWindow ?: return
        val acceptKeywords = listOf("قبول", "قبول الطلب", "استلام الطلب", "تأكيد", "Accept", "Take Order")

        for (keyword in acceptKeywords) {
            val matchingNodes = root.findAccessibilityNodeInfosByText(keyword)
            for (node in matchingNodes) {
                if (performClickOnNode(node)) {
                    Log.i(TAG, "Auto-clicked Accept Button successfully with keyword '\$keyword'")
                    return
                }
            }
        }
        Log.w(TAG, "Could not find a clickable accept button on the screen.")
    }

    private fun performClickOnNode(node: AccessibilityNodeInfo?): Boolean {
        var current = node
        while (current != null) {
            if (current.isClickable) {
                return current.performAction(AccessibilityNodeInfo.ACTION_CLICK)
            }
            current = current.parent
        }
        return false
    }

    private fun notifyDriverAccepted() {
        try {
            val tone = ToneGenerator(AudioManager.STREAM_NOTIFICATION, 100)
            tone.startTone(ToneGenerator.TONE_PROP_BEEP2, 200)
            vibrate(150)
        } catch (_: Exception) {}
    }

    private fun notifyDriverRejected() {
        try {
            vibrate(80)
        } catch (_: Exception) {}
    }

    private fun vibrate(durationMs: Long) {
        val vibrator = getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator ?: return
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            vibrator.vibrate(VibrationEffect.createOneShot(durationMs, VibrationEffect.DEFAULT_AMPLITUDE))
        } else {
            @Suppress("DEPRECATION")
            vibrator.vibrate(durationMs)
        }
    }

    private fun collectAllTexts(node: AccessibilityNodeInfo?, list: MutableList<String>) {
        if (node == null) return
        val text = node.text?.toString()?.trim()
        if (!text.isNullOrEmpty()) {
            list.add(text)
        }
        for (i in 0 until node.childCount) {
            collectAllTexts(node.getChild(i), list)
        }
    }

    override fun onInterrupt() {
        Log.w(TAG, "Locate Go Accessibility Service interrupted.")
    }

    companion object {
        private const val TAG = "LocateGoAccessibility"
    }
}
`;

  // ----------------------------------------------------
  // 2. Standalone OkHttp Client for Custom Apps
  // ----------------------------------------------------
  const RENDER_CLIENT_CODE = `package com.locatego.network

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.util.concurrent.TimeUnit

/**
 * RenderApiClient
 * عميل شبكي لإرسال الطلبات إلى خادم Render واستقبال قرار القبول أو الرفض
 */
class RenderApiClient(
    private val baseUrl: String = "${normalizedUrl}"
) {
    private val client = OkHttpClient.Builder()
        .connectTimeout(3, TimeUnit.SECONDS)
        .readTimeout(5, TimeUnit.SECONDS)
        .build()

    data class EvaluationResult(
        val isAccepted: Boolean,
        val decision: String,
        val computedDistanceKm: Double,
        val maxAllowedKm: Double,
        val rejectionReason: String?
    )

    /**
     * إرسال طلب جديد للسيرفر للتقييم الجغرافي
     */
    suspend fun evaluateOrder(
        appName: String,
        storeName: String,
        distanceKm: Double,
        payoutSar: Double
    ): Result<EvaluationResult> = withContext(Dispatchers.IO) {
        try {
            val json = JSONObject().apply {
                put("appName", appName)
                put("storeName", storeName)
                put("distanceKm", distanceKm)
                put("payoutSar", payoutSar)
            }

            val body = json.toString().toRequestBody("application/json".toMediaType())
            val request = Request.Builder()
                .url("\$baseUrl/api/orders/evaluate")
                .post(body)
                .build()

            val response = client.newCall(request).execute()
            if (!response.isSuccessful) {
                return@withContext Result.failure(Exception("HTTP Error \${response.code}"))
            }

            val respBody = response.body?.string() ?: return@withContext Result.failure(Exception("Empty body"))
            val obj = JSONObject(respBody)
            val decision = obj.optString("decision", "rejected")
            val evaluation = obj.optJSONObject("evaluation")

            Result.success(
                EvaluationResult(
                    isAccepted = decision == "accepted",
                    decision = decision,
                    computedDistanceKm = evaluation?.optDouble("computedDistanceKm", distanceKm) ?: distanceKm,
                    maxAllowedKm = evaluation?.optDouble("maxAllowedKm", 2.0) ?: 2.0,
                    rejectionReason = evaluation?.optString("rejectionReason", null)
                )
            )
        } catch (e: Exception) {
            Result.failure(e)
        }
    }
}
`;

  // ----------------------------------------------------
  // 3. XML Service Configuration
  // ----------------------------------------------------
  const XML_CONFIG_CODE = `<?xml version="1.0" encoding="utf-8"?>
<!-- ملف الإعدادات: res/xml/accessibility_service_config.xml -->
<accessibility-service xmlns:android="http://schemas.android.com/apk/res/android"
    android:description="@string/accessibility_service_description"
    android:accessibilityEventTypes="typeWindowStateChanged|typeWindowContentChanged"
    android:accessibilityFeedbackType="feedbackGeneric"
    android:accessibilityFlags="flagDefault|flagRetrieveInteractiveWindows|flagReportViewIds"
    android:canRetrieveWindowContent="true"
    android:canPerformGestures="true"
    android:notificationTimeout="100" />
`;

  // ----------------------------------------------------
  // 4. AndroidManifest.xml
  // ----------------------------------------------------
  const MANIFEST_CODE = `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    package="com.locatego">

    <!-- 1. أذونات الإنترنت للربط مع سيرفر Render -->
    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />

    <!-- 2. أذونات الاهتزاز والخدمة في الخلفية -->
    <uses-permission android:name="android.permission.VIBRATE" />
    <uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
    <uses-permission android:name="android.permission.SYSTEM_ALERT_WINDOW" />

    <application
        android:allowBackup="true"
        android:label="Locate Go Driver Helper"
        android:theme="@style/Theme.Material3.DayNight.NoActionBar">

        <!-- تسجيل خدمة قراءة الشاشة مع إذن BIND_ACCESSIBILITY_SERVICE الإجباري -->
        <service
            android:name=".service.LocateGoAccessibilityService"
            android:permission="android.permission.BIND_ACCESSIBILITY_SERVICE"
            android:exported="true">
            <intent-filter>
                <action android:name="android.accessibilityservice.AccessibilityService" />
            </intent-filter>
            <meta-data
                android:name="android.accessibilityservice"
                android:resource="@xml/accessibility_service_config" />
        </service>

    </application>
</manifest>
`;

  // ----------------------------------------------------
  // 5. build.gradle.kts Dependencies
  // ----------------------------------------------------
  const GRADLE_CODE = `// في ملف app/build.gradle.kts
dependencies {
    // OkHttp للاتصال فائق السرعة بسيرفر Render
    implementation("com.squareup.okhttp3:okhttp:4.12.0")

    // Kotlin Coroutines للمعالجة في الخلفية بدون تجميد الهاتف
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-core:1.8.0")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.8.0")

    // Android Core
    implementation("androidx.core:core-ktx:1.12.0")
    implementation("androidx.appcompat:appcompat:1.6.1")
}
`;

  const activeCode =
    activeTab === 'service'
      ? ACCESSIBILITY_SERVICE_CODE
      : activeTab === 'client'
      ? RENDER_CLIENT_CODE
      : activeTab === 'xml'
      ? XML_CONFIG_CODE
      : activeTab === 'manifest'
      ? MANIFEST_CODE
      : GRADLE_CODE;

  return (
    <div className="bg-gradient-to-b from-[#121929] to-[#0c1220] rounded-2xl p-6 border border-slate-800 shadow-xl space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 pb-5 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
              <Cpu className="w-4 h-4" />
            </span>
            <h2 className="text-base font-bold text-white">كود خدمة أندرويد الحقيقية (Accessibility Service + Render Webhook)</h2>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            كود برمجي حقيقي بلغة Kotlin لتثبيته في تطبيق الأندرويد لقراءة مسافة الشاشة وإرسالها فوراً لسيرفرك على Render لاتخاذ القرار آلياً.
          </p>
        </div>

        {/* Dynamic Render URL Input */}
        <div className="w-full md:w-auto flex items-center gap-2 bg-slate-900/90 border border-slate-700/80 rounded-xl px-3 py-1.5">
          <Globe className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          <div className="text-right">
            <span className="block text-[10px] text-slate-400">رابط سيرفرك على Render:</span>
            <input
              type="text"
              value={renderUrl}
              onChange={(e) => setRenderUrl(e.target.value)}
              placeholder="https://your-app.onrender.com"
              className="bg-transparent text-xs font-mono text-emerald-300 outline-none w-56 placeholder-slate-600"
              dir="ltr"
            />
          </div>
        </div>
      </div>

      {/* 3 Step Workflow Graphic */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-4 rounded-xl bg-[#090d16] border border-slate-800/90">
          <div className="flex items-center gap-2 text-cyan-400 font-bold text-xs mb-1">
            <Smartphone className="w-4 h-4" />
            <span>1. رصد الشاشة الفوري (Accessibility)</span>
          </div>
          <p className="text-[11px] text-slate-400 leading-relaxed">
            الخدمة تراقب عقد الشاشة، وفور ظهور نصوص المسافة (مثل <strong>1.8 كم</strong> أو <strong>2.5 km</strong>) تستخرجها مع اسم المتجر وقيمة الطلب وتمنع التكرار.
          </p>
        </div>

        <div className="p-4 rounded-xl bg-[#090d16] border border-slate-800/90">
          <div className="flex items-center gap-2 text-indigo-400 font-bold text-xs mb-1">
            <Send className="w-4 h-4" />
            <span>2. إرسال HTTP POST لسيرفر Render</span>
          </div>
          <p className="text-[11px] text-slate-400 leading-relaxed">
            ترسل الخدمة طلب JSON إلى <code>/api/orders/evaluate</code> على سيرفرك المرفوع على Render في خيط خلفي (Coroutines) بدون تجميد الهاتف.
          </p>
        </div>

        <div className="p-4 rounded-xl bg-[#090d16] border border-slate-800/90">
          <div className="flex items-center gap-2 text-emerald-400 font-bold text-xs mb-1">
            <Zap className="w-4 h-4" />
            <span>3. القبول الآلي (Auto-Click)</span>
          </div>
          <p className="text-[11px] text-slate-400 leading-relaxed">
            إذا رد السيرفر بـ <code>decision: "accepted"</code> تقوم الخدمة بالنقر التلقائي الفوري على زر "قبول" بالشاشة مع رنة تنبيه واهتزاز للمندوب.
          </p>
        </div>
      </div>

      {/* Code Navigation Tabs */}
      <div className="flex flex-wrap items-center bg-slate-900/80 rounded-xl p-1 border border-slate-800 text-xs gap-1">
        <button
          onClick={() => setActiveTab('service')}
          className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
            activeTab === 'service' ? 'bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/30' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          LocateGoAccessibilityService.kt
        </button>
        <button
          onClick={() => setActiveTab('client')}
          className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
            activeTab === 'client' ? 'bg-cyan-500/20 text-cyan-300 font-bold border border-cyan-500/30' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          RenderApiClient.kt (عميل الشبكة)
        </button>
        <button
          onClick={() => setActiveTab('xml')}
          className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
            activeTab === 'xml' ? 'bg-amber-500/20 text-amber-300 font-bold border border-amber-500/30' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          accessibility_service_config.xml
        </button>
        <button
          onClick={() => setActiveTab('manifest')}
          className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
            activeTab === 'manifest' ? 'bg-purple-500/20 text-purple-300 font-bold border border-purple-500/30' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          AndroidManifest.xml
        </button>
        <button
          onClick={() => setActiveTab('gradle')}
          className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
            activeTab === 'gradle' ? 'bg-rose-500/20 text-rose-300 font-bold border border-rose-500/30' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          build.gradle.kts (المكتبات)
        </button>
      </div>

      {/* Code Viewer */}
      <div className="relative rounded-xl bg-[#080c14] border border-slate-800 overflow-hidden shadow-2xl">
        <div className="flex items-center justify-between px-4 py-2.5 bg-slate-900/90 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <FileCode className="w-4 h-4 text-emerald-400" />
            <span className="text-xs font-mono text-slate-300">
              {activeTab === 'service'
                ? 'LocateGoAccessibilityService.kt'
                : activeTab === 'client'
                ? 'RenderApiClient.kt'
                : activeTab === 'xml'
                ? 'res/xml/accessibility_service_config.xml'
                : activeTab === 'manifest'
                ? 'AndroidManifest.xml'
                : 'app/build.gradle.kts'}
            </span>
          </div>

          <button
            onClick={() => copyToClipboard(activeCode, activeTab)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200 border border-slate-700 transition-all cursor-pointer shadow active:scale-95"
          >
            {copiedKey === activeTab ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-emerald-400 font-bold">تم النسخ بنجاح!</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>نسخ الكود بالكامل</span>
              </>
            )}
          </button>
        </div>

        <pre className="p-4 text-xs font-mono text-slate-300 overflow-x-auto max-h-[500px] leading-relaxed select-text" dir="ltr">
          <code>{activeCode}</code>
        </pre>
      </div>

      {/* Setup Guide Checklist on Phone */}
      <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-2 text-xs">
        <div className="flex items-center gap-2 text-emerald-400 font-bold">
          <ShieldCheck className="w-4 h-4" />
          <span>خطوات تفعيل الخدمة على هاتف المندوب بعد التثبيت:</span>
        </div>
        <ol className="list-decimal list-inside space-y-1.5 text-slate-300 text-[11px] pr-2">
          <li>افتح <strong>إعدادات الهاتف (Settings)</strong> ← <strong>إمكانية الوصول (Accessibility)</strong>.</li>
          <li>ابحث عن اسم الخدمة <strong>Locate Go Driver Helper</strong> واضغط عليها.</li>
          <li>قم بتفعيل خيار <strong>تشغيل الخدمة (Turn ON)</strong> ووافق على إذن فحص الشاشة.</li>
          <li>تأكد من منح التطبيق إذن العمل في الخلفية بدون قيود توفير الطاقة (Battery Unrestricted).</li>
          <li>بمجرد ظهور أي طلب على الشاشة، ستقوم الخدمة آلياً بالتحقق من المسافة عبر سيرفرك وتنفيذ القبول الفوري دون أي تدخل يدوي!</li>
        </ol>
      </div>
    </div>
  );
};
