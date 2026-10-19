/* =========================================================
 * storage.js —— 本地持久化（localStorage）
 * 结构：{ arrangements 课程安排, colors 课程->配色序号,
 *         activities 活动, log 提醒记录, announced 已预告,
 *         weekOverride 查看的周 }
 * ========================================================= */

var STORAGE_KEY = 'ksb_state_v4'; // v4：课表逐节显示（第 1-12 节 + 晚自习），新增内置晚自习

// HTML 转义，防止课程名里的特殊字符破坏页面
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// 首次使用时，用 DEFAULT_COURSES 生成初始数据
// 一条课程可跨多个大节（如 5-10节），这里按大节拆成多条安排
function defaultState() {
  var arrangements = [];
  DEFAULT_COURSES.forEach(function (c, i) {
    var wk = parseWeekSpec(c.weekSpec);
    if (!wk) return;
    var periods = parsePeriodList(c.periodSpec);
    periods.forEach(function (p, j) {
      arrangements.push({
        id: 'd' + i + '_' + j,
        name: c.name,
        teacher: c.teacher || '',
        location: c.location || '',
        day: c.day,
        period: p,
        weekList: wk.list,                 // 实际上课周次（权威）
        weekText: wk.text,                 // 显示用文本
        startWeek: wk.list[0],             // 兼容字段：最小周
        endWeek: wk.list[wk.list.length - 1],
        note: c.note || '',
        type: c.type || 'normal'
      });
    });
  });
  // 给每门课程顺序分配一种颜色，保证不同课程颜色不同
  var colors = {}, usedIdx = [];
  arrangements.forEach(function (a) {
    if (!(a.name in colors)) {
      var idx;
      for (var i = 0; i < PALETTE.length; i++) {
        if (usedIdx.indexOf(i) === -1) { idx = i; break; }
      }
      if (idx === undefined) idx = (a.name.length * 31) % PALETTE.length;
      colors[a.name] = idx;
      usedIdx.push(idx);
    }
  });
  return {
    arrangements: arrangements,
    colors: colors,
    activities: [],
    log: [],
    announced: {},
    weekOverride: null,
    makeup: {},                      // 调休补课：{ '2026-10-10': 3 } 表示该日按周三课表上课
    // 调休上课日清单（内置自官方通知，可逐条删除）
    makeupDays: MAKEUP_DAYS.map(function (m) { return { date: m.date, name: m.name }; }),
    sound: 'dingdong',               // 提醒音效 id，见 data.js 的 SOUNDS
    ring: 'once'                     // 响铃时长 id，见 data.js 的 RING_PRESETS
  };
}

// 读取状态；没有或损坏时回退到默认
function loadState() {
  try {
    var raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      var s = JSON.parse(raw);
      if (s && Array.isArray(s.arrangements)) {
        if (!s.colors) s.colors = {};
        if (!s.activities) s.activities = [];
        if (!s.log) s.log = [];
        if (!s.announced) s.announced = {};
        if (!s.makeup) s.makeup = {};
        // 老数据补上调休日清单（空数组也保留，避免用户删光后被重新塞回）
        if (!s.makeupDays) {
          s.makeupDays = MAKEUP_DAYS.map(function (m) { return { date: m.date, name: m.name }; });
        }
        if (!s.sound) s.sound = 'dingdong';
        if (!s.ring) s.ring = 'once';
        return s;
      }
    }
  } catch (e) { /* 数据损坏则重建 */ }
  var st = defaultState();
  saveState(st);
  return st;
}

function saveState(state) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) {}
}
