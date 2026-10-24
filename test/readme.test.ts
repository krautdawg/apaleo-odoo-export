import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { COMMANDS } from '../src/cli/commands/index.js';
import { ENV_OVERRIDES, SECRET_KEYS } from '../src/core/config.js';
import { APALEO_PERMISSIONS } from '../src/sources/apaleo/index.js';
import {
  PENDING_IMPORT,
  ROOT,
  checkCompatibilityClaims,
  checkPendingImport,
  checkPracticeTerms,
  checkQuotationMarks,
  commandPhrases,
  configPaths,
  kanzleiTestImports,
  readRepoFile,
  recordedTestImports,
} from './helpers/docs.js';

const README = readRepoFile('README.md');
/** The GitHub description and topics of the repository (o08 design decision 5). */
const REPO_DESCRIPTION = 'Kostenloser apaleo Odoo Export: Buchungssätze für die Odoo Buchhaltung aus apaleo, für Hotels in Deutschland (SKR03/SKR04). Open Source, MIT.';
const REPO_TOPICS = ['apaleo', 'odoo', 'odoo-accounting', 'apaleo-odoo', 'odoo-import', 'journal-entries', 'buchhaltung', 'hotel', 'hospitality', 'accounting', 'skr03', 'skr04', 'germany', 'deutschland', 'steuerberater', 'open-source'];
const ENGLISH_README = readRepoFile('README.en.md');
const MAINTAINERS = readRepoFile('docs/maintainers.md');
const GERMAN_TAGLINE = 'Kostenloser apaleo Odoo Export: Buchungssätze für die Odoo Buchhaltung aus apaleo, als Importdatei, Open Source';
const PRICE = '24-51 EUR pro Monat und Betrieb (je nach Anzahl der Betriebe), laut apaleo Store, Oktober 2026';
const ORIGIN_PROJECTS = ['](https://github.com/krautdawg/apaleo-datev-export)', '](https://github.com/krautdawg/apaleo-bmd-export)', '](https://github.com/krautdawg/apaleo-abacus-export)'];
/** The install block of the German quick start (s09 design decision 3), which CI runs. */
const INSTALL_BLOCK = [
  'git clone https://github.com/krautdawg/apaleo-odoo-export.git',
  'cd apaleo-odoo-export',
  'corepack enable',
  'pnpm install --frozen-lockfile',
  'pnpm build',
  'node dist/cli/main.js --help        # oder: pnpm link --global, dann apaleo-odoo --help',
];

/** The text from the start up to the first `## ` heading. */
const firstScreen = README.slice(0, README.search(/^## /m));
const headings = (text: string, level: string) => [...text.matchAll(new RegExp(`^${level} (.+)$`, 'gm'))].map((m) => m[1] ?? '');
/** The body of the section under a heading, up to the next heading of the same or a higher level. */
function section(text: string, heading: string): string {
  const start = text.indexOf(`${heading}\n`);
  if (start < 0) throw new Error(`missing section ${heading}`);
  const level = /^#+/.exec(heading)?.[0] ?? '##';
  const rest = text.slice(start + heading.length + 1);
  const end = rest.search(new RegExp(`^#{1,${level.length}} `, 'm'));
  return end < 0 ? rest : rest.slice(0, end);
}
/** The trimmed, non-empty lines of the first sh block in a text. */
const firstShellBlock = (text: string) =>
  (/```sh\n([\s\S]*?)```/.exec(text)?.[1] ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
const withoutComment = (line: string) => line.replace(/\s+#.*$/, '');

describe('README first screen', () => {
  it('opens with the H1, the link to the English README, the tagline, badges, the intro and the disclaimer notice before any install detail', () => {
    const [title = '', ...rest] = README.split('\n');
    expect(title).toMatch(/^# /);
    expect(title).toBe('# apaleo Odoo Export – kostenlos und Open Source');
    for (const term of ['apaleo Odoo Export', 'kostenlos', 'Open Source']) expect(title).toContain(term);
    expect(rest.find((line) => line.trim() !== '')).toContain('](README.en.md)');
    expect(firstScreen).toContain(GERMAN_TAGLINE);
    for (const badge of ['actions/workflows/ci.yml/badge.svg', 'licence-MIT', 'node.js-24']) expect(firstScreen).toContain(badge);
    expect(firstScreen).toMatch(/apaleo-odoo-export ist .*Hotels in Deutschland, die mit apaleo und Odoo arbeiten, und für ihren Steuerberater/);
    expect(firstScreen).toContain('Keine Gewähr, keine Steuerberatung');
    expect(firstScreen).toContain('Lass deine Kontenzuordnung von deinem Steuerberater prüfen');
    expect(firstScreen).toContain('](DISCLAIMER.md)');
    expect(firstScreen).not.toContain('git clone');
    expect(headings(README, '##')[0]).toBe('Was es macht');
    expect(section(README, '## Was es macht').match(/^- /gm)).toHaveLength(5);
  });

  it('Search terms in the first lines: the title, tagline and intro carry the terms people search for, in sentences', () => {
    const firstLines = firstScreen.split('**Stand:**')[0] ?? '';
    for (const term of ['apaleo', 'Odoo', 'apaleo Odoo Export', 'Odoo Buchhaltung', 'Buchungssätze', 'Buchungsjournal', 'Import', 'SKR03', 'SKR04', 'Steuerberater', 'Hotel', 'Deutschland', 'Connector', 'Open Source', 'kostenlos']) {
      expect(firstLines.toLowerCase(), term).toContain(term.toLowerCase());
    }
    expect(firstLines).not.toMatch(/\bBMD\b|Abacus|Schweiz|Österreich|Treuhänder|MWST/);
  });

  it('Visitor from a search: the first screen says in German what the tool is, shows the disclaimer notice and links the English README', () => {
    expect(firstScreen).toMatch(/kostenloser apaleo Odoo Export/);
    expect(firstScreen).toContain('Importdatei mit einem Buchungssatz pro Geschäftstag');
    expect(firstScreen).toContain('> **Keine Gewähr, keine Steuerberatung.**');
    expect(firstScreen.indexOf('](README.en.md)')).toBeLessThan(firstScreen.indexOf(GERMAN_TAGLINE));
  });

  it('Pending test import: says on the first screen that the file follows Odoo\'s documented import of journal entries and that a first test import with a Steuerberater is pending', () => {
    expect(kanzleiTestImports(recordedTestImports(MAINTAINERS))).toEqual([]);
    expect(firstScreen).toContain(`**Stand:** ${PENDING_IMPORT}`);
    expect(firstScreen).toContain('](docs/odoo-import.md)');
    expect(checkPendingImport('README.md', README, recordedTestImports(MAINTAINERS))).toEqual([]);
  });

  it('Claim without a recorded import: makes no claim beyond the recorded local Odoo runs', () => {
    const recorded = recordedTestImports(MAINTAINERS);
    expect(checkCompatibilityClaims('README.md', README, recorded)).toEqual([]);
    expect(checkCompatibilityClaims('README.md', `${README}\nDie Datei ist getestet mit Odoo 16.\n`, recorded)).toEqual([expect.stringMatching(/^README\.md: "getestet mit Odoo"/)]);
  });

  it('is German only, with the sections in order', () => {
    expect(headings(README, '##')).toEqual([
      'Was es macht',
      'Für wen',
      'Beispielausgabe ansehen',
      'Ohne apaleo ausprobieren',
      'Schnellstart',
      'Schnellstart mit Docker',
      'Befehle',
      'Konfiguration',
      'Was es nicht macht',
      'Vergleich mit kostenpflichtigen Connectoren',
      'Häufige Fragen',
      'Haftungsausschluss',
      'Mitmachen',
      'Lizenz',
    ]);
    expect(README).not.toMatch(/^#+ (Deutsch|English)$/m);
    expect(README).toMatch(/\bdu\b/);
  });
});

describe('README quick start', () => {
  it('has the five numbered steps in order', () => {
    const quickStart = section(README, '## Schnellstart');
    const numbered = [...quickStart.matchAll(/^(\d)\. \*\*(.+?)\*\*/gm)].map((m) => `${m[1]} ${m[2]}`);
    expect(numbered).toEqual(['1 apaleo Custom App anlegen.', '2 Installieren', '3 Kontenzuordnung anlegen', '4 Probelauf', '5 Export']);
    for (const command of ['init-mapping --property BSP --template skr03-hotel', 'export --month 2026-09 --dry-run', 'export --month 2026-09\n']) {
      expect(quickStart).toContain(command);
    }
  });

  it('marks the German install-from-source block for the readme-quickstart CI job', () => {
    expect(firstShellBlock(README.split('<!-- quickstart -->')[1] ?? '')).toEqual(INSTALL_BLOCK);
  });

  it('builds the Docker image locally and shows no dead-end install step', () => {
    expect(section(README, '## Schnellstart mit Docker')).toContain('docker compose -f docker-compose.example.yml build');
    expect(README).toContain('Es gibt noch kein npm-Paket und kein Container-Image zum Herunterladen. Du installierst aus dem Quellcode.');
    for (const text of [README, ENGLISH_README]) {
      expect(text).not.toMatch(/npx\s+apaleo-odoo/);
      expect(text).not.toContain('docker pull');
    }
  });

  it('links the example output and the demo', () => {
    expect(section(README, '## Beispielausgabe ansehen')).toContain('](docs/examples/)');
    expect(section(README, '## Ohne apaleo ausprobieren')).toContain('export --month 2026-09 --demo --dry-run');
  });

  it('lists every command in the commands table', () => {
    for (const phrase of commandPhrases(COMMANDS).keys()) {
      expect(section(README, '## Befehle'), phrase).toContain(`| \`${phrase}\` |`);
    }
  });
});

describe('README scope and comparison', () => {
  it('says what the tool does not do', () => {
    const limits = section(README, '## Was es nicht macht');
    for (const phrase of [
      'Keine Übertragung nach Odoo über die externe API',
      'von Hand mit dem Standardimport',
      'Kein Buchen: Die Buchungssätze kommen als Entwürfe an',
      'Keine Rechnungen, keine Partner (Kunden) und keine offenen Posten pro Partner',
      'Keine Zahlungen und kein Abgleich',
      'Keine Kostenstellen',
      'Keine PDF-Belege',
      'Gebühren der Zahlungsdienstleister',
      'Rückbuchungen (Chargebacks)',
      'Provisionen der Buchungsportale',
      'Keine Steuern auf Zahlungsbasis (Cash Basis)',
      'ohne Umrechnung',
      'Keine Vorlage für Österreich oder die Schweiz',
      'Weboberfläche',
      'gehosteter Dienst',
      'kein Odoo-Modul',
      'keine anderen Zielformate wie DATEV, BMD oder Abacus',
    ]) {
      expect(limits).toContain(phrase);
    }
  });

  it('Comparison table: compares with paid connectors on eight points, with the dated price and no vendor name', () => {
    const table = section(README, '## Vergleich mit kostenpflichtigen Connectoren');
    const rows = [...table.matchAll(/^\| ([^|]+?) \|/gm)].map((m) => m[1]?.trim());
    expect(rows).toEqual(
      expect.arrayContaining(['Preis', 'Betrieb', 'Einrichtung', 'Übertragung nach Odoo', 'Steuern in Odoo', 'Entwürfe oder gebucht', 'Support', 'Vorlagen für die Zuordnung']),
    );
    expect(table).toContain(PRICE);
    expect(table).toContain('Selbst betreiben heißt');
    for (const vendor of ['grman', 'afinconnector', 'hotecholution', 'omniboost', 'xconnect', 'odoo connector by', 'abacus connector by', 'bmd connector', 'datev connector']) {
      expect(README.toLowerCase(), vendor).not.toContain(vendor);
      expect(ENGLISH_README.toLowerCase(), vendor).not.toContain(vendor);
    }
  });

  it('names the origin projects in one sentence and links all three for DATEV, BMD and Abacus users', () => {
    const origin = README.split('\n').filter((line) => /^apaleo-odoo-export baut auf .* auf/.test(line));
    expect(origin).toHaveLength(1);
    for (const link of ORIGIN_PROJECTS) expect(origin[0]).toContain(link);
    expect(origin[0]).toMatch(/wer mit DATEV, BMD oder Abacus bucht/);
  });
});

describe('README FAQ', () => {
  const faq = section(README, '## Häufige Fragen');
  const answer = (question: string) => faq.split('\n').find((line) => line.startsWith(`**${question}**`)) ?? '';
  const QUESTIONS = {
    cost: 'Ist das ein kostenloser apaleo Odoo Connector?',
    data: 'Wohin gehen meine Daten?',
    versions: 'Welche Odoo-Versionen und Editionen gehen?',
    direct: 'Kann es direkt an Odoo übertragen, etwa über die externe API?',
    taxes: 'Rechnet Odoo die Umsatzsteuer, und warum weicht sie manchmal um einen Cent von apaleo ab?',
    testImport: 'Hat ein Steuerberater die Datei schon importiert?',
    undo: 'Kann ich einen Import rückgängig machen?',
    hotels: 'Mehrere Hotels?',
    switching: 'Ich nutze heute einen bezahlten Connector. Kann ich wechseln?',
    neighbours: 'Und Hotels in Österreich oder der Schweiz?',
    origins: 'Gibt es das auch für DATEV, BMD oder Abacus?',
  } as const;

  it('FAQ topics tested: answers every topic in one line, naming no vendor', () => {
    for (const question of Object.values(QUESTIONS)) expect(answer(question), question).not.toBe('');
    expect(answer(QUESTIONS.cost)).toContain('MIT-Lizenz');
    expect(answer(QUESTIONS.data)).toContain('Nichts ist gehostet');
    for (const phrase of ['Odoo 17, 18 oder 19', 'Community oder Enterprise', 'Odoo Online, Odoo.sh oder selbst gehostet', 'SKR03 oder SKR04']) expect(answer(QUESTIONS.versions), phrase).toContain(phrase);
    for (const phrase of ['Nein', '](docs/odoo-import.md)', 'Übertragung von Entwürfen über die API', '](docs/maintainers.md#später-geplant)']) expect(answer(QUESTIONS.direct), phrase).toContain(phrase);
    for (const phrase of ['Steuer jeder Zeile', 'wenige Cent', 'Protokoll', '](docs/odoo-format.md#basisanpassung-warum-manche-nettobeträge-um-einen-cent-abweichen)']) expect(answer(QUESTIONS.taxes), phrase).toContain(phrase);
    for (const phrase of ['Noch nicht', '](docs/odoo-format.md)', '](docs/maintainers.md#testimporte)']) expect(answer(QUESTIONS.testImport), phrase).toContain(phrase);
    for (const phrase of ['Entwürfe löscht', 'storniert', '](docs/odoo-import.md#einen-monat-ersetzen)']) expect(answer(QUESTIONS.undo), phrase).toContain(phrase);
    for (const phrase of ['`properties[].journal`', 'Ein Unternehmen pro Hotel', '`odoo.companyId`', '`--config`']) expect(answer(QUESTIONS.hotels), phrase).toContain(phrase);
    for (const phrase of ['init-mapping --template skr03-hotel', '](docs/mapping-guide.md#umstieg-von-einem-anderen-connector)', 'Lass den alten Connector weiterlaufen, bis der erste Monat']) expect(answer(QUESTIONS.switching), phrase).toContain(phrase);
    for (const phrase of ['keine Vorlage', 'l10n_at', 'l10n_ch', 'von Hand']) expect(answer(QUESTIONS.neighbours), phrase).toContain(phrase);
    expect(faq).not.toMatch(/grman|afinconnector|abacus-(import|format)\.md|abacus\.mandant|geschaeftsbereich/i);
  });

  it('Hotel asks about Odoo Online: the versions answer says no API access is needed, names the Standard plan and links docs/odoo-import.md', () => {
    for (const phrase of ['keinen API-Zugang', 'kein Modul', 'Standardimport von Odoo', 'Tarif Standard von Odoo Online', '](docs/odoo-import.md)']) {
      expect(answer(QUESTIONS.versions), phrase).toContain(phrase);
    }
  });

  it('FAQ answer on DATEV, BMD and Abacus: links all three origin projects in one line, which the docs test accepts', () => {
    const line = answer(QUESTIONS.origins);
    for (const link of ORIGIN_PROJECTS) expect(line).toContain(link);
    expect(checkPracticeTerms('README.md', `## Häufige Fragen\n\n${line}\n`)).toEqual([]);
  });
});

describe('README.en.md', () => {
  it('is a short English README that links the German one, the disclaimer and the licence', () => {
    expect(ENGLISH_README.split('\n').length).toBeLessThanOrEqual(80);
    expect(ENGLISH_README.startsWith('# apaleo-odoo-export\n')).toBe(true);
    for (const phrase of ["The file follows Odoo's documented import of journal entries; a first test import with a Steuerberater is still pending.", '](docs/odoo-import.md)', '](docs/odoo-format.md)']) {
      expect(ENGLISH_README).toContain(phrase);
    }
    expect(ENGLISH_README).not.toMatch(/\bKanzlei\b|Austria|Treuhänder|MWST|AbaConnect|Swiss Standard German|abacus-(import|format)\.md/);
    expect(ENGLISH_README).toContain('The documentation is written in German for hotels in Germany and their Steuerberater');
    for (const phrase of ['Odoo Accounting', 'hotels in Germany', 'SKR03 and SKR04', 'Odoo 17, 18 or 19']) expect(ENGLISH_README).toContain(phrase);
    for (const link of ['](README.md)', '](DISCLAIMER.md)', '](LICENSE)']) expect(ENGLISH_README).toContain(link);
    expect(ENGLISH_README).toContain('There is no npm package or container image release yet. You install from source.');
    expect(ENGLISH_README).toMatch(/issues and pull requests in English are welcome/i);
    expect(ENGLISH_README).not.toContain('<!-- quickstart -->');
  });

  it('shows the same install commands as the German quick start, without the shell comments', () => {
    expect(firstShellBlock(ENGLISH_README)).toEqual(INSTALL_BLOCK.map(withoutComment));
    for (const command of ['init-mapping --property BSP --template skr03-hotel', 'export --month 2026-09 --dry-run', 'export --month 2026-09\n']) {
      expect(ENGLISH_README).toContain(command);
    }
  });
});

describe('docs folder', () => {
  it('has every guide under one German file name', () => {
    for (const file of [
      'setup-apaleo.md',
      'mapping-guide.md',
      'odoo-import.md',
      'configuration.md',
      'docker.md',
      'troubleshooting.md',
      'architecture.md',
      'maintainers.md',
      'odoo-format.md',
      'posting-rules.md',
      'export.md',
      'apaleo-source.md',
      'examples/README.md',
    ]) {
      expect(existsSync(join(ROOT, 'docs', file)), file).toBe(true);
    }
    for (const file of ['setup-apaleo.de.md', 'mapping-guide.de.md', 'bmd-import.md', 'bmd-format.md', 'datev-import.md', 'datev-format.md', 'abacus-import.md', 'abacus-format.md']) expect(existsSync(join(ROOT, 'docs', file)), file).toBe(false);
  });

  it('docs/setup-apaleo.md lists the exact permissions, the optional one marked optional', () => {
    const text = readRepoFile('docs/setup-apaleo.md');
    for (const permission of [...APALEO_PERMISSIONS.required, ...APALEO_PERMISSIONS.optional]) expect(text).toContain(`\`${permission}\``);
    const [optional] = APALEO_PERMISSIONS.optional;
    expect(text).toMatch(new RegExp(`\`${optional}\`.*\\| optional \\|`));
    expect(text).toContain('Apps > Connected apps');
    expect(text).toContain(APALEO_PERMISSIONS.scopeAlternative);
  });

  it('docs/setup-apaleo.md follows the real apaleo screens in order and recommends "Omit all"', () => {
    const text = readRepoFile('docs/setup-apaleo.md');
    const names = ['Add a new app', 'Add custom app', 'New simple client', 'Secret description', 'Search permission', 'Omit all'];
    const positions = names.map((name) => text.indexOf(`**${name}**`));
    expect(positions.every((position) => position >= 0), names.join(', ')).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    for (const name of ['All properties', 'Only selected properties', 'Retrieve', 'Omit linked']) expect(text).toContain(`**${name}**`);
    expect(text).toContain('Wähle **Omit all**');
  });

  it('describes apaleo as tested live: precise amounts, the first live test and the aggregate rule', () => {
    const source = readRepoFile('docs/apaleo-source.md');
    expect(source).toContain('bis zu acht Nachkommastellen');
    expect(source).toContain('Nur der Bruttobetrag (`grossAmount`) muss ganze Cent sein');
    expect(source).not.toMatch(/ein Betrag, der mehr als 0,0001 von einem ganzen Cent abweicht, stoppt den Export/);
    for (const answer of ['`parentNumber`', '**negativem** Betrag', '`PostPrepaymentVat`', '**Saldo**', '/Offset']) expect(source).toContain(answer);
    const troubleshooting = readRepoFile('docs/troubleshooting.md');
    expect(troubleshooting).toContain('`netAmount` oder `taxes[…].amount`: Du nutzt eine alte Version');
    expect(troubleshooting).toContain('`grossAmount`: Das ist auch in der aktuellen Version ein echter Fehler');
    expect(readRepoFile('docs/export.md')).toContain('tax_ust_7_skr03 7 % (Kz 86): net 734.44, apaleo per line 51.40, gross 785.84, apaleo precise 51.41 (51.41009346), difference (per line minus precise) -0.01');
  });

  it('Export doc for Odoo: docs/export.md and docs/examples/README.md are German as used in Germany, without Swiss or Austrian practice terms and without « »', () => {
    for (const file of ['docs/export.md', 'docs/examples/README.md']) {
      const text = readRepoFile(file);
      // The Swiss and Austrian terms are checkPracticeTerms' shared rules; these are the Swiss spellings and words beyond them.
      for (const term of ['Mandant', 'grösser', 'ausserhalb', 'standardmässig', 'Massnahme', 'Ziffer', 'Debitorenverlust', 'Annullation', 'KMU', 'CHF', 'Nebenjournal', 'Europe/Zurich', 'österreichisch']) {
        expect(text, `${file}: ${term}`).not.toContain(term);
      }
      expect(checkPracticeTerms(file, text)).toEqual([]);
      expect(text).toContain('ß');
    }
    const exportDoc = readRepoFile('docs/export.md');
    for (const heading of ['## Zeitraum und Monate', '## Welche Tage sich exportieren lassen', '## Was vor dem Schreiben geprüft wird', '## Der Probelauf: was die Übersicht zeigt', '## Ausgabeordner', '## Noch einmal exportieren', '## Demo ohne apaleo']) {
      expect(headings(exportDoc, '##'), heading).toContain(heading.slice(3));
    }
    for (const term of ['`unchanged`', '`E-FILE-EXISTS`', '`--overwrite`', '`E-PERIOD-OVERLAP`', '`manifest.json`', '`revision`', '.protokoll.txt', '„(Korrektur 2)“', '`_DEMO`', '`E-ODOO-UNBALANCED`']) expect(exportDoc, term).toContain(term);
    expect(section(exportDoc, '## Noch einmal exportieren')).toMatch(/lösche ihre Entwürfe und storniere ihre gebuchten Buchungssätze/);
    expect(section(readRepoFile('docs/examples/README.md'), '# Beispielausgabe: „Hotel Beispiel Berlin“')).toContain('**Importiere die Datei nur in eine Testdatenbank**');
  });

  it('Hotel compares after the import: the dry-run section names which summary line to compare with which Odoo view, and that a difference to apaleo comes from Odoo\'s rounding', () => {
    const dryRun = section(readRepoFile('docs/export.md'), '## Der Probelauf: was die Übersicht zeigt');
    for (const phrase of ['Steuerzeilen pro Satz', 'Steuerbericht', 'Kz 81', 'Kz 86', '`1410`', '`1360`', 'Gästeforderungen', 'Geldtransitkontos', 'Odoos Rundung, kein Fehler', 'Nach dem Import mit Odoo vergleichen']) {
      expect(dryRun, phrase).toContain(phrase);
    }
  });

  it('documents every config key and every environment variable in docs/configuration.md', () => {
    const text = readRepoFile('docs/configuration.md');
    for (const path of configPaths()) expect(text, path).toContain(`\`${path}\``);
    for (const { variable } of [...ENV_OVERRIDES, ...SECRET_KEYS]) expect(text, variable).toContain(`\`${variable}\``);
    expect(text).toContain('`APALEO_ODOO_CONFIG`');
  });

  it('has the topic sections and, as its last section, the sign-off checklist for the Kanzlei in the mapping guide, and no English summary', () => {
    const guide = readRepoFile('docs/mapping-guide.md');
    expect(guide).not.toContain('English summary');
    for (const topic of ['## Anzahlungen', '## Zahlungen: Kasse und Geldtransit', '## Gästeforderungen und Firmenrechnungen', '## Steuer und Steuersatz', '## Die Vorlagen SKR03 und SKR04', '## Befunde und was du tust']) {
      expect(guide).toContain(`${topic}\n`);
    }
    expect(guide).toContain('](examples/mapping-BSP.example.csv)');
    for (const template of ['`templates/skr03-hotel.rules.csv`', '`templates/skr04-hotel.rules.csv`']) expect(guide).toContain(template);
    expect(guide).not.toContain('kmu-hotel');
    expect(guide).not.toContain('--accounts-from');
    expect(headings(guide, '##').at(-1)).toBe('Checkliste zur Freigabe durch die Kanzlei');
    const checklist = section(guide, '## Checkliste zur Freigabe durch die Kanzlei');
    expect(checklist.match(/^- \[ \]/gm)?.length).toBeGreaterThanOrEqual(5);
    for (const pair of ['`8300 -> tax_ust_7_skr03 (7 %)`', '`8400 -> tax_ust_19_skr03 (19 %)`', '`1718 -> tax_ust_19_skr03 (19 %)`']) expect(checklist, pair).toContain(pair);
  });

  it('o03: explains the Odoo mapping in German as used in Germany and lists every account and tax of both SKR templates', () => {
    const guide = readRepoFile('docs/mapping-guide.md');
    for (const phrase of ['ß', 'SKR03', 'SKR04', '19 %', '7 %', '16 %', '5 %', '2026-01-01', 'Kennzahl 45', 'Vorschlag (ungeprüft)', '`odoo_account`', '`odoo_tax`', '`tax_percent`']) {
      expect(guide, phrase).toContain(phrase);
    }
    expect(checkPracticeTerms('docs/mapping-guide.md', guide)).toEqual([]);
    expect(checkQuotationMarks('docs/mapping-guide.md', guide)).toEqual([]);
    expect(guide).not.toMatch(/(?<!apaleo-)\b(DATEV|BMD)\b/);
    for (const code of ['E-TAX-FORMAT', 'E-TAX-MISSING', 'E-TAX-NOT-ALLOWED', 'W-TAX-UNCHECKED', 'W-TAX-RATE', 'W-TAX-KZ45', 'N-DEFAULT-TAX-ACCOUNT', 'N-GENERATED-ACCOUNT', 'W-VAT-RATE-UNUSUAL', 'E-UNMAPPED']) {
      expect(section(guide, '## Befunde und was du tust'), code).toContain(`\`${code}\``);
    }
    for (const chart of ['skr03', 'skr04']) {
      const rules = readRepoFile(`templates/${chart}-hotel.rules.csv`)
        .split(/\r?\n/)
        .filter((line) => line !== '' && !line.startsWith('#') && !line.startsWith('apaleo_type;'));
      for (const line of rules) expect(line, line).toContain('Vorschlag (ungeprüft)');
      const cells = rules.map((line) => line.split(';'));
      for (const account of new Set(cells.map((cell) => cell[3]).filter((value) => value && !value.startsWith('{')))) expect(guide, account).toContain(`\`${account}\``);
      for (const tax of new Set(cells.map((cell) => cell[4]).filter(Boolean))) expect(guide, tax).toContain(`\`${tax}\``);
    }
    for (const code of ['`1001`', '`1360`', '`13601`', '`1601`', '`1460`', '`14601`']) expect(section(guide, '## Zahlungen: Kasse und Geldtransit'), code).toContain(code);
  });

  it('Contributor adds a target: explains the SourceAdapter contract, the TargetWriter boundary with OdooBooking and where golden files go, announcing no other target', () => {
    const architecture = readRepoFile('docs/architecture.md');
    for (const phrase of ['SourceAdapter', 'LedgerLine', 'Smoobu', 'test/fixtures/', 'FakeSource', '## Die Schnittstelle TargetWriter', 'OdooBooking', 'renderOdooCsv', 'OdooValidationError', 'odooTarget', 'test/golden/odoo/', 'test/golden/<ziel>/', 'Ein Beispiel ohne Zusage']) {
      expect(architecture).toContain(phrase);
    }
    expect(architecture).not.toMatch(/lexoffice|geplant ist (ein|der)/i);
    expect(architecture).not.toMatch(/src\/bmd|BmdBooking|bmdTarget/);
    expect(architecture).not.toMatch(/src\/abacus|AbacusBooking|renderXmlBuchungen|AbacusValidationError|abacusTarget|test\/golden\/abacus/);
  });

  it('First import in Odoo: docs/odoo-import.md names the journal, the Kasse and Geldtransit lookup, the single active company, the menu path, Test, the balancing-line check, the tax per rate and undo', () => {
    const guide = readRepoFile('docs/odoo-import.md');
    const preparation = section(guide, '## Vorbereitung');
    for (const phrase of ['„Sonstige“ (Miscellaneous)', '`odoo.journal`', 'SKR03 oder SKR04', 'External ID', 'Entwicklermodus', '„External ID“', '`odoo.companyId`', 'Hauptunternehmens', '`odoo.taxRounding`', 'Rundungsmethode', 'Kontenplan', 'Liquiditätstransferkonto', '„Show Full Accounting Features“']) {
      expect(preparation, phrase).toContain(phrase);
    }
    for (const code of ['`1001`', '`1360`', '`13601`', '`1601`', '`1460`', '`14601`']) expect(preparation, code).toContain(code);
    const importing = section(guide, '## Datei importieren');
    for (const phrase of ['Nur das Zielunternehmen aktiv', 'Unternehmensumschalter', 'Odoo 19', 'Buchhaltung > Buchhaltung > Journalbuchungen (Accounting > Accounting > Journal Entries)', 'Zahnrad > Datensätze importieren (gear > Import records)', 'erkannte Formatierung', '„Test“', '„Importieren“ (Import)', '„No matching record found', '„Found multiple matches']) {
      expect(importing, phrase).toContain(phrase);
    }
    const checks = section(guide, '## Nach dem Import prüfen');
    for (const phrase of ['**Entwürfe**', '`apaleo <Hotel> <Datum>`', '„Automatische Ausgleichszeile“ (Automatic Balancing Line)', 'Kz 81', 'Kz 86', 'Protokoll', 'Gästeforderungen', 'Geldtransitkontos', 'buche die Entwürfe']) {
      expect(checks, phrase).toContain(phrase);
    }
    expect(section(guide, '## Dieselbe Datei noch einmal importieren')).toContain('ändert nichts');
    const undo = section(guide, '## Eine Datei rückgängig machen');
    for (const phrase of ['Lösche die Entwürfe', 'Storniere die gebuchten Buchungssätze', 'Datum des ursprünglichen Buchungssatzes als „Stornodatum“ (Reversal Date)', 'berichtigte UStVA']) {
      expect(undo, phrase).toContain(phrase);
    }
    expect(section(guide, '## Fragen für die Kanzlei')).toMatch(/Ist-Versteuerung.*Zahlungsbasis/s);
  });

  it('Corrected month after a posted import: reverse the posted entries of the earlier revision by reference apaleo BSP, then import the _r2 file with „(Korrektur 2)“ as new drafts', () => {
    const replace = section(readRepoFile('docs/odoo-import.md'), '## Einen Monat ersetzen');
    for (const phrase of ['`export --overwrite`', '`_r2`', '„(Korrektur N)“', '`apaleo BSP 2026-09-14 (Korrektur 2)`', '`apaleo BSP`', '**Lösche** ihre Entwürfe', '**Storniere** ihre gebuchten Buchungssätze', 'Prüfprotokoll', 'behält die External IDs', 'neue Entwürfe']) {
      expect(replace, phrase).toContain(phrase);
    }
    expect(replace.indexOf('**Storniere**')).toBeLessThan(replace.indexOf('4. Importiere die neue Datei'));
  });

  it('Corrected month after a posted import: the reversal carries the date of the original entry, so the month nets to zero in its own period', () => {
    const replace = section(readRepoFile('docs/odoo-import.md'), '## Einen Monat ersetzen');
    for (const phrase of ['„Stornobuchung“, Reverse Entry', '„Stornieren“, Reverse', '„Stornodatum“ (Reversal Date) auf das Datum des ursprünglichen Buchungssatzes', 'heutige Datum', 'Kz 81 und 86', 'ein Stornodatum für alle', 'berichtigte UStVA']) {
      expect(replace, phrase).toContain(phrase);
    }
    expect(replace).not.toContain('Umkehren');
    expect(replace.indexOf('Stornodatum')).toBeLessThan(replace.indexOf('4. Importiere die neue Datei'));
  });

  it('Corrected month: the export chooses the revision, so the guide and the format doc no longer say that --overwrite writes revision 1', () => {
    const replace = section(readRepoFile('docs/odoo-import.md'), '## Einen Monat ersetzen');
    expect(replace).not.toContain('Noch nicht umgesetzt');
    expect(replace).toContain('Das Tool wählt die Revision selbst');
    const format = section(readRepoFile('docs/odoo-format.md'), '## Korrekturen: Revisionen („Korrektur N“)');
    expect(format).not.toContain('Noch nicht umgesetzt');
    expect(format).toContain('`--overwrite` schreibt eine mehr als die Datei, die sie ersetzt');
    expect(format).toContain('„Stornodatum“ (Reversal Date)');
  });

  it('First import in Odoo: the open questions of research §10 are a checklist for the first test import, and the guide is German as used in Germany', () => {
    const guide = readRepoFile('docs/odoo-import.md');
    const checklist = section(guide, '## Erster Testimport: Checkliste');
    expect(checklist.match(/^- \[ \]/gm)).toHaveLength(12);
    for (const item of ['technischen Spaltennamen', 'Rundungszeilen', 'wenige Cent', 'leerer Steuerzelle', 'Revision 2', 'Unterkonten', 'Menü und Schaltflächen', 'Prüfprotokoll', 'Stornodatum', 'Kasse und Geldtransit', 'Speisen zu 7 %', 'Niederlassung']) {
      expect(checklist, item).toContain(item);
    }
    for (const term of ['Treuhänder', 'MWST', 'Rappen', 'Mandant', 'grösser', 'ausserhalb', '«', '»', 'Abacus']) expect(guide, term).not.toContain(term);
    expect(checkPracticeTerms('docs/odoo-import.md', guide)).toEqual([]);
  });

  it('links docs/odoo-import.md from the README and docs/configuration.md', () => {
    expect(README).toContain('](docs/odoo-import.md)');
    expect(readRepoFile('docs/configuration.md')).toContain('](odoo-import.md)');
  });

  it('Going public later: docs/maintainers.md has the "Vor der Veröffentlichung" checklist, starting with the test import', () => {
    expect(MAINTAINERS).toContain('**niemand außerhalb kann sie sehen, bis der Maintainer das Repository öffentlich macht**');
    const checklist = section(MAINTAINERS, '## Vor der Veröffentlichung');
    const steps = checklist.split('\n').filter((line) => /^\d+\. \[ \] /.test(line));
    expect(steps[0]).toMatch(/Kanzlei.*Testimport in Odoo.*odoo-import\.md#erster-testimport-checkliste.*\[Testimporte\]\(#testimporte\)/);
    expect(steps[0]).toContain('einmal in Odoo 19 auf Odoo Online (Testversion) und einmal in Odoo 17 oder 18 Community');
    expect(steps[1]).toMatch(/deutschen apaleo-Sandbox.*`test\/fixtures\/apaleo\/live\/`/);
    const order = ['Testimport in Odoo', 'deutschen apaleo-Sandbox', '--visibility public', 'Vorschaubild (Social Preview)', 'Discussions', 'v0.1.0'].map((step) => checklist.indexOf(step));
    expect(order.every((position) => position >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(checklist).not.toContain('[x]');
    expect(checklist).not.toContain('beschreiben noch das Vorgängerprodukt');
  });

  it('records test imports under "Testimporte" in one table with the seven fields, the local rows kept and no Abacus table', () => {
    const imports = section(MAINTAINERS, '## Testimporte');
    expect(imports).toContain('| Datum | Odoo-Version | Edition und Hosting | Kontenrahmen | Rundungsmethode | Ergebnis | Geprüft von |');
    expect(imports).toContain('„Maintainer, lokal“ oder die Kanzlei');
    expect(imports).not.toMatch(/Abacus|Schnittstellenversion|### Lokale Testimporte/);
    expect(recordedTestImports(MAINTAINERS)).toHaveLength(6);
  });

  it('plans later only items inside this product, no other target formats and no BMD-only or Abacus-only items', () => {
    const backlog = section(MAINTAINERS, '## Später geplant');
    for (const item of ['Direkte Übertragung in Odoo', 'Kostenstellen über die Kostenrechnung von Odoo', 'Vorlagen für Österreich und die Schweiz', 'Wöchentlicher Rhythmus', 'Gebühren aus Abrechnungsdateien', 'E-Mail-Versand', 'Dauerprozess mit eigenem Zeitplan', 'Überwachung und Alarme', 'Dependabot', 'Veröffentlichung auf npm oder in einer Registry']) {
      expect(backlog).toContain(item);
    }
    expect(backlog).not.toMatch(/DATEV|RZL|lexoffice|Mews|Smoobu|Zielformat/);
    expect(backlog).not.toMatch(/\bBMD\b|Personenkonten-Datei|BMD Com/);
    expect(backlog).not.toMatch(/Saldosteuersatz|Debitoren-Schnittstelle|Sammelbuchung pro Tag/);
  });

  it('Odoo push later: plans the direct transfer through the external API, drafts only, with the reasons of the research', () => {
    const backlog = section(MAINTAINERS, '## Später geplant');
    const item = backlog.split('\n').find((line) => line.startsWith('- **Direkte Übertragung in Odoo')) ?? '';
    expect(item).toContain('**Direkte Übertragung in Odoo über die externe API (JSON-2 ab Odoo 19, XML-RPC für 17 und 18), nur Entwürfe**');
    for (const reason of ['„Custom“', 'zwei Protokolle', 'Odoo 22', 'API-Schlüssel mit Schreibrechten', 'Steuerzeilen']) expect(item, reason).toContain(reason);
    expect(item).not.toMatch(/Treuhänder|MWST|Rappen|«|»/);
  });

  it('Metadata applied: docs/maintainers.md names the description and every topic set by o08, says they take effect only once public, and leaves the visibility alone', () => {
    const privateSection = section(MAINTAINERS, '## Das Repository ist vorerst privat');
    expect(privateSection).toContain(`„${REPO_DESCRIPTION}“`);
    for (const topic of REPO_TOPICS) expect(privateSection, topic).toContain(`\`${topic}\``);
    expect(privateSection).toContain('gh repo view krautdawg/apaleo-odoo-export --json description,repositoryTopics,visibility');
    expect(privateSection).not.toMatch(/--visibility|abacus|mwst|treuhand|schweiz-|switzerland/i);
  });
});

describe('readme-quickstart CI job', () => {
  const workflow = parse(readRepoFile('.github/workflows/ci.yml')) as { jobs: Record<string, { steps: { run?: string }[] }> };
  const runs = workflow.jobs['readme-quickstart']?.steps.map((step) => step.run ?? '') ?? [];

  it('extracts the README block after the quickstart marker, runs it, then the demo dry run and checks its Odoo summary in EUR', () => {
    expect(runs.join('\n')).toContain('<!-- quickstart -->');
    expect(runs).toContain('bash -euxo pipefail "$RUNNER_TEMP/quickstart.sh"');
    const demo = runs.at(-1) ?? '';
    expect(demo.startsWith('node dist/cli/main.js export --month 2026-09 --demo --dry-run | tee "$RUNNER_TEMP/demo.txt"\n')).toBe(true);
    for (const line of ['^Import into Odoo Accounting', '^  Company: id 1 (odoo.companyId, the company that owns the taxes), journal APA, currency EUR$', '^Totals per Odoo account', '^  tax_ust_7_skr03 7 % (Kz 86): net ', '^  tax_ust_19_skr03 19 % (Kz 81): net ', '^DEMO Result: dry run']) {
      expect(demo).toContain(`grep -q '${line}`);
    }
  });
});
