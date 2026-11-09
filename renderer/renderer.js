// lumo：两只打工光点
// 真实模式：主进程 hook 键盘/鼠标计数 → feed()
// 模拟模式：SIMULATE = true 时用假数据（观赏用）

const SIMULATE = new URLSearchParams(location.search).has('demo');
const DEMO = SIMULATE;

// ---------- 可调参数 ----------
const CFG = {
  kbTrackLength: 2500,
  mouseTrackLength: 1500,
  easeTau: 110,
  heatPerEvent: 0.10,
  heatDecayTau: 900,
  breatheAfterMs: 1500,
  yawnAfterMs: 60000,
  yawnEveryMs: [120000, 240000],
  goldAfterMs: 180000,
  goldGapToleranceMs: 5000,
  sleepAfterMs: 45 * 60 * 1000, // 45 分钟无输入 → 沉睡结算
  saveEveryMs: 5000
};

// ---------- 光点 ----------
function makeDot(id, trackId, trackLength) {
  return {
    id, trackId,
    el: document.getElementById(id),
    track: document.getElementById(trackId),
    fill: document.querySelector(`#${trackId} .fill`),
    core: document.querySelector(`#${id} .core`),
    tail: document.querySelector(`#${id} .tail`),
    trackLength,
    progress: 0,
    lastEventAt: 0,
    x: 0,
    heat: 0,
    continuousMs: 0, lastContinuousAt: 0,
    phase: 'run', nextYawnAt: Infinity,
    sleeping: false,
    stats: { events: 0, gold: 0, yawns: 0 },
    startedAt: null
  };
}

const DOTS = {
  kb:    makeDot('dot-kb',    'track-kb',    CFG.kbTrackLength),
  mouse: makeDot('dot-mouse', 'track-mouse', CFG.mouseTrackLength)
};

const stars = [];
let dirty = false;

function now() { return performance.now(); }
function rand(a, b) { return a + Math.random() * (b - a); }

function isoWeekKey(d = new Date()) {
  // ISO 周：以周四所在周为准
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((t - yearStart) / 86400000 + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

// ---------- 存盘 ----------
function buildState() {
  return {
    version: 1,
    weekKey: isoWeekKey(),
    savedAt: new Date().toISOString(),
    tracks: {},
    stars
  };
}

function serialize() {
  const s = buildState();
  for (const key of ['kb', 'mouse']) {
    const d = DOTS[key];
    s.tracks[key] = {
      progress: d.progress,
      events: d.stats.events,
      gold: d.stats.gold,
      yawns: d.stats.yawns,
      startedAt: d.startedAt,
      sleeping: d.sleeping
    };
  }
  return s;
}

function saveNow(immediate = false) {
  if (!window.lumoAPI || SIMULATE) return; // 演示模式不落盘
  dirty = true;
  if (immediate) {
    window.lumoAPI.saveState(serialize());
    dirty = false;
  }
}

// ---------- 设置 ----------
function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex).trim());
  if (!m) return { r: 110, g: 231, b: 255 };
  const n = parseInt(m[1], 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function applySettings(s) {
  CFG.kbTrackLength = s.kbTrackLength;
  CFG.mouseTrackLength = s.mouseTrackLength;
  CFG.easeTau = s.easeTau;
  CFG.goldAfterMs = s.goldAfterMin * 60000;
  CFG.yawnAfterMs = s.yawnAfterSec * 1000;
  CFG.sleepAfterMs = s.sleepAfterMin * 60000;

  DOTS.kb.trackLength = s.kbTrackLength;
  DOTS.mouse.trackLength = s.mouseTrackLength;

  const paint = (trackId, dotId, hex) => {
    const { r, g, b } = hexToRgb(hex);
    document.getElementById(trackId).style.setProperty('--c', `${r}, ${g}, ${b}`);
    const core = document.querySelector(`#${dotId} .core`);
    core.style.setProperty('--dot-color', hex);
    core.style.setProperty('--dot-deep',
      `rgb(${Math.round(r * 0.72)}, ${Math.round(g * 0.78)}, ${Math.round(b * 0.85)})`);
    core.style.setProperty('--dot-glow', `rgba(${r}, ${g}, ${b}, 0.9)`);
    core.style.setProperty('--dot-glow-soft', `rgba(${r}, ${g}, ${b}, 0.35)`);
  };
  paint('track-kb', 'dot-kb', s.kbColor);
  paint('track-mouse', 'dot-mouse', s.mouseColor);
}

async function boot() {
  if (window.lumoAPI) {
    applySettings(await window.lumoAPI.getSettings());

    // 演示模式：短跑道 + 快速节奏，几秒就跑完一轮，方便录到翅膀
    if (DEMO) {
      applySettings({
        kbTrackLength: 170,
        mouseTrackLength: 120,
        easeTau: 110,
        goldAfterMin: 0.15,
        yawnAfterSec: 8,
        sleepAfterMin: 45,
        kbColor: '#6ee7ff',
        mouseColor: '#ff9ec7'
      });
    }

    const saved = DEMO ? null : await window.lumoAPI.loadState();
    if (saved) {
      if (Array.isArray(saved.stars)) stars.push(...saved.stars);
      for (const key of ['kb', 'mouse']) {
        const d = DOTS[key];
        const t = saved.tracks && saved.tracks[key];
        if (!t) continue;
        d.progress = Math.min(0.999, Math.max(0, t.progress || 0));
        d.stats.events = t.events || 0;
        d.stats.gold = t.gold || 0;
        d.stats.yawns = t.yawns || 0;
        d.startedAt = t.startedAt || null;
        d.sleeping = !!t.sleeping;
      }
    }
    // 恢复位置（直接落位，不要从起点滑过来）
    for (const key of ['kb', 'mouse']) {
      const d = DOTS[key];
      const w = d.track.clientWidth - 4;
      d.x = d.progress * w;
      d.el.style.transform = `translateX(${d.x.toFixed(2)}px)`;
      d.fill.style.width = Math.max(0, d.x).toFixed(1) + 'px';
    }
  }
  requestAnimationFrame(tick);
}

// ---------- 输入 ----------
function feed(d) {
  const t = now();
  d.lastEventAt = t;
  if (!d.startedAt) d.startedAt = Date.now();
  d.sleeping = false;

  if (t - d.lastContinuousAt <= CFG.goldGapToleranceMs) {
    d.continuousMs += t - d.lastContinuousAt;
  } else {
    d.continuousMs = 0;
  }
  d.lastContinuousAt = t;
  if (d.continuousMs >= CFG.goldAfterMs) {
    d.continuousMs = 0;
    d.stats.gold++;
    triggerGold(d);
  }

  d.progress += 1 / d.trackLength;
  d.stats.events++;
  d.heat = Math.min(1, d.heat + CFG.heatPerEvent);
}

function triggerGold(d) {
  d.core.classList.add('gold');
  setTimeout(() => d.core.classList.remove('gold'), 2500);
}

// ---------- 终点：星点档案 ----------
function startFinish(d) {
  d.phase = 'hold';
  d.core.classList.remove('breathing', 'yawning');
  d.core.classList.add('holding');

  const star = {
    id: Date.now(),
    weekKey: isoWeekKey(),
    endedAt: new Date().toISOString(),
    startedAt: d.startedAt ? new Date(d.startedAt).toISOString() : null,
    track: d.id === 'dot-kb' ? 'kb' : 'mouse',
    // 两条跑道在收尾那一刻的战绩快照
    kb: { ...DOTS.kb.stats },
    mouse: { ...DOTS.mouse.stats }
  };

  setTimeout(() => {
    d.phase = 'fly';
    d.core.classList.remove('holding');
    d.core.classList.add('flying');
    setTimeout(() => {
      stars.push(star);
      d.progress = 0;
      d.x = 0;
      d.heat = 0;
      d.stats = { events: 0, gold: 0, yawns: 0 };
      d.startedAt = null;
      d.phase = 'spawn';
      d.core.classList.remove('flying');
      d.core.classList.add('spawning');
      d.fill.style.width = '0px';
      saveNow(true);
      console.log('[lumo] 收到一颗星，共', stars.length);
      setTimeout(() => {
        d.core.classList.remove('spawning');
        d.phase = 'run';
      }, 520);
    }, 1250);
  }, 1020);
}

// ---------- 模拟输入 ----------
const simState = {
  kb: { session: null, nextSessionAt: now() + rand(2000, 6000) },
  mouse: { session: null, nextSessionAt: now() + rand(3000, 8000) }
};

function simulateTick(key, dtMs) {
  const d = DOTS[key], s = simState[key], t = now();
  const isKb = key === 'kb';
  // 演示模式压缩节奏：打得更密、歇得更短
  const dur = isKb ? rand(1200, 3200) : rand(900, 2200);
  const rate = isKb ? rand(16, 26) : rand(9, 15);
  const gap = rand(1200, 3600);

  if (!s.session && t >= s.nextSessionAt) {
    s.session = { until: t + dur, rate };
  }
  if (s.session && t >= s.session.until) {
    s.session = null;
    s.nextSessionAt = t + gap;
  }
  if (s.session) {
    let ev = s.session.rate * (dtMs / 1000) + (Math.random() < 0.3 ? rand(-1, 1) : 0);
    ev = Math.max(0, Math.round(ev));
    for (let i = 0; i < ev; i++) feed(d);
  }
}

// ---------- 主循环 ----------
let lastT = now();
let lastSaveAt = now();

function tick() {
  const t = now();
  const dt = Math.min(100, t - lastT);
  lastT = t;

  for (const key of ['kb', 'mouse']) {
    const d = DOTS[key];
    if (SIMULATE && d.phase === 'run') simulateTick(key, dt);

    const idleMs = t - d.lastEventAt;

    // 沉睡：45 分钟无输入 → 结算当前会话
    if (d.phase === 'run' && !d.sleeping && d.lastEventAt && idleMs > CFG.sleepAfterMs) {
      d.sleeping = true;
      saveNow(true);
      console.log(`[lumo] ${key} 光点沉睡`);
    }

    // 呼吸 / 哈欠
    if (d.lastEventAt && idleMs > CFG.breatheAfterMs && d.phase === 'run') {
      d.core.classList.add('breathing');
      if (idleMs > CFG.yawnAfterMs) {
        if (d.nextYawnAt === Infinity) d.nextYawnAt = t + rand(...CFG.yawnEveryMs);
        if (t >= d.nextYawnAt) {
          d.nextYawnAt = t + rand(...CFG.yawnEveryMs);
          d.stats.yawns++;
          d.core.classList.add('yawning');
          setTimeout(() => d.core.classList.remove('yawning'), 1650);
        }
      }
    } else if (d.phase === 'run') {
      d.core.classList.remove('breathing', 'yawning');
      d.nextYawnAt = Infinity;
    }

    if (d.progress >= 1 && d.phase === 'run') startFinish(d);

    render(d, dt);
  }

  // 定期存盘（演示模式不落盘）
  if (!SIMULATE && t - lastSaveAt > CFG.saveEveryMs) {
    lastSaveAt = t;
    if (window.lumoAPI && (DOTS.kb.stats.events || DOTS.mouse.stats.events || dirty)) {
      window.lumoAPI.saveState(serialize());
      dirty = false;
    }
  }

  requestAnimationFrame(tick);
}

// ---------- 平滑渲染 ----------
function render(d, dt) {
  const trackW = d.track.clientWidth - 4;
  const target = d.progress * trackW;

  const k = 1 - Math.exp(-dt / CFG.easeTau);
  d.x += (target - d.x) * k;

  if (d.phase === 'run') {
    d.el.style.transform = `translateX(${d.x.toFixed(2)}px)`;
    d.fill.style.width = Math.max(0, d.x).toFixed(1) + 'px';
  }

  d.heat *= Math.exp(-dt / CFG.heatDecayTau);
  const h = d.heat;
  d.tail.style.opacity = (h * 0.85).toFixed(2);
  d.tail.style.transform = `scaleX(${(0.5 + h * 1.3).toFixed(2)})`;
  if (d.phase === 'run' && !d.core.classList.contains('breathing')
      && !d.core.classList.contains('yawning')) {
    d.core.style.transform = `scale(${(1 + h * 0.18).toFixed(3)})`;
  }
}

// ---------- 接入真实输入 ----------
if (window.lumoAPI && !SIMULATE) {
  let firstInput = false;
  window.lumoAPI.onInput(({ kb, mouse }) => {
    if (!firstInput) { firstInput = true; maybeFridayHint(); }
    for (let i = 0; i < kb; i++) feed(DOTS.kb);
    for (let i = 0; i < mouse; i++) feed(DOTS.mouse);
  });

  // 设置热更新
  window.lumoAPI.onSettings((s) => applySettings(s));

  // 设置面板里点了"清零跑道"
  window.lumoAPI.onResetTrack(() => {
    for (const key of ['kb', 'mouse']) resetDot(DOTS[key]);
    saveNow(true);
  });

  // 周报开箱：本周结算成一颗"周星"，跑道回到起点
  window.lumoAPI.onClaimRequest(() => {
    const wk = isoWeekKey();
    const existing = stars.find((s) => s.type === 'week' && s.weekKey === wk);
    if (existing) {
      window.lumoAPI.sendClaimed(existing);
      return;
    }

    const prior = stars.filter((s) => s.weekKey === wk && s.type !== 'week');
    const agg = (fn) => prior.reduce((a, s) => a + fn(s), 0);

    const star = {
      id: Date.now(),
      type: 'week',
      weekKey: wk,
      endedAt: new Date().toISOString(),
      startedAt: null,
      track: 'week',
      kb: {
        events: agg((s) => s.kb?.events || 0) + DOTS.kb.stats.events,
        gold: agg((s) => s.kb?.gold || 0) + DOTS.kb.stats.gold,
        yawns: agg((s) => s.kb?.yawns || 0) + DOTS.kb.stats.yawns
      },
      mouse: {
        events: agg((s) => s.mouse?.events || 0) + DOTS.mouse.stats.events,
        gold: agg((s) => s.mouse?.gold || 0) + DOTS.mouse.stats.gold,
        yawns: agg((s) => s.mouse?.yawns || 0) + DOTS.mouse.stats.yawns
      }
    };

    stars.push(star);
    for (const key of ['kb', 'mouse']) resetDot(DOTS[key]);
    saveNow(true);
    console.log('[lumo] 本周已结算，收下一颗周星');
    window.lumoAPI.sendClaimed(star);
  });
}

function resetDot(d) {
  d.progress = 0;
  d.x = 0;
  d.heat = 0;
  d.stats = { events: 0, gold: 0, yawns: 0 };
  d.startedAt = null;
  d.sleeping = false;
  d.fill.style.width = '0px';
  d.el.style.transform = 'translateX(0px)';
}

// ---------- 周五开箱提示：光点旁边浮一个"？" ----------
let fridayHintShown = false;
function maybeFridayHint() {
  if (fridayHintShown) return;
  if (new Date().getDay() !== 5) return;
  const wk = isoWeekKey();
  if (stars.some((s) => s.type === 'week' && s.weekKey === wk)) return;

  fridayHintShown = true;
  const el = document.createElement('div');
  el.className = 'hint-mark';
  el.textContent = '?';
  el.style.left = (DOTS.kb.x + 14).toFixed(0) + 'px';
  document.getElementById('stage').appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 700);
  }, 7000);
}

DOTS.kb.lastEventAt = DOTS.mouse.lastEventAt = 0;
boot();
