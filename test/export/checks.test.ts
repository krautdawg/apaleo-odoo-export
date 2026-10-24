import { describe, expect, it } from 'vitest';
import type { LocalDate } from '../../src/core/date.js';
import type { AccountTotals, LedgerLine } from '../../src/core/source.js';
import { checkAccountMovements, checkAggregates, checkConservation, checkFoodRate, checkTaxRates, checkVatByRate, plausibilityFindings, type CheckOptions } from '../../src/export/index.js';
import { buildBookings, type PostingResult } from '../../src/posting/index.js';
import { ChartIndex } from '../../src/core/chart.js';
import { BSP, LIVE_DAY, LIVE_PROPERTIES, loadLiveData } from '../helpers/apaleo.js';
import { vieMapping } from '../helpers/live-mapping.js';
import { DE_TURN_OF_YEAR } from '../helpers/de-month.js';
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

describe('German special-case warnings for a month', () => {
  const breakfast = (name: string, date: LocalDate, percent: 5 | 7 | 16 | 19, number = 'RevenueBreakfast_Normal:19.00') =>
    charge({
      businessDate: date,
      credit: { number, name, type: 'Revenues', parentNumber: 'RevenueBreakfast' },
      grossCents: 2_000 + percent * 20,
      netCents: 2_000,
      netPrecise: '20',
      taxes: germanTax(percent, percent * 20),
    });

  it('Food at 19 % in 2026: a breakfast line on 2026-09-14 on "Frühstück" at 19 % gives W-FOOD-RATE naming the day, the account, 19 % and 7 % for Speisen from 2026-01-01', () => {
    const findings = checkFoodRate([breakfast('Frühstück', '2026-09-14', 19)]);
    expect(findings.map((f) => [f.code, f.value])).toEqual([['W-FOOD-RATE', '2026-09-14']]);
    expect(findings[0]?.message).toContain('on 2026-09-14 apaleo booked food revenue on RevenueBreakfast_Normal:19.00 ("Frühstück") at 19 %');
    expect(findings[0]?.message).toContain('Speisen are taxed at 7 % for services from 2026-01-01 (Steueränderungsgesetz 2025), so 7 % is expected on 2026-09-14');
    expect(findings[0]?.message).toContain('The file is written with the rate apaleo charged');
  });

  it('Drinks are not food: "Getränke Restaurant" at 19 % on 2026-09-14 raises no W-FOOD-RATE, nor does apaleo\'s "Revenues Food and beverages (19%)"', () => {
    expect(checkFoodRate([breakfast('Getränke Restaurant', '2026-09-14', 19)])).toEqual([]);
    expect(checkFoodRate([charge({ businessDate: '2026-09-14', credit: ACCOUNTS.food19, grossCents: 2_380, netCents: 2_000, netPrecise: '20', taxes: germanTax(19, 380) })])).toEqual([]);
  });

  it('Messen and Interessentenpaket are not food: no W-FOOD-RATE for "Zuschlag Messen" or "Interessentenpaket" at 19 % in 2026, but one for "Abendessen" and "Mittagessen"', () => {
    expect(checkFoodRate([breakfast('Zuschlag Messen', '2026-09-14', 19)])).toEqual([]);
    expect(checkFoodRate([breakfast('Interessentenpaket', '2026-09-14', 19)])).toEqual([]);
    expect(checkFoodRate([breakfast('Abendessen', '2026-09-14', 19)]).map((f) => f.code)).toEqual(['W-FOOD-RATE']);
    expect(checkFoodRate([breakfast('Mittagessen', '2026-09-15', 19)]).map((f) => f.code)).toEqual(['W-FOOD-RATE']);
  });

  it('warns for food at 7 % before 2026-01-01, never for food at the rate of its day or without tax, and once per day for several lines and accounts', () => {
    expect(checkFoodRate([breakfast('Frühstück (7%)', '2025-12-31', 7, 'RevenueBreakfast_Reduced:7.00')]).map((f) => f.value)).toEqual(['2025-12-31']);
    expect(checkFoodRate([breakfast('Frühstück', '2025-12-31', 19), breakfast('Frühstück', '2026-01-01', 7)])).toEqual([]);
    expect(checkFoodRate([breakfast('Frühstück', '2026-09-14', 7), charge({ businessDate: '2026-09-14', credit: { number: 'F0', name: 'Frühstück', type: 'Revenues' }, taxes: [] })])).toEqual([]);
    const day = checkFoodRate([
      breakfast('Frühstück', '2026-09-14', 19),
      breakfast('Frühstück', '2026-09-14', 19),
      breakfast('Halbpension', '2026-09-14', 19, 'HP_Normal:19.00'),
      { ...breakfast('Frühstück', '2026-09-15', 19), debit: { number: 'RevenueBreakfast_Normal:19.00', name: 'Frühstück', type: 'Revenues' }, credit: ACCOUNTS.receivables },
    ]);
    expect(day.map((f) => f.value)).toEqual(['2026-09-14', '2026-09-15']);
    expect(day[0]?.message).toContain('on HP_Normal:19.00 ("Halbpension") at 19 %, RevenueBreakfast_Normal:19.00 ("Frühstück") at 19 %');
  });

  it('Food rate by the day of the service: 7 % on 2023-06-15 and 5 % on 2020-09-01 raise nothing, 19 % on those days and 7 % on 2025-06-15 warn with the rate of the day', () => {
    expect(checkFoodRate([breakfast('Frühstück (7%)', '2023-06-15', 7, 'RevenueBreakfast_Reduced:7.00')])).toEqual([]);
    expect(checkFoodRate([breakfast('Frühstück (5%)', '2020-09-01', 5, 'RevenueBreakfast_Reduced:5.00')])).toEqual([]);
    expect(checkFoodRate([breakfast('Frühstück', '2020-06-30', 19), breakfast('Frühstück', '2024-01-01', 19), breakfast('Frühstück', '2025-06-15', 19)])).toEqual([]);
    const wrong = checkFoodRate([
      breakfast('Frühstück', '2023-06-15', 19),
      breakfast('Frühstück', '2020-09-01', 16),
      breakfast('Frühstück (7%)', '2025-06-15', 7, 'RevenueBreakfast_Reduced:7.00'),
      breakfast('Frühstück (7%)', '2020-06-30', 7, 'RevenueBreakfast_Reduced:7.00'),
    ]);
    expect(wrong.map((f) => f.value)).toEqual(['2020-06-30', '2020-09-01', '2023-06-15', '2025-06-15']);
    expect(wrong[0]?.message).toContain('Speisen are taxed at 19 % for services until 2020-06-30, so 19 % is expected on 2020-06-30');
    expect(wrong[1]?.message).toContain('Speisen are taxed at 5 % for services from 2020-07-01 to 2020-12-31 (Corona-Steuerhilfegesetz)');
    expect(wrong[2]?.message).toContain('Speisen are taxed at 7 % for services from 2021-01-01 to 2023-12-31 (Corona-Steuerhilfegesetz), so 7 % is expected on 2023-06-15');
    expect(wrong[3]?.message).toContain('Speisen are taxed at 19 % for services from 2024-01-01 to 2025-12-31, so 19 % is expected on 2025-06-15');
  });

  it('Food rate around the change: the turn-of-year fixture raises no W-FOOD-RATE, the same lines with swapped rates raise it once per day', () => {
    const lines = DE_TURN_OF_YEAR.ledger[BSP] ?? [];
    expect(lines.map((line) => [line.businessDate, line.credit.name, line.taxes[0]?.percent])).toEqual([
      ['2025-12-31', 'Frühstück (19%)', 19],
      ['2026-01-01', 'Frühstück (7%)', 7],
    ]);
    expect(checkFoodRate(lines)).toEqual([]);
    const [before, after] = lines as [LedgerLine, LedgerLine];
    const swapped = [{ ...after, businessDate: before.businessDate }, { ...before, businessDate: after.businessDate }];
    expect(checkFoodRate(swapped).map((f) => [f.code, f.value])).toEqual([
      ['W-FOOD-RATE', '2025-12-31'],
      ['W-FOOD-RATE', '2026-01-01'],
    ]);
  });
});
