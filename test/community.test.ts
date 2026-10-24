import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { checkPracticeTermLines, checkQuotationMarks, readRepoFile } from './helpers/docs.js';

interface IssueForm {
  name: string;
  description: string;
  body: { type: string; id?: string; attributes: { label?: string; value?: string; options?: unknown[] } }[];
}

const form = (file: string) => parse(readRepoFile(`.github/ISSUE_TEMPLATE/${file}`)) as IssueForm;
const ids = (issueForm: IssueForm) => issueForm.body.map((field) => field.id).filter(Boolean);
const markdown = (issueForm: IssueForm) => issueForm.body.filter((field) => field.type === 'markdown').map((field) => field.attributes.value ?? '').join('\n');

describe('contribution and conduct files', () => {
  it('CONTRIBUTING.md covers setup, scripts, the OpenSpec workflow, Conventional Commits, fixtures without real guest data, Odoo test-import reports and the language rule, in German as written in Germany', () => {
    const text = readRepoFile('CONTRIBUTING.md');
    for (const phrase of ['## Einrichtung', '## Skripte', 'OpenSpec', 'openspec archive', 'Conventional Commits', 'Niemals echte Gästedaten', 'Anonymisiere apaleo-Antworten']) {
      expect(text).toContain(phrase);
    }
    expect(text).toMatch(/Code, Bezeichner.*Commit-Nachrichten bleiben auf Englisch/);
    expect(text).toContain('Issues und Pull Requests auf Englisch sind genauso willkommen');
    expect(text).toContain('Hotels in Deutschland mit apaleo und Odoo und an ihre Steuerberater');
    expect(text).toContain('wie man es in Deutschland schreibt: mit „du“, mit „ß“');
    expect(text).toMatch(/Odoo-Version, Edition und Hosting, Kontenrahmen \(SKR03 oder SKR04\), Rundungsmethode/);
    expect(text).not.toMatch(/Schweizer Hochdeutsch|Treuhänder|MWST|Rappen|Abacus|\bBMD\b|\bEKR\b|«|»/);
  });

  it('Code of conduct is the official translation: the German Contributor Covenant 2.1, verbatim with "ß", with the project contact', () => {
    const text = readRepoFile('CODE_OF_CONDUCT.md');
    expect(text.startsWith('# Vereinbarung über Verhaltenskodex für Mitwirkende\n')).toBe(true);
    expect(text).toContain('Contributor Covenant');
    expect(text).toContain('Version 2.1');
    for (const heading of [
      '## Unsere Verpflichtung',
      '## Unsere Standards',
      '## Verantwortlichkeiten bei der Durchsetzung',
      '## Geltungsbereich',
      '## Durchsetzung',
      '## Durchsetzungsrichtlinien',
      '## Bezug',
    ]) {
      expect(text).toMatch(new RegExp(`^${heading}$`, 'm'));
    }
    expect(text).toContain('https://github.com/krautdawg');
    expect(text).not.toContain('[KONTAKTMETHODE EINFÜGEN]');
    for (const word of ['Körpergröße', 'Maßnahmen', 'Mäßigung', 'verstößt', 'einschließlich']) expect(text, word).toContain(word);
    expect(text).not.toMatch(/Massnahmen|Körpergrösse|einschliesslich|verstösst/);
  });

  it('SECURITY.md asks in German for confidential reports through a private GitHub security advisory, names supported versions and says there is no bounty', () => {
    const text = readRepoFile('SECURITY.md');
    expect(text).toContain('**vertraulich**, nicht in einem öffentlichen Issue');
    expect(text).toContain('privates Security Advisory auf GitHub');
    expect(text).toContain('## Unterstützte Versionen');
    expect(text).toContain('## Keine Belohnung');
    expect(text).toContain('Odoo-Importdatei');
    expect(text).not.toMatch(/Abacus|MWST|ausserhalb/);
  });
});

describe('CHANGELOG.md', () => {
  const text = readRepoFile('CHANGELOG.md');
  const unreleased = text.split(/^## \[Unveröffentlicht\]$/m)[1]?.split(/^## /m)[0] ?? '';
  const part = (heading: string) => unreleased.split(new RegExp(`^### ${heading}$`, 'm'))[1]?.split(/^### /m)[0] ?? '';

  it('follows the German edition of Keep a Changelog with an Unveröffentlicht section in German section names', () => {
    expect(text).toContain('[Keep a Changelog](https://keepachangelog.com/de/1.1.0/)');
    expect(text).toMatch(/^## \[Unveröffentlicht\]$/m);
    expect(text).not.toMatch(/^##+ (\[Unreleased\]|Added|Changed|Removed|Fixed)$/m);
    for (const heading of ['Hinzugefügt', 'Geändert', 'Entfernt']) expect(unreleased).toMatch(new RegExp(`^### ${heading}$`, 'm'));
  });

  it('starts the history of apaleo-odoo-export and names apaleo-abacus-export v0.1.0 as its origin instead of repeating its entries', () => {
    expect(text).toContain('Alle wichtigen Änderungen an apaleo-odoo-export stehen in dieser Datei.');
    expect(text).toContain('Die Geschichte von apaleo-odoo-export beginnt hier.');
    expect(text).toContain('[apaleo-abacus-export](https://github.com/krautdawg/apaleo-abacus-export) v0.1.0');
    expect(text).not.toMatch(/^## \[\d/m);
    expect(text).not.toMatch(/\(a0\d/);
  });

  it('Unreleased section: lists the Odoo features under Hinzugefügt and the Abacus output and the KMU template under Entfernt', () => {
    const added = part('Hinzugefügt');
    for (const feature of ['Odoo-Importdatei', 'ein Buchungssatz als Entwurf pro Geschäftstag', 'External ID', 'Basisanpassung', 'init-mapping --template skr03-hotel', 'init-mapping --template skr04-hotel', 'Kurtaxe', 'Anzahlungen', 'Forderungsverluste', 'Stornogebühren', '7 % ab 2026-01-01', 'export --demo', 'schedule --once', 'Docker']) {
      expect(added, feature).toContain(feature);
    }
    const removed = part('Entfernt');
    for (const item of ['Abacus XML Buchungen', 'KMU-Vorlage']) expect(removed, item).toContain(item);
    for (const slice of ['o01', 'o02', 'o03', 'o04', 'o05', 'o06', 'o07', 'o08']) expect(unreleased, slice).toContain(slice);
  });
});

describe('issue and pull-request templates', () => {
  it('the bug report form asks in German for version, command, finding codes and anonymised output, and warns about secrets and guest data', () => {
    const bug = form('bug_report.yml');
    expect(bug.name).toBe('Fehlerbericht');
    expect(ids(bug)).toEqual(['version', 'install', 'command', 'findings', 'expected', 'output', 'privacy']);
    expect(markdown(bug)).toContain('**Füge nie Secrets oder Gästedaten ein.**');
    expect(markdown(bug)).toContain('SECURITY.md');
    const labels = bug.body.map((field) => field.attributes.label).filter(Boolean);
    expect(labels).toEqual(expect.arrayContaining(['Version des Tools und von Odoo', 'Befehl', 'Befund-Codes', 'Anonymisierte Ausgabe']));
    const version = bug.body.find((field) => field.id === 'version')?.attributes as { description?: string } | undefined;
    for (const phrase of ['Odoo-Version und Edition', 'Community oder Enterprise', 'Kontenrahmen']) expect(version?.description, phrase).toContain(phrase);
    expect(markdown(bug)).toContain('Kontensalden');
  });

  it('has German forms for feature requests and for a new source or target, with unchanged field ids', () => {
    const feature = form('feature_request.yml');
    expect(feature.name).toBe('Funktionswunsch');
    expect(ids(feature)).toEqual(['problem', 'proposal', 'accounting', 'help']);
    const sourceOrTarget = form('new_source_or_target.yml');
    expect(sourceOrTarget.name).toBe('Neue Quelle oder neues Zielformat');
    expect(ids(sourceOrTarget)).toEqual(['kind', 'system', 'api', 'mapping', 'help']);
    expect(markdown(sourceOrTarget)).toContain('docs/architecture.md');
    expect(sourceOrTarget.description).toContain('für eine andere Buchhaltungssoftware');
    for (const origin of ['apaleo-datev-export', 'apaleo-bmd-export', 'apaleo-abacus-export']) expect(markdown(sourceOrTarget)).toContain(origin);
  });

  it('Feature request form: asks what the Kanzlei needs in Odoo and names neither Abacus nor BMD', () => {
    const feature = form('feature_request.yml');
    expect(feature.description).toContain('von apaleo nach Odoo');
    expect(feature.body.find((field) => field.id === 'problem')?.attributes).toMatchObject({ description: expect.stringContaining('deine Kanzlei in Odoo') });
    expect(readRepoFile('.github/ISSUE_TEMPLATE/feature_request.yml')).not.toMatch(/Abacus|\bBMD\b/);
  });

  it('the forms and the pull-request template speak of Odoo and German accounting, not of Abacus, Swiss or Austrian practice', () => {
    const files = ['ISSUE_TEMPLATE/bug_report.yml', 'ISSUE_TEMPLATE/feature_request.yml', 'ISSUE_TEMPLATE/new_source_or_target.yml', 'pull_request_template.md'];
    for (const file of files) {
      const text = readRepoFile(`.github/${file}`);
      // The shared Swiss and Austrian term rules of the docs (o08 design decision 3), plus words of Swiss practice that are not terms of their own.
      expect(checkPracticeTermLines(file, text)).toEqual([]);
      expect(checkQuotationMarks(file, text)).toEqual([]);
      expect(text, file).not.toMatch(/Mandant|KMU|Schweizer Hochdeutsch/);
      expect(text, file).toContain('Odoo');
    }
    for (const file of files.filter((file) => !file.includes('new_source_or_target'))) expect(readRepoFile(`.github/${file}`), file).not.toMatch(/Abacus|\bBMD\b/);
    expect(readRepoFile('.github/ISSUE_TEMPLATE/feature_request.yml')).toMatch(/SKR03, SKR04.*UStVA/s);
  });

  it('the pull-request template has a German checklist for tests, docs, secrets and personal data', () => {
    const items = readRepoFile('.github/pull_request_template.md')
      .split('\n')
      .filter((line) => line.startsWith('- [ ] '))
      .map((line) => line.slice('- [ ] '.length));
    for (const topic of ['Tests', 'Dokumentation', 'Keine Secrets', 'Keine personenbezogenen Daten']) {
      expect(items.some((item) => item.startsWith(topic)), topic).toBe(true);
    }
  });
});
