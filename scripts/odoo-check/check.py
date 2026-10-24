# Local maintainer test import (o02 task group 7), run inside an official Odoo
# container with `odoo shell` (no RPC, no API key, no credentials):
#
#   CHART=skr03 odoo shell -d <db> --no-http < /check/check.py
#
# The database already has `account` and `l10n_de` installed (run.sh). The script
# creates a German target company with the chart CHART, the journal APA and a
# German-language user, imports every golden file of /golden through
# base_import (dry run first, then for real), and prints per entry the state,
# Odoo's tax lines, any "Automatic Balancing Line" and the comparison with the
# tool's tax model. Then it runs the re-import, audit-trail, account-prefix and
# two-company cases of openspec/research/o-target.md §10. Every result line
# starts with "RESULT". Nothing is kept: run.sh throws the database away.
#
# The golden files are written for SKR03 and company 1. The script maps them to
# the target company: accounts and taxes to the chart (SKR04 codes for a SKR04
# run, the generated Geldtransit code of the database), tax External IDs to the
# target company, and the entry External IDs to one prefix per file, so that the
# files do not update each other's entries.

import os
import re
from decimal import ROUND_HALF_UP, Decimal

CHART = os.environ.get('CHART', 'skr03')
GOLDEN = '/golden'
from odoo import SUPERUSER_ID, api, release

VERSION = int(release.version_info[0])
env = self.env  # noqa: F821 (odoo shell provides `self`)

PER_TAX_FILES = {'per-tax-vat-difference', 'per-tax-rounding-account', 'de-month.per-tax'}
RESULTS = []


def result(key, value):
    line = f'RESULT {VERSION} {CHART} {key}: {value}'
    RESULTS.append(line)
    print(line, flush=True)


# --- Target company -------------------------------------------------------------

germany = env.ref('base.de')
eur = env.ref('base.EUR')
eur.active = True
# As in the web client: a German company first gets Odoo's automatic chart (in 18
# and 19 SKR03, loaded when the transaction commits), and the wanted chart then
# replaces it while the company has no entries. The database is thrown away, so
# committing is harmless; after each commit the script continues in a fresh
# environment, because loading a chart can install modules and reload the registry.


def fresh():
    env.cr.commit()
    return api.Environment(env.cr, SUPERUSER_ID, {})


company = env['res.company'].create({'name': f'Hotel Check {CHART.upper()}', 'country_id': germany.id, 'currency_id': eur.id})
env.user.company_ids |= company
env = fresh()
company = env['res.company'].browse(company.id)
if company.chart_template != f'de_{CHART}':
    env['account.chart.template'].try_loading(f'de_{CHART}', company=company, install_demo=False)
env = fresh()
company = env['res.company'].browse(company.id)
# The other company of the database gets the same chart, so that its accounts have
# the same codes (research §10 question 11).
other = env['res.company'].search([('id', '!=', company.id)], order='id', limit=1)
if other.chart_template != f'de_{CHART}':
    other.country_id = germany
    env['account.chart.template'].try_loading(f'de_{CHART}', company=other, install_demo=False)
    env = fresh()
    company = env['res.company'].browse(company.id)
    other = env['res.company'].browse(other.id)
env = env(context=dict(env.context, allowed_company_ids=[company.id]))
company = company.with_env(env)
taxes = env['account.tax'].search([('company_id', '=', company.id), ('type_tax_use', '=', 'sale'), ('amount', 'in', [7, 19])])
xmlids = sorted(x.split('.', 1)[1].split('_', 1)[1] for x in taxes.get_external_id().values() if re.search(r'^account\.\d+_tax_ust_(7|19)_skr0[34]$', x))
result('company', f'id {company.id}, chart {company.chart_template}, sale taxes {xmlids}, other companies {env["res.company"].sudo().search_count([]) - 1}')

audit_field = 'restrictive_audit_trail' if VERSION >= 19 else 'check_account_audit_trail'
result('audit trail', f'{audit_field}={getattr(company, audit_field, "missing")}')

Account = env['account.account']


def account_by_code(code):
    domain = [('code', '=', code)]
    domain += [('company_ids', 'in', company.ids)] if 'company_ids' in Account._fields else [('company_id', '=', company.id)]
    return Account.search(domain, limit=1)


transfer = company.transfer_account_id.code
cash_journal = env['account.journal'].search([('type', '=', 'cash'), ('company_id', '=', company.id)], limit=1)
cash_note = 'cash journal created with the chart'
if not cash_journal:
    # Odoo 19 creates no cash journal with the chart: the hotel creates one, and Odoo gives it a new account.
    cash_journal = env['account.journal'].create({'name': 'Kasse', 'type': 'cash', 'company_id': company.id})
    cash_note = 'no cash journal with the chart; a new cash journal got this account'
result('generated accounts', f'Kasse {cash_journal.default_account_id.code} ({cash_note}), Geldtransit {transfer}')

# SKR03 code of the golden files -> SKR04 code. 1401 must be mapped: in SKR04 it is
# Vorsteuer 7 %, so an unmapped 1401 would import onto the wrong account silently.
SKR04 = {'1401': '1200', '1410': '1210', '1711': '3260', '1718': '3272', '8200': '4200', '8300': '4300', '8400': '4400'}
ACCOUNTS = dict(SKR04) if CHART == 'skr04' else {'4200': '8400'}
# The generated accounts of the database: Kasse (SKR03 1001, SKR04 1601) and Geldtransit.
ACCOUNTS['1001'] = cash_journal.default_account_id.code
ACCOUNTS['1360'] = transfer

rounding_account = None
for code in (['2700', '2742'] if CHART == 'skr03' else ['4830', '4840', '4900']):
    candidate = account_by_code(code)
    if candidate and not candidate.tax_ids:
        rounding_account = candidate.code
        break
ACCOUNTS['2700'] = rounding_account
result('rounding account', f'{rounding_account} for the 2700 of the golden files')
for golden_code, code in sorted(ACCOUNTS.items()):
    found = account_by_code(code)
    defaults = ', '.join(found.tax_ids.mapped('name')) if found else ''
    result('account map', f'{golden_code} -> {code} ({"found" if found else "MISSING"}{", default taxes " + defaults if defaults else ""})')

# A German-language accountant who imports (research §10 question 1). Not the
# superuser of `odoo shell`, so the multi-company record rules apply as in the UI.
# run.sh creates the database with --load-language=de_DE.
assert env['res.lang'].search([('code', '=', 'de_DE')]), 'de_DE is not installed'
Users = env['res.users']
groups = [env.ref('base.group_user').id, env.ref('account.group_account_manager').id, env.ref('account.group_account_user').id]
importer = Users.create({
    'name': 'Buchhaltung Prüfung', 'login': f'pruefung-{CHART}', 'lang': 'de_DE',
    'group_ids' if 'group_ids' in Users._fields else 'groups_id': [(6, 0, groups)],
    'company_id': company.id, 'company_ids': [(6, 0, [company.id, other.id])],
})
journal = env['account.journal'].create({'name': 'apaleo', 'code': 'APA', 'type': 'general', 'company_id': company.id})
# The setup is committed (the database is thrown away anyway), so every import
# below sees it as a request in the web client would.
env.cr.commit()
env.invalidate_all()
genv = env(user=importer.id, context=dict(env.context, lang='de_DE', allowed_company_ids=[company.id]))


# --- Mapping and import ---------------------------------------------------------

def mapped_csv(name, text, prefix):
    rows = text.split('\n')
    out = [rows[0]]
    for row in rows[1:]:
        if not row:
            out.append(row)
            continue
        cells = parse_row(row)
        cells[5] = ACCOUNTS.get(cells[5], cells[5])
        if cells[9]:
            tax = re.sub(r'^account\.\d+_', f'account.{company.id}_', cells[9])
            cells[9] = tax.replace('_skr03', '_skr04') if CHART == 'skr04' else tax
        for i in (0, 4):
            cells[i] = re.sub(r'^apaleo_c\d+_BSP', prefix, cells[i])
        out.append(','.join(quote(c) for c in cells))
    return '\n'.join(out)


def parse_row(row):
    cells, cell, quoted, i = [], '', False, 0
    while i < len(row):
        ch = row[i]
        if quoted:
            if ch == '"' and row[i + 1:i + 2] == '"':
                cell += '"'
                i += 1
            elif ch == '"':
                quoted = False
            else:
                cell += ch
        elif ch == '"':
            quoted = True
        elif ch == ',':
            cells.append(cell)
            cell = ''
        else:
            cell += ch
        i += 1
    return cells + [cell]


def quote(value):
    return f'"{value.replace(chr(34), chr(34) * 2)}"' if re.search(r'[,"\n]|^ | $', value) else value


OPTIONS = {
    'quoting': '"', 'separator': ',', 'encoding': 'utf-8', 'has_headers': True, 'date_format': '%Y-%m-%d', 'datetime_format': '',
    'float_thousand_separator': '', 'float_decimal_separator': '.', 'advanced': True, 'keep_matches': False, 'name_create_enabled_fields': {},
    'import_set_empty_fields': [], 'import_skip_records': [], 'fallback_values': {}, 'skip': 0, 'limit': 2000, 'sheets': [], 'sheet': '',
}


def run_import(name, text, dryrun_first=True, environment=None):
    environment = environment or genv
    env.invalidate_all()
    record = environment['base_import.import'].create({'res_model': 'account.move', 'file': text.encode(), 'file_name': f'{name}.csv', 'file_type': 'text/csv'})
    preview = record.parse_preview(dict(OPTIONS))
    if preview.get('error'):
        return {'error': preview['error']}
    headers = preview['headers']
    matches = preview.get('matches', {})
    fields = ['/'.join(matches[i]) if i in matches else headers[i] for i in range(len(headers))]
    unmatched = [h for i, h in enumerate(headers) if i not in matches]
    if dryrun_first:
        test = record.execute_import(fields, headers, dict(OPTIONS), dryrun=True)
        errors = [m for m in test.get('messages', []) if m.get('type') == 'error']
        if errors:
            return {'error': '; '.join(m['message'] for m in errors), 'unmatched': unmatched}
    done = record.execute_import(fields, headers, dict(OPTIONS), dryrun=False)
    messages = done.get('messages', [])
    errors = [m for m in messages if m.get('type') == 'error']
    warnings = [m['message'] for m in messages if m.get('type') == 'warning']
    return {'ids': done.get('ids') or [], 'error': '; '.join(m['message'] for m in errors) if errors else None, 'unmatched': unmatched, 'warnings': warnings}


def rate_of(xmlid):
    return Decimal(env.ref(xmlid).amount)


def round_cent(value):
    return value.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)


def describe_moves(moves, text, per_tax):
    suspense = company.account_journal_suspense_account_id
    ok = True
    # Expected tax per entry and (tax, side), from the file.
    expected, entry = {}, None
    for row in text.split('\n')[1:]:
        if not row:
            continue
        cells = parse_row(row)
        entry = cells[0] or entry
        if cells[9]:
            debit, credit = Decimal(cells[7]), Decimal(cells[8])
            expected.setdefault(entry, {}).setdefault((cells[9], 'credit' if credit > 0 else 'debit'), []).append(debit + credit)
    for move in moves.sorted('date'):
        xmlid = move.get_external_id().get(move.id, '')
        balancing = move.line_ids.filtered(lambda l: any(t in (l.name or '') for t in ('Automatic Balancing', 'Ausgleichszeile')) or (suspense and l.account_id == suspense))
        tax_lines = move.line_ids.filtered('tax_line_id')
        actual = {}
        for line in tax_lines:
            side = 'credit' if line.credit > 0 else 'debit'
            key = (line.tax_line_id.get_external_id().get(line.tax_line_id.id, ''), side)
            actual[key] = actual.get(key, Decimal(0)) + Decimal(str(line.credit or line.debit))
        model = {}
        for (tax, side), bases in expected.get(xmlid.split('.', 1)[-1], {}).items():
            rate = rate_of(tax) / 100
            amount = sum(round_cent(b * rate) for b in bases) if not per_tax else round_cent(sum(bases) * rate)
            model[(tax, side)] = model.get((tax, side), Decimal(0)) + amount
        model = {k: v for k, v in model.items() if v}
        same = {k: round_cent(v) for k, v in actual.items()} == {k: round_cent(v) for k, v in model.items()}
        ok = ok and same and not balancing and move.state == 'draft'
        tags = sorted(set(move.line_ids.mapped('tax_tag_ids.name')))
        untaxed_on_default = [l.account_id.code for l in move.line_ids if not l.tax_ids and not l.tax_line_id and l.account_id.tax_ids]
        result(
            '  entry',
            f'{move.ref} state {move.state}, {len(move.line_ids)} lines, tax lines '
            + ', '.join(f'{l.account_id.code} {"H" if l.credit else "S"} {l.credit or l.debit:.2f} ({l.tax_line_id.name})' for l in tax_lines)
            + f'; model {"matches" if same else "DIFFERS " + str(model) + " vs " + str(actual)}'
            + f'; balancing line {"YES " + str(balancing.mapped("balance")) if balancing else "none"}'
            + f'; tags {", ".join(tags) or "none"}'
            + (f'; untaxed lines on accounts with a default tax: {", ".join(untaxed_on_default)}' if untaxed_on_default else ''),
        )
    return ok


def set_rounding(per_tax):
    company.tax_calculation_rounding_method = 'round_globally' if per_tax else 'round_per_line'


def moves_of(prefix):
    data = env['ir.model.data'].search([('model', '=', 'account.move'), ('module', '=', '__import__'), ('name', '=like', f'{prefix}%')])
    return env['account.move'].browse(data.mapped('res_id')).exists()


# --- 1. Every golden file -------------------------------------------------------

all_ok = True
texts = {}
for file in sorted(os.listdir(GOLDEN)):
    name = file[:-4]
    per_tax = name in PER_TAX_FILES
    # Only [a-z0-9_] in the External ID: a "." (de-month.per-line) would make Odoo read
    # the part before it as the module name, and moves_of() would find nothing.
    prefix = f'chk_{re.sub(r"[^a-z0-9_]", "_", name.lower())}'
    raw = open(os.path.join(GOLDEN, file), encoding='utf-8').read()
    expected_entries = sum(1 for row in raw.split('\n')[1:] if row and not row.startswith(','))
    text = mapped_csv(name, raw, f'apaleo_c{company.id}_{prefix}')
    texts[name] = (text, prefix)
    set_rounding(per_tax)
    outcome = run_import(name, text)
    moves = moves_of(f'apaleo_c{company.id}_{prefix}')
    head = f'{name} ({"round_globally" if per_tax else "round_per_line"})'
    if outcome.get('error'):
        all_ok = all_ok and name == 'empty-month' and not moves
        result('import', f'{head}: ERROR {outcome["error"]}')
        continue
    count_ok = len(moves) == expected_entries
    result('import', f'{head}: {len(moves)} entries{"" if count_ok else f" (EXPECTED {expected_entries})"}, unmatched headers {outcome["unmatched"] or "none"}, warnings {outcome["warnings"] or "none"}')
    # A file with entries that yields fewer moves (for example none found under the prefix) is a failure, never "ok".
    all_ok = describe_moves(moves, text, per_tax) and count_ok and all_ok
result('golden files', 'all imported as drafts, taxes as modelled, no balancing line' if all_ok else 'SEE ABOVE')

# --- 2. Re-import, posting, reversal, revision (question 5) and audit trail (question 8) ---

set_rounding(False)
text, prefix = texts['lodging-drinks-card']
moves = moves_of(f'apaleo_c{company.id}_{prefix}')
def snapshot(ms):
    env.invalidate_all()
    return sorted((m.id, m.state, l.account_id.code, round(l.debit, 2), round(l.credit, 2), tuple(l.tax_ids.ids)) for m in ms for l in m.line_ids)


def show(ms):
    return '; '.join(f'{a} {"S" if d else "H"} {d or c:.2f}' for _, _, a, d, c, _ in snapshot(ms))

before = snapshot(moves)
again = run_import('again', text)
result('q5 unchanged file over drafts', f'error {again.get("error")}, entries {len(moves_of(f"apaleo_c{company.id}_{prefix}"))}, lines unchanged {snapshot(moves) == before}: {show(moves)}')

moves.action_post()
before = snapshot(moves)
again = run_import('again-posted', text)
result('q5 unchanged file over posted', f'error {again.get("error")}, states {set(moves.mapped("state"))}, lines unchanged {snapshot(moves) == before}: {show(moves)}')

# Balanced after Odoo's tax: 112.16 at 7 % gives 120.01, so the payment is 143.81.
changed = text.replace(',0.00,112.15,', ',0.00,112.16,').replace(',143.80,0.00,', ',143.81,0.00,')
assert changed != text
again = run_import('changed-posted', changed)
result('q5 changed file over posted', f'refused {bool(again.get("error"))}: {again.get("error")}; import result ids {again.get("ids")}, entries {len(moves_of(f"apaleo_c{company.id}_{prefix}"))}, lines unchanged {snapshot(moves) == before}: {show(moves)}')

env.invalidate_all()
reversal = moves._reverse_moves([{'date': moves.date, 'ref': f'Storno {moves.ref}'}])
reversal.action_post()
again = run_import('changed-reversed', changed)
result('q5 changed file over reversed', f'refused {bool(again.get("error"))}: {again.get("error")}; original state {moves.state}')

revision = text.replace(f'apaleo_c{company.id}_{prefix}_20260914', f'apaleo_c{company.id}_{prefix}_20260914_r2').replace('apaleo BSP 2026-09-14', 'apaleo BSP 2026-09-14 (Korrektur 2)')
again = run_import('revision-after-reversal', revision)
new = moves_of(f'apaleo_c{company.id}_{prefix}_20260914_r2')
result('q5 revision 2 after reversing the posted entry', f'error {again.get("error")}, new entries {len(new)} ({", ".join(new.mapped("state"))})')

text2, prefix2 = texts['two-days']
drafts = moves_of(f'apaleo_c{company.id}_{prefix2}')
try:
    drafts.unlink()
    result('q8 delete never-posted drafts with the audit trail on', f'allowed, {len(drafts)} deleted')
except Exception as error:  # noqa: BLE001
    result('q8 delete never-posted drafts with the audit trail on', f'REFUSED {error}')
revision2 = re.sub(rf'(apaleo_c{company.id}_{prefix2}_\d{{8}})', r'\1_r2', text2).replace(' 2026-09-14,', ' 2026-09-14 (Korrektur 2),').replace(' 2026-09-15,', ' 2026-09-15 (Korrektur 2),')
again = run_import('revision-after-delete', revision2)
result('q5 revision 2 after deleting the drafts', f'error {again.get("error")}, new entries {len(moves_of(f"apaleo_c{company.id}_{prefix2}"))}')

# --- 3. Account prefix search (question 6) ----------------------------------------

code_8400 = ACCOUNTS.get('8400', '8400') if CHART == 'skr04' else '8400'
sub = account_by_code(code_8400).copy({'code': f'{code_8400}1', 'name': 'Unterkonto Prüfung'})
text6 = texts['lodging-drinks-card'][0].replace(f'apaleo_c{company.id}_{texts["lodging-drinks-card"][1]}', f'apaleo_c{company.id}_chk_q6')
outcome = run_import('q6', text6)
moves6 = moves_of(f'apaleo_c{company.id}_chk_q6')
codes = sorted(set(moves6.line_ids.mapped('account_id.code')))
result('q6 account code with a sub-account', f'{code_8400} with {sub.code} present: error {outcome.get("error")}, warnings {outcome.get("warnings")}, accounts used {codes}')

# --- 4. Two companies (question 11) ---------------------------------------------

text11 = texts['lodging-drinks-card'][0].replace(f'apaleo_c{company.id}_{texts["lodging-drinks-card"][1]}', f'apaleo_c{company.id}_chk_q11')
both = genv(context=dict(genv.context, allowed_company_ids=[company.id, other.id]))
outcome = run_import('q11-both', text11, environment=both)
moves11 = moves_of(f'apaleo_c{company.id}_chk_q11')
result('q11 two companies active', f'other company {other.id} ({other.chart_template}): error {outcome.get("error")}, warnings {outcome.get("warnings")}, entries {len(moves11)} in companies {set(moves11.mapped("company_id.id"))}')

if VERSION >= 18:
    branch = env['res.company'].create({'name': 'Hotel Check Niederlassung', 'parent_id': company.id, 'country_id': germany.id})
    importer.company_ids |= branch
    env['account.journal'].with_company(branch).create({'name': 'apaleo Niederlassung', 'code': 'APB', 'type': 'general', 'company_id': branch.id})
    benv = genv(context=dict(genv.context, allowed_company_ids=[branch.id, company.id]))
    text_b = text11.replace('chk_q11', 'chk_branch').replace(',APA,', ',APB,')
    outcome = run_import('q11-branch', text_b, environment=benv)
    moves_b = moves_of(f'apaleo_c{company.id}_chk_branch')
    result('q11 branch with the root company taxes', f'error {outcome.get("error")}, entries {len(moves_b)} in companies {set(moves_b.mapped("company_id.id"))}, tax lines {len(moves_b.line_ids.filtered("tax_line_id"))}')

result('done', 'ok' if all_ok else 'with problems')
env.cr.rollback()
