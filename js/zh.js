/* 中文 for SwishTT Shot: the words on the page, the toasts, the banners and the ? panel (Kit.lang, from kit/lang.js).
   The kids' names and the game's name (the logo, the title on the scoreboard) stay in English on purpose.
   Canvas text (the scoreboard's SCORE / TIME / ROUND, the SHOOT! sign on the machine) goes through Kit.lang.t in
   js/arena.js. */
(function () {
  const L = Kit.lang;
  L.keep(['SwishTT Shot', 'TEDDY', 'TOMMY', 'Teddy', 'Tommy', 'ZOOM', 'LUNA', 'BOLT', 'BRUNO', 'Claude Code', 'P · Esc', 'Esc']);

  L.add({
    // title screen
    "Swipe up to shoot! Make 3 in a row and you're ON FIRE. Call your brother to rebound for you.":
      '往上滑就能投篮！连进 3 个就火力全开。还可以叫兄弟来帮你抢篮板！',
    'PICK YOUR SHOOTER': '选择投手', 'Pick your shooter': '选择投手', 'ZOMBIE': '僵尸', 'How hard': '难度',
    '🐣 EASY': '🐣 简单', '🏀 NORMAL': '🏀 普通',
    '🖱️ drag up and let go to shoot': '🖱️ 按住鼠标往上拖，松开就投篮',
    'or hold': '或者按住', 'to charge,': '蓄力，', 'to aim': '瞄准', 'call': '叫', 'easy': '简单', 'sound': '声音',
    '👆 swipe up toward the hoop: a longer swipe throws farther': '👆 朝篮筐往上滑：滑得越长，投得越远',
    "'S BEST": ' 的最高分',
    // HUD and buttons (and their tooltips)
    '🔥 ON FIRE ×2 🔥': '🔥 火力全开 ×2 🔥',
    "3 in a row and you're ON FIRE": '连进 3 个就火力全开',
    'Your buddy is rebounding': '兄弟在帮你抢篮板',
    'Pause (P)': '暂停 (P)', 'Sound (M)': '声音 (M)', 'Call your buddy (T)': '叫兄弟来帮忙 (T)',
    // round banners
    'GET READY!': '准备好！', 'THE HOOP IS MOVING!': '篮筐会动啦！', 'HERE WE GO!': '开始啦！',
    'GOAL': '目标', 'POINTS': '分', 'ROUND CLEAR!': '过关啦！', "TIME'S UP!": '时间到！', 'SO CLOSE!': '差一点点！',
    // toasts while playing
    'SWISH!': '唰！空心球！', 'FIRE SWISH!': '火焰空心球！', '🔥 ON FIRE! 🔥': '🔥 火力全开！🔥', 'BUZZER BEATER!': '压哨球！',
    'GOAL REACHED! KEEP GOING!': '达到目标啦！继续投！', "FIRE'S OUT, KEEP SHOOTING!": '火灭了，继续投！',
    'SWIPE UP TOWARD THE HOOP!': '朝篮筐往上滑！', 'DRAG UP AND LET GO! (OR HOLD SPACE)': '往上拖，再松开！（或者按住空格）',
    // pause and game over
    '🏠 MENU': '🏠 菜单',
    'SUPERSTAR!': '超级明星！', 'GREAT SHOOTING!': '投得真棒！', 'NICE SHOOTING!': '投得不错！', 'GOOD TRY!': '试得很好！',
    'ROUNDS CLEARED': '过了几轮', 'BASKETS': '进球', 'SWISHES': '空心球', 'BEST STREAK': '最多连进',
    '★ NEW BEST! ★': '★ 新纪录！★', '↻ PLAY AGAIN': '↻ 再玩一次', '🏀 CHANGE SHOOTER': '🏀 换投手',
    'LOADING…': '加载中…',
    // canvas: the scoreboard and the sign on the front of the machine
    'TIME': '时间', 'PLAY ME!': '来玩吧！', 'SHOOT!': '投篮！',
    // the ? panel (js/keys.js)
    'shoot: hold, then let go': '投篮：按住，再松开', 'aim': '瞄准', 'power': '力量',
    'call your brother to rebound': '叫兄弟来帮你抢篮板', 'pick your shooter (title)': '选投手（标题页）',
    'easy or normal (title)': '简单或普通（标题页）', 'start · play again': '开始 · 再玩一次',
    "Swipe up to shoot: sideways aims, and a longer swipe shoots harder. Tap your brother's face (bottom right) to call him.":
      '往上滑就投篮：往旁边偏是瞄准，滑得越长投得越用力。点右下角兄弟的头像，叫他来帮忙。',
  });

  const TREAT = { 'ICE CREAM': '冰淇淋', WATER: '水', 'JUICE BOX': '果汁', COOKIE: '饼干', WATERMELON: '西瓜', BANANA: '香蕉' };
  L.rule(/^(.+)'S BEST$/, (m, who) => `${L.t(who)} 的最高分`); // ZOMBIE'S BEST -> 僵尸 的最高分
  L.rule(/^BEST (\d+)$/, '最高分 $1');
  L.rule(/^ROUND (\d+)$/, '第 $1 轮');
  L.rule(/^GOAL (\d+)$/, '目标 $1');
  L.rule(/^(\d+) POINTS · NEXT:$/, '$1 分 · 下一轮：');
  L.rule(/^(\d+) OF$/, '$1 /');
  L.rule(/^Call (.+) to rebound \(T\)$/, '叫 $1 来抢篮板 (T)');
  L.rule(/^(.+) IS HERE TO REBOUND!$/, '$1 来帮你抢篮板啦！');
  L.rule(/^(.+) IS BACK!$/, '$1 回来啦！');
  L.rule(/^(.+) SAVED YOUR STREAK!$/, '$1 帮你保住了连进！');
  L.rule(/^(\S+) (ICE CREAM|WATER|JUICE BOX|COOKIE|WATERMELON|BANANA) FROM (.+)!$/, (m, emoji, item, who) => `${emoji} ${who} 送来的${TREAT[item]}！`);
})();
