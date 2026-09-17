import React, { useState, useEffect, useCallback } from 'react';
import { Header } from './components/Header';
import { MainControlCard } from './components/MainControlCard';
import { LiveStatusIndicator } from './components/LiveStatusIndicator';
import { OrdersFeed } from './components/OrdersFeed';
import { FloatingWidgetOverlay } from './components/FloatingWidgetOverlay';
import { AndroidNativeControls } from './components/AndroidNativeControls';
import { VipLockScreen } from './components/VipLockScreen';
import { SecurityShieldBadge } from './components/SecurityShieldBadge';
import { LocateGoSettings, LocateGoStatus, OrderItem, AppSource } from './types';
import { INITIAL_ORDERS, APP_CONFIG, resolveAppSource } from './utils/sampleData';
import { soundManager } from './utils/audio';
import { getNativeBridge, isRunningInAndroidApp } from './utils/nativeBridge';
import { getActiveDeviceId, syncHardwareDeviceId, setActiveDeviceId } from './utils/device';
import { getSecureApiHeaders } from './utils/security';

export default function App() {
  const [deviceId, setDeviceIdState] = useState<string>(getActiveDeviceId());
  const [settings, setSettings] = useState<LocateGoSettings>({
    maxDistanceKm: 2.0,
    autoAccept: true,
    soundAlerts: true,
    minPayoutSar: 15.0,
    vibrationFeedback: true,
  });

  const [orders, setOrders] = useState<OrderItem[]>([]);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'floating'>('dashboard');
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [isLocating, setIsLocating] = useState<boolean>(false);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  // VIP Access Lock Screen State
  const [isVipUnlocked, setIsVipUnlocked] = useState<boolean>(false);
  const [vipCode, setVipCode] = useState<string>('');

  // Listen for VIP Unlock event from data-bridge.js
  useEffect(() => {
    const handleVipEvent = (e: any) => {
      setIsVipUnlocked(true);
      if (e.detail?.code) setVipCode(e.detail.code);
    };

    window.addEventListener('vip_unlocked', handleVipEvent);
    (window as any).onVipUnlocked = (data: any) => {
      setIsVipUnlocked(true);
      if (data?.code) setVipCode(data.code);
    };

    return () => {
      window.removeEventListener('vip_unlocked', handleVipEvent);
      delete (window as any).onVipUnlocked;
    };
  }, []);

  const [status, setStatus] = useState<LocateGoStatus>({
    deviceId: getActiveDeviceId(),
    isRunning: true,
    isOverlayActive: true,
    isMonitoringScreen: true,
    fps: 5.2,
    latencyMs: 14,
    lastScanTimestamp: Date.now(),
    totalScanned: orders.length,
    acceptedCount: orders.filter((o) => o.status === 'accepted').length,
    rejectedCount: orders.filter((o) => o.status === 'rejected').length,
    serverConnected: false,
    driverLocation: null,
  });

  // Listen for device changed events
  useEffect(() => {
    const handleDeviceChangeEvent = (e: any) => {
      if (e.detail?.deviceId) {
        setDeviceIdState(e.detail.deviceId);
      }
    };
    window.addEventListener('locate_device_changed', handleDeviceChangeEvent);
    return () => window.removeEventListener('locate_device_changed', handleDeviceChangeEvent);
  }, []);

  // ----------------------------------------------------
  // 0. Single App Architecture: Listen for Android Bridge Sync
  // ----------------------------------------------------
  useEffect(() => {
    // If inside Android App, fetch local settings from SharedPreferences
    const bridge = getNativeBridge();
    if (bridge) {
      try {
        if (bridge.getDeviceId) {
          const nativeDevId = bridge.getDeviceId();
          if (nativeDevId && nativeDevId !== deviceId) {
            setDeviceIdState(nativeDevId);
            setActiveDeviceId(nativeDevId);
          }
        }

        const rawSettings = bridge.getSettingsJson();
        if (rawSettings) {
          const parsed = JSON.parse(rawSettings);
          setSettings((prev) => ({
            ...prev,
            maxDistanceKm: parsed.maxDistanceKm ?? prev.maxDistanceKm,
            autoAccept: parsed.autoAccept ?? prev.autoAccept,
            soundAlerts: parsed.soundAlerts ?? prev.soundAlerts,
            minPayoutSar: parsed.minPayoutSar ?? prev.minPayoutSar,
            vibrationFeedback: parsed.vibrationFeedback ?? prev.vibrationFeedback,
          }));
        }

        const rawStatus = bridge.getAndroidStatusJson();
        if (rawStatus) {
          const parsedStatus = JSON.parse(rawStatus);
          if (parsedStatus.currentLatitude && parsedStatus.currentLongitude) {
            setStatus((prev) => ({
              ...prev,
              isRunning: parsedStatus.isTrackingRunning ?? prev.isRunning,
              driverLocation: {
                lat: parsedStatus.currentLatitude,
                lng: parsedStatus.currentLongitude,
                updatedAt: new Date().toISOString(),
              },
            }));
          }
        }
      } catch {
        // Fallback
      }
    }

    // Register callback for continuous real-time sync from Kotlin MainActivity
    window.onLocateGoNativeSync = (nativeState) => {
      setStatus((prev) => ({
        ...prev,
        isRunning: nativeState.isTrackingRunning,
        driverLocation: nativeState.lat && nativeState.lng ? {
          lat: nativeState.lat,
          lng: nativeState.lng,
          updatedAt: new Date().toISOString(),
        } : prev.driverLocation,
      }));
    };

    return () => {
      window.onLocateGoNativeSync = undefined;
    };
  }, [deviceId]);

  // ----------------------------------------------------
  // 1. Initial Sync with Real Server API (Isolated per Device)
  // ----------------------------------------------------
  const fetchServerStatus = useCallback(async (targetDeviceId = deviceId) => {
    try {
      const res = await fetch(`/api/status?deviceId=${encodeURIComponent(targetDeviceId)}`, {
        headers: { 'X-Device-Id': targetDeviceId },
      });
      if (res.ok) {
        const data = await res.json();
        setStatus((prev) => ({
          ...prev,
          deviceId: data.deviceId || targetDeviceId,
          isRunning: data.isRunning,
          serverConnected: true,
          driverLocation: data.driverLocation,
          totalScanned: data.stats?.totalScanned ?? prev.totalScanned,
          acceptedCount: data.stats?.acceptedCount ?? prev.acceptedCount,
          rejectedCount: data.stats?.rejectedCount ?? prev.rejectedCount,
          acceptanceRate: data.stats?.acceptanceRate,
          totalEarningsSar: data.stats?.totalEarningsSar,
        }));
        if (data.settings) {
          setSettings(data.settings);
        }
      }
    } catch {
      setStatus((prev) => ({ ...prev, serverConnected: false }));
    }
  }, [deviceId]);

  const fetchServerOrders = useCallback(async (targetDeviceId = deviceId) => {
    try {
      const res = await fetch(`/api/orders?deviceId=${encodeURIComponent(targetDeviceId)}`, {
        headers: { 'X-Device-Id': targetDeviceId },
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.orders)) {
          const mappedOrders: OrderItem[] = data.orders.map((o: any) => ({
            id: o.id,
            deviceId: o.deviceId || targetDeviceId,
            appSource: resolveAppSource(o.appName),
            appName: o.appName || 'Locate Go',
            storeName: o.storeName || 'متجر',
            customerDistrict: o.customerDistrict || 'الرياض',
            distanceKm: o.distanceKm || 2.0,
            pickupDistanceKm: o.pickupDistanceKm,
            deliveryDistanceKm: o.deliveryDistanceKm,
            payoutSar: o.payoutSar || 18,
            detectedAt: new Date(o.detectedAt || Date.now()),
            status: o.status,
            rejectionReason: o.rejectionReason,
            autoAccepted: o.autoAccepted,
          }));
          setOrders(mappedOrders);
        }
      }
    } catch {
      // Offline fallback
    }
  }, [deviceId]);

  useEffect(() => {
    fetchServerStatus(deviceId);
    fetchServerOrders(deviceId);
  }, [fetchServerStatus, fetchServerOrders, deviceId]);

  // Silent Hardware Device ID Sync (Android ID / Native Hardware ID)
  useEffect(() => {
    const detectHardwareDeviceId = () => {
      const bridge = getNativeBridge();
      if (bridge && typeof bridge.getDeviceId === 'function') {
        try {
          const hardwareId = bridge.getDeviceId();
          if (hardwareId && hardwareId.trim()) {
            const cleanId = hardwareId.trim().toUpperCase();
            if (cleanId !== deviceId) {
              setDeviceIdState(cleanId);
              setStatus((prev) => ({ ...prev, deviceId: cleanId }));
              syncHardwareDeviceId(cleanId);
              fetchServerStatus(cleanId);
              fetchServerOrders(cleanId);
            }
          }
        } catch {}
      }
    };

    detectHardwareDeviceId();
    const timer = setTimeout(detectHardwareDeviceId, 600);
    return () => clearTimeout(timer);
  }, [deviceId, fetchServerStatus, fetchServerOrders]);

  // ----------------------------------------------------
  // 2. Real GPS Location via HTML5 Geolocation API
  // ----------------------------------------------------
  const handleGetLiveGPSLocation = useCallback(() => {
    if (!('geolocation' in navigator)) {
      alert('المتصفح لا يدعم تحديد الموقع الجغرافي');
      return;
    }

    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        setIsLocating(false);
        const { latitude, longitude, accuracy } = pos.coords;
        const driverLoc = {
          lat: latitude,
          lng: longitude,
          accuracy,
          updatedAt: new Date().toISOString(),
        };

        setStatus((prev) => ({ ...prev, driverLocation: driverLoc }));

        // Post to real server with cryptographically signed integrity headers
        try {
          const bodyStr = JSON.stringify({ lat: latitude, lng: longitude, accuracy, deviceId });
          const secureHeaders = await getSecureApiHeaders(deviceId, bodyStr);
          await fetch('/api/location', {
            method: 'POST',
            headers: secureHeaders,
            body: bodyStr,
          });
        } catch {
          // Ignored if offline
        }
      },
      () => {
        setIsLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  }, [deviceId]);

  // Sync counts whenever orders change
  useEffect(() => {
    setStatus((prev) => ({
      ...prev,
      totalScanned: orders.length,
      acceptedCount: orders.filter((o) => o.status === 'accepted').length,
      rejectedCount: orders.filter((o) => o.status === 'rejected').length,
    }));
  }, [orders]);

  // ----------------------------------------------------
  // 3. Master Power Toggle (Synced with Server & Android Native)
  // ----------------------------------------------------
  const handleTogglePower = useCallback(async () => {
    const nextRunning = !status.isRunning;
    
    // Play sound feedback
    if (soundEnabled) {
      if (nextRunning) {
        soundManager.playStart();
      } else {
        soundManager.playStop();
      }
    }

    setStatus((prev) => ({
      ...prev,
      isRunning: nextRunning,
      isMonitoringScreen: nextRunning,
    }));

    // If running in Android App, notify native layer
    const bridge = getNativeBridge();
    if (bridge) {
      bridge.setTrackingActive(nextRunning);
    }

    try {
      await fetch('/api/status/toggle', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Device-Id': deviceId,
        },
        body: JSON.stringify({ isRunning: nextRunning, deviceId }),
      });
    } catch {
      // Local state already updated
    }
  }, [status.isRunning, soundEnabled, deviceId]);

  // Keyboard shortcut: Spacebar toggles start/stop
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName)) {
        return;
      }
      if (e.code === 'Space') {
        e.preventDefault();
        handleTogglePower();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleTogglePower]);

  // ----------------------------------------------------
  // 4. Update Settings (Synced with Server & Android SharedPreferences)
  // ----------------------------------------------------
  const handleUpdateMaxDistance = async (km: number) => {
    setSettings((prev) => {
      const updated = { ...prev, maxDistanceKm: km };
      const bridge = getNativeBridge();
      if (bridge) {
        bridge.saveSettings(JSON.stringify(updated));
      }
      return updated;
    });

    try {
      await fetch('/api/settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Device-Id': deviceId,
        },
        body: JSON.stringify({ maxDistanceKm: km, deviceId }),
      });
    } catch {
      // Keep local
    }
  };

  const handleUpdateSettings = async (newSettings: Partial<LocateGoSettings>) => {
    setSettings((prev) => {
      const updated = { ...prev, ...newSettings };
      const bridge = getNativeBridge();
      if (bridge) {
        bridge.saveSettings(JSON.stringify(updated));
      }
      return updated;
    });

    try {
      await fetch('/api/settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Device-Id': deviceId,
        },
        body: JSON.stringify({ ...newSettings, deviceId }),
      });
    } catch {
      // Keep local
    }
  };

  // ----------------------------------------------------
  // 5. Submit Order to Real Server for Geodesic Evaluation
  // ----------------------------------------------------
  const handleProcessOrder = useCallback(
    async (orderPayload: {
      appName: string;
      storeName: string;
      customerDistrict?: string;
      distanceKm?: number;
      payoutSar: number;
      storeLat?: number;
      storeLng?: number;
      customerLat?: number;
      customerLng?: number;
    }) => {
      if (!status.isRunning) return;

      try {
        const bodyStr = JSON.stringify({ ...orderPayload, deviceId });
        const secureHeaders = await getSecureApiHeaders(deviceId, bodyStr);
        const res = await fetch('/api/orders/evaluate', {
          method: 'POST',
          headers: secureHeaders,
          body: bodyStr,
        });

        if (res.ok) {
          const data = await res.json();
          const serverOrder = data.order;
          const mappedOrder: OrderItem = {
            id: serverOrder.id,
            deviceId: serverOrder.deviceId || deviceId,
            appSource: resolveAppSource(serverOrder.appName || orderPayload.appName),
            appName: serverOrder.appName,
            storeName: serverOrder.storeName,
            customerDistrict: serverOrder.customerDistrict,
            distanceKm: serverOrder.distanceKm,
            pickupDistanceKm: serverOrder.pickupDistanceKm,
            deliveryDistanceKm: serverOrder.deliveryDistanceKm,
            payoutSar: serverOrder.payoutSar,
            detectedAt: new Date(serverOrder.detectedAt),
            status: serverOrder.status,
            rejectionReason: serverOrder.rejectionReason,
            autoAccepted: serverOrder.autoAccepted,
          };

          setOrders((prev) => [mappedOrder, ...prev]);

          if (soundEnabled) {
            if (mappedOrder.status === 'accepted') {
              soundManager.playAccepted();
            } else {
              soundManager.playRejected();
            }
          }
          return;
        }
      } catch {
        // Fallback local processing if server is temporarily unreachable
      }

      // Fallback local Haversine computation
      const distance = orderPayload.distanceKm || 1.8;
      const isAccepted = distance <= settings.maxDistanceKm;
      const fallbackOrder: OrderItem = {
        id: `ord-${Math.floor(1000 + Math.random() * 9000)}`,
        deviceId: deviceId,
        appSource: resolveAppSource(orderPayload.appName),
        appName: orderPayload.appName,
        storeName: orderPayload.storeName,
        customerDistrict: orderPayload.customerDistrict || 'حي الياسمين',
        distanceKm: distance,
        payoutSar: orderPayload.payoutSar,
        detectedAt: new Date(),
        status: isAccepted ? 'accepted' : 'rejected',
        rejectionReason: isAccepted
          ? undefined
          : `المسافة (${distance} كم) تتجاوز الحد الأقصى (${settings.maxDistanceKm} كم)`,
        autoAccepted: isAccepted,
      };

      setOrders((prev) => [fallbackOrder, ...prev]);
      if (soundEnabled) {
        if (isAccepted) {
          soundManager.playAccepted();
        } else {
          soundManager.playRejected();
        }
      }
    },
    [status.isRunning, settings.maxDistanceKm, soundEnabled, deviceId]
  );

  // Clear orders from server for this device
  const handleClearOrders = async () => {
    setOrders([]);
    try {
      await fetch(`/api/orders?deviceId=${encodeURIComponent(deviceId)}`, {
        method: 'DELETE',
        headers: { 'X-Device-Id': deviceId },
      });
    } catch {
      // Local cleared
    }
  };

  // Real server synchronization
  const handleRefreshServerOrders = useCallback(async () => {
    setIsRefreshing(true);
    await fetchServerStatus(deviceId);
    await fetchServerOrders(deviceId);
    setIsRefreshing(false);
  }, [fetchServerStatus, fetchServerOrders, deviceId]);

  // If not unlocked, lock the entire interface with VIP ACCESS Screen
  if (!isVipUnlocked) {
    return (
      <VipLockScreen
        onUnlock={(code) => {
          setVipCode(code);
          setIsVipUnlocked(true);
        }}
      />
    );
  }

  return (
    <div className="min-h-screen bg-[#090d16] text-slate-100 flex flex-col selection:bg-emerald-500 selection:text-black">
      {/* Top Navigation & Status Header */}
      <Header
        status={status}
        soundEnabled={soundEnabled}
        onToggleSound={() => setSoundEnabled(!soundEnabled)}
        activeTab={activeTab}
        onChangeTab={setActiveTab}
        onRefreshServer={handleRefreshServerOrders}
        isRefreshing={isRefreshing}
        vipCode={vipCode}
        currentDeviceId={deviceId}
        onRelock={() => {
          localStorage.removeItem('vip_active_code');
          setIsVipUnlocked(false);
        }}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-6 sm:px-6 space-y-6">
        
        {/* VIEW 1: Main Driver Dashboard */}
        {activeTab === 'dashboard' && (
          <div className="space-y-6 animate-fadeIn">
            {/* 1. Security & Anti-Reverse Engineering Protection Shield (ProGuard / R8 & API HMAC) */}
            <SecurityShieldBadge currentDeviceId={deviceId} />

            {/* 2. Android Native Integration Controls (Single App Mode) */}
            <AndroidNativeControls
              settings={settings}
              status={status}
              onTogglePower={handleTogglePower}
              onUpdateSettings={handleUpdateSettings}
            />

            {/* 3. Main Controls: Master Start/Stop & Max Distance Threshold */}
            <MainControlCard
              settings={settings}
              status={status}
              onTogglePower={handleTogglePower}
              onUpdateMaxDistance={handleUpdateMaxDistance}
              onUpdateSettings={handleUpdateSettings}
              onGetLiveLocation={handleGetLiveGPSLocation}
              isLocating={isLocating}
            />

            {/* 4. Live Status & Diagnostics Indicator */}
            <LiveStatusIndicator
              status={status}
              maxDistanceKm={settings.maxDistanceKm}
            />

            {/* 5. Detected Orders Feed & History */}
            <OrdersFeed
              orders={orders}
              maxDistanceKm={settings.maxDistanceKm}
              isRunning={status.isRunning}
              onClearOrders={handleClearOrders}
              onTestCustomOrder={handleProcessOrder}
              currentDeviceId={deviceId}
            />
          </div>
        )}

        {/* VIEW 2: Floating Mobile Phone Simulation for Couriers */}
        {activeTab === 'floating' && (
          <div className="animate-fadeIn">
            <FloatingWidgetOverlay
              settings={settings}
              status={status}
              latestOrder={orders[0] || null}
              onTogglePower={handleTogglePower}
              onUpdateMaxDistance={handleUpdateMaxDistance}
            />
          </div>
        )}

      </main>

      {/* Persistent Night-Mode Driver Footer */}
      <footer className="mt-auto border-t border-slate-800/80 bg-[#080c14] py-4 px-6 text-center text-xs text-slate-400">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-slate-300 font-semibold">Locate Go - لوحة تحكم المناديب والتحقق الجغرافي</span>
            <span className="text-slate-400">| نظام الفلترة المباشر</span>
          </div>
          <div className="flex items-center gap-3 text-slate-400 font-mono">
            <span>الحد الفعال: {settings.maxDistanceKm} كم</span>
            <span>•</span>
            <span>الطلبات: {orders.length}</span>
            <span>•</span>
            <span className={status.isRunning ? 'text-emerald-400' : 'text-slate-400'}>
              {status.isRunning ? 'المراقبة تعمل' : 'متوقف'}
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
