package com.locatego.driver

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import android.webkit.JavascriptInterface
import android.widget.Toast
import org.json.JSONObject

/**
 * LocateGoNativeBridge
 * جسر التواصل البرمجي التفاعلي ثنائي الاتجاه بين واجهة React/Web وميزات نظام أندرويد الأصيلة.
 * يمكن السائق من التحكم الكامل في إعدادات التطبيق، فحص الصلاحيات، تشغيل وإيقاف الخدمات،
 * واسترجاع الإعدادات وموقع الـ GPS وحالة الخدمة مباشرة من داخل واجهة الويب.
 */
class LocateGoNativeBridge(private val activity: MainActivity) {

    private val prefs = activity.getSharedPreferences("locate_go_prefs", Context.MODE_PRIVATE)

    /**
     * استرجاع الإعدادات الحالية من الذاكرة المحلية لأندرويد إلى واجهة الويب
     */
    @JavascriptInterface
    fun getSettingsJson(): String {
        val json = JSONObject().apply {
            put("maxDistanceKm", prefs.getFloat("max_distance_km", 2.0f).toDouble())
            put("maxPickupDistanceKm", prefs.getFloat("max_pickup_distance_km", 2.0f).toDouble())
            put("autoAccept", prefs.getBoolean("auto_accept", true))
            put("soundAlerts", prefs.getBoolean("sound_alerts", true))
            put("minPayoutSar", prefs.getFloat("min_payout_sar", 0.0f).toDouble())
            put("vibrationFeedback", prefs.getBoolean("vibration_feedback", true))
            put("renderUrl", prefs.getString("render_url", "https://fast-34v4.onrender.com"))
        }
        return json.toString()
    }

    /**
     * حفظ تحديثات الإعدادات في SharedPreferences الخاصة بأندرويد فوراً
     */
    @JavascriptInterface
    fun saveSettings(settingsJsonStr: String): Boolean {
        return try {
            val json = JSONObject(settingsJsonStr)
            val editor = prefs.edit()
            if (json.has("maxDistanceKm")) {
                editor.putFloat("max_distance_km", json.getDouble("maxDistanceKm").toFloat())
            }
            if (json.has("maxPickupDistanceKm")) {
                editor.putFloat("max_pickup_distance_km", json.getDouble("maxPickupDistanceKm").toFloat())
            }
            if (json.has("autoAccept")) {
                editor.putBoolean("auto_accept", json.getBoolean("autoAccept"))
            }
            if (json.has("soundAlerts")) {
                editor.putBoolean("sound_alerts", json.getBoolean("soundAlerts"))
            }
            if (json.has("minPayoutSar")) {
                editor.putFloat("min_payout_sar", json.getDouble("minPayoutSar").toFloat())
            }
            if (json.has("vibrationFeedback")) {
                editor.putBoolean("vibration_feedback", json.getBoolean("vibrationFeedback"))
            }
            if (json.has("renderUrl")) {
                val cleanUrl = json.getString("renderUrl").trim()
                editor.putString("render_url", cleanUrl)
            }
            editor.apply()
            true
        } catch (e: Exception) {
            e.printStackTrace()
            false
        }
    }

    /**
     * تشغيل أو إيقاف خدمة التتبع الجغرافي والاعتراض
     */
    @JavascriptInterface
    fun setTrackingActive(active: Boolean) {
        activity.runOnUiThread {
            if (active) {
                activity.startLocationService()
                Toast.makeText(activity, "⚡ تم تفعيل أداة التتبع والمراقبة بنجاح", Toast.LENGTH_SHORT).show()
            } else {
                activity.stopLocationService()
                Toast.makeText(activity, "⏸️ تم إيقاف أداة التتبع مؤقتاً", Toast.LENGTH_SHORT).show()
            }
            activity.syncStateToWeb()
        }
    }

    /**
     * حالة الخدمات والصلاحيات بالأندرويد
     */
    @JavascriptInterface
    fun getAndroidStatusJson(): String {
        val hasOverlay = Settings.canDrawOverlays(activity)
        val isTrackingRunning = LocationTrackingService.isServiceRunning
        val isOverlayShowing = FloatingOverlayService.isOverlayShowing
        val lat = LocationTrackingService.currentLatitude
        val lng = LocationTrackingService.currentLongitude

        val json = JSONObject().apply {
            put("isTrackingRunning", isTrackingRunning)
            put("hasOverlayPermission", hasOverlay)
            put("isOverlayShowing", isOverlayShowing)
            put("currentLatitude", lat ?: JSONObject.NULL)
            put("currentLongitude", lng ?: JSONObject.NULL)
            put("isNativeApp", true)
            put("androidVersion", Build.VERSION.RELEASE)
        }
        return json.toString()
    }

    /**
     * فتح إعدادات إمكانية الوصول في الهاتف لتفعيل Accessibility Service
     */
    @JavascriptInterface
    fun openAccessibilitySettings() {
        activity.runOnUiThread {
            try {
                val intent = Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS).apply {
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
                activity.startActivity(intent)
                Toast.makeText(activity, "يرجى تفعيل Locate Go في قائمة الخدمات المثبتة", Toast.LENGTH_LONG).show()
            } catch (e: Exception) {
                Toast.makeText(activity, "تعذر فتح إعدادات إمكانية الوصول: ${e.message}", Toast.LENGTH_LONG).show()
            }
        }
    }

    /**
     * تشغيل أو إيقاف النافذة العائمة فوق التطبيقات
     */
    @JavascriptInterface
    fun toggleFloatingOverlay() {
        activity.runOnUiThread {
            if (Settings.canDrawOverlays(activity)) {
                if (FloatingOverlayService.isOverlayShowing) {
                    val intent = Intent(activity, FloatingOverlayService::class.java)
                    activity.stopService(intent)
                    Toast.makeText(activity, "تم إغلاق النافذة العائمة", Toast.LENGTH_SHORT).show()
                } else {
                    val intent = Intent(activity, FloatingOverlayService::class.java)
                    activity.startService(intent)
                    Toast.makeText(activity, "تم تفعيل النافذة العائمة بنجاح", Toast.LENGTH_SHORT).show()
                }
                activity.syncStateToWeb()
            } else {
                val intent = Intent(
                    Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                    Uri.parse("package:${activity.packageName}")
                ).apply {
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
                activity.startActivity(intent)
                Toast.makeText(activity, "يرجى منح إذن الظهور فوق التطبيقات", Toast.LENGTH_LONG).show()
            }
        }
    }

    /**
     * طلب استثناء توفير الطاقة لضمان بقاء الأداة تعمل بالخلفية
     */
    @JavascriptInterface
    fun requestBatteryOptimization() {
        activity.runOnUiThread {
            activity.requestIgnoreBatteryOptimizations()
        }
    }

    /**
     * إظهار رسالة Toast سريعة في الهاتف
     */
    @JavascriptInterface
    fun showToast(message: String) {
        activity.runOnUiThread {
            Toast.makeText(activity, message, Toast.LENGTH_SHORT).show()
        }
    }
}
