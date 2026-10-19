/* =========================================================
 * data.js —— 学期配置 + 课表数据 + 配色方案
 * 说明：修改学期开始日期、节次时间、课程数据，改本文件即可
 * ========================================================= */

// 应用版本号：显示在页脚，用于确认浏览器加载的是最新脚本（旧缓存会显示旧版本）
var APP_VERSION = '2026.10.19-14';

// 学期第 1 周的周一日期（改学期起点请改这里）
var SEMESTER_START = '2026-09-07';

// 总周数：第 1-18 周为教学周，第 19-20 周为考试周
var TOTAL_WEEKS = 20;
var EXAM_WEEKS = [19, 20];

// 周一 ~ 周日
var WEEKDAY_NAMES = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

/* ---------- 法定节假日 ---------- */
// 依据《国务院办公厅关于 2026 年部分节假日安排的通知》（国办发明电〔2025〕7 号），
// 只列出落在本学期（2026-09-07 ~ 2027-01-24）区间内的假期。
// 节假日当天课表自动跳过，并在课表上标注节日名称。
var HOLIDAYS = [
  { start: '2026-09-25', end: '2026-09-27', name: '中秋节' },
  { start: '2026-10-01', end: '2026-10-07', name: '国庆节' },
  { start: '2027-01-01', end: '2027-01-03', name: '元旦' }
  // 说明：2027 年元旦 1 月 1 日为周五，与 1/2（周六）、1/3（周日）顺连成 3 天假；
  // 2027 年放假安排通知尚未发布，若届时新增调休，改这里即可。
];

// 调休上班/上课日：这些周末需要上课。
// 官方通知只说明"上班"，具体补哪一天的课以学校通知为准，
// 因此这里仅做标记，补课星期请在页面「调休补课」中自行指定。
var MAKEUP_DAYS = [
  { date: '2026-09-20', name: '国庆调休' },
  { date: '2026-10-10', name: '国庆调休' }
];

// 提醒音效可选清单（实际发声在 reminder.js 的 SOUND_PLAYERS）
// len = 该音效单次播放的大致时长（秒），用于计算重复响铃的间隔
var SOUNDS = [
  { id: 'dingdong', label: '🔔 叮咚（默认）', len: 0.7 },
  { id: 'chime',    label: '✨ 清亮铃音',     len: 0.95 },
  { id: 'up',       label: '📈 双音上行',     len: 0.5 },
  { id: 'bell',     label: '🛎 低沉钟声',     len: 1.15 },
  { id: 'urgent',   label: '⏰ 急促三连',     len: 0.4 },
  { id: 'drop',     label: '💧 水滴',         len: 0.35 },
  { id: 'birds',    label: '🐦 轻快鸟鸣',     len: 0.48 },
  { id: 'chord',    label: '🎵 和弦提示',     len: 0.75 },
  { id: 'none',     label: '🔇 静音',         len: 0 }
];

// 响铃时长可选清单：reps = 响几次；ms = 持续毫秒；loop = 一直响到手动停止
var RING_PRESETS = [
  { id: 'once',  label: '响 1 次',            reps: 1 },
  { id: 'twice', label: '响 2 次',            reps: 2 },
  { id: 'three', label: '响 3 次',            reps: 3 },
  { id: 's10',   label: '持续约 10 秒',        ms: 10000 },
  { id: 's30',   label: '持续约 30 秒',        ms: 30000 },
  { id: 's60',   label: '持续约 1 分钟',       ms: 60000 },
  { id: 'loop',  label: '一直响（手动停止）',   loop: true }
];

// 每天的节次数（第 1-12 节，逐节显示，不再合并成大节）
var TOTAL_PERIODS = 12;
// 晚自习所在的时段编号（PERIODS 的最后一项）
var NIGHT_PERIOD_NO = 13;

// 每天 13 个时段：第 1-12 节 + 晚自习（用于课表逐节显示与上课预告）
// 时间取自学校官方课表：1节 08:30-09:15、2节 09:20-10:05、3节 10:25-11:10、4节 11:15-12:00、
// 5节 14:00-14:45、6节 14:50-15:35、7节 15:45-16:30、8节 16:35-17:20、
// 9节 17:30-18:10、10节 18:15-18:55、11节 19:05-19:45、12节 19:45-20:30、晚自习 19:00-20:00
var PERIODS = [
  { no: 1,  label: '第1节',  start: '08:30', end: '09:15' },
  { no: 2,  label: '第2节',  start: '09:20', end: '10:05' },
  { no: 3,  label: '第3节',  start: '10:25', end: '11:10' },
  { no: 4,  label: '第4节',  start: '11:15', end: '12:00' },
  { no: 5,  label: '第5节',  start: '14:00', end: '14:45' },
  { no: 6,  label: '第6节',  start: '14:50', end: '15:35' },
  { no: 7,  label: '第7节',  start: '15:45', end: '16:30' },
  { no: 8,  label: '第8节',  start: '16:35', end: '17:20' },
  { no: 9,  label: '第9节',  start: '17:30', end: '18:10' },
  { no: 10, label: '第10节', start: '18:15', end: '18:55' },
  { no: 11, label: '第11节', start: '19:05', end: '19:45' },
  { no: 12, label: '第12节', start: '19:45', end: '20:30' },
  { no: NIGHT_PERIOD_NO, label: '晚自习', start: '19:00', end: '20:00' }
];

// 课程配色：同一课程固定用一种颜色，不同课程颜色不同
var PALETTE = [
  { main: '#4263eb', light: '#edf2ff' }, // 蓝
  { main: '#0ca678', light: '#e6fcf5' }, // 青
  { main: '#e8590c', light: '#fff4e6' }, // 橙
  { main: '#9c36b5', light: '#f8f0fc' }, // 紫
  { main: '#f08c00', light: '#fff9db' }, // 金
  { main: '#1098ad', light: '#e3fafc' }, // 湖蓝
  { main: '#e64980', light: '#fff0f6' }, // 粉
  { main: '#5f3dc4', light: '#f3f0ff' }, // 深紫
  { main: '#2b8a3e', light: '#ebfbee' }, // 绿
  { main: '#d9480f', light: '#fff0e6' }, // 砖红
  { main: '#1864ab', light: '#e7f5ff' }, // 深蓝
  { main: '#c2255c', light: '#fff0f6' }, // 玫红
  { main: '#74b816', light: '#f4fce3' }, // 草绿
  { main: '#0b7285', light: '#e3fafc' }, // 深青
  { main: '#495057', light: '#f1f3f5' }, // 石板灰
  { main: '#a61e4d', light: '#fce4ec' }  // 酒红
];

// 与配色一一对应的课程小图标（图文并茂）
var COURSE_ICONS = ['📐', '📗', '📙', '🧪', '⭐', '🌐', '🎨', '🧠', '🌿', '📝', '📘', '💡', '🔬', '🎯', '🎵', '🏆'];

/* ---------- 周次 / 节次 解析（供数据初始化与导入共用） ---------- */

// 把 "1-2周" / "3-4周,6-18周" / "3周,7-17周(单)" 解析成周次数组
// 返回 { list:[实际周次...], text:'显示文本' }，失败返回 null
function parseWeekSpec(spec) {
  var s = String(spec == null ? '' : spec).trim();
  if (!s) return null;
  var list = [];
  s.split(/[,，;；、]/).forEach(function (seg) {
    seg = seg.trim();
    if (!seg) return;
    var odd = seg.indexOf('单') >= 0;   // 单周
    var even = seg.indexOf('双') >= 0;  // 双周
    var a, b;
    var m = seg.match(/(\d+)\s*[-—~～至到]\s*(\d+)/);
    if (m) {
      a = Number(m[1]); b = Number(m[2]);
    } else {
      var m1 = seg.match(/(\d+)/);
      if (!m1) return;
      a = b = Number(m1[1]);
    }
    for (var w = a; w <= b; w++) {
      if (w < 1 || w > TOTAL_WEEKS) continue;
      if (odd && w % 2 === 0) continue;
      if (even && w % 2 === 1) continue;
      if (list.indexOf(w) < 0) list.push(w);
    }
  });
  if (!list.length) return null;
  list.sort(function (x, y) { return x - y; });
  return { list: list, text: s.replace(/（/g, '(').replace(/）/g, ')') };
}

// 把 "5-6节" / "第3节" / "5-10节" / "第三大节" / "晚自习" 解析成节次编号数组
// 返回节次编号数组，如 [5,6] 或 [5,6,7,8,9,10]；晚自习为 [13]；无法识别返回 []
function parsePeriodList(spec) {
  var s = String(spec == null ? '' : spec).trim();
  if (!s) return [];

  // 晚自习：本身就是一个独立时段（19:00-20:00）
  if (s.indexOf('晚自习') >= 0) return [NIGHT_PERIOD_NO];

  // 多段，如 1-2节,5-6节 / 3、4节
  if (/[,，、;；\/]/.test(s)) {
    var multi = [];
    s.split(/[,，、;；\/]/).forEach(function (seg) {
      parsePeriodList(seg).forEach(function (p) { if (multi.indexOf(p) < 0) multi.push(p); });
    });
    if (multi.length) return multi.sort(function (x, y) { return x - y; });
  }

  // 节次区间，如 5-6节 / 5-10节 / 1-12节
  var m = s.match(/(\d+)\s*[-—~～至到]\s*(\d+)/);
  if (m) {
    var a = Number(m[1]), b = Number(m[2]);
    var out = [];
    for (var p = 1; p <= TOTAL_PERIODS; p++) {
      if (p >= a && p <= b) out.push(p);
    }
    if (out.length) return out;
  }

  // 中文大节，如「第三大节」等价于 5-6 节
  var cnMap = { '第一大节': [1, 2],   '第二大节': [3, 4],   '第三大节': [5, 6],
                '第四大节': [7, 8],   '第五大节': [9, 10],  '第六大节': [11, 12] };
  if (cnMap[s]) return cnMap[s].slice();

  // 单个节次，如 3 / 3节 / 第3节
  var m1 = s.match(/^\s*第?\s*(\d+)\s*节?\s*$/) || s.match(/(\d+)\s*节/);
  if (m1) {
    var n = Number(m1[1]);
    if (n >= 1 && n <= TOTAL_PERIODS) return [n];
  }

  // 时段关键词
  if (s.indexOf('上午') >= 0) return [1, 2];
  if (s.indexOf('下午') >= 0) return [5, 6];
  if (s.indexOf('晚上') >= 0 || s.indexOf('晚间') >= 0) return [9, 10];
  return [];
}

/* ---------- 本学期课表数据 ---------- */
// 字段说明：
//   name 课程名 / teacher 教师 / location 教室 / day 星期 1-7（1=周一 … 7=周日）
//   periodSpec 上课节次文本（逐节，如 '5-6节'、'5-10节'、'晚自习'）
//   weekSpec   上课周次文本（支持多段与单双周，如 '3-4周,6-18周'）
//   type       'normal' 教学课 | 'exam' 考试（默认 normal）
var DEFAULT_COURSES = [
  { name: '军事理论', teacher: '薛领', location: '日新楼阶102', day: 1, periodSpec: '5-6节', weekSpec: '1-2周' },
  { name: '军事理论', teacher: '薛领', location: '日新楼阶102', day: 4, periodSpec: '5-6节', weekSpec: '1-2周' },

  { name: 'Web前端编程技术', teacher: '陈健', location: '信息楼105（云计算技术）', day: 1, periodSpec: '3-4节', weekSpec: '3-4周,6-18周' },
  { name: 'Web前端编程技术', teacher: '陈健', location: '信息楼105（云计算技术）', day: 4, periodSpec: '3-4节', weekSpec: '3周,5-18周' },
  { name: 'Web前端编程技术', teacher: '陈健', location: '信息楼105（云计算技术）', day: 3, periodSpec: '5-6节', weekSpec: '17周' },

  { name: '公共外语I（英语综合）', teacher: '代天善', location: '日新楼北601', day: 1, periodSpec: '5-6节', weekSpec: '3-4周,6-18周' },
  { name: '公共外语I（英语听说）', teacher: 'OXLEY MARK ANDREW', location: '日新楼北603', day: 1, periodSpec: '7-8节', weekSpec: '3周,7-17周(单)' },

  { name: '思想道德与法治', teacher: '穆燕', location: '日新楼北602', day: 2, periodSpec: '1-2节', weekSpec: '3-4周,6-12周' },
  { name: '思想道德与法治', teacher: '穆燕', location: '日新楼北602', day: 5, periodSpec: '3-4节', weekSpec: '5-11周' },

  { name: '程序设计基础', teacher: '薛海燕', location: '信息楼102（大数据技术实训室）', day: 2, periodSpec: '3-4节', weekSpec: '3-4周,6-16周' },
  { name: '程序设计基础', teacher: '薛海燕', location: '信息楼102（大数据技术实训室）', day: 4, periodSpec: '1-2节', weekSpec: '3周,5-16周' },
  { name: '程序设计基础', teacher: '薛海燕', location: '信息楼102（大数据技术实训室）', day: 4, periodSpec: '7-8节', weekSpec: '3周,6-7周,9-10周' },

  { name: '体育与健康1', teacher: '肖世程', location: 'D1体育馆羽毛球场', day: 5, periodSpec: '5-6节', weekSpec: '5-16周,18周' },

  { name: '大学生心理健康教育（1）', teacher: '杨凯烽', location: '日新楼南606', day: 1, periodSpec: '1-2节', weekSpec: '6-8周' },

  { name: '大学生安全教育与应急处理训练', teacher: '赵方诗怡', location: '', day: 1, periodSpec: '11-11节', weekSpec: '6周' },
  { name: '大学生安全教育与应急处理训练', teacher: '赵方诗怡', location: '', day: 1, periodSpec: '11-11节', weekSpec: '16周' },

  { name: '军事理论', teacher: '薛领', location: '日新楼阶202', day: 3, periodSpec: '1-2节', weekSpec: '6-10周' },

  { name: '人工智能引论', teacher: '张立', location: '日新楼北604', day: 4, periodSpec: '5-6节', weekSpec: '6-7周,9周,13-18周' },
  { name: '人工智能引论', teacher: '张立', location: '日新楼北604', day: 1, periodSpec: '1-2节', weekSpec: '13-18周' },

  { name: '大学生职业规划与就业指导（1）', teacher: '周婷', location: '日新楼阶202', day: 3, periodSpec: '1-2节', weekSpec: '11-13周' },

  { name: '体测（1）', teacher: '王浩峰', location: 'D15田径场', day: 6, periodSpec: '9-10节', weekSpec: '11-12周', note: '原表备注：课表时间不上课' },

  { name: '走在前列的广东实践', teacher: '穆燕', location: '日新楼北602', day: 5, periodSpec: '3-4节', weekSpec: '12-14周' },
  { name: '走在前列的广东实践', teacher: '穆燕', location: '日新楼北602', day: 2, periodSpec: '1-2节', weekSpec: '13-14周' },
  { name: '走在前列的广东实践', teacher: '穆燕', location: '校外实训基地', day: 2, periodSpec: '5-10节', weekSpec: '13周' },

  { name: '形势与政策1', teacher: '江梓豪', location: '日新楼阶202', day: 2, periodSpec: '1-2节', weekSpec: '15-18周' },

  // 晚自习：周一、周二、周四 19:00-20:00（第 1-18 教学周）
  { name: '晚自习', teacher: '', location: '', day: 1, periodSpec: '晚自习', weekSpec: '1-18周' },
  { name: '晚自习', teacher: '', location: '', day: 2, periodSpec: '晚自习', weekSpec: '1-18周' },
  { name: '晚自习', teacher: '', location: '', day: 4, periodSpec: '晚自习', weekSpec: '1-18周' }
];
