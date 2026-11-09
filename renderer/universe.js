// 个人宇宙：星点墙 + 英雄卡片

const PALETTE = ['#6ee7ff', '#ff9ec7', '#a78bfa', '#fbbf24', '#34d399', '#f472b6'];
const RING_DIAMETERS = [300, 430, 560, 690];
const RING_RATIO = 0.52; // 椭圆压扁比例

const $ = (id) => document.getElementById(id);
const sky = $('sky');
const starsBox = $('stars');
const ringsBox = $('rings');
const tip = $('tip');

const DEMO = new URLSearchParams(location.search).has('demo');

let stars = [];

// ---------- 演示数据（--demo 自检用） ----------
function weekKeyOf(d) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const ys = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((t - ys) / 86400000 + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

function demoStars() {
  const out = [];
  const now = Date.now();
  const samples = [
    [1, 3120, 640, 2, 1], [1, 1180, 220, 0, 3], [1, 2504, 1180, 1, 0],
    [2, 4210, 990, 4, 2], [2, 860, 410, 0, 1], [2, 1890, 760, 1, 0],
    [3, 5210, 1420, 3, 1], [3, 640, 180, 0, 2], [3, 2760, 880, 2, 0]
  ];
  samples.forEach(([weeksAgo, kb, ms, gold, yawns], i) => {
    const end = new Date(now - (weeksAgo * 7 - i % 3) * 86400000 - i * 3600000);
    const start = new Date(end.getTime() - (1.5 + (i % 4) * 0.6) * 3600000);
    out.push({
      id: now - i * 1000,
      weekKey: weekKeyOf(end),
      endedAt: end.toISOString(),
      startedAt: start.toISOString(),
      track: kb > ms ? 'kb' : 'mouse',
      kb: { events: kb, gold, yawns },
      mouse: { events: ms, gold: 0, yawns: 0 }
    });
  });
  return out;
}

// ---------- 布局 ----------
function rectOf(el) {
  return el.getBoundingClientRect();
}

function render() {
  starsBox.innerHTML = '';
  ringsBox.innerHTML = '';
  $('legend').innerHTML = '';

  // 背景微星
  for (let i = 0; i < 130; i++) {
    const s = document.createElement('div');
    s.className = 'bgstar';
    s.style.left = (Math.random() * 100).toFixed(2) + '%';
    s.style.top = (Math.random() * 100).toFixed(2) + '%';
    s.style.opacity = (0.12 + Math.random() * 0.5).toFixed(2);
    s.style.width = s.style.height = (Math.random() < 0.15 ? 2 : 1.2) + 'px';
    starsBox.appendChild(s);
  }

  if (!stars.length) {
    $('empty').classList.remove('hidden');
    $('sub').textContent = '共 0 颗星';
    return;
  }
  $('empty').classList.add('hidden');

  // 按周分组（只展示最近 4 周）
  const weeks = [...new Set(stars.map((s) => s.weekKey))].sort();
  const shown = weeks.slice(-RING_DIAMETERS.length);
  const weekRing = new Map(shown.map((w, i) => [w, i]));

  // 轨道
  shown.forEach((w, i) => {
    const ring = document.createElement('div');
    ring.className = 'ring' + (i === shown.length - 1 ? ' current' : '');
    ring.style.width = RING_DIAMETERS[i] + 'px';
    ring.style.height = RING_DIAMETERS[i] * RING_RATIO + 'px';
    ringsBox.appendChild(ring);
  });

  const box = rectOf(sky);
  const cx = box.width / 2;
  const cy = box.height / 2;

  // 按周排星：同周均分角度 + 轻微抖动
  const byWeek = new Map();
  for (const s of stars) {
    if (!weekRing.has(s.weekKey)) continue;
    if (!byWeek.has(s.weekKey)) byWeek.set(s.weekKey, []);
    byWeek.get(s.weekKey).push(s);
  }

  for (const [week, list] of byWeek) {
    const ringIdx = weekRing.get(week);
    const d = RING_DIAMETERS[ringIdx];
    const rx = d / 2;
    const ry = (d * RING_RATIO) / 2;
    const color = PALETTE[ringIdx % PALETTE.length];
    const n = list.length;

    list.sort((a, b) => new Date(a.endedAt) - new Date(b.endedAt));
    list.forEach((s, i) => {
      const angle = (-90 + (360 / Math.max(n, 1)) * i + (ringIdx * 23)) * (Math.PI / 180);
      const jitter = 0.92 + Math.random() * 0.16;
      const x = cx + Math.cos(angle) * rx * jitter;
      const y = cy + Math.sin(angle) * ry * jitter;

      const events = (s.kb?.events || 0) + (s.mouse?.events || 0);
      const size = Math.max(6, Math.min(15, 6 + Math.log10(events + 1) * 4));
      const fresh = shown.length - 1 - ringIdx;
      const opacity = Math.max(0.5, 0.95 - fresh * 0.12);

      const btn = document.createElement('button');
      btn.className = 'star';
      btn.style.left = x.toFixed(1) + 'px';
      btn.style.top = y.toFixed(1) + 'px';
      btn.style.setProperty('--c', color);
      btn.style.setProperty('--s', size.toFixed(1) + 'px');
      btn.style.setProperty('--o', opacity.toFixed(2));
      btn.dataset.id = String(s.id);
      btn.innerHTML = '<i></i>';

      btn.addEventListener('mouseenter', () => showTip(s, btn, color));
      btn.addEventListener('mouseleave', hideTip);
      btn.addEventListener('click', () => openHero(s, color));

      starsBox.appendChild(btn);
    });

    // 图例（按周从早到晚）
    const chip = document.createElement('span');
    chip.dataset.week = week;
    chip.innerHTML = `<i style="background:${color};box-shadow:0 0 8px ${color}"></i>${week.slice(0, 4)} · 第 ${week.slice(-2)} 周`;
    $('legend').appendChild(chip);
  }

  // 图例排序
  [...$('legend').children]
    .sort((a, b) => a.dataset.week.localeCompare(b.dataset.week))
    .forEach((el) => $('legend').appendChild(el));

  const thisWeek = weekKeyOf(new Date());
  const thisCount = stars.filter((s) => s.weekKey === thisWeek).length;
  $('sub').textContent = `共 ${stars.length} 颗星 · 本周 ${thisCount} 颗`;
}

// ---------- 悬停提示 ----------
function fmtDate(iso) {
  const d = new Date(iso);
  return `${d.getMonth() + 1}月${String(d.getDate()).padStart(2, '0')}日 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function showTip(s, el, color) {
  const box = rectOf(sky);
  const r = rectOf(el);
  const gold = (s.kb?.gold || 0) + (s.mouse?.gold || 0);
  tip.innerHTML = `<b>${fmtDate(s.endedAt)}</b> · ${s.track === 'kb' ? '键盘跑道' : '鼠标跑道'}`
    + (gold ? ` · 金色 ×${gold}` : '');
  tip.style.borderColor = color + '55';
  tip.classList.remove('hidden');
  const x = Math.min(box.width - tip.offsetWidth - 12, Math.max(12, r.left - box.left + 14));
  const y = Math.max(10, r.top - box.top - tip.offsetHeight - 10);
  tip.style.left = x + 'px';
  tip.style.top = y + 'px';
}

function hideTip() { tip.classList.add('hidden'); }

// ---------- 称号 ----------
function heroTitle(s) {
  const kb = s.kb?.events || 0;
  const ms = s.mouse?.events || 0;
  const gold = (s.kb?.gold || 0) + (s.mouse?.gold || 0);
  const yawns = (s.kb?.yawns || 0) + (s.mouse?.yawns || 0);
  const end = new Date(s.endedAt);
  const h = end.getHours();

  if (gold >= 5) return '金色喷泉';
  if (gold >= 3) return '金色三连选手';
  if (h >= 23 || h < 5) return '夜航者';
  if (h < 8) return '清晨苦行僧';
  if (kb >= 4000) return '人形打字机';
  if (kb + ms < 300) return '宇宙静默者';
  if (yawns >= 3) return '哈欠制造机';
  if (ms > kb * 1.6) return '鼠标漫游者';
  return '默默推进者';
}

function durationText(s) {
  if (!s.startedAt) return '—';
  const ms = new Date(s.endedAt) - new Date(s.startedAt);
  if (!(ms > 0)) return '—';
  const m = Math.round(ms / 60000);
  if (m < 60) return `${m} 分钟`;
  return `${Math.floor(m / 60)} 小时 ${m % 60} 分`;
}

function openHero(s, color) {
  const kb = s.kb?.events || 0;
  const ms = s.mouse?.events || 0;
  const gold = (s.kb?.gold || 0) + (s.mouse?.gold || 0);
  const yawns = (s.kb?.yawns || 0) + (s.mouse?.yawns || 0);

  $('heroEyebrow').textContent = `星点档案 · ${s.weekKey.replace('-W', ' 第')} 周 · ${s.track === 'kb' ? '键盘跑道' : '鼠标跑道'}`;
  $('heroTitle').textContent = heroTitle(s);
  $('heroFlavor').textContent =
    `那天键盘被你敲了 ${kb.toLocaleString('zh-CN')} 下，鼠标动了 ${ms.toLocaleString('zh-CN')} 次`
    + (gold ? `，金色亮了 ${gold} 次` : '')
    + (yawns ? `，哈欠 ${yawns} 次` : '')
    + '。';

  const items = [
    ['键盘击键', kb.toLocaleString('zh-CN')],
    ['鼠标点击', ms.toLocaleString('zh-CN')],
    ['收尾时间', fmtDate(s.endedAt).split(' ')[1]],
    ['金色', gold ? `×${gold}` : '—'],
    ['哈欠', yawns ? `×${yawns}` : '—'],
    ['用时', durationText(s)]
  ];
  $('heroStats').innerHTML = items.map(([k, v]) =>
    `<div class="stat"><span>${k}</span><b>${v}</b></div>`).join('');

  $('heroTitle').style.filter = `drop-shadow(0 0 18px ${color}44)`;
  $('cardLayer').classList.remove('hidden');
}

function closeHero() {
  $('cardLayer').classList.add('hidden');
}

// ---------- 启动 ----------
(async () => {
  stars = DEMO ? demoStars() : (window.lumoAPI ? await window.lumoAPI.getStars() : []);
  render();

  $('close').addEventListener('click', () => window.close());
  $('heroClose').addEventListener('click', closeHero);
  $('cardLayer').addEventListener('click', (e) => {
    if (e.target.id === 'cardLayer') closeHero();
  });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeHero();
  });

  // 自检：?hero=1 时自动打开第一颗星的卡片
  if (new URLSearchParams(location.search).has('hero') && stars.length) {
    setTimeout(() => openHero(stars[0], PALETTE[stars.length % PALETTE.length]), 500);
  }
})();
