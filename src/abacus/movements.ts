import type { AbacusBooking } from './types.js';

/**
 * The movement model of an Abacus booking (design decision 7): the Collective
 * account moves by the gross amount and the Single account by the gross amount
 * minus the MWST, each signed by its side from `DebitCredit` (Soll positive).
 * The MWST leg on the Steuerkonto is not part of it. With `D` the Collective
 * account is debited and the Single account credited, with `C` the reverse;
 * the signed tax (negative on a credited Single account) gives the net amount
 * of the Single account in both cases.
 */
export function abacusMovements(booking: Pick<AbacusBooking, 'collectiveAccount' | 'singleAccount' | 'debitCredit' | 'grossCents' | 'tax'>): [string, number][] {
  const sign = booking.debitCredit === 'D' ? 1 : -1;
  return [
    [booking.collectiveAccount, sign * booking.grossCents],
    [booking.singleAccount, -sign * booking.grossCents - (booking.tax?.taxCents ?? 0)],
  ];
}
