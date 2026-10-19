// map-ai-bridge.js — AI 地图编辑器桥接层 v3
(function () {
  "use strict";

  const pk = () => window.pack;
  const findState = (ref) => { if (typeof ref === 'number') return pk().states[ref]; return pk().states.find(s => s.i && !s.removed && (s.name === ref || s.fullName === ref)); };
  const findBurg = (ref) => { if (typeof ref === 'number') return pk().burgs[ref]; return pk().burgs.find(b => b.i && !b.removed && b.name === ref); };
  const findRiver = (ref) => { if (typeof ref === 'number') return pk().rivers.find(r => r.i === ref); return pk().rivers.find(r => r.name === ref); };
  const getStateCoords = (id) => { const s = pk().states[id]; if (!s) return null; const b = pk().burgs[s.capital]; return b ? [b.x, b.y] : (s.pole || null); };

  function getMapSummary() {
    if (!pk() || !pk().states || pk().states.length <= 1) return null;
    return {
      states: pk().states.filter(s => s.i && !s.removed).map(s => { const b = pk().burgs[s.capital]; return { id: s.i, name: s.name, fullName: s.fullName, formName: s.formName, color: s.color, capitalName: b ? b.name : '', x: b ? Math.round(b.x) : 0, y: b ? Math.round(b.y) : 0, cells: s.cells, area: s.area, burgs: s.burgs, neighbors: s.neighbors }; }),
      burgs: pk().burgs.filter(b => b.i && !b.removed).map(b => ({ id: b.i, name: b.name, state: b.state, stateName: pk().states[b.state] ? pk().states[b.state].name : '', capital: b.capital, port: b.port, x: Math.round(b.x), y: Math.round(b.y) })),
      rivers: (pk().rivers || []).map(r => ({ id: r.i, name: r.name, type: r.type })),
      religions: (pk().religions || []).filter(r => r.i && !r.removed).map(r => ({ id: r.i, name: r.name, type: r.type, form: r.form })),
      provinces: (pk().provinces || []).filter(p => p && p.i && !p.removed).map(p => ({ id: p.i, name: p.name, fullName: p.fullName, state: p.state })),
      cultures: (pk().cultures || []).filter(c => c.i && !c.removed).map(c => ({ id: c.i, name: c.name, base: c.base, type: c.type }))
    };
  }

  function batchRename(data) {
    if (data.states) {
      data.states.forEach(function(item) {
        var s = findState(item.id);
        if (s) { s.name = item.name || s.name; s.fullName = item.fullName || item.name || s.fullName; }
      });
    }
    if (data.burgs) {
      data.burgs.forEach(function(item) {
        var b = findBurg(item.id);
        if (b) {
          b.name = item.name;
          var label = document.querySelector('#burgLabels [data-id="' + b.i + '"]');
          if (label) label.textContent = item.name;
          else console.warn('[Bridge] burg label not found for id:', b.i);
        } else {
          console.warn('[Bridge] burg not found for id:', item.id);
        }
      });
    }
    if (data.rivers) {
      data.rivers.forEach(function(item) {
        var r = findRiver(item.id);
        if (r) r.name = item.name;
      });
    }
    // Redraw labels
    if (window.drawStateLabels) window.drawStateLabels();
    if (window.drawBurgLabels) window.drawBurgLabels();
    // Force full label redraw by toggling labels layer
    if (window.drawLabels) window.drawLabels();
    return { ok: true };
  }

  function exportPNG(scale) {
    return new Promise(function(resolve) {
      var svgEl = document.getElementById('map');
      if (!svgEl) { resolve(null); return; }
      var s = scale || 1;
      var w = svgEl.getAttribute('width') * s;
      var h = svgEl.getAttribute('height') * s;
      var clone = svgEl.cloneNode(true);
      clone.setAttribute('width', w);
      clone.setAttribute('height', h);
      var data = new XMLSerializer().serializeToString(clone);
      var blob = new Blob([data], { type: 'image/svg+xml;charset=utf-8' });
      var url = URL.createObjectURL(blob);
      var img = new Image();
      img.onload = function() {
        var canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        URL.revokeObjectURL(url);
        resolve(canvas.toDataURL('image/png'));
      };
      img.onerror = function() { URL.revokeObjectURL(url); resolve(null); };
      img.src = url;
    });
  }

  function executeCommand(cmd) {
    try {
      switch (cmd.action) {
        case 'renameState': {
          var s = findState(cmd.id || cmd.oldName);
          if (!s) return { ok: false, error: 'state not found' };
          s.name = cmd.name; s.fullName = cmd.fullName || cmd.name;
          if (window.drawStateLabels) window.drawStateLabels([s.i]);
          return { ok: true, message: 'renamed to ' + cmd.name };
        }
        case 'renameBurg': {
          var b = findBurg(cmd.id || cmd.oldName);
          if (!b) return { ok: false, error: 'burg not found' };
          b.name = cmd.name;
          var lbl = document.querySelector('#burgLabels [data-id="' + b.i + '"]');
          if (lbl) lbl.textContent = cmd.name;
          return { ok: true, message: 'renamed' };
        }
        case 'renameRiver': {
          var r = findRiver(cmd.id || cmd.oldName);
          if (!r) return { ok: false, error: 'river not found' };
          r.name = cmd.name;
          return { ok: true, message: 'renamed' };
        }
        case 'removeState': {
          var st = findState(cmd.id || cmd.name);
          if (!st) return { ok: false, error: 'not found' };
          if (window.stateRemove) { window.stateRemove(st.i); return { ok: true, message: 'removed' }; }
          return { ok: false, error: 'fn unavailable' };
        }
        case 'removeBurg': {
          var bg = findBurg(cmd.id || cmd.name);
          if (!bg) return { ok: false, error: 'not found' };
          if (window.removeBurg) { window.removeBurg(bg.i); return { ok: true, message: 'removed' }; }
          return { ok: false, error: 'fn unavailable' };
        }
        case 'removeRiver': {
          var rv = findRiver(cmd.id || cmd.name);
          if (!rv) return { ok: false, error: 'not found' };
          if (window.Rivers && window.Rivers.remove) { window.Rivers.remove(rv.i); if (window.drawRivers) window.drawRivers(); return { ok: true, message: 'removed' }; }
          return { ok: false, error: 'fn unavailable' };
        }
        case 'addState': {
          var x, y;
          if (cmd.between && cmd.between.length === 2) {
            var s1 = findState(cmd.between[0]), s2 = findState(cmd.between[1]);
            if (s1 && s2) { var c1 = getStateCoords(s1.i), c2 = getStateCoords(s2.i); if (c1 && c2) { x = (c1[0]+c2[0])/2; y = (c1[1]+c2[1])/2; } }
            if (!x) return { ok: false, error: 'states not found' };
          } else if (cmd.nearState) {
            var ns = findState(cmd.nearState);
            if (ns) { var cc = getStateCoords(ns.i); if (cc) { x = cc[0]+(Math.random()-0.5)*60; y = cc[1]+(Math.random()-0.5)*60; } }
            if (!x) return { ok: false, error: 'state not found' };
          } else if (cmd.x && cmd.y) { x = cmd.x; y = cmd.y; }
          else if (cmd.position) {
            var mW = window.graphWidth || 1000, mH = window.graphHeight || 600;
            var p = (cmd.position+'').toLowerCase();
            y = p.indexOf('\u5317')>=0||p.indexOf('\u4e0a')>=0 ? mH*0.2 : p.indexOf('\u5357')>=0||p.indexOf('\u4e0b')>=0 ? mH*0.8 : mH*0.5;
            x = p.indexOf('\u897f')>=0||p.indexOf('\u5de6')>=0 ? mW*0.2 : p.indexOf('\u4e1c')>=0||p.indexOf('\u53f3')>=0 ? mW*0.8 : mW*0.5;
          } else return { ok: false, error: 'need position' };

          var cell = window.findCell ? window.findCell(x, y) : null;
          if (cell === null || pk().cells.h[cell] < 20) return { ok: false, error: 'invalid position' };
          var burg = pk().cells.burg[cell];
          if (burg && pk().burgs[burg].capital) { x += 20; y += 20; burg = null; }
          if (!burg) burg = window.addBurg([x, y]);
          var id = pk().states.length;
          pk().burgs[burg].capital = 1; pk().burgs[burg].state = id;
          if (window.moveBurgToGroup) window.moveBurgToGroup(burg, "cities");
          var name = cmd.name || 'New';
          var color = cmd.color || (window.getRandomColor ? window.getRandomColor() : '#'+Math.floor(Math.random()*0xFFFFFF).toString(16).padStart(6,'0'));
          var diplomacy = pk().states.map(function(ss) { if (!ss.i||ss.removed) return "x"; if (ss.diplomacy) ss.diplomacy.push("Neutral"); return "Neutral"; });
          diplomacy.push("x");
          pk().cells.state[cell] = id;
          pk().states.push({ i:id, name:name, fullName:cmd.fullName||name, formName:cmd.formName||'', diplomacy:diplomacy, provinces:[], color:color, expansionism:0.5, capital:burg, type:"Generic", center:cell, culture:pk().cells.culture[cell]||0, military:[], alert:1, coa:{}, form:'Monarchy', neighbors:[], pole:[x,y] });
          var exp = 0, radius = cmd.expandRadius || 40;
          for (var i = 0; i < pk().cells.i.length; i++) { if (pk().cells.h[i]<20) continue; var d = Math.hypot(pk().cells.p[i][0]-x, pk().cells.p[i][1]-y); if (d < radius && pk().cells.state[i]===0) { pk().cells.state[i]=id; exp++; } }
          if (window.drawStates) window.drawStates();
          if (window.drawBorders) window.drawBorders();
          if (window.drawStateLabels) window.drawStateLabels([id]);
          return { ok: true, message: name + ' created (' + exp + ' cells)' };
        }
        case 'addBurg': {
          var bx = cmd.x, by = cmd.y;
          if (cmd.nearState) { var nss = findState(cmd.nearState); if (nss) { var ccc = getStateCoords(nss.i); if (ccc) { bx = ccc[0]+(Math.random()-0.5)*40; by = ccc[1]+(Math.random()-0.5)*40; } } }
          if (!bx || !by) return { ok: false, error: 'need position' };
          var bid = window.addBurg([bx, by]);
          if (cmd.name) { pk().burgs[bid].name = cmd.name; var bl = document.querySelector('#burgLabels [data-id="'+bid+'"]'); if (bl) bl.textContent = cmd.name; }
          return { ok: true, message: 'burg created' };
        }
        case 'changeStateColor': {
          var cs = findState(cmd.id || cmd.name);
          if (!cs) return { ok: false, error: 'not found' };
          cs.color = cmd.color;
          if (window.drawStates) window.drawStates();
          return { ok: true, message: 'color changed' };
        }
        case 'toggleLayer': {
          var map = {'纹理':'toggleTexture','高程图':'toggleHeight','生物群':'toggleBiomes','单元格':'toggleCells','网格':'toggleGrid','坐标':'toggleCoordinates','风玫瑰图':'toggleCompass','河流':'toggleRivers','地形符号':'toggleRelief','宗教':'toggleReligions','文化':'toggleCultures','国家':'toggleStates','省份':'toggleProvinces','区域':'toggleZones','国界':'toggleBorders','路线':'toggleRoutes','温度图':'toggleTemperature','人口':'togglePopulation','冰':'toggleIce','降水':'togglePrecipitation','徽标':'toggleEmblems','标签':'toggleLabels','图标':'toggleBurgIcons','军事':'toggleMilitary','标记':'toggleMarkers','标尺':'toggleRulers','比例尺':'toggleScaleBar','晕影':'toggleVignette'};
          var fn = map[cmd.layer] || cmd.layer;
          if (window[fn]) { window[fn](); return { ok: true, message: 'toggled' }; }
          return { ok: false, error: 'unknown layer' };
        }
        case 'setLayerPreset': {
          var pm = {'行政区域图':'political','文化':'cultural','宗教':'religions','省份':'provinces','生物群':'biomes','高程图':'heightmap','自然':'physical','兴趣点':'poi','军事':'military','徽标':'emblems','地块':'landmass'};
          var preset = pm[cmd.preset] || cmd.preset;
          if (window.handleLayersPresetChange) { window.handleLayersPresetChange(preset); return { ok: true, message: 'preset set' }; }
          return { ok: false, error: 'fn unavailable' };
        }
        case 'setOption': {
          var el = document.getElementById(cmd.elementId);
          if (!el) return { ok: false, error: 'element not found' };
          el.value = cmd.value;
          el.dispatchEvent(new Event('input')); el.dispatchEvent(new Event('change'));
          return { ok: true, message: 'set' };
        }
        case 'setMapOptions': {
          if (cmd.culturesSet) { var cse = document.getElementById('culturesSet'); if (cse) cse.value = cmd.culturesSet; }
          if (cmd.statesNumber) { var sne = document.getElementById('statesNeutral'); if (sne) sne.value = cmd.statesNumber; }
          if (cmd.heightTemplate) { var hte = document.getElementById('templateInput'); if (hte) hte.value = cmd.heightTemplate; }
          return { ok: true, message: 'options set' };
        }
        case 'redraw': { if (window.drawLayers) window.drawLayers(); return { ok: true, message: 'redrawn' }; }
        case 'regenerate': { if (window.regenerateMap) { window.regenerateMap(); return { ok: true, message: 'regenerating' }; } return { ok: false, error: 'unavailable' }; }
        default: return { ok: false, error: 'unknown action: ' + cmd.action };
      }
    } catch (e) { return { ok: false, error: String(e.message || e) }; }
  }

  // Save/Load functions (access ldb from inside iframe scope)
  function saveMapToSlot(slotId) {
    if (!window.prepareMapData) {
      console.error('[Bridge Save] prepareMapData not found on window');
      return Promise.resolve({ ok: false, error: 'prepareMapData not available' });
    }
    try {
      console.log('[Bridge Save] calling prepareMapData...');
      var mapData = window.prepareMapData();
      console.log('[Bridge Save] mapData length:', mapData.length);
      var blob = new Blob([mapData], { type: 'text/plain' });
      console.log('[Bridge Save] blob size:', blob.size);

      var p1 = ldb.set('map-save-' + slotId, blob);
      var p2 = ldb.set('lastMap', blob);
      return Promise.all([p1, p2]).then(function() {
        console.log('[Bridge Save] ldb.set completed for both keys');
        // 验证：立即读回来
        return ldb.get('lastMap').then(function(readBack) {
          console.log('[Bridge Save] verify read-back:', readBack ? 'OK size=' + readBack.size : 'NULL');
          return { ok: true };
        });
      }).catch(function(err) {
        console.error('[Bridge Save] ldb.set failed:', err);
        return { ok: false, error: 'ldb.set failed: ' + err };
      });
    } catch (e) {
      console.error('[Bridge Save] exception:', e);
      return Promise.resolve({ ok: false, error: e.message || String(e) });
    }
  }

  function loadMapFromSlot(slotId) {
    return ldb.get('map-save-' + slotId).then(function(blob) {
      if (!blob) return { ok: false, error: 'not found' };
      if (window.uploadMap) { window.uploadMap(blob); return { ok: true }; }
      return { ok: false, error: 'uploadMap not available' };
    }).catch(function() { return { ok: false, error: 'load error' }; });
  }

  function deleteMapSlot(slotId) {
    // ldb has no delete, overwrite with null
    return ldb.set('map-save-' + slotId, null).then(function() { return { ok: true }; });
  }

  // ===== 新增：地图编辑功能 API =====

  // 在指定坐标查找当前点击的实体（国家/城市/河流）
  function getEntityAt(x, y) {
    if (!window.findCell) return null;
    var cell = window.findCell(x, y);
    if (cell == null) return null;
    var cells = pk().cells;
    var burgId = cells.burg[cell];
    var stateId = cells.state[cell];
    var riverId = cells.r[cell];
    return {
      cell: cell,
      x: x, y: y,
      burg: burgId ? { id: burgId, name: pk().burgs[burgId].name, capital: !!pk().burgs[burgId].capital } : null,
      state: stateId ? { id: stateId, name: pk().states[stateId].name, color: pk().states[stateId].color } : null,
      river: riverId ? { id: riverId, name: pk().rivers.find(function(r) { return r.i === riverId; })?.name } : null,
      isWater: cells.h[cell] < 20
    };
  }

  // 通过屏幕坐标(clientX, clientY)取实体——用 SVG getScreenCTM 反算
  function getEntityAtScreen(clientX, clientY) {
    var coords = screenToMapCoords(clientX, clientY);
    if (!coords) return null;
    return getEntityAt(coords.x, coords.y);
  }

  // 屏幕坐标 → SVG 地图坐标（统一转换函数）
  function screenToMapCoords(clientX, clientY) {
    var svgEl = document.getElementById('map');
    var vb = document.getElementById('viewbox');
    if (!svgEl || !vb) return null;
    var pt = svgEl.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    var ctm = vb.getScreenCTM();
    if (!ctm) return null;
    var p = pt.matrixTransform(ctm.inverse());
    return { x: p.x, y: p.y };
  }

  // 国家笔刷模式（拖动改变单元格归属）——完全复刻 FMG 原生 dragStateBrush
  // sourceStateId: 仅当 shrink 模式时使用——只把属于这个源国的单元格改成 targetStateId
  var brushState = { active: false, stateId: 0, radius: 15, sourceStateId: -1 };

  function setBrushMode(active, stateId, radius, sourceStateId) {
    brushState.active = !!active;
    brushState.stateId = stateId == null ? 0 : stateId;
    brushState.radius = radius || 15;
    brushState.sourceStateId = (sourceStateId == null) ? -1 : sourceStateId;

    var d3 = window.d3;
    var viewbox = d3 ? d3.select('#viewbox') : null;
    if (!viewbox || viewbox.empty()) return { ok: false, error: 'viewbox not available' };

    if (!brushState.active) {
      exitStateBrush();
      return { ok: true };
    }

    // 在 statesBody 创建临时层
    ensureStateTempLayer();

    // 禁用 zoom 的拖动平移（否则左键会平移地图而不是绘制）
    if (window.svg) window.svg.on('.zoom', null);

    // d3.drag 连续画刷
    viewbox.style('cursor', 'crosshair')
      .call(d3.drag().on('start.xlystate', dragStateBrush))
      .on('touchmove.xlystate mousemove.xlystate', moveStateBrush);

    return { ok: true };
  }

  function ensureStateTempLayer() {
    var statesBody = document.getElementById('statesBody');
    if (!statesBody) return null;
    var temp = statesBody.querySelector('#xly-state-temp');
    if (!temp) {
      var ns = 'http://www.w3.org/2000/svg';
      temp = document.createElementNS(ns, 'g');
      temp.setAttribute('id', 'xly-state-temp');
      statesBody.appendChild(temp);
    }
    return temp;
  }

  function dragStateBrush() {
    var r = brushState.radius;
    var d3 = window.d3;
    var startP = d3.mouse(this);
    paintStateAtPoint(startP[0], startP[1], r);

    d3.event.on('drag', function () {
      var p = d3.mouse(this);
      if (window.moveCircle) window.moveCircle(p[0], p[1], r);
      paintStateAtPoint(p[0], p[1], r);
    });
  }

  function paintStateAtPoint(x, y, r) {
    var found = r > 5 ? window.findAll(x, y, r) : [window.findCell(x, y)];
    if (!found || !found.length) return;
    var temp = ensureStateTempLayer();
    if (!temp) return;
    var cells = pk().cells;
    var stateNew = brushState.stateId;
    var color = pk().states[stateNew] ? (pk().states[stateNew].color || '#cccccc') : '#cccccc';
    var sourceFilter = brushState.sourceStateId;
    var ns = 'http://www.w3.org/2000/svg';

    found.forEach(function (i) {
      if (cells.h[i] < 20) return; // 水域跳过
      // shrink 模式：只改源国家的格子
      if (sourceFilter >= 0 && cells.state[i] !== sourceFilter) return;
      // 不能改国家中心格
      var stateOld = cells.state[i];
      if (pk().states[stateOld] && i === pk().states[stateOld].center) return;
      if (stateNew === stateOld) return;
      if (temp.querySelector('polygon[data-cell="' + i + '"]')) return;
      var poly = document.createElementNS(ns, 'polygon');
      poly.setAttribute('data-cell', i);
      poly.setAttribute('data-state', stateNew);
      poly.setAttribute('points', window.getPackPolygon(i));
      poly.setAttribute('fill', color);
      poly.setAttribute('stroke', color);
      temp.appendChild(poly);
    });
  }

  function moveStateBrush() {
    var d3 = window.d3;
    var p = d3.mouse(this);
    if (window.moveCircle) window.moveCircle(p[0], p[1], brushState.radius);
  }

  function exitStateBrush() {
    var d3 = window.d3;
    var viewbox = d3 ? d3.select('#viewbox') : null;
    if (viewbox && !viewbox.empty()) {
      viewbox.on('.xlystate', null)
        .on('touchmove.xlystate mousemove.xlystate', null);
    }
    if (window.removeCircle) window.removeCircle();
    // 用 FMG 原生方法恢复默认地图交互（平移/缩放/点击）
    if (window.restoreDefaultEvents) window.restoreDefaultEvents();
  }

  // 提交国家笔刷：把 temp 里的 cell 写入数据并重绘
  function flushBrushRedraw() {
    var temp = document.getElementById('xly-state-temp');
    if (!temp) { exitStateBrush(); return; }
    var cells = pk().cells;
    var polys = temp.querySelectorAll('polygon[data-cell]');
    var changed = 0;
    polys.forEach(function (poly) {
      var i = +poly.getAttribute('data-cell');
      var c = +poly.getAttribute('data-state');
      if (cells.state[i] !== c) {
        cells.state[i] = c;
        cells.province[i] = 0;
        if (cells.burg[i] && pk().burgs[cells.burg[i]]) pk().burgs[cells.burg[i]].state = c;
        changed++;
      }
    });
    temp.remove();

    if (changed > 0) {
      // 检查所有国家是否还有领土
      var states = pk().states;
      var stateCellCounts = new Array(states.length).fill(0);
      for (var ci = 0; ci < cells.i.length; ci++) {
        var sid = cells.state[ci];
        if (sid > 0 && sid < stateCellCounts.length) stateCellCounts[sid]++;
      }
      for (var si = 1; si < states.length; si++) {
        var st = states[si];
        if (!st || st.removed) continue;
        if (stateCellCounts[si] === 0 && !st._wiped) {
          st._wiped = true;
          st.cells = 0;
          var labelEl = document.getElementById('stateLabel' + si);
          if (labelEl) labelEl.remove();
          var pathEl = document.getElementById('textPath_stateLabel' + si);
          if (pathEl) pathEl.remove();
          if (st.capital && pk().burgs[st.capital]) {
            pk().burgs[st.capital].capital = 0;
            if (window.moveBurgToGroup) window.moveBurgToGroup(st.capital, 'towns');
          }
        } else if (stateCellCounts[si] > 0 && st._wiped) {
          st._wiped = false;
          st.cells = stateCellCounts[si];
        }
      }
      if (window.BurgsAndStates && window.BurgsAndStates.getPoles) window.BurgsAndStates.getPoles();
      if (window.drawStates) window.drawStates();
      if (window.drawBorders) window.drawBorders();
      if (window.drawStateLabels) window.drawStateLabels();
    }
    exitStateBrush();
  }

  // 兼容旧 API（不再使用，留空避免报错）
  function applyBrushAt() { return { ok: true }; }
  function applyBrushAtScreen() { return { ok: true }; }
  function moveStateBrushCursorAtScreen() { return { ok: true }; }

  // 撤销/重做（FMG 没有内置，用快照实现）
  var historyStack = [];
  var historyIndex = -1;
  var maxHistory = 20;

  function snapshot() {
    if (!window.prepareMapData) return { ok: false };
    var data = window.prepareMapData();
    // Drop forward history
    historyStack = historyStack.slice(0, historyIndex + 1);
    historyStack.push(data);
    if (historyStack.length > maxHistory) { historyStack.shift(); }
    historyIndex = historyStack.length - 1;
    return { ok: true, index: historyIndex, total: historyStack.length };
  }

  function undo() {
    if (historyIndex <= 0) return { ok: false, error: 'no history' };
    historyIndex--;
    var data = historyStack[historyIndex];
    var blob = new Blob([data], { type: 'text/plain' });
    if (window.uploadMap) { window.uploadMap(blob); return { ok: true }; }
    return { ok: false, error: 'uploadMap not available' };
  }

  function redo() {
    if (historyIndex >= historyStack.length - 1) return { ok: false, error: 'no future' };
    historyIndex++;
    var data = historyStack[historyIndex];
    var blob = new Blob([data], { type: 'text/plain' });
    if (window.uploadMap) { window.uploadMap(blob); return { ok: true }; }
    return { ok: false, error: 'uploadMap not available' };
  }

  function getHistoryStatus() {
    return { canUndo: historyIndex > 0, canRedo: historyIndex < historyStack.length - 1, index: historyIndex, total: historyStack.length };
  }

  // 导出 SVG
  function exportSVG() {
    var svg = document.getElementById('map');
    if (!svg) return null;
    var clone = svg.cloneNode(true);
    clone.setAttribute('width', svg.getAttribute('width'));
    clone.setAttribute('height', svg.getAttribute('height'));
    var data = new XMLSerializer().serializeToString(clone);
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(data);
  }

  // 重置缩放
  function resetView() {
    if (window.resetZoom) { window.resetZoom(); return { ok: true }; }
    return { ok: false };
  }

  // 设置/获取地图标题
  function setMapName(name) {
    var el = document.getElementById('mapName');
    if (el) { el.value = name; return { ok: true }; }
    return { ok: false };
  }

  function getMapName() {
    var el = document.getElementById('mapName');
    return el ? el.value : '';
  }

  // 添加自由标签（用户自定义标注）
  function addFreeLabel(x, y, text) {
    if (!pk()) return { ok: false };
    var labelsLayer = document.querySelector('#labels #addedLabels');
    if (!labelsLayer) return { ok: false, error: 'labels layer not found' };
    var ns = 'http://www.w3.org/2000/svg';
    var textEl = document.createElementNS(ns, 'text');
    textEl.setAttribute('x', x);
    textEl.setAttribute('y', y);
    textEl.setAttribute('text-anchor', 'middle');
    textEl.setAttribute('dominant-baseline', 'middle');
    textEl.setAttribute('font-size', '14');
    textEl.setAttribute('font-family', 'Almendra SC');
    textEl.setAttribute('fill', '#333');
    textEl.textContent = text;
    labelsLayer.appendChild(textEl);
    return { ok: true };
  }

  // 触发 FMG 内部函数（通用）
  function callFmgFn(fnName, ...args) {
    if (window[fnName] && typeof window[fnName] === 'function') {
      try {
        var result = window[fnName].apply(window, args);
        return { ok: true, result: result };
      } catch (e) { return { ok: false, error: e.message }; }
    }
    return { ok: false, error: 'function not found: ' + fnName };
  }

  // ===== 地形绘制 =====
  // 核心：完全复用 FMG 原生的画刷模式（d3.drag + findAll + getPackPolygon）
  // 拖动在 iframe 内部由 d3.drag 处理，连续触发，不跨 iframe 传 mousemove
  var terrainPaint = { active: false, type: '', radius: 12 };
  var riverPts = [];

  // 地形类型 → biome id / 高度修改器
  function paintCell(i, type) {
    var cells = pk().cells;
    if (type === 'mountain') {
      // 提高海拔 + 设置生物群为高山（biome 9 = Mountain）
      if (cells.h[i] >= 20) { cells.h[i] = Math.max(cells.h[i], 70) + Math.floor(Math.random()*15); cells.biome[i] = 9; return true; }
    }
    else if (type === 'forest') { if (cells.h[i] >= 20 && cells.biome[i] !== 6) { cells.biome[i] = 6; return true; } }
    else if (type === 'snow') { if (cells.h[i] >= 20 && cells.biome[i] !== 10) { cells.biome[i] = 10; return true; } }
    else if (type === 'desert') { if (cells.h[i] >= 20 && cells.biome[i] !== 1) { cells.biome[i] = 1; return true; } }
    else if (type === 'lake') { if (cells.h[i] >= 20) { cells.h[i] = 18; return true; } }
    else if (type === 'swamp') { if (cells.h[i] >= 20 && cells.biome[i] !== 12) { cells.biome[i] = 12; return true; } }
    return false;
  }

  var PAINT_COLORS = { mountain: '#6b5b4a', forest: '#2d6b22', snow: '#cce8e8', desert: '#d4ac6e', lake: '#2980b9', swamp: '#4a6741' };

  function setTerrainPaintMode(active, type, radius) {
    terrainPaint.active = !!active;
    terrainPaint.type = type || '';
    terrainPaint.radius = radius || 12;
    riverPts = [];

    if (!terrainPaint.active) {
      exitPaintMode();
      return { ok: true };
    }

    // 进入模式前确保对应图层可见
    ensureLayerVisibleForType(terrainPaint.type);
    ensureTempLayer();

    // 用原生 pointer 事件实现画刷（不依赖 d3.drag，避免与 d3.zoom 冲突）
    var svgEl = document.getElementById('map');
    if (!svgEl) return { ok: false, error: 'svg not found' };

    // 禁用 zoom
    if (window.svg) window.svg.on('.zoom', null);

    // 绑定原生事件
    svgEl.style.cursor = 'crosshair';
    svgEl.addEventListener('pointerdown', onPaintPointerDown);
    svgEl.addEventListener('pointermove', onPaintPointerMove);
    svgEl.addEventListener('pointerup', onPaintPointerUp);

    return { ok: true };
  }

  var paintingActive = false; // 当前是否按住鼠标在画

  function onPaintPointerDown(e) {
    if (e.button !== 0) return; // 只响应左键
    paintingActive = true;
    e.preventDefault();
    e.stopPropagation();
    svgPointPaint(e);
  }

  function onPaintPointerMove(e) {
    // 光标跟随
    var coords = screenToSvgCoords(e);
    if (coords && window.moveCircle) {
      // 河流模式：光标大小匹配河流宽度；其他模式：匹配画笔半径
      var cursorR = terrainPaint.type === 'river' ? Math.max(terrainPaint.radius * 0.3, 1) : terrainPaint.radius;
      window.moveCircle(coords.x, coords.y, cursorR);
    }
    if (!paintingActive) return;
    e.preventDefault();
    e.stopPropagation();
    svgPointPaint(e);
  }

  function onPaintPointerUp(e) {
    if (!paintingActive) return;
    paintingActive = false;
    e.preventDefault();
    // 松开鼠标：提交这一笔
    commitStroke();
  }

  // 屏幕坐标 → SVG viewbox 坐标（从 PointerEvent）
  function screenToSvgCoords(e) {
    return screenToMapCoords(e.clientX, e.clientY);
  }

  function svgPointPaint(e) {
    var coords = screenToSvgCoords(e);
    if (!coords) return;
    var x = coords.x, y = coords.y;
    var r = terrainPaint.radius;

    if (terrainPaint.type === 'river') {
      var lastPt = riverPts[riverPts.length - 1];
      if (!lastPt || Math.hypot(x - lastPt[0], y - lastPt[1]) >= 4) {
        riverPts.push([x, y]);
        updateRiverPreview();
      }
    } else {
      paintAtPoint(x, y, r);
    }
  }

  function ensureTempLayer() {
    var vb = document.getElementById('viewbox');
    if (!vb) return null;
    var temp = document.getElementById('xly-temp');
    if (!temp) {
      var ns = 'http://www.w3.org/2000/svg';
      temp = document.createElementNS(ns, 'g');
      temp.setAttribute('id', 'xly-temp');
      temp.setAttribute('pointer-events', 'none');
      vb.appendChild(temp);
    } else {
      vb.appendChild(temp);
    }
    return temp;
  }

  // 提交当前这一笔（写入数据 + 重绘），保持在绘制模式
  function commitStroke() {
    var temp = document.getElementById('xly-temp');
    var type = terrainPaint.type;

    if (type === 'river') {
      createRiverFromPoints();
      riverPts = [];
    } else if (temp) {
      var polys = temp.querySelectorAll('polygon[data-cell]');
      polys.forEach(function (poly) {
        var i = +poly.getAttribute('data-cell');
        paintCell(i, type);
      });
    }

    // 清空预览
    if (temp) { while (temp.firstChild) temp.removeChild(temp.firstChild); }

    // 确保图层可见
    ensureLayerVisibleForType(type);

    // 重绘地图
    redrawAll();

    // 重新创建 temp 层（redrawAll 可能重建了 viewbox 子元素）
    ensureTempLayer();
  }

  function redrawAll() {
    if (window.drawCoastline) window.drawCoastline();
    if (window.drawLakes) window.drawLakes();
    if (window.drawBiomes) window.drawBiomes();
    if (window.drawStates) window.drawStates();
    if (window.drawBorders) window.drawBorders();
    if (window.drawRelief) window.drawRelief();
    if (window.drawRivers) window.drawRivers();
  }

  function paintAtPoint(x, y, r) {
    var found = r > 5 ? window.findAll(x, y, r) : [window.findCell(x, y)];
    if (!found || !found.length) return;
    var temp = ensureTempLayer();
    if (!temp) return;
    var color = PAINT_COLORS[terrainPaint.type] || '#999';
    var type = terrainPaint.type;
    var cells = pk().cells;
    var ns = 'http://www.w3.org/2000/svg';

    found.forEach(function (i) {
      if (type !== 'lake' && cells.h[i] < 20) return;
      if (temp.querySelector('polygon[data-cell="' + i + '"]')) return;
      var poly = document.createElementNS(ns, 'polygon');
      poly.setAttribute('data-cell', i);
      poly.setAttribute('points', window.getPackPolygon(i));
      poly.setAttribute('fill', color);
      poly.setAttribute('stroke', color);
      poly.setAttribute('opacity', '0.7');
      temp.appendChild(poly);
    });
  }

  function updateRiverPreview() {
    var temp = ensureTempLayer();
    if (!temp || riverPts.length < 2) return;
    var old = temp.querySelector('.river-preview');
    if (old) old.remove();
    var ns = 'http://www.w3.org/2000/svg';
    var pth = document.createElementNS(ns, 'path');
    pth.setAttribute('d', 'M' + riverPts.map(function (pp) { return pp[0] + ',' + pp[1]; }).join(' L'));
    pth.setAttribute('stroke', '#3498db');
    pth.setAttribute('stroke-width', String(Math.max(terrainPaint.radius * 0.3, 1)));
    pth.setAttribute('fill', 'none');
    pth.setAttribute('stroke-linecap', 'round');
    pth.setAttribute('stroke-linejoin', 'round');
    pth.setAttribute('opacity', '0.8');
    pth.setAttribute('class', 'river-preview');
    temp.appendChild(pth);
  }

  // ---- 退出画刷模式 ----
  function exitPaintMode() {
    paintingActive = false;
    var svgEl = document.getElementById('map');
    if (svgEl) {
      svgEl.style.cursor = '';
      svgEl.removeEventListener('pointerdown', onPaintPointerDown);
      svgEl.removeEventListener('pointermove', onPaintPointerMove);
      svgEl.removeEventListener('pointerup', onPaintPointerUp);
    }
    var temp = document.getElementById('xly-temp');
    if (temp) temp.remove();
    if (window.removeCircle) window.removeCircle();
    if (window.restoreDefaultEvents) window.restoreDefaultEvents();
  }

  // finishTerrainPaint: 退出绘制模式（每笔已在松开时自动提交）
  function finishTerrainPaint(name) {
    terrainPaint.active = false;
    riverPts = [];
    exitPaintMode();
    return { ok: true };
  }

  // 根据绘制类型，确保对应的 FMG 图层是打开的
  function ensureLayerVisibleForType(type) {
    try {
      // 所有地形类型都需要 biomes 层可见（显示颜色区域）
      if (type && type !== 'river') {
        if (window.layerIsOn && window.toggleBiomes) {
          try { if (!window.layerIsOn('toggleBiomes')) window.toggleBiomes(); } catch (e) { /* button may not exist */ }
        }
      }
      // 山体额外需要 relief 层（显示山峰图标）
      if (type === 'mountain') {
        if (window.layerIsOn && window.toggleRelief) {
          try { if (!window.layerIsOn('toggleRelief')) window.toggleRelief(); } catch (e) { /* button may not exist */ }
        }
      }
    } catch (e) { /* ignore */ }
  }

  // 根据画的点创建一条真正的 FMG 河流（复刻 rivers-creator.addRiver）
  function createRiverFromPoints(name) {
    if (riverPts.length < 2) return;
    var Rivers = window.Rivers;
    var findCell = window.findCell;
    if (!Rivers || !findCell) return;

    var pack = pk();
    var cells = pack.cells;
    var rivers = pack.rivers;

    // 把画的屏幕路径点转成 cell 序列（去重相邻重复）
    var riverCells = [];
    for (var i = 0; i < riverPts.length; i++) {
      var c = findCell(riverPts[i][0], riverPts[i][1]);
      if (c == null) continue;
      if (riverCells.length === 0 || riverCells[riverCells.length - 1] !== c) {
        riverCells.push(c);
      }
    }
    if (riverCells.length < 2) return;

    var riverId = Rivers.getNextId ? Rivers.getNextId(rivers) : (rivers.length + 1);
    var lastCell = riverCells[riverCells.length - 1];
    var parent = cells.r[lastCell] || riverId;

    riverCells.forEach(function (cell) {
      if (!cells.r[cell]) cells.r[cell] = riverId;
    });

    var source = riverCells[0];
    var mouth = parent === riverId ? lastCell : riverCells[riverCells.length - 2];
    // 河流宽度由画笔半径决定，而不是水流量
    var brushR = terrainPaint.radius;
    var sourceWidth = Math.max(brushR * 0.1, 0.3); // 起始宽度
    var widthFactor = Math.max(brushR * 0.15, 0.8); // 宽度因子

    var meanderedPoints = Rivers.addMeandering(riverCells);
    var discharge = cells.fl ? cells.fl[mouth] : 0;
    var length = Rivers.getApproximateLength ? Rivers.getApproximateLength(meanderedPoints) : 0;
    var width = brushR * 0.3; // 最终显示宽度近似画笔大小
    var riverName = (Rivers.getName ? Rivers.getName(mouth) : ('河' + riverId));
    var basin = Rivers.getBasin ? Rivers.getBasin(parent) : riverId;

    rivers.push({
      i: riverId, source: source, mouth: mouth, discharge: discharge, length: length,
      width: width, widthFactor: widthFactor, sourceWidth: sourceWidth, parent: parent,
      cells: riverCells, basin: basin, name: riverName, type: 'River'
    });
  }

  // ---- 兼容旧 API（保留以防外部调用，均为空操作）----
  function beginTerrainStroke() { return { ok: true }; }
  function continueTerrainStroke() { return { ok: true }; }
  function endTerrainStroke() { return { ok: true }; }
  function applyTerrainPaintAtScreen() { return { ok: true }; }
  function moveBrushCursorAtScreen() { return { ok: true }; }

  window._fmgBridge = {
    getMapSummary: getMapSummary, batchRename: batchRename, executeCommand: executeCommand, exportPNG: exportPNG,
    saveMapToSlot: saveMapToSlot, loadMapFromSlot: loadMapFromSlot, deleteMapSlot: deleteMapSlot,
    getEntityAt: getEntityAt, getEntityAtScreen: getEntityAtScreen,
    setBrushMode: setBrushMode, applyBrushAt: applyBrushAt, applyBrushAtScreen: applyBrushAtScreen,
    moveStateBrushCursorAtScreen: moveStateBrushCursorAtScreen, flushBrushRedraw: flushBrushRedraw,
    snapshot: snapshot, undo: undo, redo: redo, getHistoryStatus: getHistoryStatus,
    exportSVG: exportSVG, resetView: resetView, setMapName: setMapName, getMapName: getMapName,
    addFreeLabel: addFreeLabel, callFmgFn: callFmgFn,
    setTerrainPaintMode: setTerrainPaintMode, finishTerrainPaint: finishTerrainPaint,
    beginTerrainStroke: beginTerrainStroke, continueTerrainStroke: continueTerrainStroke,
    endTerrainStroke: endTerrainStroke, applyTerrainPaintAtScreen: applyTerrainPaintAtScreen,
    moveBrushCursorAtScreen: moveBrushCursorAtScreen
  };

  // postMessage listener
  window.addEventListener('message', function (event) {
    var msg = event.data;
    if (!msg || msg.source !== 'xly-map-ai') return;
    var response;
    switch (msg.type) {
      case 'getSummary': response = { type:'summary', data: getMapSummary() }; break;
      case 'batchRename': response = { type:'batchRenameResult', data: batchRename(msg.data) }; break;
      case 'execute': response = { type:'executeResult', data: executeCommand(msg.data) }; break;
      case 'executeBatch': response = { type:'executeBatchResult', data: (msg.data||[]).map(function(c){return executeCommand(c);}) }; break;
      case 'ping': response = { type:'pong', ready: !!(pk()&&pk().states&&pk().states.length>1) }; break;
      default: response = { type:'error', error:'unknown' };
    }
    response.id = msg.id; response.source = 'xly-map-ai-response';
    window.parent.postMessage(response, '*');
  });

  // Hook drawLayers for mapReady notification + SVG href fix
  function fixSvgHrefs() {
    // Tauri 打包后 WebView2 对 SVG <use href="#id"> 解析异常
    // 需要把 "#id" 改为 "完整URL#id" 才能正确引用同文档 defs
    var baseUrl = location.href.split('#')[0];
    var svg = document.getElementById('map');
    if (!svg) return;
    var uses = svg.querySelectorAll('use[href^="#"]');
    for (var i = 0; i < uses.length; i++) {
      var href = uses[i].getAttribute('href');
      if (href && href.charAt(0) === '#') {
        uses[i].setAttribute('href', baseUrl + href);
      }
    }
    // 同样修复 pattern/clipPath 等的 url(#id) 引用
    var fills = svg.querySelectorAll('[fill^="url(#"]');
    for (var j = 0; j < fills.length; j++) {
      var fill = fills[j].getAttribute('fill');
      if (fill) {
        fills[j].setAttribute('fill', fill.replace('url(#', 'url(' + baseUrl + '#'));
      }
    }
    var clips = svg.querySelectorAll('[clip-path^="url(#"]');
    for (var k = 0; k < clips.length; k++) {
      var cp = clips[k].getAttribute('clip-path');
      if (cp) {
        clips[k].setAttribute('clip-path', cp.replace('url(#', 'url(' + baseUrl + '#'));
      }
    }
    var masks = svg.querySelectorAll('[mask^="url(#"]');
    for (var m = 0; m < masks.length; m++) {
      var mk = masks[m].getAttribute('mask');
      if (mk) {
        masks[m].setAttribute('mask', mk.replace('url(#', 'url(' + baseUrl + '#'));
      }
    }
  }

  function hookDL() {
    if (window.drawLayers && !window._dlHooked) {
      var orig = window.drawLayers;
      window.drawLayers = function() {
        orig.apply(this, arguments);
        setTimeout(function() {
          fixSvgHrefs();
          window.parent.postMessage({ source:'xly-map-ai-response', type:'mapReady', data: getMapSummary() }, '*');
        }, 800);
      };
      window._dlHooked = true;
    }
  }
  hookDL();
  if (!window._dlHooked) { var iv = setInterval(function() { hookDL(); if (window._dlHooked) clearInterval(iv); }, 500); setTimeout(function() { clearInterval(iv); }, 30000); }
  window.addEventListener('load', function() {
    setTimeout(function() {
      var s = getMapSummary();
      if (s) window.parent.postMessage({ source:'xly-map-ai-response', type:'mapReady', data:s }, '*');
      // 验证 lastMap 是否存在
      ldb.get('lastMap').then(function(blob) {
        console.log('[Bridge Load Check] lastMap on load:', blob ? 'YES size=' + blob.size : 'NO/NULL');
      }).catch(function(e) { console.error('[Bridge Load Check] error:', e); });
    }, 3000);
  });

  console.log('[AI Bridge v3] loaded');
})();
