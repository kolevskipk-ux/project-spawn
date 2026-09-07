export interface ReadinessTarget {
  asin: string;
  product_name?: string;
  language?: string;
  verified_at?: string | null;
  poll_interval_minutes?: number;
}
export interface MonitorTarget {
  asin?: string;
  lastAttemptAt?: string;
  cadenceMinutes?: number;
}

// A read-only review queue. It does not acquire pages, change lanes, archive, or reset state.
export function baselineReadiness(targets: ReadinessTarget[], monitors: MonitorTarget[], now = Date.now()) {
  const byAsin = new Map(monitors.map(row=>[row.asin?.toUpperCase(),row]));
  const rows=targets.map(target=>{
    const monitor=byAsin.get(target.asin.toUpperCase());
    const reviewed=Date.parse(target.verified_at??'');
    const attempted=Date.parse(monitor?.lastAttemptAt??'');
    const cadence=Number(monitor?.cadenceMinutes??target.poll_interval_minutes);
    return {asin:target.asin,product_name:target.product_name,language:target.language??'unknown',
      catch_confirmed:Boolean(monitor),requested_cadence_minutes:target.poll_interval_minutes??null,
      effective_cadence_minutes:monitor?.cadenceMinutes??null,
      availability_check_overdue:!Number.isFinite(attempted)||!Number.isFinite(cadence)||cadence<=0||now-attempted>cadence*60_000,
      identity_review_due:!Number.isFinite(reviewed)||now-reviewed>=30*86_400_000,
      last_identity_review:target.verified_at??null};
  });
  return {generated_at:new Date(now).toISOString(),monthly_review_interval_days:30,
    counts:{published:rows.length,catch_confirmed:rows.filter(row=>row.catch_confirmed).length,
      overdue:rows.filter(row=>row.availability_check_overdue).length,identity_review_due:rows.filter(row=>row.identity_review_due).length,
      language_unconfirmed:rows.filter(row=>row.language==='unknown').length},rows};
}
