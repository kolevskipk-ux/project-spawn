const errors: Record<string, string> = {
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
  return ({publish: 'Listing published to inventory. Your decision is recorded in Activity.', reject: 'Listing rejected. Your decision is recorded in Activity.', approve: 'Approval recorded.', verify: 'Verification completed.', publish_visibility: 'Campaign published to inventory.'} as Record<string,string>)[action] ?? 'Action completed successfully.';
}
