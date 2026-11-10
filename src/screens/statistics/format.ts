import { MONTH_LONG, MONTH_SHORT } from '../../components/TimeRangePickerField';
import { formatMinorAmountForDisplay } from '../../utils/formatMinor';

function parts(key: string): { year: string; month: number } {
  return { year: key.slice(0, 4), month: Number(key.slice(5, 7)) - 1 };
}

/** `Oct` */
export function monthAbbrev(key: string): string {
  return MONTH_SHORT[parts(key).month] ?? key;
}

/** `Oct 2026` */
export function monthShortLabel(key: string): string {
  const p = parts(key);
  return `${MONTH_SHORT[p.month] ?? key} ${p.year}`;
}

/** `October 2026` */
export function monthLongLabel(key: string): string {
  const p = parts(key);
  return `${MONTH_LONG[p.month] ?? key} ${p.year}`;
}

/** An amount with an explicit sign: `+640 000`, `-48 200`, `0`. */
export function signedAmount(minor: bigint, currency: string): string {
  return `${minor > 0n ? '+' : ''}${formatMinorAmountForDisplay(minor, currency)}`;
}
