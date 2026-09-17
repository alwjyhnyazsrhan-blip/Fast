import React, { useState } from 'react';
import { 
  Power, 
  Play, 
  Square, 
  MapPin, 
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
  onUpdateSettings: (newSettings: Partial<LocateGoSettings>) => void;
  onGetLiveLocation?: () => void;
  isLocating?: boolean;
}

const DISTANCE_PRESETS = [1.0, 1.5, 2.0, 2.5, 3.0, 4.0, 5.0];

export const MainControlCard: React.FC<MainControlCardProps> = ({
  settings,
  status,
  onTogglePower,
  onUpdateMaxDistance,
  onUpdateSettings,
  onGetLiveLocation,
  isLocating,
}) => {
  const [inputValue, setInputValue] = useState(settings.maxDistanceKm.toString());

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setInputValue(val);
    const num = parseFloat(val);
    if (!isNaN(num) && num > 0 && num <= 50) {
      onUpdateMaxDistance(Math.round(num * 10) / 10);
    }
  };

  const handlePresetClick = (km: number) => {
    setInputValue(km.toString());
    onUpdateMaxDistance(km);
  };

  const adjustDistance = (delta: number) => {
    const nextVal = Math.max(0.5, Math.min(25, Math.round((settings.maxDistanceKm + delta) * 10) / 10));
    setInputValue(nextVal.toString());
    onUpdateMaxDistance(nextVal);
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
            يقوم السيرفر بالتحقق من مسافات استلام وتسليم الطلبات فوراً، وتمرير الأوامر للهاتف بالقبول أو الرفض التلقائي.
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

      {/* 2. MAX DISTANCE FILTER CONTROL (Element #2) */}
      <div className="lg:col-span-7 bg-gradient-to-b from-[#121929] to-[#0c1220] rounded-2xl p-6 border border-slate-800 shadow-xl flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
                <MapPin className="w-4 h-4" />
              </span>
              <h2 className="text-base font-bold text-white">تحديد المسافة القصوى (فلتر الكيلومتر)</h2>
            </div>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-950/80 text-emerald-400 border border-emerald-500/30 font-mono">
              حد الأمان: {settings.maxDistanceKm} كم
            </span>
          </div>

          {/* Primary Distance Display & Controls */}
          <div className="bg-[#090d16] p-4 sm:p-5 rounded-xl border border-slate-800/90 my-2">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="text-center sm:text-right">
                <span className="text-xs text-slate-400 font-medium block">أقصى مسافة مسموح بها للطلب:</span>
                <div className="flex items-baseline gap-2 mt-1">
                  <span className="text-4xl sm:text-5xl font-black text-white tracking-tight font-mono">
                    {settings.maxDistanceKm}
                  </span>
                  <span className="text-lg font-bold text-emerald-400">كيلومتر (كم)</span>
                </div>
              </div>

              {/* Stepper buttons and input */}
              <div className="flex items-center gap-2">
                <button
                  id="btn-decrease-distance"
                  onClick={() => adjustDistance(-0.5)}
                  className="w-11 h-11 rounded-xl bg-slate-800 hover:bg-slate-700 active:scale-95 border border-slate-700 text-slate-200 font-bold text-lg flex items-center justify-center transition-all cursor-pointer"
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
                    value={inputValue}
                    onChange={handleInputChange}
                    className="w-24 h-11 text-center bg-slate-900 border border-slate-700 rounded-xl text-white font-mono font-bold text-lg focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                  />
                  <span className="absolute left-2.5 top-3 text-[10px] text-slate-500 font-mono pointer-events-none">
                    كم
                  </span>
                </div>

                <button
                  id="btn-increase-distance"
                  onClick={() => adjustDistance(0.5)}
                  className="w-11 h-11 rounded-xl bg-slate-800 hover:bg-slate-700 active:scale-95 border border-slate-700 text-slate-200 font-bold text-lg flex items-center justify-center transition-all cursor-pointer"
                  title="زيادة نصف كم"
                >
                  +
                </button>
              </div>
            </div>

            {/* Visual Slider */}
            <div className="mt-5">
              <div className="flex justify-between text-[11px] text-slate-400 font-mono mb-1.5">
                <span>0.5 كم (قريب جداً)</span>
                <span className="text-emerald-400 font-bold">{settings.maxDistanceKm} كم</span>
                <span>10 كم (بعيد)</span>
              </div>
              <input
                id="slider-max-distance"
                type="range"
                min="0.5"
                max="10"
                step="0.1"
                value={settings.maxDistanceKm}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  setInputValue(val.toString());
                  onUpdateMaxDistance(val);
                }}
                className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-emerald-500"
              />
            </div>

            {/* Quick Preset Buttons */}
            <div className="mt-4 pt-3 border-t border-slate-800/80">
              <span className="text-[11px] text-slate-400 block mb-2 font-medium">خيارات مسافة سريعة للمناديب:</span>
              <div className="flex flex-wrap gap-2">
                {DISTANCE_PRESETS.map((km) => {
                  const isSelected = settings.maxDistanceKm === km;
                  return (
                    <button
                      key={km}
                      id={`btn-preset-${km}`}
                      onClick={() => handlePresetClick(km)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-mono font-semibold transition-all border ${
                        isSelected
                          ? 'bg-emerald-500 text-slate-950 border-emerald-400 shadow-md shadow-emerald-500/20 font-bold'
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
            <span className="text-slate-300">
              معيار القبول الفوري: <strong className="text-emerald-300">مسافة العميل / الوجهة</strong>{' '}
              <strong className="text-white font-mono">≤ {settings.maxDistanceKm} كم</strong> (مسافة المطعم مفتوحة واختيارية).
            </span>
          </div>

          {/* Auto Accept Switch */}
          <label className="flex items-center gap-2 cursor-pointer select-none">
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
