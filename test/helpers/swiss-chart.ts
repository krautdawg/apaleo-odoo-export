import type { AccountType, Ledger, SourceAccount } from '../../src/core/source.js';

/**
 * A fabricated Swiss chart of accounts in apaleo's shapes (global revenue
 * groups with leaves per MWST rate, containers in the guest ledger), for the
 * KMU hotel template and `init-mapping`. No real apaleo recording exists for a
 * Swiss property yet (research open question 6).
 */
function account(number: string, name: string, type: AccountType, extra: Partial<SourceAccount> = {}): SourceAccount {
  return { number, name, type, ledger: 'global', isArchived: false, hasChildren: false, ...extra };
}

const vat = (percent: number) => ({ type: percent === 0 ? 'Without' : 'Normal', percent });
const container = (ledger: Ledger = 'global', parentNumber?: string) => ({ ledger, hasChildren: true, ...(parentNumber ? { parentNumber } : {}) });

export const SWISS_CHART: readonly SourceAccount[] = [
  account('5000', 'Revenues', 'Revenues', container()),
  account('RevenueAccommodation', 'Revenues Accommodation', 'Revenues', container('global', '5000')),
  account('RevenueAccommodation_Special:3.80', 'Revenues Accommodation (3.8%)', 'Revenues', { parentNumber: 'RevenueAccommodation', vat: vat(3.8) }),
  account('RevenueAccommodation_Without:0.00', 'Revenues Accommodation (no VAT)', 'Revenues', { parentNumber: 'RevenueAccommodation', vat: vat(0) }),
  account('RevenueAccommodation_Special:3.70', 'Revenues Accommodation (3.7%)', 'Revenues', { parentNumber: 'RevenueAccommodation', vat: vat(3.7), isArchived: true }),
  account('RevenueFoodAndBeverages', 'Revenues Food and beverages', 'Revenues', container('global', '5000')),
  account('RevenueFoodAndBeverages_Normal:8.10', 'Revenues Food and beverages (8.1%)', 'Revenues', { parentNumber: 'RevenueFoodAndBeverages', vat: vat(8.1) }),
  account('RevenueFoodAndBeverages_Reduced:2.60', 'Revenues Food and beverages (2.6%)', 'Revenues', { parentNumber: 'RevenueFoodAndBeverages', vat: vat(2.6) }),
  account('RevenueOther', 'Revenues Other', 'Revenues', container('global', '5000')),
  account('RevenueOther_Normal:8.10', 'Revenues Other (8.1%)', 'Revenues', { parentNumber: 'RevenueOther', vat: vat(8.1) }),
  account('RevenueNoShow', 'Revenues No-show', 'Revenues', container('global', '5000')),
  account('RevenueNoShow_Special:3.80', 'Revenues No-show (3.8%)', 'Revenues', { parentNumber: 'RevenueNoShow', vat: vat(3.8) }),
  account('RevenueNoShow_Without:0.00', 'Revenues No-show (no VAT)', 'Revenues', { parentNumber: 'RevenueNoShow', vat: vat(0) }),
  account('5011', 'Logis', 'Revenues', { parentNumber: '5000', vat: vat(3.8) }),
  account('5111', 'Frühstück im Zimmerpreis', 'Revenues', { parentNumber: '5000', vat: vat(3.8) }),
  account('1000', 'Payments', 'Payments', container()),
  account('1102', 'Visa Credit Card Payment', 'Payments', { parentNumber: '1000' }),
  account('1114', 'Twint Payment', 'Payments', { parentNumber: '1000' }),
  account('1600', 'Cash Payment', 'Payments', { parentNumber: '1000' }),
  account('8000', 'Vat on Revenue', 'Vat', container()),
  account('Vat_Special:3.80', 'VAT Special (3.8%)', 'Vat', { parentNumber: '8000', vat: vat(3.8) }),
  account('Vat_Normal:8.10', 'VAT Normal (8.1%)', 'Vat', { parentNumber: '8000', vat: vat(8.1) }),
  account('8001', 'Vat on Prepayment', 'VatOnLiabilities', container()),
  account('LiabilitiesVat_Special:3.80', 'LiabilitiesVat Special (3.8%)', 'VatOnLiabilities', { parentNumber: '8001', vat: vat(3.8) }),
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
