import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

const read = (file: string) => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const exists = (file: string) => existsSync(new URL(`../${file}`, import.meta.url));

describe('licence and disclaimer', () => {
  it('has an MIT LICENSE and a DISCLAIMER.md at the repository root', () => {
    expect(exists('LICENSE')).toBe(true);
    expect(read('LICENSE')).toContain('MIT License');
    expect(exists('DISCLAIMER.md')).toBe(true);
  });

  it.each(['README.md', 'README.en.md'])('%s links to LICENSE and DISCLAIMER.md', (file) => {
    const readme = read(file);
    expect(readme).toContain('](LICENSE)');
    expect(readme).toContain('](DISCLAIMER.md)');
  });

  it('DISCLAIMER.md is German and binding first, then a non-binding English translation, both covering warranty, liability, advice, the Treuhänder and the Abacus imports', () => {
    const text = read('DISCLAIMER.md');
    expect(text.startsWith('# Haftungsausschluss\n')).toBe(true);
    expect(text).toContain('Verbindlich ist die deutsche Fassung.');
    const [german = '', english = ''] = text.split('\n## English (non-binding translation)\n');
    expect(english).not.toBe('');
    for (const phrase of ['ohne ausdrückliche oder stillschweigende Gewährleistung', 'haften', 'keine Steuerberatung', 'Kontenzuordnung', 'Treuhänder', 'Abacus', 'MWST-Codes', 'Abacus Research AG', 'apaleo GmbH']) {
      expect(german).toContain(phrase);
    }
    for (const phrase of ['without warranty', 'not liable', 'not tax advice', 'must review the account mapping', 'Treuhänder', 'first Abacus imports', 'Abacus Research AG']) {
      expect(english).toContain(phrase);
    }
    expect(text).not.toMatch(/\bBMD\b|Steuerberater|Kanzlei|\bUVA\b|\bBAO\b/);
  });
});

describe('package', () => {
  const pkg = JSON.parse(read('package.json')) as Record<string, unknown>;

  it('Old binary name is gone: is apaleo-odoo-export with exactly one binary, apaleo-odoo, and no apaleo-abacus, apaleo-bmd or apaleo-datev binary', () => {
    expect(pkg.name).toBe('apaleo-odoo-export');
    expect(Object.keys(pkg.bin as object)).toEqual(['apaleo-odoo']);
    for (const old of ['apaleo-abacus', 'apaleo-bmd', 'apaleo-datev']) expect(pkg.bin, old).not.toHaveProperty(old);
  });

  it('starts at version 0.0.0 and describes the export to Odoo Accounting', () => {
    expect(pkg.version).toBe('0.0.0');
    expect(pkg.description).toBe('Free open-source export from the apaleo hotel PMS to Odoo Accounting journal entries (import file) for hotels in Germany.');
  });

  it('is private so pnpm publish refuses', () => {
    expect(pkg.private).toBe(true);
  });

  it('installs the apaleo-odoo binary and the four quality scripts', () => {
    expect(pkg.bin).toEqual({ 'apaleo-odoo': 'dist/cli/main.js' });
    expect(Object.keys(pkg.scripts as object)).toEqual(expect.arrayContaining(['build', 'test', 'lint', 'typecheck']));
  });
});

describe('CI workflow', () => {
  const workflow = parse(read('.github/workflows/ci.yml')) as {
    on: Record<string, unknown>;
    jobs: Record<string, { steps: { run?: string }[] }>;
  };
  const runs = Object.values(workflow.jobs).flatMap((job) => job.steps.map((s) => s.run ?? ''));

  it('runs on push and pull request', () => {
    expect(Object.keys(workflow.on)).toEqual(expect.arrayContaining(['push', 'pull_request']));
  });

  it('installs with a frozen lockfile and runs every check plus the CLI smoke test', () => {
    for (const command of [
      'pnpm install --frozen-lockfile',
      'pnpm typecheck',
      'pnpm lint',
      'pnpm test',
      'pnpm build',
      'node dist/cli/main.js --help',
    ]) {
      expect(runs).toContain(command);
    }
  });

  it('uses no repository secrets', () => {
    expect(read('.github/workflows/ci.yml')).not.toContain('secrets.');
  });

  it('builds the image and runs --help and --version in a docker job, without registry login or push', () => {
    const docker = workflow.jobs.docker?.steps.map((s) => s.run ?? '') ?? [];
    expect(docker).toContain('docker build -t apaleo-odoo-export:ci .');
    expect(docker).toContain('docker run --rm apaleo-odoo-export:ci --help');
    expect(docker).toContain('docker run --rm apaleo-odoo-export:ci --version');
    expect(docker).toContain('docker run --rm apaleo-odoo-export:ci export --month 2026-09 --demo --dry-run');
    const text = read('.github/workflows/ci.yml');
    expect(text).toContain('docker run --rm -w /data -v "$RUNNER_TEMP/demo-data:/data" apaleo-odoo-export:ci export --month 2026-09 --demo\n');
    expect(text).toContain('sudo chown 1000:1000 "$RUNNER_TEMP/demo-data"');
    expect(text).toContain('test -s "$RUNNER_TEMP/demo-data/demo-output/BSP/2026-09/ODOO_Buchungen_20260901-20260930_BSP_DEMO.csv"');
    for (const check of ["label description | grep -q 'apaleo'", "label description | grep -q 'Odoo'", "if label description | grep -q -e 'Abacus' -e 'BMD'; then exit 1; fi", 'test "$(label licenses)" = MIT']) {
      expect(text).toContain(check);
    }
    for (const forbidden of ['docker login', 'docker push', 'docker/login-action', 'docker/build-push-action', 'ghcr.io', 'packages: write']) {
      expect(text).not.toContain(forbidden);
    }
  });
});

describe('container image', () => {
  const dockerfile = read('Dockerfile');
  const instructions = dockerfile.split('\n').filter((line) => /^[A-Z]+ /.test(line));

  it('is a multi-stage build on Node.js 24 slim', () => {
    expect(instructions.filter((line) => line.startsWith('FROM '))).toEqual(['FROM node:24-bookworm-slim AS build', 'FROM node:24-bookworm-slim']);
    expect(dockerfile).toContain('pnpm install --frozen-lockfile');
    expect(dockerfile).toContain('pnpm prune --prod');
  });

  it('runs as user node with the config in /config, the exports in /data and schedule --once as default command', () => {
    const runtime = instructions.slice(instructions.indexOf('FROM node:24-bookworm-slim'));
    expect(runtime).toContain('USER node');
    expect(dockerfile).toContain('APALEO_ODOO_CONFIG=/config/apaleo-odoo.config.yaml');
    expect(dockerfile).toContain('APALEO_ODOO_OUTPUT_DIR=/data');
    expect(runtime).toContain('VOLUME ["/config", "/data"]');
    expect(runtime).toContain('ENTRYPOINT ["node", "/app/dist/cli/main.js"]');
    expect(runtime.at(-1)).toBe('CMD ["schedule", "--once"]');
    expect(dockerfile).not.toMatch(/^HEALTHCHECK/m);
  });

  it('carries OCI labels naming apaleo and Odoo, the repository and the MIT licence', () => {
    const labels = Object.fromEntries(
      [...dockerfile.matchAll(/(org\.opencontainers\.image\.[a-z]+)="([^"]*)"/g)].map(([, key = '', value = '']) => [key.replace('org.opencontainers.image.', ''), value]),
    );
    expect(labels).toEqual({
      title: 'apaleo-odoo-export',
      description: 'apaleo -> Odoo Accounting export (journal entries import file)',
      source: 'https://github.com/krautdawg/apaleo-odoo-export',
      licenses: 'MIT',
    });
    expect(dockerfile).not.toMatch(/datev|bmd/i);
  });

  it('keeps secrets and local files out of the build context', () => {
    const ignore = read('.dockerignore').split('\n');
    expect(ignore).toContain('*');
    expect(ignore.filter((line) => line.startsWith('!'))).not.toContain('!.env');
  });
});

describe('compose and env examples', () => {
  const compose = parse(read('docker-compose.example.yml')) as {
    services: Record<string, { build?: string; image?: string; restart?: string; env_file?: string; volumes?: string[]; entrypoint?: string[] }>;
  };
  const services = Object.values(compose.services);

  it('has one locally built service with restart policy, env file, config and data volumes', () => {
    expect(services).toHaveLength(1);
    const [service] = services;
    expect(service?.build).toBe('.');
    expect(service?.image ?? '').not.toContain('/');
    expect(service?.restart).toBe('unless-stopped');
    expect(service?.env_file).toBe('.env');
    expect(service?.volumes).toEqual(['./config:/config:ro', './data:/data']);
  });

  it('names the service apaleo-odoo and the image apaleo-odoo-export:local, with no registry host', () => {
    expect(Object.keys(compose.services)).toEqual(['apaleo-odoo']);
    expect(compose.services['apaleo-odoo']?.build).toBe('.');
    expect(compose.services['apaleo-odoo']?.image).toBe('apaleo-odoo-export:local');
    const text = read('docker-compose.example.yml');
    for (const registry of ['ghcr.io', 'docker.io', 'quay.io', 'docker pull']) expect(text).not.toContain(registry);
  });

  it('runs schedule --once in a while-sleep loop', () => {
    const script = services[0]?.entrypoint?.join('\n') ?? '';
    expect(script).toMatch(/while true; do\s+node \/app\/dist\/cli\/main\.js schedule --once\s+sleep \d+\s+done/);
  });

  it('sets APALEO_ODOO_TIMEZONE only commented out, with the default Europe/Zurich', () => {
    const text = read('docker-compose.example.yml');
    expect(text).toMatch(/^ {4}# {3}APALEO_ODOO_TIMEZONE: Europe\/Zurich$/m);
    expect(text).toMatch(/^ {4}# environment:$/m);
    expect((compose.services['apaleo-odoo'] as Record<string, unknown>).environment).toBeUndefined();
  });

  it('comments the compose, env and config examples in German, without BMD', () => {
    for (const file of ['docker-compose.example.yml', '.env.example', 'apaleo-odoo.config.example.yaml']) {
      const text = read(file);
      expect(text, file).not.toMatch(/\bBMD\b/);
    }
    expect(read('docker-compose.example.yml')).toContain('Treuhänder');
  });

  it('lists only variable names with empty values in .env.example, and .env is git-ignored', () => {
    const assignments = read('.env.example').split('\n').filter((line) => line.trim() !== '' && !line.startsWith('#'));
    expect(assignments).toEqual(['APALEO_CLIENT_SECRET=']);
    expect(read('.gitignore').split('\n')).toContain('.env');
  });

  it('git-ignores the folders and the log the documented setup creates inside the clone', () => {
    const paths = [
      'config/apaleo-odoo.config.yaml',
      'config/mapping-BSP.csv',
      'data/BSP/2026-10/ABACUS_Buchungen_20261001-20261031_BSP.xml',
      'data/BSP/2026-10/manifest.json',
      'schedule.log',
      'apaleo-odoo.config.yaml',
      'mapping-BSP.csv',
      'exports/BSP/2026-10/manifest.json',
      'demo-output/BSP/2026-09/manifest.json',
      '.env',
    ];
    const root = fileURLToPath(new URL('..', import.meta.url));
    // --no-index: the paths need not exist; exit code 1 (nothing ignored) makes execFileSync throw.
    const ignored = execFileSync('git', ['check-ignore', '--no-index', ...paths], { cwd: root, encoding: 'utf8' }).trimEnd().split('\n');
    expect(ignored).toEqual(paths);
  });

  it('git-ignores a local config under the new name and under every old project name', () => {
    const paths = ['odoo', 'abacus', 'bmd', 'datev'].flatMap((name) => ['yaml', 'yml', 'json'].map((ext) => `apaleo-${name}.config.${ext}`));
    const root = fileURLToPath(new URL('..', import.meta.url));
    const ignored = execFileSync('git', ['check-ignore', '--no-index', ...paths], { cwd: root, encoding: 'utf8' }).trimEnd().split('\n');
    expect(ignored).toEqual(paths);
  });

  it('still tracks the examples and templates next to those ignored paths', () => {
    const root = fileURLToPath(new URL('..', import.meta.url));
    const tracked = ['apaleo-odoo.config.example.yaml', 'docker-compose.example.yml', '.env.example', 'test/fixtures/mapping/ekr-beispiel.csv', 'test/fixtures/mapping/odoo-beispiel.csv', 'templates/skr03-hotel.rules.csv', 'templates/skr04-hotel.rules.csv'];
    let ignored = '';
    try {
      ignored = execFileSync('git', ['check-ignore', '--no-index', ...tracked], { cwd: root, encoding: 'utf8' });
    } catch {
      // exit code 1: none of them is ignored
    }
    expect(ignored).toBe('');
  });
});
