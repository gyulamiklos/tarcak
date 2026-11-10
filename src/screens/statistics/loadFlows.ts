import { getMonthlyFlows, MAX_MONTHS_PER_QUERY } from '../../db/repositories/monthlyStats';
import type { StatisticsScope } from '../../db/repositories/statistics';
import type { ReportMonth } from '../../domain/monthlyReport';
import type { FlowRow } from '../../domain/monthlyStats';

/** Monthly flows for any number of months, one query per 24-month batch. */
export async function loadFlows(
  currency: string,
  scope: StatisticsScope,
  months: readonly ReportMonth[]
): Promise<FlowRow[]> {
  const out: FlowRow[] = [];
  for (let i = 0; i < months.length; i += MAX_MONTHS_PER_QUERY) {
    out.push(...(await getMonthlyFlows(currency, scope, months.slice(i, i + MAX_MONTHS_PER_QUERY))));
  }
  return out;
}
