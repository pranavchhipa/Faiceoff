/**
 * Convert paise to rupees and format with the Indian numbering system.
 * Example: 1500000 paise -> "₹15,00,000.00"
 */
export function formatINR(paise: number): string {
  const rupees = paise / 100;

  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(rupees);
}
