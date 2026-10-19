/* =========================================================
 * schedule.js —— 课表渲染、添加课程、冲突检测、课程清单
 * ========================================================= */

var activeDay = null; // 手机端当前查看的一天：null=全部，1-7=周一~周日

// 当前查看的周次（null 表示跟随真实周）
function currentViewWeek() {
  return state.weekOverride || calcRealWeek().week;
}

// 给新课程分配颜色：优先取未被占用的颜色，用尽则按名字哈希
function assignColor(name) {
  if (name in state.colors) return state.colors[name];
  var used = Object.keys(state.colors).map(function (k) { return state.colors[k]; });
  var idx;
  for (var i = 0; i < PALETTE.length; i++) {
    if (used.indexOf(i) === -1) { idx = i; break; }
  }
  if (idx === undefined) idx = (name.length * 31) % PALETTE.length;
  state.colors[name] = idx;
  saveState(state);
  return idx;
}

function colorOf(name) { return PALETTE[assignColor(name)]; }
function iconOf(name) { return COURSE_ICONS[state.colors[name] % COURSE_ICONS.length]; }

/* ---------- 周次辅助：同一课程可能只在部分周上课（含单双周） ---------- */

// 取一条安排实际上课的周次数组（兼容旧的 startWeek/endWeek 数据）
function weeksOf(a) {
  if (a.weekList && a.weekList.length) return a.weekList;
  var out = [];
  for (var w = a.startWeek; w <= a.endWeek; w++) out.push(w);
  return out;
}

// 周次显示文本
function weekTextOf(a) {
  return a.weekText || ('第 ' + a.startWeek + '-' + a.endWeek + ' 周');
}

// 两条安排的上课周次是否有重叠
function weeksOverlap(a, b) {
  var wa = weeksOf(a), wb = weeksOf(b);
  return wa.some(function (w) { return wb.indexOf(w) >= 0; });
}

/* ---------- 周次切换（上一周 / 下一周 / 选择周次 / 回到本周） ---------- */

function renderWeekChips() {
  var real = calcRealWeek();
  var cur = currentViewWeek();

  // 中间：第 N 周 + 进度条 + N / 20 周
  var pick = document.getElementById('weekPick');
  if (pick && pick.options.length !== TOTAL_WEEKS) {
    var opts = '';
    for (var w = 1; w <= TOTAL_WEEKS; w++) {
      opts += '<option value="' + w + '">第 ' + w + ' 周</option>';
    }
    pick.innerHTML = opts;
  }
  if (pick) pick.value = cur;
  var bar = document.getElementById('weekBar');
  if (bar) bar.style.width = (cur / TOTAL_WEEKS * 100) + '%';
  var hint = document.getElementById('weekHint');
  if (hint) hint.textContent = cur + ' / ' + TOTAL_WEEKS + ' 周' + (cur === real.week && real.status === 'in' ? ' · 本周' : '');

  // 两端禁用箭头
  var prev = document.getElementById('weekPrev'), next = document.getElementById('weekNext');
  if (prev) prev.disabled = cur <= 1;
  if (next) next.disabled = cur >= TOTAL_WEEKS;

  // 左侧占位宽度 = 「本周」按钮宽度，使中间标题相对卡片居中
  var nav = document.querySelector('.weeknav'), nowBtn = document.getElementById('jumpThisWeek');
  if (nav && nowBtn) nav.style.setProperty('--now-w', (nowBtn.offsetWidth || 47) + 'px');

  var note = document.getElementById('weekNote');
  var parts = [];
  var hcur = holidaysInWeek(cur);
  var hnames = [];
  hcur.forEach(function (x) { if (hnames.indexOf(x.name) < 0) hnames.push(x.name); });
  if (hnames.length) parts.push('🎉 第 ' + cur + ' 周含' + hnames.join('、') + '假期，放假当天不上课');
  if (EXAM_WEEKS.indexOf(cur) >= 0) {
    parts.push('📌 第 ' + cur + ' 周为考试周，以下为考试安排，祝考试顺利！');
  } else if (real.status === 'before') {
    parts.push('学期 ' + getSemesterStart() + ' 开始，当前可先浏览或编辑课表。');
  } else if (real.status === 'after') {
    parts.push('本学期 20 周已全部结束，祝假期愉快！');
  }
  note.textContent = parts.join('　');
}

// 切换查看的周次（越界不生效）
function setViewWeek(w) {
  var n = Math.min(TOTAL_WEEKS, Math.max(1, Number(w) || 1));
  state.weekOverride = n;
  saveState(state);
  renderAll();
}

/* ---------- 手机端日期片 ---------- */

function renderDayChips() {
  var box = document.getElementById('dayChips');
  var html = '<button class="dchip' + (activeDay === null ? ' active' : '') + '" data-day="0">全部</button>';
  for (var d = 1; d <= WEEKDAY_NAMES.length; d++) {
    html += '<button class="dchip' + (activeDay === d ? ' active' : '') + '" data-day="' + d + '">' + WEEKDAY_NAMES[d - 1] + '</button>';
  }
  box.innerHTML = html;
}

/* ---------- 课表网格 ---------- */

function cellHtml(a) {
  var c = colorOf(a.name);
  var exam = a.type === 'exam';
  return '<div class="course c-click' + (exam ? ' exam' : '') + '" data-cid="' + a.id + '"' +
           ' style="--c:' + c.main + ';--cl:' + c.light + '"' +
           (a.note ? ' title="' + esc(a.note) + '"' : '') + '>' +
           '<div class="c-name">' + (exam ? '📝' : iconOf(a.name)) + ' ' + esc(a.name) + '</div>' +
           '<div class="c-meta">' + esc(a.teacher || '') + (a.teacher && a.location ? ' · ' : '') + esc(a.location || '') + '</div>' +
           '<div class="c-weeks">' + esc(weekTextOf(a)) + (exam ? ' · 考试' : '') + '</div>' +
         '</div>';
}

// 某一周内包含的法定节假日
function holidaysInWeek(w) {
  var out = [];
  for (var d = 1; d <= WEEKDAY_NAMES.length; d++) {
    var ds = todayStr(dateOfCell(w, d));
    var h = holidayOf(ds);
    if (h) out.push({ date: ds, name: h.name });
  }
  return out;
}

function renderGrid() {
  var grid = document.getElementById('schedule');
  var wk = currentViewWeek();
  var today = todayStr();
  var html = '';

  // 左侧时间列：第 1-12 节 + 晚自习，逐节显示
  html += '<div class="col col-time"><div class="col-head">节次</div>';
  PERIODS.forEach(function (p) {
    html += '<div class="cell time-cell"><b>' + p.label + '</b><span class="tm">' + p.start + ' - ' + p.end + '</span></div>';
  });
  html += '</div>';

  // 周一 ~ 周日
  for (var d = 1; d <= WEEKDAY_NAMES.length; d++) {
    var dateStr = todayStr(dateOfCell(wk, d));
    var hd = holidayOf(dateStr);                       // 法定节假日
    var mkDay = makeupDayOf(dateStr);                  // 调休补课的星期（未指定为 null）
    var isMk = !hd && isMakeupDay(dateStr);            // 调休上课日
    var eff = effectiveDayOf(dateStr, d);              // 实际按哪天的课表显示；0 = 放假

    var headCls = 'col-head' + (hd ? ' holi' : '') + (isMk ? ' makeup' : '');
    var extra = '';
    if (dateStr === today) extra += ' <span class="today-badge">今天</span>';
    if (hd) extra += ' <span class="holi-tag">' + esc(hd.name) + '</span>';
    if (isMk) extra += ' <span class="mk-tag">调休' + (mkDay ? '补' + WEEKDAY_NAMES[mkDay - 1] : '') + '</span>';

    html += '<div class="col col-day' + (activeDay === d ? ' active' : '') + '" data-day="' + d + '">' +
            '<div class="' + headCls + '">' + WEEKDAY_NAMES[d - 1] + extra + '</div>';

    if (hd) {
      // 节假日：整天放假，不排课
      html += '<div class="cell holiday-cell">' +
              '<span class="holi-ico">🎉</span><b>' + esc(hd.name) + '</b>' +
              '<span class="holi-sub">' + dateStr.slice(5).replace('-', '/') + ' 放假</span></div>';
    } else {
      for (var pi = 0; pi < PERIODS.length; pi++) {
        var p = PERIODS[pi];
        var items = state.arrangements.filter(function (a) {
          return a.day === eff && a.period === p.no && weeksOf(a).indexOf(wk) >= 0;
        });
        if (items.length === 0) {
          html += '<div class="cell empty-cell"><button class="add-in-cell" data-day="' + d + '" data-period="' + p.no + '" title="在此时段添加课程">＋</button></div>';
        } else {
          html += '<div class="cell">' + items.map(cellHtml).join('') + '</div>';
        }
      }
    }
    html += '</div>';
  }

  grid.innerHTML = html;
  grid.classList.toggle('only-day', !!activeDay);
}

/* ---------- 搜索查找：按课程名 / 教师 / 地点筛选，点击结果定位到课表 ---------- */

// 单条搜索结果的行标记（课程名 / 教师 / 地点 + 星期节次时间周次）
// preferWeek 为按日期搜索时的目标周次，点击后直接跳到该周
function srRowHtml(a, preferWeek) {
  var p = PERIODS[a.period - 1];
  var c = colorOf(a.name);
  return '<div class="sr-row" data-cid="' + a.id + '"' + (preferWeek ? ' data-week="' + preferWeek + '"' : '') + ' style="--c:' + c.main + '">' +
           '<span class="sr-name">' + esc(a.name) + '</span>' +
           '<span class="sr-meta">' + WEEKDAY_NAMES[a.day - 1] + ' ' + p.label + ' ' + p.start + '–' + p.end +
             ' · ' + esc(weekTextOf(a)) +
             (a.teacher ? ' · ' + esc(a.teacher) : '') +
             ' · ' + esc(a.location || '地点待定') + '</span>' +
         '</div>';
}

function renderSearch() {
  var box = document.getElementById('searchResult');
  if (!box) return;
  var q = (document.getElementById('searchInput').value || '').trim().toLowerCase();
  if (!q) { box.innerHTML = ''; return; }

  var hits = state.arrangements.filter(function (a) {
    return (a.name || '').toLowerCase().indexOf(q) >= 0 ||
           (a.teacher || '').toLowerCase().indexOf(q) >= 0 ||
           (a.location || '').toLowerCase().indexOf(q) >= 0;
  });
  hits.sort(function (x, y) {
    return x.day - y.day || x.period - y.period || x.name.localeCompare(y.name);
  });

  if (!hits.length) {
    box.innerHTML = '<p class="empty-tip">没有找到匹配的课程，试试课程名、教师或地点的关键词。</p>';
    return;
  }

  var html = '<div class="sr-count">共 ' + hits.length + ' 条结果，点击可直接定位到课表</div>';
  hits.forEach(function (a) { html += srRowHtml(a); });
  box.innerHTML = html;
}

/* ---------- 按日期查课程：选一个日期，列出当天实际要上的课 ---------- */

function renderDateSearch(dateStr) {
  var box = document.getElementById('searchResult');
  if (!box || !dateStr) return;

  var w = weekOfDateStr(dateStr);
  if (!w) {
    box.innerHTML = '<p class="empty-tip">' + fmtDateLabel(dateStr) + ' 不在本学期范围内（' +
      getSemesterStart() + ' 起共 ' + TOTAL_WEEKS + ' 周）。</p>';
    return;
  }

  var hd = holidayOf(dateStr);
  if (hd) {
    box.innerHTML = '<p class="empty-tip">🎉 ' + fmtDateLabel(dateStr) + ' 是' + esc(hd.name) +
      '，当天不上课，好好休息。</p>';
    return;
  }

  var natural = weekdayOfDateStr(dateStr);
  var day = effectiveDayOf(dateStr, natural);
  var mk = makeupDayOf(dateStr);

  var hits = state.arrangements.filter(function (a) {
    return a.day === day && weeksOf(a).indexOf(w) >= 0;
  });
  hits.sort(function (x, y) { return x.period - y.period || x.name.localeCompare(y.name); });

  var head = '<div class="sr-count">' + fmtDateLabel(dateStr) + ' · 第 ' + w + ' 周' +
    (mk ? '（调休 · 按' + WEEKDAY_NAMES[mk - 1] + '上课）' : '') +
    ' · 共 ' + hits.length + ' 节课</div>';

  if (!hits.length) {
    box.innerHTML = head + '<p class="empty-tip">当天没有课，好好休息。</p>';
    return;
  }
  var html = head;
  hits.forEach(function (a) { html += srRowHtml(a, w); });
  box.innerHTML = html;
}

// 点击搜索结果：切到该课所在的周 / 日期，并闪烁标记对应格子
function locateCourse(id, preferWeek) {
  var a = state.arrangements.find(function (x) { return x.id === id; });
  if (!a) return;

  // 目标周次：按日期搜索时优先跳到所查日期所在的周；否则若当前周没有这节课，跳到它的起始周
  var ws = weeksOf(a);
  var target = null;
  if (preferWeek && ws.indexOf(Number(preferWeek)) >= 0) target = Number(preferWeek);
  else if (ws.indexOf(currentViewWeek()) < 0) target = ws[0];
  if (target !== null && target !== currentViewWeek()) {
    state.weekOverride = target;
    saveState(state);
    renderAll();
  }
  if (activeDay !== null && activeDay !== a.day) {
    activeDay = a.day;
    renderDayChips();
    renderGrid();
  }

  var el = document.querySelector('.course[data-cid="' + id + '"]');
  if (!el) return;
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  el.classList.add('flash');
  setTimeout(function () { el.classList.remove('flash'); }, 1800);
}

/* ---------- 课表弹窗：新建 / 编辑 / 删除某一条课程安排 ---------- */

var cmId = null;   // 弹窗正在编辑的安排 id；null 表示「新建课程」
var cmNew = false; // 是否处于新建模式

// 填充下拉框：items = [{v:值, t:文本}]
function fillSelect(el, items, val) {
  el.innerHTML = items.map(function (it) {
    return '<option value="' + it.v + '">' + esc(it.t) + '</option>';
  }).join('');
  el.value = String(val);
}

// 星期 / 节次 / 起止周 四个下拉的统一填充
function fillModalSelects(day, period, sw, ew) {
  fillSelect(document.getElementById('cmDay'),
    WEEKDAY_NAMES.map(function (n, i) { return { v: i + 1, t: n }; }), day);
  fillSelect(document.getElementById('cmPeriod'),
    PERIODS.map(function (p) { return { v: p.no, t: p.label + '（' + p.start + '）' }; }), period);
  var weeks = [];
  for (var w = 1; w <= TOTAL_WEEKS; w++) weeks.push({ v: w, t: '第 ' + w + ' 周' });
  fillSelect(document.getElementById('cmStartWeek'), weeks, sw);
  fillSelect(document.getElementById('cmEndWeek'), weeks, ew);
}

function setCmTitle(text) {
  document.getElementById('cmTitle').textContent = text;
}

function cmClearMsg() {
  var m = document.getElementById('cmMsg');
  m.textContent = '';
  m.className = 'form-msg';
}

// 点击空格子「＋」：直接弹出「新建课程」窗口，星期 / 节次按所点格子预填
function openNewCourseModal(day, period) {
  cmId = null;
  cmNew = true;
  fillModalSelects(day, period, 1, TOTAL_WEEKS);
  setCmTitle('➕ 新建课程');
  document.getElementById('cmName').value = '';
  document.getElementById('cmTeacher').value = '';
  document.getElementById('cmLocation').value = '';
  document.getElementById('cmType').value = 'normal';
  document.getElementById('cmDelete').style.display = 'none'; // 新建时没有可删除的对象
  cmClearMsg();
  document.getElementById('courseModal').classList.add('show');
  document.getElementById('cmName').focus();
}

// 点击已有课程块：编辑
function openCourseModal(id) {
  var a = state.arrangements.find(function (x) { return x.id === id; });
  if (!a) return;
  cmId = id;
  cmNew = false;

  fillModalSelects(a.day, a.period, a.startWeek, a.endWeek);

  setCmTitle(iconOf(a.name) + ' ' + a.name);
  document.getElementById('cmName').value = a.name;
  document.getElementById('cmTeacher').value = a.teacher || '';
  document.getElementById('cmLocation').value = a.location || '';
  document.getElementById('cmType').value = a.type === 'exam' ? 'exam' : 'normal';
  document.getElementById('cmDelete').style.display = '';
  cmClearMsg();
  document.getElementById('courseModal').classList.add('show');
}

function closeCourseModal() {
  var box = document.getElementById('courseModal');
  if (box) box.classList.remove('show');
  cmId = null;
  cmNew = false;
}

function cmMsg(text) {
  var m = document.getElementById('cmMsg');
  m.textContent = text;
  m.className = 'form-msg err';
}

function saveCourseModal() {
  var name = document.getElementById('cmName').value.trim();
  var day = Number(document.getElementById('cmDay').value);
  var period = Number(document.getElementById('cmPeriod').value);
  var sw = Number(document.getElementById('cmStartWeek').value);
  var ew = Number(document.getElementById('cmEndWeek').value);

  if (!name) { cmMsg('❌ 课程名称不能为空'); return; }
  if (!(sw >= 1 && ew <= TOTAL_WEEKS && sw <= ew)) { cmMsg('❌ 周次不正确（开始周需 ≤ 结束周）'); return; }

  var wkList = [];
  for (var w = sw; w <= ew; w++) wkList.push(w);
  // 冲突检测：同天同节次且周次重叠才算冲突（编辑时排除自己）
  var cf = state.arrangements.find(function (x) {
    return x.id !== cmId && x.day === day && x.period === period && weeksOverlap(x, { weekList: wkList });
  });
  if (cf) {
    cmMsg('❌ 与《' + cf.name + '》（' + WEEKDAY_NAMES[cf.day - 1] + PERIODS[cf.period - 1].label +
          ' ' + weekTextOf(cf) + '）时间冲突，未保存');
    return;
  }

  var teacher = document.getElementById('cmTeacher').value.trim();
  var location = document.getElementById('cmLocation').value.trim();
  var type = document.getElementById('cmType').value;
  var weekText = sw === ew ? sw + '周' : sw + '-' + ew + '周';

  // 新建：追加一条安排
  if (cmNew) {
    state.arrangements.push({
      id: 'u' + Date.now() + Math.floor(Math.random() * 1000),
      name: name, teacher: teacher, location: location,
      day: day, period: period,
      weekList: wkList, weekText: weekText,
      startWeek: sw, endWeek: ew, type: type
    });
    assignColor(name);
    saveState(state);
    renderAll();
    addLog('添加课程：《' + name + '》' + WEEKDAY_NAMES[day - 1] + PERIODS[period - 1].label +
           ' 第' + sw + '-' + ew + '周');
    closeCourseModal();
    return;
  }

  // 编辑：就地修改
  var a = state.arrangements.find(function (x) { return x.id === cmId; });
  if (!a) return;
  var oldName = a.name;
  a.name = name;
  a.teacher = teacher;
  a.location = location;
  a.day = day;
  a.period = period;
  a.type = type;
  a.startWeek = sw;
  a.endWeek = ew;
  a.weekList = wkList;
  a.weekText = weekText;

  if (oldName !== name) {
    assignColor(name);
    if (!state.arrangements.some(function (x) { return x.name === oldName; })) delete state.colors[oldName];
  }
  saveState(state);
  renderAll();
  addLog('修改课程：《' + oldName + '》→ ' + WEEKDAY_NAMES[day - 1] + PERIODS[period - 1].label +
         ' 第' + a.weekText);
  closeCourseModal();
}

function deleteCourseModal() {
  var a = state.arrangements.find(function (x) { return x.id === cmId; });
  if (!a) return;
  if (!confirm('删除《' + a.name + '》' + WEEKDAY_NAMES[a.day - 1] + PERIODS[a.period - 1].label +
               ' ' + weekTextOf(a) + ' 的这条安排？')) return;
  var i = state.arrangements.findIndex(function (x) { return x.id === a.id; });
  state.arrangements.splice(i, 1);
  if (!state.arrangements.some(function (x) { return x.name === a.name; })) delete state.colors[a.name];
  saveState(state);
  renderAll();
  addLog('删除课程安排：《' + a.name + '》');
  closeCourseModal();
}

/* ---------- 批量导入（文件） ---------- */

// 自动修正统计
var autoFixCount = 0;

// 星期解析：自动纠正常见格式，支持 1-7 / 一~日 / 周一~周日 / Monday~Sunday / Mon~Sun
// 返回 1-7（1=周一 … 7=周日），无法识别返回 -1
function parseWeekday(s) {
  s = String(s).trim().toLowerCase().replace(/[.．\s]/g, '');
  // 去掉常见前缀
  s = s.replace(/^(周|星期|礼拜)/, '').replace(/^(周|星期|礼拜)(一|二|三|四|五|六|日|天)$/, '$1');
  // 中文数字
  var cnMap = { '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '日': 7, '天': 7 };
  // 数字（0 与 7 都表示周日）
  var numMap = { '1': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '0': 7, '7': 7 };
  // 英文
  var enMap = { 'monday': 1, 'mon': 1, 'tuesday': 2, 'tue': 2, 'wednesday': 3, 'wed': 3,
                'thursday': 4, 'thu': 4, 'friday': 5, 'fri': 5, 'saturday': 6, 'sat': 6,
                'sunday': 7, 'sun': 7 };
  if (cnMap[s] !== undefined) return cnMap[s];
  if (numMap[s] !== undefined) return numMap[s];
  if (enMap[s] !== undefined) return enMap[s];
  // 含区间 / 分隔符的字符串（如 1-16周、3-9、5~6节）不是单个星期
  if (/[-—~～,，、\/]/.test(s)) return -1;
  // 仅当整串就是一个「第 N 天」形式时才按数字取星期，
  // 避免把「日新楼202」这类含数字的名称误判为星期
  var m = s.match(/^(?:第)?(\d)(?:天|日)?$/);
  if (m) {
    var d = Number(m[1]);
    if (d >= 1 && d <= 6) return d;
    if (d === 0 || d === 7) return 7;
  }
  return -1;
}

/* ---------- Excel 文件导入 ---------- */

var excelMsgTimer = null;
function showExcelMsg(text, ok) {
  var m = document.getElementById('excelMsg');
  m.textContent = text;
  m.className = 'form-msg ' + (ok ? 'ok' : 'err');
  clearTimeout(excelMsgTimer);
  excelMsgTimer = setTimeout(function () { m.textContent = ''; }, 8000);
}

// 表头模糊匹配
// 按"先精确后宽泛"的顺序逐列判定，每个单元格只归入一类，避免误匹配
// （如"教室名称"含"名称"、"课程号"含"课程"）
function matchHeaders(row) {
  var defs = [
    { key: 'name',      kws: ['课程名称', '课程名', '科目名称', '科目名', '科目'] },
    // 「开始周 / 结束周」两类要放在通用「周次」之前，否则"开始周次"会被"周次"抢走
    { key: 'startWeek', kws: ['开始周次', '开始周', '起始周次', '起始周', '起周'] },
    { key: 'endWeek',   kws: ['结束周次', '结束周', '终止周次', '终止周', '止周'] },
    { key: 'week',      kws: ['上课周次', '教学周次', '起止周次', '起止周', '周次', '周数', '上课周'] },
    { key: 'day',       kws: ['上课星期', '上课周几', '星期', '周几'] },
    { key: 'period',    kws: ['上课节次', '节次', '大节', '课时', '时段'] },
    { key: 'teacher',   kws: ['上课教师', '任课教师', '授课教师', '教师', '老师', '讲师'] },
    { key: 'location',  kws: ['教室名称', '上课教室', '上课地点', '教室', '地点', '教学楼', '上课场地'] },
    { key: 'type',      kws: ['课程性质', '课程类型', '课程类别', '类型', '是否考试'] },
    { key: 'note',      kws: ['备注信息', '备注', '说明'] }
  ];
  var map = {};
  row.forEach(function (cell, idx) {
    var s = String(cell || '').trim();
    if (!s) return;
    for (var i = 0; i < defs.length; i++) {
      var kw = defs[i].kws;
      for (var j = 0; j < kw.length; j++) {
        if (s.indexOf(kw[j]) >= 0) {
          if (map[defs[i].key] === undefined) map[defs[i].key] = idx;
          return; // 该列已归类，不再尝试其他字段
        }
      }
    }
  });
  return map;
}

// 从 Excel 单元格读取字符串值
function cellStr(v) {
  if (v == null) return '';
  return String(v).trim();
}

// 判断一段文本是否像"上课周次"（避免把《体育与健康1》这类带数字的课名误判为周次）
function looksLikeWeek(s) {
  s = String(s == null ? '' : s).trim();
  if (!/\d/.test(s)) return false;
  if (!/周|单|双/.test(s) && !/^\s*\d+\s*[-—~～至到]\s*\d+\s*$/.test(s) && !/^\s*\d+\s*$/.test(s)) return false;
  return !!parseWeekSpec(s);
}

// 在开头若干行里找最像表头的一行（教务系统导出常在表格上方带标题行）
function findHeaderRow(rows) {
  var limit = Math.min(rows.length, 15);
  var best = -1, bestScore = 0, bestMap = null;
  for (var i = 0; i < limit; i++) {
    var m = matchHeaders(rows[i] || []);
    if (m.name === undefined) continue; // 必须能认出「课程名称」列
    var score = Object.keys(m).length;
    if (m.day !== undefined) score += 2;
    if (m.period !== undefined) score += 2;
    if (m.week !== undefined) score += 2;
    if (m.startWeek !== undefined && m.endWeek !== undefined) score += 2;
    if (score > bestScore) { bestScore = score; best = i; bestMap = m; }
  }
  if (best < 0 || bestScore < 6) return null;
  return { idx: best, map: bestMap };
}

// 在多个工作表中挑最像课表的一个：优先含表头，其次行数最多
function pickSheet(wb) {
  var best = null, bestScore = -1;
  (wb.SheetNames || []).forEach(function (nm) {
    var rows = XLSX.utils.sheet_to_json(wb.Sheets[nm], { header: 1, defval: '', blankrows: false });
    if (!rows || !rows.length) return;
    var nonEmpty = 0;
    rows.forEach(function (r) { if ((r || []).some(function (c) { return cellStr(c) !== ''; })) nonEmpty++; });
    if (!nonEmpty) return;
    var score = nonEmpty + (findHeaderRow(rows) ? 1000 : 0);
    if (score > bestScore) { bestScore = score; best = { name: nm, rows: rows }; }
  });
  return best;
}

// CSV / TXT 文本解码：优先 UTF-8，出现乱码时回退 GBK（教务系统导出常见）
function decodeText(buf) {
  if (typeof buf === 'string') return buf;
  var txt = '';
  try { txt = new TextDecoder('utf-8', { fatal: false }).decode(buf); } catch (e) { txt = ''; }
  if (txt.indexOf('\uFFFD') >= 0) {
    try { txt = new TextDecoder('gbk', { fatal: false }).decode(buf); } catch (e2) {}
  }
  return txt;
}

/* ---------- 通用导入：按列映射把行数据写入课表 ---------- */
// col 为列下标映射 { name, teacher, location, day, period, week, startWeek, endWeek, type, note }
// opts.loose = true 时，不像数据行的行（如上方的标题行）静默跳过
function importDataRows(rows, start, col, opts) {
  var added = 0, errs = [], fixed = 0, skipped = 0;
  for (var i = start; i < rows.length; i++) {
    var r = rows[i] || [];
    if (!r.some(function (c) { return cellStr(c) !== ''; })) continue;

    var name = cellStr(r[col.name]);
    var rawDay = col.day !== undefined ? cellStr(r[col.day]) : '';
    var day = parseWeekday(rawDay);
    var rawPeriod = col.period !== undefined ? cellStr(r[col.period]) : '';
    var periods = parsePeriodList(rawPeriod);

    if (day === -1 && !periods.length) {
      if (opts && opts.loose) { skipped++; continue; }
    }

    var teacher = col.teacher !== undefined ? cellStr(r[col.teacher]) : '';
    var location = col.location !== undefined ? cellStr(r[col.location]) : '';
    var note = col.note !== undefined ? cellStr(r[col.note]) : '';
    var type = 'normal';
    if (col.type !== undefined) {
      var ts = cellStr(r[col.type]);
      if (ts.indexOf('考') >= 0 || /exam/i.test(ts)) type = 'exam';
    }

    // 周次：优先整列文本（支持多段/单双周），其次「开始周 + 结束周」两列
    var wk = null;
    if (col.week !== undefined) wk = parseWeekSpec(cellStr(r[col.week]));
    if (!wk && col.startWeek !== undefined) {
      var sw = Number(cellStr(r[col.startWeek]));
      var ewRaw = col.endWeek !== undefined ? cellStr(r[col.endWeek]) : '';
      var ew = ewRaw ? Number(ewRaw) : sw;
      if (sw >= 1 && sw <= TOTAL_WEEKS) {
        if (!(ew >= 1 && ew <= TOTAL_WEEKS) || ew < sw) ew = sw;
        var list = [];
        for (var w = sw; w <= ew; w++) list.push(w);
        wk = { list: list, text: (sw === ew ? sw + '周' : sw + '-' + ew + '周') };
      }
    }

    // 自动识别统计
    if (rawDay && day !== -1 && day !== Number(rawDay)) fixed++;
    if (rawPeriod && periods.length) fixed++;
    if (col.week !== undefined && wk && wk.text !== cellStr(r[col.week])) fixed++;

    if (!name) { errs.push('第' + (i + 1) + '行 课程名称为空'); continue; }
    if (day === -1) { errs.push('第' + (i + 1) + '行 星期无法识别'); continue; }
    if (!periods.length) { errs.push('第' + (i + 1) + '行 节次无法识别'); continue; }
    if (!wk) { errs.push('第' + (i + 1) + '行 周次无法识别'); continue; }

    // 一条记录跨多个节次时（如 5-10节），按节次拆成多条安排
    periods.forEach(function (p, j) {
      var a = {
        name: name, teacher: teacher, location: location,
        day: day, period: p,
        weekList: wk.list, weekText: wk.text,
        startWeek: wk.list[0], endWeek: wk.list[wk.list.length - 1],
        note: note, type: type
      };
      var conflict = state.arrangements.find(function (x) {
        return x.day === a.day && x.period === a.period && weeksOverlap(x, a);
      });
      if (conflict) { errs.push('第' + (i + 1) + '行 与《' + conflict.name + '》时间冲突'); return; }
      a.id = 'u' + Date.now() + Math.floor(Math.random() * 1000) + '_' + i + '_' + j;
      state.arrangements.push(a);
      assignColor(a.name);
      added++;
    });
  }
  return { added: added, errs: errs, fixed: fixed, skipped: skipped };
}

/* ---------- 无表头时：按单元格内容推断各列 ---------- */

function inferColumns(rows) {
  var dataRows = rows.filter(function (r) {
    return (r || []).some(function (c) { return cellStr(c) !== ''; });
  });
  if (!dataRows.length) return null;
  var ncols = 0;
  dataRows.forEach(function (r) { ncols = Math.max(ncols, r.length); });

  var sample = dataRows.slice(0, 50);
  var stats = [];
  for (var c = 0; c < ncols; c++) {
    var vals = [];
    sample.forEach(function (r) { var v = cellStr(r[c]); if (v !== '') vals.push(v); });
    var s = { col: c, n: vals.length, day: 0, period: 0, week: 0, weekMark: 0,
              place: 0, cjk: 0, sumLen: 0, numericMax: 0 };
    vals.forEach(function (v) {
      var wd = parseWeekday(v);
      if (wd !== -1) s.day++;
      if (parsePeriodList(v).length) s.period++;
      if (parseWeekSpec(v)) s.week++;
      // 含「周/单/双」且本身不是星期几（如「周一」）才记为周次特征
      if (/周|单|双/.test(v) && wd === -1) s.weekMark++;
      if (/楼|室|馆|场|教室|校区|中心|基地|实验|田径/.test(v)) s.place++;
      if (/[\u4e00-\u9fa5]/.test(v)) s.cjk++;
      if (/^\d+$/.test(v)) s.numericMax = Math.max(s.numericMax, Number(v));
      s.sumLen += v.length;
    });
    s.avgLen = s.n ? s.sumLen / s.n : 0;
    s.dayRate = s.n ? s.day / s.n : 0;
    s.periodRate = s.n ? s.period / s.n : 0;
    s.weekRate = s.n ? s.week / s.n : 0;
    s.cjkRate = s.n ? s.cjk / s.n : 0;
    stats.push(s);
  }

  var used = {}, col = {};

  // 星期列：多数格子能解析为星期，且不含周次特征、数值不超过 7
  var dayCand = stats.filter(function (s) {
    return s.n > 0 && s.dayRate >= 0.7 && s.numericMax <= 7 && s.weekMark === 0;
  }).sort(function (a, b) { return (a.weekMark - b.weekMark) || (b.dayRate - a.dayRate); })[0];
  if (dayCand) { col.day = dayCand.col; used[dayCand.col] = 1; }

  // 周次列：含"周/单/双"字样，或数值超过 7
  var weekCand = stats.filter(function (s) {
    return !used[s.col] && s.n > 0 && s.weekRate >= 0.7 && (s.weekMark > 0 || s.numericMax > 7);
  }).sort(function (a, b) { return (b.weekMark - a.weekMark) || (b.weekRate - a.weekRate); })[0];
  if (weekCand) { col.week = weekCand.col; used[weekCand.col] = 1; }

  // 节次列
  var perCand = stats.filter(function (s) {
    return !used[s.col] && s.n > 0 && s.periodRate >= 0.7;
  }).sort(function (a, b) { return b.periodRate - a.periodRate; })[0];
  if (perCand) { col.period = perCand.col; used[perCand.col] = 1; }

  // 地点列：多数格子含"楼/室/馆/场"等字样
  var locCand = stats.filter(function (s) {
    return !used[s.col] && s.n > 0 && s.place / s.n >= 0.5;
  }).sort(function (a, b) { return (b.place / b.n) - (a.place / a.n); })[0];
  if (locCand) { col.location = locCand.col; used[locCand.col] = 1; }

  // 其余含中文的文本列：平均长度最长的当课程名，其次当教师
  var textCand = stats.filter(function (s) {
    return !used[s.col] && s.n > 0 && s.avgLen >= 2 && s.cjkRate >= 0.5;
  }).sort(function (a, b) { return b.avgLen - a.avgLen; });
  if (textCand[0]) { col.name = textCand[0].col; used[textCand[0].col] = 1; }
  if (textCand[1]) { col.teacher = textCand[1].col; used[textCand[1].col] = 1; }

  return { start: 0, col: col };
}

/* ---------- 网格课表：星期横向、节次纵向 ---------- */

// 找到"星期标签横排"的那一行（至少 4 个不同星期的文本标签）
function detectGrid(rows) {
  var limit = Math.min(rows.length, 12);
  for (var i = 0; i < limit; i++) {
    var r = rows[i] || [];
    var cols = [];
    for (var c = 0; c < r.length; c++) {
      var txt = cellStr(r[c]);
      if (!txt || !/周|星期|礼拜/.test(txt)) continue; // 仅认文本形式的星期标签
      var d = parseWeekday(txt);
      if (d !== -1) cols.push({ col: c, day: d });
    }
    var uniq = {};
    cols.forEach(function (x) { uniq[x.day] = 1; });
    if (cols.length >= 4 && Object.keys(uniq).length >= 4) return { headRow: i, cols: cols };
  }
  return null;
}

// 拆分网格单元格内的文字：课名 / 教师 / 地点 / 周次
function parseGridCellText(txt) {
  var lines = String(txt).split(/\r?\n/).map(function (s) { return s.trim(); })
                    .filter(function (s) { return s !== ''; });
  if (lines.length === 1) {
    var sp = lines[0].split(/\s{2,}/).map(function (s) { return s.trim(); })
                      .filter(function (s) { return s !== ''; });
    if (sp.length > 1) lines = sp;
  }
  var out = { name: '', teacher: '', location: '', weekSpec: '' };
  lines.forEach(function (ln) {
    if (!out.weekSpec && looksLikeWeek(ln)) { out.weekSpec = ln; return; }
    if (!out.name) { out.name = ln; return; }
    if (!out.location && /楼|室|馆|场|教室|校区|中心|基地|实验|田径/.test(ln)) { out.location = ln; return; }
    if (!out.teacher) { out.teacher = ln; return; }
    if (!out.location) out.location = ln;
  });
  return out;
}

function importGrid(rows, grid) {
  var dayCols = grid.cols.map(function (x) { return x.col; });
  var minCol = Math.min.apply(null, dayCols);

  // 定位节次列：星期列左侧、能解析出节次比例最高的一列
  var perCol = -1, bestRate = 0;
  for (var c = 0; c < minCol; c++) {
    var hit = 0, tot = 0;
    for (var i = grid.headRow + 1; i < rows.length; i++) {
      var v = cellStr((rows[i] || [])[c]);
      if (!v) continue;
      tot++;
      if (parsePeriodList(v).length) hit++;
    }
    var rate = tot ? hit / tot : 0;
    if (rate > bestRate) { bestRate = rate; perCol = c; }
  }
  if (perCol === -1 || bestRate < 0.5) {
    return { err: '这是「星期横向、节次纵向」的课表网格，但未能定位「节次」所在列' };
  }

  var teachEnd = (typeof EXAM_WEEKS !== 'undefined' && EXAM_WEEKS.length) ? EXAM_WEEKS[0] - 1 : TOTAL_WEEKS;
  var added = 0, errs = [], noWeek = 0, fixed = 0;

  for (var ri = grid.headRow + 1; ri < rows.length; ri++) {
    var row = rows[ri] || [];
    var periods = parsePeriodList(cellStr(row[perCol]));
    if (!periods.length) continue;

    grid.cols.forEach(function (dc) {
      var raw = cellStr(row[dc.col]);
      if (!raw) return;
      var info = parseGridCellText(raw);
      if (!info.name) return;

      var wk = info.weekSpec ? parseWeekSpec(info.weekSpec) : null;
      if (wk) {
        if (looksLikeWeek(info.weekSpec) && wk.text !== info.weekSpec) fixed++;
      } else {
        // 网格里未标注周次时，按整个教学周处理
        var list = [];
        for (var w = 1; w <= teachEnd; w++) list.push(w);
        wk = { list: list, text: '第 1-' + teachEnd + ' 周（原表未标注）' };
        noWeek++;
      }

      periods.forEach(function (p, j) {
        var a = {
          name: info.name, teacher: info.teacher, location: info.location,
          day: dc.day, period: p,
          weekList: wk.list, weekText: wk.text,
          startWeek: wk.list[0], endWeek: wk.list[wk.list.length - 1],
          note: '由课表网格导入', type: 'normal'
        };
        var conflict = state.arrangements.find(function (x) {
          return x.day === a.day && x.period === a.period && weeksOverlap(x, a);
        });
        if (conflict) {
          errs.push('第' + (ri + 1) + '行 ' + WEEKDAY_NAMES[dc.day - 1] + ' 与《' + conflict.name + '》时间冲突');
          return;
        }
        a.id = 'g' + Date.now() + Math.floor(Math.random() * 1000) + '_' + ri + '_' + dc.day + '_' + j;
        state.arrangements.push(a);
        assignColor(a.name);
        added++;
      });
    });
  }
  return { added: added, errs: errs, fixed: fixed, noWeek: noWeek, teachEnd: teachEnd };
}

/* ---------- 统一收尾：写入并提示 ---------- */

function finishImport(res, note) {
  if (res.fixed) autoFixCount += res.fixed;
  if (res.added) {
    saveState(state);
    renderAll();
    addLog('文件导入 ' + res.added + ' 条课程安排' +
           (autoFixCount ? '，自动识别 ' + autoFixCount + ' 处格式' : ''));
  }
  if (!res.added && !res.errs.length) {
    showExcelMsg('未识别到有效数据（' + note + '）', false);
    return;
  }
  var msg = '✅ 成功导入 ' + res.added + ' 条（' + note + '）';
  if (autoFixCount) msg += '，自动识别 ' + autoFixCount + ' 处格式';
  if (res.noWeek) msg += '，' + res.noWeek + ' 条未标注周次已按全学期处理';
  if (res.skipped) msg += '，跳过 ' + res.skipped + ' 行非数据行';
  if (res.errs.length) msg += '，跳过 ' + res.errs.length + ' 条：' + res.errs.slice(0, 5).join('；');
  showExcelMsg(msg, res.errs.length === 0);
}

// 导入主流程：自动适配多种表格结构
function doImport(buffer, isText) {
  var wb = isText
    ? XLSX.read(decodeText(buffer), { type: 'string' })
    : XLSX.read(new Uint8Array(buffer), { type: 'array' });

  var picked = pickSheet(wb);
  if (!picked || !picked.rows.length) {
    showExcelMsg('❌ 文件内容为空，未找到可导入的数据', false);
    return;
  }
  var rows = picked.rows;
  var src = '工作表「' + picked.name + '」';

  // ① 有表头（允许表格上方有标题行、多工作表、列顺序任意）
  var hdr = findHeaderRow(rows);
  if (hdr) {
    var res = importDataRows(rows, hdr.idx + 1, hdr.map, {});
    finishImport(res, src + '·表头在第 ' + (hdr.idx + 1) + ' 行');
    return;
  }

  // ② 网格课表（星期横向、节次纵向）
  var grid = detectGrid(rows);
  if (grid) {
    var g = importGrid(rows, grid);
    if (g.err) { showExcelMsg('❌ ' + g.err, false); return; }
    var gr = { added: g.added, errs: g.errs, fixed: g.fixed, noWeek: g.noWeek };
    finishImport(gr, src + '·识别为课表网格（星期横向）');
    return;
  }

  // ③ 无表头：按单元格内容推断各列
  var inf = inferColumns(rows);
  var c3 = inf && inf.col;
  if (!c3 || c3.name === undefined || c3.day === undefined || c3.period === undefined || c3.week === undefined) {
    showExcelMsg('❌ 未能自动识别课程列。文件中需能看到：课程名称、上课星期（如"星期一"）、节次（如"3-4节"）、周次（如"1-18周"）。', false);
    return;
  }
  var r3 = importDataRows(rows, inf.start, c3, { loose: true });
  finishImport(r3, src + '·无表头按内容推断（名称第' + (c3.name + 1) + '列、星期第' + (c3.day + 1) +
              '列、节次第' + (c3.period + 1) + '列、周次第' + (c3.week + 1) + '列）');
}

function onExcelFile(e) {
  var file = e.target.files[0];
  if (!file) return;
  if (typeof XLSX === 'undefined') {
    showExcelMsg('❌ SheetJS 库未加载（可能处于离线环境），暂时无法解析表格文件', false);
    e.target.value = '';
    return;
  }
  autoFixCount = 0; // 重置自动修正计数
  var isText = /\.(csv|txt|tsv)$/i.test(file.name);
  var reader = new FileReader();
  reader.onload = function (ev) {
    try {
      doImport(ev.target.result, isText);
    } catch (err) {
      showExcelMsg('❌ 解析文件出错：' + (err.message || err), false);
    }
    e.target.value = '';
  };
  reader.readAsArrayBuffer(file); // CSV 也按二进制读，便于自动识别 UTF-8 / GBK
}


/* ---------- 活动列表 ---------- */

function renderActivities() {
  var box = document.getElementById('activityList');
  var now = Date.now();
  var list = state.activities.slice().sort(function (a, b) {
    return new Date(a.time) - new Date(b.time);
  });
  if (!list.length) {
    box.innerHTML = '<p class="empty-tip">暂无活动。可添加考试、交作业、班会等安排，到点自动弹窗提醒并播放音效。</p>';
    return;
  }
  var html = '';
  list.forEach(function (a) {
    var t = new Date(a.time).getTime();
    var past = t < now - 60000;
    var st = past ? '已过期' : (a.reminded ? '已提醒' : '待提醒');
    var cls = past ? 'past' : (a.reminded ? 'done' : 'soon');
    html += '<div class="act-row ' + cls + '"><div><b>' + esc(a.title) + '</b>' +
            '<div class="act-meta">' + fmtMDHM(a.time) + ' · ' +
            (a.remindBefore ? '提前 ' + a.remindBefore + ' 分钟提醒' : '准时提醒') + '</div></div>' +
            '<div class="act-right"><span class="badge ' + cls + '">' + st + '</span>' +
            '<button class="mini-del" data-id="' + a.id + '">删除</button></div></div>';
  });
  box.innerHTML = html;
}

function onAddActivity(e) {
  e.preventDefault();
  var title = document.getElementById('actTitle').value.trim();
  var time = document.getElementById('actTime').value;
  if (!title || !time) return;
  state.activities.push({
    id: 'a' + Date.now() + Math.floor(Math.random() * 999),
    title: title, time: time,
    remindBefore: Number(document.getElementById('actBefore').value) || 0,
    reminded: false
  });
  saveState(state);
  renderActivities();
  addLog('新增活动：' + title + '（' + fmtMDHM(time) + '）');
  e.target.reset();
  document.getElementById('actTime').value = toLocalInput(new Date(Date.now() + 3600000));
}

function deleteActivity(id) {
  var i = state.activities.findIndex(function (a) { return a.id === id; });
  if (i >= 0) {
    var t = state.activities[i].title;
    state.activities.splice(i, 1);
    saveState(state);
    renderActivities();
    addLog('删除活动：' + t);
  }
}

/* ---------- 提醒记录：分类 / 分组 / 相对时间（UI 已移除，保留数据结构） ---------- */

// 记录类型（靠文字前缀识别，旧数据也无需迁移）
var LOG_KINDS = {
  all:    { label: '全部',     icon: '📋' },
  alert:  { label: '活动提醒', icon: '⏰' },
  class:  { label: '上课预告', icon: '🔔' },
  course: { label: '课程变动', icon: '📚' },
  import: { label: '导入',     icon: '📥' },
  makeup: { label: '调休补课', icon: '🔁' },
  other:  { label: '其他',     icon: '•' }
};

function logKind(text) {
  var t = String(text || '');
  if (t.indexOf('活动提醒') === 0) return 'alert';
  if (t.indexOf('上课预告') === 0) return 'class';
  if (t.indexOf('导入') >= 0) return 'import';
  if (t.indexOf('课程') >= 0) return 'course';
  if (t.indexOf('调休') >= 0) return 'makeup';
  return 'other';
}

var logFilter = 'all';

// 同一天的分组键
function logDayKey(iso) {
  var d = new Date(iso);
  return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
}

// 分组标题：今天 / 昨天 / M 月 D 日
function logDayLabel(iso) {
  var now = new Date();
  if (logDayKey(iso) === logDayKey(now.toISOString())) return '今天';
  if (logDayKey(iso) === logDayKey(new Date(now.getTime() - 86400000).toISOString())) return '昨天';
  var d = new Date(iso);
  return (d.getMonth() + 1) + ' 月 ' + d.getDate() + ' 日';
}

// 相对时间：刚刚 / N 分钟前 / N 小时前 / 具体时刻
function logRelTime(iso) {
  var d = new Date(iso);
  var diff = Math.floor((Date.now() - d.getTime()) / 1000);
  if (diff < 0) return pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  if (diff < 60) return '刚刚';
  if (diff < 3600) return Math.floor(diff / 60) + ' 分钟前';
  if (logDayKey(iso) === logDayKey(new Date().toISOString())) return Math.floor(diff / 3600) + ' 小时前';
  return pad2(d.getHours()) + ':' + pad2(d.getMinutes());
}

function renderLog() {
  var box = document.getElementById('logList');
  if (!box) return; // 提醒记录区域已移除
  var all = state.log || [];

  // 各类型计数
  var counts = { all: all.length };
  all.forEach(function (l) {
    var k = logKind(l.text);
    counts[k] = (counts[k] || 0) + 1;
  });

  // 顶部：分类筛选片（没有记录的分类不显示，保持简洁）
  var html = '<div class="log-bar">';
  Object.keys(LOG_KINDS).forEach(function (k) {
    if (k !== 'all' && !counts[k]) return;
    html += '<button class="lchip lk-' + k + (logFilter === k ? ' active' : '') +
            '" data-logfilter="' + k + '">' + LOG_KINDS[k].icon + ' ' + LOG_KINDS[k].label +
            '<b>' + (counts[k] || 0) + '</b></button>';
  });
  html += '</div>';

  // 按当前筛选取记录（保留原始下标，供删除使用）
  var rows = [];
  all.forEach(function (l, i) {
    if (logFilter === 'all' || logKind(l.text) === logFilter) rows.push({ l: l, i: i });
  });

  if (!rows.length) {
    box.innerHTML = html + '<p class="empty-tip">' + (all.length
      ? '「' + LOG_KINDS[logFilter].label + '」分类下暂无记录。'
      : '暂无提醒记录。触发活动提醒或上课预告后会显示在这里。') + '</p>';
    return;
  }

  // 按天分组，组内时间倒序（state.log 本身已是最新在前）
  var curDay = '';
  rows.forEach(function (o) {
    var l = o.l, k = logKind(l.text);
    if (logDayKey(l.time) !== curDay) {
      curDay = logDayKey(l.time);
      html += '<div class="log-day">' + logDayLabel(l.time) + '</div>';
    }
    html += '<div class="log-row lk-' + k + '">' +
              '<span class="log-icon" title="' + LOG_KINDS[k].label + '">' + LOG_KINDS[k].icon + '</span>' +
              '<span class="log-time" title="' + esc(fmtMDHM(l.time)) + '">' + logRelTime(l.time) + '</span>' +
              '<span class="log-text">' + esc(l.text) + '</span>' +
              '<button class="mini-del" data-log="' + o.i + '" title="删除这条记录">删除</button>' +
            '</div>';
  });
  box.innerHTML = html;
}

// 切换提醒记录分类
function setLogFilter(k) {
  if (!LOG_KINDS[k]) return;
  logFilter = k;
  renderLog();
}

// 删除单条提醒记录（按当前列表下标）
function deleteLog(i) {
  if (!(i >= 0 && i < state.log.length)) return;
  state.log.splice(i, 1);
  saveState(state);
  renderLog();
}

// 清空全部提醒记录
function clearLog() {
  if (!state.log.length) return;
  if (!confirm('确定要清空全部提醒记录吗？此操作不可撤销。')) return;
  state.log = [];
  saveState(state);
  renderLog();
}

/* ---------- 其他控件 ---------- */

// 调休补课的「按星期几的课表上课」下拉
function fillMakeupDaySelect() {
  var dh = '';
  for (var d = 1; d <= WEEKDAY_NAMES.length; d++) dh += '<option value="' + d + '">' + WEEKDAY_NAMES[d - 1] + '</option>';
  document.getElementById('makeupDay').innerHTML = dh;
}

/* ---------- 恢复为内置课表 ---------- */

function onReset() {
  if (!confirm('确定要恢复为内置课表吗？\n你自己添加、修改过的课程、活动和提醒记录都会被清除，课表回到本学期内置课表。')) return;
  localStorage.removeItem(STORAGE_KEY);
  state = loadState();
  renderAll();
}

/* ---------- 调休补课设置 ---------- */

var makeupMsgTimer = null;
function showMakeupMsg(text, ok) {
  var m = document.getElementById('makeupMsg');
  m.textContent = text;
  m.className = 'form-msg ' + (ok ? 'ok' : 'err');
  clearTimeout(makeupMsgTimer);
  makeupMsgTimer = setTimeout(function () { m.textContent = ''; }, 6000);
}

function renderMakeupList() {
  var box = document.getElementById('makeupList');
  var rows = [];
  // 调休上课日清单（内置自官方通知，可逐条删除）
  (state.makeupDays || []).forEach(function (m) {
    rows.push({ date: m.date, name: m.name });
  });
  // 用户为其它日期设置的补课
  Object.keys(state.makeup || {}).forEach(function (ds) {
    if (!rows.some(function (r) { return r.date === ds; })) {
      rows.push({ date: ds, name: '自定义调休' });
    }
  });
  rows.sort(function (a, b) { return a.date < b.date ? -1 : 1; });
  if (!rows.length) { box.innerHTML = ''; return; }

  box.innerHTML = rows.map(function (r) {
    var wd = WEEKDAY_NAMES[weekdayOfDateStr(r.date) - 1];
    var md = makeupDayOf(r.date);
    return '<div class="mk-row">' +
             '<span>' + r.date.slice(5).replace('-', '/') + '（' + wd + '）· ' + esc(r.name) + '</span>' +
             '<span class="mk-right">' +
               (md ? '按' + WEEKDAY_NAMES[md - 1] + '课表上课' : '<em>未指定补课星期</em>') +
               '<button class="mini-del" data-mk="' + r.date + '" title="删除该调休安排">删除</button>' +
             '</span>' +
           '</div>';
  }).join('');
}

function onAddMakeup() {
  var ds = document.getElementById('makeupDate').value;
  var day = Number(document.getElementById('makeupDay').value);
  if (!ds) { showMakeupMsg('请选择调休上课的日期', false); return; }
  if (!(day >= 1 && day <= 7)) { showMakeupMsg('请选择要补哪一天的课', false); return; }
  if (holidayOf(ds)) { showMakeupMsg('该日期在法定假期内，不能作为调休上课日', false); return; }
  state.makeup[ds] = day;
  saveState(state);
  renderAll();
  addLog('设置调休补课：' + ds + ' 按' + WEEKDAY_NAMES[day - 1] + '课表上课');
  showMakeupMsg('✅ ' + ds + ' 已按' + WEEKDAY_NAMES[day - 1] + '课表上课', true);
}

function deleteMakeup(ds) {
  // 从调休日清单中移除，并清除该日的补课星期
  state.makeupDays = (state.makeupDays || []).filter(function (m) { return m.date !== ds; });
  delete state.makeup[ds];
  saveState(state);
  renderAll();
  addLog('删除调休安排：' + ds);
}
