// Nothing in this project can run a migration from a laptop — there is no
// Postgres in CI and none in the dev environment (028:26-29). Every property a
// migration depends on therefore has to be checked either as a SQL assertion
// that aborts the apply (028 section 3, 032 section 1) or as a test like this
// one, which reads the files as text.
//
// THE DEFECT THIS EXISTS FOR. 028 section 5c created a scratch table
// `items_locnorm_dupe_map` in one top-level statement and read it in four
// others, all inside one uncommitted BEGIN/COMMIT. A live apply failed with
//
//     ERROR: 42P01: relation "items_locnorm_dupe_map" does not exist
//
// because consecutive top-level statements do not always share a session: over a
// pooled connection, or through a client that submits each statement as its own
// request, the CREATE lands on one backend and the read on another, where an
// uncommitted CREATE TABLE does not exist. The SQL was in order; the assumption
// underneath it was wrong.
//
// THE RULE. A scratch relation — one the migration creates for its own use and
// drops again, or declares TEMP — must be created and used inside a SINGLE
// top-level statement, normally a `DO $$ ... $$` block, which nothing can split.
// Permanent schema tables (rooms, items, places_budget, ...) are unaffected:
// they are never dropped by the file that creates them, so they are not scratch.
//
// This test does not need a database and would have caught the failure above
// before it reached one.
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

// 023 is ALREADY APPLIED to the live database and carries this defect in its own
// dedupe block (`items_dupe_map`, 023:204-252). It is deliberately not fixed
// here: 025, 027, 028 and the 03x migrations all cite 023 by file:line, and
// restructuring it would silently invalidate every one of those references for a
// file nobody needs to re-run. It is recorded instead, so a NEW violation still
// fails this test, and so that fixing 023 fails it too and forces this entry out.
const KNOWN_UNFIXED = new Set(['023_places_budget_atomic.sql:items_dupe_map']);

type Statement = { startLine: number; code: string };

// Splits SQL into top-level statements. Comments and string literals are blanked
// (newlines kept, so line numbers stay true) and `;` inside a dollar-quoted body
// does not split — which is the whole point: a DO block is one statement, and
// its body still counts as code so a table created inside it and read outside is
// visible as two statements.
function splitTopLevelStatements(sql: string): Statement[] {
  const statements: Statement[] = [];
  let code = '';
  let startLine = 1;
  let line = 1;
  let i = 0;
  let dollarTag: string | null = null;

  const flush = () => {
    if (code.trim().length > 0) {
      // Blanked comments leave the run of newlines that preceded the first real
      // token, so drop them and advance the start line by as many — otherwise
      // every reported line is the line of the PREVIOUS statement's semicolon.
      const lead = /^\s*/.exec(code)![0];
      statements.push({
        startLine: startLine + (lead.match(/\n/g)?.length ?? 0),
        code: code.slice(lead.length),
      });
    }
    code = '';
    startLine = line;
  };

  while (i < sql.length) {
    const rest = sql.slice(i, i + 64);

    const dollar = /^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/.exec(rest);
    if (dollar) {
      const tag = dollar[0];
      if (dollarTag === null) dollarTag = tag;
      else if (dollarTag === tag) dollarTag = null;
      code += ' ';
      i += tag.length;
      continue;
    }

    const ch = sql[i];

    if (ch === '\n') {
      line += 1;
      code += '\n';
      i += 1;
      continue;
    }

    if (ch === '-' && sql[i + 1] === '-') {
      while (i < sql.length && sql[i] !== '\n') i += 1;
      code += ' ';
      continue;
    }

    if (ch === '/' && sql[i + 1] === '*') {
      let depth = 1;
      i += 2;
      while (i < sql.length && depth > 0) {
        if (sql[i] === '\n') {
          line += 1;
          code += '\n';
          i += 1;
        } else if (sql[i] === '/' && sql[i + 1] === '*') {
          depth += 1;
          i += 2;
        } else if (sql[i] === '*' && sql[i + 1] === '/') {
          depth -= 1;
          i += 2;
        } else {
          i += 1;
        }
      }
      code += ' ';
      continue;
    }

    if (ch === "'") {
      i += 1;
      while (i < sql.length) {
        if (sql[i] === '\\') {
          i += 2;
          continue;
        }
        if (sql[i] === "'") {
          if (sql[i + 1] === "'") {
            i += 2;
            continue;
          }
          i += 1;
          break;
        }
        if (sql[i] === '\n') {
          line += 1;
          code += '\n';
        }
        i += 1;
      }
      code += " '' ";
      continue;
    }

    if (ch === ';' && dollarTag === null) {
      i += 1;
      flush();
      continue;
    }

    code += ch;
    i += 1;
  }
  flush();
  return statements;
}

const IDENT = '[A-Za-z_][A-Za-z0-9_$]*';
const QUALIFIED = `(?:${IDENT}\\.)?(${IDENT})`;
const CREATE_TABLE = new RegExp(
  `\\bcreate\\s+(?:(?:global|local)\\s+)?(temp|temporary)?\\s*(?:unlogged\\s+)?table\\s+(?:if\\s+not\\s+exists\\s+)?${QUALIFIED}`,
  'gi',
);
const DROP_TABLE = new RegExp(
  `\\bdrop\\s+table\\s+(?:if\\s+exists\\s+)?${QUALIFIED}`,
  'gi',
);

function lineOf(statement: Statement, offset: number): number {
  return statement.startLine + (statement.code.slice(0, offset).match(/\n/g)?.length ?? 0);
}

// A relation is "scratch" if the file both creates and drops it, or creates it
// TEMP. Either way the file owns it for the length of one apply, which is
// exactly the class of relation that must not straddle a statement boundary.
function findViolations(sql: string): string[] {
  const statements = splitTopLevelStatements(sql);
  const created = new Map<string, { statement: number; line: number; temp: boolean }>();
  const dropped = new Set<string>();

  statements.forEach((statement, index) => {
    for (const m of statement.code.matchAll(CREATE_TABLE)) {
      const name = m[2].toLowerCase();
      if (!created.has(name)) {
        created.set(name, {
          statement: index,
          line: lineOf(statement, m.index),
          temp: m[1] !== undefined,
        });
      }
    }
    for (const m of statement.code.matchAll(DROP_TABLE)) dropped.add(m[1].toLowerCase());
  });

  const violations: string[] = [];
  for (const [name, create] of created) {
    if (!create.temp && !dropped.has(name)) continue;

    const referencing = statements
      .map((statement, index) => ({ statement, index }))
      .filter(({ statement }) =>
        new RegExp(`(?:${IDENT}\\.)?\\b${name}\\b`, 'i').test(statement.code),
      );

    const strays = referencing.filter(({ index }) => index !== create.statement);
    if (strays.length === 0) continue;

    violations.push(
      `${name}: created at line ${create.line}, but also referenced by ` +
        `${strays.length} other top-level statement(s) starting at line(s) ` +
        `${strays.map(({ statement }) => statement.startLine).join(', ')}. ` +
        `Put the create, every use and the drop inside one DO $$ ... $$ block.`,
    );
  }
  return violations;
}

describe('migrations do not depend on a scratch relation surviving between statements', () => {
  const dir = __dirname;
  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  it('finds the migration files', () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it.each(files)('%s', (file) => {
    const sql = readFileSync(join(dir, file), 'utf8');
    const found = findViolations(sql).map((v) => `${file}:${v.split(':')[0]}`);
    const unexpected = found.filter((v) => !KNOWN_UNFIXED.has(v));
    const detail = findViolations(sql).join('\n');

    expect(unexpected.length === 0 ? '' : detail).toBe('');

    // Anything on the known list must still be there; when it is fixed, delete
    // its entry rather than leaving a stale exemption behind.
    for (const known of KNOWN_UNFIXED) {
      if (known.startsWith(`${file}:`)) expect(found).toContain(known);
    }
  });
});

// The splitter itself, checked against the shapes these migrations actually use.
// If it silently stopped seeing statements, the test above would pass by finding
// nothing — which is the failure mode a linter must not have.
describe('top-level statement splitter', () => {
  it('does not split inside a dollar-quoted body', () => {
    const statements = splitTopLevelStatements(
      "DO $$ BEGIN CREATE TEMP TABLE t AS SELECT 1; DELETE FROM t; END; $$;\nSELECT 1;",
    );
    expect(statements).toHaveLength(2);
  });

  it('ignores semicolons in comments and string literals', () => {
    const statements = splitTopLevelStatements(
      "SELECT 'a;b' -- ;\n , 1;\n/* ; */ SELECT 2;",
    );
    expect(statements).toHaveLength(2);
  });

  it('flags a scratch table read from a second statement', () => {
    expect(
      findViolations('CREATE TABLE m AS SELECT 1 AS id;\nDELETE FROM m;\nDROP TABLE m;'),
    ).toHaveLength(1);
  });

  it('accepts the same work inside one DO block', () => {
    expect(
      findViolations(
        'DO $$ BEGIN CREATE TEMP TABLE m ON COMMIT DROP AS SELECT 1 AS id; DELETE FROM m; END; $$;',
      ),
    ).toHaveLength(0);
  });

  it('does not flag permanent schema tables the file never drops', () => {
    expect(
      findViolations('CREATE TABLE items (id uuid);\nINSERT INTO items VALUES (1);'),
    ).toHaveLength(0);
  });
});
