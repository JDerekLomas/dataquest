/* The Breathing Planet — Savvas Data Show
   Real data: NOAA GML Mauna Loa monthly mean CO2 (the Keeling Curve), 1958–today.
   Source: https://gml.noaa.gov/ccgg/trends/ (co2_mm_mlo.csv), fetched 2026-06-18.
   Every number in this lesson is computed from that data at runtime. Early months with
   too few days carry no deseasonalized value — the lesson marks them, never invents. */
(function () {
  'use strict';

  var SRC_URL = 'https://gml.noaa.gov/ccgg/trends/';
  var DATA = window.CO2_DATA.monthly;            // [{t, a, d}]
  var FIRST = DATA[0], LAST = DATA[DATA.length - 1];
  var RISE = +(LAST.a - FIRST.a).toFixed(1);     // ~116.6

  var COL = {
    line: '#C0392B', lineSoft: '#E08070', trend: '#1B5FAA', seasonal: '#1E7D45',
    fit: '#8A6FB8', grid: '#E8E5DE', ink: '#27313B', accent: '#E8704F', gold: '#E2A33D', axis: '#9AA4B0'
  };

  /* ---- decadal rate of rise (from the deseasonalized trend) ---- */
  function rateInRange(t0, t1) {
    var a = DATA.filter(function (r) { return r.t >= t0 && r.t < t1 && r.d != null; });
    if (a.length < 13) return null;
    return (a[a.length - 1].d - a[0].d) / (a[a.length - 1].t - a[0].t);
  }
  var DECADES = [[1960, 1970, '1960s'], [1970, 1980, '1970s'], [1980, 1990, '1980s'], [1990, 2000, '1990s'], [2000, 2010, '2000s'], [2010, 2020, '2010s'], [2020, 2030, '2020s']]
    .map(function (d) { return { label: d[2], rate: rateInRange(d[0], d[1]) }; }).filter(function (d) { return d.rate != null; });
  var RATE_FIRST = DECADES[0], RATE_LAST = DECADES[DECADES.length - 1];

  /* ---- seasonal amplitude (recent) ---- */
  var SEAS_AMP = (function () {
    var bym = {};
    DATA.forEach(function (r) { if (r.t >= 2010 && r.d != null) { (bym[Math.round((r.t % 1) * 12)] = bym[Math.round((r.t % 1) * 12)] || []).push(r.a - r.d); } });
    var vals = Object.keys(bym).map(function (k) { return bym[k].reduce(function (s, x) { return s + x; }, 0) / bym[k].length; });
    return +(d3.max(vals) - d3.min(vals)).toFixed(1);
  })();

  /* ---- milestone crossings (deseasonalized) ---- */
  function crossYear(ppm) { var r = DATA.find(function (x) { return x.d != null && x.d >= ppm; }); return r ? Math.floor(r.t) : null; }
  var MILES = [350, 400, 420].map(function (m) { return { ppm: m, year: crossYear(m) }; }).filter(function (m) { return m.year; });

  /* ---------- tooltip ---------- */
  var tooltip = document.getElementById('map-tooltip');
  function showTip(event, html) {
    tooltip.innerHTML = html; tooltip.hidden = false;
    var x = event.clientX + 14, y = event.clientY + 10;
    var r = tooltip.getBoundingClientRect();
    if (x + r.width > window.innerWidth - 8) x = event.clientX - r.width - 14;
    if (y + r.height > window.innerHeight - 8) y = event.clientY - r.height - 10;
    tooltip.style.left = x + 'px'; tooltip.style.top = y + 'px';
  }
  function hideTip() { tooltip.hidden = true; }
  function monthName(t) { var m = Math.round((t % 1) * 12); return ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][Math.min(11, Math.max(0, m))]; }
  function ptTip(d) { return '<strong>' + monthName(d.t) + ' ' + Math.floor(d.t) + '</strong><br>' + d.a.toFixed(2) + ' ppm CO₂' + (d.d != null ? '<br>trend ' + d.d.toFixed(2) + ' ppm' : ''); }

  function setInst(n, html, tone) { var bar = document.getElementById('inst-' + n); if (!bar) return; bar.innerHTML = html; bar.className = 'instruction-bar' + (tone ? ' tone-' + tone : ''); }
  function frameOf(n) { return document.querySelector('#viz-' + n).closest('.viz-frame'); }
  function ensureBadge(n) { var frame = frameOf(n); var b = frame.querySelector('.viz-badge'); if (!b) { b = document.createElement('div'); b.className = 'viz-badge'; frame.appendChild(b); } return b; }

  var ctxs = {}, chipActions = {}, utilActions = {};
  var VW = 720, VH = 500;

  /* ---------- time-series chart with zoom ---------- */
  function makeTimeSeries(n, cfg) {
    cfg = cfg || {};
    var M = { t: 20, r: 18, b: 44, l: 52 }, W = VW - M.l - M.r, H = VH - M.t - M.b;
    var container = d3.select('#viz-' + n);
    var svg = container.append('svg').attr('viewBox', '0 0 ' + VW + ' ' + VH).attr('preserveAspectRatio', 'xMidYMid meet');
    svg.append('rect').attr('width', VW).attr('height', VH).attr('fill', '#fff');
    var plot = svg.append('g').attr('transform', 'translate(' + M.l + ',' + M.t + ')');

    var x = d3.scaleLinear().domain([FIRST.t - 0.5, LAST.t + 0.5]).range([0, W]);
    var y = d3.scaleLinear().domain([d3.min(DATA, function (d) { return d.a; }) - 4, d3.max(DATA, function (d) { return d.a; }) + 4]).range([H, 0]);

    plot.append('g').attr('class', 'grid').attr('transform', 'translate(0,' + H + ')').call(d3.axisBottom(x).ticks(8).tickSize(-H).tickFormat('')).call(function (g) { g.selectAll('line').attr('stroke', COL.grid); g.select('.domain').remove(); });
    plot.append('g').attr('class', 'grid').call(d3.axisLeft(y).ticks(6).tickSize(-W).tickFormat('')).call(function (g) { g.selectAll('line').attr('stroke', COL.grid); g.select('.domain').remove(); });
    var xAxisG = plot.append('g').attr('transform', 'translate(0,' + H + ')').call(d3.axisBottom(x).ticks(8).tickFormat(d3.format('d'))); xAxisG.selectAll('text').attr('font-size', 10).attr('fill', '#5A6470');
    plot.append('g').call(d3.axisLeft(y).ticks(6)).selectAll('text').attr('font-size', 10).attr('fill', '#5A6470');
    plot.append('text').attr('x', W / 2).attr('y', H + 36).attr('text-anchor', 'middle').attr('font-size', 11).attr('fill', '#5A6470').text('year');
    plot.append('text').attr('x', -H / 2).attr('y', -38).attr('transform', 'rotate(-90)').attr('text-anchor', 'middle').attr('font-size', 11).attr('fill', '#5A6470').text('atmospheric CO₂ (parts per million)');

    svg.append('clipPath').attr('id', 'clip-' + n).append('rect').attr('width', W).attr('height', H);
    var inner = plot.append('g').attr('clip-path', 'url(#clip-' + n + ')');
    var overlayG = inner.append('g');
    var lineG = inner.append('g');
    var dotsG = inner.append('g');
    var fxG = inner.append('g');

    var lineRaw = d3.line().x(function (d) { return x(d.t); }).y(function (d) { return y(d.a); });
    var lineTrend = d3.line().defined(function (d) { return d.d != null; }).x(function (d) { return x(d.t); }).y(function (d) { return y(d.d); });

    var path = lineG.append('path').datum(DATA).attr('fill', 'none').attr('stroke', cfg.lineColor || COL.line).attr('stroke-width', 1.6).attr('d', lineRaw);

    var dots = null;
    if (cfg.dots !== false) {
      dots = dotsG.selectAll('circle').data(DATA).join('circle').attr('cx', function (d) { return x(d.t); }).attr('cy', function (d) { return y(d.a); }).attr('r', 1.5).attr('fill', cfg.lineColor || COL.line).attr('fill-opacity', 0.0);
      if (cfg.tips !== false) dots.on('mousemove', function (ev, d) { showTip(ev, ptTip(d)); }).on('mouseleave', hideTip);
    }

    var zoom = d3.zoom().scaleExtent([1, 40]).on('zoom', function (ev) {
      var t = ev.transform;
      lineG.attr('transform', t); dotsG.attr('transform', t); overlayG.attr('transform', t); fxG.attr('transform', t);
      path.attr('stroke-width', 1.6 / Math.sqrt(t.k));
      if (dots) dotsG.selectAll('circle').attr('r', 1.5 / Math.sqrt(t.k));
      var nx = t.rescaleX(x); xAxisG.call(d3.axisBottom(nx).ticks(8).tickFormat(d3.format('d'))).selectAll('text').attr('font-size', 10).attr('fill', '#5A6470');
    });
    svg.call(zoom).on('dblclick.zoom', null);

    var ctx = { n: n, svg: svg, plot: plot, x: x, y: y, W: W, H: H, path: path, dots: dots, lineG: lineG, overlayG: overlayG, fxG: fxG, lineRaw: lineRaw, lineTrend: lineTrend, zoom: zoom, cfg: cfg };
    ctxs[n] = ctx; chipActions[n] = chipActions[n] || {}; utilActions[n] = utilActions[n] || {};
    utilActions[n]['zoom-in'] = function () { ctx.svg.transition().duration(350).call(zoom.scaleBy, 1.8); };
    utilActions[n]['zoom-out'] = function () { ctx.svg.transition().duration(350).call(zoom.scaleBy, 1 / 1.8); };
    utilActions[n]['reset'] = function () { ctx.svg.transition().duration(450).call(zoom.transform, d3.zoomIdentity); };
    return ctx;
  }

  function drawProgressive(ctx) {
    var node = ctx.path.node(); if (!node) return;
    var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var L = node.getTotalLength();
    ctx.path.attr('stroke-dasharray', L + ' ' + L).attr('stroke-dashoffset', L)
      .transition().duration(reduced ? 0 : 2200).ease(d3.easeLinear).attr('stroke-dashoffset', 0)
      .on('end', function () { ctx.path.attr('stroke-dasharray', null); });
  }
  function zoomToYears(ctx, y0, y1) {
    var k = (ctx.x.domain()[1] - ctx.x.domain()[0]) / (y1 - y0);
    var tx = -ctx.x(y0) * k;
    ctx.svg.transition().duration(800).call(ctx.zoom.transform, d3.zoomIdentity.scale(k).translate(tx / k, 0));
  }
  function flashChip(btn, fn) { btn.classList.add('active'); if (fn) fn(); setTimeout(function () { btn.classList.remove('active'); }, 1400); }

  /* ============================================================
     PASS 1 — per-step visualizations
     ============================================================ */
  function initStep1() {
    var ctx = makeTimeSeries(1, { dots: false });
    ctx.path.attr('opacity', 0);          // hide the line; show only the first point
    var d0 = FIRST;
    var cx = ctx.x(d0.t), cy = ctx.y(d0.a);
    var halo = ctx.fxG.append('circle').attr('cx', cx).attr('cy', cy).attr('r', 6).attr('fill', 'none').attr('stroke', COL.line).attr('stroke-width', 2);
    ctx.fxG.append('circle').attr('cx', cx).attr('cy', cy).attr('r', 4.5).attr('fill', COL.line).attr('stroke', '#fff').attr('stroke-width', 1.2);
    ctx.fxG.append('text').attr('x', cx + 12).attr('y', cy + 4).attr('font-size', 12).attr('font-weight', 700).attr('fill', COL.ink).attr('paint-order', 'stroke').attr('stroke', '#fff').attr('stroke-width', 3).text('Mar 1958 · ' + d0.a.toFixed(1) + ' ppm');
    var played = false;
    ctx.entryAnimation = function () { if (played) return; played = true; (function loop() { if (!document.body.contains(halo.node())) return; halo.attr('r', 6).style('opacity', 0.9).transition().duration(1500).ease(d3.easeCubicOut).attr('r', 26).style('opacity', 0).on('end', loop); })(); };
    chipActions[1] = {
      value: function (b) { flashChip(b, function () { setInst(1, 'The value: 315.7 ppm means about 316 CO₂ molecules in every million molecules of air.', 'success'); }); },
      when: function (b) { flashChip(b, function () { setInst(1, 'When: March 1958 — the very first month of a record that still runs today.', 'success'); }); },
      place: function (b) { flashChip(b, function () { setInst(1, 'The place: Mauna Loa, Hawaii — high, remote air that samples the whole planet, not one city.', 'success'); }); },
      source: function (b) { flashChip(b, function () { setInst(1, 'Source: NOAA Global Monitoring Laboratory. Every value here is a real measurement.', 'success'); }); }
    };
  }

  function initStep2() {
    var ctx = makeTimeSeries(2);
    var played = false;
    ctx.entryAnimation = function () { if (played) return; played = true; drawProgressive(ctx); if (ctx.dots) ctx.dots.transition().delay(2000).duration(500).attr('fill-opacity', 0.35); setInst(2, 'One reading → ' + DATA.length + ' monthly readings, drawn in time order.', 'success'); };
    chipActions[2] = baseChips(ctx, 2);
  }

  function initStep3() {
    var ctx = makeTimeSeries(3);
    if (ctx.dots) ctx.dots.attr('fill-opacity', 0.3);
    var seed = 1958; function rnd() { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; }
    var shuffled = DATA.map(function (d) { return d.a; });
    for (var i = shuffled.length - 1; i > 0; i--) { var j = Math.floor(rnd() * (i + 1)); var tmp = shuffled[i]; shuffled[i] = shuffled[j]; shuffled[j] = tmp; }
    var scram = DATA.map(function (d, i) { return { t: d.t, a: shuffled[i] }; });
    var isScram = false;
    function setMode(toScram) {
      isScram = toScram;
      var data = toScram ? scram : DATA;
      ctx.path.datum(data).transition().duration(900).attr('d', ctx.lineRaw).attr('stroke', toScram ? '#9AA4B0' : COL.line);
      if (ctx.dots) ctx.dots.data(data).transition().duration(900).attr('cy', function (d) { return ctx.y(d.a); }).attr('fill', toScram ? '#9AA4B0' : COL.line);
      setInst(3, toScram ? 'Synthetic comparison: the same values, shuffled out of time order. The climb dissolves into noise.' : 'Real data, in time order: a relentless climb with a yearly wiggle.', toScram ? 'warn' : 'success');
    }
    utilActions[3] = utilActions[3] || {};
    utilActions[3]['shuffle'] = function (b) { setMode(!isScram); if (b) b.classList.toggle('active', isScram); };
    var played = false;
    ctx.entryAnimation = function () { if (played) return; played = true; drawProgressive(ctx); };
    chipActions[3] = Object.assign(baseChips(ctx, 3), { compare: function (b) { flashChip(b, function () { setMode(!isScram); }); } });
  }

  function initStep4() {
    var ctx = makeTimeSeries(4);
    if (ctx.dots) ctx.dots.attr('fill-opacity', 0.3).style('cursor', 'pointer');
    var card = null;
    function openRecord(d) {
      if (card) card.remove();
      if (ctx.dots) ctx.dots.attr('r', 1.5).attr('stroke', 'none');
      var node = ctx.dots.filter(function (x) { return x === d; }); node.attr('r', 4).attr('fill', COL.accent).attr('stroke', COL.ink).attr('stroke-width', 1.2).raise();
      var cx = ctx.x(d.t), cy = ctx.y(d.a), left = cx > ctx.W / 2;
      card = ctx.fxG.append('g').attr('transform', 'translate(' + (left ? cx - 188 : cx + 12) + ',' + Math.max(6, Math.min(cy - 40, ctx.H - 132)) + ')');
      card.append('rect').attr('width', 176).attr('height', 122).attr('rx', 8).attr('fill', '#fff').attr('stroke', COL.ink).attr('filter', 'drop-shadow(0 4px 10px rgba(0,0,0,.18))');
      var rows = [['Date', monthName(d.t) + ' ' + Math.floor(d.t)], ['CO₂', d.a.toFixed(2) + ' ppm'], ['Trend value', d.d != null ? d.d.toFixed(2) + ' ppm' : 'too few days*'], ['Source', 'Mauna Loa, NOAA']];
      rows.forEach(function (r, i) { var g = card.append('g').attr('transform', 'translate(12,' + (24 + i * 23) + ')'); g.append('text').attr('font-size', 9).attr('fill', '#8A93A0').text(r[0].toUpperCase()); g.append('text').attr('x', 70).attr('font-size', 10.5).attr('font-weight', 600).attr('fill', COL.ink).text(r[1]); });
      setInst(4, 'Record opened. A point marked * lacked enough daily readings for a trend value — flagged, not faked.', 'success');
    }
    if (ctx.dots) ctx.dots.on('click', function (ev, d) { openRecord(d); });
    var played = false;
    ctx.entryAnimation = function () { if (played) return; played = true; openRecord(DATA[Math.floor(DATA.length * 0.7)]); };
    chipActions[4] = {
      value: function (b) { flashChip(b, function () { setInst(4, 'CO₂ value: the monthly mean, the number plotted up the chart.', 'success'); }); },
      days: function (b) { flashChip(b, function () { setInst(4, 'Days behind it: a monthly mean built from many daily samples is far sturdier than one reading.', 'success'); }); },
      uncert: function (b) { flashChip(b, function () { setInst(4, 'Uncertainty: NOAA also records how much each month could be off — honest data shows its error bars.', 'success'); }); },
      source: function (b) { flashChip(b, function () { setInst(4, 'Source: NOAA Mauna Loa monthly mean CO₂. Cited in the Data panel.', 'success'); }); }
    };
  }

  function initStep5() { var ctx = makeTimeSeries(5); if (ctx.dots) ctx.dots.attr('fill-opacity', 0.3); ctx.entryAnimation = function () {}; chipActions[5] = baseChips(ctx, 5); }

  function initStep6() {
    var ctx = makeTimeSeries(6);
    if (ctx.dots) ctx.dots.attr('fill-opacity', 0.25);
    var trend = ctx.overlayG.append('path').datum(DATA).attr('fill', 'none').attr('stroke', COL.trend).attr('stroke-width', 2.4).attr('d', ctx.lineTrend).attr('opacity', 0);
    var decomposed = false;
    function decompose(on) {
      decomposed = on; ctx.decompSeen = on;
      trend.transition().duration(700).attr('opacity', on ? 1 : 0);
      ctx.path.transition().duration(700).attr('stroke', on ? COL.lineSoft : COL.line).attr('stroke-opacity', on ? 0.6 : 1);
      ensureBadge(6).innerHTML = on ? '<span style="color:' + COL.trend + '">━ trend</span> + <span style="color:' + COL.line + '">seasonal wiggle</span> ≈ ±' + (SEAS_AMP / 2).toFixed(1) + ' ppm/yr' : '';
      setInst(6, on ? 'Split apart: a smooth blue trend, plus a red seasonal cycle of about ' + SEAS_AMP + ' ppm riding on top.' : 'Combined line shown.', 'success');
    }
    utilActions[6] = utilActions[6] || {};
    utilActions[6]['decompose'] = function (b) { decompose(!decomposed); if (b) b.classList.toggle('active', decomposed); };
    ctx.entryAnimation = function () {};
    chipActions[6] = Object.assign(baseChips(ctx, 6), {
      decompose: function (b) { flashChip(b, function () { decompose(true); }); },
      trend: function (b) { flashChip(b, function () { decompose(true); setInst(6, 'The trend alone: strip the seasonal wiggle and a smooth, accelerating climb remains.', 'success'); }); },
      oneyear: function (b) { flashChip(b, function () { decompose(true); zoomToYears(ctx, 2015, 2019); setInst(6, 'Zoomed to 2015–2019: see the sawtooth — down through summer, up through winter, every year.', 'success'); }); },
      amplitude: function (b) { flashChip(b, function () { decompose(true); setInst(6, 'The breathing is ~' + SEAS_AMP + ' ppm peak-to-trough: high in May, low in September.', 'success'); }); }
    });
  }

  function baseChips(ctx, n) {
    return {
      rise: function (b) { flashChip(b, function () { setInst(n, 'The rise: from ' + FIRST.a.toFixed(0) + ' ppm in 1958 to ' + LAST.a.toFixed(0) + ' today — up about ' + RISE + ' ppm.', 'success'); }); },
      wiggle: function (b) { flashChip(b, function () { zoomToYears(ctx, 2010, 2016); setInst(n, 'Zoom in and the yearly wiggle appears — the planet breathing in and out.', 'success'); }); },
      compare: function (b) { flashChip(b, function () { setInst(n, 'Compare the 1960s slope to today’s: the line is steeper now than when it began.', 'success'); }); },
      count: function (b) { flashChip(b, function () { setInst(n, DATA.length + ' monthly readings, 1958 to ' + Math.floor(LAST.t) + '.', 'success'); }); },
      time: function (b) { flashChip(b, function () { setInst(n, 'The x-axis is time — that is what makes this a time series. Order matters.', 'success'); }); },
      latest: function (b) { flashChip(b, function () { zoomToYears(ctx, 2018, LAST.t + 0.5); setInst(n, 'Latest reading: ' + monthName(LAST.t) + ' ' + Math.floor(LAST.t) + ', ' + LAST.a.toFixed(1) + ' ppm.', 'success'); }); }
    };
  }

  function makeBars(n) {
    var container = d3.select('#viz-' + n);
    var svg = container.append('svg').attr('viewBox', '0 0 ' + VW + ' ' + VH).attr('preserveAspectRatio', 'xMidYMid meet');
    svg.append('rect').attr('width', VW).attr('height', VH).attr('fill', '#fff');
    var ctx = { n: n, svg: svg, root: svg.append('g') };
    ctxs[n] = ctx; chipActions[n] = chipActions[n] || {}; utilActions[n] = utilActions[n] || {};
    return ctx;
  }

  function initStep7() {
    var ctx = makeBars(7);
    var M = { t: 30, r: 20, b: 56, l: 56 }, W = VW - M.l - M.r, H = VH - M.t - M.b;
    var g = ctx.root.attr('transform', 'translate(' + M.l + ',' + M.t + ')');
    var data = DECADES;
    var x = d3.scaleBand().domain(data.map(function (d) { return d.label; })).range([0, W]).padding(0.2);
    var y = d3.scaleLinear().domain([0, d3.max(data, function (d) { return d.rate; }) * 1.12]).range([H, 0]);
    g.append('g').attr('transform', 'translate(0,' + H + ')').call(d3.axisBottom(x)).selectAll('text').attr('font-size', 10);
    g.append('g').call(d3.axisLeft(y).ticks(6));
    g.append('text').attr('x', -H / 2).attr('y', -40).attr('transform', 'rotate(-90)').attr('text-anchor', 'middle').attr('font-size', 11).attr('fill', '#5A6470').text('CO₂ rise (ppm per year)');
    g.append('text').attr('x', W / 2).attr('y', H + 44).attr('text-anchor', 'middle').attr('font-size', 11).attr('fill', '#5A6470').text('decade');
    var bars = g.selectAll('rect.bar').data(data).join('rect').attr('class', 'bar').attr('x', function (d) { return x(d.label); }).attr('width', x.bandwidth()).attr('y', H).attr('height', 0)
      .attr('fill', function (d, i) { return i === data.length - 1 ? COL.accent : '#E08070'; })
      .on('mousemove', function (ev, d) { showTip(ev, '<strong>' + d.label + '</strong><br>' + d.rate.toFixed(2) + ' ppm/yr'); }).on('mouseleave', hideTip);
    g.selectAll('text.val').data(data).join('text').attr('class', 'val').attr('x', function (d) { return x(d.label) + x.bandwidth() / 2; }).attr('y', function (d) { return y(d.rate) - 5; }).attr('text-anchor', 'middle').attr('font-size', 9.5).attr('fill', '#7A828C').attr('opacity', 0).text(function (d) { return d.rate.toFixed(2); });
    var played = false;
    ctx.entryAnimation = function () { if (played) return; played = true; var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches; bars.transition().delay(function (d, i) { return reduced ? 0 : i * 80; }).duration(reduced ? 0 : 650).attr('y', function (d) { return y(d.rate); }).attr('height', function (d) { return H - y(d.rate); }); g.selectAll('text.val').transition().delay(function (d, i) { return reduced ? 0 : 350 + i * 80; }).duration(300).attr('opacity', 1); };
    chipActions[7] = {
      axes: function (b) { flashChip(b, function () { setInst(7, 'X = decade. Y = how many ppm CO₂ rose each year in that decade.', 'success'); }); },
      bars: function (b) { flashChip(b, function () { setInst(7, 'Each bar is taller than the last — the rate keeps climbing.', 'success'); }); },
      accel: function (b) { flashChip(b, function () { bars.filter(function (d, i) { return i === data.length - 1; }).attr('fill', COL.gold).transition().duration(600).attr('fill', COL.accent); setInst(7, RATE_FIRST.label + ': ' + RATE_FIRST.rate.toFixed(2) + ' ppm/yr → ' + RATE_LAST.label + ': ' + RATE_LAST.rate.toFixed(2) + ' ppm/yr. Nearly triple.', 'success'); }); },
      count: function (b) { flashChip(b, function () { setInst(7, 'From ' + RATE_FIRST.rate.toFixed(2) + ' to ' + RATE_LAST.rate.toFixed(2) + ' ppm/yr across the decades.', 'success'); }); }
    };
  }

  function initStep8() {
    var ctx = makeTimeSeries(8);
    if (ctx.dots) ctx.dots.attr('fill-opacity', 0.25);
    // least-squares fit on the deseasonalized trend
    var pts = DATA.filter(function (d) { return d.d != null; });
    var n = pts.length, sx = 0, sy = 0, sxx = 0, sxy = 0;
    pts.forEach(function (p) { sx += p.t; sy += p.d; sxx += p.t * p.t; sxy += p.t * p.d; });
    var slope = (n * sxy - sx * sy) / (n * sxx - sx * sx), intercept = (sy - slope * sx) / n;
    function fitY(t) { return slope * t + intercept; }
    var fitData = [{ t: FIRST.t, v: fitY(FIRST.t) }, { t: LAST.t, v: fitY(LAST.t) }];
    var fitLine = d3.line().x(function (d) { return ctx.x(d.t); }).y(function (d) { return ctx.y(d.v); });
    var fit = ctx.overlayG.append('path').datum(fitData).attr('fill', 'none').attr('stroke', COL.fit).attr('stroke-width', 2.2).attr('stroke-dasharray', '6 4').attr('d', fitLine).attr('opacity', 0);
    var gapNote = ctx.overlayG.append('g').attr('opacity', 0);
    var miss = +(LAST.d - fitY(LAST.t)).toFixed(1);   // how far the straight line under-predicts the latest trend
    var shown = false;
    function showFit(on) {
      shown = on; ctx.fitSeen = on;
      fit.transition().duration(700).attr('opacity', on ? 1 : 0);
      gapNote.transition().duration(500).attr('opacity', on ? 1 : 0);
      if (on && !gapNote.selectChildren('*').size()) {
        var lx = ctx.x(LAST.t), ly1 = ctx.y(LAST.d), ly2 = ctx.y(fitY(LAST.t));
        gapNote.append('line').attr('x1', lx).attr('x2', lx).attr('y1', ly1).attr('y2', ly2).attr('stroke', COL.accent).attr('stroke-width', 2);
        gapNote.append('text').attr('x', lx - 6).attr('y', (ly1 + ly2) / 2).attr('text-anchor', 'end').attr('font-size', 10).attr('font-weight', 700).attr('fill', COL.accent).attr('paint-order', 'stroke').attr('stroke', '#fff').attr('stroke-width', 2.5).text('+' + miss + ' ppm');
      }
      setInst(8, on ? 'The straight fit under-predicts today by about ' + miss + ' ppm — the real trend curves upward.' : 'Trend shown without a fit.', 'success');
    }
    utilActions[8] = utilActions[8] || {};
    utilActions[8]['fit'] = function (b) { showFit(!shown); if (b) b.classList.toggle('active', shown); };
    ctx.evidenceFx = function () { showFit(true); };
    var played = false;
    ctx.entryAnimation = function () { if (played) return; played = true; };
    chipActions[8] = {
      fit: function (b) { flashChip(b, function () { showFit(true); }); },
      gap: function (b) { flashChip(b, function () { showFit(true); setInst(8, 'The gap at the recent end: the data has pulled ' + miss + ' ppm above the straight ruler.', 'success'); }); },
      curve: function (b) { flashChip(b, function () { showFit(false); setInst(8, 'The real trend bends upward — a curve, not a line. That bend is the acceleration.', 'success'); }); },
      extrapolate: function (b) { flashChip(b, function () { showFit(true); setInst(8, 'Extend the straight line and it keeps under-shooting: linear assumptions hide accelerating change.', 'success'); }); }
    };
  }

  function initStep9() {
    var ctx = makeTimeSeries(9);
    if (ctx.dots) ctx.dots.attr('fill-opacity', 0.3);
    var trend = ctx.overlayG.append('path').datum(DATA).attr('fill', 'none').attr('stroke', COL.trend).attr('stroke-width', 2).attr('d', ctx.lineTrend).attr('opacity', 0.45);
    var shown = false;
    function marks() {
      if (shown) return; shown = true;
      MILES.forEach(function (m) {
        var rec = DATA.find(function (x) { return x.d != null && x.d >= m.ppm; }); if (!rec) return;
        var cx = ctx.x(rec.t), cy = ctx.y(m.ppm);
        ctx.fxG.append('line').attr('x1', cx).attr('x2', cx).attr('y1', cy).attr('y2', ctx.H).attr('stroke', COL.gold).attr('stroke-width', 1).attr('stroke-dasharray', '3 3').attr('opacity', 0).transition().duration(500).attr('opacity', 0.7);
        ctx.fxG.append('circle').attr('cx', cx).attr('cy', cy).attr('r', 4).attr('fill', COL.gold).attr('stroke', '#fff').attr('stroke-width', 1.2);
        ctx.fxG.append('text').attr('x', cx + 5).attr('y', cy - 6).attr('font-size', 10).attr('font-weight', 700).attr('fill', COL.ink).attr('paint-order', 'stroke').attr('stroke', '#fff').attr('stroke-width', 2.5).text(m.ppm + ' · ' + m.year);
      });
      ensureBadge(9).innerHTML = '<strong>+' + RISE + ' ppm</strong> since 1958 · crossed ' + MILES.map(function (m) { return m.ppm; }).join(', ') + ' ppm';
      setInst(9, 'Milestones: CO₂ crossed ' + MILES.map(function (m) { return m.ppm + ' in ' + m.year; }).join(', ') + '. The curve, named.', 'success');
    }
    utilActions[9] = utilActions[9] || {};
    utilActions[9]['milestones'] = function (b) { marks(); if (b) b.classList.add('active'); };
    ctx.evidenceFx = function () { marks(); };
    ctx.entryAnimation = function () {};
    chipActions[9] = Object.assign(baseChips(ctx, 9), { milestones: function (b) { flashChip(b, function () { marks(); }); }, accel: function (b) { flashChip(b, function () { setInst(9, 'Accelerating: ' + RATE_FIRST.rate.toFixed(2) + ' ppm/yr in the ' + RATE_FIRST.label + ', ' + RATE_LAST.rate.toFixed(2) + ' now.', 'success'); }); } });
  }

  /* ---------- chip + util wiring ---------- */
  document.querySelectorAll('.chip').forEach(function (btn) { btn.addEventListener('click', function () { var step = +btn.closest('.step').dataset.step, key = btn.dataset.chip; if (chipActions[step] && chipActions[step][key]) chipActions[step][key](btn); }); });
  document.querySelectorAll('.util-btn').forEach(function (btn) { btn.addEventListener('click', function () { var step = +btn.closest('.step').dataset.step, key = btn.dataset.util; if (utilActions[step] && utilActions[step][key]) utilActions[step][key](btn); }); });

  /* ---------- lazy init + entry ---------- */
  var initFns = { 1: initStep1, 2: initStep2, 3: initStep3, 4: initStep4, 5: initStep5, 6: initStep6, 7: initStep7, 8: initStep8, 9: initStep9 };
  var initIO = new IntersectionObserver(function (entries) { entries.forEach(function (e) { if (!e.isIntersecting) return; var n = +e.target.dataset.step; if (initFns[n]) { initFns[n](); initFns[n] = null; } }); }, { rootMargin: '400px 0px' });
  var animIO = new IntersectionObserver(function (entries) { entries.forEach(function (e) { if (!e.isIntersecting) return; var n = +e.target.dataset.step; if (ctxs[n] && ctxs[n].entryAnimation) ctxs[n].entryAnimation(); }); }, { threshold: 0.35 });
  document.querySelectorAll('.step').forEach(function (sec) { initIO.observe(sec); animIO.observe(sec); });
  if (initFns[1]) { initFns[1](); initFns[1] = null; }

  /* ---------- top-nav ---------- */
  var notesPanel = document.getElementById('notes-panel');
  document.getElementById('nav-notes').addEventListener('click', function () { notesPanel.hidden = !notesPanel.hidden; });
  document.getElementById('notes-close').addEventListener('click', function () { notesPanel.hidden = true; });
  var dataModal = document.getElementById('data-modal');
  document.getElementById('nav-data').addEventListener('click', function () {
    var table = document.getElementById('data-table');
    if (!table.innerHTML) {
      var sample = DATA.filter(function (d, i) { return i % Math.ceil(DATA.length / 28) === 0; });
      var rows = sample.map(function (d) { return '<tr><td>' + monthName(d.t) + ' ' + Math.floor(d.t) + '</td><td>' + d.a.toFixed(2) + '</td><td>' + (d.d != null ? d.d.toFixed(2) : '—') + '</td></tr>'; }).join('');
      table.innerHTML = '<thead><tr><th>Month</th><th>CO₂ (ppm)</th><th>Trend (ppm)</th></tr></thead><tbody>' + rows + '</tbody>' +
        '<caption style="caption-side:bottom;text-align:left;padding:10px 2px;font-size:12px;color:#5A6470">Every ~28th month shown. Real data — <a href="' + SRC_URL + '" target="_blank" rel="noopener" style="color:#1B5FAA">NOAA Mauna Loa monthly mean CO₂</a>. ' + DATA.length + ' months total.</caption>';
    }
    dataModal.hidden = false;
  });
  document.getElementById('data-close').addEventListener('click', function () { dataModal.hidden = true; });
  dataModal.addEventListener('click', function (ev) { if (ev.target === dataModal) dataModal.hidden = true; });
  document.getElementById('nav-explore').addEventListener('click', function () { document.getElementById('step-5').scrollIntoView({ behavior: 'smooth', block: 'start' }); });
  window.LESSON = { DATA: DATA, DECADES: DECADES, MILES: MILES, RISE: RISE, SEAS_AMP: SEAS_AMP, ctxs: ctxs, COL: COL };

  /* ============================================================
     PASS 2 — answer checking, gating, audio (data-agnostic)
     ============================================================ */
  var STORE_KEY = 'climate-state-v1';
  var state = { answers: {}, claim: '', notes: '', skips: {}, muted: false };
  try { var saved = JSON.parse(localStorage.getItem(STORE_KEY)); if (saved && typeof saved === 'object') { for (var sk in state) if (saved[sk] !== undefined) state[sk] = saved[sk]; } } catch (e) {}
  function saveState() { try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) {} }

  var ANSWERS = { 1: 'D', 2: 'B', 3: 'B', 4: 'B', 6: 'B', 7: 'B', 8: 'B' };
  var EXPLAIN = {
    1: 'A precise value in known units, a clean measurement site, and the promise of a long record to come are all reasons to take one reading seriously. Real science stacks every such clue — so “all of these together” is strongest.',
    2: 'A lone reading is just a dot. Put ' + DATA.length + ' of them in time order and you can finally see <strong>change</strong> — the whole point of a time series.',
    3: 'Press Shuffle and the climb dissolves into noise: order in time is what carries the meaning. The real line rises about ' + RISE + ' ppm with a small yearly wiggle on top.',
    4: 'Each point is a monthly mean with a date, a CO₂ value, the number of daily readings behind it, and an uncertainty. The value is only as trustworthy as those supporting fields — which is why honest data keeps them.',
    6: 'Decomposition splits the curve into a smooth long-term <strong>trend</strong> (the climb) plus a repeating <strong>seasonal cycle</strong> of about ' + SEAS_AMP + ' ppm — the planet breathing as Northern forests grow and rest each year.',
    7: 'Measured per decade, the rise grows: about ' + RATE_FIRST.rate.toFixed(2) + ' ppm/yr in the ' + RATE_FIRST.label + ' and ' + RATE_LAST.rate.toFixed(2) + ' ppm/yr in the ' + RATE_LAST.label + '. The increase itself is <strong>accelerating</strong>.',
    8: 'There is a strong upward trend — but a straight-line fit under-predicts the present by several ppm, because the real trend <strong>curves upward</strong>. Mistaking a curve for a line hides accelerating change.'
  };
  var FB = {
    1: { ok: 'Exactly — value, site, and the record to come, stacked together.', no: 'Each clue matters; the power is in stacking all three reasons to investigate.' },
    2: { ok: 'Right: in time order, you can see how CO₂ changes.', no: 'A time series puts readings in order so you can see change. That’s what becomes possible.' },
    3: { ok: 'Yes — a steady climb with a yearly wiggle. Shuffle proves order matters.', no: 'Press Shuffle: out of order it’s noise. In order it climbs ~' + RISE + ' ppm.' },
    4: { ok: 'Right — a date, a value, and measures of how solid it is.', no: 'Re-read the record: date, value, days behind it, uncertainty — not just one number.' },
    6: { ok: 'Confirmed: a long-term trend plus a yearly seasonal cycle.', no: 'Split it apart: a smooth blue trend plus a red seasonal wiggle. Two patterns, added.' },
    7: { ok: 'Right — the yearly rise grows decade by decade. Accelerating.', no: 'Compare bar heights: ' + RATE_FIRST.rate.toFixed(2) + ' then, ' + RATE_LAST.rate.toFixed(2) + ' now. It’s speeding up.' },
    8: { ok: 'Exactly — strong trend, but the straight line under-fits a curve.', no: 'Watch the fit: it pulls away from the data at the recent end. The trend curves upward.' }
  };

  var completed = {}, skipUnlocked = state.skips || {}, doneCount = 0, streak = 0;
  function updateProgress() { document.getElementById('progress-fill').style.width = (doneCount / 9 * 100) + '%'; document.getElementById('progress-label').textContent = doneCount + ' / 9 checks'; }
  function complete(n) { if (completed[n]) return; completed[n] = true; document.getElementById('step-' + n).dataset.done = '1'; doneCount++; updateProgress(); applyGates(); }

  var toastTimer = null;
  function showToast(msg, tone) { var toast = document.getElementById('celebrate-toast'); if (!toast) return; toast.className = 'celebrate-toast tone-' + (tone || 'good'); toast.textContent = msg; toast.hidden = false; toast.classList.remove('show'); void toast.offsetWidth; toast.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(function () { toast.classList.remove('show'); setTimeout(function () { toast.hidden = true; }, 350); }, 2600); }
  function confettiBurst() { if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return; var colors = ['#C0392B', '#1B5FAA', '#1E7D45', '#E2A33D', '#E8704F', '#3B82C4']; var wrap = document.createElement('div'); wrap.className = 'confetti-wrap'; for (var i = 0; i < 70; i++) { var b = document.createElement('i'); b.className = 'confetti-bit'; b.style.left = (Math.random() * 100) + '%'; b.style.background = colors[i % colors.length]; b.style.animationDelay = (Math.random() * 0.3).toFixed(2) + 's'; b.style.animationDuration = (1.6 + Math.random() * 1.5).toFixed(2) + 's'; b.style.transform = 'rotate(' + Math.round(Math.random() * 360) + 'deg)'; wrap.appendChild(b); } document.body.appendChild(wrap); setTimeout(function () { wrap.remove(); }, 3600); }
  function celebrateStep(n, ok) {
    var fill = document.getElementById('progress-fill'); if (fill) { fill.classList.remove('pulse'); void fill.offsetWidth; fill.classList.add('pulse'); }
    if (ok && (n === 9 || doneCount === 9)) { showToast('Curve read — you decoded the Keeling Curve.', 'good'); confettiBurst(); return; }
    if (!ok) { showToast('Answer revealed — Step ' + n + ' logged. Keep going.', 'muted'); return; }
    var msg;
    if (doneCount === 3) msg = 'Three down — the trend is emerging.';
    else if (doneCount === 5) msg = 'Past halfway — 4 to go.';
    else if (doneCount === 7) msg = 'Almost there — just 2 to go.';
    else { msg = 'Step ' + n + ' complete'; if (streak >= 2) msg += ' · ' + streak + ' in a row'; }
    showToast(msg, 'good');
  }
  function runEvidenceFx(n) { if (ctxs[n] && ctxs[n].evidenceFx) ctxs[n].evidenceFx(); }

  function renderGradeRadio(n, value, silent) {
    var mcq = document.getElementById('mcq-' + n); var btn = mcq.querySelector('.check-btn'); var ok = value === ANSWERS[n];
    mcq.querySelectorAll('.mcq-choice').forEach(function (lab) { var inp = lab.querySelector('input'); if (inp.value === value) inp.checked = true; if (inp.value === ANSWERS[n]) lab.classList.add('correct'); if (inp.value === value && !ok) lab.classList.add('incorrect'); inp.disabled = true; });
    var fb = mcq.querySelector('.mcq-feedback'); fb.hidden = false; fb.className = 'mcq-feedback ' + (ok ? 'good' : 'bad');
    fb.innerHTML = (ok ? '<strong>Correct.</strong> ' : '<strong>Not quite — the correct answer is marked in green.</strong> ') + EXPLAIN[n];
    btn.disabled = true; btn.textContent = ok ? 'Correct ✓' : 'Answer revealed';
    if (!silent) runEvidenceFx(n);
    setInst(n, FB[n][ok ? 'ok' : 'no'], ok ? 'success' : 'error'); complete(n);
    if (!silent) { if (ok) streak++; else streak = 0; celebrateStep(n, ok); }
  }
  function gradeRadio(n, btn) {
    var mcq = document.getElementById('mcq-' + n); var sel = mcq.querySelector('input:checked');
    if (!sel) { setInst(n, 'Pick an answer first, then check it.', 'warn'); return; }
    if (n === 6 && (!ctxs[6] || !ctxs[6].decompSeen)) { setInst(6, 'Evidence first: press “Split it apart” and watch the trend and cycle separate, then check.', 'error'); return; }
    if (sel.value !== ANSWERS[n]) {
      streak = 0; mcq.querySelectorAll('.mcq-choice').forEach(function (lab) { lab.classList.remove('incorrect'); }); sel.closest('.mcq-choice').classList.add('incorrect');
      var fb = mcq.querySelector('.mcq-feedback'); fb.hidden = false; fb.className = 'mcq-feedback bad'; fb.innerHTML = '<strong>Not quite — try again.</strong> ' + (FB[n] ? FB[n].no : '');
      btn.textContent = 'Try again'; setInst(n, FB[n] ? FB[n].no : 'Look again, then re-check.', 'error'); return;
    }
    state.answers[n] = sel.value; saveState(); renderGradeRadio(n, sel.value, false);
  }
  function renderTags(values, silent) {
    var fb = document.querySelector('#mcq-5 .mcq-feedback');
    document.querySelectorAll('#mcq-5 input').forEach(function (i) { if (values.indexOf(i.value) !== -1) i.checked = true; i.disabled = true; });
    fb.hidden = false; fb.className = 'mcq-feedback good';
    fb.innerHTML = '<strong>Observations saved:</strong> ' + values.join(', ') + '. At the notice-and-wonder stage every honest observation counts — scientists describe first and explain later. Keep these words for your claim in Step 9.';
    var btn = document.querySelector('#mcq-5 .check-btn'); btn.disabled = true; btn.textContent = 'Observations saved ✓';
    setInst(5, 'Saved: ' + values.join(', ') + ' — good noticing.', 'success'); complete(5);
    if (!silent) { streak++; celebrateStep(5, true); }
  }
  function gradeTags(btn) { var checked = Array.prototype.slice.call(document.querySelectorAll('#mcq-5 input:checked')).map(function (i) { return i.value; }); if (!checked.length) { setInst(5, 'Tag at least one shape you can honestly say you see.', 'warn'); return; } state.answers[5] = checked; saveState(); renderTags(checked, false); }

  var GEO_TERMS = ['trend', 'cycle', 'curve', 'rise', 'climb', 'slope', 'line', 'sawtooth', 'wiggle', 'seasonal', 'acceler'];
  var PATTERN_TERMS = ['most', 'rare', 'percent', '%', 'since', 'ppm', 'accelerat', 'steeper', 'faster', 'every year', 'per year', 'doubl', 'triple'];
  function gradeClaim(btn) {
    var t = document.getElementById('claim-text').value.toLowerCase();
    if (t.trim().length < 15) { setInst(9, 'Write your claim first — a sentence or two in the box on the right.', 'warn'); return; }
    var hasGeo = GEO_TERMS.some(function (w) { return t.indexOf(w) !== -1; });
    var hasNum = /\d/.test(t) || PATTERN_TERMS.some(function (w) { return t.indexOf(w) !== -1; });
    var fb = document.querySelector('#mcq-9 .mcq-feedback');
    if (!hasGeo || !hasNum) {
      fb.hidden = false; fb.className = 'mcq-feedback bad'; var missing = [];
      if (!hasGeo) missing.push('a <strong>shape word</strong> (trend, cycle, curve, rise…)');
      if (!hasNum) missing.push('a <strong>number or pattern observation</strong> (a count like “' + RISE + ' ppm since 1958”, or a word like “accelerating”)');
      fb.innerHTML = 'Almost — your claim still needs ' + missing.join(' and ') + '. The Milestones chip gives you real years to cite.';
      setInst(9, 'Strengthen the claim: pair a shape word with a number or pattern word, like a scientist would.', 'error'); return;
    }
    renderClaimAccepted(false);
  }
  function renderClaimAccepted(silent) {
    var fb = document.querySelector('#mcq-9 .mcq-feedback'); var btn = document.querySelector('#mcq-9 .check-btn');
    fb.hidden = false; fb.className = 'mcq-feedback good';
    fb.innerHTML = '<strong>That is a claim with evidence.</strong> You named a shape and backed it with a number — exactly how scientists read a time series. In this real record: CO₂ rose ' + RISE + ' ppm since 1958, crossed ' + MILES.map(function (m) { return m.ppm + ' in ' + m.year; }).join(', ') + ', and is accelerating (' + RATE_FIRST.rate.toFixed(2) + ' → ' + RATE_LAST.rate.toFixed(2) + ' ppm/yr).';
    btn.disabled = true; btn.textContent = 'Claim checked ✓';
    setInst(9, 'Claim accepted — shape word plus pattern evidence. Now mark the milestones.', 'success');
    if (!silent) runEvidenceFx(9);
    if (!silent) { state.answers[9] = true; saveState(); }
    complete(9);
    if (typeof syncEndClaim === 'function') syncEndClaim();
    if (!silent) { streak++; celebrateStep(9, true); }
  }
  document.querySelectorAll('.check-btn').forEach(function (btn) { btn.addEventListener('click', function () { var n = +btn.dataset.check; if (n === 5) gradeTags(btn); else if (n === 9) gradeClaim(btn); else gradeRadio(n, btn); }); });

  /* ---------- soft gating ---------- */
  function isUnlocked(n) { return n === 1 || completed[n - 1] || skipUnlocked[n]; }
  function showGate(n) {
    var sec = document.getElementById('step-' + n); var frame = sec.querySelector('.viz-frame');
    if (!frame.querySelector('.gate-popup')) {
      var pop = document.createElement('div'); pop.className = 'gate-popup';
      pop.innerHTML = '<div class="gate-popup-inner"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.4"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg><span>Answer Step ' + (n - 1) + ' to continue</span><button class="gate-skip">Skip for now →</button></div>';
      frame.appendChild(pop);
      pop.querySelector('.gate-skip').addEventListener('click', function () { skipUnlocked[n] = true; state.skips[n] = true; saveState(); applyGates(); if (currentStep === n) playStep(n); });
    }
    var col = sec.querySelector('.card-col');
    if (!col.querySelector('.gate-note')) { var note = document.createElement('div'); note.className = 'gate-note'; note.textContent = 'Locked: answer Step ' + (n - 1) + ' first, or use “Skip for now” on the left.'; col.appendChild(note); }
    pauseAllAudio();
  }
  function applyGates() { for (var n = 1; n <= 9; n++) { var sec = document.getElementById('step-' + n); var locked = !isUnlocked(n); sec.classList.toggle('locked', locked); if (!locked) { var pop = sec.querySelector('.gate-popup'); if (pop) pop.remove(); var note = sec.querySelector('.gate-note'); if (note) note.remove(); } } revealGate(); }

  /* ---------- audio ---------- */
  var audios = {}; for (var an = 1; an <= 9; an++) audios[an] = document.getElementById('audio-' + an);
  var audioUnlocked = false, currentStep = 1; var reviewSetStep = function () {};
  function pauseAllAudio(except) { for (var k in audios) { var a = audios[k]; if (a && +k !== except && !a.paused) a.pause(); } }
  function playStep(n) { if (!audioUnlocked || state.muted || !isUnlocked(n)) return; pauseAllAudio(n); var a = audios[n]; if (a && a.paused) { a.currentTime = 0; var pr = a.play(); if (pr && pr.catch) pr.catch(function () {}); } }
  document.addEventListener('pointerdown', function unlockAudio() { var intro = document.getElementById('intro-screen'); if (intro && !intro.hidden) return; audioUnlocked = true; document.removeEventListener('pointerdown', unlockAudio); playStep(currentStep); });
  var stepWatchIO = new IntersectionObserver(function (entries) { entries.forEach(function (e) { if (!e.isIntersecting) return; var n = +e.target.dataset.step; currentStep = n; reviewSetStep(n); if (!isUnlocked(n)) showGate(n); else playStep(n); }); }, { threshold: 0.3 });
  document.querySelectorAll('.step').forEach(function (sec) { stepWatchIO.observe(sec); });
  var soundBtn = document.getElementById('nav-sound');
  function syncSoundBtn() { soundBtn.textContent = state.muted ? 'Sound: off' : 'Sound: on'; soundBtn.style.background = state.muted ? '#52606D' : ''; }
  soundBtn.addEventListener('click', function () { state.muted = !state.muted; saveState(); syncSoundBtn(); if (state.muted) pauseAllAudio(); else playStep(currentStep); });
  syncSoundBtn();

  /* ---------- intro ---------- */
  var introScreen = document.getElementById('intro-screen'), introBegin = document.getElementById('intro-begin'), introMute = document.getElementById('intro-mute');
  if (introScreen && introBegin) {
    document.body.style.overflow = 'hidden'; if (introMute) introMute.checked = !!state.muted;
    introBegin.addEventListener('click', function () { if (introMute && introMute.checked) { state.muted = true; saveState(); syncSoundBtn(); } audioUnlocked = true; introScreen.classList.add('is-leaving'); document.body.style.overflow = ''; setTimeout(function () { introScreen.hidden = true; }, 500); var s1 = document.getElementById('step-1'); if (s1) s1.scrollIntoView({ behavior: 'smooth' }); currentStep = 1; playStep(1); });
  }

  /* ---------- restore ---------- */
  var notesEl = document.getElementById('notes-text'), claimEl = document.getElementById('claim-text');
  if (state.notes) notesEl.value = state.notes; if (state.claim) claimEl.value = state.claim;
  notesEl.addEventListener('input', function () { state.notes = notesEl.value; saveState(); });
  claimEl.addEventListener('input', function () { state.claim = claimEl.value; saveState(); });
  for (var rn = 1; rn <= 9; rn++) { var v = state.answers[rn]; if (v === undefined || v === null) continue; if (rn === 5) renderTags(v, true); else if (rn === 9) renderClaimAccepted(true); else if (v === ANSWERS[rn]) renderGradeRadio(rn, v, true); }

  /* ---------- progressive scroll gate ---------- */
  var reviewMode = false; try { reviewMode = new URLSearchParams(location.search).get('review') === 'true'; } catch (e) {}
  var scrollFadeEl = document.getElementById('scroll-fade'); if (reviewMode && scrollFadeEl) scrollFadeEl.style.display = 'none';
  function firstLockedStep() { for (var n = 2; n <= 9; n++) { if (!isUnlocked(n)) return n; } return 0; }
  function revealGate() {
    var F = firstLockedStep();
    for (var n = 1; n <= 9; n++) { var sec = document.getElementById('step-' + n); if (!sec) continue; sec.classList.toggle('gate-hidden', !reviewMode && F !== 0 && n > F); sec.classList.toggle('peek-veil', !reviewMode && F !== 0 && n === F); }
    var hideEnd = !reviewMode && !completed[9]; var endSec = document.getElementById('lesson-end'); var footEl = document.querySelector('.lesson-footer');
    if (endSec) endSec.classList.toggle('gate-hidden', hideEnd); if (footEl) footEl.classList.toggle('gate-hidden', hideEnd);
  }
  function updateScrollCue() {
    if (!scrollFadeEl || reviewMode) return; var cue = scrollFadeEl.querySelector('.scroll-cue'); var F = firstLockedStep();
    var nearBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4;
    if (F !== 0) { scrollFadeEl.classList.remove('at-bottom'); if (cue) { if (nearBottom) { cue.classList.add('cue-locked'); cue.innerHTML = 'Answer Step ' + (F - 1) + ' to keep going · <button type="button" class="cue-skip">skip</button>'; } else { cue.classList.remove('cue-locked'); cue.innerHTML = '<span>⌄</span>scroll'; } } }
    else { scrollFadeEl.classList.toggle('at-bottom', nearBottom); if (cue) { cue.classList.remove('cue-locked'); cue.innerHTML = '<span>⌄</span>scroll'; } }
  }
  if (scrollFadeEl && !reviewMode) {
    scrollFadeEl.addEventListener('click', function (ev) { var sk = ev.target.closest && ev.target.closest('.cue-skip'); if (!sk) return; var F = firstLockedStep(); if (!F) return; skipUnlocked[F] = true; state.skips[F] = true; saveState(); applyGates(); });
    window.addEventListener('scroll', updateScrollCue, { passive: true }); window.addEventListener('resize', updateScrollCue);
  }

  /* ---------- end screen ---------- */
  var endClaim = document.getElementById('end-claim'), endClaimText = document.getElementById('end-claim-text');
  function syncEndClaim() { if (!endClaim) return; var c = (claimEl ? claimEl.value : '').trim(); if (c) { endClaimText.textContent = '“' + c + '”'; endClaim.hidden = false; } else { endClaim.hidden = true; } }
  syncEndClaim(); if (claimEl) claimEl.addEventListener('input', syncEndClaim);
  var endTop = document.getElementById('end-top'); if (endTop) endTop.addEventListener('click', function () { window.scrollTo({ top: 0, behavior: 'smooth' }); });
  var endRestart = document.getElementById('end-restart'); if (endRestart) endRestart.addEventListener('click', function () { if (!window.confirm('Start the lesson over? This clears your answers, notes, and claim on this device.')) return; try { localStorage.removeItem(STORE_KEY); } catch (e) {} location.reload(); });

  /* ---------- review mode ---------- */
  (function initReview() {
    var params; try { params = new URLSearchParams(location.search); } catch (e) { return; } if (params.get('review') !== 'true') return;
    var RKEY = 'climate-review-v1'; var comments = {}; try { comments = JSON.parse(localStorage.getItem(RKEY) || '{}') || {}; } catch (e) { comments = {}; }
    var panel = document.createElement('div'); panel.className = 'review-panel';
    panel.innerHTML = '<div class="review-head"><span class="review-icon">✎</span><span class="review-title"><strong>Reviewer feedback</strong><small>Comments save automatically</small></span><span class="review-badge" id="rv-badge">0</span><span class="review-toggle" id="rv-toggle">▾</span></div><div class="review-body"><span class="review-step-chip" id="rv-step">Step 1</span><textarea id="rv-text" placeholder="What works here? What should change? Type your notes for this step…"></textarea><div class="review-foot"><span class="review-saved" id="rv-saved"></span><button class="rv-clear" id="rv-clear">Clear</button><button class="rv-export" id="rv-export">Export all</button></div></div>';
    document.body.appendChild(panel);
    var toggle = panel.querySelector('#rv-toggle');
    panel.querySelector('.review-head').addEventListener('click', function () { panel.classList.toggle('collapsed'); toggle.textContent = panel.classList.contains('collapsed') ? '▸' : '▾'; });
    var stepLabel = panel.querySelector('#rv-step'), textEl = panel.querySelector('#rv-text'), savedEl = panel.querySelector('#rv-saved'), badge = panel.querySelector('#rv-badge');
    var activeStep = currentStep || 1;
    function stepTitle(n) { var h = document.querySelector('#step-' + n + ' h2'); return h ? h.textContent.trim() : 'Step ' + n; }
    function updateBadge() { badge.textContent = Object.keys(comments).filter(function (k) { return (comments[k] || '').trim(); }).length; }
    function loadStep(n) { activeStep = n; stepLabel.textContent = 'Step ' + n + ' — ' + stepTitle(n); textEl.value = comments[n] || ''; }
    var saveTimer = null;
    textEl.addEventListener('input', function () { comments[activeStep] = textEl.value; clearTimeout(saveTimer); saveTimer = setTimeout(function () { try { localStorage.setItem(RKEY, JSON.stringify(comments)); } catch (e) {} savedEl.textContent = 'Saved ✓'; updateBadge(); setTimeout(function () { savedEl.textContent = ''; }, 1200); }, 350); });
    panel.querySelector('#rv-clear').addEventListener('click', function () { delete comments[activeStep]; textEl.value = ''; try { localStorage.setItem(RKEY, JSON.stringify(comments)); } catch (e) {} updateBadge(); });
    panel.querySelector('#rv-export').addEventListener('click', function () { var out = { lesson: 'The Breathing Planet', exported: new Date().toISOString(), comments: {} }; for (var n = 1; n <= 9; n++) { if ((comments[n] || '').trim()) out.comments['step' + n] = { title: stepTitle(n), comment: comments[n] }; } var blob = new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' }); var url = URL.createObjectURL(blob); var a = document.createElement('a'); a.href = url; a.download = 'breathing-planet-review.json'; a.click(); setTimeout(function () { URL.revokeObjectURL(url); }, 1000); });
    reviewSetStep = function (n) { if (n !== activeStep) loadStep(n); };
    loadStep(activeStep); updateBadge();
  })();

  applyGates(); revealGate(); updateScrollCue();
})();
