import { AMOUNT_MINOR_SCALE } from './amountMinor';

/**
 * A chart axis label for a value in minor units, in short major units (1.2k, 3.5M). Display only:
 * axis values are already rounded steps, so a float is fine here.
 */
export function formatAxisMajor(minor: number): string {
  const rounded = Math.round(minor);
  if (!Number.isFinite(rounded)) return '';
  if (rounded === 0) return '0';
  const major = rounded / AMOUNT_MINOR_SCALE;
  const abs = Math.abs(major);
  if (abs >= 1_000_000) return `${(major / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (abs >= 10_000) return `${(major / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  if (abs >= 100) return major.toFixed(0);
  if (abs >= 10) return major.toFixed(1);
  if (abs >= 1) return major.toFixed(2);
  return major.toFixed(3);
}
