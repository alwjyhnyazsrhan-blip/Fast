import React, { useState, useEffect } from 'react';
import { 
  Power, 
  Play, 
  Square, 
  MapPin, 
  Store,
  Gauge, 
  CheckCircle, 
  SlidersHorizontal, 
  Zap, 
  Shield, 
  HelpCircle, 
  ArrowUpRight,
  Navigation,
  RefreshCw,
  Server
} from 'lucide-react';
import { LocateGoSettings, LocateGoStatus } from '../types';

interface MainControlCardProps {
  settings: LocateGoSettings;
  status: LocateGoStatus;
  onTogglePower: () => void;
  onUpdateMaxDistance: (km: number) => void;
  onUpdateMaxPickupDistance: (km: number) => void;
  onUpdateSettings: (newSettings: Partial<LocateGoSettings>) => void;
  onGetLiveLocation?: () => void;
  isLocating?: boolean;
}

const PICKUP_PRESETS = [0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 4.0];
const DELIVERY_PRESETS = [1.0, 1.5, 2.0, 2.5, 3.0, 4.0, 5.0];

export const MainControlCard: React.FC<MainControlCardProps> = ({
  settings,
  status,
  onTogglePower,
  onUpdateMaxDistance,
  onUpdateMaxPickupDistance,
  onUpdateSettings,
  onGetLiveLocation,
  isLocating,
}) => {
  const [deliveryInput, setDeliveryInput] = useState(settings.maxDistanceKm.toString());
  const [pickupInput, setPickupInput] = useState((settings.maxPickupDistanceKm || 2.0).toString());

  useEffect(() => {
    setDeliveryInput(settings.maxDistanceKm.toString());
  }, [settings.maxDistanceKm]);

  useEffect(() => {
    setPickupInput((settings.maxPickupDistanceKm || 2.0).toString());
  }, [settings.maxPickupDistanceKm]);

  const handleDeliveryInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setDeliveryInput(val);
    const num = parseFloat(val);
    if (!isNaN(num) && num > 0 && num <= 50) {
      onUpdateMaxDistance(Math.round(num * 10) / 10);
    }
  };

  const handlePickupInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setPickupInput(val);
    const num = parseFloat(val);
    if (!isNaN(num) && num > 0 && num <= 50) {
      onUpdateMaxPickupDistance(Math.round(num * 10) / 10);
    }
  };

  const adjustDeliveryDistance = (delta: number) => {
    const nextVal = Math.max(0.5, Math.min(25, Math.round((settings.maxDistanceKm + delta) * 10) / 10));
    setDeliveryInput(nextVal.toString());
    onUpdateMaxDistance(nextVal);
  };

  const adjustPickupDistance = (delta: number) => {
    const current = settings.maxPickupDistanceKm || 2.0;
    const nextVal = Math.max(0.5, Math.min(25, Math.round((current + delta) * 10) / 10));
    setPickupInput(nextVal.toString());
    onUpdateMaxPickupDistance(nextVal);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      {/* 1. BIG START / STOP BUTTON (Element #1) */}
      <div className="lg:col-span-5 bg-gradient-to-b from-[#121929] to-[#0c1220] rounded-2xl p-6 border border-slate-800 shadow-xl flex flex-col justify-between relative overflow-hidden">
        {/* Glow ambient background aura */}
        <div
          className={`absolute -top-24 -left-24 w-64 h-64 rounded-full blur-3xl pointer-events-none transition-all duration-700 ${
            status.isRunning ? 'bg-emerald-500/20' : 'bg-rose-500/10'
          }`}
        />

        <div>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-slate-800/80 border border-slate-700/60 text-slate-300">
                <Power className="w-4 h-4" />
              </span>
              <h2 className="text-base font-bold text-white">التحكم الرئيسي بالأداة والسيرفر</h2>
            </div>
            <div className="flex items-center gap-1.5 text-xs">
              <span
                className={`w-2.5 h-2.5 rounded-full ${
                  status.isRunning ? 'bg-emerald-400 animate-ping' : 'bg-slate-600'
                }`}
              />
              <span className={`font-semibold ${status.isRunning ? 'text-emerald-400' : 'text-slate-400'}`}>
                {status.isRunning ? 'يعمل بنشاط' : 'متوقف مؤقتاً'}
              </span>
            </div>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed mb-6">
            يقوم السيرفر ومحرك Accessibility بالتحقق الفوري من شرطي <strong className="text-cyan-300">مسافة المطعم</strong> و<strong className="text-emerald-300">مسافة العميل</strong> معاً، مع النقر الفوري Zero-Delay عند المطابقة.
          </p>
        </div>

        {/* The Massive Start/Stop Button */}
        <div className="my-3 flex flex-col items-center justify-center">
          <button
            id="btn-master-start-stop"
            onClick={onTogglePower}
            className={`group relative w-full sm:w-64 h-36 sm:h-40 rounded-2xl flex flex-col items-center justify-center gap-2 transition-all duration-300 active:scale-95 cursor-pointer select-none border-2 shadow-2xl ${
              status.isRunning
                ? 'bg-gradient-to-b from-rose-950/80 to-rose-900/60 border-rose-500/80 text-rose-100 hover:border-rose-400 shadow-rose-950/50 hover:shadow-rose-900/40'
                : 'bg-gradient-to-b from-emerald-950/80 to-emerald-900/60 border-emerald-500/80 text-emerald-100 hover:border-emerald-400 shadow-emerald-950/50 hover:shadow-emerald-900/40'
            }`}
          >
            {/* Pulsing ring when active */}
            {status.isRunning && (
              <span className="absolute inset-0 rounded-2xl border-2 border-rose-500 animate-ping opacity-25 pointer-events-none" />
            )}

            {/* Icon */}
            <div
              className={`w-14 h-14 rounded-full flex items-center justify-center transition-transform group-hover:scale-110 shadow-lg ${
                status.isRunning
                  ? 'bg-rose-500 text-white shadow-rose-600/40'
                  : 'bg-emerald-500 text-slate-950 shadow-emerald-600/40'
              }`}
            >
              {status.isRunning ? (
                <Square className="w-7 h-7 fill-white" />
              ) : (
                <Play className="w-7 h-7 fill-current mr-0.5" />
              )}
            </div>

            {/* Big Label */}
            <div className="text-center">
              <span className="text-2xl font-black tracking-tight block">
                {status.isRunning ? 'إيقاف الأداة' : 'تشغيل الأداة'}
              </span>
              <span
                className={`text-[11px] font-medium block mt-0.5 ${
                  status.isRunning ? 'text-rose-300' : 'text-emerald-300'
                }`}
              >
                {status.isRunning
                  ? 'المراقبة وفلترة المسافات نشطة'
                  : 'اضغط للبدء الفوري برصد الطلبات'}
              </span>
            </div>
          </button>
        </div>

        {/* GPS Location & Live Sync Bar */}
        <div className="pt-3 border-t border-slate-800/80 flex flex-col gap-2">
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-1.5 text-slate-300 font-medium">
              <Navigation className="w-3.5 h-3.5 text-cyan-400" />
              <span>موقع المندوب الجغرافي:</span>
            </div>
            {onGetLiveLocation && (
              <button
                onClick={onGetLiveLocation}
                disabled={isLocating}
                className="flex items-center gap-1 text-[11px] text-cyan-400 hover:text-cyan-300 bg-cyan-950/40 px-2 py-0.5 rounded border border-cyan-800/50 cursor-pointer"
              >
                <RefreshCw className={`w-3 h-3 ${isLocating ? 'animate-spin' : ''}`} />
                <span>{isLocating ? 'جاري التحديد...' : 'تحديث GPS'}</span>
              </button>
            )}
          </div>

          <div className="bg-[#090d16] p-2 rounded-lg border border-slate-800 font-mono text-[11px] text-slate-400 flex items-center justify-between">
            {status.driverLocation ? (
              <div className="text-slate-300 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
                <span>خط العرض: {status.driverLocation.lat.toFixed(4)}</span>
                <span>•</span>
                <span>خط الطول: {status.driverLocation.lng.toFixed(4)}</span>
              </div>
            ) : (
              <span className="text-slate-500">اضغط "تحديث GPS" لالتقاط إحداثيات موقعك الحقيقية</span>
            )}
          </div>
        </div>
      </div>

      {/* 2. DUAL DISTANCE CONTROLS (RESTAURANT & CUSTOMER) */}
      <div className="lg:col-span-7 bg-gradient-to-b from-[#121929] to-[#0c1220] rounded-2xl p-6 border border-slate-800 shadow-xl flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
                <SlidersHorizontal className="w-4 h-4" />
              </span>
              <h2 className="text-base font-bold text-white">فلترة المسافات المستقلة (المطعم + العميل)</h2>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-cyan-950/80 text-cyan-400 border border-cyan-500/30 font-mono">
                المطعم: {settings.maxPickupDistanceKm || 2.0} كم
              </span>
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-950/80 text-emerald-400 border border-emerald-500/30 font-mono">
                العميل: {settings.maxDistanceKm} كم
              </span>
            </div>
          </div>

          <div className="space-y-4">
            {/* PART A: RESTAURANT / PICKUP DISTANCE CONTROL */}
            <div className="bg-[#090d16] p-4 rounded-xl border border-cyan-900/40 relative">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Store className="w-4 h-4 text-cyan-400" />
                  <span className="text-xs font-bold text-cyan-300">1. أقصى مسافة للمطعم / الاستلام (Pickup Distance):</span>
                </div>
                <span className="text-[11px] text-cyan-400/90 font-mono bg-cyan-950/60 px-2 py-0.5 rounded border border-cyan-800/40">
                  {settings.maxPickupDistanceKm || 2.0} كم كحد أقصى
                </span>
              </div>

              <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-black text-white font-mono">
                    {settings.maxPickupDistanceKm || 2.0}
                  </span>
                  <span className="text-sm font-bold text-cyan-400">كم (مسافة المطعم)</span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    id="btn-decrease-pickup-distance"
                    onClick={() => adjustPickupDistance(-0.5)}
                    className="w-9 h-9 rounded-lg bg-slate-800 hover:bg-slate-700 active:scale-95 border border-slate-700 text-slate-200 font-bold text-base flex items-center justify-center cursor-pointer"
                    title="إنقاص نصف كم"
                  >
                    -
                  </button>

                  <div className="relative">
                    <input
                      id="input-max-pickup-distance"
                      type="number"
                      step="0.1"
                      min="0.5"
                      max="25"
                      value={pickupInput}
                      onChange={handlePickupInputChange}
                      className="w-20 h-9 text-center bg-slate-900 border border-slate-700 rounded-lg text-white font-mono font-bold text-sm focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
                    />
                    <span className="absolute left-2 top-2.5 text-[9px] text-slate-500 font-mono pointer-events-none">
                      كم
                    </span>
                  </div>

                  <button
                    id="btn-increase-pickup-distance"
                    onClick={() => adjustPickupDistance(0.5)}
                    className="w-9 h-9 rounded-lg bg-slate-800 hover:bg-slate-700 active:scale-95 border border-slate-700 text-slate-200 font-bold text-base flex items-center justify-center cursor-pointer"
                    title="زيادة نصف كم"
                  >
                    +
                  </button>
                </div>
              </div>

              {/* Slider for pickup */}
              <div className="mt-3">
                <input
                  id="slider-max-pickup-distance"
                  type="range"
                  min="0.5"
                  max="6"
                  step="0.1"
                  value={settings.maxPickupDistanceKm || 2.0}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    setPickupInput(val.toString());
                    onUpdateMaxPickupDistance(val);
                  }}
                  className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-500"
                />
              </div>

              {/* Pickup presets */}
              <div className="flex flex-wrap gap-1.5 mt-2.5">
                {PICKUP_PRESETS.map((km) => {
                  const isSelected = (settings.maxPickupDistanceKm || 2.0) === km;
                  return (
                    <button
                      key={km}
                      id={`btn-preset-pickup-${km}`}
                      onClick={() => {
                        setPickupInput(km.toString());
                        onUpdateMaxPickupDistance(km);
                      }}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-mono font-semibold transition-all border ${
                        isSelected
                          ? 'bg-cyan-500 text-slate-950 border-cyan-400 font-bold shadow-sm shadow-cyan-500/30'
                          : 'bg-slate-800/70 hover:bg-slate-700 text-slate-300 border-slate-700/60'
                      }`}
                    >
                      {km} كم
                    </button>
                  );
                })}
              </div>
            </div>

            {/* PART B: CUSTOMER / DELIVERY DISTANCE CONTROL */}
            <div className="bg-[#090d16] p-4 rounded-xl border border-emerald-900/40 relative">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-emerald-400" />
                  <span className="text-xs font-bold text-emerald-300">2. أقصى مسافة للعميل / الوجهة (Delivery Distance):</span>
                </div>
                <span className="text-[11px] text-emerald-400/90 font-mono bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800/40">
                  {settings.maxDistanceKm} كم كحد أقصى
                </span>
              </div>

              <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-black text-white font-mono">
                    {settings.maxDistanceKm}
                  </span>
                  <span className="text-sm font-bold text-emerald-400">كم (مسافة العميل)</span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    id="btn-decrease-distance"
                    onClick={() => adjustDeliveryDistance(-0.5)}
                    className="w-9 h-9 rounded-lg bg-slate-800 hover:bg-slate-700 active:scale-95 border border-slate-700 text-slate-200 font-bold text-base flex items-center justify-center cursor-pointer"
                    title="إنقاص نصف كم"
                  >
                    -
                  </button>

                  <div className="relative">
                    <input
                      id="input-max-distance"
                      type="number"
                      step="0.1"
                      min="0.5"
                      max="25"
                      value={deliveryInput}
                      onChange={handleDeliveryInputChange}
                      className="w-20 h-9 text-center bg-slate-900 border border-slate-700 rounded-lg text-white font-mono font-bold text-sm focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                    />
                    <span className="absolute left-2 top-2.5 text-[9px] text-slate-500 font-mono pointer-events-none">
                      كم
                    </span>
                  </div>

                  <button
                    id="btn-increase-distance"
                    onClick={() => adjustDeliveryDistance(0.5)}
                    className="w-9 h-9 rounded-lg bg-slate-800 hover:bg-slate-700 active:scale-95 border border-slate-700 text-slate-200 font-bold text-base flex items-center justify-center cursor-pointer"
                    title="زيادة نصف كم"
                  >
                    +
                  </button>
                </div>
              </div>

              {/* Slider for delivery */}
              <div className="mt-3">
                <input
                  id="slider-max-distance"
                  type="range"
                  min="0.5"
                  max="10"
                  step="0.1"
                  value={settings.maxDistanceKm}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    setDeliveryInput(val.toString());
                    onUpdateMaxDistance(val);
                  }}
                  className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                />
              </div>

              {/* Delivery presets */}
              <div className="flex flex-wrap gap-1.5 mt-2.5">
                {DELIVERY_PRESETS.map((km) => {
                  const isSelected = settings.maxDistanceKm === km;
                  return (
                    <button
                      key={km}
                      id={`btn-preset-${km}`}
                      onClick={() => {
                        setDeliveryInput(km.toString());
                        onUpdateMaxDistance(km);
                      }}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-mono font-semibold transition-all border ${
                        isSelected
                          ? 'bg-emerald-500 text-slate-950 border-emerald-400 font-bold shadow-sm shadow-emerald-500/30'
                          : 'bg-slate-800/70 hover:bg-slate-700 text-slate-300 border-slate-700/60'
                      }`}
                    >
                      {km} كم
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Smart Rule & Automation Summary */}
        <div className="mt-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-3 bg-slate-900/60 rounded-xl border border-slate-800/60 text-xs">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-emerald-400 shrink-0" />
            <span className="text-slate-300 leading-relaxed">
              شرط القبول التلقائي الصارم: <strong className="text-cyan-300">مسافة المطعم ≤ {settings.maxPickupDistanceKm || 2.0} كم</strong> <strong className="text-white">وَ</strong> <strong className="text-emerald-300">مسافة العميل ≤ {settings.maxDistanceKm} كم</strong> (كلاهما معاً).
            </span>
          </div>

          {/* Auto Accept Switch */}
          <label className="flex items-center gap-2 cursor-pointer select-none shrink-0">
            <span className="text-slate-400 text-xs">قبول تلقائي:</span>
            <input
              id="checkbox-auto-accept"
              type="checkbox"
              checked={settings.autoAccept}
              onChange={(e) => onUpdateSettings({ autoAccept: e.target.checked })}
              className="sr-only peer"
            />
            <div className="w-9 h-5 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-500 relative"></div>
          </label>
        </div>
      </div>
    </div>
  );
};

