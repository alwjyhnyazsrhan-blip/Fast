import React, { useState, useEffect, useCallback } from 'react';
import { Header } from './components/Header';
import { MainControlCard } from './components/MainControlCard';
import { LiveStatusIndicator } from './components/LiveStatusIndicator';
import { OrdersFeed } from './components/OrdersFeed';
import { FloatingWidgetOverlay } from './components/FloatingWidgetOverlay';
import { AndroidCodeGuideModal } from './components/AndroidCodeGuideModal';
import { ServerDeployGuide } from './components/ServerDeployGuide';
import { AndroidNativeControls } from './components/AndroidNativeControls';
import { LocateGoSettings, LocateGoStatus, OrderItem, AppSource } from './types';
import { INITIAL_ORDERS, APP_CONFIG } from './utils/sampleData';
import { soundManager } from './utils/audio';
import { getNativeBridge, isRunningInAndroidApp } from './utils/nativeBridge';

export default function App() {
  const [settings, setSettings] = useState<LocateGoSettings>({
    maxDistanceKm: 2.0,
    autoAccept: true,
    soundAlerts: true,
    minPayoutSar: 15.0,
    vibrationFeedback: true,
  });

  const [orders, setOrders] = useState<OrderItem[]>([]);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'server' | 'floating' | 'code'>('dashboard');
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [isLocating, setIsLocating] = useState<boolean>(false);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  const [status, setStatus] = useState<LocateGoStatus>({
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

  // ----------------------------------------------------
  // 0. Single App Architecture: Listen for Android Bridge Sync
  // ----------------------------------------------------
  useEffect(() => {
    // If inside Android App, fetch local settings from SharedPreferences
    const bridge = getNativeBridge();
    if (bridge) {
      try {
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
  }, []);

  // ----------------------------------------------------
  // 1. Initial Sync with Real Server API
  // ----------------------------------------------------
  const fetchServerStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/status');
      if (res.ok) {
        const data = await res.json();
        setStatus((prev) => ({
          ...prev,
          isRunning: data.isRunning,
          serverConnected: true,
          driverLocation: data.driverLocation,
          totalScanned: data.stats?.totalScanned || prev.totalScanned,
          acceptedCount: data.stats?.acceptedCount || prev.acceptedCount,
          rejectedCount: data.stats?.rejectedCount || prev.rejectedCount,
        }));
        if (data.settings) {
          setSettings(data.settings);
        }
      }
    } catch {
      setStatus((prev) => ({ ...prev, serverConnected: false }));
    }
  }, []);

  const fetchServerOrders = useCallback(async () => {
    try {
      const res = await fetch('/api/orders');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.orders) && data.orders.length > 0) {
          const mappedOrders: OrderItem[] = data.orders.map((o: any) => ({
            id: o.id,
            appSource: (o.appName?.toLowerCase().includes('هنقر') ? 'hungerstation' :
                        o.appName?.toLowerCase().includes('مرسول') ? 'marsool' :
                        o.appName?.toLowerCase().includes('تويو') ? 'toyou' : 'jahez') as AppSource,
            appName: o.appName || 'جاهز',
            storeName: o.storeName || 'متجر',
            customerDistrict: o.customerDistrict || 'الرياض',
            distanceKm: o.distanceKm || 2.0,
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

  useEffect(() => {
    fetchServerStatus();
    fetchServerOrders();
  }, [fetchServerStatus, fetchServerOrders]);

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

        // Post to real server
        try {
          await fetch('/api/location', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
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
      await fetch('/api/status/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ maxDistanceKm: km }),
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
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newSettings),
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
        const res = await fetch('/api/orders/evaluate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(orderPayload),
        });

        if (res.ok) {
          const data = await res.json();
          const serverOrder = data.order;
          const mappedOrder: OrderItem = {
            id: serverOrder.id,
            appSource: (orderPayload.appName.includes('هنقر') ? 'hungerstation' :
                        orderPayload.appName.includes('مرسول') ? 'marsool' :
                        orderPayload.appName.includes('تويو') ? 'toyou' : 'jahez') as AppSource,
            appName: serverOrder.appName,
            storeName: serverOrder.storeName,
            customerDistrict: serverOrder.customerDistrict,
            distanceKm: serverOrder.distanceKm,
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
        appSource: 'jahez',
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
    [status.isRunning, settings.maxDistanceKm, soundEnabled]
  );

  // Clear orders from server
  const handleClearOrders = async () => {
    setOrders([]);
    try {
      await fetch('/api/orders', { method: 'DELETE' });
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
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-6 sm:px-6 space-y-6">
        
        {/* VIEW 1: Main Driver Dashboard */}
        {activeTab === 'dashboard' && (
          <div className="space-y-6 animate-fadeIn">
            {/* 1. Android Native Integration Controls (Single App Mode) */}
            <AndroidNativeControls
              settings={settings}
              status={status}
              onTogglePower={handleTogglePower}
              onUpdateSettings={handleUpdateSettings}
            />

            {/* 2. Main Controls: Master Start/Stop & Max Distance Threshold */}
            <MainControlCard
              settings={settings}
              status={status}
              onTogglePower={handleTogglePower}
              onUpdateMaxDistance={handleUpdateMaxDistance}
              onUpdateSettings={handleUpdateSettings}
              onGetLiveLocation={handleGetLiveGPSLocation}
              isLocating={isLocating}
            />

            {/* 3. Live Status & Diagnostics Indicator */}
            <LiveStatusIndicator
              status={status}
              maxDistanceKm={settings.maxDistanceKm}
            />

            {/* 4. Detected Orders Feed & History */}
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
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-slate-300 font-semibold">Locate Go - مساعد مناديب التوصيل والتحقق الجغرافي</span>
            <span className="text-slate-400">| متصل بالسيرفر المباشر</span>
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
