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

export const INITIAL_ORDERS: OrderItem[] = [];

