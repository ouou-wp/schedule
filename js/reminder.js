/* =========================================================
 * reminder.js —— 活动提醒 + 上课提前预告 + 提醒音效（Web Audio）
 * 音效无需外部音频文件；浏览器要求先点击页面一次才允许出声
 * ========================================================= */

var REMIND_CHECK_MS = 5000;    // 每 5 秒检查一次提醒（越小越准时）
var LATE_GRACE_MS = 30 * 60000; // 迟到多久内仍补提醒（页面没开/后台被节流/电脑休眠）
var CLASS_NOTICE_LEAD_MIN = 10; // 上课提前 10 分钟预告

var audioCtx = null;

// 解锁/恢复音频上下文（需用户手势触发一次）
function ensureAudio() {
  try {
    if (!audioCtx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (AC) audioCtx = new AC();
    }
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
  } catch (e) {}
}

// 正在发声的音符节点（{osc, gain}），用于「停止响铃」时立即掐断
var liveNodes = [];

// 单个音符：type 波形 / freq 频率 / slideTo 滑音终点 / vol 音量
function tone(o) {
  var osc = audioCtx.createOscillator();
  var g = audioCtx.createGain();
  var vol = o.vol == null ? 0.3 : o.vol;
  osc.type = o.type || 'sine';
  osc.frequency.setValueAtTime(o.freq, o.t0);
  if (o.slideTo) osc.frequency.exponentialRampToValueAtTime(o.slideTo, o.t0 + o.dur);
  g.gain.setValueAtTime(0.0001, o.t0);
  g.gain.exponentialRampToValueAtTime(vol, o.t0 + (o.attack || 0.02));
  g.gain.exponentialRampToValueAtTime(0.0001, o.t0 + o.dur);
  osc.connect(g);
  g.connect(audioCtx.destination);
  var node = { osc: osc, gain: g };
  liveNodes.push(node);
  osc.onended = function () {
    var i = liveNodes.indexOf(node);
    if (i >= 0) liveNodes.splice(i, 1);
  };
  osc.start(o.t0);
  osc.stop(o.t0 + o.dur + 0.05);
}

// 各种音效的合成方式：t 为起始时间
var SOUND_PLAYERS = {
  // 三声"叮咚"，最后一声音调更高
  dingdong: function (t) {
    tone({ freq: 880, t0: t, dur: 0.18 });
    tone({ freq: 880, t0: t + 0.22, dur: 0.18 });
    tone({ freq: 988, t0: t + 0.44, dur: 0.22 });
  },
  // 清亮铃音：高音三角波，余韵较长
  chime: function (t) {
    tone({ freq: 1568, t0: t, dur: 0.9, type: 'triangle', vol: 0.22 });
    tone({ freq: 2093, t0: t + 0.02, dur: 0.7, type: 'triangle', vol: 0.1 });
  },
  // 双音上行
  up: function (t) {
    tone({ freq: 659, t0: t, dur: 0.16, type: 'triangle', vol: 0.28 });
    tone({ freq: 988, t0: t + 0.16, dur: 0.3, type: 'triangle', vol: 0.28 });
  },
  // 低沉钟声：低频叠加泛音
  bell: function (t) {
    tone({ freq: 220, t0: t, dur: 1.1, vol: 0.28 });
    tone({ freq: 330, t0: t, dur: 0.9, vol: 0.13 });
    tone({ freq: 554, t0: t + 0.02, dur: 0.5, vol: 0.07 });
  },
  // 急促三连
  urgent: function (t) {
    for (var i = 0; i < 3; i++) {
      tone({ freq: 1046, t0: t + i * 0.14, dur: 0.1, type: 'square', vol: 0.16 });
    }
  },
  // 水滴：下滑音
  drop: function (t) {
    tone({ freq: 1300, slideTo: 520, t0: t, dur: 0.3, vol: 0.26 });
  },
  // 轻快鸟鸣：两段上滑 + 一段下滑
  birds: function (t) {
    tone({ freq: 1800, slideTo: 2600, t0: t, dur: 0.12, vol: 0.18 });
    tone({ freq: 2200, slideTo: 1500, t0: t + 0.14, dur: 0.12, vol: 0.16 });
    tone({ freq: 1900, slideTo: 2800, t0: t + 0.3, dur: 0.14, vol: 0.16 });
  },
  // 和弦提示：三音同时奏响
  chord: function (t) {
    tone({ freq: 523, t0: t, dur: 0.7, type: 'triangle', vol: 0.16 });
    tone({ freq: 659, t0: t, dur: 0.7, type: 'triangle', vol: 0.14 });
    tone({ freq: 784, t0: t, dur: 0.7, type: 'triangle', vol: 0.12 });
  },
  // 静音
  none: function () {}
};

// 提醒音：按所选「响铃时长」重复播放所选音效
function playSound() {
  return startRing();
}

/* ---------- 响铃时长（重复播放 / 定时停止） ---------- */

var ringSession = null; // { timer, id }
var ringGen = 0;        // 响铃代次：每次停止/重开都 +1，用于作废上一次的排期

// 取音效显示名
function soundLabel(id) {
  for (var i = 0; i < SOUNDS.length; i++) {
    if (SOUNDS[i].id === id) return SOUNDS[i].label.replace(/^[^\u4e00-\u9fa5A-Za-z0-9]+\s*/, '');
  }
  return id;
}

// 取音效单次时长（秒）
function soundLen(id) {
  for (var i = 0; i < SOUNDS.length; i++) {
    if (SOUNDS[i].id === id) return SOUNDS[i].len || 0.7;
  }
  return 0.7;
}

// 取响铃时长预设
function ringPresetOf(id) {
  for (var i = 0; i < RING_PRESETS.length; i++) {
    if (RING_PRESETS[i].id === id) return RING_PRESETS[i];
  }
  return RING_PRESETS[0];
}

// 停止响铃（掐断所有正在发声 / 已排期的音符）
function stopRing() {
  var was = !!ringSession;
  ringGen++;                     // 作废上一次的排期，避免停止后又被唤醒
  if (ringSession) {
    clearTimeout(ringSession.timer);
    ringSession = null;
  }
  // 先静音再停止：部分浏览器对「已排期但尚未开始」的振荡器 stop(0) 不生效
  liveNodes.forEach(function (n) {
    try {
      n.gain.gain.cancelScheduledValues(0);
      n.gain.gain.setValueAtTime(0, 0);
      n.gain.disconnect();
    } catch (e) {}
    try { n.osc.stop(0); } catch (e) {}
  });
  liveNodes = [];
  updateRingUI();
  return was;
}

// 开始响铃；返回是否已开始（或已排队等待音频解锁）
function startRing() {
  stopRing();                    // 无论能否发声，先掐掉上一个，避免声音叠加
  var myGen = ringGen;           // 本次响铃的代次，被停止后立即失效

  ensureAudio();
  if (!audioCtx) return false;

  var id = (state && state.sound) || 'dingdong';
  if (id === 'none') return false;

  // resume() 是异步的：首次交互时 state 可能还是 suspended，
  // 直接返回会导致「切换音效后没声音」，因此等它真正 running 再响。
  if (audioCtx.state !== 'running') {
    audioCtx.resume().then(function () {
      if (ringGen === myGen && audioCtx.state === 'running') beginRing(id, myGen);
    }).catch(function () {});
    return true;
  }
  beginRing(id, myGen);
  return true;
}

// 真正开始按所选响铃时长排期发声
function beginRing(id, myGen) {
  if (ringGen !== myGen) return;                       // 期间已被停止 / 切换，放弃
  var preset = ringPresetOf((state && state.ring) || 'once');
  var gap = soundLen(id) + 0.8;      // 两次之间的间隔
  var session = { timer: null, id: id };
  ringSession = session;

  if (preset.reps) {
    // 固定次数：一次性排好，之后自动收尾
    for (var i = 0; i < preset.reps; i++) {
      try { SOUND_PLAYERS[id](audioCtx.currentTime + 0.02 + i * gap); } catch (e) {}
    }
    session.timer = setTimeout(function () {
      if (ringSession === session) { ringSession = null; updateRingUI(); }
    }, ((preset.reps - 1) * gap + soundLen(id)) * 1000 + 200);
  } else {
    // 持续时长 / 一直响：按间隔反复触发，到点或手动停止
    var deadline = preset.ms ? Date.now() + preset.ms : Infinity;
    var tick = function () {
      if (ringSession !== session || ringGen !== myGen) return;
      if (Date.now() >= deadline) { stopRing(); return; }
      try { SOUND_PLAYERS[id](audioCtx.currentTime + 0.02); } catch (e) {}
      session.timer = setTimeout(tick, gap * 1000);
    };
    tick();
  }

  updateRingUI();
}

function updateRingUI() {
  var b = document.getElementById('btnStopRing');
  if (b) b.disabled = !ringSession;
}

/* ---------- 音效选择 UI ---------- */

var soundMsgTimer = null;
function showSoundMsg(text, ok) {
  var m = document.getElementById('soundMsg');
  if (!m) return;
  m.textContent = text;
  m.className = 'form-msg ' + (ok ? 'ok' : 'err');
  clearTimeout(soundMsgTimer);
  soundMsgTimer = setTimeout(function () { m.textContent = ''; }, 4000);
}

// 填充「提醒音效」下拉；切换后先停掉上一个，再按所选响铃时长播放
function renderSoundOptions() {
  var sel = document.getElementById('soundSel');
  if (!sel) return;
  sel.innerHTML = SOUNDS.map(function (s) {
    return '<option value="' + s.id + '">' + s.label + '</option>';
  }).join('');
  var cur = (state && state.sound) || 'dingdong';
  var known = SOUNDS.some(function (s) { return s.id === cur; });
  sel.value = known ? cur : 'dingdong';

  sel.onchange = function () {
    state.sound = sel.value;
    saveState(state);
    var ok = startRing(); // startRing 内部会先停止上一个音效，再按所选时长播放
    if (sel.value === 'none') {
      showSoundMsg('🔇 已选择静音，不会有提示音', true);
    } else if (ok) {
      showSoundMsg('🔊 已切换到「' + soundLabel(sel.value) + '」，按所选响铃时长播放', true);
    } else {
      showSoundMsg('⚠️ 浏览器阻止了声音，请先点击页面任意位置再试', false);
    }
  };
}

// 填充「响铃时长」下拉；切换后即时保存（不发出提示音，避免干扰）
function renderRingOptions() {
  var sel = document.getElementById('ringDur');
  if (!sel) return;
  sel.innerHTML = RING_PRESETS.map(function (p) {
    return '<option value="' + p.id + '">' + p.label + '</option>';
  }).join('');
  var cur = (state && state.ring) || 'once';
  var known = RING_PRESETS.some(function (p) { return p.id === cur; });
  sel.value = known ? cur : 'once';

  sel.onchange = function () {
    state.ring = sel.value;
    saveState(state);
    showSoundMsg('已选择「' + sel.options[sel.selectedIndex].textContent + '」，到点提醒时按此时长响铃', true);
  };
  updateRingUI();
}

/* ---------- 顶部提醒横幅 ---------- */

var bannerTimer = null;

// 顶部提醒横幅；opts = { type:'alert'|'info', icon, hold:毫秒 }
function showBanner(title, text, opts) {
  var o = opts || {};
  var b = document.getElementById('banner');
  var icon = document.getElementById('bannerIcon');
  b.classList.toggle('alert', o.type === 'alert');
  document.getElementById('bannerTitle').textContent = title;
  document.getElementById('bannerText').textContent = text;
  if (icon) icon.textContent = o.icon || (o.type === 'alert' ? '⏰' : '🔔');
  b.classList.remove('show');
  void b.offsetWidth;            // 触发重排，确保连续提醒时动画重新播放
  b.classList.add('show');
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(hideBanner, o.hold || 15000);
}

function hideBanner() {
  document.getElementById('banner').classList.remove('show');
}

/* ---------- 提醒记录 ---------- */

function addLog(text) {
  state.log.unshift({ time: new Date().toISOString(), text: text });
  if (state.log.length > 50) state.log.length = 50;
  saveState(state);
  renderLog();
}

/* ---------- 活动提醒：到点弹窗 + 响铃 ---------- */

function checkActivities() {
  var now = Date.now(), changed = false;
  state.activities.forEach(function (a) {
    var t = new Date(a.time).getTime();
    if (isNaN(t) || a.reminded) return;
    var lead = (a.remindBefore || 0) * 60000;
    if (now < t - lead) return;                    // 还没到提醒时间
    if (now - t > LATE_GRACE_MS) {                 // 太久以前的活动，不再打扰
      a.reminded = true; changed = true;
      return;
    }
    // 到点（或错过不久）→ 提醒。超过 1 分钟说明检查被延迟了（页面没开、
    // 后台标签被浏览器节流、电脑休眠），此时仍然补一次提醒而不是静默丢弃。
    var late = now - t > 60000;
    var title = (late ? '⚠️ 迟到的提醒 · ' : '活动提醒 · ') + a.title;
    var text = late ? '原定 ' + fmtMDHM(a.time) + '，已错过，请尽快处理'
                    : '时间：' + fmtMDHM(a.time) + '　请及时处理';
    // 先确保提醒确实展示出来，再标记已提醒：
    // 否则一旦中间抛异常，活动会被永久标记为已提醒、再也不触发。
    try {
      showBanner(title, text, { type: 'alert', icon: late ? '⚠️' : '⏰', hold: 60000 });
      playSound();
    } catch (e) {}
    try { addLog((late ? '迟到提醒：' : '活动提醒：') + a.title); } catch (e) {}
    a.reminded = true; changed = true;
  });
  if (changed) { saveState(state); renderActivities(); }
}

/* ---------- 上课提前预告：每节课开始前 10 分钟 ---------- */

function checkClassNotice() {
  var r = calcRealWeek();
  if (r.status !== 'in') return;
  var now = new Date();
  // JS getDay()：0=周日，1=周一 … 6=周六；本应用：1=周一 … 7=周日
  var jsDay = now.getDay();
  var today = todayStr(now);
  if (holidayOf(today)) return;                       // 法定节假日不上课，不预告
  // 调休日按「补课星期」的课表预告
  var day = effectiveDayOf(today, jsDay === 0 ? 7 : jsDay);

  // 清理非今天的预告标记
  Object.keys(state.announced).forEach(function (k) {
    if (k.indexOf(today) !== 0) delete state.announced[k];
  });

  var nowMin = now.getHours() * 60 + now.getMinutes();

  // 收集当前窗口内需要预告的课，按大节合并（同一大节只响一次）
  var byPeriod = {};
  state.arrangements.forEach(function (a) {
    if (a.day !== day) return;
    if (weeksOf(a).indexOf(r.week) < 0) return;
    var p = PERIODS[a.period - 1];
    if (!p) return;
    var startMin = toMin(p.start);
    if (nowMin >= startMin - CLASS_NOTICE_LEAD_MIN && nowMin < startMin) {
      var key = today + '|' + a.day + '|' + a.period;
      if (!state.announced[key]) {
        if (!byPeriod[a.period]) byPeriod[a.period] = { p: p, names: [], locs: [] };
        byPeriod[a.period].names.push(a.name);
        if (byPeriod[a.period].locs.indexOf(a.location) === -1) byPeriod[a.period].locs.push(a.location);
      }
    }
  });

  var hit = false;
  Object.keys(byPeriod).forEach(function (pk) {
    var it = byPeriod[pk];
    var key = today + '|' + day + '|' + pk;
    state.announced[key] = 1;
    hit = true;
    playSound();
    showBanner('🔔 上课预告',
      '《' + it.names.join('》《') + '》 将于 ' + it.p.start + ' 在 ' + it.locs.join(' / ') + ' 开始',
      { icon: '🔔' });
    addLog('上课预告：《' + it.names.join('》《') + '》 ' + it.p.start + ' @' + it.locs.join('/'));
  });

  if (hit) { saveState(state); renderLog(); }
}
