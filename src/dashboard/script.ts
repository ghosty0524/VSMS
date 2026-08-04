export const DASHBOARD_JS = `
(function() {
  var MS_PER_DAY = 86400000;
  var LEFT_W     = 260;
  var ROW_H      = 46;
  var HEADER_H   = 90;
  var HEADER_MONTH = 30;
  var HEADER_WEEK  = 20;
  var HEADER_DAY   = 40;
  var PX_PER_DAY = 22;
  var DAY_LABELS = ['日','一','二','三','四','五','六'];

  var UNIT_COLORS  = { 'SIT-HW':'#4A90D9','SIT-SW':'#F472B6','RA':'#F5A623','SI':'#9B59B6' };
  var EXTRA_COLORS = ['#E74C3C','#1ABC9C','#E67E22','#2ECC71','#E91E63'];
  var OVERFLOW_COLOR = '#86EFAC';
  var STATUS_COLORS = {
    'Completed': { bg:'#D1FAE5', text:'#065F46' },
    'Delayed':   { bg:'#FEE2E2', text:'#991B1B' },
    'Testing':   { bg:'#DBEAFE', text:'#1E40AF' },
    'Planned':   { bg:'#F1F5F9', text:'#475569' },
    'Cancelled': { bg:'#111827', text:'#F9FAFB' },
  };
  /* 狀態非顏色指示：色弱使用者可藉符號辨識。對照 src/components/schedule/GanttChart.tsx 的 STATUS_GLYPH */
  var STATUS_GLYPH = {
    'Cancelled': '✕', 'Completed': '✓', 'Delayed': '!', 'Testing': '▶', 'Planned': '○',
  };

  /* ── 工具函式 ── */
  /* 顏色解析：與主系統 src/lib/colors.ts 同規則。
     OPTIONS 由匯出時整份序列化帶入，故自訂色會一併帶出。 */
  var LIGHTNESS_OFFSETS = [0, 14, -12, 24, -20, 8, -6, 32];

  function hexToHsl(hex) {
    var h = hex.replace('#','');
    var r = parseInt(h.slice(0,2),16)/255, g = parseInt(h.slice(2,4),16)/255, b = parseInt(h.slice(4,6),16)/255;
    var max = Math.max(r,g,b), min = Math.min(r,g,b), l = (max+min)/2;
    if (max === min) return { h:0, s:0, l:l*100 };
    var d = max-min;
    var s = l > 0.5 ? d/(2-max-min) : d/(max+min);
    var hh;
    if (max === r) hh = ((g-b)/d + (g<b ? 6 : 0))/6;
    else if (max === g) hh = ((b-r)/d + 2)/6;
    else hh = ((r-g)/d + 4)/6;
    return { h: hh*360, s: s*100, l: l*100 };
  }

  function hslToHex(h, s, l) {
    var sN = s/100, lN = l/100;
    var c = (1-Math.abs(2*lN-1))*sN;
    var x = c*(1-Math.abs(((h/60)%2)-1));
    var m = lN - c/2;
    var seg = Math.floor((((h%360)+360)%360)/60);
    var rgb = seg===0?[c,x,0]:seg===1?[x,c,0]:seg===2?[0,c,x]:seg===3?[0,x,c]:seg===4?[x,0,c]:[c,0,x];
    return '#' + rgb.map(function(v){
      var n = Math.round((v+m)*255).toString(16);
      return n.length < 2 ? '0'+n : n;
    }).join('');
  }

  function relLum(hex) {
    var h = hex.replace('#','');
    var ch = [0,2,4].map(function(i){
      var v = parseInt(h.slice(i,i+2),16)/255;
      return v <= 0.03928 ? v/12.92 : Math.pow((v+0.055)/1.055, 2.4);
    });
    return 0.2126*ch[0] + 0.7152*ch[1] + 0.0722*ch[2];
  }

  function contrast(a, b) {
    var la = relLum(a), lb = relLum(b);
    var hi = Math.max(la, lb), lo = Math.min(la, lb);
    return (hi+0.05)/(lo+0.05);
  }

  function textColorOn(bg) {
    return contrast(bg, '#1e293b') >= contrast(bg, '#ffffff') ? '#1e293b' : '#ffffff';
  }

  function getColor(unit, allUnits) {
    var units = OPTIONS.testUnits || [];
    for (var i = 0; i < units.length; i++) {
      if (units[i].value === unit && units[i].color) return units[i].color;
    }
    if (UNIT_COLORS[unit]) return UNIT_COLORS[unit];
    var extras = allUnits.filter(function(u){ return !UNIT_COLORS[u]; });
    var idx = extras.indexOf(unit);
    return EXTRA_COLORS[(idx < 0 ? 0 : idx) % EXTRA_COLORS.length];
  }

  function getEngineerColor(engineer, unitValue, allUnits) {
    var units = OPTIONS.testUnits || [];
    var unit = null;
    for (var i = 0; i < units.length; i++) {
      if (units[i].value === unitValue) { unit = units[i]; break; }
    }
    if (!unit) {
      for (var j = 0; j < units.length; j++) {
        var engs = units[j].engineers || [];
        for (var k = 0; k < engs.length; k++) {
          if (engs[k].value === engineer) { unit = units[j]; break; }
        }
        if (unit) break;
      }
    }
    if (!unit) return getColor(unitValue, allUnits);
    var list = unit.engineers || [];
    for (var m = 0; m < list.length; m++) {
      if (list[m].value === engineer) {
        if (list[m].color) return list[m].color;
        var base = getColor(unit.value, allUnits);
        var hsl = hexToHsl(base);
        var off = LIGHTNESS_OFFSETS[m % LIGHTNESS_OFFSETS.length];
        return hslToHex(hsl.h, hsl.s, Math.min(88, Math.max(24, hsl.l + off)));
      }
    }
    return getColor(unit.value, allUnits);
  }
  function parseDate(s) {
    var p = s.split('/').map(Number);
    return new Date(p[0], p[1]-1, p[2]);
  }
  function daysBetween(a, b) { return Math.round((b - a) / MS_PER_DAY); }
  function pad2(n) { return n < 10 ? '0'+n : ''+n; }
  function isRestDay(d) {
    var cfg = OPTIONS.restDays || { weekends: true, specificDates: [] };
    var wd = d.getDay();
    if (cfg.weekends && (wd === 0 || wd === 6)) return true;
    var key = d.getFullYear()+'/'+pad2(d.getMonth()+1)+'/'+pad2(d.getDate());
    var dates = cfg.specificDates || [];
    for (var i = 0; i < dates.length; i++) { if (dates[i] === key) return true; }
    return false;
  }
  function computeStatus(s) {
    if (s.isCancelled) return 'Cancelled';
    if (s.isCompleted) return 'Completed';
    if (s.isDelayed)   return 'Delayed';
    var today = new Date(); today.setHours(0,0,0,0);
    var start = parseDate(s.startDate);
    // 已開始（含逾期）但未勾 Completed/Delayed → 維持 Testing
    if (today >= start) return 'Testing';
    return 'Planned';
  }
  function escapeHtml(s) {
    return String(s)
      .replace(/&/g,'&amp;')
      .replace(/</g,'&lt;')
      .replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;');
  }

  /* ── 測試單位自訂排序 ── */
  var UNIT_ORDER = { 'SI':0, 'RA':1, 'SIT-SW':2, 'SIT-HW':3 };
  function getUnitOrder(unit) {
    return UNIT_ORDER[unit] !== undefined ? UNIT_ORDER[unit] : 99;
  }

  /* ── 預設排序：測試單位 → 測試人員 → 開始時間 ── */
  function defaultSort(a, b) {
    var u = getUnitOrder(a.testUnit) - getUnitOrder(b.testUnit);
    if (u !== 0) return u;
    if (a.testEngineer < b.testEngineer) return -1;
    if (a.testEngineer > b.testEngineer) return 1;
    if (a.startDate < b.startDate) return -1;
    if (a.startDate > b.startDate) return 1;
    return 0;
  }

  /* ── 計算 timeResource 工作天的日曆天 offset ── */
  function getWorkDayOffset(startDate, workDays) {
    if (!workDays || workDays <= 0) return 0;
    var count = 0, offset = 0;
    var d = new Date(startDate.getTime());
    while (true) {
      if (!isRestDay(d)) {
        count++;
        if (count >= workDays) return offset + 1;
      }
      offset++;
      d.setDate(d.getDate() + 1);
    }
  }

  /* ── 工程師 value → label 對照 ── */
  var engineerMap = {};
  (OPTIONS.testUnits || []).forEach(function(u) {
    (u.engineers || []).forEach(function(e) { engineerMap[e.value] = e.label; });
  });
  function engLabel(value) { return engineerMap[value] || value; }

  /* ── 全域狀態 ── */
  var state = {
    categories:[], testUnits:[], testEngineers:[],
    hiddenStatuses:['Completed','Cancelled'],
    projectSearch:'',
    startFrom:'', endFrom:'',
    sortField:'', sortDir:'asc'
  };

  /* ── 甘特圖收合 ── */
  var ganttCollapsed = false;
  document.getElementById('gantt-toggle').addEventListener('click', function() {
    ganttCollapsed = !ganttCollapsed;
    var scroll = document.getElementById('gantt-scroll');
    var arrow  = document.getElementById('gantt-toggle-arrow');
    scroll.classList.toggle('collapsed', ganttCollapsed);
    if (ganttCollapsed) {
      scroll.style.display = 'none';
    } else {
      scroll.style.display = 'flex';
      scroll.style.flexDirection = 'column';
    }
    arrow.textContent = ganttCollapsed ? '▼ 展開' : '▲ 收合';
  });

  /* ── 篩選 ── */
  function getFiltered() {
    return SCHEDULE_DATA.filter(function(s) {
      if (state.categories.length    && state.categories.indexOf(s.category)      === -1) return false;
      if (state.testUnits.length     && state.testUnits.indexOf(s.testUnit)        === -1) return false;
      if (state.testEngineers.length && state.testEngineers.indexOf(s.testEngineer)=== -1) return false;
      if (state.hiddenStatuses.indexOf(computeStatus(s)) !== -1) return false;
      if (state.projectSearch) {
        var kw  = state.projectSearch.toLowerCase();
        var txt = (s.projectName+' '+s.taskDescription+' '+s.requiredPersonnel+' '+s.testReport).toLowerCase();
        if (txt.indexOf(kw) === -1) return false;
      }
      if (state.startFrom && s.startDate < state.startFrom) return false;
      if (state.endFrom   && s.endDate   > state.endFrom)   return false;
      return true;
    });
  }

  /* ── 排序 ── */
  function getSorted(data) {
    return data.slice().sort(function(a, b) {
      if (state.sortField) {
        var av, bv;
        if (state.sortField === 'testUnit') {
          av = getUnitOrder(a.testUnit); bv = getUnitOrder(b.testUnit);
        } else {
          av = a[state.sortField]; bv = b[state.sortField];
        }
        var cmp = av < bv ? -1 : av > bv ? 1 : 0;
        var primary = state.sortDir === 'asc' ? cmp : -cmp;
        if (primary !== 0) return primary;
      }
      return defaultSort(a, b);
    });
  }

  /* ── 主渲染 ── */
  var _scrollDone = false;
  function renderAll() {
    var data = getSorted(getFiltered());
    renderGantt(data);
    renderList(data);
    if (!_scrollDone) {
      _scrollDone = true;
      var el = document.getElementById('gantt-right-body');
      if (el && SCHEDULE_DATA.length) {
        var allD = [];
        SCHEDULE_DATA.forEach(function(s){
          allD.push(parseDate(s.startDate));
          allD.push(parseDate(s.endDate));
        });
        var tS = new Date(Math.min.apply(null, allD.map(function(d){ return d.getTime(); })));
        tS.setDate(tS.getDate() - 1);
        var today = new Date(); today.setHours(0,0,0,0);
        var tx = daysBetween(tS, today) * PX_PER_DAY;
        el.scrollLeft = tx - el.clientWidth / 2;
        var topR = document.getElementById('gantt-top-right');
        if (topR) topR.scrollLeft = el.scrollLeft;
      }
    }
  }

  /* ══════════════════════════════════════════════
     甘特圖渲染（四象限 + 溢出雙色）
  ══════════════════════════════════════════════ */
  function renderGantt(data) {
    var container = document.getElementById('gantt-container');
    var wrapper   = document.getElementById('gantt-scroll');

    if (!data.length) {
      wrapper.style.overflow = '';
      wrapper.style.display  = '';
      wrapper.style.flexDirection = '';
      container.style.cssText = '';
      container.innerHTML = '<div class="no-data">無符合條件的排程</div>';
      return;
    }

    var oldRB = document.getElementById('gantt-right-body');
    var savedSL = oldRB ? oldRB.scrollLeft : 0;
    var savedST = oldRB ? oldRB.scrollTop  : 0;

    wrapper.style.display       = ganttCollapsed ? 'none' : 'flex';
    wrapper.style.flexDirection = 'column';
    wrapper.style.overflow      = 'hidden';
    container.style.display       = 'flex';
    container.style.flexDirection = 'column';
    container.style.flex          = '1';
    container.style.minHeight     = '0';
    container.style.overflow      = 'hidden';

    var allUnits = OPTIONS.testUnits.map(function(u){ return u.value; });

    var allD = [];
    SCHEDULE_DATA.forEach(function(s){
      allD.push(parseDate(s.startDate));
      allD.push(parseDate(s.endDate));
    });
    var tS = new Date(Math.min.apply(null, allD.map(function(d){ return d.getTime(); })));
    tS.setDate(tS.getDate() - 1);
    var tE = new Date(Math.max.apply(null, allD.map(function(d){ return d.getTime(); })));
    tE.setDate(tE.getDate() + 1);
    var tp3 = new Date(); tp3.setMonth(tp3.getMonth() + 3);
    if (tp3 > tE) tE = tp3;

    var totalDays = daysBetween(tS, tE);
    var timelineW = totalDays * PX_PER_DAY;
    var bodyH     = data.length * ROW_H;

    var monthsH = [], monthsB = [];
    var cur = new Date(tS.getTime()); cur.setDate(1);
    while (cur <= tE) {
      var mx = daysBetween(tS, cur) * PX_PER_DAY;
      if (mx >= 0) {
        var ml = cur.getFullYear() + '/' + pad2(cur.getMonth()+1);
        monthsH.push('<line x1="'+mx+'" y1="0" x2="'+mx+'" y2="'+HEADER_H+'" stroke="#cbd5e1" stroke-width="1"/>'
          +'<text x="'+(mx+5)+'" y="'+(HEADER_MONTH/2+6)+'" font-size="12" fill="#334155" font-weight="700">'+ml+'</text>');
        monthsB.push('<line x1="'+mx+'" y1="0" x2="'+mx+'" y2="'+bodyH+'" stroke="#cbd5e1" stroke-width="1"/>');
      }
      cur.setMonth(cur.getMonth() + 1);
    }

    var ticks = [];
    var tC = new Date(tS.getTime());
    var dow0 = tC.getDay();
    tC.setDate(tC.getDate() + (dow0 === 0 ? 0 : 7 - dow0));
    while (tC <= tE) {
      var tx2 = daysBetween(tS, tC) * PX_PER_DAY;
      if (tx2 >= 0) {
        var tl = pad2(tC.getMonth()+1) + '/' + pad2(tC.getDate());
        ticks.push('<line x1="'+tx2+'" y1="'+HEADER_MONTH+'" x2="'+tx2+'" y2="'+(HEADER_MONTH+HEADER_WEEK)+'" stroke="#cbd5e1" stroke-width="1"/>'
          +'<text x="'+(tx2+2)+'" y="'+(HEADER_MONTH+HEADER_WEEK/2+5)+'" font-size="10" fill="#64748b" font-weight="600">'+tl+'</text>');
      }
      tC.setDate(tC.getDate() + 7);
    }

    var restBgsB = [], dayLabelsArr = [];
    var dC = new Date(tS.getTime());
    while (dC <= tE) {
      var dx = daysBetween(tS, dC) * PX_PER_DAY;
      if (dx >= 0 && dx < timelineW) {
        var wd = dC.getDay();
        var rest = isRestDay(dC);
        if (rest) restBgsB.push('<rect x="'+dx+'" y="0" width="'+PX_PER_DAY+'" height="'+bodyH+'" fill="rgba(0,0,0,0.085)"/>');
        dayLabelsArr.push('<line x1="'+dx+'" y1="'+(HEADER_MONTH+HEADER_WEEK)+'" x2="'+dx+'" y2="'+HEADER_H+'" stroke="#e2e8f0" stroke-width="0.5"/>'
          +'<text x="'+(dx+PX_PER_DAY/2)+'" y="'+(HEADER_MONTH+HEADER_WEEK+HEADER_DAY/2+5)+'"'
          +' font-size="10" fill="'+(rest?'#ef4444':'#64748b')+'" text-anchor="middle"'
          +' font-weight="'+(rest?'700':'400')+'">'+DAY_LABELS[wd]+'</text>');
      }
      dC.setDate(dC.getDate() + 1);
    }

    var today2 = new Date(); today2.setHours(0,0,0,0);
    var todayH = '', todayB = '';
    if (today2 >= tS && today2 <= tE) {
      var tdx = daysBetween(tS, today2) * PX_PER_DAY;
      todayH = '<line x1="'+tdx+'" y1="0" x2="'+tdx+'" y2="'+HEADER_H+'" stroke="#ef4444" stroke-width="1.5" stroke-dasharray="4 3"/>'
        +'<rect x="'+(tdx-1)+'" y="4" width="28" height="15" rx="3" fill="#ef4444"/>'
        +'<text x="'+(tdx+3)+'" y="15" font-size="10" fill="#ffffff" font-weight="600">今日</text>';
      todayB = '<line x1="'+tdx+'" y1="0" x2="'+tdx+'" y2="'+bodyH+'" stroke="#ef4444" stroke-width="1.5" stroke-dasharray="4 3"/>';
    }

    var topLeftSvg = '<svg width="'+LEFT_W+'" height="'+HEADER_H+'" style="display:block">'
      +'<rect x="0" y="0" width="'+LEFT_W+'" height="'+HEADER_H+'" fill="#e2e8f0"/>'
      +'<text x="12" y="'+(HEADER_MONTH/2+6)+'" font-size="13" fill="#334155" font-weight="700">工作排程</text>'
      +'<line x1="0" y1="'+HEADER_MONTH+'" x2="'+LEFT_W+'" y2="'+HEADER_MONTH+'" stroke="#cbd5e1" stroke-width="1"/>'
      +'<line x1="0" y1="'+(HEADER_MONTH+HEADER_WEEK)+'" x2="'+LEFT_W+'" y2="'+(HEADER_MONTH+HEADER_WEEK)+'" stroke="#cbd5e1" stroke-width="1"/>'
      +'<line x1="0" y1="'+(HEADER_H-1)+'" x2="'+LEFT_W+'" y2="'+(HEADER_H-1)+'" stroke="#cbd5e1" stroke-width="1.5"/>'
      +'</svg>';

    var topRightSvg = '<svg width="'+timelineW+'" height="'+HEADER_H+'" style="display:block">'
      +'<rect x="0" y="0" width="'+timelineW+'" height="'+HEADER_H+'" fill="#f1f5f9"/>'
      +'<line x1="0" y1="'+HEADER_MONTH+'" x2="'+timelineW+'" y2="'+HEADER_MONTH+'" stroke="#cbd5e1" stroke-width="1"/>'
      +'<line x1="0" y1="'+(HEADER_MONTH+HEADER_WEEK)+'" x2="'+timelineW+'" y2="'+(HEADER_MONTH+HEADER_WEEK)+'" stroke="#cbd5e1" stroke-width="1"/>'
      +'<line x1="0" y1="'+(HEADER_H-1)+'" x2="'+timelineW+'" y2="'+(HEADER_H-1)+'" stroke="#cbd5e1" stroke-width="1.5"/>'
      +monthsH.join('')+ticks.join('')+dayLabelsArr.join('')+todayH+'</svg>';

    var leftRows = data.map(function(s, i) {
      var status = computeStatus(s);
      var sc = STATUS_COLORS[status];
      var allUnitsL = (OPTIONS.testUnits || []).map(function(u){ return u.value; });
      var engColor = s.testEngineer ? getEngineerColor(s.testEngineer, s.testUnit, allUnitsL) : '#e2e8f0';
      var engText  = s.testEngineer ? textColorOn(engColor) : '#64748b';
      var engName  = escapeHtml(s.testEngineer ? engLabel(s.testEngineer) : '未指派');
      /* 匯出頁左欄固定 LEFT_W=260，比照主系統窄欄行為只顯示 PDN 編號段，
         完整字串放 title 供滑鼠停留時檢視 */
      var pdnFull  = s.projectName;
      var pdn      = escapeHtml(pdnFull.split(' ')[0] || pdnFull);
      var taskDesc = s.taskDescription
        ? escapeHtml(s.taskDescription.length > 26 ? s.taskDescription.slice(0,26)+'…' : s.taskDescription) : '';
      var evenFill = i % 2 === 0 ? '#ffffff' : '#f8fafc';
      return '<div data-idx="'+i+'" class="left-row-hover" style="'
        +'height:'+ROW_H+'px;background:'+evenFill+';'
        +'box-shadow:inset 0 -1px 0 #e2e8f0;'
        +'position:relative;padding:5px 8px 0;box-sizing:border-box;cursor:default;">'
        +'<div style="display:flex;align-items:center;gap:6px;overflow:hidden;">'
          +'<span style="flex-shrink:0;height:20px;padding:0 7px;border-radius:5px;font-size:12px;'
          +'font-weight:700;line-height:20px;white-space:nowrap;'
          +'background:'+engColor+';color:'+engText+';">'+engName+'</span>'
          +'<span title="'+escapeHtml(pdnFull)+'" style="flex:1;min-width:0;font-size:12px;font-weight:600;'
          +'color:#1e293b;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;">'+pdn+'</span>'
        +'</div>'
        +'<div style="display:flex;align-items:center;gap:6px;padding-top:2px;overflow:hidden;">'
          +'<span style="flex-shrink:0;height:17px;padding:0 6px;border-radius:4px;font-size:11px;'
          +'font-weight:700;line-height:17px;white-space:nowrap;letter-spacing:0.02em;'
          +'background:'+sc.bg+';color:'+sc.text+';">'+status+'</span>'
          +(taskDesc ? '<span style="font-size:11px;color:#64748b;overflow:hidden;white-space:nowrap;'
            +'text-overflow:ellipsis;">'+taskDesc+'</span>' : '')
        +'</div>'
        +'</div>';
    }).join('');

    /* ★ Bar 區（含溢出雙色 + 結束日 +1 修正） */
    var bodyRows = data.map(function(s, i) {
      var y = i * ROW_H;
      var sDate = parseDate(s.startDate);
      var eDate = parseDate(s.endDate);
      var bx = daysBetween(tS, sDate) * PX_PER_DAY;
      var totalBarDays = daysBetween(sDate, eDate) + 1;
      var bw = Math.max(totalBarDays * PX_PER_DAY, 6);
      var evenFA = i % 2 === 0 ? 'rgba(255,255,255,0.5)' : 'rgba(248,250,252,0.5)';
      var barY = y + Math.floor((ROW_H - 22) / 2);

      var workDayOff = getWorkDayOffset(sDate, s.timeResource || 0);
      var hasOverflow = totalBarDays > workDayOff && workDayOff > 0;

      var unitColor = getColor(s.testUnit, allUnits);
      var engColor  = s.testEngineer ? getEngineerColor(s.testEngineer, s.testUnit, allUnits) : unitColor;

      var html = '<rect x="0" y="'+y+'" width="'+timelineW+'" height="'+ROW_H+'" fill="'+evenFA+'"/>'
        +'<line x1="0" y1="'+(y+ROW_H)+'" x2="'+timelineW+'" y2="'+(y+ROW_H)+'" stroke="#e2e8f0" stroke-width="1"/>';

      html += '<rect x="'+(bx+1)+'" y="'+(barY+1)+'" width="'+Math.max(bw-2,4)+'" height="20"'
        +' fill="'+engColor+'" stroke="'+unitColor+'" stroke-width="2" rx="4"'
        +' data-idx="'+i+'" class="gantt-bar" style="cursor:pointer;opacity:0.92"/>';

      if (hasOverflow) {
        var ow = Math.max((totalBarDays - workDayOff) * PX_PER_DAY - 3, 3);
        html += '<rect x="'+(bx + workDayOff * PX_PER_DAY)+'" y="'+(barY+3)+'" width="'+ow+'"'
          +' height="16" rx="3" fill="'+OVERFLOW_COLOR+'" style="pointer-events:none"/>';
      }
      return html;
    }).join('');

    var rightBodySvg = '<svg width="'+timelineW+'" height="'+bodyH+'" style="display:block">'
      +'<rect x="0" y="0" width="'+timelineW+'" height="'+bodyH+'" fill="#ffffff"/>'
      +restBgsB.join('')+monthsB.join('')+bodyRows+todayB+'</svg>';

    container.innerHTML =
      '<div style="display:flex;flex-shrink:0;height:'+HEADER_H+'px;">'
        +'<div id="gantt-top-left" style="width:'+LEFT_W+'px;flex-shrink:0;border-right:1px solid #cbd5e1;overflow:hidden;">'+topLeftSvg+'</div>'
        +'<div id="gantt-top-right" style="flex:1;overflow:hidden;">'+topRightSvg+'</div>'
      +'</div>'
      +'<div style="display:flex;flex:1;min-height:0;">'
        +'<div id="gantt-left-body" style="width:'+LEFT_W+'px;flex-shrink:0;border-right:1px solid #cbd5e1;overflow:hidden;background:#fff;">'
          +'<div id="gantt-left-inner" style="will-change:transform;">'+leftRows+'</div>'
        +'</div>'
        +'<div id="gantt-right-body" style="flex:1;overflow:auto;">'+rightBodySvg+'</div>'
      +'</div>';

    var rightBody = document.getElementById('gantt-right-body');
    var topRight  = document.getElementById('gantt-top-right');
    var leftInner = document.getElementById('gantt-left-inner');
    var _raf = null;

    rightBody.addEventListener('scroll', function() {
      if (_raf) cancelAnimationFrame(_raf);
      _raf = requestAnimationFrame(function() {
        if (topRight)  topRight.scrollLeft = rightBody.scrollLeft;
        if (leftInner) leftInner.style.transform = 'translateY(-' + rightBody.scrollTop + 'px)';
      });
    });

    function fwdWheel(e) {
      rightBody.scrollTop  += e.deltaY;
      rightBody.scrollLeft += e.deltaX;
    }
    document.getElementById('gantt-top-left').addEventListener('wheel', fwdWheel);
    document.getElementById('gantt-top-right').addEventListener('wheel', fwdWheel);
    document.getElementById('gantt-left-body').addEventListener('wheel', fwdWheel);

    rightBody.scrollLeft = savedSL;
    rightBody.scrollTop  = savedST;
    if (topRight)  topRight.scrollLeft = savedSL;
    if (leftInner) leftInner.style.transform = 'translateY(-' + savedST + 'px)';

    var ganttTooltip = document.getElementById('gantt-tooltip');
    var rowTooltip   = document.getElementById('row-tooltip');

    container.querySelectorAll('.gantt-bar').forEach(function(bar) {
      var s      = data[Number(bar.getAttribute('data-idx'))];
      var status = computeStatus(s);
      bar.addEventListener('mouseenter', function() {
        ganttTooltip.innerHTML =
          '<div style="font-size:14px;font-weight:700;color:#f1f5f9;margin-bottom:6px;">'+escapeHtml(s.projectName)+'</div>'
          +'<div style="margin-bottom:4px;"><span class="status-badge status-'+status+'">'+status+'</span></div>'
          +'<div style="font-size:13px;color:#cbd5e1;">'
          +'<div>📁 類別：'+escapeHtml(s.category)+'</div>'
          +'<div>🏷 單位：'+escapeHtml(s.testUnit)+' / '+escapeHtml(s.testEngineer)+'</div>'
          +'<div>📅 期間：'+s.startDate+' ～ '+s.endDate+'</div>'
          +'<div>⏱ 時間資源：'+(s.timeResource||'—')+' 天</div>'
          +(s.taskDescription ? '<div>📝 工作內容：'+escapeHtml(s.taskDescription)+'</div>' : '')
          +(s.requiredPersonnel ? '<div>👤 需求人員：'+escapeHtml(s.requiredPersonnel)+'</div>' : '')
          +'</div>';
        ganttTooltip.style.display = 'block';
      });
      bar.addEventListener('mousemove', function(e) {
        ganttTooltip.style.left = (e.clientX + 14) + 'px';
        ganttTooltip.style.top  = (e.clientY + 14) + 'px';
      });
      bar.addEventListener('mouseleave', function() { ganttTooltip.style.display = 'none'; });
      bar.addEventListener('click', function() { openModal(s); });
    });

    container.querySelectorAll('.left-row-hover').forEach(function(area) {
      var s = data[Number(area.getAttribute('data-idx'))];
      area.addEventListener('mouseenter', function() {
        rowTooltip.innerHTML =
          '<div style="font-size:13px;font-weight:700;color:#f1f5f9;margin-bottom:4px;">'+escapeHtml(s.projectName)+'</div>'
          +'<div style="font-size:12px;color:#cbd5e1;">'
          +(s.taskDescription ? '<div>'+escapeHtml(s.taskDescription)+'</div>' : '')
          +'<div>'+escapeHtml(s.testUnit)+' / '+escapeHtml(s.testEngineer)+'</div>'
          +'<div>'+s.startDate+' ～ '+s.endDate+'</div>'
          +'<div>時間資源：'+(s.timeResource||'—')+' 天</div>'
          +'</div>';
        rowTooltip.style.display = 'block';
      });
      area.addEventListener('mousemove', function(e) {
        rowTooltip.style.left = (e.clientX + 14) + 'px';
        rowTooltip.style.top  = (e.clientY + 14) + 'px';
      });
      area.addEventListener('mouseleave', function() { rowTooltip.style.display = 'none'; });
    });
  }

  /* ══════════════════════════════════════════════
     排程列表
  ══════════════════════════════════════════════ */
  function renderList(data) {
    var tbody = document.getElementById('list-tbody');
    if (!data.length) {
      tbody.innerHTML = '<tr><td colspan="10" class="no-data">無符合條件的排程</td></tr>';
      return;
    }
    var allUnits = OPTIONS.testUnits.map(function(u){ return u.value; });

    tbody.innerHTML = data.map(function(s, i) {
      var color     = getColor(s.testUnit, allUnits);
      var unitText  = textColorOn(color);
      var status    = computeStatus(s);
      var glyph     = STATUS_GLYPH[status] || '';
      var restClass = isRestDay(parseDate(s.startDate)) ? ' rest-day' : '';
      return '<tr class="list-row'+restClass+'" data-idx="'+i+'" style="cursor:pointer">'
        +'<td><span class="status-badge status-'+status+'">'+glyph+' '+status+'</span></td>'
        +'<td>'+escapeHtml(s.category)+'</td>'
        +'<td title="'+escapeHtml(s.projectName)+'">'+escapeHtml(s.projectName)+'</td>'
        +'<td title="'+escapeHtml(s.taskDescription||'')+'">'+escapeHtml(s.taskDescription||'—')+'</td>'
        +'<td><span class="unit-badge" style="background:'+color+';color:'+unitText+'">'+escapeHtml(s.testUnit)+'</span></td>'
        +'<td>'+escapeHtml(s.testEngineer)+'</td>'
        +'<td>'+s.startDate+'</td>'
        +'<td>'+s.endDate+'</td>'
        +'<td title="'+escapeHtml(s.requiredPersonnel||'')+'">'+escapeHtml(s.requiredPersonnel||'—')+'</td>'
        +'<td title="'+escapeHtml(s.testReport||'')+'">'+escapeHtml(s.testReport||'—')+'</td>'
        +'</tr>';
    }).join('');

    tbody.querySelectorAll('.list-row').forEach(function(tr) {
      tr.addEventListener('click', function() {
        var s = data[Number(tr.getAttribute('data-idx'))];
        openModal(s);
      });
    });
  }

  /* ── Modal ── */
  function openModal(s) {
    var status = computeStatus(s);
    var fields = [
      ['狀態',     '<span class="status-badge status-'+status+'">'+status+'</span>'],
      ['工作類別', escapeHtml(s.category)],
      ['PDN Number', escapeHtml(s.projectName)],
      ['工作內容', escapeHtml(s.taskDescription || '—')],
      ['測試單位', escapeHtml(s.testUnit)],
      ['測試人員', escapeHtml(s.testEngineer)],
      ['起始日期', s.startDate],
      ['完成日期', s.endDate],
      ['時間資源', (s.timeResource || '—') + ' 天'],
      ['需求人員', escapeHtml(s.requiredPersonnel || '—')],
      ['測試報告', escapeHtml(s.testReport || '—')],
    ];
    if (s.isDelayed && s.delayReason)
      fields.push(['延遲原因', escapeHtml(s.delayReason)]);

    document.getElementById('modal-body').innerHTML = fields.map(function(f) {
      return '<div class="modal-field"><div class="field-label">'+f[0]+'</div><div class="field-value">'+f[1]+'</div></div>';
    }).join('');
    document.getElementById('modal-overlay').classList.add('open');
  }
  window.openModal = openModal;

  /* ── 表格排序 ── */
  document.querySelectorAll('th[data-sort]').forEach(function(th) {
    th.addEventListener('click', function() {
      var f = th.getAttribute('data-sort');
      if (state.sortField === f) { state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc'; }
      else { state.sortField = f; state.sortDir = 'asc'; }
      document.querySelectorAll('th[data-sort] .sort-indicator').forEach(function(el){ el.textContent = ''; });
      th.querySelector('.sort-indicator').textContent = state.sortDir === 'asc' ? ' ↑' : ' ↓';
      renderAll();
    });
  });

  /* ── 多選下拉 ── */
  function setupMultiSelect(id, stateKey) {
    var trigger = document.getElementById(id+'-trigger');
    var dropdown = document.getElementById(id+'-dropdown');
    var badge = document.getElementById(id+'-badge');
    var countEl = document.getElementById(id+'-count');
    var searchEl = document.getElementById(id+'-search');
    var clearBtn = document.getElementById(id+'-clear');
    var optionsEl = document.getElementById(id+'-options');

    trigger.addEventListener('click', function(e) {
      e.stopPropagation();
      document.querySelectorAll('.multi-select-dropdown.open').forEach(function(d) {
        if (d !== dropdown) { d.classList.remove('open'); d.previousElementSibling.classList.remove('active'); }
      });
      dropdown.classList.toggle('open');
      trigger.classList.toggle('active');
      if (dropdown.classList.contains('open') && searchEl) searchEl.focus();
    });
    document.addEventListener('click', function() { dropdown.classList.remove('open'); trigger.classList.remove('active'); });
    dropdown.addEventListener('click', function(e){ e.stopPropagation(); });

    if (searchEl) {
      searchEl.addEventListener('input', function() {
        var kw = searchEl.value.toLowerCase();
        optionsEl.querySelectorAll('.multi-select-option').forEach(function(opt) {
          opt.style.display = opt.textContent.toLowerCase().includes(kw) ? '' : 'none';
        });
        countEl.textContent = '共 '+optionsEl.querySelectorAll('.multi-select-option:not([style*="none"])').length+' 項';
      });
    }

    optionsEl.querySelectorAll('input[type=checkbox]').forEach(function(cb) {
      cb.addEventListener('change', function() {
        var checked = Array.from(optionsEl.querySelectorAll('input:checked')).map(function(c){ return c.value; });
        state[stateKey] = checked;
        var count = checked.length;
        if (count > 0) { badge.textContent = count; badge.style.display = 'inline-flex'; trigger.querySelector('.trigger-label').textContent = '已選 '+count+' 項'; }
        else { badge.style.display = 'none'; trigger.querySelector('.trigger-label').textContent = '全部'; }
        cb.closest('.multi-select-option').classList.toggle('checked', cb.checked);
        renderAll();
      });
    });

    if (clearBtn) {
      clearBtn.addEventListener('click', function() {
        optionsEl.querySelectorAll('input[type=checkbox]').forEach(function(cb) { cb.checked = false; cb.closest('.multi-select-option').classList.remove('checked'); });
        state[stateKey] = [];
        badge.style.display = 'none';
        trigger.querySelector('.trigger-label').textContent = '全部';
        renderAll();
      });
    }
  }
  setupMultiSelect('cat', 'categories');
  setupMultiSelect('unit', 'testUnits');
  setupMultiSelect('eng', 'testEngineers');

  /* ── 狀態 checkbox ── */
  document.querySelectorAll('.status-cb').forEach(function(cb) {
    if (cb.value === 'Completed' || cb.value === 'Cancelled') cb.checked = false;
    cb.addEventListener('change', function() {
      state.hiddenStatuses = Array.from(document.querySelectorAll('.status-cb:not(:checked)')).map(function(c){ return c.value; });
      renderAll();
    });
  });

  document.getElementById('search-input').addEventListener('input', function(e) { state.projectSearch = e.target.value; renderAll(); });

  /* ── 日期篩選（各一個） ── */
  ['start-from','end-from'].forEach(function(id) {
    document.getElementById(id).addEventListener('change', function(e) {
      var key = id.replace(/-([a-z])/g, function(_, c){ return c.toUpperCase(); });
      state[key] = e.target.value.replace(/-/g, '/');
      renderAll();
    });
  });

  /* ── 清除所有篩選 ── */
  document.getElementById('clear-filters').addEventListener('click', function() {
    state.categories = []; state.testUnits = []; state.testEngineers = [];
    state.hiddenStatuses = ['Completed','Cancelled'];
    state.projectSearch = '';
    state.startFrom = ''; state.endFrom = '';
    state.sortField = ''; state.sortDir = 'asc';

    ['cat','unit','eng'].forEach(function(id) {
      var optEl = document.getElementById(id+'-options');
      optEl.querySelectorAll('input[type=checkbox]').forEach(function(cb) { cb.checked = false; cb.closest('.multi-select-option').classList.remove('checked'); });
      document.getElementById(id+'-badge').style.display = 'none';
      document.getElementById(id+'-trigger').querySelector('.trigger-label').textContent = '全部';
      var si = document.getElementById(id+'-search');
      if (si) si.value = '';
      optEl.querySelectorAll('.multi-select-option').forEach(function(o){ o.style.display = ''; });
    });

    document.getElementById('search-input').value = '';
    document.querySelectorAll('.filters input[type=date]').forEach(function(el){ el.value = ''; });
    document.querySelectorAll('.status-cb').forEach(function(cb){ cb.checked = cb.value !== 'Completed' && cb.value !== 'Cancelled'; });
    document.querySelectorAll('th[data-sort] .sort-indicator').forEach(function(el){ el.textContent = ''; });
    renderAll();
  });

  document.getElementById('modal-close').addEventListener('click', function() { document.getElementById('modal-overlay').classList.remove('open'); });
  document.getElementById('modal-overlay').addEventListener('click', function(e) { if (e.target === e.currentTarget) e.currentTarget.classList.remove('open'); });

  renderAll();
})();
`