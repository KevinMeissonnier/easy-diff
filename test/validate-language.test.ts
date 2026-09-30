import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { makeTmpRepo, removeTmpRepo } from './helpers/tmp-repo.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const hook = path.join(here, '..', 'templates', 'hooks', 'validate-language.cjs');
const validAnalysis = JSON.parse(
  fs.readFileSync(path.join(here, '..', 'templates', 'analysis.example.json'), 'utf8')
);

function withConfig(language: string | undefined): string {
  const cwd = makeTmpRepo();
  if (language !== undefined) {
    fs.mkdirSync(path.join(cwd, '.claude', 'easy-diff'), { recursive: true });
    fs.writeFileSync(
      path.join(cwd, '.claude', 'easy-diff', 'config.json'),
      JSON.stringify({ language })
    );
  }
  return cwd;
}

function run(input: Record<string, unknown>): { blocked: boolean; stderr: string } {
  try {
    const out = execFileSync('node', [hook], { input: JSON.stringify(input), encoding: 'utf8' });
    return { blocked: false, stderr: out };
  } catch (err) {
    const e = err as { status: number; stderr: string };
    assert.equal(e.status, 2, `expected exit code 2 on block, got ${e.status}`);
    return { blocked: true, stderr: e.stderr };
  }
}

test('validate-language hook: allows English prose when configured language is English (default)', (t) => {
  const cwd = withConfig(undefined);
  t.after(() => removeTmpRepo(cwd));
  const { blocked } = run({ cwd, last_assistant_message: JSON.stringify(validAnalysis) });
  assert.equal(blocked, false);
});

test('validate-language hook: blocks English prose when configured language is French', (t) => {
  const cwd = withConfig('fr');
  t.after(() => removeTmpRepo(cwd));
  const { blocked, stderr } = run({ cwd, last_assistant_message: JSON.stringify(validAnalysis) });
  assert.equal(blocked, true);
  assert.match(stderr, /language mismatch/);
  assert.match(stderr, /French/);
});

test('validate-language hook: allows French prose when configured language is French', (t) => {
  const cwd = withConfig('fr');
  t.after(() => removeTmpRepo(cwd));
  const frAnalysis = {
    merge_request: { title: 'Ajoute un cache pour les jetons de session' },
    overview: {
      what:
        "Un cache Redis est placé devant la vérification des jetons de session. Le contrat public " +
        'de la méthode reste inchangé : même signature, mêmes exceptions, même ordre des ' +
        'vérifications, pour éviter toute régression dans le comportement observé par les ' +
        'appelants existants de ce service.',
      why:
        "Chaque requête authentifiée fait actuellement un aller-retour vers la base de données " +
        "pour revalider un jeton qui vient d'être vérifié quelques millisecondes plus tôt, ce qui " +
        'pèse lourdement sur les performances aux heures de pointe et sur la charge globale.',
      risks: "Un jeton révoqué laissé dans le cache serait accepté comme valide, sans cette étape.",
      out_of_scope: "La mise en cache des permissions et la purge des sessions expirées ne sont pas concernées.",
    },
    steps: [],
  };
  const { blocked } = run({ cwd, last_assistant_message: JSON.stringify(frAnalysis) });
  assert.equal(blocked, false);
});

test('validate-language hook: checks step narratives and decisions, not just the overview', (t) => {
  const cwd = withConfig('en');
  t.after(() => removeTmpRepo(cwd));
  const frProse = {
    merge_request: { title: 'Cache' },
    overview: {
      decisions: [
        {
          choice: "La suppression dans le cache se fait lors de la révocation, pas avec une durée courte.",
          reason: "Une durée courte réduit la fenêtre sans la fermer, ce qui ne suffit pas pour une révocation.",
        },
      ],
    },
    steps: [
      {
        narrative:
          "Le cache est consulté avant la base de données. La lecture se fait après le décodage " +
          'de la signature, pour que les jetons mal signés ne servent jamais de clé.',
      },
    ],
  };
  const { blocked, stderr } = run({ cwd, last_assistant_message: JSON.stringify(frProse) });
  assert.equal(blocked, true);
  assert.match(stderr, /English/);
});

test('validate-language hook: treats a missing config as English', (t) => {
  const cwd = makeTmpRepo(); // no .claude/easy-diff/config.json at all
  t.after(() => removeTmpRepo(cwd));
  const { blocked } = run({ cwd, last_assistant_message: JSON.stringify(validAnalysis) });
  assert.equal(blocked, false);
});

test('validate-language hook: treats an invalid config language as English', (t) => {
  const cwd = withConfig('de');
  t.after(() => removeTmpRepo(cwd));
  const { blocked } = run({ cwd, last_assistant_message: JSON.stringify(validAnalysis) });
  assert.equal(blocked, false);
});

test('validate-language hook: does not block on too little text to judge', (t) => {
  const cwd = withConfig('fr');
  t.after(() => removeTmpRepo(cwd));
  const tiny = {
    merge_request: { title: 'Fix' },
    overview: { what: 'Redis cache.', why: 'Speed.', risks: 'None.', out_of_scope: 'N/A.' },
    steps: [],
  };
  const { blocked } = run({ cwd, last_assistant_message: JSON.stringify(tiny) });
  assert.equal(blocked, false);
});

test('validate-language hook: does not loop forever (stop_hook_active allows through)', (t) => {
  const cwd = withConfig('fr');
  t.after(() => removeTmpRepo(cwd));
  const { blocked } = run({
    cwd,
    last_assistant_message: JSON.stringify(validAnalysis),
    stop_hook_active: true,
  });
  assert.equal(blocked, false);
});

test('validate-language hook: fails open on unparseable hook input', () => {
  const out = execFileSync('node', [hook], { input: 'not json', encoding: 'utf8' });
  assert.equal(out, '');
});

test('validate-language hook: fails open on non-JSON assistant output', (t) => {
  const cwd = withConfig('fr');
  t.after(() => removeTmpRepo(cwd));
  const { blocked } = run({ cwd, last_assistant_message: 'not json at all' });
  assert.equal(blocked, false);
});
