import React from 'react';
import { 
  Locate, 
  ShieldCheck, 
  ShieldAlert, 
  Volume2, 
  VolumeX, 
  Smartphone, 
  LayoutDashboard, 
  Code2, 
  Server,
  Sparkles,
  Wifi,
  WifiOff
} from 'lucide-react';
import { LocateGoStatus } from '../types';

interface HeaderProps {
  status: LocateGoStatus;
  soundEnabled: boolean;
  onToggleSound: () => void;
  activeTab: 'dashboard' | 'server' | 'floating' | 'code';
  onChangeTab: (tab: 'dashboard' | 'server' | 'floating' | 'code') => void;
  onSimulateOffer: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  status,
  soundEnabled,
  onToggleSound,
  activeTab,
  onChangeTab,
  onSimulateOffer,
}) => {
  return (
    <header className="sticky top-0 z-40 bg-[#0c1220]/90 backdrop-blur-md border-b border-slate-800/80 px-4 py-3 sm:px-6">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-3">
        
        {/* Brand & Live Connection Tag */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="relative flex items-center justify-center w-11 h-11 rounded-xl bg-gradient-to-br from-emerald-500/20 via-teal-500/10 to-cyan-500/20 border border-emerald-500/40 shadow-lg shadow-emerald-950/40">
              <Locate className={`w-6 h-6 ${status.isRunning ? 'text-emerald-400 animate-pulse' : 'text-slate-400'}`} />
              {status.isRunning && (
                <span className="absolute -top-1 -right-1 flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
                </span>
              )}
            </div>

            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-extrabold tracking-tight text-white flex items-center gap-1.5">
                  <span>Locate</span>
                  <span className="text-emerald-400 bg-emerald-950/60 px-1.5 py-0.5 rounded-md border border-emerald-500/30 text-sm">GO</span>
                </h1>
                <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700 font-mono">
                  v2.4 Live
                </span>
                {status.serverConnected ? (
                  <span className="flex items-center gap-1 text-[11px] text-emerald-400 bg-emerald-950/50 px-2 py-0.5 rounded-full border border-emerald-500/30">
                    <Wifi className="w-3 h-3 text-emerald-400" />
                    السيرفر متصل
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-[11px] text-amber-400 bg-amber-950/50 px-2 py-0.5 rounded-full border border-amber-500/30">
                    <WifiOff className="w-3 h-3 text-amber-400" />
                    محلي
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400">نظام معالجة وتصفية طلبات التوصيل والتحقق الجغرافي</p>
            </div>
          </div>

          {/* Quick status pill on mobile */}
          <div className="md:hidden flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border bg-slate-900/90">
            {status.isRunning ? (
              <span className="flex items-center gap-1 text-emerald-400">
                <span className="h-2 w-2 rounded-full bg-emerald-400 animate-ping" />
                يراقب
              </span>
            ) : (
              <span className="flex items-center gap-1 text-slate-400">
                <span className="h-2 w-2 rounded-full bg-slate-500" />
                متوقف
              </span>
            )}
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-1.5 p-1 bg-slate-900/80 rounded-xl border border-slate-800 self-center overflow-x-auto max-w-full">
          <button
            id="tab-dashboard-btn"
            onClick={() => onChangeTab('dashboard')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
              activeTab === 'dashboard'
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <LayoutDashboard className="w-3.5 h-3.5" />
            <span>لوحة التحكم المباشرة</span>
          </button>

          <button
            id="tab-server-btn"
            onClick={() => onChangeTab('server')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
              activeTab === 'server'
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <Server className="w-3.5 h-3.5 text-emerald-400" />
            <span>كود السيرفر والاستضافة المجانية</span>
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          </button>

          <button
            id="tab-floating-btn"
            onClick={() => onChangeTab('floating')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
              activeTab === 'floating'
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <Smartphone className="w-3.5 h-3.5" />
            <span>النافذة العائمة (شاشة الجوال)</span>
          </button>

          <button
            id="tab-code-btn"
            onClick={() => onChangeTab('code')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
              activeTab === 'code'
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <Code2 className="w-3.5 h-3.5" />
            <span>كود أندرويد</span>
          </button>
        </div>

        {/* Global Controls & Action trigger */}
        <div className="flex items-center justify-end gap-2">
          {/* Simulate Offer Button */}
          <button
            id="btn-simulate-offer"
            onClick={onSimulateOffer}
            disabled={!status.isRunning}
            title={status.isRunning ? 'فحص طلب حقيقي عبر السيرفر فوراً' : 'يرجى تشغيل الأداة أولاً'}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border ${
              status.isRunning
                ? 'bg-gradient-to-r from-cyan-600/30 to-blue-600/30 hover:from-cyan-600/40 hover:to-blue-600/40 text-cyan-200 border-cyan-500/40 shadow-sm cursor-pointer active:scale-95'
                : 'bg-slate-800/40 text-slate-500 border-slate-800 cursor-not-allowed'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
            <span>فحص طلب فوري</span>
          </button>

          {/* Sound Toggle */}
          <button
            id="btn-sound-toggle"
            onClick={onToggleSound}
            title={soundEnabled ? 'كتم التنبيهات الصوتية' : 'تفعيل التنبيهات الصوتية'}
            className={`p-2 rounded-lg border transition-all ${
              soundEnabled
                ? 'bg-slate-800 text-emerald-400 border-slate-700 hover:bg-slate-700'
                : 'bg-slate-900 text-slate-500 border-slate-800 hover:text-slate-400'
            }`}
          >
            {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </button>

          {/* Status Indicator Pill */}
          <div className="hidden lg:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-900/90 border border-slate-800 text-xs">
            {status.isRunning ? (
              <div className="flex items-center gap-1.5 text-emerald-400">
                <ShieldCheck className="w-4 h-4" />
                <span className="font-semibold">المراقبة نشطة</span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 text-slate-400">
                <ShieldAlert className="w-4 h-4 text-slate-500" />
                <span>المراقبة متوقفة</span>
              </div>
            )}
          </div>
        </div>

      </div>
    </header>
  );
};
