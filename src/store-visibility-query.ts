// Callers join store_acquisitions as s. A retailer alias on the same origin must
// not regain visibility or monitoring after its vendor has been suppressed.
export const storeSuppressionSql=`EXISTS(SELECT 1 FROM vendors v WHERE v.status='SUPPRESSED' AND (
  v.vendor_key=s.vendor_key OR EXISTS(SELECT 1 FROM inventory alias
    WHERE alias.canonical_url>=s.origin||'/' AND alias.canonical_url<s.origin||'0' AND lower(trim(alias.retailer))=lower(trim(v.vendor_name)))
  OR EXISTS(SELECT 1 FROM monitoring_candidates alias
    WHERE alias.source_url>=s.origin||'/' AND alias.source_url<s.origin||'0' AND alias.vendor_key=v.vendor_key)))`;
