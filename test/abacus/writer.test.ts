import { describe, expect, it } from 'vitest';
import { renderXmlBuchungen, xmlBuchungenFileName, AbacusValidationError } from '../../src/abacus/index.js';
import { abacusOptions, accommodation, block, changedLines, childNames, mwst, payment, transaction, value, values } from '../helpers/abacus.js';

const render = (...args: Parameters<typeof renderXmlBuchungen>) => renderXmlBuchungen(...args).text;

describe('AbaConnect container', () => {
  it('Empty month: declaration, TaskCount 1, the Parameter block with the Mandant and no Transaction', () => {
    expect(render([], abacusOptions())).toBe(
      [
        "<?xml version='1.0' encoding='UTF-8'?>",
        '<AbaConnectContainer>',
        '  <TaskCount>1</TaskCount>',
        '  <Task>',
        '    <Parameter>',
        '      <Application>FIBU</Application>',
        '      <Id>XML Buchungen</Id>',
        '      <MapId>AbaDefault</MapId>',
        '      <Version>2015.00</Version>',
        '      <Mandant>1234</Mandant>',
        '    </Parameter>',
        '  </Task>',
        '</AbaConnectContainer>',
        '',
      ].join('\n'),
    );
  });

  it('writes one Transaction per booking in file order, numbered from 1, each with one Entry mode SAVE', () => {
    const xml = render([accommodation(), payment(), accommodation()], abacusOptions());
    expect([...xml.matchAll(/<Transaction id='(\d+)'>\n {6}<Entry mode='SAVE'>/g)].map((m) => m[1])).toEqual(['1', '2', '3']);
    expect(xml.match(/<Entry /g)).toHaveLength(3);
    expect(childNames(block(xml, 'Task'))).toEqual(['Parameter', 'Transaction', 'Transaction', 'Transaction']);
  });

  it('Interface version from the config: only the Version line changes', () => {
    const bookings = [accommodation(), payment()];
    expect(changedLines(render(bookings, abacusOptions()), render(bookings, abacusOptions({ version: '2024.00' })))).toEqual([
      [9, '<Version>2015.00</Version>', '<Version>2024.00</Version>'],
    ]);
  });
});

describe('Einzelbuchung layout', () => {
  it('Accommodation at 3.8 %: both blocks in the documented element order with the spec values', () => {
    const entry = transaction(render([accommodation()], abacusOptions()), 1);
    const collective = block(entry, 'CollectiveInformation');
    const single = block(entry, 'SingleInformation');
    expect(childNames(block(entry, 'Entry'))).toEqual(['CollectiveInformation', 'SingleInformation']);
    expect(childNames(collective)).toEqual([
      'EntryLevel',
      'EntryType',
      'Type',
      'DebitCredit',
      'Client',
      'Division',
      'KeyCurrency',
      'EntryDate',
      'AmountData',
      'KeyAmount',
      'Account',
      'TaxAccount',
      'Text1',
      'Text2',
      'DocumentNumber',
      'SingleCount',
    ]);
    expect(childNames(single)).toEqual(['Type', 'DebitCredit', 'EntryDate', 'AmountData', 'KeyAmount', 'Account', 'TaxAccount', 'Text1', 'Text2', 'DocumentNumber', 'TaxData']);
    const leaves = (xml: string, tags: string[]) => Object.fromEntries(tags.map((tag) => [tag, value(xml, tag)]));
    expect(leaves(collective, ['EntryLevel', 'EntryType', 'Type', 'DebitCredit', 'Client', 'Division', 'KeyCurrency', 'EntryDate', 'Currency', 'Amount', 'KeyAmount', 'Account', 'TaxAccount', 'Text1', 'Text2', 'DocumentNumber', 'SingleCount'])).toEqual({
      EntryLevel: 'A',
      EntryType: 'S',
      Type: 'Normal',
      DebitCredit: 'D',
      Client: '1234',
      Division: '0',
      KeyCurrency: 'CHF',
      EntryDate: '2026-10-14',
      Currency: 'CHF',
      Amount: '207.60',
      KeyAmount: '207.60',
      Account: '1101',
      TaxAccount: '2200',
      Text1: 'Erlös Beherbergung',
      Text2: 'BSP-2026-0042',
      DocumentNumber: '1001000001',
      SingleCount: '0',
    });
    const singleOwn = single.slice(0, single.indexOf('<TaxData'));
    expect(leaves(singleOwn, ['Type', 'DebitCredit', 'EntryDate', 'Currency', 'Amount', 'KeyAmount', 'Account', 'TaxAccount', 'DocumentNumber'])).toEqual({
      Type: 'Normal',
      DebitCredit: 'D',
      EntryDate: '2026-10-14',
      Currency: 'CHF',
      Amount: '207.60',
      KeyAmount: '207.60',
      Account: '3400',
      TaxAccount: '3400',
      DocumentNumber: '1001000001',
    });
    const taxData = block(single, 'TaxData');
    expect(childNames(taxData)).toEqual(['TaxIncluded', 'TaxType', 'UseCode', 'AmountData', 'KeyAmount', 'TaxRate', 'TaxCoefficient', 'Country', 'TaxCode', 'FlatRate']);
    expect(leaves(taxData, ['TaxIncluded', 'TaxType', 'UseCode', 'Currency', 'Amount', 'KeyAmount', 'TaxRate', 'TaxCoefficient', 'Country', 'TaxCode', 'FlatRate'])).toEqual({
      TaxIncluded: 'I',
      TaxType: '0',
      UseCode: '0',
      Currency: 'CHF',
      Amount: '0.00',
      KeyAmount: '-7.60',
      TaxRate: '3.8',
      TaxCoefficient: '100',
      Country: 'CH',
      TaxCode: '313',
      FlatRate: '0',
    });
    expect(entry).toContain("<AmountData mode='SAVE'>");
    expect(entry).toContain("<TaxData mode='SAVE'>");
    expect(entry).toContain("<CollectiveInformation mode='SAVE'>");
    expect(entry).toContain("<SingleInformation mode='SAVE'>");
  });

  it('Payment without MWST: Amount 120.00 and TaxAccount 0 in both blocks, no TaxData and no BookingLevel1', () => {
    const entry = transaction(render([payment()], abacusOptions()), 1);
    expect(values(entry, 'Amount')).toEqual(['120.00', '120.00']);
    expect(values(entry, 'TaxAccount')).toEqual(['0', '0']);
    expect(values(entry, 'Account')).toEqual(['1090', '1101']);
    expect(entry).not.toContain('TaxData');
    expect(entry).not.toContain('BookingLevel1');
  });

  it('Allowance: DebitCredit C in both blocks, positive amounts and a positive tax', () => {
    const entry = transaction(render([accommodation({ debitCredit: 'C', grossCents: 2_076, tax: mwst('313', 3.8, 76) })], abacusOptions()), 1);
    expect(values(entry, 'DebitCredit')).toEqual(['C', 'C']);
    const taxData = block(entry, 'TaxData');
    expect(values(entry.replace(taxData, ''), 'Amount')).toEqual(['20.76', '20.76']);
    expect([value(taxData, 'Amount'), value(taxData, 'KeyAmount')]).toEqual(['0.00', '0.76']);
  });

  it('Kostenstelle: BookingLevel1 after TaxAccount in SingleInformation only', () => {
    const entry = transaction(render([accommodation({ singleAccount: '3200', tax: mwst('311', 8.1, -810), grossCents: 10_810, kost: '10' })], abacusOptions()), 1);
    const single = block(entry, 'SingleInformation');
    expect(single).toContain('<TaxAccount>3200</TaxAccount>\n          <BookingLevel1>10</BookingLevel1>\n');
    expect(block(entry, 'CollectiveInformation')).not.toContain('BookingLevel1');
  });

  it('leaves out Text2 when it is empty after sanitising, in both blocks', () => {
    const entry = transaction(render([payment({ text2: ' \n ' }), payment({ text2: undefined as never })], abacusOptions()), 1);
    expect(entry).not.toContain('Text2');
    expect(values(entry, 'Text1')).toEqual(['Zahlung Visa', 'Zahlung Visa']);
  });

  it('writes the Geschäftsbereich into Division and the Leitwährung into every Currency and KeyCurrency', () => {
    const xml = render([accommodation(), payment()], abacusOptions({ geschaeftsbereich: 12, leitwaehrung: 'EUR' }));
    expect(values(xml, 'Division')).toEqual(['12', '12']);
    expect(new Set([...values(xml, 'Currency'), ...values(xml, 'KeyCurrency')])).toEqual(new Set(['EUR']));
  });
});

describe('MWST data', () => {
  it('Tax amount in the Leitwährung: Amount 0.00 and the signed tax in KeyAmount', () => {
    const taxData = block(render([accommodation({ singleAccount: '3200', grossCents: 10_810, tax: mwst('311', 8.1, -810) })], abacusOptions()), 'TaxData');
    expect(taxData).toContain('<Currency>CHF</Currency>\n              <Amount>0.00</Amount>');
    expect(value(taxData, 'KeyAmount')).toBe('-8.10');
  });

  it('Vereinnahmte Entgelte: UseCode 1 and the Hilfskonto in the Collective TaxAccount', () => {
    const entry = transaction(render([accommodation()], abacusOptions({ abrechnungsart: 'vereinnahmt' })), 1);
    expect(value(block(entry, 'TaxData'), 'UseCode')).toBe('1');
    expect(values(entry, 'TaxAccount')).toEqual(['2202', '3400']);
  });

  it('Untaxed revenue with an MWST-Code: TaxIncluded I, rate 0, code 400 and both tax amounts 0.00', () => {
    const taxData = block(render([accommodation({ singleAccount: '3600', tax: mwst('400', 0, 0) })], abacusOptions()), 'TaxData');
    expect([value(taxData, 'TaxIncluded'), value(taxData, 'TaxRate'), value(taxData, 'TaxCode'), value(taxData, 'Amount'), value(taxData, 'KeyAmount')]).toEqual(['I', '0', '400', '0.00', '0.00']);
  });

  it('Kurtaxe with a Ziffer-910 code: TaxIncluded of TAX_INCLUDED_AT_RATE_ZERO, rate 0, code 491', () => {
    const taxData = block(render([accommodation({ singleAccount: '2210', tax: mwst('491', 0, 0), text1: 'Kurtaxe' })], abacusOptions()), 'TaxData');
    expect([value(taxData, 'TaxIncluded'), value(taxData, 'TaxRate'), value(taxData, 'TaxCode'), value(taxData, 'KeyAmount')]).toEqual(['I', '0', '491', '0.00']);
  });

  it('Rate format: 8.1 is written 8.1', () => {
    expect(value(render([accommodation({ tax: mwst('311', 8.1, -1_556), grossCents: 20_760 })], abacusOptions()), 'TaxRate')).toBe('8.1');
  });
});

describe('Belegnummer and number formats', () => {
  it('numbers the bookings of a file in file order and writes the same number into both blocks', () => {
    const january = abacusOptions({ from: '2027-01-01', to: '2027-01-31' });
    const xml = render([payment({ businessDate: '2027-01-05' }), payment({ businessDate: '2027-01-05' }), payment({ businessDate: '2027-01-31' })], january);
    expect(values(xml, 'DocumentNumber')).toEqual(['0101000001', '0101000001', '0101000002', '0101000002', '0101000003', '0101000003']);
  });

  it('Rappen amounts: 1234.55 and 0.01', () => {
    const xml = render([payment({ grossCents: 123_455 }), payment({ grossCents: 1 })], abacusOptions());
    expect(values(xml, 'KeyAmount')).toEqual(['1234.55', '1234.55', '0.01', '0.01']);
  });
});

describe('File encoding and escaping', () => {
  it('Umlauts and an ampersand: escaped text, UTF-8 bytes, no BOM, LF line ends and single-quoted attributes', () => {
    const { text, bytes } = renderXmlBuchungen([payment({ text1: 'Getränke & Frühstück <Bar>' })], abacusOptions());
    expect(text).toContain('<Text1>Getränke &amp; Frühstück &lt;Bar&gt;</Text1>');
    const buffer = Buffer.from(bytes);
    expect(buffer.subarray(0, 5).toString('latin1')).toBe('<?xml');
    expect(buffer.includes(Buffer.from([0xc3, 0xa4]))).toBe(true);
    expect(buffer.includes(Buffer.from([0xc3, 0xbc]))).toBe(true);
    expect(buffer.includes(0x0d)).toBe(false);
    expect(buffer.toString('utf8')).toBe(text);
    expect(text.endsWith('</AbaConnectContainer>\n')).toBe(true);
    expect(text).not.toMatch(/="/);
    expect(text.split('\n').every((line) => /^( {2})*\S/.test(line) || line === '')).toBe(true);
  });

  it('escapes apostrophes and quotes in text content', () => {
    expect(render([payment({ text1: `l'Hôtel "Seeblick"` })], abacusOptions())).toContain('<Text1>l&apos;Hôtel &quot;Seeblick&quot;</Text1>');
  });
});

describe('Text sanitising in the file', () => {
  it('Line break in a text: Zahlung Visa', () => {
    expect(values(render([payment({ text1: 'Zahlung\nVisa' })], abacusOptions()), 'Text1')).toEqual(['Zahlung Visa', 'Zahlung Visa']);
  });

  it('Long reference: the first 80 characters of Text2 in both blocks, one N-ABACUS-TRUNCATED naming the booking', () => {
    const text2 = `BSP-2026-0042-${'X'.repeat(81)}`;
    expect(text2).toHaveLength(95);
    const { text, notes } = renderXmlBuchungen([payment(), payment({ text2 })], abacusOptions());
    expect(values(transaction(text, 2), 'Text2')).toEqual([text2.slice(0, 80), text2.slice(0, 80)]);
    expect(notes.map((n) => [n.code, n.index, n.field])).toEqual([['N-ABACUS-TRUNCATED', 1, 'text2']]);
  });
});

describe('Deterministic file name and content', () => {
  it('File name: ABACUS_Buchungen_20261001-20261031_BSP.xml', () => {
    expect(xmlBuchungenFileName(abacusOptions())).toBe('ABACUS_Buchungen_20261001-20261031_BSP.xml');
    expect(xmlBuchungenFileName(abacusOptions(), 'BSP_DEMO')).toBe('ABACUS_Buchungen_20261001-20261031_BSP_DEMO.xml');
  });

  it('refuses a property id that cannot be part of a file name, and an invalid period', () => {
    expect(() => xmlBuchungenFileName(abacusOptions({ propertyId: 'B/SP' }))).toThrow(AbacusValidationError);
    expect(() => xmlBuchungenFileName(abacusOptions({ propertyId: 'B/SP' }))).toThrow(/E-ABACUS-FILE-NAME/);
    expect(() => xmlBuchungenFileName(abacusOptions({ from: '2026-11-01' }))).toThrow(/E-ABACUS-PERIOD/);
  });

  it('Same input twice: byte-identical results', () => {
    const bookings = [accommodation(), payment()];
    const first = renderXmlBuchungen(bookings, abacusOptions()).bytes;
    const second = renderXmlBuchungen(bookings.map((b) => ({ ...b })), abacusOptions()).bytes;
    expect(Buffer.from(first).equals(Buffer.from(second))).toBe(true);
  });
});
