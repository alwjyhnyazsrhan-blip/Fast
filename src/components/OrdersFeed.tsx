import React, { useState } from 'react';
import { 
  ListOrdered, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  Navigation, 
  Coins, 
  Trash2, 
  Filter, 
  Sparkles, 
  AlertTriangle,
  ChevronRight,
  Zap,
  MapPin,
  Send
} from 'lucide-react';
import { OrderItem } from '../types';
import { APP_CONFIG } from '../utils/sampleData';

interface OrdersFeedProps {
  orders: OrderItem[];
  maxDistanceKm: number;
  isRunning: boolean;
  onClearOrders: () => void;
  onTestCustomOrder: (orderData: {
    distanceKm?: number;
    appName: string;
    storeName: string;
    payoutSar: number;
    storeLat?: number;
    storeLng?: number;
    customerLat?: number;
    customerLng?: number;
  }) => void;
}

export const OrdersFeed: React.FC<OrdersFeedProps> = ({
  orders,
  maxDistanceKm,
  isRunning,
  onClearOrders,
  onTestCustomOrder,
}) => {
  const [filter, setFilter] = useState<'all' | 'accepted' | 'rejected'>('all');
  const [testMode, setTestMode] = useState<'distance' | 'coordinates'>('distance');
  const [showTester, setShowTester] = useState<boolean>(false);

  // Form states
  const [customDistance, setCustomDistance] = useState<string>('1.8');
  const [customApp, setCustomApp] = useState<string>('jahez');
  const [customStore, setCustomStore] = useState<string>('شاورما كلاسيك');
  const [customPayout, setCustomPayout] = useState<string>('20');
  
  // Coordinate states
  const [storeLat, setStoreLat] = useState<string>('24.8120');
  const [storeLng, setStoreLng] = useState<string>('46.6350');
  const [customerLat, setCustomerLat] = useState<string>('24.8235');
  const [customerLng, setCustomerLng] = useState<string>('46.6430');

  const filteredOrders = orders.filter((ord) => {
    if (filter === 'accepted') return ord.status === 'accepted';
    if (filter === 'rejected') return ord.status === 'rejected';
    return true;
  });

  const handleSubmitTestOrder = (e: React.FormEvent) => {
    e.preventDefault();
    const payout = parseFloat(customPayout) || 18;

    if (testMode === 'distance') {
      const dist = parseFloat(customDistance);
      if (!isNaN(dist) && dist > 0) {
        onTestCustomOrder({
          distanceKm: dist,
          appName: customApp,
          storeName: customStore,
          payoutSar: payout,
        });
      }
    } else {
      const sLat = parseFloat(storeLat);
      const sLng = parseFloat(storeLng);
      const cLat = parseFloat(customerLat);
      const cLng = parseFloat(customerLng);
      if (!isNaN(sLat) && !isNaN(sLng) && !isNaN(cLat) && !isNaN(cLng)) {
        onTestCustomOrder({
          appName: customApp,
          storeName: customStore,
          payoutSar: payout,
          storeLat: sLat,
          storeLng: sLng,
          customerLat: cLat,
          customerLng: cLng,
        });
      }
    }
  };

  return (
    <div className="bg-gradient-to-b from-[#121929] to-[#0c1220] rounded-2xl p-6 border border-slate-800 shadow-xl">
      {/* Header with Title and Filters */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-indigo-500/10 border border-indigo-500/30 text-indigo-400">
              <ListOrdered className="w-4 h-4" />
            </span>
            <h2 className="text-base font-bold text-white">سجل فحص طلبات التوصيل المباشرة</h2>
            <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-mono">
              {orders.length} طلب
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            سجل حقيقي للطلبات التي تم استلامها والتحقق من مسافتها الجغرافية عبر خوارزمية السيرفر
          </p>
        </div>

        {/* Filter buttons & Actions */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center bg-slate-900 rounded-xl p-1 border border-slate-800">
            <button
              id="filter-all-btn"
              onClick={() => setFilter('all')}
              className={`px-3 py-1 text-xs rounded-lg font-medium transition-all ${
                filter === 'all'
                  ? 'bg-slate-800 text-white font-bold shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              الكل ({orders.length})
            </button>
            <button
              id="filter-accepted-btn"
              onClick={() => setFilter('accepted')}
              className={`px-3 py-1 text-xs rounded-lg font-medium transition-all flex items-center gap-1 ${
                filter === 'accepted'
                  ? 'bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/30'
                  : 'text-slate-400 hover:text-emerald-400'
              }`}
            >
              <CheckCircle2 className="w-3 h-3 text-emerald-400" />
              المقبولة ({orders.filter((o) => o.status === 'accepted').length})
            </button>
            <button
              id="filter-rejected-btn"
              onClick={() => setFilter('rejected')}
              className={`px-3 py-1 text-xs rounded-lg font-medium transition-all flex items-center gap-1 ${
                filter === 'rejected'
                  ? 'bg-rose-500/20 text-rose-300 font-bold border border-rose-500/30'
                  : 'text-slate-400 hover:text-rose-400'
              }`}
            >
              <XCircle className="w-3 h-3 text-rose-400" />
              المستبعدة ({orders.filter((o) => o.status === 'rejected').length})
            </button>
          </div>

          {/* Toggle Custom Test Form */}
          <button
            id="toggle-custom-tester-btn"
            onClick={() => setShowTester(!showTester)}
            className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition-all flex items-center gap-1.5 cursor-pointer"
          >
            <Send className="w-3.5 h-3.5 text-cyan-400" />
            <span>{showTester ? 'إخفاء الفاحص' : 'فحص طلب يدوي / إحداثيات'}</span>
          </button>

          {/* Clear Orders Button */}
          {orders.length > 0 && (
            <button
              id="btn-clear-orders"
              onClick={onClearOrders}
              title="تفريغ سجل الطلبات من السيرفر"
              className="p-1.5 rounded-xl bg-slate-900 hover:bg-rose-950/40 text-slate-400 hover:text-rose-400 border border-slate-800 hover:border-rose-500/30 transition-all"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Real Order Testing Form Modal / Tray */}
      {showTester && (
        <form
          onSubmit={handleSubmitTestOrder}
          className="mt-4 p-4 rounded-xl bg-[#090d16] border border-cyan-500/30 space-y-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-800">
            <span className="text-xs font-bold text-cyan-300 flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-cyan-400" />
              إرسال طلب مباشر لسيرفر المعالجة للتحقق من المسافة وقرار القبول:
            </span>
            <div className="flex bg-slate-900 p-0.5 rounded-lg border border-slate-800 text-[11px]">
              <button
                type="button"
                onClick={() => setTestMode('distance')}
                className={`px-2.5 py-1 rounded-md ${
                  testMode === 'distance' ? 'bg-cyan-600 text-white font-bold' : 'text-slate-400'
                }`}
              >
                مسافة مباشرة (كم)
              </button>
              <button
                type="button"
                onClick={() => setTestMode('coordinates')}
                className={`px-2.5 py-1 rounded-md ${
                  testMode === 'coordinates' ? 'bg-cyan-600 text-white font-bold' : 'text-slate-400'
                }`}
              >
                إحداثيات جغرافية (GPS)
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
            <div>
              <label className="text-slate-400 block mb-1">اسم التطبيق:</label>
              <select
                value={customApp}
                onChange={(e) => setCustomApp(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 text-white rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-cyan-500"
              >
                <option value="jahez">جاهز (Jahez)</option>
                <option value="hungerstation">هنقرستيشن (HungerStation)</option>
                <option value="marsool">مرسول (Mrsool)</option>
                <option value="toyou">تويو (ToYou)</option>
                <option value="ninja">نينجا (Ninja)</option>
                <option value="chefz">ذا شفز (The Chefz)</option>
              </select>
            </div>

            <div>
              <label className="text-slate-400 block mb-1">اسم المتجر / المطعم:</label>
              <input
                type="text"
                value={customStore}
                onChange={(e) => setCustomStore(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 text-white rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-cyan-500"
              />
            </div>

            <div>
              <label className="text-slate-400 block mb-1">أجر التوصيل (ر.س):</label>
              <input
                type="number"
                step="1"
                min="5"
                value={customPayout}
                onChange={(e) => setCustomPayout(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 text-white rounded-lg px-2.5 py-1.5 font-mono focus:outline-none focus:border-cyan-500"
              />
            </div>

            {testMode === 'distance' ? (
              <div>
                <label className="text-slate-400 block mb-1">المسافة المقروءة (كم):</label>
                <input
                  type="number"
                  step="0.1"
                  min="0.2"
                  max="30"
                  value={customDistance}
                  onChange={(e) => setCustomDistance(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 text-emerald-400 font-bold font-mono rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-cyan-500"
                />
              </div>
            ) : null}
          </div>

          {testMode === 'coordinates' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs bg-slate-950 p-3 rounded-lg border border-slate-800">
              <div>
                <label className="text-slate-400 block mb-1">خط عرض المتجر (Store Lat):</label>
                <input
                  type="text"
                  value={storeLat}
                  onChange={(e) => setStoreLat(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 text-slate-200 font-mono rounded-lg px-2 py-1"
                />
              </div>
              <div>
                <label className="text-slate-400 block mb-1">خط طول المتجر (Store Lng):</label>
                <input
                  type="text"
                  value={storeLng}
                  onChange={(e) => setStoreLng(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 text-slate-200 font-mono rounded-lg px-2 py-1"
                />
              </div>
              <div>
                <label className="text-slate-400 block mb-1">خط عرض العميل (Customer Lat):</label>
                <input
                  type="text"
                  value={customerLat}
                  onChange={(e) => setCustomerLat(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 text-slate-200 font-mono rounded-lg px-2 py-1"
                />
              </div>
              <div>
                <label className="text-slate-400 block mb-1">خط طول العميل (Customer Lng):</label>
                <input
                  type="text"
                  value={customerLng}
                  onChange={(e) => setCustomerLng(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 text-slate-200 font-mono rounded-lg px-2 py-1"
                />
              </div>
            </div>
          )}

          <div className="flex justify-end">
            <button
              type="submit"
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-bold text-xs transition-all cursor-pointer shadow-md active:scale-95 flex items-center gap-1.5"
            >
              <Send className="w-3.5 h-3.5" />
              <span>إرسال وتحقق في السيرفر</span>
            </button>
          </div>
        </form>
      )}

      {/* Orders List Feed */}
      <div className="mt-5 space-y-3">
        {filteredOrders.length === 0 ? (
          <div className="py-12 text-center border-2 border-dashed border-slate-800 rounded-2xl">
            <Clock className="w-10 h-10 text-slate-600 mx-auto mb-3" />
            <p className="text-slate-300 font-bold text-sm">لا توجد طلبات في هذا التصنيف حالياً</p>
            <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
              {isRunning
                ? 'الأداة متصلة بالسيرفر وجاهزة لمعالجة أي طلب وارد، يمكنك الضغط على "فحص طلب يدوي" لاختبار الخادم.'
                : 'قم بتشغيل الأداة (Start) للبدء في مراقبة الطلبات أو اضغط "فحص طلب فوري" لتجربة الرصد.'}
            </p>
          </div>
        ) : (
          filteredOrders.map((order) => {
            const isAccepted = order.status === 'accepted';
            const appConf = APP_CONFIG[order.appSource] || {
              name: order.appName,
              color: 'text-slate-300',
              bg: 'bg-slate-800',
              border: 'border-slate-700',
              logoText: order.appName,
            };

            const timeString = new Intl.DateTimeFormat('ar-SA', {
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
            }).format(new Date(order.detectedAt));

            return (
              <div
                key={order.id}
                className={`relative rounded-xl p-4 transition-all duration-200 border ${
                  isAccepted
                    ? 'bg-gradient-to-r from-emerald-950/20 via-slate-900 to-[#0d1424] border-emerald-500/30 hover:border-emerald-500/50'
                    : 'bg-gradient-to-r from-rose-950/20 via-slate-900 to-[#0d1424] border-rose-500/30 hover:border-rose-500/50'
                }`}
              >
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  
                  {/* Store info and app tag */}
                  <div className="flex items-start gap-3">
                    <div
                      className={`w-11 h-11 rounded-xl flex items-center justify-center font-bold text-xs shrink-0 border ${appConf.bg} ${appConf.border} ${appConf.color}`}
                    >
                      {appConf.logoText}
                    </div>

                    <div>
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-bold ${appConf.color}`}>
                          {appConf.name}
                        </span>
                        <span className="text-[10px] text-slate-500 font-mono">
                          {order.id}
                        </span>
                        <span className="text-[10px] text-slate-500 flex items-center gap-1 font-mono">
                          <Clock className="w-3 h-3" />
                          {timeString}
                        </span>
                      </div>

                      <h4 className="text-sm font-bold text-white mt-1 flex items-center gap-2">
                        <span>{order.storeName}</span>
                        <span className="text-xs text-slate-400 font-normal">← {order.customerDistrict}</span>
                      </h4>

                      {order.rejectionReason && (
                        <p className="text-[11px] text-rose-400 flex items-center gap-1 mt-1 font-medium">
                          <AlertTriangle className="w-3 h-3" />
                          {order.rejectionReason}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Distance, payout, and decision badge */}
                  <div className="flex items-center gap-4 self-end md:self-auto">
                    {/* Distance Badge */}
                    <div className="text-right">
                      <span className="text-[10px] text-slate-400 block font-medium">المسافة الحقيقية:</span>
                      <span
                        className={`text-base font-black font-mono ${
                          isAccepted ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      >
                        {order.distanceKm} كم
                      </span>
                    </div>

                    {/* Payout Badge */}
                    <div className="text-right bg-slate-950 px-3 py-1.5 rounded-lg border border-slate-800">
                      <span className="text-[10px] text-slate-400 block font-medium">الأجر:</span>
                      <span className="text-xs font-bold text-slate-200 font-mono">
                        {order.payoutSar} ر.س
                      </span>
                    </div>

                    {/* Final Decision Badge */}
                    <div
                      className={`px-3 py-2 rounded-xl flex items-center gap-1.5 text-xs font-bold border ${
                        isAccepted
                          ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 shadow-sm'
                          : 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                      }`}
                    >
                      {isAccepted ? (
                        <>
                          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                          <span>تم القبول الآلي</span>
                        </>
                      ) : (
                        <>
                          <XCircle className="w-4 h-4 text-rose-400" />
                          <span>مستبعد (تجاوز {maxDistanceKm} كم)</span>
                        </>
                      )}
                    </div>
                  </div>

                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
