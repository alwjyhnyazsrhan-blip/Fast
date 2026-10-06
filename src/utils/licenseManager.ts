/**
 * Locate Go - VIP License & Security Manager
 * يدير فحص نبضات الترخيص الدورية (Heartbeat)، وإنهاء الخدمات الإجباري في الخلفية (Emergency Termination)
 */

import { getNativeBridge } from './nativeBridge';
import { soundManager } from './audio';
import { getVipDeviceId, isAuthorizedDevice } from './device';

export interface LicenseValidationResult {
  isValid: boolean;
  reason: 'active' | 'expired' | 'revoked' | 'not_found' | 'device_mismatch' | 'network_error';
  message: string;
  code?: string;
  expiryDate?: string | null;
  remainingHours?: number;
  usedBy?: string;
}

export interface TerminationNotice {
  reason: string;
  message: string;
  timestamp: number;
}

const FIREBASE_DB_URL = 'https://appprotector-79e9c-default-rtdb.firebaseio.com';

/**
 * دالة التحقق اللحظي من كود الترخيص من قاعدة البيانات (Firebase RTDB / Server Proxy)
 */
export async function validateLicenseOnline(
  rawCode: string,
  targetDeviceId?: string
): Promise<LicenseValidationResult> {
  const normalized = (rawCode || '').trim().toUpperCase();
  if (!normalized) {
    return {
      isValid: false,
      reason: 'not_found',
      message: 'كود الترخيص مفقود أو غير مسجل',
    };
  }

  const currentDevice = targetDeviceId || getVipDeviceId();
  const vipFingerprint = getVipDeviceId();

  try {
    // محاولة 1: الفحص عبر خادم Locate Go المحلي إن كان متاحاً
    try {
      const serverCheckUrl = `/api/license/verify?code=${encodeURIComponent(normalized)}&deviceId=${encodeURIComponent(currentDevice)}&vipDeviceId=${encodeURIComponent(vipFingerprint)}`;
      const serverRes = await fetch(serverCheckUrl, {
        headers: {
          'X-Device-Id': currentDevice,
          'X-Vip-Device-Id': vipFingerprint,
        },
      });

      if (serverRes.ok) {
        const result: LicenseValidationResult = await serverRes.json();
        return result;
      }
    } catch {
      // الاستمرار في الفحص المباشر لقاعدة البيانات كبديل موثوق
    }

    // محاولة 2: الفحص عبر Data Bridge / مسار activation_codes
    let codesList: any[] = [];
    try {
      const res = await fetch('tables/activation_codes');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.data)) {
          codesList = data.data;
        }
      }
    } catch {
      // المحاولة المباشرة لقاعدة البيانات كحل بديل نهائي
    }

    if (!codesList.length) {
      try {
        const directRes = await fetch(`${FIREBASE_DB_URL}/activation_codes.json`);
        if (directRes.ok) {
          const directData = await directRes.json();
          if (directData && typeof directData === 'object') {
            codesList = Object.values(directData);
          }
        }
      } catch (directErr) {
        console.warn('[LicenseManager] Direct DB fetch failed:', directErr);
      }
    }

    if (!codesList.length) {
      // إذا فشل الاتصال بالشبكة تماماً، لا نقطع الاتصال فوراً بل نرجع خطأ شبكة مؤقت
      return {
        isValid: false,
        reason: 'network_error',
        message: 'تعذر الاتصال بقاعدة بيانات التراخيص للتحقق الدوري',
      };
    }

    // البحث عن الكود المطابق
    const match = codesList.find(
      (item: any) => (item?.code || '').toString().trim().toUpperCase() === normalized
    );

    if (!match) {
      return {
        isValid: false,
        reason: 'not_found',
        message: '❌ كود الترخيص غير موجود في قاعدة البيانات أو تم حذفه',
      };
    }

    // 1. التحقق من حالة الإلغاء أو التعطيل
    const status = (match.status || '').toLowerCase();
    if (status === 'revoked' || status === 'banned' || status === 'disabled' || status === 'cancelled') {
      return {
        isValid: false,
        reason: 'revoked',
        message: '🚫 تم تعطيل أو إلغاء صلاحية هذا الكود من قبل الإدارة',
      };
    }

    // التحقق من حالة الانتهاء الصريحة في قاعدة البيانات
    if (status === 'expired') {
      return {
        isValid: false,
        reason: 'expired',
        message: '⏰ انتهى اشتراكك في قاعدة البيانات',
        expiryDate: match.expiry_date,
      };
    }

    // 2. التحقق من انتهاء تاريخ الصلاحية الفعلي المسجل بقاعدة البيانات مع هامش أمان لفروقات التوقيت
    if (match.expiry_date) {
      const expiryTimestamp = new Date(match.expiry_date).getTime();
      const now = Date.now();
      // إضافة هامش زمني للأمان (5 دقائق = 300,000 مللي ثانية) لمنع أي تعارض مع فروقات التوقيت في الأجهزة
      if (!isNaN(expiryTimestamp) && now > expiryTimestamp + 5 * 60 * 1000) {
        return {
          isValid: false,
          reason: 'expired',
          message: `⏰ انتهت صلاحية اشتراكك في (${new Date(match.expiry_date).toLocaleDateString('ar-SA')})`,
          expiryDate: match.expiry_date,
          remainingHours: 0,
        };
      }
    }

    // 3. التحقق المرن والموثوق من ارتباط الكود بهذا الجهاز
    if (match.used_by && match.used_by.trim() !== '') {
      const isMatched = isAuthorizedDevice(match.used_by, currentDevice);
      if (!isMatched) {
        return {
          isValid: false,
          reason: 'device_mismatch',
          message: '⚠️ كود الترخيص مرتبط بجوال أو جهاز آخر',
          usedBy: match.used_by,
        };
      }
    }

    // حساب الساعات المتبقية للاشتراك لعرضها فقط (دون التأثير على صلاحية الكود)
    let remainingHours: number | undefined = undefined;
    if (match.expiry_date) {
      const diffMs = new Date(match.expiry_date).getTime() - Date.now();
      remainingHours = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60)));
    }

    return {
      isValid: true,
      reason: 'active',
      message: '✅ كود الترخيص نشط وصالح',
      code: match.code,
      expiryDate: match.expiry_date,
      remainingHours,
      usedBy: match.used_by,
    };
  } catch (err) {
    console.error('[LicenseManager] Verification error:', err);
    return {
      isValid: false,
      reason: 'network_error',
      message: 'حدث خطأ أثناء الاتصال بقاعدة البيانات',
    };
  }
}

/**
 * دالة الإنهاء الإجباري (Emergency Kill Switch):
 * توقف جميع العمليات والخدمات فوراً وتلغي الجلسة وتمسح التخزين المحلي وتعيد التوجيه لشاشة VIP ACCESS
 */
export async function executeEmergencyTermination(options: {
  reason: string;
  message: string;
  deviceId?: string;
  onTerminate: () => void;
}): Promise<void> {
  const { reason, message, deviceId, onTerminate } = options;
  console.warn(`[LicenseManager] 🚨 EMERGENCY FORCE TERMINATION TRIGGERED: ${reason} - ${message}`);

  // 1. إيقاف الخدمات وحالة المراقبة في واجهة المستخدم فوراً
  try {
    onTerminate();
  } catch (e) {
    console.error('Error during onTerminate callback:', e);
  }

  // 2. إيقاف أي أصوات أو تنبيهات جارية
  try {
    soundManager.playStop();
  } catch {}

  // 3. إيقاف وقتل كافة خدمات أندرويد الخلفية ومسح الإشعارات فوراً عبر Native Bridge
  const bridge = getNativeBridge();
  if (bridge) {
    try {
      if (typeof bridge.killAllServices === 'function') {
        bridge.killAllServices();
      } else if (typeof bridge.stopAllServices === 'function') {
        bridge.stopAllServices();
      }
      bridge.setTrackingActive(false);
      bridge.showToast?.(`🛑 تم إيقاف وقتل كافة الخدمات وإزالة الإشعارات: ${message}`);
    } catch (bridgeErr) {
      console.warn('Native bridge stop call failed:', bridgeErr);
    }
  }

  // 4. إرسال أمر إيقاف فوري للخادم المحلي لقطع معالجة الطلبات الخاصة بهذا الجهاز
  const targetId = deviceId || getVipDeviceId();
  try {
    fetch('/api/status/toggle', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Device-Id': targetId,
      },
      body: JSON.stringify({ isRunning: false, deviceId: targetId, emergencyKill: true, reason }),
    }).catch(() => {});
  } catch {}

  // 5. مسح بيانات الجلسة النشطة دون مسح معرف الجهاز الثابت!
  try {
    localStorage.removeItem('vip_active_code');
    // لا نمسح vip_device_id إطلاقاً حتى تظل بصمة الجهاز ثابته وموثقة
    localStorage.removeItem('vip_admin_auth_v1');
    sessionStorage.clear();

    // حفظ إشعار الإنهاء ليظهر للمستخدم بوضوح على شاشة القفل VIP
    const notice: TerminationNotice = {
      reason,
      message,
      timestamp: Date.now(),
    };
    localStorage.setItem('vip_termination_notice', JSON.stringify(notice));
  } catch (storageErr) {
    console.error('Error clearing local session storage:', storageErr);
  }

  // 6. إطلاق حدث عام في نافذة المتصفح لإنهاء أي مهام فرعية
  try {
    window.dispatchEvent(
      new CustomEvent('locate_license_terminated', {
        detail: { reason, message, timestamp: Date.now() },
      })
    );
  } catch {}
}

/**
 * استرجاع إشعار الإنهاء المحفوظ إن وجد ومسحه بعد العرض
 */
export function consumeTerminationNotice(): TerminationNotice | null {
  try {
    const raw = localStorage.getItem('vip_termination_notice');
    if (raw) {
      const parsed = JSON.parse(raw);
      // صالح لمدة ساعتين من وقت الإنهاء
      if (Date.now() - parsed.timestamp < 2 * 60 * 60 * 1000) {
        return parsed;
      }
      localStorage.removeItem('vip_termination_notice');
    }
  } catch {}
  return null;
}
