import { describe, expect, it } from 'vitest';
import type { Command } from '../src/cli/command.js';
import { COMMANDS } from '../src/cli/commands/index.js';
import {
  checkCommandLines,
  checkCompatibilityClaims,
  checkConfigKeys,
  checkFindingCodes,
  checkGerman,
  checkInformalAddress,
  checkLinks,
  checkPracticeTerms,
  checkSwissSpelling,
  configPaths,
  documentationFiles,
  findingCodes,
  functionWords,
  headingSlugs,
  linkTargets,
  readRepoFile,
  recordedTestImports,
  shellLines,
  sourceFiles,
  splitLanguageFiles,
} from './helpers/docs.js';

/**
 * Docs never drift from the code (s08 design decision 5): every command line in
 * an sh/bash fence, every backticked config key and every finding code in the
 * documentation must exist in the code. Since s09 (design decision 7) every
 * relative link and anchor must resolve, and the docs are German, with "du".
 * Since a08 (design decisions 1, 5 and 6) every German file is Swiss Standard
 * German: no "ß", rates written `8,1 %`, no terms of German DATEV or Austrian
 * BMD practice, BMD and DATEV named only where they must be, and no tested
 * Abacus import claimed before one is recorded.
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
        'docs/abacus-import.md',
        'docs/abacus-format.md',
        'examples/demo/README.md',
      ]),
    );
  });

  it('reads the command lines of the README, also in indented fences of the quick start', () => {
    const lines = shellLines(readRepoFile('README.md')).filter((line) => /^(apaleo-abacus|node dist\/cli\/main\.js) /.test(line));
    expect(lines).toEqual(expect.arrayContaining(['apaleo-abacus export --month 2026-09 --dry-run', 'node dist/cli/main.js export --month 2026-09 --demo --dry-run']));
    expect(lines.length).toBeGreaterThanOrEqual(8);
  });

  it.each(FILES)('%s: every apaleo-abacus command and flag in a shell fence exists', (file) => {
    expect(checkCommandLines(file, readRepoFile(file), COMMANDS)).toEqual([]);
  });

  it.each(FILES)('%s: every backticked config key exists in the schema', (file) => {
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

  it.each(GERMAN_FILES)('%s: Swiss spelling: no "ß", rates written like 8,1 %%', (file) => {
    expect(checkSwissSpelling(file, germanPart(file))).toEqual([]);
  });

  it.each(GERMAN_FILES)('%s: no German DATEV or Austrian BMD terms, BMD and DATEV only where allowed', (file) => {
    expect(checkPracticeTerms(file, germanPart(file))).toEqual([]);
  });

  it('checks every German file, not a list of Swiss files', () => {
    expect(GERMAN_FILES).toEqual(expect.arrayContaining(['README.md', 'CODE_OF_CONDUCT.md', 'CHANGELOG.md', 'DISCLAIMER.md', 'docs/setup-apaleo.md', 'docs/export.md', 'docs/architecture.md']));
    expect(GERMAN_FILES).toHaveLength(FILES.length - 1);
  });

  it.each(FILES)('%s: claims no tested Abacus import while docs/maintainers.md records none', (file) => {
    expect(checkCompatibilityClaims(file, readRepoFile(file), recordedTestImports(readRepoFile('docs/maintainers.md')).length)).toEqual([]);
  });

  it('has no docs/bmd-*.md or docs/datev-*.md guide, and the Abacus guides instead', () => {
    expect(FILES.filter((file) => /^docs\/(bmd|datev)-/.test(file))).toEqual([]);
    expect(FILES).toEqual(expect.arrayContaining(['docs/abacus-import.md', 'docs/abacus-format.md']));
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
    const problems = checkCommandLines('docs/abacus-import.md', sh('apaleo-abacus export --month 2026-10 --email'), COMMANDS);
    expect(problems).toEqual(['docs/abacus-import.md: "apaleo-abacus export --month 2026-10 --email": --email is not an option of "export"']);
  });

  it('Old binary in a doc: names apaleo-bmd and the file, and passes once the line reads apaleo-abacus', () => {
    expect(checkCommandLines('docs/export.md', sh('apaleo-bmd export --month 2026-10'), COMMANDS)).toEqual([
      'docs/export.md: "apaleo-bmd export --month 2026-10": apaleo-bmd is the binary of another project; write apaleo-abacus',
    ]);
    expect(checkCommandLines('docs/export.md', sh('apaleo-abacus export --month 2026-10'), COMMANDS)).toEqual([]);
    expect(checkCommandLines('docs/x.md', sh('docker compose run --rm apaleo-datev export --month 2026-10'), COMMANDS)).toEqual([expect.stringContaining('apaleo-datev is the binary')]);
    expect(checkCommandLines('docs/x.md', sh('cd apaleo-abacus-export   # not apaleo-bmd', 'git clone https://github.com/krautdawg/apaleo-bmd-export.git'), COMMANDS)).toEqual([]);
    expect(checkCommandLines('docs/x.md', '`apaleo-bmd export`\n```text\napaleo-bmd export\n```\n', COMMANDS)).toEqual([]);
  });

  it('names a renamed command and the file', () => {
    const renamed: Command[] = COMMANDS.map((command) => (command.name === 'export' ? { ...command, name: 'write' } : command));
    const problems = checkCommandLines('README.md', sh('apaleo-abacus export --month 2026-10 --dry-run'), renamed);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/^README\.md: "apaleo-abacus export --month 2026-10 --dry-run": "export" is not a command/);
  });

  it('reads two-word commands, global flags, both program spellings and stops at comments and pipes', () => {
    const text = sh(
      'apaleo-abacus mapping check --property BSP --from 2026-09-01 --to 2026-09-30   # --nonsense in a comment',
      'node dist/cli/main.js --help        # or: pnpm link --global',
      'node dist/cli/main.js export --month 2026-09 --demo --dry-run --debug | tee out.txt --x',
      'apaleo-abacus live-smoke --property BER [--date 2026-10-18]',
      'APALEO_CLIENT_SECRET=... apaleo-abacus export --unknown',
      'docker compose run --rm apaleo-abacus export --month 2026-10',
    );
    expect(checkCommandLines('docs/x.md', text, COMMANDS)).toEqual([]);
    expect(checkCommandLines('docs/x.md', sh('apaleo-abacus mapping --property BSP'), COMMANDS)).toHaveLength(1);
    expect(checkCommandLines('docs/x.md', sh('apaleo-abacus live-smoke [--days 3]'), COMMANDS)).toEqual([
      'docs/x.md: "apaleo-abacus live-smoke [--days 3]": --days is not an option of "live-smoke"',
    ]);
  });

  it('ignores command lines outside sh and bash fences', () => {
    const text = ['`apaleo-abacus export --email`', '```text', 'apaleo-abacus export --email', '```', '```yaml', 'apaleo-abacus: --email', '```'].join('\n');
    expect(checkCommandLines('docs/x.md', text, COMMANDS)).toEqual([]);
    expect(checkCommandLines('docs/x.md', ['```bash', 'apaleo-abacus export --email', '```'].join('\n'), COMMANDS)).toHaveLength(1);
  });

  it('names a stale config key and the file', () => {
    expect(checkConfigKeys('docs/configuration.md', 'Set `posting.aggregate` to true.')).toEqual([
      'docs/configuration.md: `posting.aggregate` is not a config key',
    ]);
  });

  it('knows nested, defaulted and array keys of the schema', () => {
    const paths = configPaths();
    for (const key of ['apaleo.clientId', 'abacus.mandant', 'posting.text2', 'schedule.monthly.dayOfMonth', 'checks.aggregates', 'properties[].mapping']) {
      expect(paths.has(key), key).toBe(true);
    }
    for (const key of ['bmd.buchsymbol', 'properties[].buchsymbol', 'posting.extbelegnr']) expect(paths.has(key), key).toBe(false);
    expect(checkConfigKeys('docs/x.md', '`properties[].geschaeftsbereich` and `properties[].kanzlei`')).toEqual([
      'docs/x.md: `properties[].kanzlei` is not a config key',
    ]);
    expect(checkConfigKeys('docs/configuration.md', 'Trag `abacus.beraternummer` ein.')).toEqual(['docs/configuration.md: `abacus.beraternummer` is not a config key']);
    expect(checkConfigKeys('docs/configuration.md', 'Der alte Abschnitt `bmd.buchsymbol` ist kein Schlüssel mehr.')).toEqual([]);
    expect(checkConfigKeys('docs/x.md', 'Setz `abacus.leitwaehrung` auf CHF.')).toEqual([]);
    expect(checkConfigKeys('docs/x.md', 'Setz `abacus.beraternummer` ein.')).toEqual(['docs/x.md: `abacus.beraternummer` is not a config key']);
    for (const key of ['abacus.mandant', 'abacus.mwstCodes.beherbergung', 'properties[].geschaeftsbereich']) expect(paths.has(key), key).toBe(true);
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

  it('Austrian paragraph copied: names the file and the terms Kanzlei and Buchungssymbol', () => {
    expect(problemsOf('docs/mapping-guide.md', 'Die Kanzlei legt das Buchungssymbol an.')).toEqual([
      'docs/mapping-guide.md: "Die Kanzlei legt das Buchungssymbol an.": "Kanzlei" is a term of Austrian BMD practice; use the Swiss Abacus term',
      'docs/mapping-guide.md: "Die Kanzlei legt das Buchungssymbol an.": "Buchungssymbol" is a term of Austrian BMD practice; use the Swiss Abacus term',
    ]);
    for (const term of ['Steuercode', 'Einheitskontenrahmen', 'EKR', 'UVA', 'Ortstaxe', 'Nächtigungsabgabe', 'Personenkonto']) {
      expect(problemsOf('docs/x.md', `Hier steht ${term} im Text.`), term).toEqual([expect.stringContaining(`"${term}"`)]);
    }
    expect(problemsOf('docs/x.md', 'Die Hauskanzlei, das BMDX-Feld, 2,0 % und 110 % sind keine Treffer. `BMD` und `Kanzlei` im Code auch nicht.')).toEqual([]);
  });

  it('Copied DATEV paragraph: names the file and the term', () => {
    expect(problemsOf('docs/mapping-guide.md', '## Spalten\n\nTrag den BU-Schlüssel ein.\n')).toEqual([
      'docs/mapping-guide.md: "Trag den BU-Schlüssel ein.": "BU-Schlüssel" is a term of German DATEV practice; use the Swiss Abacus term',
    ]);
    for (const term of ['Buchungsstapel', 'SKR03', 'SKR04', 'Automatikkonto', 'Beraternummer', 'EXTF', 'Belegfeld', 'Festschreibung', 'UStVA', 'ELSTER']) {
      expect(problemsOf('docs/x.md', `Hier steht ${term} im Text.`), term).toEqual([expect.stringContaining(`"${term}"`)]);
    }
    expect(problemsOf('docs/posting-rules.md', 'Die Beherbergungssteuer wird ohne Steuer gebucht.')).toEqual([expect.stringMatching(/^docs\/posting-rules\.md: .*"Beherbergungssteuer"/)]);
  });

  it('Foreign rate: names the file and 19 % or 10 %, matched only as a rate token', () => {
    expect(problemsOf('docs/posting-rules.md', 'Getränke mit 19 %.')).toEqual([expect.stringMatching(/^docs\/posting-rules\.md: .*"19 %"/)]);
    expect(problemsOf('docs/posting-rules.md', 'Beherbergung mit 10 %.')).toEqual([expect.stringMatching(/^docs\/posting-rules\.md: .*"10 %"/)]);
    for (const rate of ['13 %', '20 %', '7%']) expect(problemsOf('docs/x.md', `Logis mit ${rate}.`), rate).toHaveLength(1);
    expect(problemsOf('docs/x.md', 'Nie 110 %, 17 % oder 4,9 %. `19 %` im Code.\n\n```text\nKurtaxe 19 %\n```\n')).toEqual([]);
  });

  it('Old Swiss rates pass: 7,7 %, 3,7 % and 2,5 % report nothing, while 7 % in the same file does (Old Swiss rates are not foreign rates)', () => {
    expect(problemsOf('docs/x.md', 'Normalsatz 7.7 %.')).toEqual([]);
    expect(problemsOf('docs/mapping-guide.md', '7,7 %, 3,7 % und 2,5 % bis 31.12.2023')).toEqual([]);
    expect(problemsOf('docs/mapping-guide.md', '7,7 %, 3,7 % und 2,5 % bis 31.12.2023\n\nGetränke mit 7 %.\n')).toEqual([
      'docs/mapping-guide.md: "Getränke mit 7 %.": "7 %" is a term of German DATEV practice; use the Swiss Abacus term',
    ]);
  });

  it('Swiss terms are allowed: Kurtaxe and Mandantennummer', () => {
    const text = 'Die Kurtaxe geht auf ein Durchlaufkonto, die Mandantennummer steht im Kopf.';
    expect(problemsOf('docs/abacus-format.md', text)).toEqual([]);
    expect(checkSwissSpelling('docs/abacus-format.md', text)).toEqual([]);
  });

  it('Bare target mention: names the file and the token BMD or DATEV', () => {
    expect(problemsOf('docs/abacus-import.md', 'Das läuft wie beim BMD-Import.')).toEqual([
      'docs/abacus-import.md: "Das läuft wie beim BMD-Import.": "BMD" is named outside a link to an origin project, the other target formats and the findings for a copied setup',
    ]);
    expect(problemsOf('docs/abacus-import.md', 'Das läuft wie beim DATEV-Import.')).toEqual([expect.stringContaining('"DATEV" is named outside')]);
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

describe('the Swiss spelling check', () => {
  it('Swiss file checked from the start: every German file, so docs/abacus-format.md and docs/export.md both report Kanzlei, Buchungssymbol and ß', () => {
    const text = 'Die Kanzlei legt das Buchungssymbol an.\n\nSchließe die Datei.\n';
    for (const file of ['docs/abacus-format.md', 'docs/export.md']) {
      expect([...checkSwissSpelling(file, text), ...checkPracticeTerms(file, text)], file).toEqual([
        expect.stringMatching(new RegExp(`^${file.replace('.', '\\.')}:3: .*"ß"`)),
        expect.stringMatching(/"Kanzlei"/),
        expect.stringMatching(/"Buchungssymbol"/),
      ]);
    }
  });

  it('Swiss rate notation: names 3.8 % and 3,8% in docs/abacus-format.md, and passes 3,8 %', () => {
    expect(checkSwissSpelling('docs/abacus-format.md', 'Beherbergung zu 3.8 %.')).toEqual([expect.stringMatching(/^docs\/abacus-format\.md: .*"3\.8 %" is not the Swiss rate notation/)]);
    expect(checkSwissSpelling('docs/abacus-format.md', 'Beherbergung zu 3,8%.')).toHaveLength(1);
    expect(checkSwissSpelling('docs/abacus-format.md', 'Beherbergung zu 3,8 %, `3.8` im Code.')).toEqual([]);
  });

  it('Sharp s in a Swiss doc: names the file, the line and the letter ß, and passes once it reads "Schliesse"', () => {
    expect(checkSwissSpelling('docs/docker.md', 'Text.\n\nSchließe das Terminal.\n')).toEqual([
      'docs/docker.md:3: "Schließe das Terminal.": the letter "ß" is not Swiss; write "ss"',
    ]);
    expect(checkSwissSpelling('docs/docker.md', 'Text.\n\nSchliesse das Terminal.\n')).toEqual([]);
    expect(checkSwissSpelling('CODE_OF_CONDUCT.md', '```text\nMaßnahmen\n```\n')).toHaveLength(1);
  });

  it('Decimal point in a German rate: names 7.7 % and 3,8%, does not report 7 %, and passes 7,7 %, 3,8 % and a rate in a code span', () => {
    expect(checkSwissSpelling('docs/posting-rules.md', 'Beherbergung zu 7.7 %.')).toEqual([
      'docs/posting-rules.md: "Beherbergung zu 7.7 %.": "7.7 %" is not the Swiss rate notation; write it like "8,1 %"',
    ]);
    expect(checkPracticeTerms('docs/posting-rules.md', 'Beherbergung zu 7.7 %.')).toEqual([]);
    expect(checkSwissSpelling('docs/posting-rules.md', 'Beherbergung zu 3,8%.')).toEqual([expect.stringContaining('"3,8%" is not the Swiss rate notation')]);
    expect(checkSwissSpelling('docs/posting-rules.md', 'Beherbergung zu 7,7 % und 3,8 %, Normalsatz 8,1 %, `3.8` und `3.8%` im Code.\n\n```xml\n<Rate>3.8</Rate> 8%\n```\n')).toEqual([]);
  });
});

describe('the compatibility claim check', () => {
  const maintainers = (rows: string[]) =>
    ['## Testimporte', '', '| Datum | Abacus-Version | Schnittstellenversion | Programm | Ergebnis |', '|---|---|---|---|---|', ...rows, '', '## Später geplant', '| x | y |'].join('\n');

  it('counts the recorded test imports, not the header, an empty row or a partial row', () => {
    expect(recordedTestImports(maintainers([]))).toEqual([]);
    expect(recordedTestImports(maintainers(['|  |  |  |  |  |']))).toEqual([]);
    expect(recordedTestImports(maintainers(['| 2026-11-10 |  |  |  |  |']))).toEqual([]);
    expect(recordedTestImports(maintainers(['| 2026-11-10 | Abacus 2025 | 2015.00 | F5534 |  |', '| TBD |']))).toEqual([]);
    expect(checkCompatibilityClaims('README.md', 'Getestet mit Abacus FIBU.', recordedTestImports(maintainers(['| 2026-11-10 |  |  |  |  |'])).length)).toHaveLength(1);
    expect(recordedTestImports(maintainers(['| 2026-11-10 | Abacus 2025 | 2015.00 | F5534 | ohne Fehler |']))).toEqual([['2026-11-10', 'Abacus 2025', '2015.00', 'F5534', 'ohne Fehler']]);
    expect(recordedTestImports(readRepoFile('docs/maintainers.md'))).toEqual([]);
  });

  it('Claim without a recorded import: names the README and the phrase', () => {
    expect(checkCompatibilityClaims('README.md', 'Die Datei ist getestet mit Abacus FIBU.', 0)).toEqual([
      'README.md: "getestet mit Abacus" claims a tested import, but docs/maintainers.md records no import under ## Testimporte',
    ]);
    expect(checkCompatibilityClaims('docs/x.md', 'Kompatibel mit Abacus FIBU und Abacus-zertifiziert.', 0)).toHaveLength(2);
    expect(checkCompatibilityClaims('README.md', 'Die Datei ist getestet mit Abacus FIBU.', 1)).toEqual([]);
  });

  it.each([
    'Die Datei ist mit Abacus FIBU getestet.',
    'Die Datei wurde in\nAbacus erfolgreich getestet.',
    'Der Export ist Abacus-kompatibel.',
    'Die Datei wird von Abacus akzeptiert.',
    'The file is tested with Abacus FIBU.',
    'An Abacus-certified import file.',
    'Die Datei wurde mit\nAbacus 2024 erfolgreich getestet.',
    'Die Datei ist kompatibel zu Abacus.',
    'Die Datei ist mit Abacus FIBU kompatibel.',
    'Die Datei wird von Abacus FIBU akzeptiert.',
    'Zertifiziert durch Abacus.',
    'A Abacus-compatible import file.',
    'The file is compatible with Abacus FIBU.',
    'Abacus certified.',
    'The file is accepted by Abacus FIBU.',
  ])('Claim in other words or in English: finds "%s"', (text) => {
    expect(checkCompatibilityClaims('README.en.md', text, 0)).toHaveLength(1);
  });

  it('passes the pending-import wording and other uses of the words', () => {
    for (const text of [
      'Die Datei folgt der dokumentierten AbaConnect-Schnittstelle «XML Buchungen»; ein erster Testimport mit einem Treuhänder steht noch aus.',
      'The file follows the documented AbaConnect interface "XML Buchungen"; a first test import with a Treuhänder is still pending.',
      'Zwei Lint-Regeln (getestet in `test/lint/`) sorgen dafür, dass das so bleibt.',
      'Kein zertifiziertes Archiv. Abacus nimmt `3.8` in `TaxRate` an.',
    ]) {
      expect(checkCompatibilityClaims('README.md', text, 0), text).toEqual([]);
    }
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
    expect(docker).toContain('docker compose -f docker-compose.example.yml run --rm apaleo-abacus schedule --once >> schedule.log 2>&1');
    expect(docker).toContain('(Standard `Europe/Zurich`)');
    expect(docker).not.toContain('Vienna');
    expect(docker).toContain('docker run --rm -w /data -v "$PWD/data:/data" apaleo-abacus-export:local export --month 2026-09 --demo');
    expect(docker).toContain('uid 1000');
    expect(docker).toContain('ABACUS_Buchungen_20260901-20260930_BSP_DEMO.xml');
  });

  it('gives the chown command for E-EXPORT as the export prints it', () => {
    expect(docker).toContain('`E-EXPORT`');
    expect(docker).toContain('`sudo chown -R 1000:1000 data`');
  });
});
