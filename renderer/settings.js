const DEFAULTS = {
  kbTrackLength: 2500,
  mouseTrackLength: 1500,
  easeTau: 110,
  goldAfterMin: 3,
  yawnAfterSec: 60,
  sleepAfterMin: 45,
  kbColor: '#6ee7ff',
  mouseColor: '#ff9ec7'
};

const FMT = {
  kbTrackLength: (v) => `${Number(v).toLocaleString('zh-CN')} 击键`,
  mouseTrackLength: (v) => `${Number(v).toLocaleString('zh-CN')} 次`,
  easeTau: (v) => `${v} ms`,
  goldAfterMin: (v) => `${Number(v).toFixed(1)} 分钟`,
  yawnAfterSec: (v) => `${v} 秒`,
  sleepAfterMin: (v) => `${v} 分钟`
};

const RANGE_IDS = Object.keys(FMT);
const COLOR_IDS = ['kbColor', 'mouseColor'];

const $ = (id) => document.getElementById(id);

function setField(id, value) {
  const el = $(id);
  if (!el) return;
  el.value = value;
  if (FMT[id]) $(id + '_out').textContent = FMT[id](value);
  if (COLOR_IDS.includes(id)) $(id + '_hex').textContent = String(value).toUpperCase();
}

function fillForm(s) {
  for (const id of RANGE_IDS) setField(id, s[id]);
  for (const id of COLOR_IDS) setField(id, s[id]);
}

function readForm() {
  const s = {};
  for (const id of RANGE_IDS) s[id] = Number($(id).value);
  for (const id of COLOR_IDS) s[id] = $(id).value;
  return s;
}

function toast(text = '已保存') {
  const t = $('toast');
  t.textContent = text;
  t.classList.add('show');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show'), 1400);
}

// 初始化
(async () => {
  const saved = window.lumoAPI ? await window.lumoAPI.getSettings() : DEFAULTS;
  fillForm({ ...DEFAULTS, ...saved });

  // 实时刷新读数
  for (const id of RANGE_IDS) {
    $(id).addEventListener('input', (e) => setField(id, e.target.value));
  }
  for (const id of COLOR_IDS) {
    $(id).addEventListener('input', (e) => setField(id, e.target.value));
  }

  $('save').addEventListener('click', () => {
    const s = readForm();
    if (window.lumoAPI) window.lumoAPI.saveSettings(s);
    toast('已保存并应用');
  });

  $('defaults').addEventListener('click', () => {
    fillForm(DEFAULTS);
    toast('已恢复默认，记得保存');
  });

  $('resetTrack').addEventListener('click', () => {
    if (!confirm('确定把两条跑道的进度清零？已收藏的星点不受影响。')) return;
    if (window.lumoAPI) window.lumoAPI.resetTrack();
    toast('跑道已清零');
  });

  $('close').addEventListener('click', () => window.close());

  // 开机自启开关（默认关闭，状态以系统实际设置回显）
  const sw = $('autostart');
  const paintSwitch = (on) => sw.setAttribute('aria-checked', on ? 'true' : 'false');
  if (window.lumoAPI) {
    paintSwitch(await window.lumoAPI.getAutostart());
    sw.addEventListener('click', async () => {
      const next = sw.getAttribute('aria-checked') !== 'true';
      const actual = await window.lumoAPI.setAutostart(next);
      paintSwitch(actual);
      toast(actual ? '已开启开机自启' : '已关闭开机自启');
    });
  }

  if (window.lumoAPI) {
    window.lumoAPI.onSettings((s) => fillForm({ ...DEFAULTS, ...s }));
  }
})();
