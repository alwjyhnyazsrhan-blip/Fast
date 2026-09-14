import { OrderItem, AppSource } from '../types';

export const APP_CONFIG: Record<AppSource, { name: string; color: string; bg: string; border: string; logoText: string }> = {
  jahez: {
    name: 'جاهز (Jahez)',
    color: 'text-amber-400',
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/30',
    logoText: 'جاهز',
  },
  hungerstation: {
    name: 'هنقرستيشن (HungerStation)',
    color: 'text-yellow-400',
    bg: 'bg-yellow-500/10',
    border: 'border-yellow-500/30',
    logoText: 'HS',
  },
  marsool: {
    name: 'مرسول (Mrsool)',
    color: 'text-emerald-400',
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/30',
    logoText: 'مرسول',
  },
  toyou: {
    name: 'تويو (ToYou)',
    color: 'text-blue-400',
    bg: 'bg-blue-500/10',
    border: 'border-blue-500/30',
    logoText: 'ToYou',
  },
  ninja: {
    name: 'نينجا (Ninja)',
    color: 'text-purple-400',
    bg: 'bg-purple-500/10',
    border: 'border-purple-500/30',
    logoText: 'Ninja',
  },
  chefz: {
    name: 'ذا شفز (The Chefz)',
    color: 'text-rose-400',
    bg: 'bg-rose-500/10',
    border: 'border-rose-500/30',
    logoText: 'Chefz',
  },
};

export const INITIAL_ORDERS: OrderItem[] = [
  {
    id: 'ord-1049',
    appSource: 'jahez',
    appName: 'جاهز',
    storeName: 'شاورمر - فرع العليا',
    customerDistrict: 'حي السليمانية',
    distanceKm: 1.4,
    payoutSar: 21.5,
    detectedAt: new Date(Date.now() - 1000 * 60 * 2),
    status: 'accepted',
    autoAccepted: true,
  },
  {
    id: 'ord-1048',
    appSource: 'hungerstation',
    appName: 'هنقرستيشن',
    storeName: 'ماكدونالدز - طريق الملك فهد',
    customerDistrict: 'حي الورود',
    distanceKm: 4.8,
    payoutSar: 18.0,
    detectedAt: new Date(Date.now() - 1000 * 60 * 6),
    status: 'rejected',
    rejectionReason: 'تجاوز أقصى مسافة محددة (4.8 كم > الحد المسموح)',
    autoAccepted: false,
  },
  {
    id: 'ord-1047',
    appSource: 'marsool',
    appName: 'مرسول',
    storeName: 'صيدلية النهدي - التحلية',
    customerDistrict: 'حي المروج',
    distanceKm: 1.9,
    payoutSar: 26.0,
    detectedAt: new Date(Date.now() - 1000 * 60 * 12),
    status: 'accepted',
    autoAccepted: true,
  },
  {
    id: 'ord-1046',
    appSource: 'toyou',
    appName: 'تويو',
    storeName: 'ستاربكس - النخيل مول',
    customerDistrict: 'حي المغرزات',
    distanceKm: 5.2,
    payoutSar: 19.5,
    detectedAt: new Date(Date.now() - 1000 * 60 * 18),
    status: 'rejected',
    rejectionReason: 'تجاوز أقصى مسافة محددة (5.2 كم > الحد المسموح)',
    autoAccepted: false,
  },
  {
    id: 'ord-1045',
    appSource: 'chefz',
    appName: 'ذا شفز',
    storeName: 'بول بيكري - بوليفارد',
    customerDistrict: 'حي حطين',
    distanceKm: 1.1,
    payoutSar: 34.0,
    detectedAt: new Date(Date.now() - 1000 * 60 * 24),
    status: 'accepted',
    autoAccepted: true,
  },
];

const SAMPLE_STORES = [
  { name: 'البيك - فرع الضباب', app: 'hungerstation' as AppSource, district: 'حي المربع', basePrice: 17 },
  { name: 'برغرايزك - طريق أنس بن مالك', app: 'jahez' as AppSource, district: 'حي الياسمين', basePrice: 24 },
  { name: 'دانكن دونتس - طريق خريص', app: 'toyou' as AppSource, district: 'حي الروضة', basePrice: 16 },
  { name: 'كافيه هاف مليون - التخصصي', app: 'jahez' as AppSource, district: 'حي الرحمانية', basePrice: 22 },
  { name: 'مطعم كودو - طريق الملك عبد العزيز', app: 'hungerstation' as AppSource, district: 'حي النفل', basePrice: 19 },
  { name: 'بقالة الدانوب - بانوراما مول', app: 'marsool' as AppSource, district: 'حي المعذر', basePrice: 28 },
  { name: 'نينجا ماركت - مستودع السليمانية', app: 'ninja' as AppSource, district: 'حي السليمانية', basePrice: 18 },
  { name: 'مخبز تاو - مجمع سنتريا', app: 'chefz' as AppSource, district: 'حي العليا', basePrice: 38 },
];

export function generateMockOffer(maxDistanceKm: number): OrderItem {
  const store = SAMPLE_STORES[Math.floor(Math.random() * SAMPLE_STORES.length)];
  // Generate random distance between 0.6 km and 6.5 km
  const rawDist = Math.random() * 5.5 + 0.6;
  const distanceKm = Math.round(rawDist * 10) / 10;
  const payoutSar = Math.round((store.basePrice + (distanceKm > 2 ? (distanceKm - 2) * 2.5 : 0)) * 2) / 2;
  
  const isAccepted = distanceKm <= maxDistanceKm;

  return {
    id: `ord-${Math.floor(1000 + Math.random() * 9000)}`,
    appSource: store.app,
    appName: APP_CONFIG[store.app].name.split(' ')[0],
    storeName: store.name,
    customerDistrict: store.district,
    distanceKm,
    payoutSar,
    detectedAt: new Date(),
    status: isAccepted ? 'accepted' : 'rejected',
    rejectionReason: isAccepted ? undefined : `المسافة (${distanceKm} كم) تتجاوز الحد الأقصى (${maxDistanceKm} كم)`,
    autoAccepted: isAccepted,
  };
}
