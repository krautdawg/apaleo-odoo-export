import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { readRepoFile } from './helpers/docs.js';

interface IssueForm {
  name: string;
  description: string;
  body: { type: string; id?: string; attributes: { label?: string; value?: string; options?: unknown[] } }[];
}

const form = (file: string) => parse(readRepoFile(`.github/ISSUE_TEMPLATE/${file}`)) as IssueForm;
const ids = (issueForm: IssueForm) => issueForm.body.map((field) => field.id).filter(Boolean);
const markdown = (issueForm: IssueForm) => issueForm.body.filter((field) => field.type === 'markdown').map((field) => field.attributes.value ?? '').join('\n');

describe('contribution and conduct files', () => {
  it('CONTRIBUTING.md covers setup, scripts, the OpenSpec workflow, Conventional Commits, fixtures without real guest data and the language rule, in Swiss Standard German', () => {
    const text = readRepoFile('CONTRIBUTING.md');
    for (const phrase of ['## Einrichtung', '## Skripte', 'OpenSpec', 'openspec archive', 'Conventional Commits', 'Niemals echte Gästedaten', 'Anonymisiere apaleo-Antworten']) {
      expect(text).toContain(phrase);
    }
    expect(text).toMatch(/Code, Bezeichner.*Commit-Nachrichten bleiben auf Englisch/);
    expect(text).toContain('Issues und Pull Requests auf Englisch sind genauso willkommen');
    expect(text).toContain('Schweizer Hochdeutsch');
    expect(text).toContain('Hotels in der Schweiz und ihre Treuhänder');
    expect(text).not.toMatch(/Österreich|Kanzlei|\bBMD\b|\bEKR\b/);
  });

  it('Code of conduct is the official translation: the German Contributor Covenant 2.1 in Swiss orthography, with the project contact', () => {
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
    expect(text).not.toContain('ß');
    expect(text).toContain('Massnahmen');
  });

  it('SECURITY.md asks in German for confidential reports through a private GitHub security advisory, names supported versions and says there is no bounty', () => {
    const text = readRepoFile('SECURITY.md');
    expect(text).toContain('**vertraulich**, nicht in einem öffentlichen Issue');
    expect(text).toContain('privates Security Advisory auf GitHub');
    expect(text).toContain('## Unterstützte Versionen');
    expect(text).toContain('## Keine Belohnung');
  });
});

describe('CHANGELOG.md', () => {
  const text = readRepoFile('CHANGELOG.md');
  const unreleased = text.split(/^## \[0\.1\.0\] - \d{4}-\d{2}-\d{2}$/m)[1]?.split(/^## /m)[0] ?? '';
  const part = (heading: string) => unreleased.split(new RegExp(`^### ${heading}$`, 'm'))[1]?.split(/^### /m)[0] ?? '';

  it('follows the German edition of Keep a Changelog with an Unveröffentlicht section, in Swiss Standard German', () => {
    expect(text).toContain('[Keep a Changelog](https://keepachangelog.com/de/1.1.0/)');
    expect(text).toMatch(/^## \[Unveröffentlicht\]$/m);
    expect(text).not.toMatch(/^##+ (\[Unreleased\]|Added|Changed|Removed|Fixed)$/m);
    expect(text).not.toContain('ß');
  });

  it('starts the history of apaleo-abacus-export and names apaleo-bmd-export v0.1.0 as its origin instead of repeating its entries', () => {
    expect(text).toContain('Die Geschichte von apaleo-abacus-export beginnt hier.');
    expect(text).toContain('[apaleo-bmd-export](https://github.com/krautdawg/apaleo-bmd-export) v0.1.0');
    expect(text.match(/^## \[0\.1\.0\]/gm)).toHaveLength(1);
    expect(text).not.toMatch(/\(b0\d/);
  });

  it('0.1.0 section: lists the Abacus features under Hinzugefügt and the BMD output under Entfernt', () => {
    const added = part('Hinzugefügt');
    for (const feature of ['XML Buchungen', 'init-mapping --template kmu-hotel', 'MWST-Codes', 'Kurtaxe', 'Anzahlungen', 'Debitorenverlust', 'Annullationen', 'CHF als Leitwährung', 'export --demo', 'schedule --once', 'Docker']) {
      expect(added, feature).toContain(feature);
    }
    const removed = part('Entfernt');
    for (const item of ['BMD Buchungsimport', 'EKR-Vorlage']) expect(removed, item).toContain(item);
    for (const slice of ['a01', 'a02', 'a03', 'a04', 'a05', 'a06', 'a07', 'a08']) expect(unreleased, slice).toContain(slice);
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
    expect(labels).toEqual(expect.arrayContaining(['Version des Tools', 'Befehl', 'Befund-Codes', 'Anonymisierte Ausgabe']));
  });

  it('has German forms for feature requests and for a new source or target, with unchanged field ids', () => {
    const feature = form('feature_request.yml');
    expect(feature.name).toBe('Funktionswunsch');
    expect(ids(feature)).toEqual(['problem', 'proposal', 'accounting', 'help']);
    const sourceOrTarget = form('new_source_or_target.yml');
    expect(sourceOrTarget.name).toBe('Neue Quelle oder neues Zielformat');
    expect(ids(sourceOrTarget)).toEqual(['kind', 'system', 'api', 'mapping', 'help']);
    expect(markdown(sourceOrTarget)).toContain('docs/architecture.md');
    expect(sourceOrTarget.description).toContain('Schweizer Buchhaltungssoftware');
    for (const origin of ['apaleo-bmd-export', 'apaleo-datev-export']) expect(markdown(sourceOrTarget)).toContain(origin);
  });

  it('Feature request form: asks what the Treuhänder needs in Abacus and names neither BMD nor DATEV', () => {
    const feature = form('feature_request.yml');
    expect(feature.description).toContain('nach Abacus');
    expect(feature.body.find((field) => field.id === 'problem')?.attributes).toMatchObject({ description: expect.stringContaining('Treuhänder in Abacus') });
    expect(readRepoFile('.github/ISSUE_TEMPLATE/feature_request.yml')).not.toMatch(/\bBMD\b|DATEV/);
  });

  it('the forms and the pull-request template speak of Abacus and Swiss accounting, in Swiss orthography, not of BMD or DATEV practice', () => {
    const files = ['ISSUE_TEMPLATE/bug_report.yml', 'ISSUE_TEMPLATE/feature_request.yml', 'ISSUE_TEMPLATE/new_source_or_target.yml', 'pull_request_template.md'];
    for (const file of files) {
      const text = readRepoFile(`.github/${file}`);
      expect(text, file).not.toContain('ß');
      expect(text, file).not.toMatch(/Kanzlei|Steuercode|Buchungssymbol|\bEKR\b|\bUSt\b|SKR0|Berater|BU-Schlüssel|BMD-Mandant/);
    }
    for (const file of files.slice(0, 2)) expect(readRepoFile(`.github/${file}`), file).not.toMatch(/\bBMD\b|DATEV/);
    expect(readRepoFile('.github/pull_request_template.md')).not.toMatch(/\bBMD\b|DATEV/);
    expect(markdown(form('bug_report.yml'))).toContain('Abacus-Mandanten');
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
