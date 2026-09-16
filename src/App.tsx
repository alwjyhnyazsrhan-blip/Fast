import React, { useState, useEffect, useCallback } from 'react';
import { Header } from './components/Header';
import { MainControlCard } from './components/MainControlCard';
import { LiveStatusIndicator } from './components/LiveStatusIndicator';
import { OrdersFeed } from './components/OrdersFeed';
import { FloatingWidgetOverlay } from './components/FloatingWidgetOverlay';
import { AndroidCodeGuideModal } from './components/AndroidCodeGuideModal';
import { ServerDeployGuide } from './components/ServerDeployGuide';
import { AndroidNativeControls } from './components/AndroidNativeControls';
import { VipLockScreen } from './components/VipLockScreen';
import { DeviceSessionCard } from './components/DeviceSessionCard';
import { LocateGoSettings, LocateGoStatus, OrderItem } from './types';
import { resolveAppSource } from './utils/sampleData';
import { soundManager } from './utils/audio';
import { getNativeBridge } from './utils/nativeBridge';
import {
  getDeviceId,
  setDeviceId,
  regenerateDeviceId,
  loadLocalSettings,
  saveLocalSettings,
  apiFetch,
} from './utils/deviceManager';

export default function App() {
  // 1. Device ID & Local Settings (Completely Isolated per Courier Device)
  const [deviceId, setDeviceIdState] = useState<string>(getDeviceId);
  const [settings, setSettings] = useState<LocateGoSettings>(loadLocalSettings);

  const [orders, setOrders] = useState<OrderItem[]>([]);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'server' | 'floating' | 'code'>('dashboard');
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
    isRunning: true,
    isOverlayActive: true,
    isMonitoringScreen: true,
    fps: 5.2,
    latencyMs: 14,
    lastScanTimestamp: Date.now(),
    totalScanned: 0,
    acceptedCount: 0,
    rejectedCount: 0,
    serverConnected: false,
    driverLocation: null,
  });

  // ----------------------------------------------------
  // 0. Single App Architecture: Listen for Android Bridge Sync
  // ----------------------------------------------------
  useEffect(() => {
    // If inside Android App, fetch local settings from SharedPreferences
    const bridge = getNativeBridge();
    if (bridge) {
      try {
        if (typeof bridge.getDeviceId === 'function') {
          const nativeDevId = bridge.getDeviceId();
          if (nativeDevId && nativeDevId.trim()) {
            const clean = setDeviceId(nativeDevId.trim());
            setDeviceIdState(clean);
          }
        }

        const rawSettings = bridge.getSettingsJson();
        if (rawSettings) {
          const parsed = JSON.parse(rawSettings);
          setSettings((prev) => {
            const merged = {
              ...prev,
              maxDistanceKm: parsed.maxDistanceKm ?? prev.maxDistanceKm,
              maxPickupDistanceKm: parsed.maxPickupDistanceKm ?? prev.maxPickupDistanceKm,
              autoAccept: parsed.autoAccept ?? prev.autoAccept,
              soundAlerts: parsed.soundAlerts ?? prev.soundAlerts,
              minPayoutSar: parsed.minPayoutSar ?? prev.minPayoutSar,
              vibrationFeedback: parsed.vibrationFeedback ?? prev.vibrationFeedback,
            };
            saveLocalSettings(merged);
            return merged;
          });
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
  }, []);

  // ----------------------------------------------------
  // 1. Initial Sync with Real Server API (Isolated by Device ID)
  // ----------------------------------------------------
  const fetchServerStatus = useCallback(async () => {
    try {
      const res = await apiFetch('/api/status');
      if (res.ok) {
        const data = await res.json();
        setStatus((prev) => ({
          ...prev,
          isRunning: data.isRunning ?? prev.isRunning,
          serverConnected: true,
          driverLocation: data.driverLocation ?? prev.driverLocation,
          totalScanned: data.stats?.totalScanned ?? prev.totalScanned,
          acceptedCount: data.stats?.acceptedCount ?? prev.acceptedCount,
          rejectedCount: data.stats?.rejectedCount ?? prev.rejectedCount,
        }));
      }
    } catch {
      setStatus((prev) => ({ ...prev, serverConnected: false }));
    }
  }, []);

  const fetchServerOrders = useCallback(async () => {
    try {
      const res = await apiFetch('/api/orders');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.orders)) {
          const mappedOrders: OrderItem[] = data.orders.map((o: any) => ({
            id: o.id,
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
  }, []);

  // Sync with server when deviceId changes
  useEffect(() => {
    fetchServerStatus();
    fetchServerOrders();
  }, [deviceId, fetchServerStatus, fetchServerOrders]);

  // Sync settings with server on load or change
  useEffect(() => {
    apiFetch('/api/settings', {
      method: 'POST',
      body: JSON.stringify(settings),
    }).catch(() => {});
  }, [deviceId, settings]);

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

        // Post to real server (tagged with X-Device-Id)
        try {
          await apiFetch('/api/location', {
            method: 'POST',
            body: JSON.stringify({ lat: latitude, lng: longitude, accuracy }),
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
  }, []);

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
      await apiFetch('/api/status/toggle', {
        method: 'POST',
        body: JSON.stringify({ isRunning: nextRunning }),
      });
    } catch {
      // Local state already updated
    }
  }, [status.isRunning, soundEnabled]);

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
  // 4. Update Settings (localStorage + Server Partition + SharedPreferences)
  // ----------------------------------------------------
  const handleUpdateMaxDistance = async (km: number) => {
    setSettings((prev) => {
      const updated = { ...prev, maxDistanceKm: km };
      saveLocalSettings(updated); // 💾 Save immediately in driver's localStorage
      const bridge = getNativeBridge();
      if (bridge) {
        bridge.saveSettings(JSON.stringify(updated));
      }
      return updated;
    });

    try {
      await apiFetch('/api/settings', {
        method: 'POST',
        body: JSON.stringify({ maxDistanceKm: km }),
      });
    } catch {
      // Local is safe
    }
  };

  const handleUpdateMaxPickupDistance = async (km: number) => {
    setSettings((prev) => {
      const updated = { ...prev, maxPickupDistanceKm: km };
      saveLocalSettings(updated); // 💾 Save immediately in driver's localStorage
      const bridge = getNativeBridge();
      if (bridge) {
        bridge.saveSettings(JSON.stringify(updated));
      }
      return updated;
    });

    try {
      await apiFetch('/api/settings', {
        method: 'POST',
        body: JSON.stringify({ maxPickupDistanceKm: km }),
      });
    } catch {
      // Local is safe
    }
  };

  const handleUpdateSettings = async (newSettings: Partial<LocateGoSettings>) => {
    setSettings((prev) => {
      const updated = { ...prev, ...newSettings };
      saveLocalSettings(updated); // 💾 Save immediately in driver's localStorage
      const bridge = getNativeBridge();
      if (bridge) {
        bridge.saveSettings(JSON.stringify(updated));
      }
      return updated;
    });

    try {
      await apiFetch('/api/settings', {
        method: 'POST',
        body: JSON.stringify(newSettings),
      });
    } catch {
      // Local is safe
    }
  };

  // ----------------------------------------------------
  // 5. Submit Order to Real Server for Geodesic Evaluation (Isolated per Device)
  // ----------------------------------------------------
  const handleProcessOrder = useCallback(
    async (orderPayload: {
      appName: string;
      storeName: string;
      customerDistrict?: string;
      distanceKm?: number;
      pickupDistanceKm?: number;
      deliveryDistanceKm?: number;
      payoutSar: number;
      storeLat?: number;
      storeLng?: number;
      customerLat?: number;
      customerLng?: number;
    }) => {
      if (!status.isRunning) return;

      const payloadWithLimits = {
        ...orderPayload,
        maxDistanceKm: settings.maxDistanceKm,
        maxPickupDistanceKm: settings.maxPickupDistanceKm,
      };

      try {
        const res = await apiFetch('/api/orders/evaluate', {
          method: 'POST',
          body: JSON.stringify(payloadWithLimits),
        });

        if (res.ok) {
          const data = await res.json();
          const serverOrder = data.order;
          const mappedOrder: OrderItem = {
            id: serverOrder.id,
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

      // Fallback local computation if server is temporarily unreachable
      const deliveryDist = orderPayload.deliveryDistanceKm ?? orderPayload.distanceKm ?? 1.8;
      const pickupDist = orderPayload.pickupDistanceKm ?? 1.2;
      const isDeliveryAccepted = deliveryDist <= settings.maxDistanceKm;
      const isPickupAccepted = pickupDist <= (settings.maxPickupDistanceKm ?? 2.0);
      const isPayoutAccepted = orderPayload.payoutSar >= settings.minPayoutSar;
      const isAccepted = isDeliveryAccepted && isPickupAccepted && isPayoutAccepted;

      let fallbackReason: string | undefined = undefined;
      if (!isDeliveryAccepted && !isPickupAccepted) {
        fallbackReason = `مسافة العميل (${deliveryDist} كم) ومسافة المطعم (${pickupDist} كم) تتجاوزان الحدود المسموحة`;
      } else if (!isDeliveryAccepted) {
        fallbackReason = `مسافة العميل (${deliveryDist} كم) تتجاوز الحد الأقصى (${settings.maxDistanceKm} كم)`;
      } else if (!isPickupAccepted) {
        fallbackReason = `مسافة المطعم (${pickupDist} كم) تتجاوز الحد الأقصى (${settings.maxPickupDistanceKm ?? 2.0} كم)`;
      } else if (!isPayoutAccepted) {
        fallbackReason = `أجر التوصيل (${orderPayload.payoutSar} ر.س) أقل من الحد الأدنى (${settings.minPayoutSar} ر.س)`;
      }

      const fallbackOrder: OrderItem = {
        id: `ord-${Math.floor(1000 + Math.random() * 9000)}`,
        appSource: resolveAppSource(orderPayload.appName),
        appName: orderPayload.appName,
        storeName: orderPayload.storeName,
        customerDistrict: orderPayload.customerDistrict || 'حي الياسمين',
        distanceKm: deliveryDist,
        pickupDistanceKm: pickupDist,
        deliveryDistanceKm: deliveryDist,
        payoutSar: orderPayload.payoutSar,
        detectedAt: new Date(),
        status: isAccepted ? 'accepted' : 'rejected',
        rejectionReason: fallbackReason,
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
    [status.isRunning, settings.maxDistanceKm, settings.maxPickupDistanceKm, settings.minPayoutSar, soundEnabled]
  );

  // Clear orders from server for THIS device
  const handleClearOrders = async () => {
    setOrders([]);
    try {
      await apiFetch('/api/orders', { method: 'DELETE' });
    } catch {
      // Local cleared
    }
  };

  // Real server synchronization
  const handleRefreshServerOrders = useCallback(async () => {
    setIsRefreshing(true);
    await fetchServerStatus();
    await fetchServerOrders();
    setIsRefreshing(false);
  }, [fetchServerStatus, fetchServerOrders]);

  // Device ID Management (Regenerate clean session or switch profile)
  const handleRegenerateDeviceId = useCallback(() => {
    if (window.confirm('هل تريد بالتأكيد توليد معرف جهاز جديد وبدء جلسة نظيفة ومعزولة تماماً؟')) {
      const newId = regenerateDeviceId();
      setDeviceIdState(newId);
      setOrders([]);
      apiFetch('/api/settings', {
        method: 'POST',
        headers: { 'X-Device-Id': newId, 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      }).catch(() => {});
    }
  }, [settings]);

  const handleChangeDeviceId = useCallback((newId: string) => {
    const cleanId = setDeviceId(newId);
    setDeviceIdState(cleanId);
    setOrders([]);
    apiFetch('/api/settings', {
      method: 'POST',
      headers: { 'X-Device-Id': cleanId, 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    }).catch(() => {});
  }, [settings]);

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
        onRelock={() => {
          localStorage.removeItem('vip_active_code');
          setIsVipUnlocked(false);
        }}
        deviceId={deviceId}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-6 sm:px-6 space-y-6">
        
        {/* VIEW 1: Main Driver Dashboard */}
        {activeTab === 'dashboard' && (
          <div className="space-y-6 animate-fadeIn">
            {/* 0. Device ID & Privacy Isolation Status */}
            <DeviceSessionCard
              deviceId={deviceId}
              onRegenerateDeviceId={handleRegenerateDeviceId}
              onChangeDeviceId={handleChangeDeviceId}
              totalScanned={status.totalScanned}
              acceptedCount={status.acceptedCount}
              rejectedCount={status.rejectedCount}
            />

            {/* 1. Android Native Integration Controls (Single App Mode) */}
            <AndroidNativeControls
              settings={settings}
              status={status}
              onTogglePower={handleTogglePower}
              onUpdateSettings={handleUpdateSettings}
            />

            {/* 2. Main Controls: Master Start/Stop & Dual Distance Limits (Customer & Restaurant) */}
            <MainControlCard
              settings={settings}
              status={status}
              onTogglePower={handleTogglePower}
              onUpdateMaxDistance={handleUpdateMaxDistance}
              onUpdateMaxPickupDistance={handleUpdateMaxPickupDistance}
              onUpdateSettings={handleUpdateSettings}
              onGetLiveLocation={handleGetLiveGPSLocation}
              isLocating={isLocating}
            />

            {/* 3. Live Status & Diagnostics Indicator */}
            <LiveStatusIndicator
              status={status}
              maxDistanceKm={settings.maxDistanceKm}
              maxPickupDistanceKm={settings.maxPickupDistanceKm}
            />

            {/* 4. Detected Orders Feed & History (Partitioned for this Device) */}
            <OrdersFeed
              orders={orders}
              maxDistanceKm={settings.maxDistanceKm}
              isRunning={status.isRunning}
              onClearOrders={handleClearOrders}
              onTestCustomOrder={handleProcessOrder}
            />
          </div>
        )}

        {/* VIEW 2: Real Server & Free Hosting Guide */}
        {activeTab === 'server' && (
          <div className="animate-fadeIn">
            <ServerDeployGuide />
          </div>
        )}

        {/* VIEW 3: Floating Mobile Phone Simulation */}
        {activeTab === 'floating' && (
          <div className="animate-fadeIn">
            <FloatingWidgetOverlay
              settings={settings}
              status={status}
              latestOrder={orders[0] || null}
              onTogglePower={handleTogglePower}
              onUpdateMaxDistance={handleUpdateMaxDistance}
              onUpdateMaxPickupDistance={handleUpdateMaxPickupDistance}
            />
          </div>
        )}

        {/* VIEW 4: Android Accessibility Service & Render Integration Guide */}
        {activeTab === 'code' && (
          <div className="animate-fadeIn">
            <AndroidCodeGuideModal />
          </div>
        )}

      </main>

      {/* Persistent Night-Mode Driver Footer */}
      <footer className="mt-auto border-t border-slate-800/80 bg-[#080c14] py-4 px-6 text-center text-xs text-slate-400">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2 flex-wrap justify-center">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-slate-300 font-semibold">Locate Go - مساعد مناديب التوصيل والتحقق الجغرافي</span>
            <span className="text-slate-500">|</span>
            <span className="font-mono text-emerald-400 bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
              الجهاز: {deviceId}
            </span>
          </div>
          <div className="flex items-center gap-3 text-slate-400 font-mono text-xs">
            <span>عميل: {settings.maxDistanceKm} كم</span>
            <span>مطعم: {settings.maxPickupDistanceKm ?? 2.0} كم</span>
            <span>•</span>
            <span>طلباتك: {orders.length}</span>
            <span>•</span>
            <span className={status.isRunning ? 'text-emerald-400' : 'text-slate-500'}>
              {status.isRunning ? 'المراقبة تعمل' : 'متوقف'}
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
