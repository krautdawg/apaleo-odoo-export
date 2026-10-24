import { formatCents } from '../../src/core/money.js';
import type { LedgerLine, LedgerTax } from '../../src/core/source.js';

/** A tax entry whose precise amount is the whole cents, as fabricated fixtures have it. */
export function tax(vatType: string, percent: number, amountCents: number, amountPrecise = formatCents(amountCents)): LedgerTax {
  return { vatType, percent, amountPrecise, amountCents };
}

/**
 * A valid ledger line (a 10 % accommodation charge of 110.00) with the given fields
 * replaced. Unless given, `netPrecise` is the whole cents of `netCents`.
 */
export function ledgerLine(overrides: Partial<LedgerLine> = {}): LedgerLine {
  const netCents = overrides.netCents ?? 10_000;
  return {
    businessDate: '2026-09-14',
    postedAt: '2026-09-14T15:40:00Z',
    debit: { number: 'BSP-ABCDEF-1_Receivables', name: 'Receivables for Reservation BSP-ABCDEF-1', type: 'Receivables', parentNumber: '1200' },
    credit: { number: 'RevenueAccommodation_VeryReduced:10.00', name: 'Revenues Accommodation (10%)', type: 'Revenues', parentNumber: '5000' },
    command: 'PostCharge',
    currency: 'EUR',
    grossCents: 11_000,
    netPrecise: formatCents(netCents),
    netCents,
    taxes: [tax('VeryReduced', 10, 1_000)],
    receipt: { type: 'Reservation', number: 'BSP-ABCDEF-1-V1' },
    reference: 'BSP-ABCDEF-1',
    referenceType: 'Guest',
    sourceEntryNumber: 'BSPE0001',
    source: 'test',
    ...overrides,
  };
}
