import { describe, expect, it } from 'vitest';
import type { AccountTotals } from '../../src/core/source.js';
import { checkAccountMovements, checkAggregates, checkConservation, checkTaxRates, checkVatByRate, plausibilityFindings, type CheckOptions } from '../../src/export/index.js';
import { buildBookings, type PostingResult } from '../../src/posting/index.js';
import { ChartIndex } from '../../src/core/chart.js';
import { BSP, LIVE_DAY, LIVE_PROPERTIES, loadLiveData } from '../helpers/apaleo.js';
import { vieMapping } from '../helpers/live-mapping.js';
import { FakeSource } from '../helpers/fake-source.js';
import { odooMovements } from '../../src/odoo/index.js';
import {
  ACCOUNTS,
  BEISPIEL,
  BEISPIEL_CHART as CHART,
  BEISPIEL_MAPPING,
  CHART as GERMAN,
  LEDGER,
  OPTIONS as POSTING_OPTIONS,
  SKR03_MAPPING,
  charge,
  germanTax,
  post as postGerman,
} from '../helpers/posting.js';

const OPTIONS: CheckOptions = { mapping: BEISPIEL_MAPPING, chart: CHART, movements: odooMovements };
const AT10 = 'account_tax_template_sales_10_code029';
const AT20 = 'account_tax_template_sales_20_code022';
const post = (lines: typeof LEDGER) => buildBookings(lines, BEISPIEL_MAPPING, CHART, POSTING_OPTIONS);
const SEPTEMBER = { from: '2026-09-01', to: '2026-09-30' } as const;

function must<T>(value: T | undefined): T {
  if (value === undefined) throw new Error('fixture value missing');
  return value;
}

/** The fixture month's posting result with a defect applied to copies of its bookings and findings. */
function withDefect(defect: (result: PostingResult) => void): PostingResult {
  const correct = post(LEDGER);
  // The skipped lines stay the ledger's own objects: the checks match them by identity.
  const result = { ...correct, bookings: structuredClone(correct.bookings), findings: [...correct.findings] };
  defect(result);
  return result;
}

describe('plausibility checks on the fixture month', () => {
  it('find nothing in a correct posting run', () => {
    expect(plausibilityFindings(LEDGER, post(LEDGER), OPTIONS)).toEqual([]);
  });
});

describe('one rate per Odoo tax (E-TAX-RATES)', () => {
  it('finds nothing when every tax has one rate, also with bookings without tax', () => {
    expect(checkTaxRates(LEDGER, post(LEDGER), OPTIONS)).toEqual([]);
  });

  it('names the tax, its rates in order and the mapping rows when one tax carries two rates', () => {
    const result = withDefect((r) => {
      for (const booking of r.bookings) if (booking.vat?.taxRef === AT20) booking.vat.taxRef = AT10;
    });
    const [finding, ...rest] = checkTaxRates(LEDGER, result, OPTIONS);
    expect(rest).toEqual([]);
    expect(finding).toMatchObject({ code: 'E-TAX-RATES', field: 'odoo_tax', value: AT10 });
    expect(finding?.message).toMatch(new RegExp(`^the tax ${AT10} is booked at 10 % and 20 % in this file \\(lines? [\\d, ]+ of the mapping file\\)`));
    expect(finding?.message).toContain('a tax has one rate in the accounting program');
    expect(finding?.message).toContain('No file was written');
  });
});

describe('conservation (E-CONSERVATION)', () => {
  it('is raised when a ledger line is neither booked nor skipped', () => {
    const result = withDefect((r) => void r.bookings.splice(0, 1));
    const [finding, ...rest] = checkConservation(LEDGER, result);
    expect(rest).toEqual([]);
    expect(finding?.code).toBe('E-CONSERVATION');
    expect(finding?.message).toContain('the 29 apaleo lines move 2154.10 (absolute gross), but the 23 bookings move 1608.40 and the 5 skipped lines 325.70');
    expect(finding?.message).toContain('so 220.00 would be lost or doubled');
  });

  it('is raised when a line is booked twice', () => {
    const result = withDefect((r) => void r.bookings.push(structuredClone(must(r.bookings[0]))));
    expect(checkConservation(LEDGER, result).map((f) => f.code)).toEqual(['E-CONSERVATION']);
  });
});

/** The 98.00 logis charge of 2026-09-14: debit 2000, credit 4010 with the 10 % tax on the credit side, apaleo tax 8.91. */
const logis = (r: PostingResult) => must(r.bookings.find((b) => b.businessDate === '2026-09-14' && b.credit.account === '4010'));

describe('account movement per day (E-ACCOUNT-BALANCE)', () => {
  it('Side bug is caught: debit and credit account swapped names the day, the Odoo account and both amounts', () => {
    const result = withDefect((r) => {
      const booking = logis(r);
      [booking.debit, booking.credit] = [booking.credit, booking.debit];
      if (booking.vat) booking.vat.side = 'debit';
    });
    const findings = checkAccountMovements(LEDGER, result, OPTIONS);
    expect(findings.map((f) => [f.code, f.value])).toEqual([
      ['E-ACCOUNT-BALANCE', '2000'],
      ['E-ACCOUNT-BALANCE', '4010'],
    ]);
    expect(findings[0]?.message).toContain('on 2026-09-14 account 2000 moves -54.00 in the bookings, but the apaleo lines mapped to it move 142.00');
    expect(findings[1]?.message).toContain('on 2026-09-14 account 4010 moves 89.09 in the bookings, but the apaleo lines mapped to it move -89.09 (Soll positive, Haben negative)');
  });

  it('catches a wrong account, a lost tax and a booking on the wrong day', () => {
    const wrong = withDefect((r) => void (logis(r).credit.account = '4020'));
    expect(checkAccountMovements(LEDGER, wrong, OPTIONS).map((f) => f.value)).toEqual(['4010', '4020']);
    const untaxed = withDefect((r) => void delete logis(r).vat);
    expect(checkAccountMovements(LEDGER, untaxed, OPTIONS).map((f) => f.value)).toEqual(['4010']);
    const moved = withDefect((r) => void (must(r.bookings[0]).businessDate = '2026-09-15'));
    expect(checkAccountMovements(LEDGER, moved, OPTIONS).map((f) => f.message.slice(0, 13))).toContain('on 2026-09-14');
  });
});

describe('tax per rate (E-VAT-TOTAL)', () => {
  const drinks = (r: PostingResult) => must(r.bookings.find((b) => b.credit.account === '4030' && b.grossCents === 2_400));

  it("compares apaleo's tax the bookings carry with apaleo's per-line taxes, deposits included", () => {
    expect(checkVatByRate(LEDGER, post(LEDGER), OPTIONS)).toEqual([]);
  });

  it("is raised for 20 % when the bookings carry less tax than apaleo charged, naming both amounts and apaleo's precise total", () => {
    const result = withDefect((r) => void (must(drinks(r).vat).apaleoTaxCents = 398));
    const findings = checkVatByRate(LEDGER, result, OPTIONS);
    expect(findings.map((f) => [f.code, f.value])).toEqual([['E-VAT-TOTAL', '20']]);
    expect(findings[0]?.message).toContain(
      'at 20 % the bookings carry 7.65 tax, but apaleo charged 7.67 as the sum of its per-line tax rounded to cents (difference apaleo minus bookings 0.02, the rounding total allows 0.00)',
    );
    expect(findings[0]?.message).toContain("apaleo's precise total is 7.66666667; its per-line rounding (0.00333333) is no error");
  });

  it('is raised per rate when a booking carries the wrong rate', () => {
    const result = withDefect((r) => void (must(logis(r).vat).percent = 20));
    expect(checkVatByRate(LEDGER, result, OPTIONS).map((f) => [f.code, f.value])).toEqual([
      ['E-VAT-TOTAL', '10'],
      ['E-VAT-TOTAL', '20'],
    ]);
  });

  it('allows one cent per rounding difference accepted at the same rate', () => {
    const offByOne = (roundings: ReadonlyMap<number, number>) =>
      withDefect((r) => {
        r.vatRoundingByRate = roundings;
        must(drinks(r).vat).apaleoTaxCents = 401;
      });
    expect(checkVatByRate(LEDGER, offByOne(new Map([[20, 1]])), OPTIONS)).toEqual([]);
    expect(checkVatByRate(LEDGER, offByOne(new Map()), OPTIONS).map((f) => f.code)).toEqual(['E-VAT-TOTAL']);
    // Roundings at 10 % do not excuse a difference at 20 %.
    const otherRate = checkVatByRate(LEDGER, offByOne(new Map([[10, 2]])), OPTIONS);
    expect(otherRate.map((f) => [f.code, f.value])).toEqual([['E-VAT-TOTAL', '20']]);
    expect(otherRate[0]?.message).toContain('the rounding total allows 0.00');
  });

  describe('at the German rates', () => {
    // 12.59 at 19 %: 12.59 × 19 / 119 = 2.0101 → 2.01, twice 4.02.
    const minibar = (sourceEntryNumber: string) => charge({ credit: ACCOUNTS.other19, grossCents: 1_259, netCents: 1_058, taxes: germanTax(19, 201), sourceEntryNumber });
    const lines = [minibar('M1'), minibar('M2')];
    const german: CheckOptions = { mapping: SKR03_MAPPING, chart: GERMAN, movements: odooMovements };
    const germanDefect = (defect: (result: PostingResult) => void) => {
      const result = postGerman(lines);
      const copy = { ...result, bookings: structuredClone(result.bookings) };
      defect(copy);
      return copy;
    };

    it("Tax total per rate: bookings at 19 % with 4.00 apaleo tax against apaleo's 4.02 give E-VAT-TOTAL with both amounts and the precise total", () => {
      expect(checkVatByRate(lines, postGerman(lines), german)).toEqual([]);
      const findings = checkVatByRate(lines, germanDefect((r) => void (must(r.bookings[0]?.vat).apaleoTaxCents = 199)), german);
      expect(findings.map((f) => [f.code, f.value])).toEqual([['E-VAT-TOTAL', '19']]);
      expect(findings[0]?.message).toContain('at 19 % the bookings carry 4.00 tax, but apaleo charged 4.02');
      expect(findings[0]?.message).toContain("apaleo's precise total is 4.02");
    });

    it('Roundings at another rate: two accepted roundings at 7 % do not excuse two cents more tax at 19 %', () => {
      const result = germanDefect((r) => {
        r.vatRoundingByRate = new Map([[7, 2]]);
        must(r.bookings[0]?.vat).apaleoTaxCents = 203;
      });
      expect(checkVatByRate(lines, result, german).map((f) => [f.code, f.value])).toEqual([['E-VAT-TOTAL', '19']]);
    });
  });

  it("Line rounding is not an error: the recorded VIE day, where the bookings carry 7.74 at 10 % and apaleo's precise total is 7.74545454", async () => {
    const live = await loadLiveData();
    const lines = (live.ledger.VIE ?? []).filter((line) => line.businessDate === LIVE_DAY);
    const chart = new ChartIndex(live.charts.VIE ?? []);
    const mapping = vieMapping();
    const result = buildBookings(lines, mapping, chart, POSTING_OPTIONS);
    expect(result.summary.revenueByRate.find((r) => r.ratePercent === 10)).toMatchObject({ vatCents: 774, apaleoVat: '7.74545454' });
    expect(plausibilityFindings(lines, result, { mapping, chart, movements: odooMovements })).toEqual([]);
  });
});

describe('aggregate check (W-AGGREGATE-DIFF)', () => {
  it('asks for apaleo totals once per business day and finds the fixture days matching', async () => {
    const source = new FakeSource(structuredClone(BEISPIEL));
    expect(await checkAggregates(source, BSP, { from: '2026-09-14', to: '2026-09-17' }, LEDGER, CHART)).toEqual([]);
    expect(source.calls).toEqual(['2026-09-14', '2026-09-15', '2026-09-16', '2026-09-17'].map((day) => `getAccountTotals BSP ${day}`));
  });

  it('warns about an account whose balance differs, naming both balances and the basis', async () => {
    const data = structuredClone(BEISPIEL);
    const day = data.totals?.[BSP]?.find((t) => t.businessDate === '2026-09-14') as AccountTotals;
    must(day.accounts.find((a) => a.account.number === 'RevenueAccommodation_VeryReduced:10.00')).balance.value = '-150.00';
    must(day.accounts.find((a) => a.account.number === '1102')).balance.value = '219.00';
    const findings = await checkAggregates(new FakeSource(data), BSP, SEPTEMBER, LEDGER, CHART);
    expect(findings.map((f) => [f.code, f.value])).toEqual([
      ['W-AGGREGATE-DIFF', '1102'],
      ['W-AGGREGATE-DIFF', 'RevenueAccommodation_VeryReduced:10.00'],
    ]);
    expect(findings[0]?.message).toBe(
      "on 2026-09-14 apaleo's daily aggregate for account 1102 (Payments) has the balance 219.00, but the ledger lines of that day " +
        'add up to 220.00 (balance debit minus credit, from the gross amounts). Compare the day in apaleo; the file is written anyway',
    );
    expect(findings[1]?.message).toContain('has the balance -150.00, but the ledger lines of that day add up to -89.09 (balance debit minus credit, from the precise net amounts)');
  });

  it('finds every account of the recorded BER and VIE days matching', async () => {
    const live = await loadLiveData();
    for (const property of LIVE_PROPERTIES) {
      const chart = new ChartIndex(live.charts[property] ?? []);
      const period = { from: '2026-10-21', to: '2026-10-22' } as const;
      expect(await checkAggregates(new FakeSource(live), property, period, live.ledger[property] ?? [], chart), property).toEqual([]);
    }
  });
});
