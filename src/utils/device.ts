/**
 * Device Identification & Representative Data Isolation Utility
 * إدارة وتوليد معرف الجهاز (Device ID) الخاص بكل مندوب لضمان العزل التام لبياناته في قاعدة البيانات.
 */

export interface RepresentativeProfile {
  id: string;
  name: string;
  city: string;
  vehicle: string;
}

export const PRESET_REPRESENTATIVES: RepresentativeProfile[] = [
  { id: 'REP-7701-A', name: 'المندوب أحمد (جهاز 1)', city: 'الرياض - حي النرجس', vehicle: 'سيارة تويوتا' },
  { id: 'REP-8802-B', name: 'المندوب خالد (جهاز 2)', city: 'الرياض - حي الياسمين', vehicle: 'دراجة نارية' },
  { id: 'REP-9903-C', name: 'المندوب عمر (جهاز 3)', city: 'الرياض - حي الملقا', vehicle: 'سيارة هيونداي' },
];

/**
 * استخراج أو توليد معرف فريد ودائم للجهاز
 */
export function getActiveDeviceId(): string {
  if (typeof window === 'undefined') {
    return 'REP-SERVER-DEFAULT';
  }

  // 1. التحقق من تطبيق أندرويد الأصيل عبر الـ Bridge
  try {
    const native = (window as any).LocateGoNative;
    if (native && typeof native.getDeviceId === 'function') {
      const nativeId = native.getDeviceId();
      if (nativeId && typeof nativeId === 'string' && nativeId.trim().length > 0) {
        const cleaned = nativeId.trim().toUpperCase();
        localStorage.setItem('locate_device_id', cleaned);
        return cleaned;
      }
    }
  } catch (err) {
    // تجاهل والنزول للتخزين المحلي
  }

  // 2. التحقق من التخزين المحلي لـ Locate Go
  const savedId = localStorage.getItem('locate_device_id');
  if (savedId && savedId.trim().length > 0) {
    return savedId.trim().toUpperCase();
  }

  // 3. التحقق من المعرف المحفوظ في VIP
  const vipDevId = localStorage.getItem('vip_device_id');
  if (vipDevId && vipDevId.trim().length > 0) {
    const cleaned = vipDevId.trim().toUpperCase();
    localStorage.setItem('locate_device_id', cleaned);
    return cleaned;
  }

  // 4. توليد معرف جديد فريد وثابت لهذا الجهاز
  const randomSuffix = Math.random().toString(36).substring(2, 7).toUpperCase();
  const timestampSuffix = Date.now().toString().slice(-3);
  const newDeviceId = `REP-${randomSuffix}-${timestampSuffix}`;

  try {
    localStorage.setItem('locate_device_id', newDeviceId);
  } catch {}

  return newDeviceId;
}

/**
 * تغيير معرف الجهاز (يتيح للمستخدم تجربة وفحص العزل بين المناديب مباشرة من الواجهة)
 */
export function setActiveDeviceId(newDeviceId: string): string {
  const cleaned = newDeviceId.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 32);
  if (!cleaned) return getActiveDeviceId();

  try {
    localStorage.setItem('locate_device_id', cleaned);
    localStorage.setItem('vip_device_id', cleaned);
  } catch {}

  // إطلاق حدث للتطبيق لتحديث الواجهة فوراً
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('locate_device_changed', { detail: { deviceId: cleaned } }));
  }

  return cleaned;
}

/**
 * توليد معرف عشوائي جديد تماماً لمندوب جديد
 */
export function generateFreshDeviceId(): string {
  const randomSuffix = Math.random().toString(36).substring(2, 6).toUpperCase();
  const counter = Math.floor(100 + Math.random() * 900);
  const freshId = `REP-${randomSuffix}-${counter}`;
  return setActiveDeviceId(freshId);
}
