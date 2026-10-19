/* =========================================================
 * clock.js —— 实时时钟、周次计算（1-18 教学周 / 19-20 考试周）
 * ========================================================= */

function pad2(n) { return String(n).padStart(2, '0'); }

// "08:00" -> 480（分钟数），用于上课预告的时间比较
function toMin(hm) {
  var p = hm.split(':');
  return Number(p[0]) * 60 + Number(p[1]);
}

function todayStr(d) {
  d = d || new Date();
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
}

function fmtHM(d) { return pad2(d.getHours()) + ':' + pad2(d.getMinutes()); }

// datetime-local 值 / Date -> "10月15日 14:30"
function fmtMDHM(v) {
  var d = new Date(v);
  if (isNaN(d.getTime())) return String(v);
  return (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + fmtHM(d);
}

// datetime-local 输入框默认值（本地时间格式）
function toLocalInput(d) {
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) +
         'T' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
}

// 学期第 1 周周一日期：统一取 data.js 里的 SEMESTER_START
function getSemesterStart() {
  return SEMESTER_START;
}

/* ---------- 节假日 / 调休 ---------- */

// 学期第 week 周、星期 day（1=周一 … 7=周日）对应的日期
function dateOfCell(week, day) {
  var start = new Date(getSemesterStart() + 'T00:00:00');
  var d = new Date(start.getTime() + ((week - 1) * 7 + (day - 1)) * 86400000);
  d.setHours(0, 0, 0, 0);
  return d;
}

// 日期 "YYYY-MM-DD" 落在哪个假期里，返回假期对象（含 name）或 null
function holidayOf(dateStr) {
  for (var i = 0; i < HOLIDAYS.length; i++) {
    if (dateStr >= HOLIDAYS[i].start && dateStr <= HOLIDAYS[i].end) return HOLIDAYS[i];
  }
  return null;
}

// 是否为调休上课日（以可编辑的调休日清单为准）
function isMakeupDay(dateStr) {
  var list = (state && state.makeupDays) ? state.makeupDays : MAKEUP_DAYS;
  return list.some(function (x) { return x.date === dateStr; });
}

// 调休日实际按星期几的课表上课；未指定返回 null
function makeupDayOf(dateStr) {
  if (state && state.makeup && state.makeup[dateStr]) return state.makeup[dateStr];
  return null;
}

// 某天实际上按哪一天的课表显示：0 = 放假，1-7 = 对应星期
function effectiveDayOf(dateStr, naturalDay) {
  if (holidayOf(dateStr)) return 0;
  var m = makeupDayOf(dateStr);
  return m || naturalDay;
}

// 日期 "YYYY-MM-DD" 对应的星期（1=周一 … 7=周日）
function weekdayOfDateStr(dateStr) {
  var d = new Date(dateStr + 'T00:00:00').getDay();
  return d === 0 ? 7 : d;
}

// 日期 "YYYY-MM-DD" 落在第几周；不在学期（20 周）范围内返回 null
function weekOfDateStr(dateStr) {
  var start = new Date(getSemesterStart() + 'T00:00:00');
  var d = new Date(dateStr + 'T00:00:00');
  if (isNaN(d.getTime())) return null;
  var diff = Math.round((d - start) / 86400000);
  if (diff < 0) return null;
  var w = Math.floor(diff / 7) + 1;
  return w > TOTAL_WEEKS ? null : w;
}

// "2026-10-21" -> "10月21日 周三"
function fmtDateLabel(dateStr) {
  var d = new Date(dateStr + 'T00:00:00');
  if (isNaN(d.getTime())) return dateStr;
  return (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + WEEKDAY_NAMES[weekdayOfDateStr(dateStr) - 1];
}

// 计算今天是第几周：status = before(未开学) / in(学期中) / after(已结束)
function calcRealWeek() {
  var start = new Date(getSemesterStart() + 'T00:00:00');
  var now = new Date();
  now.setHours(0, 0, 0, 0);
  var diff = Math.round((now - start) / 86400000);
  if (diff < 0) return { week: 1, status: 'before' };
  var w = Math.floor(diff / 7) + 1;
  if (w > TOTAL_WEEKS) return { week: TOTAL_WEEKS, status: 'after' };
  return { week: w, status: 'in' };
}

function weekLabel(w) {
  return EXAM_WEEKS.indexOf(w) >= 0 ? '考试周' : '教学周';
}

// 每秒刷新头部时钟 + 下节课预告
function updateClock() {
  var el = document.getElementById('clockTime');
  if (!el) return;
  var d = new Date();
  el.textContent = fmtHM(d) + ':' + pad2(d.getSeconds());
  document.getElementById('clockDate').textContent =
    d.getFullYear() + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '日 · 星期' + '日一二三四五六'.charAt(d.getDay());
  var r = calcRealWeek();
  var wEl = document.getElementById('clockWeek');
  if (r.status === 'before') {
    wEl.textContent = '学期未开始 · 暂显示第 1 周';
    wEl.classList.remove('exam');
  } else if (r.status === 'after') {
    wEl.textContent = '本学期已结束（假期）';
    wEl.classList.remove('exam');
  } else {
    wEl.textContent = '第 ' + r.week + ' 周 · ' + weekLabel(r.week);
    wEl.classList.toggle('exam', EXAM_WEEKS.indexOf(r.week) >= 0);
  }

  renderNextClass();
}

/* ---------- 下节课预告：顶部常驻倒计时 ---------- */

// 某周某天需要上的课，按大节合并（同一大节的多门课合并展示）
function classesOnDay(week, day) {
  var groups = [];
  state.arrangements.forEach(function (a) {
    if (a.day !== day) return;
    if (weeksOf(a).indexOf(week) < 0) return;
    var p = PERIODS[a.period - 1];
    if (!p) return;
    var g = null;
    for (var i = 0; i < groups.length; i++) {
      if (groups[i].period === a.period) g = groups[i];
    }
    if (!g) { g = { period: a.period, p: p, names: [], locs: [] }; groups.push(g); }
    if (g.names.indexOf(a.name) < 0) g.names.push(a.name);
    if (a.location && g.locs.indexOf(a.location) < 0) g.locs.push(a.location);
  });
  groups.sort(function (x, y) { return toMin(x.p.start) - toMin(y.p.start); });
  return groups;
}

// 剩余时长文案
function fmtRemain(sec) {
  if (sec < 0) sec = 0;
  if (sec < 60) return { t: String(sec), u: '秒' };
  var m = Math.floor(sec / 60);
  if (m < 60) return { t: String(m), u: '分钟' };
  var h = Math.floor(m / 60), mm = m % 60;
  return { t: h + (mm ? ':' + pad2(mm) : ''), u: '小时' };
}

// 汇总"下节课"状态
function nextClassInfo() {
  var now = new Date();
  var today = todayStr(now);
  var hd = holidayOf(today);
  if (hd) return { kind: 'holiday', name: hd.name };

  var r = calcRealWeek();
  if (r.status === 'before') return { kind: 'before' };
  if (r.status === 'after') return { kind: 'after' };

  var jsDay = now.getDay();
  var effDay = effectiveDayOf(today, jsDay === 0 ? 7 : jsDay);
  var groups = classesOnDay(r.week, effDay);

  var nowSec = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
  var cur = null, next = null;
  groups.forEach(function (g) {
    var s = toMin(g.p.start) * 60, e = toMin(g.p.end) * 60;
    if (nowSec >= s && nowSec < e) cur = { g: g, s: s, e: e };
    else if (s > nowSec && !next) next = { g: g, s: s, e: e };
  });

  return {
    kind: 'ok', week: r.week, day: effDay, groups: groups,
    cur: cur, next: next, nowSec: nowSec, makeup: makeupDayOf(today)
  };
}

function renderNextClass() {
  var bar = document.getElementById('nextClass');
  if (!bar) return;
  var n = nextClassInfo();
  var tone = 'next-class', html = '';
  var tag = '';

  if (n.kind === 'holiday') {
    tone += ' holi';
    html = '<span class="nc-ico">🎉</span>' +
           '<span><span class="nc-main">' + esc(n.name) + ' 放假</span>' +
           '<span class="nc-meta">今天不上课，好好休息</span></span>';
  } else if (n.kind === 'before') {
    tone += ' rest';
    html = '<span class="nc-ico">🌱</span>' +
           '<span><span class="nc-main">学期还没开始</span>' +
           '<span class="nc-meta">' + getSemesterStart() + ' 开学，可先浏览课表</span></span>';
  } else if (n.kind === 'after') {
    tone += ' rest';
    html = '<span class="nc-ico">🏖</span>' +
           '<span><span class="nc-main">本学期已结束</span>' +
           '<span class="nc-meta">祝假期愉快</span></span>';
  } else {
    var total = n.groups.length;
    if (n.makeup) tag = '<span class="nc-tag">调休·按' + WEEKDAY_NAMES[n.makeup - 1] + '上课</span>';

    if (n.cur) {
      // 正在上课
      var left = n.cur.e - n.nowSec;
      var pct = Math.max(0, Math.min(100, (n.nowSec - n.cur.s) / (n.cur.e - n.cur.s) * 100));
      tone += ' live';
      var rem = fmtRemain(left);
      html = '<span class="nc-ico">📖</span>' +
             '<span class="nc-txt"><span class="nc-main">正在上课：' + esc(n.cur.g.names.join(' / ')) + '</span>' +
             '<span class="nc-meta">' + n.cur.g.p.label + ' ' + n.cur.g.p.start + '–' + n.cur.g.p.end +
             (n.cur.g.locs.length ? ' · ' + esc(n.cur.g.locs.join(' / ')) : '') + ' ' + tag + '</span></span>' +
             '<span class="nc-count">还剩 <span class="nc-big">' + rem.t + '</span> ' + rem.u + '下课</span>' +
             '<span class="nc-bar"><i style="width:' + pct.toFixed(1) + '%"></i></span>';
    } else if (n.next) {
      // 下节课
      var wait = n.next.s - n.nowSec;
      tone += wait <= CLASS_NOTICE_LEAD_MIN * 60 ? ' soon' : '';
      var rem2 = fmtRemain(wait);
      html = '<span class="nc-ico">' + (wait <= CLASS_NOTICE_LEAD_MIN * 60 ? '⏰' : '🔔') + '</span>' +
             '<span class="nc-txt"><span class="nc-main">下节课：' + esc(n.next.g.names.join(' / ')) + '</span>' +
             '<span class="nc-meta">' + n.next.g.p.label + ' ' + n.next.g.p.start + '–' + n.next.g.p.end +
             (n.next.g.locs.length ? ' · ' + esc(n.next.g.locs.join(' / ')) : '') + ' ' + tag + '</span></span>' +
             '<span class="nc-count">' + (wait <= 60 ? '马上上课' : '还有 <span class="nc-big">' + rem2.t + '</span> ' + rem2.u) + '</span>';
    } else if (total) {
      tone += ' rest';
      html = '<span class="nc-ico">✅</span>' +
             '<span class="nc-txt"><span class="nc-main">今天的课已全部结束</span>' +
             '<span class="nc-meta">今天共 ' + total + ' 节课 ' + tag + '</span></span>';
    } else {
      tone += ' rest';
      html = '<span class="nc-ico">☕</span>' +
             '<span class="nc-txt"><span class="nc-main">今天没有课</span>' +
             '<span class="nc-meta">' + tag + '好好休息</span></span>';
    }
  }

  bar.className = tone;
  bar.innerHTML = html;
}
