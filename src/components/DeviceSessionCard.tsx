import React, { useState } from 'react';
import { 
  ShieldCheck, 
  Smartphone, 
  Copy, 
  Check, 
  RefreshCw, 
  HardDrive, 
  Lock, 
  KeyRound,
  Edit3
} from 'lucide-react';

interface DeviceSessionCardProps {
  deviceId: string;
  onRegenerateDeviceId: () => void;
  onChangeDeviceId: (newId: string) => void;
  totalScanned: number;
  acceptedCount: number;
  rejectedCount: number;
}

export const DeviceSessionCard: React.FC<DeviceSessionCardProps> = ({
  deviceId,
  onRegenerateDeviceId,
  onChangeDeviceId,
  totalScanned,
  acceptedCount,
  rejectedCount,
}) => {
  const [copied, setCopied] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [customIdInput, setCustomIdInput] = useState(deviceId);

  const handleCopy = () => {
    navigator.clipboard.writeText(deviceId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSaveCustomId = (e: React.FormEvent) => {
    e.preventDefault();
    if (customIdInput.trim()) {
      onChangeDeviceId(customIdInput.trim());
      setIsEditing(false);
    }
  };

  return (
    <div className="bg-slate-900/90 border border-slate-800/90 rounded-2xl p-4 sm:p-5 shadow-xl shadow-black/40 relative overflow-hidden backdrop-blur-sm">
      {/* Glow background accent */}
      <div className="absolute top-0 right-0 w-64 h-32 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-64 h-32 bg-cyan-500/5 rounded-full blur-3xl pointer-events-none" />

      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        {/* Left Side: Device ID & Privacy badge */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
              <Smartphone className="w-4 h-4" />
            </span>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-semibold text-slate-400">معرف جهاز المندوب (Device ID)</span>
                <span className="flex items-center gap-1 text-[11px] font-medium text-emerald-400 bg-emerald-950/60 border border-emerald-500/30 px-2 py-0.5 rounded-full">
                  <ShieldCheck className="w-3 h-3 text-emerald-400" />
                  بياناتك معزولة ومحمية 100%
                </span>
                <span className="flex items-center gap-1 text-[11px] font-medium text-cyan-400 bg-cyan-950/60 border border-cyan-500/30 px-2 py-0.5 rounded-full">
                  <HardDrive className="w-3 h-3 text-cyan-400" />
                  حفظ محلي (localStorage)
                </span>
              </div>
            </div>
          </div>

          {/* Device ID Display & Edit */}
          <div className="flex items-center gap-2 flex-wrap pt-1">
            {!isEditing ? (
              <div className="flex items-center gap-2 bg-[#090d16] border border-slate-700/80 rounded-xl px-3 py-1.5 font-mono text-sm sm:text-base font-bold text-emerald-300 shadow-inner">
                <Lock className="w-3.5 h-3.5 text-emerald-400" />
                <span>{deviceId}</span>
                <button
                  onClick={handleCopy}
                  title="نسخ معرف الجهاز"
                  className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 transition-all cursor-pointer"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
            ) : (
              <form onSubmit={handleSaveCustomId} className="flex items-center gap-2">
                <input
                  type="text"
                  value={customIdInput}
                  onChange={(e) => setCustomIdInput(e.target.value)}
                  className="bg-[#090d16] border border-emerald-500/60 rounded-xl px-3 py-1.5 font-mono text-sm font-bold text-white focus:outline-none focus:ring-1 focus:ring-emerald-400"
                  placeholder="أدخل معرف الجهاز..."
                />
                <button
                  type="submit"
                  className="px-3 py-1.5 rounded-xl bg-emerald-500 text-black text-xs font-bold hover:bg-emerald-400 cursor-pointer"
                >
                  حفظ
                </button>
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  className="px-2.5 py-1.5 rounded-xl bg-slate-800 text-slate-300 text-xs font-semibold hover:bg-slate-700 cursor-pointer"
                >
                  إلغاء
                </button>
              </form>
            )}

            {!isEditing && (
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => {
                    setCustomIdInput(deviceId);
                    setIsEditing(true);
                  }}
                  title="تعديل أو استرجاع معرف سابق"
                  className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 border border-slate-700 transition-all cursor-pointer"
                >
                  <Edit3 className="w-3 h-3" />
                  <span className="hidden sm:inline">تعديل</span>
                </button>

                <button
                  onClick={onRegenerateDeviceId}
                  title="توليد معرف جهاز جديد وبدء جلسة نظيفة معزولة"
                  className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg bg-slate-800 text-slate-300 hover:text-cyan-300 hover:bg-slate-700 border border-slate-700 transition-all cursor-pointer"
                >
                  <RefreshCw className="w-3 h-3" />
                  <span className="hidden sm:inline">جلسة جديدة</span>
                </button>
              </div>
            )}
          </div>
          
          <p className="text-xs text-slate-400 leading-relaxed max-w-2xl">
            سجلات الطلبات والمراقبة والإحصائيات مقفلة ومربوطة بمعرف هذا الجهاز حصرياً. لن يرى أي سائق آخر نشاطاتك، وإعدادات المسافات (المطعم والعميل) محفوظة في هاتفك مباشرة.
          </p>
        </div>

        {/* Right Side: Quick Stats for THIS Device */}
        <div className="flex items-center gap-2 self-start lg:self-center border-t lg:border-t-0 lg:border-r border-slate-800 pt-3 lg:pt-0 lg:pr-4">
          <div className="text-center px-3 py-1.5 rounded-xl bg-[#090d16]/70 border border-slate-800">
            <span className="block text-[10px] text-slate-400 font-medium">طلبات جهازك</span>
            <span className="text-base font-bold font-mono text-slate-100">{totalScanned}</span>
          </div>

          <div className="text-center px-3 py-1.5 rounded-xl bg-emerald-950/20 border border-emerald-500/20">
            <span className="block text-[10px] text-emerald-400 font-medium">المقبولة</span>
            <span className="text-base font-bold font-mono text-emerald-300">{acceptedCount}</span>
          </div>

          <div className="text-center px-3 py-1.5 rounded-xl bg-rose-950/20 border border-rose-500/20">
            <span className="block text-[10px] text-rose-400 font-medium">المرفوضة</span>
            <span className="text-base font-bold font-mono text-rose-300">{rejectedCount}</span>
          </div>
        </div>
      </div>
    </div>
  );
};
