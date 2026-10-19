/* =========================================================
 * app.js —— 入口：初始化、事件绑定、总渲染、定时器
 * ========================================================= */

var state = null; // 全局唯一状态（storage.js 读写）

function renderAll() {
  renderWeekChips();
  renderDayChips();
  renderGrid();
  renderSearch();
  renderActivities();
  renderMakeupList();
  updateClock();
}

// 把较长、不常改动的栏目做成可折叠：点标题展开/收起（默认收起，保持页面简洁）
function setupCollapsibleCards() {
  ['cardImport', 'cardMakeup', 'cardActivity'].forEach(function (id) {
    var card = document.getElementById(id);
    if (!card) return;
    card.classList.add('collapsible', 'collapsed');
    var h2 = card.querySelector('h2');
    if (h2) {
      h2.title = '点击展开 / 收起';
      h2.onclick = function () { card.classList.toggle('collapsed'); };
    }
  });
}

function init() {
  state = loadState();

  // 关闭横幅 = 立即停止响铃
  document.getElementById('bannerClose').onclick = function () {
    hideBanner();
    stopRing();
  };

  // 周次切换：上一周 / 下一周 / 下拉选择 / 回到本周
  document.getElementById('weekPrev').onclick = function () { setViewWeek(currentViewWeek() - 1); };
  document.getElementById('weekNext').onclick = function () { setViewWeek(currentViewWeek() + 1); };
  document.getElementById('weekPick').onchange = function () { setViewWeek(this.value); };
  document.getElementById('jumpThisWeek').onclick = function () {
    state.weekOverride = null;
    saveState(state);
    renderAll();
  };

  // 手机端日期片
  document.getElementById('dayChips').addEventListener('click', function (e) {
    var b = e.target.closest('button.dchip');
    if (!b) return;
    var d = Number(b.getAttribute('data-day'));
    activeDay = d === 0 ? null : d;
    renderDayChips();
    renderGrid();
  });

  // 空格子"＋"新建课程；点已有课程块 → 打开编辑/删除弹窗
  document.getElementById('schedule').addEventListener('click', function (e) {
    var c = e.target.closest('.course');
    if (c && c.getAttribute('data-cid')) { openCourseModal(c.getAttribute('data-cid')); return; }
    var b = e.target.closest('.add-in-cell');
    if (!b) return;
    openNewCourseModal(Number(b.getAttribute('data-day')), Number(b.getAttribute('data-period')));
  });

  // 课程编辑弹窗：保存 / 删除 / 关闭
  document.getElementById('cmClose').onclick = closeCourseModal;
  document.getElementById('cmCancel').onclick = closeCourseModal;
  document.getElementById('cmSave').onclick = saveCourseModal;
  document.getElementById('cmDelete').onclick = deleteCourseModal;
  document.getElementById('courseModal').addEventListener('click', function (e) {
    if (e.target === this) closeCourseModal(); // 点遮罩空白处关闭
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && document.getElementById('courseModal').classList.contains('show')) closeCourseModal();
  });

  // 搜索：输入即时筛选，点击结果定位到课表
  var searchInput = document.getElementById('searchInput');
  var searchDate = document.getElementById('searchDate');
  var searchResult = document.getElementById('searchResult');
  var searchClear = document.getElementById('searchClear');

  // 有搜索条件时才显示清除按钮；日期为空时显示「搜索日期」占位
  function syncSearchClear() {
    searchClear.hidden = !(searchInput.value.trim() || searchDate.value);
    searchDate.parentNode.classList.toggle('has-date', !!searchDate.value);
  }
  syncSearchClear();

  // 放大镜图标本身也可点击聚焦输入框
  document.querySelector('.s-ico').onclick = function () { searchInput.focus(); };

  // 两种搜索互斥：输入文字时清掉日期，选日期时清掉文字
  searchInput.addEventListener('input', function () {
    if (searchInput.value.trim()) searchDate.value = '';
    renderSearch();
    syncSearchClear();
  });
  searchDate.addEventListener('change', function () {
    if (!searchDate.value) return;
    searchInput.value = '';
    renderDateSearch(searchDate.value);
    syncSearchClear();
  });
  searchClear.onclick = function () {
    searchInput.value = '';
    searchDate.value = '';
    searchResult.innerHTML = '';
    syncSearchClear();
  };
  searchResult.addEventListener('click', function (e) {
    var r = e.target.closest('.sr-row');
    if (r) locateCourse(r.getAttribute('data-cid'), r.getAttribute('data-week'));
  });

  // 活动列表删除按钮
  document.getElementById('activityList').addEventListener('click', function (e) {
    var b = e.target.closest('.mini-del');
    if (b) deleteActivity(b.getAttribute('data-id'));
  });

  // 表单
  document.getElementById('activityForm').addEventListener('submit', onAddActivity);

  // 调休补课
  document.getElementById('btnAddMakeup').onclick = onAddMakeup;
  document.getElementById('makeupList').addEventListener('click', function (e) {
    var b = e.target.closest('.mini-del');
    if (b && b.getAttribute('data-mk')) deleteMakeup(b.getAttribute('data-mk'));
  });

  // 批量导入（选择文件）
  document.getElementById('excelFile').addEventListener('change', onExcelFile);

  // 恢复为内置课表
  document.getElementById('btnReset').onclick = onReset;

  // 手机端默认定位到今天（JS 周日=0，本应用周日=7）
  // 判断条件与 CSS 的媒体查询保持一致：窄屏，或触屏设备（≤1024px，兼容手机浏览器「桌面版网站」模式）
  if (window.matchMedia && window.matchMedia('(max-width: 760px), (pointer: coarse) and (max-width: 1024px)').matches) {
    var td = new Date().getDay();
    activeDay = td === 0 ? 7 : td;
  }

  // 表单控件初始值
  fillMakeupDaySelect();
  document.getElementById('actTime').value = toLocalInput(new Date(Date.now() + 3600000));

  // 提醒音效：填充下拉 + 试听 + 停止响铃
  renderSoundOptions();
  renderRingOptions();
  document.getElementById('btnTestSound').onclick = function () {
    var id = document.getElementById('soundSel').value;
    if (id === 'none') { stopRing(); showSoundMsg('🔇 已选择静音，不会有提示音', true); return; }
    var ok = startRing();
    showSoundMsg(ok ? '🔊 正在按「' + soundLabel(id) + '」播放，可点「⏹ 停止响铃」提前结束'
                    : '⚠️ 浏览器阻止了声音，请先点击页面任意位置再试', ok);
  };
  document.getElementById('btnStopRing').onclick = function () {
    if (stopRing()) showSoundMsg('⏹ 已停止响铃', true);
  };

  setupCollapsibleCards();
  renderAll();

  // 首次点击/按键后解锁提醒音效（浏览器自动播放限制）
  document.addEventListener('click', ensureAudio, { once: true });
  document.addEventListener('keydown', ensureAudio, { once: true });

  // 显示当前脚本版本号：若页面顶部仍是 v? 或旧版本号，说明浏览器在用旧缓存
  var verEl = document.getElementById('appVer');
  if (verEl) verEl.textContent = 'v' + APP_VERSION;

  // 定时器：时钟每秒；活动提醒与上课预告每 REMIND_CHECK_MS 检查一次
  setInterval(updateClock, 1000);
  setInterval(function () { checkActivities(); checkClassNotice(); }, REMIND_CHECK_MS);
  // 后台标签页的定时器会被浏览器节流，回到页面时立刻补检查一次
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) { checkActivities(); checkClassNotice(); }
  });
  checkActivities();
  checkClassNotice();
}

document.addEventListener('DOMContentLoaded', init);
