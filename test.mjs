// node test.mjs — 画面を使わない部分のテスト（9 種 × 4 つの並び方でそろう・1 手の決まり・種・保存・URL）
import assert from 'node:assert/strict';
import * as S from './sort.js';

let n = 0;
const test = (name, fn) => { fn(); n++; console.log(`ok ${name}`); };
const sorted = (a) => a.slice().sort((x, y) => x - y);
const SEEDS = [0, 1, 123456, 4294967295];

// そろうまで進める。1 手ごとに、出来事どおりに配列が変わったかを見る
function run(algoId, data, check = false) {
  const lane = S.newLane(algoId, data);
  const want = sorted(data);
  let steps = 0;
  while (!lane.done) {
    const before = lane.a.slice();
    const e = lane.next;
    assert.ok(S.step(lane));
    steps++;
    assert.ok(steps < 20000, `${algoId}: 終わらない`);
    if (!check) continue;
    const n = before.length;
    if (e.t === 'compare') {
      assert.ok(e.i !== e.j && e.i >= 0 && e.j >= 0 && e.i < n && e.j < n, `${algoId}: compare(${e.i}, ${e.j})`);
      assert.deepEqual(lane.a, before, `${algoId}: 比べただけで配列が変わった`);
    } else if (e.t === 'swap') {
      assert.ok(e.i !== e.j, `${algoId}: 自分との入れ替え`);
      const x = before.slice(); [x[e.i], x[e.j]] = [x[e.j], x[e.i]];
      assert.deepEqual(lane.a, x, `${algoId}: swap(${e.i}, ${e.j}) のとおりでない`);
    } else {
      assert.equal(e.t, 'write');
      assert.equal(lane.a[e.i], e.v, `${algoId}: write(${e.i}, ${e.v}) のとおりでない`);
    }
    assert.deepEqual(sorted(lane.a), want, `${algoId}: 途中で棒が増えた・消えた`);
  }
  assert.equal(S.total(lane), steps);
  assert.deepEqual(lane.a, want, `${algoId}: そろっていない`);
  assert.ok(lane.fixed.every((f) => f === 1), `${algoId}: 終わっても確定でない棒がある`);
  assert.equal(S.step(lane), false, 'そろったレーンは進まない');
  return lane;
}

test('データ: 同じ種なら同じ、並び方ごとの形', () => {
  for (const shape of S.SHAPES.map((s) => s.id)) {
    for (const size of S.SIZES) {
      for (const seed of SEEDS) {
        const a = S.makeData(shape, size, seed);
        assert.deepEqual(a, S.makeData(shape, size, seed), `${shape} ${size} ${seed}`);
        assert.equal(a.length, size);
        if (shape === 'few') assert.ok(a.every((v) => Number.isInteger(v) && v >= 1 && v <= 4));
        else assert.deepEqual(sorted(a), Array.from({ length: size }, (_, i) => i + 1), `${shape}: 1..n の並べ替えでない`);
      }
    }
  }
  assert.deepEqual(S.makeData('reversed', 16, 5), Array.from({ length: 16 }, (_, i) => 16 - i));
  assert.notDeepEqual(S.makeData('random', 40, 1), S.makeData('random', 40, 2));
  const nearly = S.makeData('nearly', 100, 7);
  assert.ok(nearly.filter((v, i) => v !== i + 1).length <= 20, 'ほぼそろいが崩れすぎ');
  assert.equal(S.maxValue('few', 40), 4);
  assert.equal(S.maxValue('random', 40), 40);
});

test('9 種 × 4 つの並び方 × 3 つの本数で、正しくそろう（1 手ごとに出来事どおり）', () => {
  for (const { id } of S.ALGOS) {
    for (const { id: shape } of S.SHAPES) {
      for (const size of S.SIZES) {
        for (const seed of SEEDS) run(id, S.makeData(shape, size, seed), size <= 40);
      }
    }
  }
});

test('小さい本数（1〜9 本）でもそろう', () => {
  for (const { id } of S.ALGOS) {
    for (let size = 1; size < 10; size++) {
      for (const seed of SEEDS) {
        run(id, S.makeData('random', size, seed), true);
        run(id, S.makeData('few', size, seed), true);
      }
    }
  }
});

test('同じ種なら同じ結果（比べた・動かした回数まで）', () => {
  for (const { id } of S.ALGOS) {
    const x = run(id, S.makeData('random', 40, 99));
    const y = run(id, S.makeData('random', 40, 99));
    assert.deepEqual([x.compares, x.moves], [y.compares, y.moves], id);
  }
});

test('回数: 決まった数になるもの', () => {
  const rev = S.makeData('reversed', 16, 0);
  const up = sorted(rev);
  const bub = run('bubble', rev);
  assert.deepEqual([bub.compares, bub.moves], [120, 120]);
  assert.deepEqual([run('bubble', up).compares, run('bubble', up).moves], [15, 0], 'バブルはそろっていれば 1 周で終わる');
  assert.deepEqual([run('cocktail', up).compares, run('cocktail', up).moves], [15, 0]);
  assert.deepEqual([run('insertion', rev).compares, run('insertion', rev).moves], [120, 120]);
  assert.deepEqual([run('insertion', up).compares, run('insertion', up).moves], [15, 0]);
  const sel = run('selection', S.makeData('random', 40, 3));
  assert.equal(sel.compares, 40 * 39 / 2, '選択はいつも n(n−1)/2 回比べる');
  assert.ok(sel.moves <= 39);
  const q = run('quick', up);
  assert.equal(q.compares, 15 * 16 / 2, 'クイックはそろったデータで n(n−1)/2 回比べる（右端の基準）');
  assert.equal(q.moves, 0, 'クイックは自分との入れ替えを出さない');
  // マージ: 書く回数は比べた回数と同じ（残りは動かさない）
  const m = run('merge', S.makeData('random', 40, 3));
  assert.equal(m.moves, m.compares);
});

test('ヒープ: 子が 2 つあれば 2 回比べる', () => {
  const lane = S.newLane('heap', [1, 2, 3]);   // 最初の沈める(0): 子 1・子 2 と比べる
  const seen = [];
  while (lane.next.t === 'compare') { seen.push([lane.next.i, lane.next.j]); S.step(lane); }
  assert.deepEqual(seen, [[1, 0], [2, 1]]);
});

test('マージ: 比べるのは画面の「左の残りの先頭」と「右の残りの先頭」', () => {
  const lane = S.newLane('merge', [2, 4, 1, 3]);
  const log = [];
  while (!lane.done) {
    const e = lane.next;
    if (e.t === 'compare') log.push([lane.a[e.i], lane.a[e.j]]);
    S.step(lane);
  }
  // [2]+[4] → 2 と 4、[1]+[3] → 1 と 3、[2,4]+[1,3] → 2 と 1、2 と 3、4 と 3
  assert.deepEqual(log, [[2, 4], [1, 3], [2, 1], [2, 3], [4, 3]]);
});

test('先読みしても、画面の配列は進めた手のぶんだけ変わる', () => {
  const lane = S.newLane('bubble', [2, 1]);
  assert.equal(lane.next.t, 'compare');
  assert.deepEqual(lane.a, [2, 1]);
  S.step(lane);                       // 比べた
  assert.equal(lane.last.t, 'compare');
  assert.deepEqual(lane.a, [2, 1]);   // 次の swap はまだ
  S.step(lane);                       // 入れ替えた
  assert.deepEqual(lane.a, [1, 2]);
  assert.equal(lane.done, true);      // 2 本なら 1 周で終わり。最後の手のすぐあとにゴール
  assert.equal(lane.last, null);
});

test('競走: はじめの組み合わせ（挿入 対 クイック）で、ほぼそろいなら挿入が勝つ', () => {
  for (const seed of SEEDS) {
    const data = S.makeData('nearly', 40, seed);
    const A = run('insertion', data), B = run('quick', data);
    const v = S.verdict(A, B);
    assert.equal(v.winner, 0);
    assert.ok(v.ratio > 2);
  }
  const same = S.verdict(run('heap', [3, 1, 2]), run('heap', [3, 1, 2]));
  assert.equal(same.winner, -1);
});

test('共有の文', () => {
  const st = { a: 'insertion', b: 'quick', shape: 'nearly', size: 40 };
  const A = { compares: 50, moves: 6 }, B = { compares: 700, moves: 1112 };
  assert.equal(S.shareText(st, A, B), '可視化ソート: ほぼそろいの 40 本で、挿入ソート 56 手・クイックソート 1,812 手。挿入ソートの勝ち');
  assert.match(S.shareText(st, A, A), /。引き分け$/);
  assert.equal(S.queryOf(st, 123), '?a=insertion&b=quick&d=nearly&n=40&s=123');
});

test('保存: 読めない・形がおかしいときは既定、合わない項目だけ戻す', () => {
  const def = { v: 1, a: 'insertion', b: 'quick', shape: 'random', size: 40, speed: 1, seenHelp: false };
  assert.deepEqual(S.readState(null), def);
  assert.deepEqual(S.readState('{壊れ'), def);
  assert.deepEqual(S.readState('"str"'), def);
  assert.deepEqual(S.readState('[1,2]'), def);
  const ok = { v: 1, a: 'heap', b: 'merge', shape: 'few', size: 100, speed: 3, seenHelp: true };
  assert.deepEqual(S.readState(JSON.stringify(ok)), ok);
  assert.deepEqual(
    S.readState(JSON.stringify({ a: 'bogo', b: 'shell', shape: 'saw', size: 41, speed: 9, seenHelp: 'yes' })),
    { ...def, b: 'shell' },
  );
  assert.deepEqual(S.readState(JSON.stringify({ speed: 1.5, size: '40' })), def);
});

test('URL: 合う項目だけ読む', () => {
  assert.deepEqual(S.readQuery('?a=insertion&b=quick&d=nearly&n=40&s=123456'),
    { a: 'insertion', b: 'quick', shape: 'nearly', size: 40, seed: 123456 });
  assert.deepEqual(S.readQuery(''), {});
  assert.deepEqual(S.readQuery('?a=bogo&b=&d=saw&n=41&s=-1'), {});
  assert.deepEqual(S.readQuery('?n=040'), { size: 40 });
  for (const s of ['4294967296', '1.5', 'abc', '1e3', ' 1', '+1', '99999999999', '']) {
    assert.equal(S.readQuery(`?s=${encodeURIComponent(s)}`).seed, undefined, `s=${s}`);
  }
  assert.equal(S.readQuery('?s=0').seed, 0);
  assert.equal(S.readQuery('?s=4294967295').seed, 4294967295);
  assert.equal(S.readQuery('?n=1e2').size, undefined);
});

console.log(`\n${n} 件すべて通った`);
