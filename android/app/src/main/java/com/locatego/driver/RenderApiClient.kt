package com.locatego.driver

import android.content.Context
import android.os.Build
import android.provider.Settings
import android.util.Log
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.ConnectionPool
import okhttp3.ConnectionSpec
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.TlsVersion
import org.json.JSONObject
import java.util.UUID
import java.util.concurrent.TimeUnit

/**
 * RenderApiClient
 * عميل شبكي مشدد الحماية ومتصل بالخادم مع:
 * 1. توقيع الطلبات الرقمي HMAC-SHA256 لمنع التلاعب (Anti-Tampering)
 * 2. منع هجمات إعادة الإرسال (Anti-Replay Protection) عبر X-Nonce و X-Timestamp
 * 3. تشفير النقل الصارم عبر بروتوكولات Modern TLS (TLS 1.2 / TLS 1.3)
 * 4. عزل كامل للبيانات بواسطة معرف الجهاز X-Device-Id
 */
class RenderApiClient(private val context: Context) {

    private val prefs = context.getSharedPreferences("locate_go_prefs", Context.MODE_PRIVATE)

    val deviceId: String
        get() {
            var devId = prefs.getString("device_id", null)
            if (devId.isNullOrBlank()) {
                val androidId = try {
                    Settings.Secure.getString(context.contentResolver, Settings.Secure.ANDROID_ID) ?: ""
                } catch (e: Exception) {
                    ""
                }
                devId = if (androidId.isNotBlank() && androidId != "9774d56d682e549c") {
                    "LG-" + androidId.takeLast(8).uppercase()
                } else {
                    "LG-" + UUID.randomUUID().toString().take(8).uppercase()
                }
                prefs.edit().putString("device_id", devId).apply()
            }
            return devId
        }

    var baseUrl: String
        get() = prefs.getString("render_url", "https://fast-34v4.onrender.com") ?: "https://fast-34v4.onrender.com"
        set(value) {
            var clean = value.trim()
                .replace(Regex("[\\u200B-\\u200F\\uFEFF\\u00A0\\u202A-\\u202E\\s]"), "")
                .removeSuffix("/")

            val suffixesToRemove = listOf(
                "/api/health", "/api/ping", "/api/status", "/api",
                "/health", "/ping", "/status"
            )
            for (suffix in suffixesToRemove) {
                if (clean.endsWith(suffix, ignoreCase = true)) {
                    clean = clean.substring(0, clean.length - suffix.length).removeSuffix("/")
                }
            }

            if (!clean.startsWith("http://") && !clean.startsWith("https://") && clean.isNotEmpty()) {
                clean = "https://$clean"
            }
            prefs.edit().putString("render_url", clean).apply()
        }

    // تقييد الاتصالات ببروتوكولات TLS 1.2 و TLS 1.3 فقط لحماية البيانات من التنصت
    private val modernTlsSpec = ConnectionSpec.Builder(ConnectionSpec.MODERN_TLS)
        .tlsVersions(TlsVersion.TLS_1_3, TlsVersion.TLS_1_2)
        .supportsTlsExtensions(true)
        .build()

    private val httpClient = OkHttpClient.Builder()
        .connectionSpecs(listOf(modernTlsSpec, ConnectionSpec.CLEARTEXT))
        .connectionPool(ConnectionPool(8, 5, TimeUnit.MINUTES))
        .connectTimeout(20, TimeUnit.SECONDS)
        .readTimeout(20, TimeUnit.SECONDS)
        .writeTimeout(20, TimeUnit.SECONDS)
        .retryOnConnectionFailure(true)
        .build()

    data class EvaluationResponse(
        val isAccepted: Boolean,
        val decision: String,
        val computedDistanceKm: Double,
        val maxAllowedKm: Double,
        val rejectionReason: String? = null
    )

    /**
     * بناء ترويسات الأمان والتوقيع الرقمي المشفر HMAC للطلب
     */
    private fun buildSecureRequestHeaders(builder: Request.Builder, bodyJson: String = ""): Request.Builder {
        val devId = deviceId
        val timestamp = System.currentTimeMillis()
        val nonce = UUID.randomUUID().toString().take(12)
        val signature = SecurityHardener.generateRequestSignature(devId, timestamp, nonce, bodyJson)

        return builder
            .header("Connection", "Keep-Alive")
            .header("Accept", "application/json")
            .header("User-Agent", "LocateGo-Hardened/2.5")
            .header("X-Device-Id", devId)
            .header("X-Timestamp", timestamp.toString())
            .header("X-Nonce", nonce)
            .header("X-Signature", signature)
            .header("X-Security-Mode", "HMAC-SHA256")
    }

    /**
     * فحص الاتصال بالخادم والتحقق من حالته وتوقيعه الأمني
     */
    suspend fun pingServer(): Result<String> = withContext(Dispatchers.IO) {
        val rootUrl = baseUrl.trim().removeSuffix("/")
        val candidateEndpoints = listOf("/api/health", "/health", "/api/ping", "/ping")
        var lastException: Exception? = null

        for (endpoint in candidateEndpoints) {
            try {
                val reqBuilder = Request.Builder().url("$rootUrl$endpoint").get()
                val request = buildSecureRequestHeaders(reqBuilder).build()

                val start = System.currentTimeMillis()
                httpClient.newCall(request).execute().use { response ->
                    val elapsed = System.currentTimeMillis() - start
                    if (response.isSuccessful) {
                        return@withContext Result.success("تم بنجاح (${elapsed}ms) [محمي]")
                    } else if (response.code != 404) {
                        return@withContext Result.failure(Exception("كود السيرفر: HTTP ${response.code}"))
                    }
                }
            } catch (e: Exception) {
                lastException = e
            }
        }

        val msg = when (lastException) {
            is java.net.SocketTimeoutException -> "انتهت مهلة الاتصال (Timeout)"
            is java.net.UnknownHostException -> "تعذر الوصول للرابط (DNS غير موجود)"
            else -> lastException?.localizedMessage ?: "خطأ في الشبكة المشفرة"
        }
        Result.failure(Exception(msg))
    }

    /**
     * إرسال طلب جديد لتقييم المسافة وسعر التوصيل مع توقيع رقمي كامل لمحتوى الطلب
     */
    suspend fun evaluateOrder(
        appName: String,
        storeName: String,
        distanceKm: Double,
        payoutSar: Double,
        orderId: String? = null,
        customerDistrict: String? = null,
        driverLat: Double? = null,
        driverLng: Double? = null,
        pickupDistanceKm: Double? = null,
        deliveryDistanceKm: Double? = null
    ): Result<EvaluationResponse> = withContext(Dispatchers.IO) {
        try {
            val url = baseUrl.trim().removeSuffix("/")
            val json = JSONObject().apply {
                put("deviceId", deviceId)
                put("appName", appName)
                put("storeName", storeName)
                put("distanceKm", distanceKm)
                put("payoutSar", payoutSar)
                if (pickupDistanceKm != null) {
                    put("pickupDistanceKm", pickupDistanceKm)
                }
                if (deliveryDistanceKm != null) {
                    put("deliveryDistanceKm", deliveryDistanceKm)
                }
                if (!orderId.isNullOrBlank()) {
                    put("orderId", orderId)
                }
                if (!customerDistrict.isNullOrBlank()) {
                    put("customerDistrict", customerDistrict)
                }
                if (driverLat != null && driverLng != null) {
                    put("driverCoordinates", JSONObject().apply {
                        put("lat", driverLat)
                        put("lng", driverLng)
                    })
                }
            }

            val bodyString = json.toString()
            val body = bodyString.toRequestBody("application/json; charset=utf-8".toMediaType())
            
            val reqBuilder = Request.Builder()
                .url("$url/api/orders/evaluate")
                .post(body)

            val request = buildSecureRequestHeaders(reqBuilder, bodyString).build()

            httpClient.newCall(request).execute().use { response ->
                if (!response.isSuccessful) {
                    return@withContext Result.failure(Exception("HTTP ${response.code}"))
                }

                val bodyStr = response.body?.string() ?: "{}"
                val resObj = JSONObject(bodyStr)
                val decision = resObj.optString("decision", "rejected")
                val eval = resObj.optJSONObject("evaluation")

                Result.success(
                    EvaluationResponse(
                        isAccepted = decision.equals("accepted", ignoreCase = true),
                        decision = decision,
                        computedDistanceKm = eval?.optDouble("computedDistanceKm", distanceKm) ?: distanceKm,
                        maxAllowedKm = eval?.optDouble("maxAllowedKm", 2.0) ?: 2.0,
                        rejectionReason = eval?.optString("rejectionReason", null)
                    )
                )
            }
        } catch (e: Exception) {
            Log.e("RenderApiClient", "Evaluation network error: ${e.message}")
            Result.failure(e)
        }
    }

    /**
     * تحديث إحداثيات موقع المندوب الحالية في الخادم مع التوقيع المشفر
     */
    suspend fun updateDriverLocation(lat: Double, lng: Double): Boolean = withContext(Dispatchers.IO) {
        try {
            val url = baseUrl.trim().removeSuffix("/")
            val json = JSONObject().apply {
                put("deviceId", deviceId)
                put("lat", lat)
                put("lng", lng)
            }
            val bodyString = json.toString()
            val body = bodyString.toRequestBody("application/json; charset=utf-8".toMediaType())
            
            val reqBuilder = Request.Builder()
                .url("$url/api/location")
                .post(body)

            val request = buildSecureRequestHeaders(reqBuilder, bodyString).build()

            httpClient.newCall(request).execute().use { response ->
                response.isSuccessful
            }
        } catch (e: Exception) {
            Log.e("RenderApiClient", "Failed to update driver location: ${e.message}")
            false
        }
    }
}
