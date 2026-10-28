import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  BlocklistError, STATUS, normalizeHandle, parseBlocklists, runBlocks, writeBlocklist,
} from '../lib.js';

const parse = (name, text) => parseBlocklists([{ name, text }]);

test('normalizeHandle accepte pseudos et URLs de profil', () => {
  assert.equal(normalizeHandle('@Foo.Bar_1'), 'foo.bar_1');
  assert.equal(normalizeHandle('https://www.threads.net/@someone?hl=fr'), 'someone');
  assert.equal(normalizeHandle('threads.com/@Someone/post/abc'), 'someone');
});

test('normalizeHandle rejette les entrées invalides', () => {
  for (const raw of ['', '@', 'has space', 'a'.repeat(31), 'bad!char', 'https://example.com/@x']) {
    assert.equal(normalizeHandle(raw), null, raw);
  }
});

test('txt : commentaires, doublons, invalides', () => {
  const r = parse('l.txt', '# liste\n@Alice\nbob  # troll\n\nalice\nnot valid\n');
  assert.deepEqual(r.handles, ['alice', 'bob']);
  assert.equal(r.duplicates, 1);
  assert.deepEqual(r.invalid, ['not valid']);
});

test('csv : avec en-tête, sans en-tête, BOM, guillemets', () => {
  assert.deepEqual(parse('l.csv', 'id,Username,reason\n1,alice,spam\n2,@bob,bot\n').handles, ['alice', 'bob']);
  assert.deepEqual(parse('l.csv', 'alice,spam\nbob,bot\n').handles, ['alice', 'bob']);
  assert.deepEqual(parse('l.csv', '﻿username\r\nalice\r\n').handles, ['alice']);
  assert.deepEqual(parse('l.csv', 'username,reason\n"alice","spam, bots"\n').handles, ['alice']);
});

test('json : liste, objets, conteneur, erreurs', () => {
  assert.deepEqual(parse('l.json', '["alice", "@bob"]').handles, ['alice', 'bob']);
  assert.deepEqual(parse('l.json', '{"users": [{"username": "alice"}, {"handle": "bob"}]}').handles, ['alice', 'bob']);
  assert.throws(() => parse('l.json', '{nope'), BlocklistError);
  assert.throws(() => parse('l.json', '{"x": 1}'), BlocklistError);
});

test('plusieurs sources : doublons fusionnés', () => {
  const r = parseBlocklists([{ name: 'a.txt', text: 'alice\nbob' }, { name: 'b.txt', text: 'bob\ncarol' }]);
  assert.deepEqual(r.handles, ['alice', 'bob', 'carol']);
  assert.equal(r.duplicates, 1);
});

test('export puis import : aller-retour dans les 3 formats', () => {
  const handles = ['alice', 'bob.smith', 'c_d'];
  for (const [format, name] of [['txt', 'b.txt'], ['csv', 'b.csv'], ['json', 'b.json']]) {
    const r = parse(name, writeBlocklist(handles, format, new Date('2026-10-28')));
    assert.deepEqual(r.handles, handles, format);
    assert.deepEqual(r.invalid, [], format);
  }
  assert.match(writeBlocklist(handles, 'txt', new Date('2026-10-28')), /^# Comptes bloqués exportés le 2026-10-28 \(3 comptes\)/);
});

// --- runBlocks ---

function harness(outcomes = {}, { fatalOn } = {}) {
  const calls = [];
  const sleeps = [];
  return {
    calls, sleeps,
    block: async (h) => {
      calls.push(h);
      if (h === fatalOn) throw new Error('boom');
      return outcomes[h] ?? STATUS.BLOCKED;
    },
    sleep: async (ms) => { sleeps.push(ms); },
  };
}

test('runBlocks : compte les statuts et alimente results', async () => {
  const h = harness({ b: STATUS.ALREADY_BLOCKED, c: STATUS.NOT_FOUND });
  const results = {};
  const s = await runBlocks({ handles: ['a', 'b', 'c'], results, block: h.block, sleep: h.sleep });
  assert.deepEqual(s.counts, { blocked: 1, already_blocked: 1, not_found: 1 });
  assert.equal(results.a, STATUS.BLOCKED);
});

test('runBlocks : reprise (saute les traités, retente les échecs)', async () => {
  const h = harness();
  const results = { a: STATUS.BLOCKED, b: STATUS.FAILED };
  const s = await runBlocks({ handles: ['a', 'b'], results, block: h.block, sleep: h.sleep });
  assert.deepEqual(h.calls, ['b']);
  assert.equal(s.skipped, 1);
});

test('runBlocks : limite et pauses entre appels uniquement', async () => {
  const h = harness();
  const s = await runBlocks({
    handles: ['a', 'b', 'c', 'd'], results: {}, block: h.block, sleep: h.sleep, limit: 3, delay: [5, 10], rng: () => 0.5,
  });
  assert.deepEqual(h.calls, ['a', 'b', 'c']);
  assert.equal(s.remaining, 1);
  assert.deepEqual(h.sleeps, [7500, 7500]);
});

test('runBlocks : arrêt après des échecs consécutifs, remis à zéro par un succès', async () => {
  const fail = { a: STATUS.FAILED, b: STATUS.FAILED, c: STATUS.FAILED };
  const h1 = harness(fail);
  const s1 = await runBlocks({ handles: [...'abcde'], results: {}, block: h1.block, sleep: h1.sleep, maxConsecutiveFailures: 3 });
  assert.deepEqual(h1.calls, ['a', 'b', 'c']);
  assert.match(s1.aborted, /^3 échecs/);
  assert.equal(s1.remaining, 2);

  const h2 = harness({ a: STATUS.FAILED, b: STATUS.FAILED, d: STATUS.FAILED });
  const s2 = await runBlocks({ handles: [...'abcde'], results: {}, block: h2.block, sleep: h2.sleep, maxConsecutiveFailures: 3 });
  assert.equal(s2.aborted, null);
  assert.equal(h2.calls.length, 5);
});

test('runBlocks : session expirée = arrêt sans rien enregistrer pour ce compte', async () => {
  const h = harness({ b: STATUS.LOGIN_REQUIRED });
  const results = {};
  const s = await runBlocks({ handles: ['a', 'b', 'c'], results, block: h.block, sleep: h.sleep });
  assert.match(s.aborted, /session Threads/);
  assert.equal(s.remaining, 2);
  assert.deepEqual(Object.keys(results), ['a']);
});

test('runBlocks : erreur du backend = arrêt, progression conservée', async () => {
  const h = harness({}, { fatalOn: 'b' });
  const results = {};
  const s = await runBlocks({ handles: ['a', 'b', 'c'], results, block: h.block, sleep: h.sleep });
  assert.equal(s.aborted, 'boom');
  assert.deepEqual(Object.keys(results), ['a']);
});

test('runBlocks : le signal d\'arrêt est respecté', async () => {
  const h = harness();
  const ctl = new AbortController();
  const s = await runBlocks({
    handles: ['a', 'b', 'c'], results: {}, block: h.block, sleep: h.sleep, signal: ctl.signal,
    onResult: () => ctl.abort(),
  });
  assert.deepEqual(h.calls, ['a']);
  assert.match(s.aborted, /arrêté/);
  assert.equal(s.remaining, 2);
});
