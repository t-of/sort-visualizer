// そろえっこの中身。画面（DOM）に触らない部分をここに集める。
// main.js（ブラウザ）と test.mjs（node）の両方から読む。
//
// やり方は function* で書き、「出来事」を 1 つずつ出す（仕様 §3「1 手」の決まり）。
//   compare(i, j) / swap(i, j) / write(i, v) … 1 手ずつ
//   focus(i) / range(l, r) / fixed(i) / gap(g) … 0 手（印を変えるだけ）
// 配列を書き換えるのは、swap・write を出したあと「次に進められたとき」。
// こうすると、次の手を先読みしても画面の配列は 1 手ぶん先に進まない。

// ---- 出来事 ----
const cmp = (i, j) => ({ t: 'compare', i, j });
const focus = (i) => ({ t: 'focus', i });
const range = (l, r) => ({ t: 'range', l, r });
const fix = (i) => ({ t: 'fixed', i });
const gap = (g) => ({ t: 'gap', g });
function* swap(a, i, j) {
  yield { t: 'swap', i, j };
  const t = a[i]; a[i] = a[j]; a[j] = t;
}

// ---- やり方（9 種） ----
function* bubble(a) {
  const n = a.length;
  for (let p = 0; p < n - 1; p++) {
    let swapped = false;
    for (let j = 0; j < n - 1 - p; j++) {
      yield cmp(j, j + 1);
      if (a[j] > a[j + 1]) { yield* swap(a, j, j + 1); swapped = true; }
    }
    yield fix(n - 1 - p);
    if (!swapped) return;   // 1 周で入れ替えなし → そろった（残りは終わりに全部確定）
  }
}

function* cocktail(a) {
  let lo = 0, hi = a.length - 1;
  while (lo < hi) {
    let swapped = false;
    for (let i = lo; i < hi; i++) {
      yield cmp(i, i + 1);
      if (a[i] > a[i + 1]) { yield* swap(a, i, i + 1); swapped = true; }
    }
    yield fix(hi--);
    if (!swapped) return;
    swapped = false;
    for (let i = hi; i > lo; i--) {
      yield cmp(i - 1, i);
      if (a[i - 1] > a[i]) { yield* swap(a, i - 1, i); swapped = true; }
    }
    yield fix(lo++);
    if (!swapped) return;
  }
}

function* selection(a) {
  const n = a.length;
  for (let i = 0; i < n - 1; i++) {
    let min = i;
    yield focus(min);
    for (let j = i + 1; j < n; j++) {
      yield cmp(j, min);
      if (a[j] < a[min]) { min = j; yield focus(min); }
    }
    if (min !== i) yield* swap(a, i, min);
    yield fix(i);
  }
}

function* insertion(a) {
  for (let i = 1; i < a.length; i++) {
    yield range(0, i);
    let j = i;
    yield focus(j);
    while (j > 0) {
      yield cmp(j - 1, j);
      if (a[j - 1] <= a[j]) break;
      yield* swap(a, j - 1, j);
      yield focus(--j);
    }
  }
}

function* shell(a) {
  const n = a.length;
  for (let g = n >> 1; g >= 1; g >>= 1) {
    yield gap(g);
    for (let i = g; i < n; i++) {
      for (let j = i; j >= g; j -= g) {
        yield cmp(j - g, j);
        if (a[j - g] <= a[j]) break;
        yield* swap(a, j - g, j);
      }
    }
  }
}

function* comb(a) {
  const n = a.length;
  let g = n, swapped = true;
  while (g > 1 || swapped) {
    g = Math.max(1, Math.floor(g / 1.3));
    yield gap(g);
    swapped = false;
    for (let i = 0; i + g < n; i++) {
      yield cmp(i, i + g);
      if (a[i] > a[i + g]) { yield* swap(a, i, i + g); swapped = true; }
    }
  }
}

// マージ: [l, m] と [m+1, r] をまとめる間、範囲の中は常に「まとめ終わった分 → 左の残り → 右の残り」。
// k = 次に置く位置、L = 左の残りの数。比べるのは画面の k（左の先頭）と k+L（右の先頭）。
function* mergeRange(a, l, r) {
  if (l >= r) return;
  const m = (l + r) >> 1;
  yield* mergeRange(a, l, m);
  yield* mergeRange(a, m + 1, r);
  yield range(l, r);
  const left = a.slice(l, m + 1);
  let li = 0;
  for (let k = l; li < left.length && k + left.length - li <= r; k++) {
    const L = left.length - li;
    yield cmp(k, k + L);
    if (left[li] <= a[k + L]) {
      yield { t: 'write', i: k, v: left[li] };   // 左から取る: 表示は変わらない
      li++;
    } else {
      const v = a[k + L];
      yield { t: 'write', i: k, v };             // 右から取る: 左の残りが 1 つ右へずれる（ずれは手に数えない）
      a[k] = v;
      for (let t = 0; t < L; t++) a[k + 1 + t] = left[li + t];
    }
  }
  // どちらかが尽きたら、残りはもう正しい位置に並んでいる
}
function* merge(a) { yield* mergeRange(a, 0, a.length - 1); }

// クイック: 基準は右端（ロムートの分け方）。再帰は深さ n まで行くので自前の積み上げで書く
function* quick(a) {
  const stack = [[0, a.length - 1]];
  while (stack.length) {
    const [lo, hi] = stack.pop();
    if (lo > hi) continue;
    if (lo === hi) { yield fix(lo); continue; }
    yield range(lo, hi);
    yield focus(hi);
    let i = lo - 1;
    for (let j = lo; j < hi; j++) {
      yield cmp(j, hi);
      if (a[j] <= a[hi]) { i++; if (i !== j) yield* swap(a, i, j); }
    }
    if (i + 1 !== hi) yield* swap(a, i + 1, hi);
    yield focus(-1);
    yield fix(i + 1);
    stack.push([i + 2, hi], [lo, i]);   // 左を先に
  }
}

function* siftDown(a, i, size) {
  for (;;) {
    yield focus(i);
    const l = 2 * i + 1, r = l + 1;
    let big = i;
    if (l < size) { yield cmp(l, big); if (a[l] > a[big]) big = l; }
    if (r < size) { yield cmp(r, big); if (a[r] > a[big]) big = r; }
    if (big === i) return;
    yield* swap(a, i, big);
    i = big;
  }
}
function* heap(a) {
  const n = a.length;
  yield range(0, n - 1);
  for (let i = (n >> 1) - 1; i >= 0; i--) yield* siftDown(a, i, n);
  for (let end = n - 1; end >= 1; end--) {
    yield* swap(a, 0, end);
    yield fix(end);
    yield range(0, end - 1);
    yield* siftDown(a, 0, end);
  }
}

export const ALGOS = [
  { id: 'bubble', name: 'バブルソート', desc: '隣どうしを比べて、大きいほうを後ろへ送る', run: bubble },
  { id: 'cocktail', name: 'カクテルソート', desc: 'バブルを行きと帰りの両方向でくり返す', run: cocktail },
  { id: 'selection', name: '選択ソート', desc: '残りからいちばん低い棒を探して、前に置く', run: selection },
  { id: 'insertion', name: '挿入ソート', desc: '1 本ずつ取り、左の並んだ所の正しい位置に差し込む', run: insertion },
  { id: 'shell', name: 'シェルソート', desc: '離れた棒どうしで差し込み、間をだんだん狭める', run: shell },
  { id: 'comb', name: 'コームソート', desc: '離れた棒どうしを比べて入れ替え、間を縮めていく', run: comb },
  { id: 'merge', name: 'マージソート', desc: '半分に分けてそれぞれ並べ、前から比べてまとめる', run: merge },
  { id: 'quick', name: 'クイックソート', desc: '右端を基準に、低い棒を左・高い棒を右に分ける', run: quick },
  { id: 'heap', name: 'ヒープソート', desc: '高い棒が上に来る山を作り、てっぺんを後ろへ出す', run: heap },
];
export const algo = (id) => ALGOS.find((x) => x.id === id);

// ---- データ ----
export const SHAPES = [
  { id: 'random', name: 'でたらめ' },
  { id: 'nearly', name: 'ほぼそろい' },
  { id: 'reversed', name: '逆さま' },
  { id: 'few', name: '同じ高さ多め' },
];
export const shapeName = (id) => SHAPES.find((x) => x.id === id).name;
export const SIZES = [16, 40, 100];
export const SPEEDS = [
  { name: 'ゆっくり', rate: 3 },
  { name: 'ふつう', rate: 60 },
  { name: 'はやい', rate: 400 },
  { name: 'いちばん', rate: 4000 },
];
export const FEW_LEVELS = 4;
export const MAX_SEED = 4294967295;

// 種から決まる乱数（mulberry32）。0 以上 1 未満
export function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const newSeed = () => Math.floor(Math.random() * (MAX_SEED + 1));

export function makeData(shape, n, seed) {
  const rnd = rng(seed);
  const pick = (k) => Math.floor(rnd() * k);
  const a = Array.from({ length: n }, (_, i) => i + 1);
  if (shape === 'random') {
    for (let i = n - 1; i > 0; i--) { const j = pick(i + 1); [a[i], a[j]] = [a[j], a[i]]; }
  } else if (shape === 'nearly') {
    for (let k = Math.max(1, Math.round(n / 10)); k > 0 && n > 1; k--) {
      const i = pick(n - 1), j = Math.min(n - 1, i + 1 + pick(3));
      [a[i], a[j]] = [a[j], a[i]];
    }
  } else if (shape === 'reversed') {
    a.reverse();
  } else if (shape === 'few') {
    for (let i = 0; i < n; i++) a[i] = 1 + pick(FEW_LEVELS);
  }
  return a;
}
// 棒の高さ = 値 ÷ これ
export const maxValue = (shape, n) => (shape === 'few' ? FEW_LEVELS : n);

// ---- レーン（1 つのやり方を 1 手ずつ進める） ----
const COUNTED = { compare: 1, swap: 1, write: 1 };

export function newLane(algoId, data) {
  const a = data.slice();
  const lane = {
    algo: algoId, a, it: algo(algoId).run(a),
    compares: 0, moves: 0, done: false,
    next: null,          // 次に進める手（先読み）
    last: null,          // 直前に進めた手（比べている・動いたの印）
    focus: -1, range: null, gap: 0, fixed: new Uint8Array(a.length),
  };
  pull(lane);
  return lane;
}

// 次の 1 手が出るまで進める。0 手の出来事はここで印に反映する。終わったら全部確定
function pull(lane) {
  for (;;) {
    const r = lane.it.next();
    if (r.done) {
      Object.assign(lane, { done: true, next: null, last: null, focus: -1, range: null, gap: 0 });
      lane.fixed.fill(1);
      return;
    }
    const e = r.value;
    if (COUNTED[e.t]) { lane.next = e; return; }
    if (e.t === 'focus') lane.focus = e.i;
    else if (e.t === 'range') lane.range = [e.l, e.r];
    else if (e.t === 'fixed') lane.fixed[e.i] = 1;
    else if (e.t === 'gap') lane.gap = e.g;
  }
}

// 1 手進める。そろったレーンは進めない（false）
export function step(lane) {
  if (lane.done) return false;
  const e = lane.next;
  if (e.t === 'compare') lane.compares++; else lane.moves++;
  lane.last = e;
  pull(lane);
  return true;
}

export const total = (lane) => lane.compares + lane.moves;

// 両方そろったあとの結果。winner: 0 = 上、1 = 下、-1 = 引き分け
export function verdict(A, B) {
  const ta = total(A), tb = total(B);
  const winner = ta === tb ? -1 : ta < tb ? 0 : 1;
  const lo = Math.min(ta, tb), hi = Math.max(ta, tb);
  return { winner, ta, tb, ratio: lo ? hi / lo : 0 };
}

const fmt = (n) => n.toLocaleString('en-US');
export function shareText(st, A, B) {
  const v = verdict(A, B);
  const end = v.winner < 0 ? '引き分け' : `${algo(v.winner ? st.b : st.a).name}の勝ち`;
  return `そろえっこ: ${shapeName(st.shape)}の ${st.size} 本で、${algo(st.a).name} ${fmt(v.ta)} 手・${algo(st.b).name} ${fmt(v.tb)} 手。${end}`;
}

// ---- 保存と URL ----
export const DEFAULTS = { v: 1, a: 'insertion', b: 'quick', shape: 'random', size: 40, speed: 1, seenHelp: false };
const okAlgo = (x) => ALGOS.some((g) => g.id === x);
const okShape = (x) => SHAPES.some((s) => s.id === x);
const okSize = (x) => SIZES.includes(x);
const okSpeed = (x) => Number.isInteger(x) && x >= 0 && x < SPEEDS.length;

// soroekko.state の中身（JSON の文字列か null）から。合わない項目だけ既定に戻す
export function readState(raw) {
  let s = null;
  try { s = JSON.parse(raw); } catch { /* 壊れている */ }
  if (!s || typeof s !== 'object') s = {};
  return {
    v: 1,
    a: okAlgo(s.a) ? s.a : DEFAULTS.a,
    b: okAlgo(s.b) ? s.b : DEFAULTS.b,
    shape: okShape(s.shape) ? s.shape : DEFAULTS.shape,
    size: okSize(s.size) ? s.size : DEFAULTS.size,
    speed: okSpeed(s.speed) ? s.speed : DEFAULTS.speed,
    seenHelp: s.seenHelp === true,
  };
}

// ?a=insertion&b=quick&d=nearly&n=40&s=123456 から、合う項目だけ返す
export function readQuery(search) {
  const q = new URLSearchParams(search);
  const out = {};
  if (okAlgo(q.get('a'))) out.a = q.get('a');
  if (okAlgo(q.get('b'))) out.b = q.get('b');
  if (okShape(q.get('d'))) out.shape = q.get('d');
  if (okSize(Number(q.get('n'))) && /^\d+$/.test(q.get('n'))) out.size = Number(q.get('n'));
  const s = q.get('s');
  if (s && /^\d{1,10}$/.test(s) && Number(s) <= MAX_SEED) out.seed = Number(s);
  return out;
}

export function queryOf(st, seed) {
  return `?a=${st.a}&b=${st.b}&d=${st.shape}&n=${st.size}&s=${seed}`;
}
