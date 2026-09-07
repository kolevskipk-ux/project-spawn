const errors: Record<string, string> = {
  identity_review_unavailable: 'Identity resolution is available for discovered products awaiting review. Refresh to check the current state.',
  verification_required: 'Run fresh verification first. Identity review needs a matching, accessible Amazon product page checked within the last 36 hours.',
  identity_evidence_required: 'Enter the exact product, set, sealed format, supporting HTTPS evidence URL, and reason. Select the card language or explicitly acknowledge that it remains unconfirmed.',
  candidate_not_verified: 'This product is not ready for approval. Refresh the page: if already approved, use Publish to Catch; otherwise run fresh verification and review any unresolved questions.',
  amazon_candidate_not_verified: 'This Amazon product needs successful independent verification before it can be approved for Catch. Run fresh verification and review any unresolved questions.',
  stale_evidence: 'The verification evidence changed since this page was opened. Refresh the page and review the latest evidence before trying again.',
  cross_border_requires_country: 'Enter a two-letter retailer country and ships-from country, such as US. International deliveries must ship from outside Mexico.',
  cross_border_requires_price: 'Enter the displayed item price. Shipping charges are optional.',
  cross_border_requires_currency: 'Enter a three-letter currency code for the item price, such as USD.',
  cross_border_requires_dates: 'Enter both Destination checked and Evidence valid until. These times are in UTC.',
  cross_border_evidence_expired: 'Delivery evidence has expired. Verify delivery again and enter a future Evidence valid until time (UTC).',
  cross_border_requires_fresh_destination_evidence: 'Complete the retailer country, ships-from country, item price, currency and delivery evidence dates.',
  domestic_requires_mexico_evidence: 'Domestic delivery requires both retailer country and ships-from country to be MX.',
  invalid_fulfilment_evidence: 'Check the delivery status and amounts. Prices and shipping must be numbers from 0 to 1,000,000.',
  fulfilment_not_publishable: 'Confirm delivery to Mexico before publishing, or reject the listing.',
};

export const reviewErrorMessage = (code: string) => errors[code] ?? code.replaceAll('_', ' ');
export function reviewSuccessMessage(notice: string): string {
  const action = notice.split(':')[0];
  return ({resolve: 'Identity review saved. Review the monitoring policy and approve separately.', publish: 'Listing published to inventory. Your decision is recorded in Activity.', reject: 'Listing rejected. Your decision is recorded in Activity.', approve: 'Approval recorded.', verify: 'Verification completed.', publish_visibility: 'Campaign published to inventory.'} as Record<string,string>)[action] ?? 'Action completed successfully.';
}
