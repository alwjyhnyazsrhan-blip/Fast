import React, { useState } from 'react';
import { Code2, Copy, Check, Terminal, FileCode, Layers, ShieldCheck, Sparkles, BookOpen } from 'lucide-react';

export const AndroidCodeGuideModal: React.FC = () => {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'compose' | 'accessibility' | 'service' | 'manifest'>('compose');

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const JETPACK_COMPOSE_CODE = `package com.locatego.overlay

import androidx.compose.animation.*
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Stop
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/**
 * Locate Go - Floating Overlay UI (Jetpack Compose)
 * تصميم واجهة عائمة حديثة بالوضع الليلي لمناديب التوصيل
 */
@Composable
fun LocateGoFloatingOverlay(
    isRunning: Boolean,
    maxDistanceKm: Float,
    isScreenMonitoring: Boolean,
    recentOrders: List<OrderModel>,
    onTogglePower: () => Unit,
    onDistanceChange: (Float) -> Unit
) {
    // باليت الألوان الليلية المخصصة للمناديب
    val DarkSurface = Color(0xFF0C1220)
    val NeonEmerald = Color(0xFF10B981)
    val SoftRose = Color(0xFFF43F5E)
    val CardBackground = Color(0xFF141C2E)
    val BorderColor = Color(0xFF1E293B)

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(16.dp),
        shape = RoundedCornerShape(24.dp),
        colors = CardDefaults.cardColors(containerColor = DarkSurface),
        border = androidx.compose.foundation.BorderStroke(1.5.dp, if (isRunning) NeonEmerald.copy(alpha = 0.5f) else BorderColor)
    ) {
        Column(
            modifier = Modifier.padding(20.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            // 3. مؤشر الحالة الحي (Live Status Indicator)
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(12.dp))
                    .background(if (isScreenMonitoring) NeonEmerald.copy(alpha = 0.15f) else Color.DarkGray.copy(alpha = 0.3f))
                    .padding(horizontal = 12.dp, vertical = 8.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(
                        modifier = Modifier
                            .size(10.dp)
                            .clip(CircleShape)
                            .background(if (isScreenMonitoring) NeonEmerald else Color.Gray)
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(
                        text = if (isScreenMonitoring) "متصل وتراقب الشاشة حالياً" else "المراقبة متوقفة",
                        color = if (isScreenMonitoring) NeonEmerald else Color.LightGray,
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Bold
                    )
                }
                Text(
                    text = if (isScreenMonitoring) "OCR: 5 FPS" else "IDLE",
                    color = Color.Gray,
                    fontSize = 11.sp
                )
            }

            Spacer(modifier = Modifier.height(20.dp))

            // 1. الزر الرئيسي الكبير للتشغيل والإيقاف (Start / Stop)
            Button(
                onClick = onTogglePower,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(84.dp),
                shape = RoundedCornerShape(18.dp),
                colors = ButtonDefaults.buttonColors(
                    containerColor = if (isRunning) SoftRose else NeonEmerald
                ),
                elevation = ButtonDefaults.buttonElevation(defaultElevation = 8.dp)
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.Center
                ) {
                    Icon(
                        imageVector = if (isRunning) Icons.Default.Stop else Icons.Default.PlayArrow,
                        contentDescription = null,
                        tint = if (isRunning) Color.White else Color.Black,
                        modifier = Modifier.size(36.dp)
                    )
                    Spacer(modifier = Modifier.width(12.dp))
                    Column {
                        Text(
                            text = if (isRunning) "إيقاف الأداة (STOP)" else "تشغيل الأداة (START)",
                            color = if (isRunning) Color.White else Color.Black,
                            fontSize = 18.sp,
                            fontWeight = FontWeight.Black
                        )
                        Text(
                            text = if (isRunning) "انقر لإيقاف مراقبة عروض الشاشة" else "انقر لبدء رصد الطلبات وتصفيتها",
                            color = if (isRunning) Color.White.copy(alpha = 0.8f) else Color.Black.copy(alpha = 0.8f),
                            fontSize = 11.sp
                        )
                    }
                }
            }

            Spacer(modifier = Modifier.height(20.dp))

            // 2. حقل مخصص لتحديد أقصى مسافة مقبولة للطلبات
            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(16.dp),
                colors = CardDefaults.cardColors(containerColor = CardBackground),
                border = androidx.compose.foundation.BorderStroke(1.dp, BorderColor)
            ) {
                Column(modifier = Modifier.padding(14.dp)) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            text = "أقصى مسافة مقبولة للطلب:",
                            color = Color.White,
                            fontSize = 13.sp,
                            fontWeight = FontWeight.SemiBold
                        )
                        Text(
                            text = "\${String.format("%.1f", maxDistanceKm)} كم",
                            color = NeonEmerald,
                            fontSize = 16.sp,
                            fontWeight = FontWeight.Black
                        )
                    }

                    Spacer(modifier = Modifier.height(6.dp))

                    Slider(
                        value = maxDistanceKm,
                        onValueChange = onDistanceChange,
                        valueRange = 0.5f..10.0f,
                        steps = 19,
                        colors = SliderDefaults.colors(
                            thumbColor = NeonEmerald,
                            activeTrackColor = NeonEmerald
                        )
                    )

                    Text(
                        text = "القاعدة: أي طلب > \${maxDistanceKm} كم يتم رفضه وتجاهله فوراً لتوفير الوقود.",
                        color = Color.Gray,
                        fontSize = 11.sp
                    )
                }
            }

            Spacer(modifier = Modifier.height(16.dp))

            // 4. لوحة آخر الطلبات المرصودة
            Text(
                text = "آخر الطلبات المرصودة على الشاشة",
                color = Color.White,
                fontSize = 13.sp,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.fillMaxWidth()
            )

            Spacer(modifier = Modifier.height(8.dp))

            recentOrders.take(3).forEach { order ->
                OrderCardItem(order = order, maxDistanceKm = maxDistanceKm)
                Spacer(modifier = Modifier.height(6.dp))
            }
        }
    }
}

@Composable
fun OrderCardItem(order: OrderModel, maxDistanceKm: Float) {
    val isAccepted = order.distanceKm <= maxDistanceKm
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .background(Color(0xFF141C2E))
            .border(
                1.dp,
                if (isAccepted) Color(0xFF10B981).copy(alpha = 0.3f) else Color(0xFFF43F5E).copy(alpha = 0.3f),
                RoundedCornerShape(12.dp)
            )
            .padding(10.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Column {
            Text(order.storeName, color = Color.White, fontSize = 12.sp, fontWeight = FontWeight.Bold)
            Text("المسافة: \${order.distanceKm} كم", color = if (isAccepted) Color(0xFF10B981) else Color(0xFFF43F5E), fontSize = 11.sp)
        }
        Text(
            text = if (isAccepted) "تم القبول ✅" else "تجاهل ❌",
            color = if (isAccepted) Color(0xFF10B981) else Color(0xFFF43F5E),
            fontSize = 12.sp,
            fontWeight = FontWeight.Bold
        )
    }
}

data class OrderModel(val id: String, val storeName: String, val distanceKm: Float, val payout: Float)
`;

  const ACCESSIBILITY_SERVICE_CODE = `package com.locatego.service

import android.accessibilityservice.AccessibilityService
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import java.util.regex.Pattern

/**
 * LocateGoAccessibilityService
 * يقرأ نصوص ونوافذ الشاشة المعروضة من تطبيقات التوصيل (جاهز، هنقرستيشن، مرسول...)
 * ويستخرج رقم المسافة (كم) وينفذ قرار القبول أو التجاهل برمجياً.
 */
class LocateGoAccessibilityService : AccessibilityService() {

    // التعبير النمطي لاستخراج المسافة (مثال: "1.8 كم" أو "2.5 km" أو "3 كم")
    private val distancePattern = Pattern.compile("(\\\\d+(\\\\.\\\\d+)?)\\\\s*(كم|km|كيلو)", Pattern.CASE_INSENSITIVE)

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        val rootNode = rootInActiveWindow ?: return
        
        // التحقق من تشغيل الأداة
        if (!LocateGoManager.isRunning) return

        // فحص نصوص الشاشة للبحث عن تفاصيل العرض
        findDistanceAndDecide(rootNode)
    }

    private fun findDistanceAndDecide(node: AccessibilityNodeInfo) {
        val text = node.text?.toString() ?: ""
        val matcher = distancePattern.matcher(text)

        if (matcher.find()) {
            val distanceStr = matcher.group(1)
            val distanceKm = distanceStr?.toFloatOrNull() ?: return

            // فحص الشرط المحدد من المندوب في الواجهة:
            val maxAllowed = LocateGoManager.maxDistanceKm

            if (distanceKm <= maxAllowed) {
                // المسافة مقبولة -> تنفيذ نقرة القبول التلقائي
                clickAcceptButton()
                LocateGoManager.recordOrder(distanceKm, status = "ACCEPTED")
            } else {
                // المسافة بعيدة -> تجاهل الطلب
                LocateGoManager.recordOrder(distanceKm, status = "REJECTED_TOO_FAR")
            }
            return
        }

        // البحث تكرارياً في العقد الفرعية للشاشة
        for (i in 0 until node.childCount) {
            val child = node.getChild(i) ?: continue
            findDistanceAndDecide(child)
            child.recycle()
        }
    }

    private fun clickAcceptButton() {
        // البحث عن زر يحتوي على نص "قبول" أو "Accept" والنقر عليه
        val acceptNodes = rootInActiveWindow?.findAccessibilityNodeInfosByText("قبول")
        acceptNodes?.firstOrNull()?.performAction(AccessibilityNodeInfo.ACTION_CLICK)
    }

    override fun onInterrupt() {}
}
`;

  const OVERLAY_SERVICE_CODE = `package com.locatego.service

import android.app.Service
import android.content.Intent
import android.graphics.PixelFormat
import android.os.Build
import android.os.IBinder
import android.view.Gravity
import android.view.WindowManager
import androidx.compose.ui.platform.ComposeView
import androidx.lifecycle.*
import androidx.savedstate.*

/**
 * LocateGoOverlayService
 * المسؤول عن إنشاء النافذة العائمة فوق الشاشة (Floating Window)
 * باستخدام TYPE_APPLICATION_OVERLAY
 */
class LocateGoOverlayService : Service() {

    private lateinit var windowManager: WindowManager
    private lateinit var floatingView: ComposeView

    override fun onCreate() {
        super.onCreate()
        windowManager = getSystemService(WINDOW_SERVICE) as WindowManager

        val layoutFlag = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
        } else {
            @Suppress("DEPRECATION")
            WindowManager.LayoutParams.TYPE_PHONE
        }

        val params = WindowManager.LayoutParams(
            WindowManager.LayoutParams.WRAP_CONTENT,
            WindowManager.LayoutParams.WRAP_CONTENT,
            layoutFlag,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE,
            PixelFormat.TRANSLUCENT
        ).apply {
            gravity = Gravity.TOP or Gravity.START
            x = 30
            y = 100
        }

        floatingView = ComposeView(this).apply {
            setContent {
                LocateGoFloatingOverlay(
                    isRunning = LocateGoManager.isRunning,
                    maxDistanceKm = LocateGoManager.maxDistanceKm,
                    isScreenMonitoring = true,
                    recentOrders = LocateGoManager.recentOrders,
                    onTogglePower = { LocateGoManager.togglePower() },
                    onDistanceChange = { LocateGoManager.setDistance(it) }
                )
            }
        }

        windowManager.addView(floatingView, params)
    }

    override fun onDestroy() {
        super.onDestroy()
        if (::floatingView.isInitialized) {
            windowManager.removeView(floatingView)
        }
    }

    override fun onBind(intent: Intent?): IBinder? = null
}
`;

  const MANIFEST_CODE = `<!-- إذن الظهور فوق التطبيقات للنافذة العائمة -->
<uses-permission android:name="android.permission.SYSTEM_ALERT_WINDOW" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />

<application>
    <!-- خدمة النافذة العائمة -->
    <service
        android:name=".service.LocateGoOverlayService"
        android:foregroundServiceType="specialUse"
        android:exported="false" />

    <!-- خدمة قراءة الشاشة (Accessibility) لرصد مسافة الطلب والتلقائية -->
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
`;

  const activeCode =
    activeTab === 'compose'
      ? JETPACK_COMPOSE_CODE
      : activeTab === 'accessibility'
      ? ACCESSIBILITY_SERVICE_CODE
      : activeTab === 'service'
      ? OVERLAY_SERVICE_CODE
      : MANIFEST_CODE;

  return (
    <div className="bg-gradient-to-b from-[#121929] to-[#0c1220] rounded-2xl p-6 border border-slate-800 shadow-xl">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 pb-5 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
              <Code2 className="w-4 h-4" />
            </span>
            <h2 className="text-base font-bold text-white">دليل الكود والربط البرمجي الكامل (Android & Jetpack Compose)</h2>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            شرح كيفية ربط الواجهة بوظائف مراقبة الشاشة (Accessibility Service) والنافذة العائمة (Floating Overlay Window)
          </p>
        </div>

        {/* Code Tabs */}
        <div className="flex flex-wrap items-center bg-slate-900 rounded-xl p-1 border border-slate-800 text-xs">
          <button
            onClick={() => setActiveTab('compose')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
              activeTab === 'compose' ? 'bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/30' : 'text-slate-400'
            }`}
          >
            LocateGoOverlay.kt (Compose)
          </button>
          <button
            onClick={() => setActiveTab('accessibility')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
              activeTab === 'accessibility' ? 'bg-cyan-500/20 text-cyan-300 font-bold border border-cyan-500/30' : 'text-slate-400'
            }`}
          >
            AccessibilityService.kt (رصد الشاشة)
          </button>
          <button
            onClick={() => setActiveTab('service')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
              activeTab === 'service' ? 'bg-indigo-500/20 text-indigo-300 font-bold border border-indigo-500/30' : 'text-slate-400'
            }`}
          >
            OverlayService.kt (النافذة العائمة)
          </button>
          <button
            onClick={() => setActiveTab('manifest')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
              activeTab === 'manifest' ? 'bg-amber-500/20 text-amber-300 font-bold border border-amber-500/30' : 'text-slate-400'
            }`}
          >
            AndroidManifest.xml
          </button>
        </div>
      </div>

      {/* Architecture Explanation Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 my-5">
        <div className="p-4 rounded-xl bg-[#090d16] border border-slate-800">
          <div className="flex items-center gap-2 text-emerald-400 font-bold text-xs mb-1">
            <Layers className="w-4 h-4" />
            <span>1. طبقة العرض (Floating Overlay)</span>
          </div>
          <p className="text-[11px] text-slate-400 leading-relaxed">
            يتم بناء الواجهة باستخدام <strong>Jetpack Compose</strong> داخل خدمة <code>OverlayService</code> مع إذن <code>SYSTEM_ALERT_WINDOW</code> لتظهر فوق كل التطبيقات مع دعم السحب والتصغير.
          </p>
        </div>

        <div className="p-4 rounded-xl bg-[#090d16] border border-slate-800">
          <div className="flex items-center gap-2 text-cyan-400 font-bold text-xs mb-1">
            <Terminal className="w-4 h-4" />
            <span>2. طبقة قراءة الشاشة (Accessibility)</span>
          </div>
          <p className="text-[11px] text-slate-400 leading-relaxed">
            تقوم خدمة <code>AccessibilityService</code> بمراقبة شجرة الشاشة (View Hierarchy) بشكل فوري واستخراج المسافة برقم ونمط (Regex) من تطبيقات التوصيل.
          </p>
        </div>

        <div className="p-4 rounded-xl bg-[#090d16] border border-slate-800">
          <div className="flex items-center gap-2 text-indigo-400 font-bold text-xs mb-1">
            <ShieldCheck className="w-4 h-4" />
            <span>3. منطق اتخاذ القرار (Decision Engine)</span>
          </div>
          <p className="text-[11px] text-slate-400 leading-relaxed">
            مقارنة مسافة الطلب مع <code>maxDistanceKm</code>: إذا كانت أقل تنفذ نقرة القبول التلقائية وإصدار صوت نجاح، وإذا كانت أكبر تتجاهل الطلب فوراً.
          </p>
        </div>
      </div>

      {/* Code Viewer */}
      <div className="relative rounded-xl bg-[#080c14] border border-slate-800 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2.5 bg-slate-900/90 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <FileCode className="w-4 h-4 text-emerald-400" />
            <span className="text-xs font-mono text-slate-300">
              {activeTab === 'compose'
                ? 'LocateGoFloatingOverlay.kt'
                : activeTab === 'accessibility'
                ? 'LocateGoAccessibilityService.kt'
                : activeTab === 'service'
                ? 'LocateGoOverlayService.kt'
                : 'AndroidManifest.xml'}
            </span>
          </div>

          <button
            onClick={() => copyToClipboard(activeCode, activeTab)}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200 border border-slate-700 transition-all cursor-pointer"
          >
            {copiedKey === activeTab ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-emerald-400">تم النسخ!</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>نسخ الكود</span>
              </>
            )}
          </button>
        </div>

        <pre className="p-4 text-xs font-mono text-slate-300 overflow-x-auto max-h-[460px] leading-relaxed select-text" dir="ltr">
          <code>{activeCode}</code>
        </pre>
      </div>
    </div>
  );
};
