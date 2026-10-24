import { describe, expect, it } from 'vitest';
import type { Command } from '../src/cli/command.js';
import { COMMANDS } from '../src/cli/commands/index.js';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  checkCommandLines,
  checkCompatibilityClaims,
  checkConfigKeys,
  checkFindingCodes,
  checkGerman,
  checkInformalAddress,
  checkLinks,
  checkPendingImport,
  checkPracticeTerms,
  configPaths,
  documentationFiles,
  findingCodes,
  functionWords,
  headingSlugs,
  kanzleiTestImports,
  linkTargets,
  PENDING_IMPORT,
  readRepoFile,
  recordedOdooVersions,
  recordedTestImports,
  ROOT,
  shellLines,
  sourceFiles,
  splitLanguageFiles,
} from './helpers/docs.js';

/**
 * Docs never drift from the code (s08 design decision 5): every command line in
 * an sh/bash fence, every backticked config key and every finding code in the
 * documentation must exist in the code. Since s09 (design decision 7) every
 * relative link and anchor must resolve, and the docs are German, with "du".
 * Since a08 (design decisions 1, 5 and 6) no German file uses terms of Austrian
 * BMD practice, BMD and DATEV are named only where they must be, and no tested
 * import is claimed before one is recorded. Since o01 (design decision 3) every
 * doc may be German as written in Germany: "ß", `19 %`, SKR03 and UStVA pass,
 * in every file, without a list of files.
 */
const FILES = documentationFiles();
const GERMAN_FILES = FILES.filter((file) => file !== 'README.en.md');
const TROUBLESHOOTING = 'docs/troubleshooting.md';
const ENGLISH_README = 'README.en.md';
const DISCLAIMER_TRANSLATION = '## English (non-binding translation)';
/** The German text of a file; `DISCLAIMER.md` carries a non-binding English translation after its German text. */
const germanPart = (file: string) => readRepoFile(file).split(DISCLAIMER_TRANSLATION)[0] ?? '';

describe('README and docs match the code', () => {
  it('covers the READMEs, the community files, the docs folder and the demo README', () => {
    expect(FILES).toEqual(
      expect.arrayContaining([
        'README.md',
        ENGLISH_README,
        'docs/setup-apaleo.md',
        'docs/mapping-guide.md',
        'docs/configuration.md',
        TROUBLESHOOTING,
        'CONTRIBUTING.md',
        'SECURITY.md',
        'CODE_OF_CONDUCT.md',
        'DISCLAIMER.md',
        'CHANGELOG.md',
        'docs/examples/README.md',
        'docs/odoo-import.md',
        'docs/odoo-format.md',
        'examples/demo/README.md',
      ]),
    );
  });

  it('reads the command lines of the README, also in indented fences of the quick start', () => {
    const lines = shellLines(readRepoFile('README.md')).filter((line) => /^(apaleo-odoo|node dist\/cli\/main\.js) /.test(line));
    expect(lines).toEqual(expect.arrayContaining(['apaleo-odoo export --month 2026-09 --dry-run', 'node dist/cli/main.js export --month 2026-09 --demo --dry-run']));
    expect(lines.length).toBeGreaterThanOrEqual(8);
  });

  it.each(FILES)('%s: every apaleo-odoo command and flag in a shell fence exists', (file) => {
    expect(checkCommandLines(file, readRepoFile(file), COMMANDS)).toEqual([]);
  });

  // The changelog records keys of earlier versions, such as the removed abacus section.
  it.each(FILES.filter((file) => file !== 'CHANGELOG.md'))('%s: every backticked config key exists in the schema', (file) => {
    expect(checkConfigKeys(file, readRepoFile(file))).toEqual([]);
  });

  it.each(FILES)('%s: every relative link and anchor resolves', (file) => {
    expect(checkLinks(file, readRepoFile(file))).toEqual([]);
  });

  it.each(FILES.filter((file) => file !== ENGLISH_README))('%s: the prose is German', (file) => {
    expect(checkGerman(file, germanPart(file))).toEqual([]);
  });

  it.each(FILES.filter((file) => file !== 'CODE_OF_CONDUCT.md'))('%s: addresses the reader with "du", never "Sie"', (file) => {
    expect(checkInformalAddress(file, germanPart(file))).toEqual([]);
  });

  it.each(GERMAN_FILES)('%s: no Austrian BMD terms, BMD and DATEV only where allowed', (file) => {
    expect(checkPracticeTerms(file, germanPart(file))).toEqual([]);
  });

  it('checks every German file, not a list of files', () => {
    expect(GERMAN_FILES).toEqual(expect.arrayContaining(['README.md', 'CODE_OF_CONDUCT.md', 'CHANGELOG.md', 'DISCLAIMER.md', 'docs/setup-apaleo.md', 'docs/export.md', 'docs/architecture.md']));
    expect(GERMAN_FILES).toHaveLength(FILES.length - 1);
  });

  it.each(FILES)('%s: claims no tested Odoo import that docs/maintainers.md does not record', (file) => {
    expect(checkCompatibilityClaims(file, readRepoFile(file), recordedTestImports(readRepoFile('docs/maintainers.md')))).toEqual([]);
  });

  it('has no docs/bmd-*.md, docs/datev-*.md or docs/abacus-*.md guide, and the Odoo guides instead', () => {
    expect(FILES.filter((file) => /^docs\/(bmd|datev|abacus)-/.test(file))).toEqual([]);
    expect(FILES).toEqual(expect.arrayContaining(['docs/odoo-import.md', 'docs/odoo-format.md']));
  });

  it('Abacus guides are gone: neither file exists, no doc links one, and README and docs link the Odoo guides', () => {
    for (const gone of ['docs/abacus-import.md', 'docs/abacus-format.md']) expect(existsSync(join(ROOT, gone)), gone).toBe(false);
    for (const file of FILES) expect(linkTargets(readRepoFile(file)).filter((target) => /(?:^|\/)abacus-[a-z]+\.md/.test(target)), file).toEqual([]);
    expect(readRepoFile('README.md')).toContain('](docs/odoo-import.md)');
    expect(readRepoFile('README.md')).toContain('](docs/odoo-format.md)');
    expect(readRepoFile('README.en.md')).toContain('](docs/odoo-import.md)');
    for (const doc of ['docs/configuration.md', 'docs/architecture.md', 'docs/docker.md', 'docs/export.md']) expect(readRepoFile(doc), doc).toContain('](odoo-import.md');
  });

  it('Former file names: no doc links a docs/bmd-*.md guide', () => {
    for (const file of FILES) expect(linkTargets(readRepoFile(file)).filter((target) => /(?:^|\/)bmd-[a-z]+\.md/.test(target)), file).toEqual([]);
  });

  it('README.en.md and the translation in DISCLAIMER.md are the only English texts', () => {
    expect(checkGerman(ENGLISH_README, readRepoFile(ENGLISH_README))).toHaveLength(1);
    expect(checkGerman('DISCLAIMER.md', readRepoFile('DISCLAIMER.md').split(DISCLAIMER_TRANSLATION)[1] ?? '')).toHaveLength(1);
  });

  it('has no *.de.md file and no link to one', () => {
    expect(splitLanguageFiles()).toEqual([]);
    for (const file of FILES) expect(linkTargets(readRepoFile(file)).filter((target) => target.includes('.de.md')), file).toEqual([]);
  });

  it('docs/troubleshooting.md documents every finding code in src, and only those', () => {
    const source = new Set(sourceFiles().flatMap((file) => [...findingCodes(readRepoFile(file))]));
    expect(source.size).toBeGreaterThan(40);
    expect(checkFindingCodes(source, findingCodes(readRepoFile(TROUBLESHOOTING)), TROUBLESHOOTING)).toEqual([]);
  });
});

describe('the docs checks', () => {
  const sh = (...lines: string[]) => ['Some text.', '', '```sh', ...lines, '```', ''].join('\n');

  it('names a stale flag, its command and the file', () => {
    const problems = checkCommandLines('docs/odoo-import.md', sh('apaleo-odoo export --month 2026-10 --email'), COMMANDS);
    expect(problems).toEqual(['docs/odoo-import.md: "apaleo-odoo export --month 2026-10 --email": --email is not an option of "export"']);
  });

  it('Old binary in a doc: names apaleo-abacus and the file, and passes once the line reads apaleo-odoo', () => {
    const old = readRepoFile('test/fixtures/docs/old-binary.md');
    expect(checkCommandLines('docs/export.md', old, COMMANDS)).toEqual([
      'docs/export.md: "apaleo-abacus export --month 2026-10": apaleo-abacus is the binary of another project; write apaleo-odoo',
    ]);
    expect(checkCommandLines('docs/export.md', old.replace('apaleo-abacus export', 'apaleo-odoo export'), COMMANDS)).toEqual([]);
    expect(checkCommandLines('docs/x.md', sh('docker compose run --rm apaleo-abacus schedule --once'), COMMANDS)).toEqual([expect.stringContaining('apaleo-abacus is the binary')]);
  });

  it('Old binary of the earlier projects in a doc: names apaleo-bmd and apaleo-datev, not a clone URL or a cd line', () => {
    expect(checkCommandLines('docs/export.md', sh('apaleo-bmd export --month 2026-10'), COMMANDS)).toEqual([
      'docs/export.md: "apaleo-bmd export --month 2026-10": apaleo-bmd is the binary of another project; write apaleo-odoo',
    ]);
    expect(checkCommandLines('docs/export.md', sh('apaleo-odoo export --month 2026-10'), COMMANDS)).toEqual([]);
    expect(checkCommandLines('docs/x.md', sh('docker compose run --rm apaleo-datev export --month 2026-10'), COMMANDS)).toEqual([expect.stringContaining('apaleo-datev is the binary')]);
    expect(checkCommandLines('docs/x.md', sh('cd apaleo-odoo-export   # not apaleo-bmd', 'git clone https://github.com/krautdawg/apaleo-bmd-export.git', 'cd apaleo-abacus-export'), COMMANDS)).toEqual([]);
    expect(checkCommandLines('docs/x.md', '`apaleo-bmd export`\n```text\napaleo-bmd export\n```\n', COMMANDS)).toEqual([]);
  });

  it('names a renamed command and the file', () => {
    const renamed: Command[] = COMMANDS.map((command) => (command.name === 'export' ? { ...command, name: 'write' } : command));
    const problems = checkCommandLines('README.md', sh('apaleo-odoo export --month 2026-10 --dry-run'), renamed);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/^README\.md: "apaleo-odoo export --month 2026-10 --dry-run": "export" is not a command/);
  });

  it('reads two-word commands, global flags, both program spellings and stops at comments and pipes', () => {
    const text = sh(
      'apaleo-odoo mapping check --property BSP --from 2026-09-01 --to 2026-09-30   # --nonsense in a comment',
      'node dist/cli/main.js --help        # or: pnpm link --global',
      'node dist/cli/main.js export --month 2026-09 --demo --dry-run --debug | tee out.txt --x',
      'apaleo-odoo live-smoke --property BER [--date 2026-10-18]',
      'APALEO_CLIENT_SECRET=... apaleo-odoo export --unknown',
      'docker compose run --rm apaleo-odoo export --month 2026-10',
    );
    expect(checkCommandLines('docs/x.md', text, COMMANDS)).toEqual([]);
    expect(checkCommandLines('docs/x.md', sh('apaleo-odoo mapping --property BSP'), COMMANDS)).toHaveLength(1);
    expect(checkCommandLines('docs/x.md', sh('apaleo-odoo live-smoke [--days 3]'), COMMANDS)).toEqual([
      'docs/x.md: "apaleo-odoo live-smoke [--days 3]": --days is not an option of "live-smoke"',
    ]);
  });

  it('ignores command lines outside sh and bash fences', () => {
    const text = ['`apaleo-odoo export --email`', '```text', 'apaleo-odoo export --email', '```', '```yaml', 'apaleo-odoo: --email', '```'].join('\n');
    expect(checkCommandLines('docs/x.md', text, COMMANDS)).toEqual([]);
    expect(checkCommandLines('docs/x.md', ['```bash', 'apaleo-odoo export --email', '```'].join('\n'), COMMANDS)).toHaveLength(1);
  });

  it('names a stale config key and the file', () => {
    expect(checkConfigKeys('docs/configuration.md', 'Set `posting.aggregate` to true.')).toEqual([
      'docs/configuration.md: `posting.aggregate` is not a config key',
    ]);
  });

  it('Stale Odoo config key: names odoo.beraternummer and the file', () => {
    expect(checkConfigKeys('docs/configuration.md', readRepoFile('test/fixtures/docs/stale-odoo-key.md'))).toEqual([
      'docs/configuration.md: `odoo.beraternummer` is not a config key',
    ]);
    expect(checkConfigKeys('docs/x.md', 'Trag `odoo.currency` ein.', new Set(['odoo.currency']))).toEqual([]);
  });

  it('knows nested, defaulted and array keys of the schema', () => {
    const paths = configPaths();
    for (const key of ['apaleo.clientId', 'odoo.journal', 'odoo.taxRounding', 'posting.text2', 'schedule.monthly.dayOfMonth', 'checks.aggregates', 'properties[].mapping', 'properties[].journal']) {
      expect(paths.has(key), key).toBe(true);
    }
    for (const key of ['bmd.buchsymbol', 'properties[].buchsymbol', 'posting.extbelegnr', 'abacus', 'abacus.mandant', 'properties[].mandant', 'properties[].geschaeftsbereich']) {
      expect(paths.has(key), key).toBe(false);
    }
    expect(checkConfigKeys('docs/x.md', '`properties[].journal` and `properties[].kanzlei`')).toEqual([
      'docs/x.md: `properties[].kanzlei` is not a config key',
    ]);
    expect(checkConfigKeys('docs/configuration.md', 'Der alte Abschnitt `bmd.buchsymbol` ist kein Schlüssel mehr.')).toEqual([]);
    expect(checkConfigKeys('docs/x.md', 'Setz `abacus.mandant` und `properties[].geschaeftsbereich`.')).toEqual([
      'docs/x.md: `abacus.mandant` is not a config key',
      'docs/x.md: `properties[].geschaeftsbereich` is not a config key',
    ]);
  });

  it('ignores other backticked text and keys inside code fences', () => {
    const text = [
      'The file name starts with `BMD_`, cash goes to `2700`, the type is `Revenues`,',
      'the host is `api.apaleo.com`, a value is `checks.aggregates: true`, and `bmd` alone is a section.',
      '```yaml',
      '`posting.aggregate`',
      '```',
    ].join('\n');
    expect(checkConfigKeys('docs/x.md', text)).toEqual([]);
  });

  it('reports finding codes missing from the troubleshooting page and codes that no longer exist', () => {
    const problems = checkFindingCodes(new Set(['E-UNMAPPED', 'W-NEW-CODE']), findingCodes('`E-UNMAPPED` and `N-GONE`, E- prefix, E-Mail'), TROUBLESHOOTING);
    expect(problems).toEqual([
      'docs/troubleshooting.md: W-NEW-CODE is used in src but not documented',
      'docs/troubleshooting.md: N-GONE is documented but no longer exists in src',
    ]);
  });
});

describe('the link and anchor check', () => {
  it('names a link to a missing file', () => {
    expect(checkLinks('README.md', 'See [the guide](docs/missing.md).')).toEqual(['README.md: link "docs/missing.md": docs/missing.md does not exist']);
  });

  it('names an anchor that is not a heading of the target, and passes once it is', () => {
    expect(checkLinks('README.md', '[Docker](docs/docker.md#the-demo-in-the-image)')).toEqual([
      'README.md: link "docs/docker.md#the-demo-in-the-image": #the-demo-in-the-image is not a heading of docs/docker.md',
    ]);
    expect(checkLinks('README.md', '[Docker](docs/docker.md#die-demo-im-image)')).toEqual([]);
  });

  it('keeps umlauts in anchors, also percent-encoded', () => {
    expect(checkLinks('docs/x.md', '[FAQ](../README.md#häufige-fragen) and [FAQ](../README.md#h%C3%A4ufige-fragen)')).toEqual([]);
  });

  it('numbers duplicate headings and resolves anchors in the same file', () => {
    const text = ['# Titel', '## Beispiel', '## Beispiel', '', '[zweites](#beispiel-1) und [drittes](#beispiel-2)'].join('\n');
    expect([...headingSlugs(text)]).toEqual(['titel', 'beispiel', 'beispiel-1']);
    expect(checkLinks('docs/x.md', text)).toEqual(['docs/x.md: link "#beispiel-2": #beispiel-2 is not a heading of docs/x.md']);
  });

  it('slugs headings like GitHub: punctuation and backticks dropped, links reduced to their text', () => {
    const text = ['## Festschreibung: 0 oder 1', '### `apaleo`', '## 1. App anlegen', '## Siehe [Leitfaden](x.md)', '```sh', '# kein Heading', '```'].join('\n');
    expect([...headingSlugs(text)]).toEqual(['festschreibung-0-oder-1', 'apaleo', '1-app-anlegen', 'siehe-leitfaden']);
  });

  it('skips external links and links inside code', () => {
    const text = ['[CI](https://github.com/x/y) [Mail](mailto:a@b.de) `[x](nope.md)`', '```md', '[x](nope.md)', '```'].join('\n');
    expect(checkLinks('README.md', text)).toEqual([]);
  });
});

describe('the language checks', () => {
  const german = 'Das Tool liest das Buchungsjournal und schreibt eine Datei für die Buchhaltung. Du prüfst die Datei mit der Buchhaltung, und sie ist nicht fertig, bis die Buchhaltung sie freigibt. Ein Export wird nie zweimal geschrieben, das ist die Regel für jeden Monat auf deinem Rechner.';

  it('accepts German prose and ignores code', () => {
    expect(checkGerman('docs/x.md', `${german}\n\n\`\`\`sh\nthe and with is are for not you your this that\n\`\`\`\n`)).toEqual([]);
  });

  it('names a file whose prose is English', () => {
    const english = 'This is the export. You run it with your config, and the file is written for the Treuhänder. That is not all: the protocol is there too.';
    expect(checkGerman('docs/troubleshooting.md', `${german}\n\n${english}\n${english}\n${english}`)).toEqual([
      expect.stringMatching(/^docs\/troubleshooting\.md: the prose is not German/),
    ]);
    expect(checkGerman('docs/x.md', 'Die Datei.')).toHaveLength(1);
  });

  it('finds an English section that a long German doc would outweigh', () => {
    // The English "Docker Compose" section of the s08 docs/docker.md, appended to the German troubleshooting page.
    const englishSection = readRepoFile('test/fixtures/docs/english-docker-compose.md');
    const markdown = `${readRepoFile(TROUBLESHOOTING)}\n${englishSection}`;
    const { german, english } = functionWords(markdown);
    expect(german).toBeGreaterThanOrEqual(3 * english);
    expect(checkGerman(TROUBLESHOOTING, markdown)).toEqual(
      expect.arrayContaining([expect.stringMatching(/^docs\/troubleshooting\.md: section "Docker Compose \(recommended\)" is not German/)]),
    );
  });

  it('finds an English paragraph inside a German section', () => {
    const english = 'The service runs the export, and the file is written for you. That is not all: this is the protocol for your Treuhänder.';
    const markdown = `## Ablauf\n\n${german}\n\n${german}\n\n${german}\n\n${english}\n`;
    expect(checkGerman('docs/x.md', markdown)).toEqual([expect.stringMatching(/^docs\/x\.md: section "Ablauf" has an English paragraph: "The service runs/)]);
    expect(checkGerman('docs/x.md', `## Ablauf\n\n${german}\n\nDu startest den Container mit \`docker compose up\`, and fertig.\n`)).toEqual([]);
  });

  it('rejects the polite address and accepts "Sie" at the start of a sentence', () => {
    expect(checkInformalAddress('docs/x.md', 'Prüfen Sie die Datei.')).toEqual([
      'docs/x.md: "Prüfen Sie die Datei.": "Sie" is the polite address; write "du"',
    ]);
    expect(checkInformalAddress('docs/x.md', 'Fragen Sie Ihren Treuhänder.')).toHaveLength(2);
    expect(checkInformalAddress('docs/x.md', 'Wenn das passt, senden Sie die Datei.')).toHaveLength(1);
    expect(checkInformalAddress('docs/x.md', 'Danke, Ihr Team')).toHaveLength(1);
    expect(checkInformalAddress('docs/x.md', 'Das prüft Ihr Treuhänder.')).toHaveLength(1);
    expect(checkInformalAddress('docs/x.md', 'Die Buchhaltung bucht. Sie prüft die Datei.\n- Sie bekommt das Protokoll.\n**Sie** entscheidet.')).toEqual([]);
  });
});

describe('the practice terms check', () => {
  const problemsOf = (file: string, text: string) => checkPracticeTerms(file, text);

  it('Austrian paragraph copied: names the file and the term Buchungssymbol, not Kanzlei', () => {
    expect(problemsOf('docs/mapping-guide.md', 'Die Kanzlei legt das Buchungssymbol an.')).toEqual([
      'docs/mapping-guide.md: "Die Kanzlei legt das Buchungssymbol an.": "Buchungssymbol" is a term of Austrian BMD practice',
    ]);
    for (const term of ['Steuercode', 'Einheitskontenrahmen', 'EKR', 'UVA', 'Ortstaxe', 'Nächtigungsabgabe', 'Personenkonto']) {
      expect(problemsOf('docs/x.md', `Hier steht ${term} im Text.`), term).toEqual([expect.stringContaining(`"${term}"`)]);
    }
    expect(problemsOf('docs/x.md', 'Die Hauskanzlei, das BMDX-Feld, 2,0 % und 110 % sind keine Treffer. `BMD` und `Kanzlei` im Code auch nicht.')).toEqual([]);
  });

  it('German rate no longer forbidden: 19 %, 7 % and the German accounting terms pass, 10 % is still reported', () => {
    expect(problemsOf('docs/mapping-guide.md', 'Getränke mit 19 %.')).toEqual([]);
    expect(problemsOf('docs/mapping-guide.md', 'Konten nach SKR03.')).toEqual([]);
    for (const term of ['SKR03', 'SKR04', 'UStVA', 'Kennzahl', 'Kanzlei', 'Beherbergungsteuer', 'Übernachtungsteuer', '7 %', '19 %', '7%']) {
      expect(problemsOf('docs/x.md', `Hier steht ${term} im Text.`), term).toEqual([]);
    }
    expect(problemsOf('docs/posting-rules.md', 'Beherbergung mit 10 %.')).toEqual([expect.stringMatching(/^docs\/posting-rules\.md: .*"10 %"/)]);
    for (const rate of ['13 %', '20 %', '20%']) expect(problemsOf('docs/x.md', `Logis mit ${rate}.`), rate).toHaveLength(1);
    expect(problemsOf('docs/x.md', 'Nie 110 %, 120 % oder 2,0 %. `10 %` im Code.\n\n```text\nKurtaxe 10 %\n```\n')).toEqual([]);
  });

  it('Bare target mention: names the file and the token BMD or DATEV', () => {
    expect(problemsOf('docs/odoo-import.md', 'Das läuft wie beim BMD-Import.')).toEqual([
      'docs/odoo-import.md: "Das läuft wie beim BMD-Import.": "BMD" is named outside a link to an origin project, the other target formats and the findings for a copied setup',
    ]);
    expect(problemsOf('docs/odoo-import.md', 'Das läuft wie beim DATEV-Import.')).toEqual([expect.stringContaining('"DATEV" is named outside')]);
  });

  it('Allowed origin mention: the README origin sentence and the other target formats, the changelog and the copied-setup findings', () => {
    const readme = [
      'Das Tool baut auf [apaleo-bmd-export](https://github.com/krautdawg/apaleo-bmd-export) und [apaleo-datev-export](https://github.com/krautdawg/apaleo-datev-export) auf; wer mit BMD oder DATEV bucht, nimmt eines davon.',
      '',
      '## Was es nicht macht',
      '',
      '- Nur apaleo und keine anderen Zielformate wie DATEV oder BMD.',
    ].join('\n');
    expect(problemsOf('README.md', readme)).toEqual([]);
    expect(problemsOf('docs/x.md', readme)).toHaveLength(4);
    expect(problemsOf('README.md', '## Was es macht\n\n- Keine anderen Zielformate wie DATEV.\n')).toHaveLength(1);
    expect(problemsOf('CHANGELOG.md', 'Entfernt: der BMD-Writer, die EKR-Vorlage und die Steuercodes.')).toEqual([]);
    const troubleshooting = `## Kontenzuordnung\n\nKein BMD hier.\n\n## Einrichtung aus Deutschland oder Österreich übernommen\n\nEine BMD-Zuordnung mit 10 % und Steuercode, eine DATEV-Zuordnung mit 7 % und BU-Schlüssel.\n`;
    expect(problemsOf('docs/troubleshooting.md', troubleshooting)).toEqual([expect.stringContaining('"Kein BMD hier."')]);
  });

  it('FAQ answer on BMD and DATEV: passes in a line that links the origin projects, while "**DATEV?** Nein." is reported', () => {
    const faq = [
      '## Häufige Fragen',
      '',
      '**Gibt es das auch für BMD oder DATEV?** Ja: [apaleo-bmd-export](https://github.com/krautdawg/apaleo-bmd-export) und [apaleo-datev-export](https://github.com/krautdawg/apaleo-datev-export/).',
    ].join('\n');
    expect(problemsOf('README.md', faq)).toEqual([]);
    expect(problemsOf('README.md', '## Häufige Fragen\n\n**DATEV?** Nein.\n')).toEqual([expect.stringContaining('"DATEV" is named outside')]);
    expect(problemsOf('README.md', '**BMD?** Siehe [das Projekt](https://github.com/krautdawg/elsewhere).')).toHaveLength(1);
  });
});

describe('spelling during the transition (o01)', () => {
  const germany = readRepoFile('test/fixtures/docs/germany-configuration.md');
  /** Every check the docs test runs on one German file. */
  const allChecks = (file: string, text: string) => [
    ...checkCommandLines(file, text, COMMANDS),
    ...checkConfigKeys(file, text),
    ...checkLinks(file, text),
    ...checkGerman(file, text),
    ...checkInformalAddress(file, text),
    ...checkPracticeTerms(file, text),
    ...checkCompatibilityClaims(file, text, []),
  ];

  it('Sharp s in any doc: "gemäß" and "Buchungssätze" pass in docs/configuration.md and every other file', () => {
    expect(germany).toContain('Die Datei enthält die Buchungssätze eines Monats, gemäß der Kontenzuordnung');
    for (const file of ['docs/configuration.md', 'docs/docker.md', 'README.md', 'CODE_OF_CONDUCT.md']) expect(allChecks(file, germany), file).toEqual([]);
  });

  it('German rate no longer forbidden: "Getränke mit 19 %" and "SKR03" pass in docs/mapping-guide.md', () => {
    expect(germany).toContain('Getränke mit 19 %');
    expect(germany).toContain('SKR03');
    expect(allChecks('docs/mapping-guide.md', germany)).toEqual([]);
  });

  it('No transition list: a new docs/odoo-format.md is checked like every other doc, and no list names it', () => {
    const root = mkdtempSync(join(tmpdir(), 'apaleo-odoo-docs-'));
    try {
      mkdirSync(join(root, 'docs'));
      writeFileSync(join(root, 'docs', 'odoo-format.md'), germany);
      expect(documentationFiles(root)).toContain('docs/odoo-format.md');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
    expect(allChecks('docs/odoo-format.md', germany)).toEqual([]);
    const helper = readRepoFile('test/helpers/docs.ts');
    expect(helper).not.toMatch(/\b(?:GERMANY|GERMAN|SWISS)_FILES\b/);
    expect(helper).not.toContain('odoo-format.md');
  });
});

describe('the compatibility claim check', () => {
  const HEADER = ['| Datum | Odoo-Version | Edition und Hosting | Kontenrahmen | Rundungsmethode | Ergebnis | Geprüft von |', '|---|---|---|---|---|---|---|'];
  const maintainers = (rows: string[]) => ['## Testimporte', '', ...HEADER, ...rows, '', '## Später geplant', '| x | y |'].join('\n');
  const LOCAL_18 = '| 2026-10-24 | 18.0 (`odoo:18.0-20261015`) | Community, lokal (Docker) | SKR03 | Round per Line | ohne Nacharbeit | Maintainer, lokal |';
  const KANZLEI_19 = '| 2026-11-10 | 19.0 | Enterprise, Odoo Online | SKR04 | Round per Tax | ohne Nacharbeit | Kanzlei Beispiel |';
  const recorded = (...rows: string[]) => recordedTestImports(maintainers(rows));

  it('counts the recorded test imports with all seven fields, not the header, an empty row or a partial row', () => {
    expect(recorded()).toEqual([]);
    expect(recorded('|  |  |  |  |  |  |  |')).toEqual([]);
    expect(recorded('| 2026-11-10 | 18.0 | Community, lokal | SKR03 | Round per Line | ok |  |', '| TBD |')).toEqual([]);
    expect(recorded('| 2026-11-10 | Abacus 2025 | 2015.00 | F5534 | ohne Fehler |')).toEqual([]);
    expect(recorded(LOCAL_18)).toEqual([['2026-10-24', '18.0 (`odoo:18.0-20261015`)', 'Community, lokal (Docker)', 'SKR03', 'Round per Line', 'ohne Nacharbeit', 'Maintainer, lokal']]);
    expect(recordedOdooVersions(recorded(LOCAL_18, KANZLEI_19))).toEqual(new Set([18, 19]));
  });

  it('reads the local Odoo runs of docs/maintainers.md as recorded imports for 17, 18 and 19, none checked by a Kanzlei', () => {
    const rows = recordedTestImports(readRepoFile('docs/maintainers.md'));
    expect(rows.length).toBeGreaterThanOrEqual(6);
    expect(recordedOdooVersions(rows)).toEqual(new Set([17, 18, 19]));
    expect(kanzleiTestImports(rows)).toEqual([]);
    expect(readRepoFile('docs/maintainers.md')).not.toMatch(/Abacus-Version|Schnittstellenversion/);
  });

  it('Claim without a recorded import: names the README and the phrase', () => {
    expect(checkCompatibilityClaims('README.md', 'Die Datei ist getestet mit Odoo 18.', recorded())).toEqual([
      'README.md: "getestet mit Odoo" claims a tested import, but docs/maintainers.md records no import with Odoo 18 under ## Testimporte',
    ]);
    expect(checkCompatibilityClaims('README.md', 'Die Datei ist kompatibel mit Odoo.', recorded())).toEqual([
      'README.md: "kompatibel mit Odoo" claims a tested import, but docs/maintainers.md records no import under ## Testimporte',
    ]);
    expect(checkCompatibilityClaims('docs/x.md', 'Kompatibel mit Odoo 17 und Odoo-zertifiziert.', recorded())).toHaveLength(2);
  });

  it('Recorded import allows the claim: a row with all seven fields for Odoo 18 allows "getestet mit Odoo 18", not 17', () => {
    expect(checkCompatibilityClaims('README.md', 'Die Datei ist getestet mit Odoo 18.', recorded(LOCAL_18))).toEqual([]);
    expect(checkCompatibilityClaims('README.md', 'Die Datei ist getestet mit Odoo.', recorded(LOCAL_18))).toEqual([]);
    expect(checkCompatibilityClaims('README.md', 'Die Datei ist getestet mit Odoo 17 und 18.', recorded(LOCAL_18))).toEqual([
      'README.md: "getestet mit Odoo" claims a tested import, but docs/maintainers.md records no import with Odoo 17 under ## Testimporte',
    ]);
    expect(checkCompatibilityClaims('README.md', 'Die Datei ist mit Odoo 19 getestet.', recorded(LOCAL_18, KANZLEI_19))).toEqual([]);
  });

  it.each([
    'Die Datei ist mit Odoo 18 getestet.',
    'Die Datei wurde in\nOdoo erfolgreich getestet.',
    'Der Export ist Odoo-kompatibel.',
    'Die Datei wird von Odoo akzeptiert.',
    'The file is tested with Odoo 18.',
    'An Odoo-certified import file.',
    'Die Datei wurde mit\nOdoo 17 erfolgreich getestet.',
    'Die Datei ist kompatibel zu Odoo.',
    'Die Datei ist mit Odoo Online kompatibel.',
    'Die Datei wird von Odoo Enterprise akzeptiert.',
    'Zertifiziert durch Odoo.',
    'An Odoo-compatible import file.',
    'The file is compatible with Odoo 19.',
    'Odoo certified.',
    'The file is accepted by Odoo.',
    'Die Datei ist Odoo-zertifiziert.',
  ])('Claim in other words or in English: finds "%s"', (text) => {
    expect(checkCompatibilityClaims('README.en.md', text, recorded())).toHaveLength(1);
  });

  it('passes the pending-import wording and other uses of the words', () => {
    for (const text of [
      PENDING_IMPORT,
      "The file follows Odoo's documented import of journal entries; a first test import with a Steuerberater is still pending.",
      'Zwei Lint-Regeln (getestet in `test/lint/`) sorgen dafür, dass das so bleibt.',
      'Kein zertifiziertes Archiv. Odoo legt die Steuerzeilen selbst an.',
      'Der Maintainer hat die Datei lokal in Odoo 17, 18 und 19 Community importiert.',
    ]) {
      expect(checkCompatibilityClaims('README.md', text, recorded()), text).toEqual([]);
    }
  });

  it('Pending test import: the sentence must stay until a row names a Kanzlei under "Geprüft von"', () => {
    const readme = `# Titel\n\n**Stand:** ${PENDING_IMPORT}\n`;
    expect(checkPendingImport('README.md', readme, recorded(LOCAL_18))).toEqual([]);
    expect(checkPendingImport('README.md', '# Titel\n\nGetestet mit Odoo 18.\n', recorded(LOCAL_18))).toEqual([
      `README.md: must say "${PENDING_IMPORT}" until docs/maintainers.md records a test import checked by a Kanzlei under ## Testimporte`,
    ]);
    expect(checkPendingImport('README.md', '# Titel\n\nGetestet mit Odoo 19.\n', recorded(LOCAL_18, KANZLEI_19))).toEqual([]);
  });
});

describe('docs/docker.md (a07)', () => {
  const docker = readRepoFile('docs/docker.md');

  it('names the path of the monthly Abacus file and its protocol for one property, and that nothing is sent by e-mail or to a cloud', () => {
    expect(docker).toContain('/data/<Hotel>/<JJJJ-MM>/');
    expect(docker).toContain('`/data/BSP/2026-10/ABACUS_Buchungen_20261001-20261031_BSP.xml`');
    expect(docker).toContain('`/data/BSP/2026-10/ABACUS_Buchungen_20261001-20261031_BSP.protokoll.txt`');
    expect(docker).toContain('Das Tool verschickt nichts per E-Mail und lädt nichts in eine Cloud');
  });

  it('leaves the handover to the hotel: a shared folder or the Treuhänder\'s own transfer', () => {
    const section = docker.slice(docker.indexOf('## Wo dein Treuhänder die Dateien findet'), docker.indexOf('## Cron auf dem Host'));
    expect(section).toContain('entscheidet ihr im Hotel');
    expect(section).toContain('freigegebenen Ordner');
    expect(section).toContain('Datenaustausch, den dein Treuhänder ohnehin anbietet');
  });

  it('documents the compose loop, the host-cron alternative, the default time zone Europe/Zurich and the demo in the image', () => {
    expect(docker).toContain('docker compose -f docker-compose.example.yml up -d --build');
    expect(docker).toContain('## Cron auf dem Host statt der Schleife');
    expect(docker).toContain('docker compose -f docker-compose.example.yml run --rm apaleo-odoo schedule --once >> schedule.log 2>&1');
    expect(docker).toContain('(Standard `Europe/Zurich`)');
    expect(docker).not.toContain('Vienna');
    expect(docker).toContain('docker run --rm -w /data -v "$PWD/data:/data" apaleo-odoo-export:local export --month 2026-09 --demo');
    expect(docker).toContain('uid 1000');
    expect(docker).toContain('ABACUS_Buchungen_20260901-20260930_BSP_DEMO.xml');
  });

  it('gives the chown command for E-EXPORT as the export prints it', () => {
    expect(docker).toContain('`E-EXPORT`');
    expect(docker).toContain('`sudo chown -R 1000:1000 data`');
  });
});
