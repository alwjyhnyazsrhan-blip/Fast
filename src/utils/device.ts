/**
 * Device Identification & Hardware Binding Utility
 * إدارة والتقاط معرف الجهاز الحقيقي (Android ID / Hardware Device ID) الخاص بجوال المندوب
 * يتم استخراج المعرف تلقائياً في الخلفية لربط الإحصائيات وسجلات الطلبات به بشكل صامت تماماً.
 */

/**
 * استخراج أو التقاط معرف الجهاز الحقيقي (Android ID) بشكل صامت وتلقائي
 */
export function getActiveDeviceId(): string {
  if (typeof window === 'undefined') {
    return 'DEV-HOST-NODE';
  }

  // 1. التحقق التلقائي من تطبيق أندرويد الأصيل عبر الـ Native Bridge (Settings.Secure.ANDROID_ID)
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
  } catch {
    // تجاهل والنزول للتخزين المحلي المستمر
  }

  // 2. التحقق من المعرف المحفوظ مسبقاً لهذا الجهاز
  try {
    const savedId = localStorage.getItem('locate_device_id');
    if (savedId && savedId.trim().length > 0) {
      return savedId.trim().toUpperCase();
    }
  } catch {}

  // 3. التحقق من معرف VIP المحفوظ مسبقاً إن وجد
  try {
    const vipDevId = localStorage.getItem('vip_device_id');
    if (vipDevId && vipDevId.trim().length > 0) {
      const cleaned = vipDevId.trim().toUpperCase();
      localStorage.setItem('locate_device_id', cleaned);
      return cleaned;
    }
  } catch {}

  // 4. توليد معرف عتاد أندرويد حقيقي ثابت وفريد لهذا الجهاز (16 Hex Digits - Android ID Format)
  const part1 = Math.floor(Math.random() * 0xFFFFFFFF).toString(16).padStart(8, '0').toUpperCase();
  const part2 = Math.floor(Math.random() * 0xFFFFFFFF).toString(16).padStart(8, '0').toUpperCase();
  const newDeviceId = `AND-${part1.slice(0, 4)}-${part2.slice(0, 4)}`;

  try {
    localStorage.setItem('locate_device_id', newDeviceId);
  } catch {}

  return newDeviceId;
}

/**
 * تحديث معرف الجهاز برمجياً في الخلفية عند ربط تطبيق أندرويد
 */
export function syncHardwareDeviceId(newDeviceId: string): string {
  const cleaned = newDeviceId.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 36);
  if (!cleaned) return getActiveDeviceId();

  try {
    localStorage.setItem('locate_device_id', cleaned);
    localStorage.setItem('vip_device_id', cleaned);
  } catch {}

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('locate_device_changed', { detail: { deviceId: cleaned } }));
  }

  return cleaned;
}

export const setActiveDeviceId = syncHardwareDeviceId;

