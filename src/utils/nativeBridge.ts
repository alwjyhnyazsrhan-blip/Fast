/**
 * LocateGoNativeBridge TypeScript Interface & Helpers
 * يتيح لواجهة React التفاعل مباشرة وبشكل سلس مع طبقة نظام أندرويد الأصيلة.
 */

export interface LocateGoNativeInterface {
  getSettingsJson(): string;
  saveSettings(settingsJsonStr: string): boolean;
  setTrackingActive(active: boolean): void;
  getAndroidStatusJson(): string;
  openAccessibilitySettings(): void;
  toggleFloatingOverlay(): void;
  requestBatteryOptimization(): void;
  showToast(message: string): void;
}

declare global {
  interface Window {
    LocateGoNative?: LocateGoNativeInterface;
    onLocateGoNativeSync?: (state: {
      isNativeApp: boolean;
      isTrackingRunning: boolean;
      isOverlayShowing: boolean;
      lat: number;
      lng: number;
    }) => void;
  }
}

export const isRunningInAndroidApp = (): boolean => {
  return typeof window !== 'undefined' && !!window.LocateGoNative;
};

export const getNativeBridge = (): LocateGoNativeInterface | null => {
  if (typeof window !== 'undefined' && window.LocateGoNative) {
    return window.LocateGoNative;
  }
  return null;
};
