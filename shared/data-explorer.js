/* Shared Data Explorer — Savvas Data Show
   window.DataExplorer.open(config) opens a full-screen explorer over any lesson.

   config = {
     title, meta:{ source, url, fetched, license, description },
     columns:[ {key,label,type:'number'|'category'|'date', unit?, desc?, get?(row), groupable?} ],
     rows:[ ...objects ],
     defaults:{ chart:{type,x,y,color?,agg?}, pivot:{group,value,agg} },
     filename:'dataset'
   }
   Column value access always goes through val(col,row) = col.get? col.get(row) : row[col.key]. */
(function () {
  'use strict';
  var d3 = window.d3;
  var root = null, cfg = null, COLS = [], ROWS = [];

  function val(col, row) { return col.get ? col.get(row) : row[col.key]; }
  function isNumCol(c) { return c.type === 'number'; }
  function numVals(col) { return ROWS.map(function (r) { return val(col, r); }).filter(function (v) { return v != null && v !== '' && isFinite(v); }).map(Number); }
  function fmt(v) {
    if (v == null || v === '') return '—';
    if (typeof v === 'number') { if (!isFinite(v)) return '—'; var a = Math.abs(v); if (a !== 0 && (a < 0.001 || a >= 100000)) return v.toExponential(2); return (Math.round(v * 1000) / 1000).toLocaleString(); }
    return String(v);
  }
  function colByKey(k) { for (var i = 0; i < COLS.length; i++) if (COLS[i].key === k) return COLS[i]; return null; }
  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }

  /* ---------- aggregation helpers ---------- */
  function agg(values, kind) {
    var v = values.filter(function (x) { return x != null && isFinite(x); }).map(Number);
    if (kind === 'count') return values.length;
    if (!v.length) return null;
    if (kind === 'sum') return v.reduce(function (s, x) { return s + x; }, 0);
    if (kind === 'mean') return v.reduce(function (s, x) { return s + x; }, 0) / v.length;
    if (kind === 'min') return Math.min.apply(null, v);
    if (kind === 'max') return Math.max.apply(null, v);
    if (kind === 'median') { var s = v.slice().sort(function (a, b) { return a - b; }); return s[Math.floor(s.length / 2)]; }
    return null;
  }
  // group rows by a column; numeric columns auto-bin, date binned by year
  function groupKeys(col) {
    if (col.type === 'category') {
      var set = {};
      ROWS.forEach(function (r) { var k = val(col, r); if (k == null || k === '') k = '(none)'; set[k] = (set[k] || 0) + 1; });
      return Object.keys(set).sort(function (a, b) { return set[b] - set[a]; }).map(function (k) { return { key: k, test: (function (kk) { return function (r) { var x = val(col, r); return (x == null || x === '' ? '(none)' : x) === kk; }; })(k) }; });
    }
    // numeric / date → bins
    var vals = numVals(col); if (!vals.length) return [];
    var lo = d3.min(vals), hi = d3.max(vals), nb = 8;
    if (lo === hi) return [{ key: fmt(lo), test: function () { return true; } }];
    var step = (hi - lo) / nb, bins = [];
    for (var i = 0; i < nb; i++) {
      (function (a, b, last) {
        bins.push({ key: (Math.round(a * 100) / 100) + '–' + (Math.round(b * 100) / 100), test: function (r) { var x = val(col, r); return x != null && isFinite(x) && x >= a && (last ? x <= b : x < b); } });
      })(lo + i * step, lo + (i + 1) * step, i === nb - 1);
    }
    return bins;
  }

  /* ---------- download ---------- */
  function toCSV(cols, rows) {
    var head = cols.map(function (c) { return '"' + c.label.replace(/"/g, '""') + '"'; }).join(',');
    var body = rows.map(function (r) {
      return cols.map(function (c) { var v = val(c, r); if (v == null) v = ''; v = String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }).join(',');
    }).join('\n');
    return head + '\n' + body;
  }
  function download(name, text, mime) {
    var blob = new Blob([text], { type: mime }); var url = URL.createObjectURL(blob);
    var a = document.createElement('a'); a.href = url; a.download = name; a.click();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }
  function dlButtons(prefix, cols, rows) {
    var wrap = el('span', null, ''); wrap.style.display = 'inline-flex'; wrap.style.gap = '8px';
    var csv = el('button', 'dx-btn primary', '↓ CSV'); csv.onclick = function () { download((cfg.filename || 'data') + prefix + '.csv', toCSV(cols, rows), 'text/csv'); };
    var json = el('button', 'dx-btn', '↓ JSON'); json.onclick = function () {
      var out = rows.map(function (r) { var o = {}; cols.forEach(function (c) { o[c.key] = val(c, r); }); return o; });
      download((cfg.filename || 'data') + prefix + '.json', JSON.stringify(out, null, 1), 'application/json');
    };
    wrap.appendChild(csv); wrap.appendChild(json); return wrap;
  }

  /* ---------- OVERVIEW ---------- */
  function buildOverview(pane) {
    pane.innerHTML = '';
    var m = cfg.meta || {};
    if (m.description) pane.appendChild(el('p', 'dx-desc', m.description));
    var grid = el('div', 'dx-meta-grid');
    function stat(k, v) { if (v == null) return; var s = el('div', 'dx-stat'); s.appendChild(el('div', 'k', k)); s.appendChild(el('div', 'v', v)); grid.appendChild(s); }
    stat('Rows', ROWS.length.toLocaleString());
    stat('Columns', COLS.length);
    stat('Source', m.url ? '<a href="' + m.url + '" target="_blank" rel="noopener">' + (m.source || 'link') + '</a>' : (m.source || '—'));
    stat('Fetched', m.fetched);
    stat('License', m.license);
    pane.appendChild(grid);

    pane.appendChild(el('div', 'dx-section-h', 'Download the full dataset'));
    var dl = el('div', null, ''); dl.style.marginBottom = '6px'; dl.appendChild(dlButtons('', COLS, ROWS)); pane.appendChild(dl);

    pane.appendChild(el('div', 'dx-section-h', 'Column dictionary'));
    var wrap = el('div', 'dx-tablewrap');
    var t = el('table', 'dx-table');
    t.innerHTML = '<thead><tr><th>Column</th><th>Type</th><th>Unit</th><th>Summary</th><th>Description</th></tr></thead>';
    var tb = el('tbody');
    COLS.forEach(function (c) {
      var summary = '';
      if (isNumCol(c)) { var v = numVals(c); if (v.length) { summary = 'min ' + fmt(d3.min(v)) + ' · max ' + fmt(d3.max(v)) + ' · mean ' + fmt(d3.mean(v)); var miss = ROWS.length - v.length; if (miss) summary += ' · ' + miss + ' missing'; } }
      else { var keys = groupKeys(c); summary = keys.length + ' distinct' + (keys.length ? ' · top “' + keys[0].key + '”' : ''); }
      var tr = el('tr', null,
        '<td><strong>' + c.label + '</strong><span class="dx-coltype">' + c.key + '</span></td>' +
        '<td>' + c.type + '</td><td>' + (c.unit || '—') + '</td><td>' + summary + '</td><td>' + (c.desc || '') + '</td>');
      tb.appendChild(tr);
    });
    t.appendChild(tb); wrap.appendChild(t); pane.appendChild(wrap);
  }

  /* ---------- TABLE ---------- */
  function buildTable(pane) {
    pane.innerHTML = '';
    var state = { q: '', sort: null, dir: 1, cap: 400 };
    var bar = el('div', 'dx-toolbar');
    var search = el('input', 'dx-search'); search.placeholder = 'Filter rows…'; search.type = 'search';
    var count = el('span', 'dx-count', '');
    bar.appendChild(search); bar.appendChild(count); bar.appendChild(dlButtons('', COLS, ROWS));
    pane.appendChild(bar);
    var wrap = el('div', 'dx-tablewrap'); pane.appendChild(wrap);

    function filtered() {
      var q = state.q.trim().toLowerCase(), rows = ROWS;
      if (q) rows = rows.filter(function (r) { return COLS.some(function (c) { var v = val(c, r); return v != null && String(v).toLowerCase().indexOf(q) !== -1; }); });
      if (state.sort) { var c = state.sort; rows = rows.slice().sort(function (a, b) { var x = val(c, a), y = val(c, b); if (x == null) return 1; if (y == null) return -1; if (isNumCol(c)) return (x - y) * state.dir; return String(x).localeCompare(String(y)) * state.dir; }); }
      return rows;
    }
    function render() {
      var rows = filtered();
      var t = el('table', 'dx-table');
      var head = '<thead><tr>' + COLS.map(function (c) {
        var arrow = state.sort === c ? '<span class="dx-sort">' + (state.dir > 0 ? '▲' : '▼') + '</span>' : '';
        return '<th data-k="' + c.key + '" class="' + (isNumCol(c) ? 'num' : '') + '">' + c.label + arrow + '</th>';
      }).join('') + '</tr></thead>';
      var shown = rows.slice(0, state.cap);
      var body = '<tbody>' + shown.map(function (r) {
        return '<tr>' + COLS.map(function (c) { var v = val(c, r); return '<td class="' + (isNumCol(c) ? 'num' : '') + '">' + (v == null || v === '' ? '—' : fmt(v)) + '</td>'; }).join('') + '</tr>';
      }).join('') + '</tbody>';
      t.innerHTML = head + body;
      t.querySelectorAll('thead th').forEach(function (th) { th.onclick = function () { var c = colByKey(th.dataset.k); if (state.sort === c) state.dir = -state.dir; else { state.sort = c; state.dir = 1; } render(); }; });
      wrap.innerHTML = ''; wrap.appendChild(t);
      count.textContent = 'showing ' + shown.length.toLocaleString() + ' of ' + rows.length.toLocaleString() + (rows.length !== ROWS.length ? ' (filtered from ' + ROWS.length.toLocaleString() + ')' : '') + (rows.length > state.cap ? ' — download for all' : '');
    }
    search.oninput = function () { state.q = search.value; render(); };
    render();
  }

  /* ---------- CHART ---------- */
  function buildChart(pane) {
    pane.innerHTML = '';
    var nums = COLS.filter(isNumCol), cats = COLS.filter(function (c) { return c.type !== 'number'; });
    var d = (cfg.defaults && cfg.defaults.chart) || {};
    var st = { type: d.type || (nums.length >= 2 ? 'scatter' : 'histogram'), x: d.x || (nums[0] && nums[0].key), y: d.y || (nums[1] && nums[1].key), color: d.color || '', agg: d.agg || 'count' };

    var ctrls = el('div', 'dx-controls');
    function sel(label, opts, cur, on) {
      var c = el('label', 'dx-ctl', label + ' '); var s = el('select');
      opts.forEach(function (o) { var op = el('option'); op.value = o.v; op.textContent = o.t; if (o.v === cur) op.selected = true; s.appendChild(op); });
      s.onchange = function () { on(s.value); }; c.appendChild(s); return c;
    }
    function colOpts(list, allowNone) { var o = list.map(function (c) { return { v: c.key, t: c.label }; }); if (allowNone) o.unshift({ v: '', t: '(none)' }); return o; }
    var plot = el('div', 'dx-plot'); var legend = el('div', 'dx-legend');

    function rebuildControls() {
      ctrls.innerHTML = '';
      ctrls.appendChild(sel('Chart', [{ v: 'scatter', t: 'Scatter' }, { v: 'line', t: 'Line' }, { v: 'bar', t: 'Bar' }, { v: 'histogram', t: 'Histogram' }], st.type, function (v) { st.type = v; rebuildControls(); draw(); }));
      if (st.type === 'bar') {
        ctrls.appendChild(sel('Group by', colOpts(COLS), st.x, function (v) { st.x = v; draw(); }));
        ctrls.appendChild(sel('Value', colOpts(nums), st.y, function (v) { st.y = v; draw(); }));
        ctrls.appendChild(sel('Aggregate', [{ v: 'count', t: 'Count' }, { v: 'mean', t: 'Mean' }, { v: 'sum', t: 'Sum' }, { v: 'min', t: 'Min' }, { v: 'max', t: 'Max' }, { v: 'median', t: 'Median' }], st.agg, function (v) { st.agg = v; draw(); }));
      } else if (st.type === 'histogram') {
        ctrls.appendChild(sel('Value', colOpts(nums), st.x, function (v) { st.x = v; draw(); }));
      } else {
        ctrls.appendChild(sel('X', colOpts(nums), st.x, function (v) { st.x = v; draw(); }));
        ctrls.appendChild(sel('Y', colOpts(nums), st.y, function (v) { st.y = v; draw(); }));
        if (st.type === 'scatter' && cats.length) ctrls.appendChild(sel('Color by', colOpts(cats, true), st.color, function (v) { st.color = v; draw(); }));
      }
    }
    pane.appendChild(ctrls); pane.appendChild(plot); pane.appendChild(legend);

    function logOK(vals) { return d3.min(vals) > 0 && (d3.max(vals) / d3.min(vals) > 1000); }
    function draw() {
      plot.innerHTML = ''; legend.innerHTML = '';
      var W = plot.clientWidth || 860, H = 420, M = { t: 16, r: 18, b: 54, l: 64 };
      var iw = W - M.l - M.r, ih = H - M.t - M.b;
      var svg = d3.select(plot).append('svg').attr('viewBox', '0 0 ' + W + ' ' + H);
      var g = svg.append('g').attr('transform', 'translate(' + M.l + ',' + M.t + ')');
      function axes(x, y, xl, yl) {
        g.append('g').attr('transform', 'translate(0,' + ih + ')').call(d3.axisBottom(x).ticks(7, '~g'));
        g.append('g').call(d3.axisLeft(y).ticks(7, '~g'));
        g.append('text').attr('x', iw / 2).attr('y', ih + 42).attr('text-anchor', 'middle').attr('font-size', 12).attr('fill', '#5A6470').text(xl);
        g.append('text').attr('x', -ih / 2).attr('y', -48).attr('transform', 'rotate(-90)').attr('text-anchor', 'middle').attr('font-size', 12).attr('fill', '#5A6470').text(yl);
      }
      var cx = colByKey(st.x), cy = colByKey(st.y);

      if (st.type === 'scatter' || st.type === 'line') {
        if (!cx || !cy) { plot.innerHTML = '<div class="dx-empty">Pick an X and Y column.</div>'; return; }
        var pts = ROWS.map(function (r) { return { x: +val(cx, r), y: +val(cy, r), r: r }; }).filter(function (p) { return isFinite(p.x) && isFinite(p.y); });
        var xv = pts.map(function (p) { return p.x; }), yv = pts.map(function (p) { return p.y; });
        var x = (logOK(xv) ? d3.scaleLog() : d3.scaleLinear()).domain(d3.extent(xv)).range([0, iw]).nice();
        var y = (logOK(yv) ? d3.scaleLog() : d3.scaleLinear()).domain(d3.extent(yv)).range([ih, 0]).nice();
        axes(x, y, cx.label + (cx.unit ? ' (' + cx.unit + ')' : ''), cy.label + (cy.unit ? ' (' + cy.unit + ')' : ''));
        if (st.type === 'line') {
          pts.sort(function (a, b) { return a.x - b.x; });
          g.append('path').datum(pts).attr('fill', 'none').attr('stroke', '#1B5FAA').attr('stroke-width', 1.6).attr('d', d3.line().x(function (p) { return x(p.x); }).y(function (p) { return y(p.y); }));
        } else {
          var ccol = st.color ? colByKey(st.color) : null;
          var palette = ['#1B5FAA', '#E8704F', '#1E7D45', '#9C6FB8', '#E2A33D', '#3B82C4', '#C0392B', '#7A828C'];
          var keys = ccol ? groupKeys(ccol).slice(0, 8).map(function (k) { return k.key; }) : [];
          g.selectAll('circle').data(pts).join('circle').attr('cx', function (p) { return x(p.x); }).attr('cy', function (p) { return y(p.y); }).attr('r', 2.3).attr('fill-opacity', .5)
            .attr('fill', function (p) { if (!ccol) return '#1B5FAA'; var k = val(ccol, p.r); k = (k == null || k === '') ? '(none)' : k; var i = keys.indexOf(k); return i < 0 ? '#7A828C' : palette[i % palette.length]; });
          if (ccol) keys.forEach(function (k, i) { legend.appendChild(el('span', null, '<i style="background:' + palette[i % palette.length] + '"></i>' + k)); });
        }
        plot.querySelector('svg').insertAdjacentHTML('beforeend', '');
        g.selectAll('circle').append('title');
      } else if (st.type === 'histogram') {
        if (!cx) { plot.innerHTML = '<div class="dx-empty">Pick a value column.</div>'; return; }
        var vals = numVals(cx); if (!vals.length) { plot.innerHTML = '<div class="dx-empty">No numeric values.</div>'; return; }
        var x2 = d3.scaleLinear().domain(d3.extent(vals)).range([0, iw]).nice();
        var bins = d3.bin().domain(x2.domain()).thresholds(24)(vals);
        var y2 = d3.scaleLinear().domain([0, d3.max(bins, function (b) { return b.length; })]).range([ih, 0]).nice();
        axes(x2, y2, cx.label + (cx.unit ? ' (' + cx.unit + ')' : ''), 'count');
        g.selectAll('rect').data(bins).join('rect').attr('x', function (b) { return x2(b.x0) + 1; }).attr('y', function (b) { return y2(b.length); })
          .attr('width', function (b) { return Math.max(0, x2(b.x1) - x2(b.x0) - 1.5); }).attr('height', function (b) { return ih - y2(b.length); }).attr('fill', '#1B5FAA').attr('fill-opacity', .82);
      } else if (st.type === 'bar') {
        var gc = colByKey(st.x); if (!gc) { plot.innerHTML = '<div class="dx-empty">Pick a group-by column.</div>'; return; }
        var vc = colByKey(st.y);
        var groups = groupKeys(gc).slice(0, 30).map(function (gk) {
          var rs = ROWS.filter(gk.test); var v = st.agg === 'count' ? rs.length : agg(rs.map(function (r) { return +val(vc, r); }), st.agg);
          return { key: gk.key, v: v || 0 };
        });
        if (gc.type === 'category') groups.sort(function (a, b) { return b.v - a.v; });
        var xb = d3.scaleBand().domain(groups.map(function (d2) { return d2.key; })).range([0, iw]).padding(.18);
        var yb = d3.scaleLinear().domain([0, d3.max(groups, function (d2) { return d2.v; }) || 1]).range([ih, 0]).nice();
        g.append('g').attr('transform', 'translate(0,' + ih + ')').call(d3.axisBottom(xb)).selectAll('text').attr('font-size', 9).attr('transform', 'rotate(-35)').attr('text-anchor', 'end');
        g.append('g').call(d3.axisLeft(yb).ticks(7));
        g.append('text').attr('x', -ih / 2).attr('y', -48).attr('transform', 'rotate(-90)').attr('text-anchor', 'middle').attr('font-size', 12).attr('fill', '#5A6470').text(st.agg + (st.agg === 'count' ? '' : ' of ' + (vc ? vc.label : '')));
        g.selectAll('rect').data(groups).join('rect').attr('x', function (d2) { return xb(d2.key); }).attr('width', xb.bandwidth()).attr('y', function (d2) { return yb(d2.v); }).attr('height', function (d2) { return ih - yb(d2.v); }).attr('fill', '#1B5FAA').attr('fill-opacity', .85)
          .append('title').text(function (d2) { return d2.key + ': ' + fmt(d2.v); });
      }
    }
    rebuildControls(); draw();
  }

  /* ---------- PIVOT ---------- */
  function buildPivot(pane) {
    pane.innerHTML = '';
    var nums = COLS.filter(isNumCol);
    var groupables = COLS.filter(function (c) { return c.groupable !== false; });
    var d = (cfg.defaults && cfg.defaults.pivot) || {};
    var st = { group: d.group || (groupables[0] && groupables[0].key), value: d.value || (nums[0] && nums[0].key), agg: d.agg || 'count' };

    var ctrls = el('div', 'dx-controls');
    function sel(label, opts, cur, on) { var c = el('label', 'dx-ctl', label + ' '); var s = el('select'); opts.forEach(function (o) { var op = el('option'); op.value = o.v; op.textContent = o.t; if (o.v === cur) op.selected = true; s.appendChild(op); }); s.onchange = function () { on(s.value); }; c.appendChild(s); return c; }
    ctrls.appendChild(sel('Group by (rows)', groupables.map(function (c) { return { v: c.key, t: c.label }; }), st.group, function (v) { st.group = v; render(); }));
    ctrls.appendChild(sel('Aggregate', [{ v: 'count', t: 'Count' }, { v: 'mean', t: 'Mean' }, { v: 'sum', t: 'Sum' }, { v: 'min', t: 'Min' }, { v: 'max', t: 'Max' }, { v: 'median', t: 'Median' }], st.agg, function (v) { st.agg = v; render(); }));
    ctrls.appendChild(sel('Value', nums.map(function (c) { return { v: c.key, t: c.label }; }), st.value, function (v) { st.value = v; render(); }));
    pane.appendChild(ctrls);

    var layout = el('div', 'dx-pivot-layout');
    var tableWrap = el('div', null, ''); var chartWrap = el('div', 'dx-plot');
    layout.appendChild(tableWrap); layout.appendChild(chartWrap); pane.appendChild(layout);
    var dlRow = el('div', null, ''); dlRow.style.marginTop = '12px'; pane.appendChild(dlRow);

    function render() {
      var gc = colByKey(st.group), vc = colByKey(st.value);
      var groups = groupKeys(gc).map(function (gk) {
        var rs = ROWS.filter(gk.test);
        var v = st.agg === 'count' ? rs.length : agg(rs.map(function (r) { return +val(vc, r); }), st.agg);
        return { key: gk.key, v: v == null ? 0 : v, n: rs.length };
      }).filter(function (r) { return r.n > 0; });
      if (gc.type === 'category') groups.sort(function (a, b) { return b.v - a.v; });

      // table
      var valLabel = st.agg === 'count' ? 'Count' : (st.agg + ' of ' + vc.label);
      var t = el('table', 'dx-table');
      t.innerHTML = '<thead><tr><th>' + gc.label + '</th><th class="num">' + valLabel + '</th><th class="num">n rows</th></tr></thead><tbody>' +
        groups.map(function (r) { return '<tr><td>' + r.key + '</td><td class="num">' + fmt(r.v) + '</td><td class="num">' + r.n + '</td></tr>'; }).join('') + '</tbody>';
      var tw = el('div', 'dx-tablewrap'); tw.appendChild(t); tableWrap.innerHTML = ''; tableWrap.appendChild(tw);

      // horizontal bar chart
      chartWrap.innerHTML = '';
      var top = groups.slice(0, 14);
      var W = chartWrap.clientWidth || 520, rowH = 26, H = Math.max(120, top.length * rowH + 30), M = { t: 10, r: 56, b: 10, l: 120 };
      var iw = W - M.l - M.r;
      var svg = d3.select(chartWrap).append('svg').attr('viewBox', '0 0 ' + W + ' ' + H);
      var gg = svg.append('g').attr('transform', 'translate(' + M.l + ',' + M.t + ')');
      var x = d3.scaleLinear().domain([0, d3.max(top, function (r) { return r.v; }) || 1]).range([0, iw]);
      var y = d3.scaleBand().domain(top.map(function (r) { return r.key; })).range([0, H - M.t - M.b]).padding(.22);
      gg.append('g').call(d3.axisLeft(y).tickSize(0)).selectAll('text').attr('font-size', 10).each(function () { var t2 = d3.select(this); var s = t2.text(); if (s.length > 16) t2.text(s.slice(0, 15) + '…'); });
      gg.selectAll('rect').data(top).join('rect').attr('x', 0).attr('y', function (r) { return y(r.key); }).attr('height', y.bandwidth()).attr('width', function (r) { return x(r.v); }).attr('fill', '#1B5FAA').attr('fill-opacity', .85);
      gg.selectAll('text.v').data(top).join('text').attr('class', 'v').attr('x', function (r) { return x(r.v) + 5; }).attr('y', function (r) { return y(r.key) + y.bandwidth() / 2 + 3.5; }).attr('font-size', 10).attr('fill', '#52606D').text(function (r) { return fmt(r.v); });

      // download pivot
      var pcols = [{ key: 'group', label: gc.label, get: function (r) { return r.key; } }, { key: 'value', label: valLabel, get: function (r) { return r.v; } }, { key: 'n', label: 'n rows', get: function (r) { return r.n; } }];
      dlRow.innerHTML = ''; var saved = { rows: groups }; var b = el('button', 'dx-btn primary', '↓ Download pivot CSV');
      b.onclick = function () { download((cfg.filename || 'data') + '-pivot.csv', toCSV(pcols, groups), 'text/csv'); };
      dlRow.appendChild(b);
    }
    render();
  }

  /* ---------- shell ---------- */
  function open(config) {
    close();
    cfg = config; COLS = config.columns || []; ROWS = config.rows || [];
    root = el('div', 'dx-overlay');
    var panel = el('div', 'dx-panel');
    var m = cfg.meta || {};
    var head = el('div', 'dx-head');
    head.innerHTML = '<div><h2>' + (cfg.title || 'Dataset') + '</h2><div class="dx-sub">' +
      (m.source ? (m.url ? '<a href="' + m.url + '" target="_blank" rel="noopener">' + m.source + '</a>' : m.source) : '') +
      (m.fetched ? ' · fetched ' + m.fetched : '') + ' · ' + ROWS.length.toLocaleString() + ' rows</div></div><div class="dx-spacer"></div>';
    var closeBtn = el('button', 'dx-close', '×'); closeBtn.onclick = close; head.appendChild(closeBtn);
    panel.appendChild(head);

    var tabs = el('div', 'dx-tabs'); var body = el('div', 'dx-body');
    var defs = [['Overview', buildOverview], ['Table', buildTable], ['Chart', buildChart], ['Pivot', buildPivot]];
    var panes = {};
    defs.forEach(function (d2, i) {
      var btn = el('button', 'dx-tab' + (i === 0 ? ' active' : ''), d2[0]);
      var pane = el('div', 'dx-pane' + (i === 0 ? ' active' : ''));
      panes[d2[0]] = { btn: btn, pane: pane, build: d2[1], built: false };
      if (i === 0) { d2[1](pane); panes[d2[0]].built = true; }
      btn.onclick = function () {
        tabs.querySelectorAll('.dx-tab').forEach(function (b) { b.classList.remove('active'); });
        body.querySelectorAll('.dx-pane').forEach(function (p) { p.classList.remove('active'); });
        btn.classList.add('active'); pane.classList.add('active');
        if (!panes[d2[0]].built) { d2[1](pane); panes[d2[0]].built = true; }
      };
      tabs.appendChild(btn); body.appendChild(pane);
    });
    panel.appendChild(tabs); panel.appendChild(body); root.appendChild(panel);
    root.addEventListener('click', function (e) { if (e.target === root) close(); });
    document.addEventListener('keydown', onKey);
    document.body.appendChild(root);
  }
  function onKey(e) { if (e.key === 'Escape') close(); }
  function close() { if (root) { root.remove(); root = null; document.removeEventListener('keydown', onKey); } }

  window.DataExplorer = { open: open, close: close };
})();
