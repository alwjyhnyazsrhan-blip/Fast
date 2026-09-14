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
        get() = prefs.getString("render_url", "https://your-locate-go.onrender.com") ?: "https://your-locate-go.onrender.com"
        set(value) {
            val clean = value.trim().removeSuffix("/")
            prefs.edit().putString("render_url", clean).apply()
        }

    private val httpClient = OkHttpClient.Builder()
        .connectionPool(ConnectionPool(8, 5, TimeUnit.MINUTES))
        .connectTimeout(1500, TimeUnit.MILLISECONDS)
        .readTimeout(2500, TimeUnit.MILLISECONDS)
        .writeTimeout(1500, TimeUnit.MILLISECONDS)
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
     * إرسال طلب جديد لتقييم المسافة وسعر التوصيل لحظياً
     */
    suspend fun evaluateOrder(
        appName: String,
        storeName: String,
        distanceKm: Double,
        payoutSar: Double,
        driverLat: Double? = null,
        driverLng: Double? = null
    ): Result<EvaluationResponse> = withContext(Dispatchers.IO) {
        try {
            val json = JSONObject().apply {
                put("appName", appName)
                put("storeName", storeName)
                put("distanceKm", distanceKm)
                put("payoutSar", payoutSar)
                if (driverLat != null && driverLng != null) {
                    put("driverCoordinates", JSONObject().apply {
                        put("lat", driverLat)
                        put("lng", driverLng)
                    })
                }
            }

            val body = json.toString().toRequestBody("application/json; charset=utf-8".toMediaType())
            val request = Request.Builder()
                .url("\$baseUrl/api/orders/evaluate")
                .post(body)
                .header("Connection", "Keep-Alive")
                .header("User-Agent", "LocateGo-Android/1.0")
                .build()

            httpClient.newCall(request).execute().use { response ->
                if (!response.isSuccessful) {
                    return@withContext Result.failure(Exception("HTTP \${response.code}"))
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
            Log.e("RenderApiClient", "Evaluation error: \${e.message}")
            Result.failure(e)
        }
    }

    /**
     * تحديث إحداثيات موقع المندوب الحالية في الخادم
     */
    suspend fun updateDriverLocation(lat: Double, lng: Double): Boolean = withContext(Dispatchers.IO) {
        try {
            val json = JSONObject().apply {
                put("lat", lat)
                put("lng", lng)
            }
            val body = json.toString().toRequestBody("application/json; charset=utf-8".toMediaType())
            val request = Request.Builder()
                .url("\$baseUrl/api/driver/location")
                .post(body)
                .header("Connection", "Keep-Alive")
                .build()

            httpClient.newCall(request).execute().use { it.isSuccessful }
        } catch (e: Exception) {
            false
        }
    }
}
