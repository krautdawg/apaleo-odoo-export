import type { AccountType, Ledger, SourceAccount } from '../../src/core/source.js';

/**
 * A fabricated German chart of accounts in apaleo's shapes (global revenue
 * groups with leaves per VAT type as in the recorded BER chart, containers in the
 * guest ledger, a Kurtaxe account and two named revenue accounts), for the SKR
 * hotel templates, `init-mapping` and the posting tests.
 */
function account(number: string, name: string, type: AccountType, extra: Partial<SourceAccount> = {}): SourceAccount {
  return { number, name, type, ledger: 'global', isArchived: false, hasChildren: false, ...extra };
}

const VAT_TYPES: Readonly<Record<number, string>> = { 0: 'Without', 5: 'Reduced', 7: 'Reduced', 16: 'Normal', 19: 'Normal' };
const vat = (percent: number) => ({ type: VAT_TYPES[percent] ?? 'Normal', percent });
const container = (ledger: Ledger = 'global', parentNumber?: string) => ({ ledger, hasChildren: true, ...(parentNumber ? { parentNumber } : {}) });

export const GERMAN_CHART: readonly SourceAccount[] = [
  account('5000', 'Revenues', 'Revenues', container()),
  account('RevenueAccommodation', 'Revenues Accommodation', 'Revenues', container('global', '5000')),
  account('RevenueAccommodation_Reduced:7.00', 'Revenues Accommodation (7%)', 'Revenues', { parentNumber: 'RevenueAccommodation', vat: vat(7) }),
  account('RevenueAccommodation_Without:0.00', 'Revenues Accommodation (no VAT)', 'Revenues', { parentNumber: 'RevenueAccommodation', vat: vat(0) }),
  account('RevenueAccommodation_Normal:16.00', 'Revenues Accommodation (16%)', 'Revenues', { parentNumber: 'RevenueAccommodation', vat: vat(16) }),
  account('RevenueAccommodation_Reduced:5.00', 'Revenues Accommodation (5%)', 'Revenues', { parentNumber: 'RevenueAccommodation', vat: vat(5), isArchived: true }),
  account('RevenueFoodAndBeverages', 'Revenues Food and beverages', 'Revenues', container('global', '5000')),
  account('RevenueFoodAndBeverages_Reduced:7.00', 'Revenues Food and beverages (7%)', 'Revenues', { parentNumber: 'RevenueFoodAndBeverages', vat: vat(7) }),
  account('RevenueFoodAndBeverages_Normal:19.00', 'Revenues Food and beverages (19%)', 'Revenues', { parentNumber: 'RevenueFoodAndBeverages', vat: vat(19) }),
  account('RevenueOther', 'Revenues Other', 'Revenues', container('global', '5000')),
  account('RevenueOther_Normal:19.00', 'Revenues Other (19%)', 'Revenues', { parentNumber: 'RevenueOther', vat: vat(19) }),
  account('RevenueOther_Reduced:7.00', 'Revenues Other (7%)', 'Revenues', { parentNumber: 'RevenueOther', vat: vat(7) }),
  account('RevenueNoShow', 'Revenues No-show', 'Revenues', container('global', '5000')),
  account('RevenueNoShow_Reduced:7.00', 'Revenues No-show (7%)', 'Revenues', { parentNumber: 'RevenueNoShow', vat: vat(7) }),
  account('RevenueNoShow_Without:0.00', 'Revenues No-show (no VAT)', 'Revenues', { parentNumber: 'RevenueNoShow', vat: vat(0) }),
  account('RevenueCancellationFees', 'Revenues Cancellation fees', 'Revenues', container('global', '5000')),
  account('RevenueCancellationFees_Reduced:7.00', 'Revenues Cancellation fees (7%)', 'Revenues', { parentNumber: 'RevenueCancellationFees', vat: vat(7) }),
  account('RevenueCancellationFees_Without:0.00', 'Revenues Cancellation fees (no VAT)', 'Revenues', { parentNumber: 'RevenueCancellationFees', vat: vat(0) }),
  account('5011', 'Logis', 'Revenues', { parentNumber: '5000', vat: vat(7) }),
  account('5111', 'Frühstück im Zimmerpreis', 'Revenues', { parentNumber: '5000', vat: vat(7) }),
  account('5020', 'Getränke', 'Revenues', { parentNumber: '5000', vat: vat(19) }),
  account('1000', 'Payments', 'Payments', container()),
  account('1102', 'Visa Credit Card Payment', 'Payments', { parentNumber: '1000' }),
  account('1104', 'MasterCard Credit Card Payment', 'Payments', { parentNumber: '1000' }),
  account('1600', 'Cash Payment', 'Payments', { parentNumber: '1000' }),
  account('8000', 'Vat on Revenue', 'Vat', container()),
  account('Vat_Reduced:7.00', 'VAT Reduced (7%)', 'Vat', { parentNumber: '8000', vat: vat(7) }),
  account('Vat_Normal:19.00', 'VAT Normal (19%)', 'Vat', { parentNumber: '8000', vat: vat(19) }),
  account('8001', 'Vat on Prepayment', 'VatOnLiabilities', container()),
  account('LiabilitiesVat_Reduced:7.00', 'LiabilitiesVat Reduced (7%)', 'VatOnLiabilities', { parentNumber: '8001', vat: vat(7) }),
  account('3500', 'City Tax', 'CityTaxes', container()),
  account('3501', 'Kurtaxe', 'CityTaxes', { parentNumber: '3500', vat: vat(0) }),
  account('9000', 'House Account', 'House'),
  account('7000', 'Transitory Items', 'TransitoryItems'),
  account('3000', 'Liabilities', 'Liabilities', container('guest')),
  account('1200', 'Receivables', 'Receivables', container('guest')),
  account('9999', 'Accounts Receivable', 'AccountsReceivable', container('guest')),
  account('CollectiveDebitor_AccountsReceivable', 'AccountsReceivable for Reservations and Folios without company', 'AccountsReceivable', container('guest', '9999')),
  account('6900', 'Loss of Accounts Receivable', 'LossOfAccountsReceivable', container('guest')),
  account(
    'CollectiveDebitor_LossOfAccountsReceivable',
    'LossOfAccountsReceivable for Reservations and Folios without company',
    'LossOfAccountsReceivable',
    container('guest', '6900'),
  ),
];
