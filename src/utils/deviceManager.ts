/**
 * Device Manager & Local Storage Isolation Service
 * 
 * مسؤول عن:
 * 1. توليد وحفظ معرف الجهاز الموحد (Device ID) لكل مندوب على حدة.
 * 2. الحفظ والاسترجاع المحلي (localStorage) لإعدادات مسافة المطعم والعميل لضمان استقلالية كل سائق.
 * 3. تزويد كافة طلبات الشبكة بمعرف الجهاز عبر رأس X-Device-Id لعزل السجلات والإحصائيات في السيرفر.
 */

import { LocateGoSettings } from '../types';
import { getNativeBridge } from './nativeBridge';

const DEVICE_ID_KEY = 'locate_go_device_id_v2';
const SETTINGS_KEY = 'locate_go_local_settings_v2';

export const DEFAULT_SETTINGS: LocateGoSettings = {
  maxDistanceKm: 2.0,       // مسافة العميل الافتراضية
  maxPickupDistanceKm: 2.0, // مسافة المطعم الافتراضية
  autoAccept: true,
  soundAlerts: true,
  minPayoutSar: 15.0,
  vibrationFeedback: true,
};

/**
 * توليد معرف جهاز فريد ونظيف بصيغة LG-XXXX-XXXX
 */
function generateRandomDeviceId(): string {
  const chars = '0123456789ABCDEF';
  let p1 = '';
  let p2 = '';
  for (let i = 0; i < 4; i++) {
    p1 += chars.charAt(Math.floor(Math.random() * chars.length));
    p2 += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `LG-${p1}-${p2}`;
}

/**
 * الحصول على معرف الجهاز الخاص بالمستخدم الحالي.
 * الأولوية:
 * 1. كود أندرويد الأصيل عبر Bridge إذا كان متوفراً (مثل ANDROID_ID).
 * 2. القيمة المحفوظة في localStorage.
 * 3. توليد معرف جديد وحفظه في localStorage للأجهزة الجديدة.
 */
export function getDeviceId(): string {
  // 1. فحص طبقة أندرويد إذا كانت توفر getDeviceId
  try {
    const bridge = getNativeBridge() as any;
    if (bridge && typeof bridge.getDeviceId === 'function') {
      const nativeId = bridge.getDeviceId();
      if (nativeId && typeof nativeId === 'string' && nativeId.trim().length > 0) {
        return nativeId.trim();
      }
    }
  } catch {
    // تجاهل والرجوع للـ localStorage
  }

  // 2. فحص localStorage
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      let storedId = localStorage.getItem(DEVICE_ID_KEY);
      if (storedId && storedId.trim().length > 0) {
        return storedId.trim();
      }
      // 3. توليد وحفظ جديد
      const newId = generateRandomDeviceId();
      localStorage.setItem(DEVICE_ID_KEY, newId);
      return newId;
    }
  } catch {
    // Fallback if localStorage is disabled
  }

  return 'LG-GUEST-001';
}

/**
 * تعيين معرف جهاز محدد يدوياً (مفيد للمناديب الراغبين في استرجاع جلساتهم أو التبديل)
 */
export function setDeviceId(newId: string): string {
  const cleanId = newId.trim();
  if (typeof window !== 'undefined' && window.localStorage) {
    localStorage.setItem(DEVICE_ID_KEY, cleanId);
  }
  return cleanId;
}

/**
 * توليد معرف جديد وتصفير الجلسة الحالية
 */
export function regenerateDeviceId(): string {
  const newId = generateRandomDeviceId();
  if (typeof window !== 'undefined' && window.localStorage) {
    localStorage.setItem(DEVICE_ID_KEY, newId);
  }
  return newId;
}

/**
 * تحميل إعدادات المسافات والخيارات المحفوظة محلياً على جهاز السائق
 */
export function loadLocalSettings(): LocateGoSettings {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const savedStr = localStorage.getItem(SETTINGS_KEY);
      if (savedStr) {
        const parsed = JSON.parse(savedStr);
        return {
          maxDistanceKm: typeof parsed.maxDistanceKm === 'number' ? parsed.maxDistanceKm : DEFAULT_SETTINGS.maxDistanceKm,
          maxPickupDistanceKm: typeof parsed.maxPickupDistanceKm === 'number' ? parsed.maxPickupDistanceKm : DEFAULT_SETTINGS.maxPickupDistanceKm,
          autoAccept: typeof parsed.autoAccept === 'boolean' ? parsed.autoAccept : DEFAULT_SETTINGS.autoAccept,
          soundAlerts: typeof parsed.soundAlerts === 'boolean' ? parsed.soundAlerts : DEFAULT_SETTINGS.soundAlerts,
          minPayoutSar: typeof parsed.minPayoutSar === 'number' ? parsed.minPayoutSar : DEFAULT_SETTINGS.minPayoutSar,
          vibrationFeedback: typeof parsed.vibrationFeedback === 'boolean' ? parsed.vibrationFeedback : DEFAULT_SETTINGS.vibrationFeedback,
        };
      }
    }
  } catch {
    // Return default on error
  }
  return { ...DEFAULT_SETTINGS };
}

/**
 * حفظ إعدادات المسافات محلياً على جهاز المستخدم (localStorage)
 */
export function saveLocalSettings(settings: LocateGoSettings): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    }
  } catch {
    // ignore
  }
}

/**
 * توليد توقيع رقمي مشفر للطلب عبر Web Crypto API لمنع التلاعب
 */
async function computeClientSignature(deviceId: string, timestamp: number, nonce: string, bodyStr: string): Promise<string> {
  try {
    if (typeof window === 'undefined' || !window.crypto || !window.crypto.subtle) {
      return '';
    }
    const keyChunks = new Uint8Array([
      0x4c, 0x47, 0x5f, 0x53, 0x45, 0x43, 0x55, 0x52, 
      0x45, 0x5f, 0x32, 0x30, 0x32, 0x36, 0x5f, 0x48, 
      0x41, 0x53, 0x48, 0x5f, 0x56, 0x45, 0x52, 0x49, 
      0x46, 0x59, 0x5f, 0x4c, 0x47, 0x5f, 0x39, 0x39
    ]).map((b, i) => b ^ (i % 7));

    const cryptoKey = await window.crypto.subtle.importKey(
      "raw",
      keyChunks,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const normalized = `${deviceId}:${timestamp}:${nonce}:${bodyStr}`;
    const enc = new TextEncoder();
    const signatureBuffer = await window.crypto.subtle.sign("HMAC", cryptoKey, enc.encode(normalized));
    return Array.from(new Uint8Array(signatureBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  } catch {
    return '';
  }
}

/**
 * عميل إرسال طلبات السيرفر مع حقن ترويسة X-Device-Id والتوقيع الأمني HMAC تلقائياً
 */
export async function apiFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const deviceId = getDeviceId();
  const headers = new Headers(options.headers || {});
  
  if (!headers.has('X-Device-Id')) {
    headers.set('X-Device-Id', deviceId);
  }
  if (!headers.has('Content-Type') && options.method && options.method.toUpperCase() !== 'GET') {
    headers.set('Content-Type', 'application/json');
  }

  // إذا كان طلب POST/PUT وله body كائن، نتأكد من تضمين deviceId أيضاً
  let finalBody = options.body;
  let bodyStrForSig = '';
  if (options.body && typeof options.body === 'string') {
    try {
      const parsed = JSON.parse(options.body);
      if (typeof parsed === 'object' && parsed !== null && !parsed.deviceId) {
        parsed.deviceId = deviceId;
        finalBody = JSON.stringify(parsed);
      }
      bodyStrForSig = finalBody as string;
    } catch {
      bodyStrForSig = options.body;
    }
  }

  // إضافة توقيع الحماية المشددة
  const timestamp = Date.now();
  const nonce = Math.random().toString(36).substring(2, 12);
  try {
    const sig = await computeClientSignature(deviceId, timestamp, nonce, bodyStrForSig);
    if (sig) {
      headers.set('X-Timestamp', timestamp.toString());
      headers.set('X-Nonce', nonce);
      headers.set('X-Signature', sig);
      headers.set('X-Security-Mode', 'HMAC-SHA256');
    }
  } catch {
    // Continue if crypto subtle fails in older environments
  }

  return fetch(url, {
    ...options,
    headers,
    body: finalBody,
  });
}
