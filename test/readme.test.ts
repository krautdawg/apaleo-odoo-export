import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { COMMANDS } from '../src/cli/commands/index.js';
import { ENV_OVERRIDES, SECRET_KEYS } from '../src/core/config.js';
import { APALEO_PERMISSIONS } from '../src/sources/apaleo/index.js';
import { ROOT, checkCompatibilityClaims, checkPracticeTerms, commandPhrases, configPaths, readRepoFile, recordedTestImports } from './helpers/docs.js';

const README = readRepoFile('README.md');
const ENGLISH_README = readRepoFile('README.en.md');
const MAINTAINERS = readRepoFile('docs/maintainers.md');
const GERMAN_TAGLINE = 'Kostenloser apaleo Abacus Export: XML-Buchungsimport für die Abacus Finanzbuchhaltung aus apaleo, Open Source';
const PRICE = '24-48 EUR pro Monat (je nach Variante und Anzahl der Betriebe), laut apaleo Store, Oktober 2026';
const PENDING_IMPORT = 'Die Datei folgt der dokumentierten AbaConnect-Schnittstelle «XML Buchungen»; ein erster Testimport mit einem Treuhänder steht noch aus.';
const ORIGIN_PROJECTS = ['](https://github.com/krautdawg/apaleo-bmd-export)', '](https://github.com/krautdawg/apaleo-datev-export)'];
/** The install block of the German quick start (s09 design decision 3), which CI runs. */
const INSTALL_BLOCK = [
  'git clone https://github.com/krautdawg/apaleo-abacus-export.git',
  'cd apaleo-abacus-export',
  'corepack enable',
  'pnpm install --frozen-lockfile',
  'pnpm build',
  'node dist/cli/main.js --help        # oder: pnpm link --global, dann apaleo-abacus --help',
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
    for (const term of ['apaleo Abacus Export', 'kostenlos', 'Open Source']) expect(title).toContain(term);
    expect(rest.find((line) => line.trim() !== '')).toContain('](README.en.md)');
    expect(firstScreen).toContain(GERMAN_TAGLINE);
    for (const badge of ['actions/workflows/ci.yml/badge.svg', 'licence-MIT', 'node.js-24']) expect(firstScreen).toContain(badge);
    expect(firstScreen).toMatch(/apaleo-abacus-export ist .*Hotels in der Schweiz.*Treuhänder/);
    expect(firstScreen).toContain('Keine Gewähr, keine Steuerberatung');
    expect(firstScreen).toContain('Lass deine Kontenzuordnung von deinem Treuhänder prüfen');
    expect(firstScreen).toContain('](DISCLAIMER.md)');
    expect(firstScreen).not.toContain('git clone');
    expect(headings(README, '##')[0]).toBe('Was es macht');
    expect(section(README, '## Was es macht').match(/^- /gm)).toHaveLength(5);
  });

  it('uses the search terms people use in the title, tagline and intro', () => {
    const firstLines = firstScreen.split('**Stand:**')[0] ?? '';
    for (const term of ['apaleo', 'Abacus', 'Abacus Finanzbuchhaltung', 'Abacus-Export', 'AbaConnect', 'XML Buchungen', 'MWST', 'KMU-Kontenrahmen', 'Treuhänder', 'Buchhaltung', 'Hotel', 'Schweiz', 'Open Source', 'kostenlos']) {
      expect(firstLines.toLowerCase(), term).toContain(term.toLowerCase());
    }
    expect(firstLines).not.toMatch(/\bBMD\b|DATEV|Österreich|Kanzlei/);
  });

  it('Pending test import: says on the first screen that the file follows the documented layout and the first test import is pending', () => {
    expect(recordedTestImports(MAINTAINERS)).toEqual([]);
    expect(firstScreen).toContain(PENDING_IMPORT);
  });

  it('Claim without a recorded import: makes no tested-with-Abacus claim while docs/maintainers.md records no import', () => {
    expect(checkCompatibilityClaims('README.md', README, recordedTestImports(MAINTAINERS).length)).toEqual([]);
    expect(checkCompatibilityClaims('README.md', `${README}\nDie Datei ist getestet mit Abacus FIBU.\n`, recordedTestImports(MAINTAINERS).length)).toEqual([
      expect.stringMatching(/^README\.md: "getestet mit Abacus"/),
    ]);
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
    for (const command of ['init-mapping --property BSP --template kmu-hotel', 'export --month 2026-09 --dry-run', 'export --month 2026-09\n']) {
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
      expect(text).not.toMatch(/npx\s+apaleo-abacus/);
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
      'Keine Übertragung in Abacus und kein AbaConnect-Webservice',
      'Keine Debitorenbuchhaltung (DEBI) und keine Kundenstammdaten',
      'Keine PDF-Belege',
      'Gebühren der Zahlungsdienstleister',
      'Rückbuchungen (Chargebacks)',
      'Provisionen der Buchungsportale',
      'Keine Saldosteuersatz- und keine Pauschalsteuersatzmethode',
      'ohne Umrechnung',
      'Weboberfläche',
      'gehosteter Dienst',
      'keine anderen Zielformate wie DATEV oder BMD',
    ]) {
      expect(limits).toContain(phrase);
    }
  });

  it('Comparison table: compares with paid connectors on eight points, with the dated price and no vendor name', () => {
    const table = section(README, '## Vergleich mit kostenpflichtigen Connectoren');
    const rows = [...table.matchAll(/^\| ([^|]+?) \|/gm)].map((m) => m[1]?.trim());
    expect(rows).toEqual(
      expect.arrayContaining(['Preis', 'Betrieb', 'Einrichtung', 'Zustellung der Dateien', 'Direktimport in Abacus', 'Debitoren-Schnittstelle', 'Support', 'Vorlagen für die Zuordnung']),
    );
    expect(table).toContain(PRICE);
    expect(table).toContain('Selbst betreiben heisst');
    for (const vendor of ['grman', 'hotecholution', 'omniboost', 'xconnect', 'abacus connector by', 'bmd connector', 'datev connector']) {
      expect(README.toLowerCase(), vendor).not.toContain(vendor);
      expect(ENGLISH_README.toLowerCase(), vendor).not.toContain(vendor);
    }
  });

  it('names the origin projects in one sentence and links both for BMD and DATEV users', () => {
    const origin = README.split('\n').filter((line) => /^apaleo-abacus-export baut auf .* auf/.test(line));
    expect(origin).toHaveLength(1);
    for (const link of ORIGIN_PROJECTS) expect(origin[0]).toContain(link);
    expect(origin[0]).toMatch(/wer .*mit BMD .*mit DATEV bucht/);
  });
});

describe('README FAQ', () => {
  const faq = section(README, '## Häufige Fragen');
  const answer = (question: string) => faq.split('\n').find((line) => line.startsWith(`**${question}**`)) ?? '';

  it('FAQ topics tested: answers every topic, naming no vendor', () => {
    for (const topic of [
      'Was kostet es',
      'Wohin gehen meine Daten',
      'Welche Abacus-Lizenz braucht mein Treuhänder?',
      'direkt an Abacus',
      'Testimport',
      'rückgängig',
      'Mehrere Hotels',
      'wechseln',
      'Saldosteuersatz',
      'Gibt es das auch für BMD oder DATEV?',
    ]) {
      expect(faq, topic).toContain(topic);
    }
    expect(answer('Wohin gehen meine Daten?')).toContain('Nichts ist gehostet');
    expect(answer('Ich nutze heute einen bezahlten Connector. Kann ich wechseln?')).toContain('](docs/mapping-guide.md#umstieg-von-einem-anderen-connector)');
    expect(answer('Rechnet mein Hotel mit dem Saldosteuersatz ab?')).toContain('Version 1');
  });

  it('Treuhänder asks about the licence: one line naming the FIBU with Buchungsschnittstellen (F11/F5534), no partnership, no web service, pending confirmation, linking docs/abacus-import.md', () => {
    const licence = answer('Welche Abacus-Lizenz braucht mein Treuhänder?');
    for (const phrase of ['Abacus Finanzbuchhaltung mit Buchungsschnittstellen (F11/F5534)', 'keine Partnerschaft', 'keinen Webservice', 'erste Testimport', '](docs/abacus-import.md)']) {
      expect(licence, phrase).toContain(phrase);
    }
  });

  it('FAQ answer on BMD and DATEV: links both origin projects in one line, which the docs test accepts', () => {
    const line = answer('Gibt es das auch für BMD oder DATEV?');
    for (const link of ORIGIN_PROJECTS) expect(line).toContain(link);
    expect(checkPracticeTerms('README.md', `## Häufige Fragen\n\n${line}\n`)).toEqual([]);
  });
});

describe('README.en.md', () => {
  it('is a short English README that links the German one, the disclaimer and the licence', () => {
    expect(ENGLISH_README.split('\n').length).toBeLessThanOrEqual(80);
    expect(ENGLISH_README.startsWith('# apaleo-abacus-export\n')).toBe(true);
    for (const phrase of ['Abacus Finanzbuchhaltung', 'AbaConnect "XML Buchungen"', 'Swiss hotels', 'a first test import with a Treuhänder is still pending', 'only Swiss MWST rules apply']) {
      expect(ENGLISH_README).toContain(phrase);
    }
    expect(ENGLISH_README).not.toMatch(/\bKanzlei\b|Steuerberater|Austria|BMD NTCS/);
    expect(ENGLISH_README).toMatch(/docs are|documentation is written in Swiss Standard German/);
    for (const link of ['](README.md)', '](DISCLAIMER.md)', '](LICENSE)']) expect(ENGLISH_README).toContain(link);
    expect(ENGLISH_README).toContain('There is no npm package or container image release yet. You install from source.');
    expect(ENGLISH_README).toMatch(/issues and pull requests in English are welcome/i);
    expect(ENGLISH_README).not.toContain('<!-- quickstart -->');
  });

  it('shows the same install commands as the German quick start, without the shell comments', () => {
    expect(firstShellBlock(ENGLISH_README)).toEqual(INSTALL_BLOCK.map(withoutComment));
    for (const command of ['init-mapping --property BSP --template kmu-hotel', 'export --month 2026-09 --dry-run', 'export --month 2026-09\n']) {
      expect(ENGLISH_README).toContain(command);
    }
  });
});

describe('docs folder', () => {
  it('has every guide under one German file name', () => {
    for (const file of [
      'setup-apaleo.md',
      'mapping-guide.md',
      'abacus-import.md',
      'configuration.md',
      'docker.md',
      'troubleshooting.md',
      'architecture.md',
      'maintainers.md',
      'abacus-format.md',
      'posting-rules.md',
      'export.md',
      'apaleo-source.md',
      'examples/README.md',
    ]) {
      expect(existsSync(join(ROOT, 'docs', file)), file).toBe(true);
    }
    for (const file of ['setup-apaleo.de.md', 'mapping-guide.de.md', 'bmd-import.md', 'bmd-format.md', 'datev-import.md', 'datev-format.md']) expect(existsSync(join(ROOT, 'docs', file)), file).toBe(false);
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
    expect(source).toContain('Nur der Bruttobetrag (`grossAmount`) muss ganze Rappen sein');
    expect(source).not.toMatch(/ein Betrag, der mehr als 0,0001 von einem ganzen Cent abweicht, stoppt den Export/);
    for (const answer of ['`parentNumber`', '**negativem** Betrag', '`PostPrepaymentVat`', '**Saldo**', '/Offset']) expect(source).toContain(answer);
    const troubleshooting = readRepoFile('docs/troubleshooting.md');
    expect(troubleshooting).toContain('`netAmount` oder `taxes[…].amount`: Du nutzt eine alte Version');
    expect(troubleshooting).toContain('`grossAmount`: Das ist auch in der aktuellen Version ein echter Fehler');
    expect(readRepoFile('docs/export.md')).toContain('10 %: net 77.46, tax 7.74, gross 85.20, apaleo VAT 7.75, difference 0.01 (apaleo precise 7.74545454)');
  });

  it('documents every config key and every environment variable in docs/configuration.md', () => {
    const text = readRepoFile('docs/configuration.md');
    for (const path of configPaths()) expect(text, path).toContain(`\`${path}\``);
    for (const { variable } of [...ENV_OVERRIDES, ...SECRET_KEYS]) expect(text, variable).toContain(`\`${variable}\``);
    expect(text).toContain('`APALEO_ABACUS_CONFIG`');
  });

  it('has the topic sections and, as its last section, the sign-off checklist for the Treuhänder in the mapping guide, and no English summary', () => {
    const guide = readRepoFile('docs/mapping-guide.md');
    expect(guide).not.toContain('English summary');
    for (const topic of ['## Anzahlungen', '## Zahlungen, Forderungen, Debitoren']) expect(guide).toContain(`${topic}\n`);
    expect(guide).toContain('](examples/mapping-BSP.example.csv)');
    expect(guide).toContain('`templates/kmu-hotel.rules.csv`');
    expect(guide).not.toContain('`templates/ekr-hotel.rules.csv`');
    expect(headings(guide, '##').at(-1)).toBe('Checkliste zur Freigabe durch den Treuhänder');
    expect(guide).not.toContain('## Checkliste zur Freigabe durch die Kanzlei');
    expect(section(guide, '## Checkliste zur Freigabe durch den Treuhänder').match(/^- \[ \]/gm)?.length).toBeGreaterThanOrEqual(5);
  });

  it('a05: explains the Swiss MWST rates and lists every account of the KMU template in the mapping guide', () => {
    const guide = readRepoFile('docs/mapping-guide.md');
    for (const rate of ['3,8 %', '8,1 %', '2,6 %', 'Art. 25 Abs. 4']) expect(guide, rate).toContain(rate);
    expect(guide).not.toContain('## Steuersätze in Österreich');
    expect(guide).not.toContain('## Die EKR-Vorlage');
    const rules = readRepoFile('templates/kmu-hotel.rules.csv')
      .split(/\r?\n/)
      .filter((line) => line !== '' && !line.startsWith('#') && !line.startsWith('apaleo_type;'));
    for (const line of rules) expect(line, line).toContain('Vorschlag (ungeprüft)');
    for (const account of new Set(rules.map((line) => line.split(';')[3]).filter(Boolean))) expect(guide, account).toContain(`\`${account}\``);
  });

  it('Contributor adds a target: explains the SourceAdapter contract, the TargetWriter boundary with AbacusBooking and where golden files go, announcing no other target', () => {
    const architecture = readRepoFile('docs/architecture.md');
    for (const phrase of ['SourceAdapter', 'LedgerLine', 'Smoobu', 'test/fixtures/', 'FakeSource', '## Die Schnittstelle TargetWriter', 'AbacusBooking', 'renderXmlBuchungen', 'AbacusValidationError', 'test/golden/abacus/', 'test/golden/<ziel>/', 'Ein Beispiel ohne Zusage']) {
      expect(architecture).toContain(phrase);
    }
    expect(architecture).not.toMatch(/lexoffice|geplant ist (ein|der)/i);
    expect(architecture).not.toMatch(/src\/bmd|BmdBooking|bmdTarget/);
  });

  it('First import in Abacus: docs/abacus-import.md names the programs, the licence, MWST berechnen with F21, Mandant and Geschäftsbereich, the Nebenjournal and undo', () => {
    const guide = readRepoFile('docs/abacus-import.md');
    for (const phrase of [
      '**F11 Buchen**',
      '**F5534 «Import/Export Buchungen AbaConnect»**',
      'Importart **«XML Buchungen»**',
      '**Buchungsschnittstellen**',
      '**«MWST berechnen»**',
      'Standard-MWST-Code nehmen, der dem Konto im Kontenplan (F21) hinterlegt ist, statt des MWST-Codes aus der Datei',
      '## Mandant und Geschäftsbereich',
      '`properties[].geschaeftsbereich`',
      '`W-MANDANT-SHARED`',
      '## Nebenjournal',
      '## Rückgängig machen',
      '`E-FILE-EXISTS`',
      'export --overwrite',
    ]) {
      expect(guide, phrase).toContain(phrase);
    }
  });

  it('First import in Abacus: the checklist compares Saldenliste, MWST-Journal per Ziffer, every "account -> MWST-Code" pair with F21, Anzahlungen, Debitorenverlust, Kurtaxe and Belegnummern', () => {
    const checklist = section(readRepoFile('docs/abacus-import.md'), '## Erster Import: bitte prüfen');
    for (const item of [
      'Saldenliste',
      'MWST-Journal',
      'Ziffer 303',
      'Ziffer 313',
      'Ziffer 343',
      '`3400 -> 313`',
      '`2030 -> 313`',
      '`2031 -> 311`',
      '`3805 -> 313`',
      'MWST-pflichtig',
      'Anzahlungen',
      'Debitorenverlust erscheint als Entgeltsminderung',
      'Kurtaxe',
      'keinen Standard-MWST-Code',
      'Belegnummern',
    ]) {
      expect(checklist, item).toContain(item);
    }
    expect(checklist.match(/^- \[ \]/gm)?.length).toBeGreaterThanOrEqual(8);
  });

  it('First import in Abacus: the open questions of research §9 are a checklist for the first test import', () => {
    const questions = section(readRepoFile('docs/abacus-import.md'), '## Erster Testimport: offene Fragen');
    for (const item of [
      '**Lizenz und Programm**',
      '**Schnittstellenversion**',
      '**`TaxType`**',
      '**Vorzeichen der MWST**',
      '`KeyAmount`',
      '**`TaxAccount`**',
      '`TAX_ACCOUNT_AT_RATE_ZERO`',
      '**`TaxIncluded` bei Satz 0**',
      '**MWST berechnen**',
      '**Rundung der MWST**',
      'W-VAT-ROUNDING',
      '**Belegnummern**',
      'pro Geschäftsjahr',
      '**Nebenjournal**',
      '**Anzahlungen**',
      'MWST-Code für Vorauszahlungen',
      '**Vereinnahmt**',
      'Hilfskonto',
      '**Journalsumme**',
      'journalTotalCents',
    ]) {
      expect(questions, item).toContain(item);
    }
    expect(questions.match(/^- \[ \]/gm)).toHaveLength(14);
  });

  it('links docs/abacus-import.md from the README and docs/configuration.md', () => {
    expect(README).toContain('](docs/abacus-import.md)');
    expect(readRepoFile('docs/configuration.md')).toContain('](abacus-import.md)');
  });

  it('Going public later: docs/maintainers.md has the "Vor der Veröffentlichung" checklist, starting with the test import', () => {
    expect(MAINTAINERS).toContain('**niemand ausserhalb kann sie sehen, bis der Maintainer das Repository öffentlich macht**');
    const checklist = section(MAINTAINERS, '## Vor der Veröffentlichung');
    const steps = checklist.split('\n').filter((line) => /^\d+\. \[ \] /.test(line));
    expect(steps[0]).toMatch(/Testimport in Abacus FIBU.*abacus-import\.md.*\[Testimporte\]\(#testimporte\)/);
    expect(steps[1]).toMatch(/Schweizer apaleo-Sandbox.*`test\/fixtures\/apaleo\/live\/`/);
    for (const step of ['--visibility public', 'Vorschaubild (Social Preview)', 'Discussions', 'v0.1.0']) expect(checklist).toContain(step);
    expect(checklist).not.toContain('[x]');
  });

  it('records test imports under "Testimporte" in a table with date, Abacus version, interface version, import program and result', () => {
    expect(section(MAINTAINERS, '## Testimporte')).toContain('| Datum | Abacus-Version | Schnittstellenversion | Programm | Ergebnis |');
  });

  it('plans later only items inside this product, no other target formats and no BMD-only items', () => {
    const backlog = section(MAINTAINERS, '## Später geplant');
    for (const item of ['Saldosteuersatz', 'Debitoren-Schnittstelle', 'Wöchentlicher Rhythmus', 'Sammelbuchung pro Tag', 'Gebühren aus Abrechnungsdateien', 'E-Mail-Versand', 'Dauerprozess mit eigenem Zeitplan', 'Überwachung und Alarme', 'Dependabot', 'Veröffentlichung auf npm oder in einer Registry']) {
      expect(backlog).toContain(item);
    }
    expect(backlog).not.toMatch(/DATEV|RZL|lexoffice|Mews|Smoobu|Zielformat/);
    expect(backlog).not.toMatch(/\bBMD\b|Personenkonten-Datei|BMD Com/);
  });

  it('Metadata applied: records the gh repo edit command with the Swiss description and every topic, removes BMD and DATEV topics and leaves the visibility alone', () => {
    const topics = ['apaleo', 'abacus', 'abacus-export', 'abaconnect', 'abacus-fibu', 'mwst', 'kmu-kontenrahmen', 'hotel', 'hospitality', 'accounting', 'buchhaltung', 'treuhand', 'switzerland', 'schweiz'];
    const privateSection = section(MAINTAINERS, '## Das Repository ist vorerst privat');
    expect(privateSection).toContain(`--add-topic ${topics.join(',')}`);
    expect(privateSection).toMatch(/--description "Kostenloser apaleo Abacus Export .*Abacus Finanzbuchhaltung .*für Hotels in der Schweiz/);
    expect(privateSection).toMatch(/--remove-topic [^\n]*\bbmd\b[^\n]*\bdatev\b/);
    expect(privateSection).not.toMatch(/--description "[^"]*\b(BMD|DATEV)\b|--add-topic [^\n]*\b(bmd|datev|ekr|austria|oesterreich)\b/);
    expect(privateSection).not.toContain('--visibility');
    expect(privateSection).toContain('gh repo view krautdawg/apaleo-abacus-export --json description,repositoryTopics,visibility');
  });
});

describe('readme-quickstart CI job', () => {
  const workflow = parse(readRepoFile('.github/workflows/ci.yml')) as { jobs: Record<string, { steps: { run?: string }[] }> };
  const runs = workflow.jobs['readme-quickstart']?.steps.map((step) => step.run ?? '') ?? [];

  it('extracts the README block after the quickstart marker, runs it, then the demo dry run and checks its Abacus summary', () => {
    expect(runs.join('\n')).toContain('<!-- quickstart -->');
    expect(runs).toContain('bash -euxo pipefail "$RUNNER_TEMP/quickstart.sh"');
    const demo = runs.at(-1) ?? '';
    expect(demo.startsWith('node dist/cli/main.js export --month 2026-09 --demo --dry-run | tee "$RUNNER_TEMP/demo.txt"\n')).toBe(true);
    for (const line of ['^Import into Abacus FIBU', '^Totals per Abacus account', '^  313 3.8 % (Ziffer 343): net ', '^DEMO Result: dry run']) {
      expect(demo).toContain(`grep -q '${line}`);
    }
  });
});
