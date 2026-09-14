package com.locatego.driver

import android.content.Context
import android.util.Log
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.ConnectionPool
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.util.concurrent.TimeUnit

/**
 * RenderApiClient
 * عميل شبكي متصل بخادم Render بدون أي وسيط وسيط مع دعم Connection Keep-Alive
 */
class RenderApiClient(private val context: Context) {

    private val prefs = context.getSharedPreferences("locate_go_prefs", Context.MODE_PRIVATE)

    var baseUrl: String
        get() = prefs.getString("render_url", "https://fast-34v4.onrender.com") ?: "https://fast-34v4.onrender.com"
        set(value) {
            // إزالة أي مسافات أو أحرف اتجاه خفية (RTL/LTR marks) قد تدرجها لوحة المفاتيح العربية
            var clean = value.trim()
                .replace(Regex("[\\u200B-\\u200F\\uFEFF\\u00A0\\u202A-\\u202E\\s]"), "")
                .removeSuffix("/")

            // إزالة أي مسارات فرعية ألصقها المستخدم مثل /api/health أو /api
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

    private val httpClient = OkHttpClient.Builder()
        .connectionPool(ConnectionPool(8, 5, TimeUnit.MINUTES))
        .connectTimeout(25, TimeUnit.SECONDS)
        .readTimeout(25, TimeUnit.SECONDS)
        .writeTimeout(25, TimeUnit.SECONDS)
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
     * فحص الاتصال بالخادم والتحقق من حالته وسرعة الاستجابة بدعم المسارات البديلة
     */
    suspend fun pingServer(): Result<String> = withContext(Dispatchers.IO) {
        val rootUrl = baseUrl.trim().removeSuffix("/")
        val candidateEndpoints = listOf("/api/health", "/health", "/api/ping", "/ping")
        var lastException: Exception? = null

        for (endpoint in candidateEndpoints) {
            try {
                val request = Request.Builder()
                    .url("$rootUrl$endpoint")
                    .get()
                    .header("Connection", "Keep-Alive")
                    .header("Accept", "application/json")
                    .header("User-Agent", "LocateGo-Android/1.0")
                    .build()

                val start = System.currentTimeMillis()
                httpClient.newCall(request).execute().use { response ->
                    val elapsed = System.currentTimeMillis() - start
                    val body = response.body?.string() ?: ""
                    if (response.isSuccessful) {
                        return@withContext Result.success("تم بنجاح (${elapsed}ms)")
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
            else -> lastException?.localizedMessage ?: "خطأ في الشبكة"
        }
        Result.failure(Exception(msg))
    }

    /**
     * إرسال طلب جديد لتقييم المسافة وسعر التوصيل لحظياً
     */
    suspend fun evaluateOrder(
        appName: String,
        storeName: String,
        distanceKm: Double,
        payoutSar: Double,
        orderId: String? = null,
        customerDistrict: String? = null,
        driverLat: Double? = null,
        driverLng: Double? = null
    ): Result<EvaluationResponse> = withContext(Dispatchers.IO) {
        try {
            val url = baseUrl.trim().removeSuffix("/")
            val json = JSONObject().apply {
                put("appName", appName)
                put("storeName", storeName)
                put("distanceKm", distanceKm)
                put("payoutSar", payoutSar)
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

            val body = json.toString().toRequestBody("application/json; charset=utf-8".toMediaType())
            val request = Request.Builder()
                .url("$url/api/orders/evaluate")
                .post(body)
                .header("Connection", "Keep-Alive")
                .header("User-Agent", "LocateGo-Android/1.0")
                .build()

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
            Log.e("RenderApiClient", "Evaluation error: ${e.message}")
            Result.failure(e)
        }
    }

    /**
     * تحديث إحداثيات موقع المندوب الحالية في الخادم
     */
    suspend fun updateDriverLocation(lat: Double, lng: Double): Boolean = withContext(Dispatchers.IO) {
        try {
            val url = baseUrl.trim().removeSuffix("/")
            val json = JSONObject().apply {
                put("lat", lat)
                put("lng", lng)
            }
            val body = json.toString().toRequestBody("application/json; charset=utf-8".toMediaType())
            val request = Request.Builder()
                .url("$url/api/location")
                .post(body)
                .header("Connection", "Keep-Alive")
                .header("User-Agent", "LocateGo-Android/1.0")
                .build()

            httpClient.newCall(request).execute().use { response ->
                if (!response.isSuccessful) {
                    Log.w("RenderApiClient", "Update location returned HTTP ${response.code}")
                }
                response.isSuccessful
            }
        } catch (e: Exception) {
            Log.e("RenderApiClient", "Failed to update driver location: ${e.message}")
            false
        }
    }
}
