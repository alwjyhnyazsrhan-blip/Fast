import React, { useState, useEffect, useRef } from 'react';

interface VipLockScreenProps {
  onUnlock: (code: string) => void;
}

export function getDeviceId(): string {
  try {
    const hw = typeof navigator !== 'undefined' ? (navigator.hardwareConcurrency || '8') : '8';
    const uaLen = typeof navigator !== 'undefined' ? navigator.userAgent.length : 120;
    return (uaLen + btoa(String(hw))).slice(0, 10);
  } catch {
    return 'LOCATE_VIP1';
  }
}

export const VipLockScreen: React.FC<VipLockScreenProps> = ({ onUnlock }) => {
  const [code, setCode] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [isInitialChecking, setIsInitialChecking] = useState(true);
  const [shake, setShake] = useState(false);
  const particlesRef = useRef<HTMLDivElement>(null);

  const TABLE = 'activation_codes';

  // Create floating particles effect
  useEffect(() => {
    const container = particlesRef.current;
    if (!container) return;
    container.innerHTML = '';
    const colors = ['#f5c842', '#00e5a0', '#ffffff', '#8080ff'];
    for (let i = 0; i < 18; i++) {
      const p = document.createElement('div');
      p.className = 'vip-particle';
      const dur = 3 + Math.random() * 4;
      const delay = Math.random() * 5;
      const color = colors[Math.floor(Math.random() * colors.length)];
      const size = 1 + Math.random() * 2;
      p.style.cssText = `left: ${Math.random() * 100}%; bottom: 0; --dur: ${dur}s; --delay: ${delay}s; background: ${color}; width: ${size}px; height: ${size}px;`;
      container.appendChild(p);
    }
  }, []);

  // Silent verification of existing active VIP code on mount
  useEffect(() => {
    let isMounted = true;
    const checkSavedCode = async () => {
      try {
        const savedCode = localStorage.getItem('vip_active_code');
        if (savedCode) {
          setCode(savedCode);
          await verifyAndUnlock(savedCode, true);
        }
      } catch (err) {
        console.warn('VIP Auto-login check failed:', err);
      } finally {
        if (isMounted) setIsInitialChecking(false);
      }
    };

    checkSavedCode();
    return () => {
      isMounted = false;
    };
  }, []);

  const triggerError = (msg: string) => {
    setErrorMessage(msg);
    setShake(true);
    setTimeout(() => setShake(false), 500);
  };

  const handleDeviceCopy = () => {
    const deviceId = getDeviceId();
    try {
      if (navigator.clipboard) {
        navigator.clipboard.writeText(deviceId);
      } else {
        const textArea = document.createElement('textarea');
        textArea.value = deviceId;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
      }
      alert('✅ تم نسخ المعرف بنجاح:\n' + deviceId);
    } catch {
      alert('معرف جهازك هو:\n' + deviceId);
    }
  };

  const handlePurchase = () => {
    window.open('https://t.me/Wsxderfpo', '_blank');
  };

  const verifyAndUnlock = async (rawCode: string, isAuto: boolean = false): Promise<boolean> => {
    const normalized = rawCode.trim().toUpperCase();
    if (!normalized) {
      if (!isAuto) triggerError('الرجاء إدخال كود التفعيل');
      return false;
    }

    if (!isAuto) setIsLoading(true);

    try {
      const res = await fetch(`tables/${TABLE}`);
      const data = await res.json();
      const codes = data.data || [];
      const match = codes.find((c: any) => (c.code || '').toUpperCase() === normalized);
      const currentDevice = getDeviceId();

      if (!match) {
        if (!isAuto) {
          triggerError('❌ الكود غير صحيح');
          setIsLoading(false);
        }
        return false;
      }

      // Check expiry date
      if (match.expiry_date && new Date(match.expiry_date) < new Date()) {
        localStorage.removeItem('vip_active_code');
        if (!isAuto) {
          triggerError('⏰ انتهى اشتراكك');
          setIsLoading(false);
        }
        return false;
      }

      // Check device ID binding
      if (match.used_by && match.used_by !== '' && match.used_by !== currentDevice) {
        if (!isAuto) {
          triggerError('⚠️ مرتبط بجهاز آخر');
          setIsLoading(false);
        }
        return false;
      }

      // Save to localStorage
      localStorage.setItem('vip_active_code', normalized);
      localStorage.setItem('vip_device_id', currentDevice);

      // Register device if not registered yet
      if (match.used_by !== currentDevice) {
        try {
          await fetch(`tables/${TABLE}/${match.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              status: 'used',
              used_count: (match.used_count || 0) + 1,
              used_by: currentDevice,
            }),
          });
        } catch (patchErr) {
          console.error('Failed to patch code status:', patchErr);
        }
      }

      setIsSuccess(true);

      setTimeout(() => {
        try {
          // Notify native WebView if present
          window.location.href = 'vip://unlock';
        } catch {}
        onUnlock(normalized);
      }, 1500);

      return true;
    } catch (err) {
      console.error('VIP Verification Error:', err);
      if (!isAuto) {
        triggerError('خطأ في الاتصال بالخادم');
        setIsLoading(false);
      }
      return false;
    }
  };

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    verifyAndUnlock(code, false);
  };

  return (
    <div className="vip-lock-root fixed inset-0 z-50 flex items-center justify-center bg-black overflow-hidden select-none" dir="rtl">
      {/* Styles for VIP Lock Experience */}
      <style>{`
        .vip-particle {
          position: absolute;
          border-radius: 50%;
          opacity: 0;
          animation: vipFloatUp var(--dur) ease-in infinite var(--delay);
          pointer-events: none;
        }
        @keyframes vipFloatUp {
          0% { transform: translateY(100px); opacity: 0; }
          20% { opacity: 0.6; }
          100% { transform: translateY(-200px); opacity: 0; }
        }
        @keyframes vipCrownPulse {
          0%, 100% { filter: drop-shadow(0 0 20px rgba(245,200,66,0.7)) drop-shadow(0 0 40px rgba(245,200,66,0.3)); transform: scale(1); }
          50% { filter: drop-shadow(0 0 30px rgba(245,200,66,0.9)) drop-shadow(0 0 60px rgba(245,200,66,0.5)); transform: scale(1.05); }
        }
        @keyframes vipRippleExpand {
          0% { width: 0; height: 0; opacity: 0.6; transform: translate(-50%, -50%) scale(0); }
          100% { width: 320px; height: 320px; opacity: 0; transform: translate(-50%, -50%) scale(1); }
        }
        @keyframes vipShake {
          0%, 100% { transform: translateX(0); }
          20% { transform: translateX(-6px); }
          40% { transform: translateX(6px); }
          60% { transform: translateX(-4px); }
          80% { transform: translateX(4px); }
        }
        @keyframes vipBounceIn {
          0% { transform: scale(0); }
          60% { transform: scale(1.2); }
          100% { transform: scale(1); }
        }
        .vip-shake { animation: vipShake 0.4s ease; }
        .vip-crown-anim { animation: vipCrownPulse 3s ease-in-out infinite; }
        .vip-ripple {
          position: absolute;
          border-radius: 50%;
          border: 1px solid rgba(0,200,150,0.3);
          animation: vipRippleExpand 2.5s ease-out infinite;
          pointer-events: none;
        }
      `}</style>

      {/* Initial Preloader */}
      {isInitialChecking && (
        <div className="absolute inset-0 bg-black z-50 flex items-center justify-center">
          <div className="w-10 h-10 border-4 border-slate-800 border-t-emerald-400 rounded-full animate-spin" />
        </div>
      )}

      <div className="w-full h-full min-h-screen flex items-center justify-center bg-[radial-gradient(ellipse_at_center,_#0d0d1a_0%,_#000000_70%)] relative p-4">
        {/* Glow backdrop circles */}
        <div className="absolute -top-24 -left-24 w-96 h-96 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-20 -right-20 w-96 h-96 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none" />

        {/* Outer Phone Frame Canvas */}
        <div className="w-full max-w-[420px] min-h-[580px] bg-black/90 border border-slate-800/80 shadow-[0_0_50px_rgba(0,0,0,0.9)] rounded-3xl relative overflow-hidden flex flex-col items-center justify-center p-7 sm:p-9 backdrop-blur-md">
          {/* Particles Container */}
          <div ref={particlesRef} className="absolute inset-0 pointer-events-none overflow-hidden" />

          {/* Ripple Rings */}
          <div className="vip-ripple" style={{ left: '50%', top: '24%', animationDelay: '0s' }} />
          <div className="vip-ripple" style={{ left: '50%', top: '24%', animationDelay: '0.8s' }} />
          <div className="vip-ripple" style={{ left: '50%', top: '24%', animationDelay: '1.6s' }} />

          {/* Crown Emoji */}
          <div className="mb-2 relative z-10">
            <span className="vip-crown-anim text-[64px] block text-center cursor-default">
              👑
            </span>
          </div>

          <p className="text-[13px] text-white/50 text-center mb-1 font-medium tracking-wide z-10">
            الوصول المميز
          </p>

          <h1 className="text-[34px] font-black text-center text-white tracking-[6px] uppercase mb-8 z-10 drop-shadow-[0_0_25px_rgba(255,255,255,0.3)] font-['Exo_2',sans-serif]">
            <span className="bg-gradient-to-br from-white via-slate-200 to-slate-400 bg-clip-text text-transparent">
              VIP ACCESS
            </span>
          </h1>

          {/* Activation Form */}
          <form onSubmit={handleSubmit} className="w-full z-10 flex flex-col">
            <div className={`relative mb-1 w-full ${shake ? 'vip-shake' : ''}`}>
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-lg pointer-events-none text-slate-400">
                🔑
              </span>
              <input
                id="vipCodeInput"
                type="text"
                value={code}
                onChange={(e) => {
                  setCode(e.target.value);
                  setErrorMessage('');
                }}
                placeholder="أدخل مفتاح التفعيل هنا"
                autoComplete="off"
                maxLength={20}
                className={`w-full py-4 pr-4 pl-12 bg-white/[0.04] border rounded-2xl text-white text-base font-semibold text-right outline-none transition-all duration-300 tracking-wider ${
                  errorMessage
                    ? 'border-red-500/80 shadow-[0_0_20px_rgba(239,68,68,0.2)]'
                    : 'border-indigo-500/40 focus:border-indigo-400 focus:shadow-[0_0_20px_rgba(99,102,241,0.25)] focus:bg-white/[0.06]'
                }`}
              />
            </div>

            {/* Error Message Box */}
            <div className="h-6 flex items-center justify-center mb-2">
              {errorMessage && (
                <span className="text-xs font-semibold text-rose-400 tracking-wide transition-all">
                  {errorMessage}
                </span>
              )}
            </div>

            {/* Submit Button */}
            <button
              id="vipEnterBtn"
              type="submit"
              disabled={isLoading || isSuccess}
              className="w-full py-4 bg-gradient-to-r from-[#00e5a0] to-[#00c27e] text-black font-extrabold text-base rounded-2xl shadow-[0_8px_30px_rgba(0,229,160,0.35)] hover:shadow-[0_12px_40px_rgba(0,229,160,0.5)] active:scale-[0.99] transition-all duration-300 flex items-center justify-center gap-2 mb-3 cursor-pointer disabled:opacity-75 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <div className="w-5 h-5 border-2 border-black/30 border-t-black rounded-full animate-spin" />
              ) : (
                <span>تسجيل الدخول</span>
              )}
            </button>

            {/* Copy Device ID Button */}
            <button
              id="vipCopyDeviceBtn"
              type="button"
              onClick={handleDeviceCopy}
              className="w-full py-3 bg-transparent border border-indigo-500/40 hover:border-indigo-400/80 hover:bg-indigo-500/10 text-white/80 hover:text-white rounded-2xl text-sm font-semibold transition-all duration-300 flex items-center justify-center gap-2 mb-3 cursor-pointer"
            >
              <span>⚙️</span>
              <span>نسخ المعرف</span>
            </button>

            {/* Purchase VIP Link */}
            <button
              id="vipPurchaseBtn"
              type="button"
              onClick={handlePurchase}
              className="w-full py-3 bg-transparent border border-amber-400/50 hover:border-amber-400 hover:bg-amber-400/10 text-amber-300/90 hover:text-amber-200 rounded-2xl text-sm font-semibold transition-all duration-300 flex items-center justify-center gap-2 cursor-pointer"
            >
              <span>💎</span>
              <span>شراء كود VIP</span>
            </button>
          </form>

          {/* Success Overlay Screen */}
          <div
            className={`absolute inset-0 bg-black flex flex-col items-center justify-center p-7 transition-opacity duration-500 z-20 ${
              isSuccess ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
            }`}
          >
            <div className="text-[72px] mb-4" style={{ animation: isSuccess ? 'vipBounceIn 0.6s ease' : 'none' }}>
              ✅
            </div>
            <h2 className="text-2xl font-extrabold text-[#00e5a0] mb-2 text-center drop-shadow-[0_0_15px_rgba(0,229,160,0.4)]">
              مرحباً بك في VIP!
            </h2>
            <p className="text-sm text-white/60 text-center leading-relaxed">
              تم التحقق من كودك بنجاح
              <br />
              سيتم فتح التطبيق خلال ثوانٍ...
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
