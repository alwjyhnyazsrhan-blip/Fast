import React, { useState } from 'react';
import { 
  Power, 
  MapPin, 
  Radio, 
  ChevronUp, 
  ChevronDown, 
  Sliders, 
  Move, 
  Sparkles, 
  Check, 
  X, 
  Bell, 
  Navigation, 
  Clock, 
  ShieldCheck,
  RotateCcw
} from 'lucide-react';
import { LocateGoSettings, LocateGoStatus, OrderItem } from '../types';

interface FloatingWidgetOverlayProps {
  settings: LocateGoSettings;
  status: LocateGoStatus;
  latestOrder: OrderItem | null;
  onTogglePower: () => void;
  onUpdateMaxDistance: (km: number) => void;
}

export const FloatingWidgetOverlay: React.FC<FloatingWidgetOverlayProps> = ({
  settings,
  status,
  latestOrder,
  onTogglePower,
  onUpdateMaxDistance,
}) => {
  const [isExpanded, setIsExpanded] = useState<boolean>(true);
  const [widgetPosition, setWidgetPosition] = useState<{ x: number; y: number }>({ x: 20, y: 70 });
  const [isDragging, setIsDragging] = useState(false);
  const [phoneApp, setPhoneApp] = useState<'jahez' | 'hungerstation' | 'marsool'>('jahez');

  return (
    <div className="bg-gradient-to-b from-[#121929] to-[#0c1220] rounded-2xl p-6 border border-slate-800 shadow-xl">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
              <Move className="w-4 h-4" />
            </span>
            <h2 className="text-base font-bold text-white">معاينة النافذة العائمة فوق شاشة الجوال (Floating Overlay HUD)</h2>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            هكذا تظهر أداة <strong className="text-emerald-400">Locate Go</strong> كنافذة عائمة فوق تطبيقات التوصيل (مثل جاهز وهنقرستيشن) لتنبيه المندوب دون مغادرة التطبيق.
          </p>
        </div>

        {/* Quick Simulator actions */}
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-slate-900 rounded-xl p-1 border border-slate-800 text-xs">
            <button
              onClick={() => setPhoneApp('jahez')}
              className={`px-2.5 py-1 rounded-lg transition-all ${
                phoneApp === 'jahez' ? 'bg-amber-500/20 text-amber-300 font-bold' : 'text-slate-400'
              }`}
            >
              جاهز
            </button>
            <button
              onClick={() => setPhoneApp('hungerstation')}
              className={`px-2.5 py-1 rounded-lg transition-all ${
                phoneApp === 'hungerstation' ? 'bg-yellow-500/20 text-yellow-300 font-bold' : 'text-slate-400'
              }`}
            >
              هنقرستيشن
            </button>
            <button
              onClick={() => setPhoneApp('marsool')}
              className={`px-2.5 py-1 rounded-lg transition-all ${
                phoneApp === 'marsool' ? 'bg-emerald-500/20 text-emerald-300 font-bold' : 'text-slate-400'
              }`}
            >
              مرسول
            </button>
          </div>

          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border bg-emerald-950/40 border-emerald-500/30 text-emerald-300">
            <Radio className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
            <span>بانتظار طلب حقيقي</span>
          </div>
        </div>
      </div>

      {/* Simulated Mobile Device Frame */}
      <div className="flex justify-center">
        <div className="relative w-full max-w-[390px] h-[680px] bg-slate-950 rounded-[42px] p-3.5 shadow-2xl border-4 border-slate-700 shadow-cyan-950/30 overflow-hidden select-none">
          
          {/* Phone Speaker Notch & Camera */}
          <div className="absolute top-4 left-1/2 -translate-x-1/2 w-28 h-5 bg-black rounded-full z-40 flex items-center justify-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full bg-slate-900 border border-slate-800" />
            <div className="w-10 h-1 rounded-full bg-slate-800" />
          </div>

          {/* Status Bar */}
          <div className="relative z-30 pt-1 px-4 flex items-center justify-between text-[11px] text-slate-400 font-mono">
            <span>09:41</span>
            <div className="flex items-center gap-1.5">
              <span>5G</span>
              <div className="w-5 h-2.5 border border-slate-400 rounded-sm p-0.5 flex items-center">
                <div className="w-full h-full bg-emerald-400 rounded-[1px]" />
              </div>
            </div>
          </div>

          {/* Screen Body (Simulated Delivery App Background) */}
          <div className="relative w-full h-[620px] rounded-[32px] overflow-hidden bg-[#0e131f] flex flex-col justify-between mt-1 text-right">
            
            {/* Top Bar of the Mock Delivery App */}
            <div className={`p-4 border-b ${
              phoneApp === 'jahez' 
                ? 'bg-[#18130a] border-amber-900/30 text-amber-200' 
                : phoneApp === 'hungerstation'
                ? 'bg-[#171408] border-yellow-900/30 text-yellow-200'
                : 'bg-[#091712] border-emerald-900/30 text-emerald-200'
            }`}>
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold px-2 py-0.5 rounded bg-white/10">
                  {phoneApp === 'jahez' ? 'جاهز كابتن' : phoneApp === 'hungerstation' ? 'هنقرستيشن رايدر' : 'مرسول كابتن'}
                </span>
                <div className="flex items-center gap-1.5 text-xs text-emerald-400">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span>أنت متصل لاستقبال الطلبات</span>
                </div>
              </div>
            </div>

            {/* Map Placeholder Graphic */}
            <div className="relative flex-1 bg-[#111827] overflow-hidden flex items-center justify-center">
              {/* Map grid lines */}
              <div className="absolute inset-0 opacity-15 bg-[radial-gradient(#38bdf8_1px,transparent_1px)] [background-size:16px_16px]" />
              <div className="absolute inset-0 bg-gradient-to-t from-[#0e131f] via-transparent to-transparent" />

              <div className="text-center p-6 z-0">
                <Navigation className="w-10 h-10 text-cyan-400/40 mx-auto mb-2 animate-bounce" />
                <p className="text-xs font-semibold text-slate-400">جاري مسح الخريطة والطلبات في نطاقك...</p>
                <p className="text-[10px] text-slate-600 mt-1 font-mono">الرياض - طريق الملك عبد العزيز</p>
              </div>

              {/* Simulated Incoming Order Card Popup on Phone Screen */}
              {latestOrder && (
                <div className="absolute bottom-4 left-3 right-3 z-10 bg-[#141c2e] border-2 border-slate-700/80 rounded-2xl p-3.5 shadow-2xl animate-fadeIn">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-800 text-xs">
                    <span className="font-bold text-white flex items-center gap-1">
                      <Bell className="w-3.5 h-3.5 text-amber-400 animate-bounce" />
                      عرض طلب جديد على شاشتك!
                    </span>
                    <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 font-mono text-[10px] font-bold">
                      {latestOrder.payoutSar} ر.س
                    </span>
                  </div>

                  <div className="py-2.5">
                    <h4 className="text-xs font-bold text-white">{latestOrder.storeName}</h4>
                    <p className="text-[11px] text-slate-400">الوجهة: {latestOrder.customerDistrict}</p>
                    
                    <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-800/80">
                      <span className="text-[11px] text-slate-400">المسافة:</span>
                      <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded ${
                        latestOrder.distanceKm <= settings.maxDistanceKm 
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' 
                          : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                      }`}>
                        {latestOrder.distanceKm} كم
                      </span>
                    </div>
                  </div>

                  {/* Accept / Reject Buttons on Phone Screen */}
                  <div className="grid grid-cols-2 gap-2 mt-1">
                    <button className="py-1.5 rounded-lg bg-emerald-600 text-white text-[11px] font-bold shadow flex items-center justify-center gap-1">
                      <Check className="w-3 h-3" />
                      قبول الطلب
                    </button>
                    <button className="py-1.5 rounded-lg bg-slate-800 text-slate-300 text-[11px] font-medium border border-slate-700 flex items-center justify-center gap-1">
                      <X className="w-3 h-3" />
                      تجاهل
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Bottom App Nav */}
            <div className="p-3 bg-[#0c101c] border-t border-slate-800/80 flex items-center justify-around text-slate-500 text-[10px]">
              <span className="text-emerald-400 font-bold">الرئيسية</span>
              <span>الطلبات</span>
              <span>الأرباح</span>
              <span>الملف</span>
            </div>

            {/* ========================================================================= */}
            {/* FLOATING OVERLAY WIDGET (LOCATE GO OVERLAY) FLOATING OVER THE PHONE SCREEN */}
            {/* ========================================================================= */}
            <div
              className={`absolute z-30 transition-all duration-300 shadow-2xl ${
                isExpanded
                  ? 'top-14 left-3 right-3'
                  : 'top-16 right-3'
              }`}
            >
              {isExpanded ? (
                /* Expanded Floating Widget */
                <div className="bg-[#0b101c]/95 backdrop-blur-md rounded-2xl border-2 border-emerald-500/60 p-3.5 shadow-2xl shadow-emerald-950/70 text-right">
                  
                  {/* Floating Header */}
                  <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                    <div className="flex items-center gap-1.5">
                      <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                      <span className="text-xs font-black text-white">Locate Go</span>
                      <span className="text-[9px] px-1.5 py-0.2 rounded bg-emerald-950 text-emerald-300 border border-emerald-600/40 font-mono">
                        نافذة عائمة
                      </span>
                    </div>

                    <div className="flex items-center gap-1">
                      {/* Collapse Button */}
                      <button
                        onClick={() => setIsExpanded(false)}
                        className="p-1 rounded-md bg-slate-800 text-slate-400 hover:text-white"
                        title="تصغير إلى أيقونة عائمة"
                      >
                        <ChevronUp className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Body with Live status & distance filter */}
                  <div className="mt-2.5 space-y-2.5">
                    {/* Live Screen Monitoring Banner */}
                    <div className="flex items-center justify-between bg-slate-900/80 p-2 rounded-xl border border-slate-800">
                      <div className="flex items-center gap-1.5 text-[11px]">
                        <Radio className={`w-3 h-3 ${status.isRunning ? 'text-emerald-400 animate-pulse' : 'text-slate-500'}`} />
                        <span className={status.isRunning ? 'text-emerald-300 font-bold' : 'text-slate-400'}>
                          {status.isRunning ? 'يراقب الشاشة بنشاط' : 'المراقبة متوقفة'}
                        </span>
                      </div>
                      <span className="text-[10px] text-slate-400 font-mono">
                        {status.isRunning ? `${status.fps} FPS` : 'OFF'}
                      </span>
                    </div>

                    {/* Max Distance Threshold Selector */}
                    <div className="bg-slate-900/80 p-2 rounded-xl border border-slate-800">
                      <div className="flex items-center justify-between text-[11px] mb-1">
                        <span className="text-slate-400">أقصى مسافة مقبولة:</span>
                        <span className="text-xs font-mono font-black text-emerald-400">
                          {settings.maxDistanceKm} كم
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => onUpdateMaxDistance(Math.max(0.5, Math.round((settings.maxDistanceKm - 0.5) * 10) / 10))}
                          className="w-6 h-6 rounded bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs flex items-center justify-center"
                        >
                          -
                        </button>
                        <input
                          type="range"
                          min="0.5"
                          max="8.0"
                          step="0.5"
                          value={settings.maxDistanceKm}
                          onChange={(e) => onUpdateMaxDistance(parseFloat(e.target.value))}
                          className="flex-1 h-1.5 bg-slate-800 rounded appearance-none cursor-pointer accent-emerald-500"
                        />
                        <button
                          onClick={() => onUpdateMaxDistance(Math.min(15, Math.round((settings.maxDistanceKm + 0.5) * 10) / 10))}
                          className="w-6 h-6 rounded bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs flex items-center justify-center"
                        >
                          +
                        </button>
                      </div>
                    </div>

                    {/* Start / Stop Master Button inside the Overlay */}
                    <button
                      onClick={onTogglePower}
                      className={`w-full py-2 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-1.5 border shadow-lg ${
                        status.isRunning
                          ? 'bg-rose-600 hover:bg-rose-500 text-white border-rose-400 shadow-rose-950/60'
                          : 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 border-emerald-300 shadow-emerald-950/60'
                      }`}
                    >
                      <Power className="w-3.5 h-3.5" />
                      <span>{status.isRunning ? 'إيقاف المراقبة' : 'بدء تشغيل الرصد'}</span>
                    </button>

                    {/* Instant Detection Alert feedback */}
                    {latestOrder && (
                      <div className={`p-2 rounded-lg border text-[10px] flex items-center justify-between ${
                        latestOrder.distanceKm <= settings.maxDistanceKm
                          ? 'bg-emerald-950/60 border-emerald-500/50 text-emerald-300'
                          : 'bg-rose-950/60 border-rose-500/50 text-rose-300'
                      }`}>
                        <span>آخر رصد: {latestOrder.distanceKm} كم</span>
                        <span className="font-bold">
                          {latestOrder.distanceKm <= settings.maxDistanceKm ? 'مقبول تلقائياً ✅' : 'مرفوض - بعيد ❌'}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                /* Collapsed Floating Circular Bubble */
                <button
                  onClick={() => setIsExpanded(true)}
                  className={`w-14 h-14 rounded-full flex flex-col items-center justify-center border-2 shadow-2xl transition-transform active:scale-95 cursor-pointer relative ${
                    status.isRunning
                      ? 'bg-emerald-950/90 border-emerald-400 text-emerald-300 shadow-emerald-950'
                      : 'bg-slate-900 border-slate-700 text-slate-400'
                  }`}
                  title="اضغط لفتح نافذة Locate Go العائمة"
                >
                  {status.isRunning && (
                    <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-emerald-400 rounded-full animate-ping" />
                  )}
                  <Navigation className="w-5 h-5 text-emerald-400" />
                  <span className="text-[9px] font-mono font-bold leading-none mt-0.5">
                    {settings.maxDistanceKm}k
                  </span>
                </button>
              )}
            </div>

          </div>

        </div>
      </div>
    </div>
  );
};
