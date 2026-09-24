// 画面と操作。中身（9 種のやり方・1 手の進め方・データ・保存と URL の読み書き）は sort.js にある。
import {
  ALGOS, SHAPES, SIZES, SPEEDS, algo, makeData, maxValue, newSeed, newLane, step, total, verdict,
  shareText, readState, readQuery, queryOf,
} from './sort.js';

// localStorage はほかのアプリと共有される（同じ t-of.github.io のため）。
// キーは必ず 'sort-visualizer.' で始める。
const STORE = 'sort-visualizer.';
const OLD_STORE = 'soroekko.'; // 旧名（id 変更前）。新しいキーがなければここから引き継ぐ。古いキーは消さない

function loadRaw(key) {
  try {
    const v = localStorage.getItem(STORE + key);
    if (v !== null) return v;
    const old = localStorage.getItem(OLD_STORE + key);
    if (old !== null) { try { localStorage.setItem(STORE + key, old); } catch { /* 保存できなくても遊べる */ } }
    return old;
  } catch { return null; }
}
function save(key, value) {
  try { localStorage.setItem(STORE + key, JSON.stringify(value)); } catch { /* 保存できなくても遊べる */ }
}

WebAppKit.init({ title: '可視化ソート', text: 'ばらばらの棒を、2 つのやり方で同時に並べ替えて競走させる。データの並び方を変えると勝ち負けが入れ替わり、比べた回数・動かした回数も数字で分かる。' });

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js');
}

// ---- ここからアプリ本体 ----

// ---- 音（Web Audio で作る。音声ファイルは使わない） ----
// iPhone のマナーモードでも鳴らす（Safari 16.4 以降）。
// 'playback' にすると音楽アプリの曲が止まるので、アプリの音がオンのときだけにする。
function setAudioSession(soundOn) {
  try { if (navigator.audioSession) navigator.audioSession.type = soundOn ? 'playback' : 'auto'; } catch { /* 対応していない */ }
}
const NOTE = (m) => 440 * 2 ** ((m - 69) / 12);
const Sound = {
  on: loadRaw('sound') !== '0',
  ctx: null,
  lastTick: 0,
  side: 0,
  // 最初の音はユーザーが触ったときに（ブラウザは触る前の音を止める）
  unlock() {
    if (!this.on) return;
    if (!this.ctx || this.ctx.state !== 'running') setAudioSession(true);
    if (!this.ctx) {
      try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { return; }
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.6;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  },
  tone(freq, { at = 0, dur = 0.12, type = 'sine', gain = 0.06, to } = {}) {
    if (!this.on || !this.ctx || this.ctx.state !== 'running') return;
    const t = this.ctx.currentTime + at, o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.03);
  },
  tap() { this.tone(1100, { dur: 0.04, type: 'triangle', gain: 0.04 }); },
  play() { this.tone(660, { dur: 0.09, gain: 0.06, to: 990 }); },
  pause() { this.tone(660, { dur: 0.09, gain: 0.05, to: 440 }); },
  reset() { this.tone(520, { dur: 0.06, type: 'triangle', gain: 0.05 }); this.tone(390, { at: 0.06, dur: 0.08, type: 'triangle', gain: 0.05 }); },
  // 新しいデータ: ばらばらの高さを短く 5 つ
  shuffle() { [0.7, 0.2, 0.9, 0.4, 0.6].forEach((h, i) => this.tone(NOTE(62 + h * 24), { at: i * 0.028, dur: 0.05, type: 'triangle', gain: 0.035 })); },
  // 1 手: 棒の高さで音の高さを変える。比べるは軽く、動かすは少しはっきり。
  // 速いときは間を空けて重ねない（ponytail: 間引くだけ。音を束ねたくなったら 1 本の発振器で周波数を動かす）
  step(lane, k, force = false) {
    const e = lane.last;
    if (!e) return;
    const now = performance.now();
    if (!force && now - this.lastTick < 60) return;
    this.lastTick = now;
    const h = lane.a[e.i] / maxValue(state.shape, lane.a.length);
    const f = NOTE(55 + h * 36 + (k ? 0 : 0.2));
    if (e.t === 'compare') this.tone(f, { dur: 0.035, gain: 0.025 });
    else this.tone(f, { dur: 0.06, type: 'triangle', gain: 0.04 });
  },
  // 片方がそろった
  goal(k) { const b = k ? 67 : 72; [b, b + 7].forEach((m, i) => this.tone(NOTE(m), { at: i * 0.07, dur: 0.22, gain: 0.06 })); },
  // 両方そろった: 勝ちは上がる 3 音、引き分けは同じ高さ 2 つ
  finish(winner) {
    const notes = winner < 0 ? [67, 67] : [72, 76, 79, 84];
    notes.forEach((m, i) => this.tone(NOTE(m), { at: 0.18 + i * 0.09, dur: 0.35, type: 'triangle', gain: 0.07 }));
  },
};
setAudioSession(Sound.on);

const $ = (id) => document.getElementById(id);
const fmt = (n) => n.toLocaleString('en-US');

// 色（style.css の :root と同じ値）
const INK = '#1e2430';        // ふつう
const CMP = '#e08a1e';        // 比べている（棒の下に印も付ける）
const MOVE = '#1f9bd6';       // 動いた
const FOCUS = '#d6336c';      // 注目
const FIXED = '#9aa6b8';      // 確定
const LANE_TINT = ['rgba(31, 138, 112, 0.12)', 'rgba(108, 75, 209, 0.12)'];   // 範囲の帯（レーンの色を薄く）

const state = readState(loadRaw('state'));
const store = () => save('state', state);
const q = readQuery(location.search);   // URL の組み合わせと種は、保存した設定より優先
for (const k of ['a', 'b', 'shape', 'size']) if (k in q) state[k] = q[k];
let seed = 'seed' in q ? q.seed : newSeed();
let data = [];
let lanes = [];
let playing = false;
let acc = 0;
let lastT = 0;

const views = ['laneA', 'laneB'].map((id) => {
  const el = $(id);
  const canvas = el.querySelector('canvas');
  return {
    el, canvas, ctx: canvas.getContext('2d'),
    algoBtn: el.querySelector('.lane__algo'),
    name: el.querySelector('.lane__name'),
    steps: el.querySelector('.lane__steps'),
    sub: el.querySelector('.lane__sub'),
  };
});
const algoOf = (k) => (k ? state.b : state.a);
const bothDone = () => lanes[0].done && lanes[1].done;

// ---- 描く ----
function drawLane(k) {
  const lane = lanes[k], { canvas, ctx } = views[k];
  const W = canvas.width, H = canvas.height;
  if (!W || !H) return;
  const dpr = W / canvas.clientWidth;
  const n = lane.a.length, max = maxValue(state.shape, n);
  const mark = Math.round(9 * dpr);        // 下の「比べている」の印の場所
  const base = H - mark, top = Math.round(4 * dpr);
  const bw = W / n;
  const gapPx = bw >= 3 * dpr ? Math.max(1, Math.round(dpr)) : 0;   // すき間が 1px 取れないときは付けない
  const xAt = (i) => Math.round(i * bw);
  ctx.clearRect(0, 0, W, H);

  if (lane.range) {
    const [l, r] = lane.range;
    ctx.fillStyle = LANE_TINT[k];
    ctx.fillRect(xAt(l), 0, xAt(r + 1) - xAt(l), base);
  }
  const e = lane.last;
  const cmp = e && e.t === 'compare' ? [e.i, e.j] : [];
  const moved = e && e.t === 'swap' ? [e.i, e.j] : e && e.t === 'write' ? [e.i] : [];
  for (let i = 0; i < n; i++) {
    // 注目はいつもピンク（クイックの基準・選択の今の最小は毎手比べられるので、比べているより先に決める。比べているのは下の三角で分かる）
    ctx.fillStyle = i === lane.focus ? FOCUS : cmp.includes(i) ? CMP : moved.includes(i) ? MOVE : lane.fixed[i] ? FIXED : INK;
    const h = Math.max(1, Math.round((lane.a[i] / max) * (base - top)));
    const x = xAt(i);
    ctx.fillRect(x, base - h, Math.max(1, xAt(i + 1) - x - gapPx), h);
  }
  // 比べている棒の下に小さな三角（色だけに頼らない）
  ctx.fillStyle = CMP;
  for (const i of cmp) {
    const cx = (xAt(i) + xAt(i + 1) - gapPx) / 2, w = Math.max(4 * dpr, Math.min(bw, 10 * dpr)) / 2;
    ctx.beginPath();
    ctx.moveTo(cx, base + 2 * dpr);
    ctx.lineTo(cx + w, H);
    ctx.lineTo(cx - w, H);
    ctx.fill();
  }
}

function render() {
  for (let k = 0; k < 2; k++) {
    const lane = lanes[k], v = views[k];
    v.steps.textContent = lane.done ? `ゴール ${fmt(total(lane))} 手` : `${fmt(total(lane))} 手`;
    v.el.classList.toggle('is-done', lane.done);
    v.sub.textContent = `比べた ${fmt(lane.compares)} / 動かした ${fmt(lane.moves)}${lane.gap ? ` · 間 ${lane.gap}` : ''}`;
    drawLane(k);
  }
}

function fitCanvas(v) {
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  const w = Math.round(v.canvas.clientWidth * dpr), h = Math.round(v.canvas.clientHeight * dpr);
  if (v.canvas.width !== w || v.canvas.height !== h) { v.canvas.width = w; v.canvas.height = h; }
}
const ro = new ResizeObserver(() => { views.forEach(fitCanvas); if (lanes.length) render(); });
views.forEach((v) => ro.observe(v.canvas));

// ---- 進める ----
function setPlaying(on) {
  playing = on;
  $('play').classList.toggle('is-playing', on);
  $('play').setAttribute('aria-label', on ? '停止' : '再生');
  if (on) { acc = 1; lastT = performance.now(); requestAnimationFrame(frame); }   // 押したらすぐ 1 手目
}

function frame(t) {
  if (!playing) return;
  const dt = Math.min(0.1, Math.max(0, (t - lastT) / 1000));   // 裏に回って戻っても一気に進めない
  lastT = t;
  acc += SPEEDS[state.speed].rate * dt;
  let k = Math.floor(acc);
  acc -= k;
  // 1 回の更新で両方に同じ数ずつ手を進める（そろったレーンは止まる）
  const was = [lanes[0].done, lanes[1].done];
  const stepped = k > 0 && !bothDone();
  while (k-- > 0 && !bothDone()) { step(lanes[0]); step(lanes[1]); }
  if (stepped) sounds(was);
  render();
  if (bothDone()) finish();
  else requestAnimationFrame(frame);
}

// 1 手の音と、そろったレーンの音
function sounds(was, force = false) {
  const goal = [0, 1].filter((k) => !was[k] && lanes[k].done);
  if (goal.length === 1 && !bothDone()) { Sound.goal(goal[0]); return; }
  if (goal.length) return;   // 両方そろったら finish() の音だけ
  const k = lanes[0].done ? 1 : lanes[1].done ? 0 : (Sound.side ^= 1);   // 両方動いているときは交互に
  Sound.step(lanes[k], k, force);
}

function finish() {
  setPlaying(false);
  const [A, B] = lanes, v = verdict(A, B);
  const res = $('result');
  if (v.winner < 0) {
    $('resultHead').textContent = '引き分け';
    $('resultSub').textContent = `（${fmt(v.ta)} 手）`;
    res.style.removeProperty('--lane');
  } else {
    const [w, l] = v.winner ? [v.tb, v.ta] : [v.ta, v.tb];
    $('resultHead').textContent = `${algo(algoOf(v.winner)).name}の勝ち`;
    $('resultSub').textContent = `${fmt(w)} 手 対 ${fmt(l)} 手（${v.ratio.toFixed(1)} 倍）`;
    res.style.setProperty('--lane', v.winner ? 'var(--lane-b)' : 'var(--lane-a)');
  }
  Sound.finish(v.winner);
  res.hidden = false;
}

// 同じデータで 0 手に戻す（止める・結果の帯を消す）
function reset() {
  setPlaying(false);
  $('result').hidden = true;
  lanes = [newLane(state.a, data), newLane(state.b, data)];
  views.forEach((v, k) => { v.name.textContent = algo(algoOf(k)).name; });
  render();
}
function newData() {
  data = makeData(state.shape, state.size, seed);
  reset();
}

function togglePlay() {
  if (playing) { setPlaying(false); return; }
  if (bothDone()) reset();      // そろったあとの ▶ は同じデータで始め直す
  $('result').hidden = true;
  setPlaying(true);
}
function stepOnce() {
  setPlaying(false);
  if (bothDone()) return;
  const was = [lanes[0].done, lanes[1].done];
  step(lanes[0]); step(lanes[1]);
  sounds(was, true);
  render();
  if (bothDone()) finish();
}

function togglePlayWithSound() {
  togglePlay();
  if (playing) Sound.play(); else Sound.pause();
}
$('play').addEventListener('click', togglePlayWithSound);
$('stepBtn').addEventListener('click', stepOnce);
$('resetBtn').addEventListener('click', () => { reset(); Sound.reset(); });
$('newBtn').addEventListener('click', () => { seed = newSeed(); newData(); Sound.shuffle(); });
$('resultShare').addEventListener('click', () => {
  WebAppKit.share({ text: shareText(state, lanes[0], lanes[1]), url: location.origin + location.pathname + queryOf(state, seed) });
});

// ---- 設定（切り替えボタンの列） ----
function segment(el, items, get, set) {
  const btns = items.map((it) => {
    const b = document.createElement('button');
    b.className = 'seg__btn';
    b.textContent = it.label;
    b.addEventListener('click', () => { if (get() !== it.value) { set(it.value); store(); mark(); Sound.tap(); } });
    el.append(b);
    return b;
  });
  const mark = () => btns.forEach((b, i) => b.setAttribute('aria-pressed', String(items[i].value === get())));
  mark();
}
segment($('shapeSeg'), SHAPES.map((s) => ({ label: s.name, value: s.id })), () => state.shape,
  (v) => { state.shape = v; seed = newSeed(); newData(); });
segment($('sizeSeg'), SIZES.map((n) => ({ label: `${n} 本`, value: n })), () => state.size,
  (v) => { state.size = v; seed = newSeed(); newData(); });
segment($('speedSeg'), SPEEDS.map((s, i) => ({ label: s.name, value: i })), () => state.speed,
  (v) => { state.speed = v; });   // 速さは動いたまま変えられる

// ---- 下から出る板・遊び方 ----
let opener = null;
function openSheet(el, focusEl) {
  opener = document.activeElement;
  el.hidden = false;
  (focusEl || el.querySelector('button')).focus({ preventScroll: true });
}
function closeSheet(el) {
  el.hidden = true;
  if (opener && opener.focus) opener.focus({ preventScroll: true });
  opener = null;
}

const picker = $('picker');
function openPicker(k) {
  $('pickerTitle').textContent = k ? '下のやり方' : '上のやり方';
  picker.querySelector('.sheet__panel').style.setProperty('--lane', k ? 'var(--lane-b)' : 'var(--lane-a)');
  const list = $('picks');
  list.replaceChildren(...ALGOS.map((g) => {
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.className = 'pick';
    if (g.id === algoOf(k)) b.setAttribute('aria-current', 'true');
    b.innerHTML = '<span class="pick__name"></span><span class="pick__desc"></span>';
    b.firstChild.textContent = g.name;
    b.lastChild.textContent = g.desc;
    b.addEventListener('click', () => {
      if (g.id !== algoOf(k)) { state[k ? 'b' : 'a'] = g.id; store(); reset(); }
      Sound.tap();
      closeSheet(picker);
    });
    li.append(b);
    return li;
  }));
  openSheet(picker, list.querySelector('[aria-current]'));
}
views.forEach((v, k) => v.algoBtn.addEventListener('click', () => { openPicker(k); Sound.tap(); }));
$('pickerClose').addEventListener('click', () => closeSheet(picker));
picker.addEventListener('click', (e) => { if (e.target === picker) closeSheet(picker); });   // 外をタップ

const help = $('help');
$('helpBtn').addEventListener('click', () => { openSheet(help, $('helpClose')); Sound.tap(); });

// 音のオン・オフ（'sort-visualizer.sound' に '1' / '0' で覚える）
const soundBtn = $('soundBtn');
const syncSound = () => {
  soundBtn.setAttribute('aria-pressed', String(Sound.on));
  soundBtn.setAttribute('aria-label', Sound.on ? '音: オン' : '音: オフ');
};
soundBtn.addEventListener('click', () => {
  Sound.on = !Sound.on;
  try { localStorage.setItem(STORE + 'sound', Sound.on ? '1' : '0'); } catch { /* 保存できなくても遊べる */ }
  setAudioSession(Sound.on);
  syncSound();
  if (Sound.on) { Sound.unlock(); Sound.tap(); }
});
syncSound();
$('helpClose').addEventListener('click', () => {
  if (!state.seenHelp) { state.seenHelp = true; store(); }
  closeSheet(help);
});
help.addEventListener('click', (e) => { if (e.target === help) $('helpClose').click(); });

// ---- PC のキー: Space で再生・停止、→ で 1 手 ----
// Tab でボタンに合わせているときは、Space はそのボタンを押す（ふつうの動き）。
// マウスやタッチで押したあとのボタンに残ったフォーカスでは、Space を再生・停止に使う（押したボタンをもう一度押さない）。
// :focus-visible はキーを押した時点で付いてしまうので使えない。最後に Tab とポインタのどちらを使ったかで決める
let tabbing = false;
document.addEventListener('pointerdown', () => { tabbing = false; Sound.unlock(); }, true);
const keyOwnedByFocus = (e) => tabbing && e.target instanceof Element && !!e.target.closest('button, a');
const sheetOpen = () => !picker.hidden || !help.hidden;
document.addEventListener('keydown', (e) => {
  if (e.key === 'Tab') tabbing = true;
  Sound.unlock();
  if (e.key === 'Escape') {
    if (!picker.hidden) closeSheet(picker);
    else if (!help.hidden) $('helpClose').click();
    return;
  }
  if (sheetOpen() || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.code === 'Space') {
    if (keyOwnedByFocus(e)) return;
    e.preventDefault();
    // 離したときにそのボタンが押されないよう、残ったフォーカスを外す
    if (document.activeElement instanceof HTMLElement && document.activeElement !== document.body) document.activeElement.blur();
    if (!e.repeat) togglePlayWithSound();
  } else if (e.key === 'ArrowRight') {
    e.preventDefault();
    stepOnce();
  }
});

// ---- はじめ ----
views.forEach(fitCanvas);
newData();
if (!state.seenHelp) openSheet(help, $('helpClose'));
