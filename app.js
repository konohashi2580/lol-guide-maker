'use strict';
/* LoL 解説画像メーカー
 * 描画仕様は Python テンプレート build_guide.pyの座標・色・フォントサイズを Canvas に転写したもの。
 * データは Data Dragon (ja_JP) から実行時取得する。サーバー不要の静的アプリ。
 */

// ---------- 定数 ----------
const DD = 'https://ddragon.leagueoflegends.com/cdn';
const W = 1200;
const BASE_H = 1880, ITEM_ROW_H = 142, ITEM_ROWS_MAX = 3, ITEMS_PER_ROW = 6;
let H = BASE_H - (4 - ITEM_ROWS_MAX) * ITEM_ROW_H; // アイテム3行なら 1738
const SIDEBAR = 360;
const RX = SIDEBAR + 28, RW = W - RX - 24, CX = RX + RW / 2;
const FONT_STACK = '"Hiragino Kaku Gothic ProN","Hiragino Sans","Noto Sans CJK JP","Yu Gothic UI","Yu Gothic",sans-serif';
const font = (size, bold = true) => `${bold ? 700 : 400} ${size}px ${FONT_STACK}`;
const COL = {
  gold: 'rgb(205,172,106)', dark: 'rgb(17,19,24)', panel: 'rgb(25,28,36)',
  line: 'rgb(58,63,74)', white: 'rgb(242,244,247)', grey: 'rgb(165,173,186)',
  lgrey: 'rgb(215,219,225)', pink: 'rgb(255,120,130)', star: 'rgb(255,195,60)',
  nameEn: 'rgb(255,232,195)', sidebar: 'rgb(22,16,20)', green: 'rgb(90,220,130)',
};
const TAG_JA = { Assassin: 'アサシン', Fighter: 'ファイター', Mage: 'メイジ', Marksman: 'マークスマン', Support: 'サポート', Tank: 'タンク' };
const LS_KEY = 'lolGuideMaker.v1';

// ---------- 状態 ----------
const DEFAULTS = {
  championId: 'Rell',
  title: '欺きの鎧身', // サンプル用にユーザー考案の肩書きを明示（公式は「鋼鉄の乙女」）
  patch: '26.22',
  role: 'TOP ・ タンク',
  catchphrase: '圧倒的なファイト影響力',
  difficulty: 6, // Data Dragon 側のレル難易度は 0 のため、サンプルでは 6 を保持
  summoners: ['SummonerFlash', 'SummonerTeleport'],
  maxOrder: ['R', 'Q', 'W', 'E'],
  acquire: ['W', 'Q', 'E'],
  passiveDesc: '敵にダメージで防御を吸収！',
  runeMain: 8400,
  runeMainPicks: [8437, 8401, 8473, 8451],
  runeSub: 8200,
  runeSubPicks: [8226, 8237],
  runeLabels: { 8401: 'シールド／バッシュ', 8473: 'ボーン／アーマー', 8226: 'マナフロー／バンド' },
  itemsHeadingSub: '',
  itemRows: [
    { title: 'スタート', items: ['ドラン シールド', '体力ポーション', '', '', '', ''] },
    { title: 'ブーツ', items: ['アイオニア ブーツ', 'マーキュリー ブーツ', 'プレート スチールキャップ', '', '', ''] },
    { title: 'コア', items: ['ホロウ レディアンス', '終わりなき絶望', 'ジーク コンバージェンス', '', '', ''] },
  ],
  strengths: ['Qのポークで一方的に削れる！', 'Wはショートトレード最強！', 'Rで敵を逃がさない！'],
  weaknesses: ['サステインが高い相手に弱い…', 'タンクビルドはスケールが悪め'],
  combos: [
    { keys: 'W-E-Q-AA', note: 'Wが当たれば確定するコンボ！' },
    { keys: 'Q-R-W-E', note: 'ひとりでできるCCチェイン！' },
  ],
  tips: ['序盤はレンジ差を活かして殴り勝て！', '中盤はバミシンダーを使って一気にプッシュ！', '敵からのタワーダイブは逆転のチャンス！'],
  motto: ['序盤の一方的なトレード力で', '対面の慢心を全て拾いきれ！'],
  accent: '#ffaa00',
  splashX: 0.4966, // Python版の切り出し [430,0,780,717]（中心 x=605）と中心が一致する値
};
let state = JSON.parse(JSON.stringify(DEFAULTS));

// ---------- Data Dragon ----------
const dd = {
  version: '',
  champions: new Map(),   // id -> champion.json の各エントリ
  detail: null,           // 現在のチャンピオン詳細
  detailId: '',
  styles: [],             // runesReforged
  itemsByName: new Map(), // 日本語名 -> item エントリ
  itemsByNorm: new Map(), // 空白除去した日本語名 -> item エントリ（表記ゆれ吸収用）
  itemList: [],           // {name, item}
  summoners: new Map(),   // key -> summoner エントリ
};
const detailCache = new Map();

async function fetchJSON(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(url + ' -> ' + r.status);
  return r.json();
}
async function loadDD() {
  const versions = await fetchJSON('https://ddragon.leagueoflegends.com/api/versions.json');
  dd.version = versions[0];
  const v = dd.version, loc = 'ja_JP';
  const [champ, runes, items, summoner] = await Promise.all([
    fetchJSON(`${DD}/${v}/data/${loc}/champion.json`),
    fetchJSON(`${DD}/${v}/data/${loc}/runesReforged.json`),
    fetchJSON(`${DD}/${v}/data/${loc}/item.json`),
    fetchJSON(`${DD}/${v}/data/${loc}/summoner.json`),
  ]);
  for (const [id, c] of Object.entries(champ.data)) dd.champions.set(id, c);
  dd.styles = runes;
  for (const [key, s] of Object.entries(summoner.data)) dd.summoners.set(key, s);
  for (const it of Object.values(items.data)) {
    if (!it || !it.name || !it.gold || !it.gold.purchasable) continue;
    if (it.maps && it.maps['11'] === false) continue;
    if (it.requiredAlly || it.requiredChampion) continue;
    if (!dd.itemsByName.has(it.name)) {
      dd.itemsByName.set(it.name, it);
      const nk = normName(it.name);
      if (!dd.itemsByNorm.has(nk)) dd.itemsByNorm.set(nk, it);
      dd.itemList.push({ name: it.name, item: it });
    }
  }
  dd.itemList.sort((a, b) => a.name.localeCompare(b.name, 'ja'));
}
async function loadDetail(id) {
  if (detailCache.has(id)) return detailCache.get(id);
  const j = await fetchJSON(`${DD}/${dd.version}/data/ja_JP/champion/${id}.json`);
  detailCache.set(id, j.data[id]);
  return j.data[id];
}

// ---------- 画像キャッシュ（CORS許可で読み込み、Canvas汚染を防ぐ） ----------
const imgCache = new Map();
function getImg(url) {
  if (!url) return null;
  if (!imgCache.has(url)) {
    const im = new Image();
    im.crossOrigin = 'anonymous';
    im.onload = () => draw();
    im.onerror = () => draw();
    im.src = url;
    imgCache.set(url, im);
  }
  const im = imgCache.get(url);
  return (im.complete && im.naturalWidth > 0) ? im : null;
}
const splashURL = id => `${DD}/img/champion/splash/${id}_0.jpg`;
const passiveURL = f => `${DD}/${dd.version}/img/passive/${f}`;
const spellURL = f => `${DD}/${dd.version}/img/spell/${f}`;
const itemURL = it => `${DD}/${dd.version}/img/item/${it.image.full}`;
const runeURL = r => `${DD}/img/${r.icon}`;

// アイテム名の表記ゆれ（空白の有無）を吸収するための正規化
function normName(s) { return String(s || '').replace(/[\s　]/g, '').toLowerCase(); }
function findItemByName(name) {
  const t = String(name || '').trim();
  if (!t) return null;
  return dd.itemsByName.get(t) || dd.itemsByNorm.get(normName(t)) || null;
}

// ---------- 名前の2行分割（Python版 data の lines を近似） ----------
function splitName(name, kind, maxW, size) {
  if (!name) return [''];
  const text = String(name).replace(/　/g, ' ').trim();
  // ユーザーが「／」で指定した改行位置が最優先
  if (text.includes('／')) return text.split('／').map(s => s.trim()).filter(s => s.length);
  // 1行で収まるなら分割しない（単語の途中で割れるのを防ぐ）
  if (maxW && size) {
    ctx.font = font(size);
    if (ctx.measureText(text).width <= maxW) return [text];
  }
  const max = kind === 'rune' ? 8 : kind === 'item' ? 12 : 8; // rune は8文字、item は12文字まで1行（skill は8文字）
  const chars = [...text];
  if (chars.length <= max) return [text];
  const mid = chars.length / 2;
  let cut = -1, bestDist = Infinity;
  for (let i = 1; i < chars.length; i++) {
    let c = -1;
    if (chars[i] === ' ' || chars[i] === '・' || chars[i] === '：' || chars[i] === ':') c = i;
    else if (chars[i - 1] === 'ー' || chars[i - 1] === 'ン') c = i; // 長音・撥音の後で切る（モーラ境界）
    if (c > 0 && Math.abs(c - mid) < bestDist) { bestDist = Math.abs(c - mid); cut = c; }
  }
  if (cut < 0) cut = Math.round(chars.length / 2);
  const a = chars.slice(0, cut).join('').replace(/[\s・：:]+$/, '');
  const b = chars.slice(cut).join('').replace(/^[\s・：:]+/, '');
  return [a, b].filter(s => s.length);
}

// ---------- 描画（build_guide.py の転写） ----------
const canvas = document.getElementById('cv');
const ctx = canvas.getContext('2d');
const ACC = () => state.accent;

function txt(s, x, y, size, color, bold = true) {
  ctx.font = font(size, bold);
  ctx.fillStyle = color;
  ctx.fillText(s, x, y);
}
function labelCenter(cx, y, text, size = 20, color = COL.lgrey, bold = true) {
  ctx.font = font(size, bold);
  const tw = ctx.measureText(text).width;
  ctx.fillStyle = color;
  ctx.fillText(text, cx - tw / 2, y);
}
function wrappedCenter(cx, y, lines, size = 19) {
  lines.forEach((ln, i) => labelCenter(cx, y + i * (size + 4), ln, size, COL.white, true));
}
function hline(x0, y0, x1, y1, color, wdt) {
  ctx.strokeStyle = color; ctx.lineWidth = wdt;
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
}
function iconBox(x, y, url, size, border = COL.gold) {
  ctx.fillStyle = '#000';
  ctx.fillRect(x - 2, y - 2, size + 4, size + 4);
  ctx.strokeStyle = border; ctx.lineWidth = 2;
  ctx.strokeRect(x - 2, y - 2, size + 4, size + 4);
  const im = getImg(url);
  if (im) ctx.drawImage(im, x, y, size, size);
}
function heading(y, ja, en = '') {
  ctx.fillStyle = ACC();
  ctx.beginPath();
  ctx.moveTo(RX, y + 5); ctx.lineTo(RX + 18, y + 5); ctx.lineTo(RX + 9, y + 32); ctx.lineTo(RX - 9, y + 32);
  ctx.closePath(); ctx.fill();
  ctx.font = font(38, true);
  const wja = ctx.measureText(ja).width;
  ctx.fillStyle = COL.white;
  ctx.fillText(ja, RX + 28, y);
  if (en) txt(en, RX + 40 + wja, y + 10, 19, COL.grey);
  hline(RX, y + 52, RX + RW, y + 52, COL.line, 2);
  return y + 68;
}
function roundRectPath(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function spellByKey(det) {
  const keys = ['Q', 'W', 'E', 'R'], map = {};
  det.spells.forEach((s, i) => { map[keys[i]] = s; });
  return map;
}
function styleById(id) { return dd.styles.find(s => s.id === id) || dd.styles[0]; }
function runeById(style, id) {
  for (const slot of style.slots) for (const r of slot.runes) if (r.id === id) return r;
  return null;
}

function draw() {
  if (!canvas) return;
  // キャンバス高さはアイテム行数に応じて詰める（4行=1880、3行=1738）
  const targetH = BASE_H - (4 - state.itemRows.length) * ITEM_ROW_H;
  if (canvas.height !== targetH) canvas.height = targetH;
  H = targetH;
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  const champ = dd.champions.get(state.championId);
  const det = (dd.detailId === state.championId) ? dd.detail : null;

  // 背景
  ctx.fillStyle = COL.dark; ctx.fillRect(0, 0, W, H);

  // ---------- 左サイドバー ----------
  ctx.fillStyle = COL.sidebar; ctx.fillRect(0, 0, SIDEBAR, H);
  const simg = getImg(splashURL(state.championId));
  if (simg) {
    const iw = simg.naturalWidth, ih = simg.naturalHeight, boxA = SIDEBAR / 542;
    let sw, sh, sx, sy;
    if (iw / ih > boxA) { sh = ih; sw = ih * boxA; sx = state.splashX * (iw - sw); sy = 0; }
    else { sw = iw; sh = iw / boxA; sx = 0; sy = (ih - sh) / 2; }
    ctx.drawImage(simg, sx, sy, sw, sh, 0, 0, SIDEBAR, 542);
  }
  for (let i = 0; i < 46; i++) {
    ctx.fillStyle = `rgba(22,16,20,${(i / 46).toFixed(3)})`;
    ctx.fillRect(0, 500 + i, SIDEBAR, 1);
  }
  ctx.fillStyle = ACC(); ctx.fillRect(SIDEBAR - 4, 0, 4, H);
  txt(`パッチ ${state.patch}`, 24, 18, 24, COL.white);
  txt(state.championId.toUpperCase(), 24, 562, 48, COL.nameEn);
  txt(`${champ ? champ.name : state.championId} ・ ${state.title || (champ ? champ.title : '')}`, 24, 620, 26, COL.white);
  txt(state.catchphrase, 24, 656, 25, COL.pink);
  hline(24, 696, 330, 696, ACC(), 3);
  txt('ロール', 24, 714, 20, COL.gold);
  txt(state.role, 24, 742, 32, COL.white);
  const stars = Math.max(0, Math.min(5, Math.round(state.difficulty / 2)));
  txt('難易度', 24, 790, 20, COL.gold);
  txt('★'.repeat(stars) + '☆'.repeat(5 - stars), 24, 816, 40, COL.star);
  txt(`難易度 ${state.difficulty} / 10`, 24, 864, 19, COL.lgrey, false);
  txt('強み', 24, 916, 20, COL.gold);
  state.strengths.forEach((t, i) => txt(t, 24, 948 + i * 34, 21, COL.lgrey));
  txt('弱み', 24, 1066, 20, COL.gold);
  state.weaknesses.forEach((t, i) => txt(t, 24, 1098 + i * 34, 21, COL.lgrey, false));
  txt('基本コンボ', 24, 1206, 20, COL.gold);
  let cy = 1238;
  for (const c of state.combos) {
    txt(c.keys, 24, cy, 26, COL.white);
    txt(c.note, 24, cy + 36, 19, COL.lgrey, false);
    cy += 84;
  }
  txt('合言葉', 24, 1424, 20, COL.gold);
  state.motto.forEach((t, i) => txt(t, 24, 1456 + i * 34, 21, COL.lgrey, false));

  // ---------- 1 サモナースペル ----------
  let y = heading(20, 'サモナースペル', 'SUMMONER SPELLS');
  state.summoners.forEach((key, i) => {
    const s = dd.summoners.get(key);
    const cx = i === 0 ? CX - 132 : CX + 132;
    iconBox(cx - 62, y, s ? spellURL(s.image.full) : null, 124);
    labelCenter(cx, y + 132, s ? s.name : '', 27, COL.white);
  });
  txt('＋', CX - 14, y + 38, 40, COL.white);
  y += 196;

  // ---------- 2 スキルオーダー ----------
  y = heading(y + 6, 'スキルオーダー');
  txt('MAX順', RX, y + 18, 23, COL.gold);
  if (det) {
    const byKey = spellByKey(det);
    const ox = RX + 104;
    state.maxOrder.forEach((k, i) => {
      const sp = byKey[k], cx = ox + 46 + i * 172;
      iconBox(cx - 46, y, sp ? spellURL(sp.image.full) : null, 92);
      ctx.fillStyle = ACC();
      ctx.beginPath(); ctx.arc(cx + 43, y + 75, 17, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = COL.white; ctx.lineWidth = 2; ctx.stroke();
      labelCenter(cx + 43, y + 63, k, 21, COL.white);
      if (sp) wrappedCenter(cx, y + 100, splitName(sp.name, 'skill', 160, 20), 20);
      if (i < 3) txt('＞', cx + 72, y + 26, 34, COL.gold);
    });
  }
  y += 140;
  txt(`取得： Lv1 ${state.acquire[0]} → Lv2 ${state.acquire[1]} → Lv3 ${state.acquire[2]}`, RX, y, 22, COL.white);
  y += 40;
  roundRectPath(RX, y, RW, 72, 10);
  ctx.fillStyle = COL.panel; ctx.fill();
  ctx.strokeStyle = COL.line; ctx.lineWidth = 1; ctx.stroke();
  if (det) iconBox(RX + 12, y + 10, passiveURL(det.passive.image.full), 52, COL.grey);
  txt(`パッシブ：${det ? det.passive.name : ''}`, RX + 78, y + 8, 24, COL.white);
  txt(state.passiveDesc, RX + 78, y + 38, 20, COL.pink);
  y += 92;

  // ---------- 3 ルーン ----------
  y = heading(y + 6, 'ルーン');
  const mainStyle = styleById(state.runeMain), subStyle = styleById(state.runeSub);
  const pad = '　'.repeat(Math.max(1, 9 - (mainStyle ? mainStyle.name.length : 2)));
  txt(`メイン：${mainStyle ? mainStyle.name : ''}${pad}サブ：${subStyle ? subStyle.name : ''}`, RX, y - 4, 20, COL.gold);
  y += 28;
  if (mainStyle && subStyle) {
    const picks = [
      ...state.runeMainPicks.map(id => ({ r: runeById(mainStyle, id), size: 0 })),
      ...state.runeSubPicks.map(id => ({ r: runeById(subStyle, id), size: 76 })),
    ];
    picks.forEach((p, i) => { p.size = i === 0 ? 96 : 76; });
    // ラベル（最大幅120px）が隣と重ならないよう、アイコン中心を等間隔に配置する
    const step = 132;
    const cx0 = RX + 2 + 48; // 先頭アイコン（96px）の左端は従来どおり RX+2
    const centers = [];
    picks.forEach((p, i) => {
      const cx = cx0 + i * step;
      if (p.r) iconBox(cx - p.size / 2, y + (96 - p.size) / 2, runeURL(p.r), p.size, i === 0 ? ACC() : COL.gold);
      centers.push({ cx, lines: p.r ? splitName((state.runeLabels && state.runeLabels[p.r.id]) || p.r.name, 'rune', 120, 15) : [''] });
      if (i === 3) { const dx = cx0 + 3.5 * step; hline(dx, y, dx, y + 96, COL.line, 2); }
    });
    centers.forEach(c => wrappedCenter(c.cx, y + 104, c.lines, 15));
  }
  y += 168;

  // ---------- 4 アイテム ----------
  y = heading(y + 6, 'アイテムビルド', state.itemsHeadingSub);
  for (const row of state.itemRows) {
    txt(row.title, RX, y + 26, 25, COL.gold);
    const items = row.items.map(n => dd.itemsByName.get(n)).filter(Boolean);
    const n = items.length;
    const x0 = RX + 116; // 504
    const spacing = n <= 1 ? 196 : Math.min(196, Math.floor((1176 - 84 - x0) / (n - 1)));
    let x = x0;
    items.forEach((it, j) => {
      iconBox(x, y, itemURL(it), 84);
      wrappedCenter(x + 42, y + 92, splitName(it.name, 'item', 192, 16), 16);
      if (j < n - 1) {
        const ax = x + 84 + Math.max(2, Math.floor((spacing - 84 - 30) / 2));
        txt('→', ax, y + 24, spacing >= 150 ? 30 : 22, COL.gold);
      }
      x += spacing;
    });
    y += 142;
  }

  // ---------- 5 Tips ----------
  y = heading(y + 8, '勝つための3カ条', 'TIPS');
  let ty = y + 4;
  for (const t of state.tips) {
    txt('✓', RX, ty, 26, COL.green);
    txt(t, RX + 36, ty + 2, 23, COL.lgrey);
    ty += 46;
  }

  // ---------- フッター ----------
  hline(RX, H - 46, W - 24, H - 46, COL.line, 1);
  txt(`アイコン・スプラッシュ：Riot Games 公式（Data Dragon ${dd.version || '-'}）／ パッチ${state.patch} ${state.role.split(' ・ ')[0]} 標準型`,
    RX, H - 38, 16, COL.grey, false);
}

// ---------- UI ----------
const $ = id => document.getElementById(id);
const statusEl = $('status');
function setStatus(msg, isError = false) {
  statusEl.textContent = msg;
  statusEl.classList.toggle('error', isError);
}
let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch (e) { /* 保存不可でも動作継続 */ } }, 250);
}
function changed() { save(); draw(); }
function restore() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return;
    const s = JSON.parse(raw);
    state = Object.assign(JSON.parse(JSON.stringify(DEFAULTS)), s);
    // title / runeLabels を持たない旧保存データでは、サンプル値を混ぜず自動（空）にする
    if (!Object.prototype.hasOwnProperty.call(s, 'title')) state.title = '';
    if (!Object.prototype.hasOwnProperty.call(s, 'runeLabels')) state.runeLabels = {};
  } catch (e) { /* 壊れた保存データは無視 */ }
}
// アイテム行を「3行×最大6個」に正規化する（旧データの4行目は切り捨て）
function normalizeItemRows() {
  const def = JSON.parse(JSON.stringify(DEFAULTS.itemRows));
  let rows = Array.isArray(state.itemRows) ? state.itemRows : [];
  rows = rows.slice(0, ITEM_ROWS_MAX).map((row, i) => {
    const items = (row && Array.isArray(row.items) ? row.items : []).slice(0, ITEMS_PER_ROW);
    while (items.length < ITEMS_PER_ROW) items.push('');
    return { title: row && row.title != null ? row.title : (def[i] ? def[i].title : ''), items };
  });
  while (rows.length < ITEM_ROWS_MAX) rows.push(def[rows.length]);
  state.itemRows = rows;
}
function mkSelect(options, value) {
  const sel = document.createElement('select');
  for (const o of options) {
    const op = document.createElement('option');
    op.value = o.value; op.textContent = o.label;
    sel.appendChild(op);
  }
  if (value !== undefined) sel.value = value;
  return sel;
}
function mkTextInput(value) {
  const inp = document.createElement('input');
  inp.type = 'text'; inp.value = value || '';
  inp.setAttribute('autocomplete', 'off');
  return inp;
}

// -- フォーム側アイコン表示の更新 --
const itemIconUpdaters = []; // DD読込後にアイテム欄アイコンを再評価するための関数群
function setImg(img, url) {
  if (!img) return;
  if (url) img.src = url;
  else img.removeAttribute('src');
}
function updateSummonerIcons() {
  [['summIcon1', 0], ['summIcon2', 1]].forEach(([id, i]) => {
    const s = dd.summoners.get(state.summoners[i]);
    setImg($(id), s ? spellURL(s.image.full) : null);
  });
}
function updateRuneStyleIcons() {
  const ms = styleById(state.runeMain), ss = styleById(state.runeSub);
  setImg($('runeMainIcon'), ms ? `${DD}/img/${ms.icon}` : null);
  setImg($('runeSubIcon'), ss ? `${DD}/img/${ss.icon}` : null);
}
function updateSkillIcons() {
  const det = (dd.detailId === state.championId) ? dd.detail : null;
  const byKey = det ? spellByKey(det) : null;
  document.querySelectorAll('#maxOrder .skillIcon').forEach(img => {
    const sp = byKey ? byKey[state.maxOrder[+img.dataset.idx]] : null;
    setImg(img, sp ? spellURL(sp.image.full) : null);
  });
  [['acqIcon1', 0], ['acqIcon2', 1], ['acqIcon3', 2]].forEach(([id, i]) => {
    const sp = byKey ? byKey[state.acquire[i]] : null;
    setImg($(id), sp ? spellURL(sp.image.full) : null);
  });
  setImg($('passiveIcon'), det && det.passive ? passiveURL(det.passive.image.full) : null);
}
// アイテム候補ドロップダウン（datalist の代替：アイコン付きでタップ／クリック確定）
function showItemCandidates(inp, drop, pick) {
  const q = normName(inp.value);
  drop.innerHTML = '';
  if (!q || !dd.itemList.length) { drop.hidden = true; return; }
  const matches = dd.itemList.filter(({ name }) => normName(name).includes(q)).slice(0, 12);
  if (!matches.length) { drop.hidden = true; return; }
  for (const { name, item } of matches) {
    const cand = document.createElement('div');
    cand.className = 'itemCandidate';
    const im = document.createElement('img');
    im.src = itemURL(item); im.alt = '';
    const sp = document.createElement('span');
    sp.textContent = name;
    cand.appendChild(im); cand.appendChild(sp);
    cand.addEventListener('pointerdown', e => { e.preventDefault(); pick(name); });
    drop.appendChild(cand);
  }
  drop.hidden = false;
}

// -- 静的コントロール（DD不要なもの）を先に組み立てる --
function buildStaticControls() {
  // MAX順セレクト×4
  const mo = $('maxOrder');
  ['優先1', '優先2', '優先3', '優先4'].forEach((lb, i) => {
    const wrap = document.createElement('label');
    wrap.textContent = lb;
    const row = document.createElement('span');
    row.className = 'selWithIcon';
    const sel = mkSelect(['Q', 'W', 'E', 'R'].map(k => ({ value: k, label: k })), state.maxOrder[i]);
    sel.dataset.idx = i;
    sel.addEventListener('change', () => {
      const idx = +sel.dataset.idx, v = sel.value;
      const dup = state.maxOrder.findIndex((k, j) => j !== idx && k === v);
      if (dup >= 0) { state.maxOrder[dup] = state.maxOrder[idx]; mo.querySelectorAll('select')[dup].value = state.maxOrder[dup]; }
      state.maxOrder[idx] = v;
      updateSkillIcons();
      changed();
    });
    const icon = document.createElement('img');
    icon.className = 'inlineIcon skillIcon';
    icon.alt = '';
    icon.dataset.idx = i;
    row.appendChild(sel); row.appendChild(icon);
    wrap.appendChild(row); mo.appendChild(wrap);
  });
  // 取得順セレクト×3
  [['acq1', 0], ['acq2', 1], ['acq3', 2]].forEach(([id, i]) => {
    const sel = $(id);
    sel.innerHTML = '';
    ['Q', 'W', 'E'].forEach(k => { const op = document.createElement('option'); op.value = k; op.textContent = k; sel.appendChild(op); });
    sel.value = state.acquire[i];
    sel.addEventListener('change', () => {
      const dup = state.acquire.findIndex((k, j) => j !== i && k === sel.value);
      if (dup >= 0) { state.acquire[dup] = state.acquire[i]; $('acq' + (dup + 1)).value = state.acquire[dup]; }
      state.acquire[i] = sel.value;
      updateSkillIcons();
      changed();
    });
  });
  // アイテム行（上：選択済みアイコン列／下：横幅いっぱいの検索欄×1）
  const rowsEl = $('itemRows');
  state.itemRows.forEach((row, r) => {
    const div = document.createElement('div'); div.className = 'itemRow';
    const tLabel = document.createElement('label');
    tLabel.textContent = `行${r + 1} タイトル`;
    const tInp = mkTextInput(row.title);
    tInp.addEventListener('input', () => { state.itemRows[r].title = tInp.value; changed(); });
    tLabel.appendChild(tInp); div.appendChild(tLabel);

    // 選択済みアイテムのアイコン列（左詰め、最大6個、残りは点線の空枠）
    const strip = document.createElement('div');
    strip.className = 'itemStrip';
    div.appendChild(strip);
    const hint = document.createElement('p');
    hint.className = 'hint';
    hint.textContent = 'アイコンをタップすると削除できます（最大6個）';
    div.appendChild(hint);

    // 検索欄（1行に1つだけ、横幅いっぱい）
    const searchWrap = document.createElement('div');
    searchWrap.className = 'itemSearch';
    const inp = mkTextInput('');
    inp.placeholder = 'アイテム名で検索して追加（例：ホロウ）';
    const drop = document.createElement('div');
    drop.className = 'itemDropdown';
    drop.hidden = true;
    searchWrap.appendChild(inp); searchWrap.appendChild(drop);
    div.appendChild(searchWrap);
    rowsEl.appendChild(div);

    // state は「選択済みを前に詰めた6要素配列」として保持する
    const selectedNames = () => state.itemRows[r].items.filter(n => String(n || '').trim());
    const writeBack = names => {
      const arr = names.slice(0, ITEMS_PER_ROW);
      while (arr.length < ITEMS_PER_ROW) arr.push('');
      state.itemRows[r].items = arr;
    };
    const renderStrip = () => {
      strip.innerHTML = '';
      const names = selectedNames();
      names.forEach((nm, idx) => {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'itemChip';
        chip.title = `${nm}（タップで削除）`;
        const it = findItemByName(nm);
        if (it && dd.version) {
          const im = document.createElement('img');
          im.src = itemURL(it); im.alt = nm;
          chip.appendChild(im);
        } else {
          const sp = document.createElement('span');
          sp.className = 'itemChipName';
          sp.textContent = nm;
          chip.appendChild(sp);
        }
        const rm = document.createElement('span');
        rm.className = 'rm';
        rm.textContent = '×';
        chip.appendChild(rm);
        chip.addEventListener('click', () => {
          const cur = selectedNames();
          cur.splice(idx, 1);
          writeBack(cur);
          renderStrip();
          changed();
        });
        strip.appendChild(chip);
      });
      for (let i = names.length; i < ITEMS_PER_ROW; i++) {
        const emp = document.createElement('div');
        emp.className = 'itemSlotEmpty';
        strip.appendChild(emp);
      }
    };
    itemIconUpdaters.push(renderStrip); // DD読込後にアイコン付きで再描画
    renderStrip();

    const pick = name => {
      drop.hidden = true;
      const cur = selectedNames();
      if (cur.length >= ITEMS_PER_ROW) return; // 6個に達していたら追加しない
      cur.push(name); // 選択した順に末尾へ（左詰め）
      writeBack(cur);
      inp.value = '';
      renderStrip();
      changed();
    };
    inp.addEventListener('input', () => showItemCandidates(inp, drop, pick));
    inp.addEventListener('focus', () => showItemCandidates(inp, drop, pick));
    inp.addEventListener('blur', () => { setTimeout(() => { drop.hidden = true; }, 150); });
    inp.addEventListener('keydown', e => { if (e.key === 'Escape') drop.hidden = true; });
  });
  // テキストスタック類
  const stack = (elId, arr, onInput) => {
    const el = $(elId);
    arr.forEach((v, i) => {
      const inp = mkTextInput(v);
      inp.addEventListener('input', () => { onInput(i, inp.value); changed(); });
      el.appendChild(inp);
    });
  };
  stack('strengths', state.strengths, (i, v) => state.strengths[i] = v);
  stack('weaknesses', state.weaknesses, (i, v) => state.weaknesses[i] = v);
  stack('tips', state.tips, (i, v) => state.tips[i] = v);
  stack('motto', state.motto, (i, v) => state.motto[i] = v);
  // コンボ（キー＋メモ）
  const combosEl = $('combos');
  state.combos.forEach((c, i) => {
    const row = document.createElement('div'); row.className = 'comboRow';
    const l1 = document.createElement('label'); l1.textContent = 'キー';
    const kInp = mkTextInput(c.keys);
    kInp.addEventListener('input', () => { state.combos[i].keys = kInp.value; changed(); });
    l1.appendChild(kInp);
    const l2 = document.createElement('label'); l2.textContent = 'メモ';
    const nInp = mkTextInput(c.note);
    nInp.addEventListener('input', () => { state.combos[i].note = nInp.value; changed(); });
    l2.appendChild(nInp);
    row.appendChild(l1); row.appendChild(l2); combosEl.appendChild(row);
  });
}

// -- DD依存コントロール --
function buildChampionOptions(filter = '') {
  const sel = $('champSelect');
  sel.innerHTML = '';
  const list = [...dd.champions.values()]
    .filter(c => !filter || c.name.includes(filter) || c.id.toLowerCase().includes(filter.toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name, 'ja'));
  for (const c of list) {
    const op = document.createElement('option');
    op.value = c.id; op.textContent = `${c.name}（${c.title}）`;
    sel.appendChild(op);
  }
  if (dd.champions.has(state.championId) && [...sel.options].some(o => o.value === state.championId)) sel.value = state.championId;
}
function buildSummonerOptions() {
  const opts = [...dd.summoners.entries()]
    .map(([key, s]) => ({ value: key, label: s.name }))
    .sort((a, b) => a.label.localeCompare(b.label, 'ja'));
  [['summ1', 0], ['summ2', 1]].forEach(([id, i]) => {
    const sel = $(id);
    sel.innerHTML = '';
    for (const o of opts) { const op = document.createElement('option'); op.value = o.value; op.textContent = o.label; sel.appendChild(op); }
    if (dd.summoners.has(state.summoners[i])) sel.value = state.summoners[i];
    state.summoners[i] = sel.value;
  });
  updateSummonerIcons();
}
function buildMainPicks() {
  const style = styleById(state.runeMain);
  const el = $('mainPicks');
  el.innerHTML = '';
  if (!style) return;
  const names = ['キーストーン', '2段目', '3段目', '4段目'];
  style.slots.forEach((slot, i) => {
    if (!slot.runes.some(r => r.id === state.runeMainPicks[i])) state.runeMainPicks[i] = slot.runes[0].id;
    const wrap = document.createElement('label');
    wrap.textContent = names[i] || `${i + 1}段目`;
    const row = document.createElement('span');
    row.className = 'selWithIcon';
    const sel = mkSelect(slot.runes.map(r => ({ value: r.id, label: r.name })), String(state.runeMainPicks[i]));
    const icon = document.createElement('img');
    icon.className = 'inlineIcon';
    icon.alt = '';
    const syncIcon = () => { const r = runeById(style, +sel.value); setImg(icon, r ? runeURL(r) : null); };
    sel.addEventListener('change', () => { state.runeMainPicks[i] = +sel.value; syncIcon(); changed(); });
    syncIcon();
    row.appendChild(sel); row.appendChild(icon);
    wrap.appendChild(row); el.appendChild(wrap);
  });
}
function buildSubPicks() {
  const style = styleById(state.runeSub);
  const el = $('subPicks');
  el.innerHTML = '';
  if (!style) return;
  const allIds = new Set();
  style.slots.forEach(s => s.runes.forEach(r => allIds.add(r.id)));
  [0, 1].forEach(j => {
    if (!allIds.has(state.runeSubPicks[j])) state.runeSubPicks[j] = style.slots[1].runes[0].id;
    const wrap = document.createElement('label');
    wrap.textContent = `サブルーン${j + 1}`;
    const row = document.createElement('span');
    row.className = 'selWithIcon';
    const sel = document.createElement('select');
    style.slots.slice(1).forEach((slot, si) => {
      const og = document.createElement('optgroup');
      og.label = `${si + 2}段目`;
      slot.runes.forEach(r => { const op = document.createElement('option'); op.value = r.id; op.textContent = r.name; og.appendChild(op); });
      sel.appendChild(og);
    });
    sel.value = String(state.runeSubPicks[j]);
    const icon = document.createElement('img');
    icon.className = 'inlineIcon';
    icon.alt = '';
    const syncIcon = () => { const r = runeById(style, +sel.value); setImg(icon, r ? runeURL(r) : null); };
    sel.addEventListener('change', () => { state.runeSubPicks[j] = +sel.value; syncIcon(); changed(); });
    syncIcon();
    row.appendChild(sel); row.appendChild(icon);
    wrap.appendChild(row); el.appendChild(wrap);
  });
}
function buildRuneStyleOptions() {
  const opts = dd.styles.map(s => ({ value: s.id, label: s.name }));
  [['runeMain', 'runeMain'], ['runeSub', 'runeSub']].forEach(([id]) => {
    const sel = $(id);
    sel.innerHTML = '';
    for (const o of opts) { const op = document.createElement('option'); op.value = o.value; op.textContent = o.label; sel.appendChild(op); }
  });
  $('runeMain').value = String(state.runeMain);
  $('runeSub').value = String(state.runeSub);
  state.runeMain = +$('runeMain').value;
  state.runeSub = +$('runeSub').value;
  updateRuneStyleIcons();
  buildMainPicks(); buildSubPicks();
}

// -- フォームへ状態を反映 --
function applyStateToForm() {
  $('patch').value = state.patch;
  $('role').value = state.role;
  $('catchphrase').value = state.catchphrase;
  $('difficulty').value = state.difficulty;
  $('difficultyText').value = `難易度 ${state.difficulty} / 10`;
  $('splashX').value = Math.round(state.splashX * 1000);
  $('accent').value = state.accent;
  $('passiveDesc').value = state.passiveDesc;
  $('itemsHeadingSub').value = state.itemsHeadingSub;
}
function applyChampionMeta(det) {
  const listEntry = dd.champions.get(state.championId || det.id);
  $('champTitle').value = state.title || det.title || (listEntry && listEntry.title) || '';
  $('passiveName').textContent = det.passive ? det.passive.name : '-';
  const dDetail = det.info && det.info.difficulty > 0 ? det.info.difficulty : 0;
  const dList = listEntry && listEntry.info && listEntry.info.difficulty > 0 ? listEntry.info.difficulty : 0;
  state.difficulty = dDetail || dList || state.difficulty;
  $('difficulty').value = state.difficulty;
  $('difficultyText').value = `難易度 ${state.difficulty} / 10`;
  updateSkillIcons();
}
let lastAutoRole = '';
async function onChampionChange() {
  const id = $('champSelect').value;
  if (!id || !dd.champions.has(id)) return;
  state.championId = id;
  try {
    const det = await loadDetail(id);
    dd.detail = det; dd.detailId = id;
    state.title = det.title || ''; // チャンピオンを切り替えたら肩書きは公式のものに戻す
    applyChampionMeta(det);
    const autoRole = (det.tags || []).map(t => TAG_JA[t] || t).join(' ・ ');
    if (autoRole && (state.role === '' || state.role === lastAutoRole)) {
      state.role = autoRole; lastAutoRole = autoRole; $('role').value = state.role;
    }
    changed();
  } catch (e) { setStatus('チャンピオン詳細の取得に失敗しました', true); }
}

// -- イベント結線 --
function wireEvents() {
  $('champSearch').addEventListener('input', e => buildChampionOptions(e.target.value.trim()));
  $('champTitle').addEventListener('input', e => { state.title = e.target.value; changed(); });
  $('champSelect').addEventListener('change', onChampionChange);
  const bind = (id, fn) => $(id).addEventListener('input', e => { fn(e.target.value); changed(); });
  bind('patch', v => state.patch = v);
  bind('role', v => { state.role = v; });
  bind('catchphrase', v => state.catchphrase = v);
  bind('passiveDesc', v => state.passiveDesc = v);
  bind('itemsHeadingSub', v => state.itemsHeadingSub = v);
  $('difficulty').addEventListener('input', e => {
    let d = parseInt(e.target.value, 10);
    if (isNaN(d)) d = 0;
    state.difficulty = Math.max(0, Math.min(10, d));
    $('difficultyText').value = `難易度 ${state.difficulty} / 10`;
    changed();
  });
  $('splashX').addEventListener('input', e => { state.splashX = (+e.target.value) / 1000; changed(); });
  $('accent').addEventListener('input', e => { state.accent = e.target.value; changed(); });
  [['summ1', 0], ['summ2', 1]].forEach(([id, i]) => {
    $(id).addEventListener('change', e => { state.summoners[i] = e.target.value; updateSummonerIcons(); changed(); });
  });
  $('runeMain').addEventListener('change', e => { state.runeMain = +e.target.value; updateRuneStyleIcons(); buildMainPicks(); changed(); });
  $('runeSub').addEventListener('change', e => { state.runeSub = +e.target.value; updateRuneStyleIcons(); buildSubPicks(); changed(); });
  // アイテム候補ドロップダウン：欄の外をタップ／クリックしたら閉じる
  document.addEventListener('pointerdown', e => {
    document.querySelectorAll('.itemSearch').forEach(wrap => {
      if (!wrap.contains(e.target)) {
        const d = wrap.querySelector('.itemDropdown');
        if (d) d.hidden = true;
      }
    });
  });
  $('download').addEventListener('click', () => {
    canvas.toBlob(blob => {
      if (!blob) return;
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${state.championId.toLowerCase()}-guide.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    }, 'image/png');
  });
  $('reset').addEventListener('click', () => {
    try { localStorage.removeItem(LS_KEY); } catch (e) { /* noop */ }
    location.reload();
  });
}

// ---------- 初期化 ----------
(async function init() {
  restore();
  normalizeItemRows();
  buildStaticControls();
  applyStateToForm();
  wireEvents();
  draw();
  try {
    await loadDD();
    buildChampionOptions();
    buildSummonerOptions();
    buildRuneStyleOptions();
    itemIconUpdaters.forEach(f => f());
    applyStateToForm();
    const det = await loadDetail(state.championId);
    dd.detail = det; dd.detailId = state.championId;
    applyChampionMeta(det);
    setStatus(`Data Dragon ${dd.version}（ja_JP）のデータで描画しています。アイコン等は公式CDNから読み込みます。`);
    draw();
  } catch (e) {
    setStatus('Data Dragon のデータ取得に失敗しました。ネット接続を確認して再読み込みしてください。（' + e.message + '）', true);
    draw();
  }
})();
