import React, { useState } from 'react';
import { 
  Smartphone, 
  ShieldCheck, 
  UserCheck, 
  RefreshCw, 
  PlusCircle, 
  Lock, 
  Layers, 
  ArrowLeftRight,
  Database,
  Check
} from 'lucide-react';
import { PRESET_REPRESENTATIVES, setActiveDeviceId, generateFreshDeviceId } from '../utils/device';

interface RepresentativeDeviceManagerProps {
  currentDeviceId: string;
  onDeviceChanged: (newDeviceId: string) => void;
  totalScanned: number;
  acceptedCount: number;
  rejectedCount: number;
  acceptanceRate?: number;
  totalEarningsSar?: number;
  isSyncing?: boolean;
}

export const RepresentativeDeviceManager: React.FC<RepresentativeDeviceManagerProps> = ({
  currentDeviceId,
  onDeviceChanged,
  totalScanned,
  acceptedCount,
  rejectedCount,
  acceptanceRate = 0,
  totalEarningsSar = 0,
  isSyncing = false,
}) => {
  const [customInput, setCustomInput] = useState('');
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [copied, setCopied] = useState(false);

  const activePreset = PRESET_REPRESENTATIVES.find((p) => p.id === currentDeviceId);

  const handleSelectPreset = (id: string) => {
    const updated = setActiveDeviceId(id);
    onDeviceChanged(updated);
  };

  const handleGenerateFresh = () => {
    const freshId = generateFreshDeviceId();
    onDeviceChanged(freshId);
  };

  const handleApplyCustom = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customInput.trim()) return;
    const updated = setActiveDeviceId(customInput);
    onDeviceChanged(updated);
    setCustomInput('');
    setShowCustomInput(false);
  };

  const handleCopyId = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(currentDeviceId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="rounded-2xl bg-gradient-to-br from-[#0c1424] via-[#090d16] to-[#0d1627] border border-cyan-500/30 p-4 sm:p-5 shadow-xl relative overflow-hidden">
      {/* Background ambient pattern */}
      <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-cyan-500 via-emerald-500 to-indigo-500" />

      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        {/* Left: Device & Driver Profile Info */}
        <div className="flex items-start sm:items-center gap-3.5">
          <div className="relative w-12 h-12 rounded-xl bg-cyan-950/50 border border-cyan-500/40 flex items-center justify-center text-cyan-400 shrink-0 shadow-lg shadow-cyan-950/50">
            <Smartphone className="w-6 h-6" />
            <span className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-emerald-500 border-2 border-[#0c1424] flex items-center justify-center">
              <ShieldCheck className="w-2.5 h-2.5 text-black" />
            </span>
          </div>

          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-cyan-950/80 text-cyan-300 border border-cyan-500/40 flex items-center gap-1">
                <Lock className="w-3 h-3 text-cyan-400" />
                عزل بيانات المناديب (Device Isolation)
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-950/70 text-emerald-300 border border-emerald-500/40 font-semibold flex items-center gap-1">
                <Database className="w-3 h-3" />
                مفصول في قاعدة البيانات 100%
              </span>
            </div>

            <div className="flex items-center gap-2 mt-1">
              <h3 className="text-base font-extrabold text-white flex items-center gap-2 font-mono">
                <span>معرف الجهاز:</span>
                <span className="text-cyan-300 bg-cyan-950/70 px-2 py-0.5 rounded-md border border-cyan-500/30 tracking-wider">
                  {currentDeviceId}
                </span>
              </h3>

              <button
                type="button"
                onClick={handleCopyId}
                title="نسخ معرف الجهاز"
                className="p-1 rounded-md hover:bg-slate-800 text-slate-400 hover:text-cyan-300 transition-all text-xs"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : 'نسخ'}
              </button>
            </div>

            <p className="text-xs text-slate-400 mt-0.5">
              {activePreset
                ? `${activePreset.name} • ${activePreset.city} • ${activePreset.vehicle}`
                : 'جلسة مندوب مخصصة معزولة عن أي مندوب آخر بالكامل'}
            </p>
          </div>
        </div>

        {/* Middle: Representative Isolated Stats */}
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 py-2 px-3 rounded-xl bg-slate-900/80 border border-slate-800 text-center">
          <div>
            <span className="text-[10px] text-slate-400 block">طلبات هذا الجهاز</span>
            <span className="text-sm font-black text-white font-mono">{totalScanned}</span>
          </div>
          <div>
            <span className="text-[10px] text-emerald-400 block">المقبولة</span>
            <span className="text-sm font-black text-emerald-400 font-mono">{acceptedCount}</span>
          </div>
          <div>
            <span className="text-[10px] text-rose-400 block">المستبعدة</span>
            <span className="text-sm font-black text-rose-400 font-mono">{rejectedCount}</span>
          </div>
          <div className="hidden sm:block">
            <span className="text-[10px] text-amber-400 block">الأرباح المحققة</span>
            <span className="text-sm font-black text-amber-300 font-mono">{totalEarningsSar} ر.س</span>
          </div>
        </div>

        {/* Right: Quick Representative Switcher & Tester */}
        <div className="flex flex-wrap items-center gap-2">
          {PRESET_REPRESENTATIVES.map((preset) => {
            const isCurrent = preset.id === currentDeviceId;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => handleSelectPreset(preset.id)}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all border cursor-pointer ${
                  isCurrent
                    ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/50 shadow-sm'
                    : 'bg-slate-900 text-slate-400 hover:text-white border-slate-800 hover:border-slate-700'
                }`}
                title={`التبديل إلى ${preset.name} لاختبار عزل البيانات`}
              >
                {preset.name.split(' ')[1] || preset.id}
              </button>
            );
          })}

          {/* Generate Fresh Device */}
          <button
            type="button"
            onClick={handleGenerateFresh}
            title="إنشاء معرف جهاز جديد تماماً (مندوب إضافي)"
            className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 hover:border-cyan-500/40 transition-all flex items-center gap-1 cursor-pointer"
          >
            <PlusCircle className="w-3.5 h-3.5 text-emerald-400" />
            <span>مندوب جديد</span>
          </button>

          {/* Toggle Custom Device ID Input */}
          <button
            type="button"
            onClick={() => setShowCustomInput(!showCustomInput)}
            title="إدخال معرف جهاز يدوي"
            className="p-1.5 rounded-lg bg-slate-800 text-slate-300 hover:text-cyan-300 border border-slate-700 transition-all cursor-pointer"
          >
            <ArrowLeftRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Custom Device ID Input Tray */}
      {showCustomInput && (
        <form
          onSubmit={handleApplyCustom}
          className="mt-3 pt-3 border-t border-slate-800/80 flex flex-wrap items-center gap-2 animate-fadeIn"
        >
          <span className="text-xs text-slate-300 flex items-center gap-1">
            <UserCheck className="w-3.5 h-3.5 text-cyan-400" />
            <span>ربط بمعرف جهاز أندرويد محدد:</span>
          </span>
          <input
            type="text"
            placeholder="مثال: REP-7701-A أو المعرف الخاص بك"
            value={customInput}
            onChange={(e) => setCustomInput(e.target.value)}
            className="bg-slate-900 border border-slate-700 text-white text-xs rounded-lg px-3 py-1.5 flex-1 min-w-[200px] focus:outline-none focus:border-cyan-500 font-mono uppercase"
          />
          <button
            type="submit"
            className="px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold transition-all cursor-pointer"
          >
            تطبيق
          </button>
          <button
            type="button"
            onClick={() => setShowCustomInput(false)}
            className="px-2.5 py-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-white text-xs transition-all cursor-pointer"
          >
            إلغاء
          </button>
        </form>
      )}

      {/* Verification note */}
      <div className="mt-3 pt-2 border-t border-slate-800/60 flex items-center justify-between text-[11px] text-slate-400">
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span>
            كل العمليات وسجلات الطلبات والمراقبة والإحصائيات مرتبطة حصرياً بـ{' '}
            <strong className="text-cyan-300 font-mono font-bold">{currentDeviceId}</strong>، ولن تظهر لأي مندوب آخر في السيرفر.
          </span>
        </div>
        {isSyncing && (
          <span className="flex items-center gap-1 text-cyan-400 text-[10px]">
            <RefreshCw className="w-3 h-3 animate-spin" />
            جاري مزامنة بيانات المندوب...
          </span>
        )}
      </div>
    </div>
  );
};
