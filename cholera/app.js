/* The Broad Street Pump — Savvas Data Show
   Real data: Dr. John Snow's 1854 Soho cholera survey.
   Source: HistData R package (Snow.deaths 578, Snow.pumps 13, Snow.streets),
   digitized by Dodson & Tobler, mirrored at github.com/vincentarelbundock/Rdatasets.
   Every count and distance in this lesson is computed from that data at runtime. */
(function () {
  'use strict';

  var SRC_URL = 'https://vincentarelbundock.github.io/Rdatasets/doc/HistData/Snow.deaths.html';
  var DATA = window.SNOW_DATA;
  var DEATHS = DATA.deaths;
  var PUMPS = DATA.pumps;
  var STREETS = DATA.streets;
  var BROAD = PUMPS.filter(function (p) { return p.name === 'Broad Street'; })[0];

  var COL = {
    death: '#C0392B', deathSoft: '#E08070', street: '#C7CBD1', land: '#F3F1EC',
    pump: '#1B5FAA', broad: '#1E7D45', accent: '#E8704F', grid: '#E4E1DA', ink: '#27313B'
  };
  // categorical palette for "nearest pump" coloring (Broad gets the bright accent)
  var PUMP_HUES = ['#7C8794', '#9AA4B0', '#B0833D', '#6FA8C7', '#A86FB8', '#5C8A5C',
    '#C77F6F', '#8896A8', '#B59A4D', '#6F9A8A', '#9C6F7C', '#7A86C0'];

  /* ---------- geometry / stats (all from real data) ---------- */
  function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
  function nearestPump(d) {
    var best = PUMPS[0], bd = Infinity;
    PUMPS.forEach(function (p) { var dd = dist(d, p); if (dd < bd) { bd = dd; best = p; } });
    return best;
  }
  // assign each death its nearest pump once
  DEATHS.forEach(function (d) { d.np = nearestPump(d); d.dBroad = dist(d, BROAD); });

  var BY_PUMP = {};
  PUMPS.forEach(function (p) { BY_PUMP[p.name] = 0; });
  DEATHS.forEach(function (d) { BY_PUMP[d.np.name]++; });
  var PUMP_COUNTS = PUMPS.map(function (p) { return { name: p.name, n: BY_PUMP[p.name] }; })
    .sort(function (a, b) { return b.n - a.n; });
  var BROAD_N = BY_PUMP['Broad Street'];                 // 359
  var SECOND_N = PUMP_COUNTS[1].n;                        // 64
  var BROAD_PCT = Math.round(BROAD_N / DEATHS.length * 100); // 62

  // distance falloff bins from the Broad Street pump
  var DIST_BINS = [];
  (function () {
    var maxD = Math.ceil(d3.max(DEATHS, function (d) { return d.dBroad; }));
    for (var i = 0; i < maxD; i++) DIST_BINS.push({ lo: i, hi: i + 1, n: 0 });
    DEATHS.forEach(function (d) {
      var b = Math.min(DIST_BINS.length - 1, Math.floor(d.dBroad));
      DIST_BINS[b].n++;
    });
  })();

  // assign a hue index to each pump (Broad = accent)
  var pumpHue = {};
  (function () { var h = 0; PUMPS.forEach(function (p) { pumpHue[p.name] = p.name === 'Broad Street' ? COL.accent : PUMP_HUES[h++ % PUMP_HUES.length]; }); })();

  /* ---------- shared projection (linear, flips y) ---------- */
  var BB = (function () {
    var xs = [], ys = [];
    DEATHS.forEach(function (d) { xs.push(d.x); ys.push(d.y); });
    PUMPS.forEach(function (p) { xs.push(p.x); ys.push(p.y); });
    STREETS.forEach(function (s) { s.forEach(function (pt) { xs.push(pt.x); ys.push(pt.y); }); });
    return { x0: d3.min(xs), x1: d3.max(xs), y0: d3.min(ys), y1: d3.max(ys) };
  })();
  var VW = 640, VH = 600, PAD = 26;
  var sx = d3.scaleLinear().domain([BB.x0, BB.x1]).range([PAD, VW - PAD]);
  var sy = d3.scaleLinear().domain([BB.y0, BB.y1]).range([VH - PAD, PAD]); // flip
  function px(d) { return sx(d.x); }
  function py(d) { return sy(d.y); }

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

  /* ---------- small DOM helpers ---------- */
  function setInst(n, html, tone) {
    var bar = document.getElementById('inst-' + n);
    if (!bar) return;
    bar.innerHTML = html;
    bar.className = 'instruction-bar' + (tone ? ' tone-' + tone : '');
  }
  function frameOf(n) { return document.querySelector('#viz-' + n).closest('.viz-frame'); }
  function ensureBadge(n) {
    var frame = frameOf(n);
    var b = frame.querySelector('.viz-badge');
    if (!b) { b = document.createElement('div'); b.className = 'viz-badge'; frame.appendChild(b); }
    return b;
  }

  var ctxs = {};
  var chipActions = {};
  var utilActions = {};

  /* ---------- street + dot drawing ---------- */
  function drawStreets(g) {
    var line = d3.line().x(function (p) { return sx(p.x); }).y(function (p) { return sy(p.y); });
    g.selectAll('path.street').data(STREETS).join('path')
      .attr('class', 'street').attr('d', line)
      .attr('fill', 'none').attr('stroke', COL.street).attr('stroke-width', 1.3)
      .attr('stroke-linecap', 'round').attr('stroke-linejoin', 'round');
  }
  function attachDeathTips(sel) {
    sel.on('mousemove', function (event, d) {
      showTip(event, '<strong>Cholera death</strong><br>location ' + d.x.toFixed(2) + ', ' + d.y.toFixed(2) +
        '<br>nearest pump: ' + d.np.name + '<br>' + d.dBroad.toFixed(1) + ' from Broad St pump');
    }).on('mouseleave', hideTip);
  }
  function drawDeaths(g, data, opts) {
    opts = opts || {};
    var sel = g.selectAll('circle.death').data(data, function (d, i) { return i; }).join('circle')
      .attr('class', 'death')
      .attr('cx', px).attr('cy', py)
      .attr('r', opts.r || 2.4)
      .attr('fill', opts.fill || COL.death)
      .attr('fill-opacity', opts.opacity == null ? 0.82 : opts.opacity)
      .attr('stroke', '#fff').attr('stroke-width', 0.4);
    if (opts.tips !== false) attachDeathTips(sel);
    return sel;
  }
  function drawPumps(g, opts) {
    opts = opts || {};
    var pg = g.selectAll('g.pump').data(PUMPS).join('g').attr('class', 'pump')
      .attr('transform', function (p) { return 'translate(' + sx(p.x) + ',' + sy(p.y) + ')'; });
    pg.append('rect').attr('x', -4.5).attr('y', -4.5).attr('width', 9).attr('height', 9)
      .attr('transform', 'rotate(45)')
      .attr('fill', function (p) { return p.name === 'Broad Street' ? COL.broad : COL.pump; })
      .attr('stroke', '#fff').attr('stroke-width', 1.2);
    if (opts.labels !== false) {
      pg.append('text').attr('y', -8).attr('text-anchor', 'middle')
        .attr('font-size', 9).attr('font-weight', function (p) { return p.name === 'Broad Street' ? 700 : 500; })
        .attr('fill', function (p) { return p.name === 'Broad Street' ? COL.broad : '#5A6470'; })
        .attr('paint-order', 'stroke').attr('stroke', '#fff').attr('stroke-width', 2.4)
        .text(function (p) { return p.name; });
    }
    pg.on('mousemove', function (event, p) {
      showTip(event, '<strong>' + p.name + ' pump</strong><br>' + BY_PUMP[p.name] + ' deaths nearest here');
    }).on('mouseleave', hideTip);
    return pg;
  }

  /* ---------- generic Soho map with zoom ---------- */
  function makeSohoMap(n, opts) {
    opts = opts || {};
    var container = d3.select('#viz-' + n);
    var svg = container.append('svg').attr('viewBox', '0 0 ' + VW + ' ' + VH)
      .attr('preserveAspectRatio', 'xMidYMid meet');
    svg.append('rect').attr('width', VW).attr('height', VH).attr('fill', COL.land);
    var root = svg.append('g').attr('class', 'zoom-root');
    var streetsG = root.append('g');
    var overlay = root.append('g');
    var dotsG = root.append('g');
    var pumpsG = root.append('g');
    var fxG = root.append('g');
    drawStreets(streetsG);

    var zoom = d3.zoom().scaleExtent([1, 9])
      .on('zoom', function (ev) { root.attr('transform', ev.transform); });
    svg.call(zoom).on('dblclick.zoom', null);

    var ctx = { n: n, svg: svg, root: root, streetsG: streetsG, overlay: overlay, dotsG: dotsG, pumpsG: pumpsG, fxG: fxG, zoom: zoom };
    ctxs[n] = ctx;
    chipActions[n] = chipActions[n] || {};
    utilActions[n] = utilActions[n] || {};
    utilActions[n]['zoom-in'] = function () { svg.transition().duration(350).call(zoom.scaleBy, 1.6); };
    utilActions[n]['zoom-out'] = function () { svg.transition().duration(350).call(zoom.scaleBy, 1 / 1.6); };
    utilActions[n]['reset'] = function () { svg.transition().duration(450).call(zoom.transform, d3.zoomIdentity); };
    return ctx;
  }

  function pulseAt(ctx, d, color, times) {
    times = times || 3;
    var x = px(d), y = py(d);
    for (var i = 0; i < times; i++) {
      ctx.fxG.append('circle').attr('cx', x).attr('cy', y).attr('r', 4)
        .attr('fill', 'none').attr('stroke', color).attr('stroke-width', 2)
        .style('opacity', 0.9)
        .transition().delay(i * 420).duration(1100).ease(d3.easeCubicOut)
        .attr('r', 34).style('opacity', 0).remove();
    }
  }

  function toggleChip(btn, onFn, offFn) {
    var on = btn.classList.toggle('active');
    if (on && onFn) onFn(); if (!on && offFn) offFn();
  }
  function flashChip(btn, fn) {
    btn.classList.add('active'); if (fn) fn();
    setTimeout(function () { btn.classList.remove('active'); }, 1400);
  }

  /* ============================================================
     PASS 1 — per-step visualizations
     ============================================================ */

  function initStep1() {
    var ctx = makeSohoMap(1);
    // index death: the recorded death closest to the Broad pump stands in for "the first"
    var idx = DEATHS.reduce(function (a, b) { return a.dBroad < b.dBroad ? a : b; });
    // faint context: a few nearby deaths
    drawDeaths(ctx.dotsG, DEATHS.filter(function (d) { return d.dBroad < 2.2 && d !== idx; }),
      { r: 2.1, fill: COL.deathSoft, opacity: 0.28, tips: false });
    drawPumps(ctx.pumpsG, { labels: false });
    ctx.pumpsG.selectAll('g.pump').style('opacity', 0.25);

    var hx = px(idx), hy = py(idx);
    var halo = ctx.fxG.append('circle').attr('cx', hx).attr('cy', hy).attr('r', 6)
      .attr('fill', 'none').attr('stroke', COL.death).attr('stroke-width', 2);
    var dot = ctx.fxG.append('circle').attr('cx', hx).attr('cy', hy).attr('r', 4.5)
      .attr('fill', COL.death).attr('stroke', '#fff').attr('stroke-width', 1);
    var label = ctx.fxG.append('text').attr('x', hx + 12).attr('y', hy - 8)
      .attr('font-size', 12).attr('font-weight', 700).attr('fill', COL.ink)
      .attr('paint-order', 'stroke').attr('stroke', COL.land).attr('stroke-width', 3)
      .text('one death · Broad Street');
    attachDeathTips(dot.datum(idx));

    var entryPlayed = false;
    ctx.entryAnimation = function () {
      if (entryPlayed) return; entryPlayed = true;
      (function loop() {
        if (!document.body.contains(halo.node())) return;
        halo.attr('r', 6).style('opacity', 0.9)
          .transition().duration(1500).ease(d3.easeCubicOut)
          .attr('r', 26).style('opacity', 0).on('end', loop);
      })();
    };

    chipActions[1] = {
      location: function (b) { flashChip(b, function () { label.text('location ' + idx.x.toFixed(2) + ', ' + idx.y.toFixed(2)); setInst(1, 'Location: every death has an exact spot on the map. This one sits on Broad Street.', 'success'); }); },
      when: function (b) { flashChip(b, function () { setInst(1, 'When: deaths exploded in a few days at the end of August 1854 — a tight time window.', 'success'); }); },
      street: function (b) { flashChip(b, function () { ctx.svg.transition().duration(700).call(ctx.zoom.scaleBy, 1.5); setInst(1, 'Zooming to the street grid around the death.', 'success'); }); },
      source: function (b) { flashChip(b, function () { setInst(1, 'Source: Dr. John Snow’s 1854 survey of Soho — 578 deaths, digitized in HistData. Real data.', 'success'); }); }
    };
  }

  function initStep2() {
    var ctx = makeSohoMap(2);
    ctx.pumpsG.style('display', 'none');
    var idx = DEATHS.reduce(function (a, b) { return a.dBroad < b.dBroad ? a : b; });
    var all = drawDeaths(ctx.dotsG, DEATHS, { r: 2.4 });
    all.attr('fill-opacity', 0);   // hidden until entry

    var seed = ctx.fxG.append('circle').attr('cx', px(idx)).attr('cy', py(idx)).attr('r', 5)
      .attr('fill', COL.death).attr('stroke', '#fff').attr('stroke-width', 1.2);

    var entryPlayed = false;
    ctx.entryAnimation = function () {
      if (entryPlayed) return; entryPlayed = true;
      var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      seed.transition().delay(reduced ? 0 : 500).duration(400).style('opacity', 0).remove();
      all.transition().delay(function (d, i) { return reduced ? 0 : 500 + i * 2.2; })
        .duration(reduced ? 0 : 400).attr('fill-opacity', 0.82);
      setInst(2, 'One death → 578. The same kind of record, plotted in the same space.', 'success');
    };

    chipActions[2] = {
      location: function (b) { flashChip(b, function () { setInst(2, 'Each dot keeps its true location — nothing is rounded to a grid.', 'success'); }); },
      count: function (b) { flashChip(b, function () { setInst(2, 'Count: ' + DEATHS.length + ' deaths in this survey — every one a real record.', 'success'); }); },
      compare: function (b) { flashChip(b, function () { ctx.svg.transition().duration(600).call(ctx.zoom.scaleBy, 1.4); setInst(2, 'Zoom in: the dots are denser in the middle than at the edges.', 'success'); }); },
      source: function (b) { flashChip(b, function () { setInst(2, 'Source: John Snow 1854 (HistData / Rdatasets). Real, cited data.', 'success'); }); }
    };
  }

  function initStep3() {
    var ctx = makeSohoMap(3);
    ctx.pumpsG.style('display', 'none');
    var real = DEATHS.map(function (d) { return { x: d.x, y: d.y, np: d.np, dBroad: d.dBroad }; });
    var sel = drawDeaths(ctx.dotsG, real, { r: 2.4 });

    // deterministic pseudo-random scatter within the street bounding box (clearly labeled synthetic)
    var seed = 18540831;
    function rnd() { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; }
    var scattered = real.map(function () { return { x: BB.x0 + rnd() * (BB.x1 - BB.x0), y: BB.y0 + rnd() * (BB.y1 - BB.y0) }; });
    var isScattered = false;

    function setMode(toScatter) {
      isScattered = toScatter;
      sel.data(toScatter ? scattered : real)
        .transition().duration(900).ease(d3.easeCubicInOut)
        .attr('cx', px).attr('cy', py)
        .attr('fill', toScatter ? '#9AA4B0' : COL.death);
      setInst(3, toScatter
        ? 'Synthetic comparison: 578 deaths placed at random. No cluster — this is what chance looks like.'
        : 'Real data: the deaths pile into one dense cluster. That is not chance.', toScatter ? 'warn' : 'success');
    }
    utilActions[3] = utilActions[3] || {};
    utilActions[3]['shuffle'] = function (b) { setMode(!isScattered); if (b) b.classList.toggle('active', isScattered); };

    var entryPlayed = false;
    ctx.entryAnimation = function () {
      if (entryPlayed) return; entryPlayed = true;
      var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      sel.attr('fill-opacity', 0).transition().delay(function (d, i) { return reduced ? 0 : i * 1.6; })
        .duration(reduced ? 0 : 350).attr('fill-opacity', 0.82);
    };

    chipActions[3] = {
      cluster: function (b) { flashChip(b, function () { if (isScattered) setMode(false); ctx.svg.transition().duration(700).call(ctx.zoom.transform, d3.zoomIdentity.translate(VW / 2, VH / 2).scale(2.4).translate(-px(BROAD), -py(BROAD))); setInst(3, 'The cluster centers on one small area near the middle of the map.', 'success'); }); },
      compare: function (b) { flashChip(b, function () { setMode(!isScattered); }); },
      center: function (b) { flashChip(b, function () { pulseAt(ctx, BROAD, COL.broad, 3); setInst(3, 'The densest point of the cluster — hold that thought for Step 6.', 'success'); }); },
      count: function (b) { flashChip(b, function () { setInst(3, DEATHS.length + ' real deaths, ' + BROAD_PCT + '% of them packed near one spot.', 'success'); }); }
    };
  }

  function initStep4() {
    var ctx = makeSohoMap(4);
    ctx.pumpsG.selectAll('g.pump').style('opacity', 0.3);
    ctx.pumpsG.selectAll('text').style('display', 'none');
    var sel = drawDeaths(ctx.dotsG, DEATHS, { r: 2.6 });

    var card = null;
    function openRecord(d) {
      if (card) card.remove();
      sel.attr('stroke', '#fff').attr('stroke-width', 0.4).attr('r', 2.6);
      var node = sel.filter(function (x) { return x === d; });
      node.attr('stroke', COL.ink).attr('stroke-width', 1.4).attr('r', 4.2).raise();
      var cx = px(d), cy = py(d), left = cx > VW / 2;
      card = ctx.fxG.append('g').attr('transform', 'translate(' + (left ? cx - 186 : cx + 14) + ',' + Math.max(12, cy - 60) + ')');
      card.append('rect').attr('width', 172).attr('height', 112).attr('rx', 8)
        .attr('fill', '#fff').attr('stroke', COL.ink).attr('stroke-width', 1).attr('filter', 'drop-shadow(0 4px 10px rgba(0,0,0,.18))');
      var lines = [
        ['Record', 'cholera death'],
        ['Location', d.x.toFixed(2) + ', ' + d.y.toFixed(2) + '  (real)'],
        ['Date', 'Aug–Sep 1854 outbreak*'],
        ['Water', 'household street pump*'],
        ['Nearest pump', d.np.name]
      ];
      lines.forEach(function (ln, i) {
        var g = card.append('g').attr('transform', 'translate(12,' + (20 + i * 18) + ')');
        g.append('text').attr('font-size', 9).attr('fill', '#8A93A0').text(ln[0].toUpperCase());
        g.append('text').attr('x', 78).attr('font-size', 10).attr('font-weight', 600).attr('fill', COL.ink).text(ln[1]);
      });
      setInst(4, 'Record opened. Fields marked * were in Snow’s register but are not in this digitized extract — so we don’t invent them.', 'success');
    }
    sel.style('cursor', 'pointer').on('click', function (ev, d) { openRecord(d); });

    var entryPlayed = false;
    ctx.entryAnimation = function () { if (entryPlayed) return; entryPlayed = true; openRecord(DEATHS.reduce(function (a, b) { return a.dBroad < b.dBroad ? a : b; })); };

    chipActions[4] = {
      location: function (b) { flashChip(b, function () { setInst(4, 'Location is the only field plotted on the map — and the only one in this dataset.', 'success'); }); },
      when: function (b) { flashChip(b, function () { setInst(4, 'Date: Snow’s register dated each death; the digitized extract keeps only location, so we don’t fake dates.', 'success'); }); },
      water: function (b) { flashChip(b, function () { setInst(4, 'Water source was the field Snow cared about most — which pump each household used.', 'success'); }); },
      source: function (b) { flashChip(b, function () { setInst(4, 'Source: HistData Snow.deaths (578 rows). Cited in the Data panel.', 'success'); }); }
    };
  }

  function initStep5() {
    var ctx = makeSohoMap(5);
    ctx.pumpsG.selectAll('g.pump').style('opacity', 0.3);
    ctx.pumpsG.selectAll('text').style('display', 'none');
    drawDeaths(ctx.dotsG, DEATHS, { r: 2.5 });
    ctx.entryAnimation = function () {};

    chipActions[5] = {
      cluster: function (b) { flashChip(b, function () { ctx.svg.transition().duration(700).call(ctx.zoom.transform, d3.zoomIdentity.translate(VW / 2, VH / 2).scale(2.2).translate(-px(BROAD), -py(BROAD))); setInst(5, 'One dense cluster near the center — the clearest shape in the data.', 'success'); }); },
      center: function (b) { flashChip(b, function () { pulseAt(ctx, BROAD, COL.broad, 3); setInst(5, 'The heart of the cluster. Remember this spot.', 'success'); }); },
      compare: function (b) { flashChip(b, function () { setInst(5, 'Compare the middle of the map to the edges: far more deaths in the center.', 'success'); }); },
      count: function (b) { flashChip(b, function () { setInst(5, DEATHS.length + ' deaths total. Tag what you honestly see.', 'success'); }); }
    };
  }

  function initStep6() {
    var ctx = makeSohoMap(6);
    var sel = drawDeaths(ctx.dotsG, DEATHS, { r: 2.6 });
    ctx.pumpsG.selectAll('g.pump rect').attr('opacity', 1);
    var nearestOn = false;

    function setNearest(on) {
      nearestOn = on;
      sel.transition().duration(600)
        .attr('fill', function (d) { return on ? pumpHue[d.np.name] : COL.death; })
        .attr('fill-opacity', on ? 0.9 : 0.82);
      ensureBadge(6).innerHTML = on
        ? '<strong>' + BROAD_N + '</strong> of ' + DEATHS.length + ' deaths nearest the <strong style="color:' + COL.broad + '">Broad St</strong> pump (' + BROAD_PCT + '%)'
        : '';
      ctx.sliderSeen = on;   // evidence gate flag
      setInst(6, on ? 'Each death colored by its nearest pump. One color — Broad Street’s — floods the cluster.'
        : 'Pumps shown. Now press “Nearest pump” to color the deaths.', 'success');
    }
    utilActions[6] = utilActions[6] || {};
    utilActions[6]['nearest'] = function (b) { setNearest(!nearestOn); if (b) b.classList.toggle('active', nearestOn); };
    ctx.entryAnimation = function () {};

    chipActions[6] = {
      pumps: function (b) { flashChip(b, function () { ctx.pumpsG.selectAll('g.pump').transition().duration(400).style('opacity', 1); setInst(6, 'All 13 public pumps Snow mapped, drawn as diamonds.', 'success'); }); },
      nearest: function (b) { flashChip(b, function () { setNearest(true); }); },
      center: function (b) { flashChip(b, function () { pulseAt(ctx, BROAD, COL.broad, 3); setInst(6, 'The Broad Street pump sits dead center in the deaths.', 'success'); }); },
      cluster: function (b) { flashChip(b, function () { ctx.svg.transition().duration(700).call(ctx.zoom.transform, d3.zoomIdentity.translate(VW / 2, VH / 2).scale(2.2).translate(-px(BROAD), -py(BROAD))); }); }
    };
  }

  function makeBarChart(n) {
    var container = d3.select('#viz-' + n);
    var svg = container.append('svg').attr('viewBox', '0 0 ' + VW + ' ' + VH).attr('preserveAspectRatio', 'xMidYMid meet');
    svg.append('rect').attr('width', VW).attr('height', VH).attr('fill', '#fff');
    var ctx = { n: n, svg: svg, root: svg.append('g') };
    ctxs[n] = ctx; chipActions[n] = chipActions[n] || {}; utilActions[n] = utilActions[n] || {};
    return ctx;
  }

  function initStep7() {
    var ctx = makeBarChart(7);
    var M = { t: 40, r: 24, b: 96, l: 54 }, W = VW - M.l - M.r, H = VH - M.t - M.b;
    var g = ctx.root.attr('transform', 'translate(' + M.l + ',' + M.t + ')');
    var data = PUMP_COUNTS;
    var x = d3.scaleBand().domain(data.map(function (d) { return d.name; })).range([0, W]).padding(0.22);
    var y = d3.scaleLinear().domain([0, d3.max(data, function (d) { return d.n; }) * 1.08]).range([H, 0]);

    g.append('g').attr('transform', 'translate(0,' + H + ')').call(d3.axisBottom(x))
      .selectAll('text').attr('transform', 'rotate(-40)').attr('text-anchor', 'end').attr('dx', '-4').attr('dy', '8')
      .attr('font-size', 9).attr('fill', function (d) { return d === 'Broad Street' ? COL.broad : '#5A6470'; })
      .attr('font-weight', function (d) { return d === 'Broad Street' ? 700 : 400; });
    g.append('g').call(d3.axisLeft(y).ticks(6));
    g.append('text').attr('x', -H / 2).attr('y', -38).attr('transform', 'rotate(-90)').attr('text-anchor', 'middle').attr('font-size', 11).attr('fill', '#5A6470').text('deaths nearest this pump');
    g.append('text').attr('x', W / 2).attr('y', H + 86).attr('text-anchor', 'middle').attr('font-size', 11).attr('fill', '#5A6470').text('water pump');

    var bars = g.selectAll('rect.bar').data(data).join('rect').attr('class', 'bar')
      .attr('x', function (d) { return x(d.name); }).attr('width', x.bandwidth())
      .attr('y', H).attr('height', 0)
      .attr('fill', function (d) { return d.name === 'Broad Street' ? COL.broad : '#9AA4B0'; })
      .on('mousemove', function (ev, d) { showTip(ev, '<strong>' + d.name + '</strong><br>' + d.n + ' deaths nearest'); })
      .on('mouseleave', hideTip);
    g.selectAll('text.val').data(data).join('text').attr('class', 'val')
      .attr('x', function (d) { return x(d.name) + x.bandwidth() / 2; })
      .attr('y', function (d) { return y(d.n) - 5; }).attr('text-anchor', 'middle')
      .attr('font-size', 9).attr('font-weight', function (d) { return d.name === 'Broad Street' ? 700 : 400; })
      .attr('fill', function (d) { return d.name === 'Broad Street' ? COL.broad : '#7A828C'; })
      .attr('opacity', 0).text(function (d) { return d.n; });

    var played = false;
    ctx.entryAnimation = function () {
      if (played) return; played = true;
      var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      bars.transition().delay(function (d, i) { return reduced ? 0 : i * 60; }).duration(reduced ? 0 : 700)
        .attr('y', function (d) { return y(d.n); }).attr('height', function (d) { return H - y(d.n); });
      g.selectAll('text.val').transition().delay(function (d, i) { return reduced ? 0 : 400 + i * 60; }).duration(300).attr('opacity', 1);
    };
    chipActions[7] = {
      axes: function (b) { flashChip(b, function () { setInst(7, 'X = each pump. Y = deaths whose nearest pump it is.', 'success'); }); },
      bars: function (b) { flashChip(b, function () { setInst(7, 'Bar height = a count. Taller bar, more deaths.', 'success'); }); },
      broad: function (b) { flashChip(b, function () { bars.filter(function (d) { return d.name === 'Broad Street'; }).attr('fill', COL.accent).transition().duration(600).attr('fill', COL.broad); setInst(7, 'Broad Street: ' + BROAD_N + ' deaths — ' + (BROAD_N / SECOND_N).toFixed(1) + '× the next pump (' + SECOND_N + ').', 'success'); }); },
      count: function (b) { flashChip(b, function () { setInst(7, 'Broad ' + BROAD_N + ' vs next ' + SECOND_N + '. Lopsided, not even.', 'success'); }); }
    };
  }

  function initStep8() {
    var ctx = makeBarChart(8);
    var M = { t: 40, r: 24, b: 70, l: 54 }, W = VW - M.l - M.r, H = VH - M.t - M.b;
    var g = ctx.root.attr('transform', 'translate(' + M.l + ',' + M.t + ')');
    var data = DIST_BINS;
    var x = d3.scaleBand().domain(data.map(function (d) { return d.lo; })).range([0, W]).padding(0.16);
    var y = d3.scaleLinear().domain([0, d3.max(data, function (d) { return d.n; }) * 1.08]).range([H, 0]);
    g.append('g').attr('transform', 'translate(0,' + H + ')').call(d3.axisBottom(x).tickFormat(function (d) { return d + '–' + (d + 1); })).selectAll('text').attr('font-size', 9);
    g.append('g').call(d3.axisLeft(y).ticks(6));
    g.append('text').attr('x', -H / 2).attr('y', -38).attr('transform', 'rotate(-90)').attr('text-anchor', 'middle').attr('font-size', 11).attr('fill', '#5A6470').text('number of deaths');
    g.append('text').attr('x', W / 2).attr('y', H + 50).attr('text-anchor', 'middle').attr('font-size', 11).attr('fill', '#5A6470').text('distance from the Broad Street pump (grid units)');

    var bars = g.selectAll('rect.bar').data(data).join('rect').attr('class', 'bar')
      .attr('x', function (d) { return x(d.lo); }).attr('width', x.bandwidth())
      .attr('y', H).attr('height', 0).attr('fill', COL.broad).attr('fill-opacity', 0.85)
      .on('mousemove', function (ev, d) { showTip(ev, '<strong>' + d.lo + '–' + d.hi + ' units</strong><br>' + d.n + ' deaths'); })
      .on('mouseleave', hideTip);

    // trend guide (smooth falloff line over bar tops)
    var line = d3.line().x(function (d) { return x(d.lo) + x.bandwidth() / 2; }).y(function (d) { return y(d.n); }).curve(d3.curveMonotoneX);
    var trend = g.append('path').datum(data).attr('fill', 'none').attr('stroke', COL.accent).attr('stroke-width', 2.4).attr('stroke-dasharray', '5 4').attr('d', line).attr('opacity', 0);

    var played = false;
    ctx.entryAnimation = function () {
      if (played) return; played = true;
      var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      bars.transition().delay(function (d, i) { return reduced ? 0 : i * 70; }).duration(reduced ? 0 : 650)
        .attr('y', function (d) { return y(d.n); }).attr('height', function (d) { return H - y(d.n); });
    };
    ctx.evidenceFx = function () { trend.transition().duration(700).attr('opacity', 1); };
    chipActions[8] = {
      axes: function (b) { flashChip(b, function () { setInst(8, 'X = distance from the Broad pump. Y = deaths at that distance.', 'success'); }); },
      falloff: function (b) { flashChip(b, function () { setInst(8, 'Peak at 1–3 units (' + data[1].n + ', ' + data[2].n + '), then collapse: ' + data[4].n + ', ' + data[5].n + '…', 'success'); }); },
      trend: function (b) { flashChip(b, function () { trend.transition().duration(600).attr('opacity', 1); setInst(8, 'The dashed guide falls steeply — a clear, strong relationship.', 'success'); }); },
      broad: function (b) { flashChip(b, function () { setInst(8, 'Closest band to Broad holds the most deaths; the far bands almost none.', 'success'); }); }
    };
  }

  function initStep9() {
    var ctx = makeSohoMap(9);
    var sel = drawDeaths(ctx.dotsG, DEATHS, { r: 2.6, fill: COL.death });
    // highlight Broad pump
    ctx.pumpsG.selectAll('g.pump').style('opacity', function (p) { return p.name === 'Broad Street' ? 1 : 0.35; });
    ctx.pumpsG.selectAll('text').style('display', function (p) { return p.name === 'Broad Street' ? null : 'none'; });
    var handleRemoved = false;

    function removeHandle() {
      if (handleRemoved) return; handleRemoved = true;
      pulseAt(ctx, BROAD, COL.broad, 4);
      ctx.pumpsG.selectAll('g.pump').filter(function (p) { return p.name === 'Broad Street'; })
        .select('rect').transition().duration(600).attr('fill', '#B6BcC4');
      sel.transition().delay(function (d, i) { return i * 1.5; }).duration(700)
        .attr('fill', COL.deathSoft).attr('fill-opacity', 0.3);
      ensureBadge(9).innerHTML = 'Handle removed — no more water drawn here. The outbreak ends.';
      setInst(9, 'September 8, 1854: the parish removed the handle. New deaths stopped. The map had made the case.', 'success');
    }
    utilActions[9] = utilActions[9] || {};
    utilActions[9]['handle'] = function (b) { removeHandle(); if (b) b.classList.add('active'); };
    ctx.evidenceFx = function () { pulseAt(ctx, BROAD, COL.broad, 3); };
    ctx.entryAnimation = function () {};

    chipActions[9] = {
      cluster: function (b) { flashChip(b, function () { ctx.svg.transition().duration(700).call(ctx.zoom.transform, d3.zoomIdentity.translate(VW / 2, VH / 2).scale(2.2).translate(-px(BROAD), -py(BROAD))); }); },
      broad: function (b) { flashChip(b, function () { pulseAt(ctx, BROAD, COL.broad, 3); setInst(9, 'The Broad Street pump — source of the outbreak.', 'success'); }); },
      count: function (b) { flashChip(b, function () { setInst(9, BROAD_N + ' of ' + DEATHS.length + ' deaths (' + BROAD_PCT + '%) nearest this one pump.', 'success'); }); },
      center: function (b) { flashChip(b, function () { pulseAt(ctx, BROAD, COL.broad, 2); }); }
    };
  }

  /* ---------- chip + util wiring ---------- */
  document.querySelectorAll('.chip').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var step = +btn.closest('.step').dataset.step;
      var key = btn.dataset.chip;
      if (chipActions[step] && chipActions[step][key]) chipActions[step][key](btn);
    });
  });
  document.querySelectorAll('.util-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var step = +btn.closest('.step').dataset.step;
      var key = btn.dataset.util;
      if (utilActions[step] && utilActions[step][key]) utilActions[step][key](btn);
    });
  });

  /* ---------- lazy init + entry animations ---------- */
  var initFns = { 1: initStep1, 2: initStep2, 3: initStep3, 4: initStep4, 5: initStep5, 6: initStep6, 7: initStep7, 8: initStep8, 9: initStep9 };
  var initIO = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (!e.isIntersecting) return;
      var n = +e.target.dataset.step;
      if (initFns[n]) { initFns[n](); initFns[n] = null; }
    });
  }, { rootMargin: '400px 0px' });
  var animIO = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (!e.isIntersecting) return;
      var n = +e.target.dataset.step;
      if (ctxs[n] && ctxs[n].entryAnimation) ctxs[n].entryAnimation();
    });
  }, { threshold: 0.35 });
  document.querySelectorAll('.step').forEach(function (sec) { initIO.observe(sec); animIO.observe(sec); });
  if (initFns[1]) { initFns[1](); initFns[1] = null; }

  /* ---------- top-nav: notes / data / explore ---------- */
  var notesPanel = document.getElementById('notes-panel');
  document.getElementById('nav-notes').addEventListener('click', function () { notesPanel.hidden = !notesPanel.hidden; });
  document.getElementById('notes-close').addEventListener('click', function () { notesPanel.hidden = true; });

  var CH_DX = {
    title: 'John Snow 1854 — Soho Cholera Deaths',
    filename: 'snow-cholera',
    meta: {
      source: 'HistData (Snow.deaths) via Rdatasets', url: SRC_URL,
      fetched: '2026-06-18', license: 'Open — digitized from Snow’s map by Dodson & Tobler (HistData)',
      description: DEATHS.length + ' cholera death locations from Dr. John Snow’s 1854 Soho survey, on the Dodson–Tobler coordinate grid, plus the 13 neighborhood pumps. The nearest-pump and distance columns are computed from the real coordinates. Tip: a Scatter of x vs y redraws Snow’s map; color it by nearest pump.'
    },
    rows: DEATHS,
    columns: [
      { key: 'x', label: 'x', type: 'number', desc: 'Dodson–Tobler grid x (east)' },
      { key: 'y', label: 'y', type: 'number', desc: 'Dodson–Tobler grid y (north)' },
      { key: 'nearestPump', label: 'Nearest pump', type: 'category', get: function (d) { return d.np.name; }, desc: 'Closest of the 13 pumps' },
      { key: 'distBroad', label: 'Distance to Broad St pump', type: 'number', unit: 'grid', get: function (d) { return +d.dBroad.toFixed(3); } },
      { key: 'broadBand', label: 'Proximity to Broad St', type: 'category', get: function (d) { return d.dBroad < 1 ? '< 1 unit' : d.dBroad < 2 ? '1–2' : d.dBroad < 3 ? '2–3' : d.dBroad < 4 ? '3–4' : '4+ units'; } }
    ],
    defaults: { chart: { type: 'scatter', x: 'x', y: 'y', color: 'nearestPump' }, pivot: { group: 'nearestPump', value: 'distBroad', agg: 'count' } }
  };
  document.getElementById('nav-data').addEventListener('click', function () { window.DataExplorer.open(CH_DX); });
  document.getElementById('nav-explore').addEventListener('click', function () { document.getElementById('step-5').scrollIntoView({ behavior: 'smooth', block: 'start' }); });

  window.LESSON = { DEATHS: DEATHS, PUMPS: PUMPS, BY_PUMP: BY_PUMP, BROAD_N: BROAD_N, DIST_BINS: DIST_BINS, ctxs: ctxs, COL: COL };

  /* ============================================================
     PASS 2 — answer checking, gating, audio (data-agnostic)
     ============================================================ */
  var STORE_KEY = 'cholera-state-v1';
  var state = { answers: {}, claim: '', notes: '', skips: {}, muted: false };
  try {
    var saved = JSON.parse(localStorage.getItem(STORE_KEY));
    if (saved && typeof saved === 'object') { for (var sk in state) if (saved[sk] !== undefined) state[sk] = saved[sk]; }
  } catch (e) {}
  function saveState() { try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) {} }

  var ANSWERS = { 1: 'D', 2: 'B', 3: 'B', 4: 'B', 6: 'B', 7: 'B', 8: 'B' };

  var EXPLAIN = {
    1: 'Location pins the where, the tight late-August window pins the when, and the deaths nearby supply a possible pattern. Real investigations stack all three — that is why “all of these together” is the strongest answer.',
    2: 'With all ' + DEATHS.length + ' deaths plotted, a dense cluster appears that no single death could ever reveal. The records don’t get less accurate and the map stays readable — what changes is that a <strong>spatial pattern becomes visible</strong>.',
    3: 'Press Shuffle and the difference is unmistakable: random scatter fills the whole map evenly, while the real deaths pile into one dense cluster. Cholera was anything but evenly spread.',
    4: 'Snow’s register stored a location, a date, and household facts — crucially, which pump supplied the water. The map draws the location; the other fields sit underneath. (This digitized extract keeps only the real locations, so the lesson never invents dates.)',
    6: 'Coloring each death by its nearest pump floods the cluster with one color: <strong>' + BROAD_N + ' of ' + DEATHS.length + '</strong> deaths (' + BROAD_PCT + '%) are nearest the Broad Street pump, which sits in the dead center of the cluster.',
    7: 'Grouping by nearest pump makes the lopsidedness obvious: Broad Street claims <strong>' + BROAD_N + '</strong> deaths — about ' + (BROAD_N / SECOND_N).toFixed(1) + '× the next-highest pump (' + SECOND_N + '). One pump dominates.',
    8: 'Deaths peak ' + DIST_BINS[1].n + '–' + DIST_BINS[2].n + ' close to the pump and collapse to ' + DIST_BINS[4].n + ', then ' + DIST_BINS[5].n + ' farther out. A clear falloff with distance is a <strong>strong relationship</strong> — real evidence the pump is the source, not a coincidence.'
  };
  var FB = {
    1: { ok: 'Exactly — where, when, and nearby pattern, stacked together.', no: 'Each clue helps, but the power is in stacking all three: where, when, and the pattern around it.' },
    2: { ok: 'Right: more deaths, clearer shape. Watch the cluster appear.', no: 'Watch the map fill: one death, then 578. A spatial pattern is what becomes visible.' },
    3: { ok: 'Yes — one dense cluster, not an even sprinkle. Shuffle proves it.', no: 'Press Shuffle: random scatter fills evenly. The real deaths pile up in one place.' },
    4: { ok: 'Right — location, date, and household details like the water source.', no: 'Re-read the record: location plus date and household facts, not just one field.' },
    6: { ok: 'Confirmed: Broad Street sits in the heart of the cluster.', no: 'Turn on “Nearest pump”: one color floods the center — Broad Street.' },
    7: { ok: 'Right — one bar towers over all the others.', no: 'Look at the heights: Broad Street ' + BROAD_N + ' vs the next at ' + SECOND_N + '. One pump dominates.' },
    8: { ok: 'Exactly — deaths fall off sharply with distance. A real relationship.', no: 'Read the bars left to right: tall near the pump, tiny far away. Deaths fall off with distance.' }
  };

  var completed = {}, skipUnlocked = state.skips || {}, doneCount = 0, streak = 0;
  function updateProgress() {
    document.getElementById('progress-fill').style.width = (doneCount / 9 * 100) + '%';
    document.getElementById('progress-label').textContent = doneCount + ' / 9 checks';
  }
  function complete(n) {
    if (completed[n]) return;
    completed[n] = true;
    document.getElementById('step-' + n).dataset.done = '1';
    doneCount++; updateProgress(); applyGates();
  }

  /* ---------- celebrations ---------- */
  var toastTimer = null;
  function showToast(msg, tone) {
    var toast = document.getElementById('celebrate-toast');
    if (!toast) return;
    toast.className = 'celebrate-toast tone-' + (tone || 'good');
    toast.textContent = msg; toast.hidden = false;
    toast.classList.remove('show'); void toast.offsetWidth; toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toast.classList.remove('show'); setTimeout(function () { toast.hidden = true; }, 350); }, 2600);
  }
  function confettiBurst() {
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    var colors = ['#1B5FAA', '#E8704F', '#1E7D45', '#C0392B', '#E2A33D', '#3B82C4'];
    var wrap = document.createElement('div'); wrap.className = 'confetti-wrap';
    for (var i = 0; i < 70; i++) {
      var b = document.createElement('i'); b.className = 'confetti-bit';
      b.style.left = (Math.random() * 100) + '%'; b.style.background = colors[i % colors.length];
      b.style.animationDelay = (Math.random() * 0.3).toFixed(2) + 's';
      b.style.animationDuration = (1.6 + Math.random() * 1.5).toFixed(2) + 's';
      b.style.transform = 'rotate(' + Math.round(Math.random() * 360) + 'deg)';
      wrap.appendChild(b);
    }
    document.body.appendChild(wrap);
    setTimeout(function () { wrap.remove(); }, 3600);
  }
  function celebrateStep(n, ok) {
    var fill = document.getElementById('progress-fill');
    if (fill) { fill.classList.remove('pulse'); void fill.offsetWidth; fill.classList.add('pulse'); }
    if (ok && (n === 9 || doneCount === 9)) { showToast('Case closed — you found the Broad Street pump.', 'good'); confettiBurst(); return; }
    if (!ok) { showToast('Answer revealed — Step ' + n + ' logged. Keep going.', 'muted'); return; }
    var msg;
    if (doneCount === 3) msg = 'Three down — the cluster is emerging.';
    else if (doneCount === 5) msg = 'Past halfway — 4 to go.';
    else if (doneCount === 7) msg = 'Almost there — just 2 to go.';
    else { msg = 'Step ' + n + ' complete'; if (streak >= 2) msg += ' · ' + streak + ' in a row'; }
    showToast(msg, 'good');
  }

  function runEvidenceFx(n) { if (ctxs[n] && ctxs[n].evidenceFx) ctxs[n].evidenceFx(); }

  function renderGradeRadio(n, value, silent) {
    var mcq = document.getElementById('mcq-' + n);
    var btn = mcq.querySelector('.check-btn');
    var ok = value === ANSWERS[n];
    mcq.querySelectorAll('.mcq-choice').forEach(function (lab) {
      var inp = lab.querySelector('input');
      if (inp.value === value) inp.checked = true;
      if (inp.value === ANSWERS[n]) lab.classList.add('correct');
      if (inp.value === value && !ok) lab.classList.add('incorrect');
      inp.disabled = true;
    });
    var fb = mcq.querySelector('.mcq-feedback');
    fb.hidden = false; fb.className = 'mcq-feedback ' + (ok ? 'good' : 'bad');
    fb.innerHTML = (ok ? '<strong>Correct.</strong> ' : '<strong>Not quite — the correct answer is marked in green.</strong> ') + EXPLAIN[n];
    btn.disabled = true; btn.textContent = ok ? 'Correct ✓' : 'Answer revealed';
    if (!silent) runEvidenceFx(n);
    setInst(n, FB[n][ok ? 'ok' : 'no'], ok ? 'success' : 'error');
    complete(n);
    if (!silent) { if (ok) streak++; else streak = 0; celebrateStep(n, ok); }
  }
  function gradeRadio(n, btn) {
    var mcq = document.getElementById('mcq-' + n);
    var sel = mcq.querySelector('input:checked');
    if (!sel) { setInst(n, 'Pick an answer first, then check it.', 'warn'); return; }
    if (n === 6 && (!ctxs[6] || !ctxs[6].sliderSeen)) {
      setInst(6, 'Evidence first: press “Nearest pump” and watch the deaths recolor, then check your answer.', 'error');
      return;
    }
    if (sel.value !== ANSWERS[n]) {
      streak = 0;
      mcq.querySelectorAll('.mcq-choice').forEach(function (lab) { lab.classList.remove('incorrect'); });
      sel.closest('.mcq-choice').classList.add('incorrect');
      var fb = mcq.querySelector('.mcq-feedback');
      fb.hidden = false; fb.className = 'mcq-feedback bad';
      fb.innerHTML = '<strong>Not quite — try again.</strong> ' + (FB[n] ? FB[n].no : '');
      btn.textContent = 'Try again';
      setInst(n, FB[n] ? FB[n].no : 'Look at the map again, then re-check.', 'error');
      return;
    }
    state.answers[n] = sel.value; saveState();
    renderGradeRadio(n, sel.value, false);
  }

  function renderTags(values, silent) {
    var fb = document.querySelector('#mcq-5 .mcq-feedback');
    document.querySelectorAll('#mcq-5 input').forEach(function (i) { if (values.indexOf(i.value) !== -1) i.checked = true; i.disabled = true; });
    fb.hidden = false; fb.className = 'mcq-feedback good';
    fb.innerHTML = '<strong>Observations saved:</strong> ' + values.join(', ') + '. At the notice-and-wonder stage every honest observation counts — scientists describe first and explain later. Keep these words: you’ll want one for your final claim in Step 9.';
    var btn = document.querySelector('#mcq-5 .check-btn'); btn.disabled = true; btn.textContent = 'Observations saved ✓';
    setInst(5, 'Saved: ' + values.join(', ') + ' — good noticing.', 'success');
    complete(5);
    if (!silent) { streak++; celebrateStep(5, true); }
  }
  function gradeTags(btn) {
    var checked = Array.prototype.slice.call(document.querySelectorAll('#mcq-5 input:checked')).map(function (i) { return i.value; });
    if (!checked.length) { setInst(5, 'Tag at least one shape you can honestly say you see.', 'warn'); return; }
    state.answers[5] = checked; saveState(); renderTags(checked, false);
  }

  var GEO_TERMS = ['cluster', 'center', 'centre', 'ring', 'band', 'core', 'dense', 'heart', 'circle', 'hot spot', 'hotspot'];
  var PATTERN_TERMS = ['most', 'many', 'majority', 'rare', 'few', 'almost all', 'percent', '%', 'half', 'nearly all', 'sharply', 'falls', 'fall off', 'falloff'];
  function gradeClaim(btn) {
    var t = document.getElementById('claim-text').value.toLowerCase();
    if (t.trim().length < 15) { setInst(9, 'Write your claim first — a sentence or two in the box on the right.', 'warn'); return; }
    var hasGeo = GEO_TERMS.some(function (w) { return t.indexOf(w) !== -1; });
    var hasNum = /\d/.test(t) || PATTERN_TERMS.some(function (w) { return t.indexOf(w) !== -1; });
    var fb = document.querySelector('#mcq-9 .mcq-feedback');
    if (!hasGeo || !hasNum) {
      fb.hidden = false; fb.className = 'mcq-feedback bad';
      var missing = [];
      if (!hasGeo) missing.push('a <strong>shape word</strong> (cluster, center, ring…)');
      if (!hasNum) missing.push('a <strong>number or pattern observation</strong> (a count like “' + BROAD_N + ' of ' + DEATHS.length + '”, or a word like “most”)');
      fb.innerHTML = 'Almost — your claim still needs ' + missing.join(' and ') + '. The Count chip gives you a real number to cite.';
      setInst(9, 'Strengthen the claim: pair a shape word with a number or pattern word, like a scientist would.', 'error');
      return;
    }
    renderClaimAccepted(false);
  }
  function renderClaimAccepted(silent) {
    var fb = document.querySelector('#mcq-9 .mcq-feedback');
    var btn = document.querySelector('#mcq-9 .check-btn');
    fb.hidden = false; fb.className = 'mcq-feedback good';
    fb.innerHTML = '<strong>That is a claim with evidence.</strong> You named a shape and backed it with a quantitative observation — exactly how Snow argued the case. In this real data: ' + BROAD_N + ' of ' + DEATHS.length + ' deaths (' + BROAD_PCT + '%) are nearest the Broad Street pump, and deaths fall off sharply with distance from it.';
    btn.disabled = true; btn.textContent = 'Claim checked ✓';
    setInst(9, 'Claim accepted — shape word plus pattern evidence. Now remove the handle.', 'success');
    if (!silent) runEvidenceFx(9);
    if (!silent) { state.answers[9] = true; saveState(); }
    complete(9);
    if (typeof syncEndClaim === 'function') syncEndClaim();
    if (!silent) { streak++; celebrateStep(9, true); }
  }

  document.querySelectorAll('.check-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var n = +btn.dataset.check;
      if (n === 5) gradeTags(btn);
      else if (n === 9) gradeClaim(btn);
      else gradeRadio(n, btn);
    });
  });

  /* ---------- soft gating ---------- */
  function isUnlocked(n) { return n === 1 || completed[n - 1] || skipUnlocked[n]; }
  function showGate(n) {
    var sec = document.getElementById('step-' + n);
    var frame = sec.querySelector('.viz-frame');
    if (!frame.querySelector('.gate-popup')) {
      var pop = document.createElement('div'); pop.className = 'gate-popup';
      pop.innerHTML = '<div class="gate-popup-inner"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.4"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg><span>Answer Step ' + (n - 1) + ' to continue</span><button class="gate-skip">Skip for now →</button></div>';
      frame.appendChild(pop);
      pop.querySelector('.gate-skip').addEventListener('click', function () {
        skipUnlocked[n] = true; state.skips[n] = true; saveState(); applyGates();
        if (currentStep === n) playStep(n);
      });
    }
    var col = sec.querySelector('.card-col');
    if (!col.querySelector('.gate-note')) {
      var note = document.createElement('div'); note.className = 'gate-note';
      note.textContent = 'Locked: answer Step ' + (n - 1) + ' first, or use “Skip for now” on the left. Skipping won’t mark Step ' + (n - 1) + ' correct.';
      col.appendChild(note);
    }
    pauseAllAudio();
  }
  function applyGates() {
    for (var n = 1; n <= 9; n++) {
      var sec = document.getElementById('step-' + n);
      var locked = !isUnlocked(n);
      sec.classList.toggle('locked', locked);
      if (!locked) {
        var pop = sec.querySelector('.gate-popup'); if (pop) pop.remove();
        var note = sec.querySelector('.gate-note'); if (note) note.remove();
      }
    }
    revealGate();
  }

  /* ---------- audio narration (tolerant of missing files) ---------- */
  var audios = {};
  for (var an = 1; an <= 9; an++) audios[an] = document.getElementById('audio-' + an);
  var audioUnlocked = false;
  var currentStep = 1;
  var reviewSetStep = function () {};
  function pauseAllAudio(except) { for (var k in audios) { var a = audios[k]; if (a && +k !== except && !a.paused) a.pause(); } }
  function playStep(n) {
    if (!audioUnlocked || state.muted || !isUnlocked(n)) return;
    pauseAllAudio(n);
    var a = audios[n];
    if (a && a.paused) { a.currentTime = 0; var pr = a.play(); if (pr && pr.catch) pr.catch(function () {}); }
  }
  document.addEventListener('pointerdown', function unlockAudio() {
    var intro = document.getElementById('intro-screen');
    if (intro && !intro.hidden) return;
    audioUnlocked = true; document.removeEventListener('pointerdown', unlockAudio); playStep(currentStep);
  });
  var stepWatchIO = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (!e.isIntersecting) return;
      var n = +e.target.dataset.step;
      currentStep = n; reviewSetStep(n);
      if (!isUnlocked(n)) showGate(n); else playStep(n);
    });
  }, { threshold: 0.3 });
  document.querySelectorAll('.step').forEach(function (sec) { stepWatchIO.observe(sec); });

  var soundBtn = document.getElementById('nav-sound');
  function syncSoundBtn() { soundBtn.textContent = state.muted ? 'Sound: off' : 'Sound: on'; soundBtn.style.background = state.muted ? '#52606D' : ''; }
  soundBtn.addEventListener('click', function () { state.muted = !state.muted; saveState(); syncSoundBtn(); if (state.muted) pauseAllAudio(); else playStep(currentStep); });
  syncSoundBtn();

  /* ---------- intro ---------- */
  var introScreen = document.getElementById('intro-screen');
  var introBegin = document.getElementById('intro-begin');
  var introMute = document.getElementById('intro-mute');
  if (introScreen && introBegin) {
    document.body.style.overflow = 'hidden';
    if (introMute) introMute.checked = !!state.muted;
    introBegin.addEventListener('click', function () {
      if (introMute && introMute.checked) { state.muted = true; saveState(); syncSoundBtn(); }
      audioUnlocked = true; introScreen.classList.add('is-leaving'); document.body.style.overflow = '';
      setTimeout(function () { introScreen.hidden = true; }, 500);
      var s1 = document.getElementById('step-1'); if (s1) s1.scrollIntoView({ behavior: 'smooth' });
      currentStep = 1; playStep(1);
    });
  }

  /* ---------- restore ---------- */
  var notesEl = document.getElementById('notes-text');
  var claimEl = document.getElementById('claim-text');
  if (state.notes) notesEl.value = state.notes;
  if (state.claim) claimEl.value = state.claim;
  notesEl.addEventListener('input', function () { state.notes = notesEl.value; saveState(); });
  claimEl.addEventListener('input', function () { state.claim = claimEl.value; saveState(); });
  for (var rn = 1; rn <= 9; rn++) {
    var v = state.answers[rn];
    if (v === undefined || v === null) continue;
    if (rn === 5) renderTags(v, true);
    else if (rn === 9) renderClaimAccepted(true);
    else if (v === ANSWERS[rn]) renderGradeRadio(rn, v, true);
  }

  /* ---------- progressive scroll gate ---------- */
  var reviewMode = false;
  try { reviewMode = new URLSearchParams(location.search).get('review') === 'true'; } catch (e) {}
  var scrollFadeEl = document.getElementById('scroll-fade');
  if (reviewMode && scrollFadeEl) scrollFadeEl.style.display = 'none';
  function firstLockedStep() { for (var n = 2; n <= 9; n++) { if (!isUnlocked(n)) return n; } return 0; }
  function revealGate() {
    var F = firstLockedStep();
    for (var n = 1; n <= 9; n++) {
      var sec = document.getElementById('step-' + n);
      if (!sec) continue;
      sec.classList.toggle('gate-hidden', !reviewMode && F !== 0 && n > F);
      sec.classList.toggle('peek-veil', !reviewMode && F !== 0 && n === F);
    }
    var hideEnd = !reviewMode && !completed[9];
    var endSec = document.getElementById('lesson-end');
    var footEl = document.querySelector('.lesson-footer');
    if (endSec) endSec.classList.toggle('gate-hidden', hideEnd);
    if (footEl) footEl.classList.toggle('gate-hidden', hideEnd);
  }
  function updateScrollCue() {
    if (!scrollFadeEl || reviewMode) return;
    var cue = scrollFadeEl.querySelector('.scroll-cue');
    var F = firstLockedStep();
    var nearBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4;
    if (F !== 0) {
      scrollFadeEl.classList.remove('at-bottom');
      if (cue) {
        if (nearBottom) { cue.classList.add('cue-locked'); cue.innerHTML = 'Answer Step ' + (F - 1) + ' to keep going · <button type="button" class="cue-skip">skip</button>'; }
        else { cue.classList.remove('cue-locked'); cue.innerHTML = '<span>⌄</span>scroll'; }
      }
    } else {
      scrollFadeEl.classList.toggle('at-bottom', nearBottom);
      if (cue) { cue.classList.remove('cue-locked'); cue.innerHTML = '<span>⌄</span>scroll'; }
    }
  }
  if (scrollFadeEl && !reviewMode) {
    scrollFadeEl.addEventListener('click', function (ev) {
      var sk = ev.target.closest && ev.target.closest('.cue-skip');
      if (!sk) return;
      var F = firstLockedStep(); if (!F) return;
      skipUnlocked[F] = true; state.skips[F] = true; saveState(); applyGates();
    });
    window.addEventListener('scroll', updateScrollCue, { passive: true });
    window.addEventListener('resize', updateScrollCue);
  }

  /* ---------- end screen ---------- */
  var endClaim = document.getElementById('end-claim');
  var endClaimText = document.getElementById('end-claim-text');
  function syncEndClaim() {
    if (!endClaim) return;
    var c = (claimEl ? claimEl.value : '').trim();
    if (c) { endClaimText.textContent = '“' + c + '”'; endClaim.hidden = false; } else { endClaim.hidden = true; }
  }
  syncEndClaim();
  if (claimEl) claimEl.addEventListener('input', syncEndClaim);
  var endTop = document.getElementById('end-top');
  if (endTop) endTop.addEventListener('click', function () { window.scrollTo({ top: 0, behavior: 'smooth' }); });
  var endRestart = document.getElementById('end-restart');
  if (endRestart) endRestart.addEventListener('click', function () {
    if (!window.confirm('Start the lesson over? This clears your answers, notes, and claim on this device.')) return;
    try { localStorage.removeItem(STORE_KEY); } catch (e) {}
    location.reload();
  });

  /* ---------- review mode (?review=true) ---------- */
  (function initReview() {
    var params; try { params = new URLSearchParams(location.search); } catch (e) { return; }
    if (params.get('review') !== 'true') return;
    var RKEY = 'cholera-review-v1';
    var comments = {};
    try { comments = JSON.parse(localStorage.getItem(RKEY) || '{}') || {}; } catch (e) { comments = {}; }
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
    textEl.addEventListener('input', function () {
      comments[activeStep] = textEl.value; clearTimeout(saveTimer);
      saveTimer = setTimeout(function () { try { localStorage.setItem(RKEY, JSON.stringify(comments)); } catch (e) {} savedEl.textContent = 'Saved ✓'; updateBadge(); setTimeout(function () { savedEl.textContent = ''; }, 1200); }, 350);
    });
    panel.querySelector('#rv-clear').addEventListener('click', function () { delete comments[activeStep]; textEl.value = ''; try { localStorage.setItem(RKEY, JSON.stringify(comments)); } catch (e) {} updateBadge(); });
    panel.querySelector('#rv-export').addEventListener('click', function () {
      var out = { lesson: 'The Broad Street Pump', exported: new Date().toISOString(), comments: {} };
      for (var n = 1; n <= 9; n++) { if ((comments[n] || '').trim()) out.comments['step' + n] = { title: stepTitle(n), comment: comments[n] }; }
      var blob = new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' });
      var url = URL.createObjectURL(blob); var a = document.createElement('a'); a.href = url; a.download = 'broad-street-review.json'; a.click();
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    });
    reviewSetStep = function (n) { if (n !== activeStep) loadStep(n); };
    loadStep(activeStep); updateBadge();
  })();

  applyGates();
  revealGate();
  updateScrollCue();
})();
