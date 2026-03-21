import { DDSService } from '@/services/DDSService';

/** Format seconds as m:ss */
export function formatTime(s: number): string {
  if (s === 0) return '--';
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
}

/** Format seconds as m:ss (always shows 0:00 for zero) */
export function formatTimeRaw(s: number): string {
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
}

/** Map DDS score to difficulty label — delegates to DDSService */
export const ddsToLabel = DDSService.ddsToLabel;
