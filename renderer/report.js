// 周五开箱：本周工伤鉴定报告

const $ = (id) => document.getElementById(id);
const PARAMS = new URLSearchParams(location.search);
const DEMO = PARAMS.has('demo');
const AUTO_OPEN = PARAMS.has('open');

const PALETTE = ['#6ee7ff', '#ff9ec7', '#a78bfa', '#fbbf24', '#34d399'];

function isoWeekKey(d = new Date()) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const ys = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((t - ys) / 86400000 + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

function fmtDate(iso) {
  const d = new Date(iso);
  return `${d.getMonth() + 1}月${String(d.getDate()).padStart(2, '0')}日`;
}

// ---------- 段位 ----------
const TIERS = [
  { min: 50000, name: '键盘战神', note: '这周你不是在打字，你是在发电' },
  { min: 25000, name: '人形打字机', note: '手感发烫，建议给指尖放假' },
  { min: 10000, name: '稳定输出者', note: '节奏稳得像钟，也不像人' },
  { min: 3000,  name: '键盘练习生', note: '刚热开身，下周继续' },
  { min: 0,     name: '摸鱼学徒',   note: '光点多半在看你，不是在跑' }
];

function tierOf(total) {
  const i = TIERS.findIndex((t) => total >= t.min);
  const current = TIERS[i];
  const next = i > 0 ? TIERS[i - 1] : null;
  return { current, next, gap: next ? next.min - total : 0 };
}

// ---------- 演示数据 ----------
function demoStars() {
  const now = Date.now();
  const out = [];
  const samples = [
    [3120, 640, 2, 1, 26], [1180, 220, 0, 3, 2], [2504, 1180, 1, 0, 1],
    [4210, 990, 4, 2, 0], [860, 410, 0, 1, 4]
  ];
  samples.forEach(([kb, ms, gold, yawns, hoursAgo], i) => {
    const end = new Date(now - hoursAgo * 3600000);
    out.push({
      id: now - i, type: 'session', weekKey: isoWeekKey(),
      endedAt: end.toISOString(),
      startedAt: new Date(end.getTime() - 5400000).toISOString(),
      track: kb > ms ? 'kb' : 'mouse',
      kb: { events: kb, gold, yawns }, mouse: { events: ms, gold: 0, yawns: 0 }
    });
  });

  // --open 自检：直接给出"已开箱"的数据
  if (AUTO_OPEN) {
    const sum = (f) => out.reduce((a, s) => a + f(s), 0);
    out.push({
      id: now + 1, type: 'week', weekKey: isoWeekKey(),
      endedAt: new Date(now).toISOString(), startedAt: null, track: 'week',
      kb: { events: sum((s) => s.kb.events), gold: sum((s) => s.kb.gold), yawns: sum((s) => s.kb.yawns) },
      mouse: { events: sum((s) => s.mouse.events), gold: 0, yawns: 0 }
    });
  }
  return out;
}

// ---------- 数据汇总 ----------
let stars = [];
let weekKey = isoWeekKey();

function totalsFrom(starsList) {
  const sum = { kb: 0, mouse: 0, gold: 0, yawns: 0 };
  for (const s of starsList) {
    sum.kb += s.kb?.events || 0;
    sum.mouse += s.mouse?.events || 0;
    sum.gold += (s.kb?.gold || 0) + (s.mouse?.gold || 0);
    sum.yawns += (s.kb?.yawns || 0) + (s.mouse?.yawns || 0);
  }
  return sum;
}

function weekData() {
  const sessions = stars.filter((s) => s.weekKey === weekKey && s.type !== 'week');
  const weekStar = stars.find((s) => s.weekKey === weekKey && s.type === 'week');
  const totals = weekStar ? totalsFrom([weekStar]) : totalsFrom(sessions);
  const days = new Set(sessions.map((s) => new Date(s.endedAt).toDateString())).size;
  return { sessions, weekStar, totals, days };
}

function longestText(sessions) {
  let best = 0;
  for (const s of sessions) {
    if (!s.startedAt) continue;
    best = Math.max(best, new Date(s.endedAt) - new Date(s.startedAt));
  }
  if (!best) return '—';
  const m = Math.round(best / 60000);
  return m < 60 ? `${m} 分钟` : `${Math.floor(m / 60)} 小时 ${m % 60} 分`;
}

function latestText(sessions) {
  if (!sessions.length) return '—';
  const d = new Date(Math.max(...sessions.map((s) => new Date(s.endedAt))));
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// ---------- 渲染 ----------
function showPane(id) {
  for (const p of ['locked', 'boxPane', 'reportPane']) {
    $(p).classList.toggle('hidden', p !== id);
  }
}

function renderLocked() {
  showPane('locked');
  const now = new Date();
  const day = now.getDay(); // 5 = 周五
  const daysToFri = ((5 - day) + 7) % 7 || 7;
  const target = new Date(now);
  target.setDate(now.getDate() + daysToFri);
  target.setHours(0, 0, 0, 0);

  const tick = () => {
    const left = target - new Date();
    if (left <= 0) { location.reload(); return; }
    const d = Math.floor(left / 86400000);
    const h = Math.floor((left % 86400000) / 3600000);
    const m = Math.floor((left % 3600000) / 60000);
    const s = Math.floor((left % 60000) / 1000);
    $('countdown').textContent = `${d} 天 ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };
  tick();
  setInterval(tick, 1000);
  $('headSub').textContent = `${weekKey.slice(0, 4)} 年 · 第 ${weekKey.slice(-2)} 周 · 未到开箱时间`;
  $('footBtn').textContent = '关闭';
  $('footNote').textContent = '每周五 00:00 之后可以开一次';
}

function renderBox() {
  showPane('boxPane');
  const { totals, sessions } = weekData();
  const total = totals.kb + totals.mouse;
  $('headSub').textContent = `${weekKey.slice(0, 4)} 年 · 第 ${weekKey.slice(-2)} 周 · 本周已攒 ${total.toLocaleString('zh-CN')} 次输入 · ${sessions.length} 颗星`;
  $('footBtn').textContent = '关闭';
  $('footNote').textContent = '开箱后跑道回到起点，这一周会变成一颗星';
}

async function claim() {
  $('box').classList.add('opening');
  await new Promise((r) => setTimeout(r, 620));
  if (window.lumoAPI) window.lumoAPI.claimWeek();
  else afterClaim();

  const onDone = async (star) => {
    if (star) stars.push(star);
    renderReport(true);
  };
  if (window.lumoAPI) {
    window.lumoAPI.onClaimed(onDone);
    // 兜底：2 秒内没回应就自己渲染一次
    setTimeout(() => renderReport(false), 2200);
  }
}

let rendered = false;
function renderReport(afterClaim) {
  if (rendered && !afterClaim) return;
  rendered = true;

  showPane('reportPane');
  const { sessions, weekStar, totals, days } = weekData();
  const total = totals.kb + totals.mouse;
  const { current, next, gap } = tierOf(total);

  $('headSub').textContent = `${weekKey.slice(0, 4)} 年 · 第 ${weekKey.slice(-2)} 周 · 已开箱`;
  $('footNote').textContent = '下周同一时间，再来领一次鉴定结果';

  $('rankLabel').textContent = current.name;
  $('rankSub').textContent = next
    ? `${current.note} · 距「${next.name}」还差 ${gap.toLocaleString('zh-CN')} 次输入`
    : `${current.note} · 已到顶，无段可升`;

  const cells = [
    ['键盘击键', totals.kb.toLocaleString('zh-CN')],
    ['鼠标点击', totals.mouse.toLocaleString('zh-CN')],
    ['金色庆祝', totals.gold ? `×${totals.gold}` : '—'],
    ['哈欠', totals.yawns ? `×${totals.yawns}` : '—'],
    ['收下星点', `${sessions.length} 颗`],
    ['活跃天数', `${days} 天`],
    ['最久一次', longestText(sessions)],
    ['最晚收尾', latestText(sessions)],
    ['日均输入', days ? Math.round(total / days).toLocaleString('zh-CN') : '—']
  ];
  $('grid').innerHTML = cells.map(([k, v]) =>
    `<div class="cell"><span>${k}</span><b>${v}</b></div>`).join('');

  // 星点条
  if (sessions.length) {
    const max = Math.max(...sessions.map((s) => (s.kb?.events || 0) + (s.mouse?.events || 0)));
    $('bars').innerHTML = sessions
      .sort((a, b) => new Date(a.endedAt) - new Date(b.endedAt))
      .map((s, i) => {
        const ev = (s.kb?.events || 0) + (s.mouse?.events || 0);
        const h = Math.max(8, Math.round((ev / max) * 62));
        return `<div class="bar" title="${fmtDate(s.endedAt)} · ${ev.toLocaleString('zh-CN')} 次"
                   style="--c:${PALETTE[i % PALETTE.length]};height:${h}px"></div>`;
      }).join('');
  } else {
    $('bars').innerHTML = '<span class="bars-empty">这周还没有星点</span>';
  }

  // 评语
  const lines = [];
  if (totals.gold === 0) lines.push('本周零金色：你一直在敲，但从没连续三分钟认真过。');
  else if (totals.gold >= 3) lines.push(`金色亮了 ${totals.gold} 次——这周你有 ${totals.gold} 次真的进入状态。`);
  else lines.push(`金色 ${totals.gold} 次，刚好够证明你不是机器人。`);

  if (totals.yawns >= 5) lines.push(`哈欠 ${totals.yawns} 次，你的光点看你的时间比你还多。`);
  else if (sessions.length >= 5) lines.push(`收下 ${sessions.length} 颗星，本周的宇宙很热闹。`);

  const late = sessions.some((s) => {
    const h = new Date(s.endedAt).getHours();
    return h >= 23 || h < 5;
  });
  if (late) lines.push('凌晨仍有足迹，夜航者认证。');

  if (total < 3000) lines.push('本周近乎静默，光点在原地等你回来。');

  $('verdict').innerHTML = lines.slice(0, 3).map((t) => `<p>${t}</p>`).join('');
}

// ---------- 启动 ----------
(async () => {
  stars = DEMO ? demoStars() : (window.lumoAPI ? await window.lumoAPI.getStars() : []);
  const isFriday = DEMO || new Date().getDay() === 5;
  const { weekStar } = weekData();

  $('close').addEventListener('click', () => window.close());
  $('footBtn').addEventListener('click', () => window.close());
  $('openBtn').addEventListener('click', claim);
  $('box').addEventListener('click', claim);

  if (weekStar) {
    renderReport(true);
    return;
  }
  if (!isFriday) {
    renderLocked();
    return;
  }
  renderBox();
  if (AUTO_OPEN) claim();
})();
