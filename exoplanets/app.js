/* Are We Alone? — Savvas Data Show
   Real data: NASA Exoplanet Archive, pscomppars (confirmed planets), fetched 2026-06-18.
   Source: https://exoplanetarchive.ipac.caltech.edu/TAP/sync
   Every count in this lesson is computed from that data at runtime. Blank fields were
   never measured for that planet — the lesson never invents them. */
(function () {
  'use strict';

  var SRC_URL = 'https://exoplanetarchive.ipac.caltech.edu/cgi-bin/TblView/nph-tblView?app=ExoTbls&config=PSCompPars';
  var ALL = window.EXO_DATA.planets;
  // working catalog for the main scatter: planets with BOTH a measured radius and starlight (insolation)
  var CAT = ALL.filter(function (p) { return p.r != null && p.ins != null; });
  // full catalog with an orbit, for the detection-bias view
  var ORB = ALL.filter(function (p) { return p.r != null && p.au != null; });
  var PEG = ALL.filter(function (p) { return /^51 Peg/.test(p.n); })[0];

  // Earth-like box: rocky size + habitable starlight
  var BOX = { rLo: 0.5, rHi: 1.6, iLo: 0.25, iHi: 1.5 };
  function inBox(p) { return p.r >= BOX.rLo && p.r <= BOX.rHi && p.ins >= BOX.iLo && p.ins <= BOX.iHi; }
  var BOX_PLANETS = CAT.filter(inBox);
  var BOX_N = BOX_PLANETS.length;            // 30
  var CAT_N = CAT.length;                     // 4407
  var ICONIC = ['TRAPPIST-1 e', 'Proxima Cen b', 'TOI-700 d', 'Kepler-442 b', 'Kepler-186 f'];

  var EARTH = { n: 'Earth', r: 1, ins: 1, au: 1, mark: true };

  var COL = {
    dot: '#1B5FAA', dotSoft: '#7FA8CE', earth: '#1E7D45', box: '#1E7D45', accent: '#E8704F',
    gold: '#E2A33D', ink: '#27313B', grid: '#E8E5DE', axis: '#9AA4B0', star: '#F4C44E'
  };
  var METHOD_COL = {
    'Transit': '#1B5FAA', 'Radial Velocity': '#E8704F', 'Microlensing': '#1E7D45',
    'Imaging': '#9C6FB8', 'Other': '#9AA4B0'
  };
  function methodKey(m) { return METHOD_COL[m] ? m : 'Other'; }

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
  function planetTip(p) {
    var bits = ['<strong>' + p.n + '</strong>'];
    if (p.r != null) bits.push('radius ' + p.r + ' R⊕');
    if (p.ins != null) bits.push('starlight ' + (p.ins >= 10 ? Math.round(p.ins) : p.ins) + '× Earth');
    if (p.au != null) bits.push('orbit ' + p.au + ' AU');
    if (p.meth) bits.push(p.meth + (p.yr ? ' · ' + p.yr : ''));
    return bits.join('<br>');
  }

  function setInst(n, html, tone) {
    var bar = document.getElementById('inst-' + n);
    if (!bar) return; bar.innerHTML = html;
    bar.className = 'instruction-bar' + (tone ? ' tone-' + tone : '');
  }
  function frameOf(n) { return document.querySelector('#viz-' + n).closest('.viz-frame'); }
  function ensureBadge(n) {
    var frame = frameOf(n);
    var b = frame.querySelector('.viz-badge');
    if (!b) { b = document.createElement('div'); b.className = 'viz-badge'; frame.appendChild(b); }
    return b;
  }

  var ctxs = {}, chipActions = {}, utilActions = {};
  var VW = 720, VH = 540;

  function fmtIns(v) { return v >= 1000 ? d3.format('.2s')(v) : (v >= 10 ? Math.round(v) : (v >= 1 ? v : v.toFixed(2))); }

  /* ---------- generic log-log scatter with zoom ---------- */
  function makeScatter(n, cfg) {
    cfg = cfg || {};
    var data = cfg.data || CAT;
    var xField = cfg.xField || 'ins', yField = cfg.yField || 'r';
    var M = { t: 22, r: 18, b: 50, l: 56 }, W = VW - M.l - M.r, H = VH - M.t - M.b;
    var container = d3.select('#viz-' + n);
    var svg = container.append('svg').attr('viewBox', '0 0 ' + VW + ' ' + VH).attr('preserveAspectRatio', 'xMidYMid meet');
    svg.append('rect').attr('width', VW).attr('height', VH).attr('fill', '#fff');
    var plot = svg.append('g').attr('transform', 'translate(' + M.l + ',' + M.t + ')');

    var xVals = data.map(function (d) { return d[xField]; }).filter(function (v) { return v > 0; });
    var yVals = data.map(function (d) { return d[yField]; }).filter(function (v) { return v > 0; });
    var xDom = [d3.min(xVals), d3.max(xVals)], yDom = [d3.min(yVals), d3.max(yVals)];
    if (cfg.includeEarth) { xDom = [Math.min(xDom[0], 0.5), Math.max(xDom[1], 2)]; yDom = [Math.min(yDom[0], 0.8), yDom[1]]; }
    var x = d3.scaleLog().domain(cfg.xReversed ? [xDom[1], xDom[0]] : xDom).range([0, W]).nice();
    var y = d3.scaleLog().domain(yDom).range([H, 0]).nice();

    // axes
    var xAxis = d3.axisBottom(x).ticks(6, cfg.xTickFmt || '~g');
    var yAxis = d3.axisLeft(y).ticks(6, '~g');
    plot.append('g').attr('class', 'grid').attr('transform', 'translate(0,' + H + ')')
      .call(d3.axisBottom(x).ticks(6).tickSize(-H).tickFormat('')).call(function (g) { g.selectAll('line').attr('stroke', COL.grid); g.select('.domain').remove(); });
    plot.append('g').attr('class', 'grid').call(d3.axisLeft(y).ticks(6).tickSize(-W).tickFormat('')).call(function (g) { g.selectAll('line').attr('stroke', COL.grid); g.select('.domain').remove(); });
    plot.append('g').attr('transform', 'translate(0,' + H + ')').call(xAxis).selectAll('text').attr('font-size', 10).attr('fill', '#5A6470');
    plot.append('g').call(yAxis).selectAll('text').attr('font-size', 10).attr('fill', '#5A6470');
    plot.append('text').attr('x', W / 2).attr('y', H + 40).attr('text-anchor', 'middle').attr('font-size', 11).attr('fill', '#5A6470').text(cfg.xLabel || 'starlight received (× Earth)');
    plot.append('text').attr('x', -H / 2).attr('y', -40).attr('transform', 'rotate(-90)').attr('text-anchor', 'middle').attr('font-size', 11).attr('fill', '#5A6470').text(cfg.yLabel || 'planet radius (× Earth)');
    if (cfg.xEnds) {
      plot.append('text').attr('x', 2).attr('y', -6).attr('font-size', 10).attr('fill', COL.accent).text(cfg.xEnds[0]);
      plot.append('text').attr('x', W - 2).attr('y', -6).attr('text-anchor', 'end').attr('font-size', 10).attr('fill', COL.dot).text(cfg.xEnds[1]);
    }

    var boxG = plot.append('g');     // earth-like box layer
    var dotsG = plot.append('g').attr('clip-path', 'url(#clip-' + n + ')');
    svg.append('clipPath').attr('id', 'clip-' + n).append('rect').attr('x', 0).attr('y', 0).attr('width', W).attr('height', H);
    var fxG = plot.append('g');

    function fx(d) { return x(d[xField]); }
    function fy(d) { return y(d[yField]); }

    var dots = dotsG.selectAll('circle.pl').data(data).join('circle').attr('class', 'pl')
      .attr('cx', fx).attr('cy', fy).attr('r', cfg.dotR || 1.8)
      .attr('fill', cfg.fill || COL.dot).attr('fill-opacity', cfg.opacity == null ? 0.5 : cfg.opacity);
    if (cfg.tips !== false) dots.on('mousemove', function (ev, d) { showTip(ev, planetTip(d)); }).on('mouseleave', hideTip);

    // Earth reference marker
    var earthMark = null;
    if (cfg.includeEarth) {
      earthMark = fxG.append('g').attr('transform', 'translate(' + x(EARTH[xField]) + ',' + y(EARTH[yField]) + ')');
      earthMark.append('circle').attr('r', 4.5).attr('fill', COL.earth).attr('stroke', '#fff').attr('stroke-width', 1.4);
      earthMark.append('text').attr('x', 7).attr('y', 4).attr('font-size', 11).attr('font-weight', 700).attr('fill', COL.earth)
        .attr('paint-order', 'stroke').attr('stroke', '#fff').attr('stroke-width', 2.5).text('Earth');
    }

    var zoom = d3.zoom().scaleExtent([1, 12]).on('zoom', function (ev) {
      var t = ev.transform;
      dotsG.attr('transform', t); boxG.attr('transform', t); fxG.attr('transform', t);
      dotsG.selectAll('circle').attr('r', (cfg.dotR || 1.8) / Math.sqrt(t.k));
    });
    svg.call(zoom).on('dblclick.zoom', null);

    var ctx = { n: n, svg: svg, plot: plot, dotsG: dotsG, boxG: boxG, fxG: fxG, dots: dots, x: x, y: y, W: W, H: H, fx: fx, fy: fy, xField: xField, yField: yField, zoom: zoom, earthMark: earthMark, cfg: cfg };
    ctxs[n] = ctx; chipActions[n] = chipActions[n] || {}; utilActions[n] = utilActions[n] || {};
    utilActions[n]['zoom-in'] = function () { svg.transition().duration(350).call(zoom.scaleBy, 1.6); };
    utilActions[n]['zoom-out'] = function () { svg.transition().duration(350).call(zoom.scaleBy, 1 / 1.6); };
    utilActions[n]['reset'] = function () { svg.transition().duration(450).call(zoom.transform, d3.zoomIdentity); };
    return ctx;
  }

  function drawBox(ctx, opts) {
    opts = opts || {};
    var x = ctx.x, y = ctx.y;
    var x0 = x(BOX.iHi), x1 = x(BOX.iLo);          // insolation reversed: iHi left, iLo right
    var left = Math.min(x0, x1), w = Math.abs(x1 - x0);
    var y0 = y(BOX.rHi), y1 = y(BOX.rLo);
    ctx.boxG.selectAll('*').remove();
    ctx.boxG.append('rect').attr('x', left).attr('y', Math.min(y0, y1)).attr('width', w).attr('height', Math.abs(y1 - y0))
      .attr('fill', COL.box).attr('fill-opacity', 0.10).attr('stroke', COL.box).attr('stroke-width', 1.4).attr('stroke-dasharray', '5 3');
    ctx.boxG.append('text').attr('x', left + w / 2).attr('y', Math.min(y0, y1) - 6).attr('text-anchor', 'middle')
      .attr('font-size', 10.5).attr('font-weight', 700).attr('fill', COL.box).text('Earth-like box');
    ctx.boxSeen = true;
  }

  function pulseAt(ctx, d, color, times) {
    times = times || 3; var cx = ctx.fx(d), cy = ctx.fy(d);
    for (var i = 0; i < times; i++) {
      ctx.fxG.append('circle').attr('cx', cx).attr('cy', cy).attr('r', 4).attr('fill', 'none').attr('stroke', color).attr('stroke-width', 2).style('opacity', 0.9)
        .transition().delay(i * 420).duration(1100).ease(d3.easeCubicOut).attr('r', 32).style('opacity', 0).remove();
    }
  }
  function flashChip(btn, fn) { btn.classList.add('active'); if (fn) fn(); setTimeout(function () { btn.classList.remove('active'); }, 1400); }

  function fadeIn(dots, dotR) {
    var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    dots.attr('fill-opacity', 0).transition().delay(function (d, i) { return reduced ? 0 : Math.min(i * 0.4, 1500); }).duration(reduced ? 0 : 400).attr('fill-opacity', 0.5);
  }
  function zoomToBox(ctx) {
    var x = ctx.x, y = ctx.y;
    var cx = (x(BOX.iHi) + x(BOX.iLo)) / 2, cy = (y(BOX.rHi) + y(BOX.rLo)) / 2;
    ctx.svg.transition().duration(800).call(ctx.zoom.transform, d3.zoomIdentity.translate(ctx.W / 2, ctx.H / 2).scale(3).translate(-cx, -cy));
  }

  /* ============================================================
     PASS 1 — per-step visualizations
     ============================================================ */

  function initStep1() {
    var container = d3.select('#viz-1');
    var svg = container.append('svg').attr('viewBox', '0 0 ' + VW + ' ' + VH).attr('preserveAspectRatio', 'xMidYMid meet');
    var bg = svg.append('rect').attr('width', VW).attr('height', VH).attr('fill', '#0B1830');
    // starfield
    var sf = svg.append('g'); var seed = 1995;
    function rnd() { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; }
    for (var i = 0; i < 140; i++) sf.append('circle').attr('cx', rnd() * VW).attr('cy', rnd() * VH).attr('r', rnd() * 1.3 + 0.2).attr('fill', '#fff').attr('fill-opacity', rnd() * 0.7 + 0.1);
    // host star + planet
    svg.append('circle').attr('cx', VW / 2 - 150).attr('cy', VH / 2).attr('r', 46).attr('fill', COL.star).attr('filter', 'drop-shadow(0 0 26px rgba(244,196,78,.8))');
    var planet = svg.append('g').attr('transform', 'translate(' + (VW / 2 + 70) + ',' + VH / 2 + ')');
    planet.append('circle').attr('r', 30).attr('fill', '#C98A52').attr('stroke', '#E8B07A').attr('stroke-width', 2);
    planet.append('ellipse').attr('rx', 30).attr('ry', 8).attr('cy', -4).attr('fill', 'none').attr('stroke', '#E8B07A').attr('stroke-opacity', 0.5).attr('stroke-width', 2);
    var label = svg.append('g').attr('transform', 'translate(' + (VW / 2 + 70) + ',' + (VH / 2 + 56) + ')');
    label.append('text').attr('text-anchor', 'middle').attr('font-size', 15).attr('font-weight', 700).attr('fill', '#fff').text('51 Pegasi b');
    label.append('text').attr('y', 18).attr('text-anchor', 'middle').attr('font-size', 11).attr('fill', '#9FB6D6').text('first planet found around a sun-like star · 1995');

    var card = svg.append('g').attr('transform', 'translate(24,24)');
    card.append('rect').attr('width', 188).attr('height', 132).attr('rx', 8).attr('fill', 'rgba(255,255,255,.95)').attr('stroke', '#3B4D66');
    var rows = [['Radius', (PEG.r) + ' × Earth (a giant)'], ['Mass', PEG.m + ' × Earth'], ['Orbit', PEG.per + ' days · ' + PEG.au + ' AU'], ['Starlight', 'not measured*'], ['Found by', PEG.meth + ', ' + PEG.yr]];
    rows.forEach(function (r, i) {
      var g = card.append('g').attr('transform', 'translate(12,' + (22 + i * 22) + ')');
      g.append('text').attr('font-size', 9).attr('fill', '#8A93A0').text(r[0].toUpperCase());
      g.append('text').attr('x', 66).attr('font-size', 10.5).attr('font-weight', 600).attr('fill', COL.ink).text(r[1]);
    });

    utilActions[1] = utilActions[1] || {};
    var ctx = { n: 1 }; ctxs[1] = ctx;
    var played = false;
    ctx.entryAnimation = function () { if (played) return; played = true; (function loop() { if (!document.body.contains(planet.node())) return; planet.select('circle').transition().duration(2200).attr('r', 33).transition().duration(2200).attr('r', 30).on('end', loop); })(); };
    chipActions[1] = {
      size: function (b) { flashChip(b, function () { setInst(1, 'Size: 51 Peg b is ' + PEG.r + '× Earth’s radius — a gas giant, like Jupiter. Nothing you could stand on.', 'success'); }); },
      starlight: function (b) { flashChip(b, function () { setInst(1, 'Starlight: it orbits in ' + PEG.per + ' days, blisteringly close — but its exact insolation was never measured (it doesn’t transit).', 'success'); }); },
      first: function (b) { flashChip(b, function () { setInst(1, 'A first: 1995, the discovery that won the 2019 Nobel Prize and opened the search for other worlds.', 'success'); }); },
      source: function (b) { flashChip(b, function () { setInst(1, 'Source: NASA Exoplanet Archive — every value here is a real measurement.', 'success'); }); }
    };
  }

  function buildInsScatter(n) {
    return makeScatter(n, { data: CAT, xField: 'ins', yField: 'r', xReversed: true, includeEarth: true,
      xLabel: 'starlight received (× Earth) — hotter ← → colder', yLabel: 'planet radius (× Earth)', xEnds: ['☀ hotter', 'colder ❄'] });
  }

  function initStep2() {
    var ctx = buildInsScatter(2);
    var played = false;
    ctx.entryAnimation = function () { if (played) return; played = true; fadeIn(ctx.dots, ctx.cfg.dotR); setInst(2, 'One planet → ' + CAT_N.toLocaleString() + ' planets with measured size and starlight.', 'success'); };
    chipActions[2] = insChips(ctx, 2);
  }

  function initStep3() {
    var ctx = buildInsScatter(3);
    var real = CAT.map(function (p) { return { r: p.r, ins: p.ins, n: p.n, meth: p.meth, au: p.au, yr: p.yr }; });
    var seed = 1995; function rnd() { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; }
    var xd = ctx.x.domain(), yd = ctx.y.domain();
    var lx = Math.log(xd[0]), lxr = Math.log(xd[1]) - lx, ly = Math.log(yd[0]), lyr = Math.log(yd[1]) - ly;
    var scrambled = real.map(function () { return { ins: Math.exp(lx + rnd() * lxr), r: Math.exp(ly + rnd() * lyr) }; });
    var isScram = false;
    function setMode(toScram) {
      isScram = toScram;
      ctx.dots.data(toScram ? scrambled : real).transition().duration(900).ease(d3.easeCubicInOut)
        .attr('cx', ctx.fx).attr('cy', ctx.fy).attr('fill', toScram ? '#9AA4B0' : COL.dot);
      setInst(3, toScram ? 'Synthetic comparison: the same ' + CAT_N.toLocaleString() + ' planets placed at random. The clumps vanish.' : 'Real data: planets gather into clumps, leaving wide empty regions.', toScram ? 'warn' : 'success');
    }
    utilActions[3] = utilActions[3] || {};
    utilActions[3]['shuffle'] = function (b) { setMode(!isScram); if (b) b.classList.toggle('active', isScram); };
    var played = false;
    ctx.entryAnimation = function () { if (played) return; played = true; fadeIn(ctx.dots, ctx.cfg.dotR); };
    chipActions[3] = Object.assign(insChips(ctx, 3), { compare: function (b) { flashChip(b, function () { setMode(!isScram); }); } });
  }

  function initStep5() {
    var ctx = buildInsScatter(5);
    ctx.entryAnimation = function () {};
    chipActions[5] = insChips(ctx, 5);
  }

  function initStep6() {
    var ctx = buildInsScatter(6);
    drawBox(ctx); ctx.boxG.style('display', 'none'); ctx.boxSeen = false;
    var boxOn = false, sizeMax = 100;
    function recolor() {
      ctx.dots.attr('fill', function (d) { return (boxOn && inBox(d)) ? COL.gold : COL.dot; })
        .attr('display', function (d) { return d.r > sizeMax ? 'none' : null; })
        .attr('fill-opacity', function (d) { return (boxOn && inBox(d)) ? 0.95 : 0.42; })
        .attr('r', function (d) { return (boxOn && inBox(d)) ? 3.4 : (ctx.cfg.dotR || 1.8); });
    }
    function setBox(on) { boxOn = on; ctx.boxG.style('display', on ? null : 'none'); if (on) ctx.boxSeen = true; recolor();
      ensureBadge(6).innerHTML = on ? '<strong style="color:' + COL.gold + '">' + BOX_N + '</strong> of ' + CAT_N.toLocaleString() + ' planets fall in the Earth-like box' : '';
      setInst(6, on ? 'The box holds just ' + BOX_N + ' of ' + CAT_N.toLocaleString() + ' planets — a tiny, precious group near Earth.' : 'Box hidden.', 'success'); }
    utilActions[6] = utilActions[6] || {};
    utilActions[6]['box'] = function (b) { setBox(!boxOn); if (b) b.classList.toggle('active', boxOn); };

    var slider = document.getElementById('size-slider'), readout = document.getElementById('size-readout'), count = document.getElementById('size-count');
    if (slider) {
      slider.addEventListener('input', function () {
        sizeMax = +slider.value; readout.textContent = sizeMax.toFixed(1) + ' R⊕';
        var shown = CAT.filter(function (d) { return d.r <= sizeMax; }).length;
        count.textContent = shown.toLocaleString() + ' shown'; recolor();
      });
    }
    ctx.entryAnimation = function () {};
    chipActions[6] = Object.assign(insChips(ctx, 6), {
      box: function (b) { flashChip(b, function () { setBox(true); }); },
      count: function (b) { flashChip(b, function () { setBox(true); zoomToBox(ctx); setInst(6, 'Inside the box: ' + BOX_N + ' planets — names like TRAPPIST-1 e, Proxima Cen b, TOI-700 d.', 'success'); }); }
    });
  }

  function insChips(ctx, n) {
    return {
      clumps: function (b) { flashChip(b, function () { setInst(n, 'Two crowds: giant hot Jupiters (top-left) and smaller sub-Neptunes — with gaps between.', 'success'); }); },
      earth: function (b) { flashChip(b, function () { if (ctx.earthMark) { pulseAt(ctx, EARTH, COL.earth, 3); } setInst(n, 'Earth sits at starlight = 1, radius = 1 — in a sparsely populated corner.', 'success'); }); },
      compare: function (b) { flashChip(b, function () { setInst(n, 'Compare the dense top-left to the empty lower-right: planets are far from evenly spread.', 'success'); }); },
      count: function (b) { flashChip(b, function () { setInst(n, CAT_N.toLocaleString() + ' planets here have both size and starlight measured.', 'success'); }); },
      axes: function (b) { flashChip(b, function () { setInst(n, 'Up = bigger planet. Left = more starlight (hotter). Both axes are logarithmic.', 'success'); }); }
    };
  }

  function makeChart(n) {
    var container = d3.select('#viz-' + n);
    var svg = container.append('svg').attr('viewBox', '0 0 ' + VW + ' ' + VH).attr('preserveAspectRatio', 'xMidYMid meet');
    svg.append('rect').attr('width', VW).attr('height', VH).attr('fill', '#fff');
    var ctx = { n: n, svg: svg, root: svg.append('g') };
    ctxs[n] = ctx; chipActions[n] = chipActions[n] || {}; utilActions[n] = utilActions[n] || {};
    return ctx;
  }

  function initStep7() {
    var ctx = makeChart(7);
    var M = { t: 30, r: 20, b: 70, l: 56 }, W = VW - M.l - M.r, H = VH - M.t - M.b;
    var g = ctx.root.attr('transform', 'translate(' + M.l + ',' + M.t + ')');
    var edges = [0.3, 0.8, 1.25, 1.6, 2, 2.5, 3, 4, 6, 10, 20, 100];
    var labels = ['<0.8', '0.8–1.25', '1.25–1.6', '1.6–2', '2–2.5', '2.5–3', '3–4', '4–6', '6–10', '10–20', '>20'];
    var bins = labels.map(function (l, i) { return { label: l, lo: edges[i], hi: edges[i + 1], n: CAT.filter(function (p) { return p.r >= edges[i] && p.r < edges[i + 1]; }).length, earth: edges[i] <= 1 && 1 < edges[i + 1] }; });
    var x = d3.scaleBand().domain(labels).range([0, W]).padding(0.16);
    var y = d3.scaleLinear().domain([0, d3.max(bins, function (d) { return d.n; }) * 1.08]).range([H, 0]);
    g.append('g').attr('transform', 'translate(0,' + H + ')').call(d3.axisBottom(x)).selectAll('text').attr('transform', 'rotate(-40)').attr('text-anchor', 'end').attr('dx', '-4').attr('dy', '8').attr('font-size', 9);
    g.append('g').call(d3.axisLeft(y).ticks(6));
    g.append('text').attr('x', -H / 2).attr('y', -40).attr('transform', 'rotate(-90)').attr('text-anchor', 'middle').attr('font-size', 11).attr('fill', '#5A6470').text('number of planets');
    g.append('text').attr('x', W / 2).attr('y', H + 60).attr('text-anchor', 'middle').attr('font-size', 11).attr('fill', '#5A6470').text('planet radius (× Earth)');
    var bars = g.selectAll('rect.bar').data(bins).join('rect').attr('class', 'bar')
      .attr('x', function (d) { return x(d.label); }).attr('width', x.bandwidth()).attr('y', H).attr('height', 0)
      .attr('fill', function (d) { return d.earth ? COL.earth : '#7FA8CE'; })
      .on('mousemove', function (ev, d) { showTip(ev, '<strong>' + d.label + ' R⊕</strong><br>' + d.n + ' planets' + (d.earth ? '<br>(Earth\'s size)' : '')); }).on('mouseleave', hideTip);
    var played = false;
    ctx.entryAnimation = function () { if (played) return; played = true; var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches; bars.transition().delay(function (d, i) { return reduced ? 0 : i * 55; }).duration(reduced ? 0 : 650).attr('y', function (d) { return y(d.n); }).attr('height', function (d) { return H - y(d.n); }); };
    var earthBin = bins.filter(function (d) { return d.earth; })[0];
    var peak = bins.slice().sort(function (a, b) { return b.n - a.n; })[0];
    chipActions[7] = {
      axes: function (b) { flashChip(b, function () { setInst(7, 'X = size range. Y = how many planets fall in it.', 'success'); }); },
      bars: function (b) { flashChip(b, function () { setInst(7, 'Tallest bar: the ' + peak.label + ' R⊕ range, with ' + peak.n + ' planets — “sub-Neptunes.”', 'success'); }); },
      earthbar: function (b) { flashChip(b, function () { bars.filter(function (d) { return d.earth; }).attr('fill', COL.accent).transition().duration(600).attr('fill', COL.earth); setInst(7, 'Earth’s size bar (' + earthBin.label + ' R⊕): ' + earthBin.n + ' planets — a minority, not the peak.', 'success'); }); },
      count: function (b) { flashChip(b, function () { setInst(7, 'Peak ' + peak.n + ' at ' + peak.label + ' R⊕ vs Earth-size ' + earthBin.n + '. Sub-Neptunes dominate.', 'success'); }); }
    };
  }

  function initStep8() {
    var ctx = makeScatter(8, { data: ORB, xField: 'au', yField: 'r', xReversed: false, includeEarth: true,
      xLabel: 'orbital distance from star (AU) — closer ← → farther', yLabel: 'planet radius (× Earth)', tips: true });
    var colored = false;
    function setColor(on) {
      colored = on;
      ctx.dots.transition().duration(700).attr('fill', function (d) { return on ? METHOD_COL[methodKey(d.meth)] : COL.dot; }).attr('fill-opacity', on ? 0.6 : 0.45);
      // legend
      ctx.fxG.selectAll('.leg').remove();
      if (on) {
        var keys = ['Transit', 'Radial Velocity', 'Microlensing', 'Imaging', 'Other'];
        var lg = ctx.fxG.append('g').attr('class', 'leg').attr('transform', 'translate(' + (ctx.W - 132) + ',6)');
        lg.append('rect').attr('x', -8).attr('y', -6).attr('width', 138).attr('height', keys.length * 16 + 10).attr('rx', 5).attr('fill', 'rgba(255,255,255,.9)').attr('stroke', '#DDE2E8');
        keys.forEach(function (k, i) {
          var row = lg.append('g').attr('transform', 'translate(0,' + (i * 16 + 4) + ')');
          row.append('circle').attr('r', 4).attr('cy', 4).attr('fill', METHOD_COL[k]);
          row.append('text').attr('x', 10).attr('y', 8).attr('font-size', 9.5).attr('fill', '#3B4756').text(k);
        });
      }
      ctx.boxSeen = on;
      setInst(8, on ? 'Each method finds a different region. No method reaches small, far-out worlds — the blind spot.' : 'Planets by size and orbital distance.', 'success');
    }
    utilActions[8] = utilActions[8] || {};
    utilActions[8]['method'] = function (b) { setColor(!colored); if (b) b.classList.toggle('active', colored); };
    var played = false;
    ctx.entryAnimation = function () { if (played) return; played = true; fadeIn(ctx.dots, ctx.cfg.dotR); };
    ctx.evidenceFx = function () { setColor(true); };
    chipActions[8] = {
      method: function (b) { flashChip(b, function () { setColor(true); }); },
      transit: function (b) { flashChip(b, function () { setColor(true); setInst(8, 'Transit (blue): finds close-in planets of all sizes — the dense left wall.', 'success'); }); },
      rv: function (b) { flashChip(b, function () { setColor(true); setInst(8, 'Radial velocity (orange): favors big planets, typical orbit near 1 AU.', 'success'); }); },
      bias: function (b) { flashChip(b, function () { setColor(true); setInst(8, 'The lower-right — small planets on wide orbits — is empty. Not absent in nature, just unseen.', 'success'); }); }
    };
  }

  function initStep9() {
    var ctx = buildInsScatter(9);
    drawBox(ctx);
    var spot = false;
    function spotlight() {
      if (spot) return; spot = true;
      ctx.dots.transition().duration(700).attr('fill', function (d) { return inBox(d) ? COL.gold : '#C9D2DC'; })
        .attr('fill-opacity', function (d) { return inBox(d) ? 1 : 0.25; }).attr('r', function (d) { return inBox(d) ? 4 : 1.4; });
      // label a few iconic candidates
      ICONIC.forEach(function (name) {
        var p = CAT.filter(function (d) { return d.n === name; })[0]; if (!p) return;
        pulseAt(ctx, p, COL.gold, 2);
        ctx.fxG.append('text').attr('x', ctx.fx(p) + 6).attr('y', ctx.fy(p) - 5).attr('font-size', 9.5).attr('font-weight', 700).attr('fill', COL.ink)
          .attr('paint-order', 'stroke').attr('stroke', '#fff').attr('stroke-width', 2.4).text(name).style('opacity', 0).transition().delay(300).duration(500).style('opacity', 1);
      });
      ensureBadge(9).innerHTML = '<strong style="color:' + COL.gold + '">' + BOX_N + '</strong> potentially habitable candidates — rare, but not zero';
      setInst(9, BOX_N + ' worlds in the box: rocky-sized, Earth-like starlight. The shortlist for life.', 'success');
    }
    utilActions[9] = utilActions[9] || {};
    utilActions[9]['reveal'] = function (b) { spotlight(); if (b) b.classList.add('active'); };
    ctx.evidenceFx = function () { spotlight(); };
    ctx.entryAnimation = function () {};
    chipActions[9] = Object.assign(insChips(ctx, 9), {
      box: function (b) { flashChip(b, function () { zoomToBox(ctx); setInst(9, 'The Earth-like box: ' + BOX_N + ' of ' + CAT_N.toLocaleString() + ' planets.', 'success'); }); },
      count: function (b) { flashChip(b, function () { spotlight(); }); }
    });
  }

  /* ---------- chip + util wiring ---------- */
  document.querySelectorAll('.chip').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var step = +btn.closest('.step').dataset.step, key = btn.dataset.chip;
      if (chipActions[step] && chipActions[step][key]) chipActions[step][key](btn);
    });
  });
  document.querySelectorAll('.util-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var step = +btn.closest('.step').dataset.step, key = btn.dataset.util;
      if (utilActions[step] && utilActions[step][key]) utilActions[step][key](btn);
    });
  });

  /* ---------- lazy init + entry animations ---------- */
  var initFns = { 1: initStep1, 2: initStep2, 3: initStep3, 4: initStep4, 5: initStep5, 6: initStep6, 7: initStep7, 8: initStep8, 9: initStep9 };
  function initStep4() {
    var ctx = buildInsScatter(4);
    var card = null;
    function openRecord(p) {
      if (card) card.remove();
      ctx.dots.attr('stroke', 'none').attr('r', ctx.cfg.dotR || 1.8);
      var node = ctx.dots.filter(function (d) { return d === p; });
      node.attr('stroke', COL.ink).attr('stroke-width', 1.4).attr('r', 4.5).raise();
      var cx = ctx.fx(p), cy = ctx.fy(p), left = cx > ctx.W / 2;
      card = ctx.fxG.append('g').attr('transform', 'translate(' + (left ? cx - 196 : cx + 14) + ',' + Math.max(8, Math.min(cy - 50, ctx.H - 150)) + ')');
      card.append('rect').attr('width', 182).attr('height', 144).attr('rx', 8).attr('fill', '#fff').attr('stroke', COL.ink).attr('filter', 'drop-shadow(0 4px 10px rgba(0,0,0,.18))');
      var rows = [['Planet', p.n], ['Radius', p.r + ' × Earth'], ['Mass', p.m != null ? p.m + ' × Earth' : 'not measured*'], ['Starlight', (p.ins >= 10 ? Math.round(p.ins) : p.ins) + ' × Earth'], ['Orbit', (p.au != null ? p.au + ' AU' : '—') + (p.per != null ? ' · ' + p.per + ' d' : '')], ['Found by', (p.meth || '—') + (p.yr ? ' · ' + p.yr : '')]];
      rows.forEach(function (r, i) { var g = card.append('g').attr('transform', 'translate(12,' + (20 + i * 21) + ')'); g.append('text').attr('font-size', 9).attr('fill', '#8A93A0').text(r[0].toUpperCase()); g.append('text').attr('x', 64).attr('font-size', 10).attr('font-weight', 600).attr('fill', COL.ink).text(String(r[1]).slice(0, 22)); });
      setInst(4, 'Record opened. Fields marked * were never measured for this planet — so we don’t invent them.', 'success');
    }
    ctx.dots.style('cursor', 'pointer').on('click', function (ev, d) { openRecord(d); });
    var played = false;
    ctx.entryAnimation = function () { if (played) return; played = true; var t = CAT.filter(function (d) { return d.n === 'TRAPPIST-1 e'; })[0] || CAT[0]; openRecord(t); };
    chipActions[4] = {
      size: function (b) { flashChip(b, function () { setInst(4, 'Radius is plotted up the chart — the only field every dot here is guaranteed to have.', 'success'); }); },
      orbit: function (b) { flashChip(b, function () { setInst(4, 'Orbit = period (days to circle the star) and distance (AU). Click any dot to see them.', 'success'); }); },
      method: function (b) { flashChip(b, function () { setInst(4, 'Method + year: how and when humans found it. We’ll use method in Step 8.', 'success'); }); },
      source: function (b) { flashChip(b, function () { setInst(4, 'Source: NASA Exoplanet Archive pscomppars. Cited in the Data panel.', 'success'); }); }
    };
  }

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
      var sample = CAT.slice().sort(function (a, b) { return a.ins - b.ins; }).slice(0, 30);
      var rows = sample.map(function (p) { return '<tr><td>' + p.n + '</td><td>' + p.r + '</td><td>' + (p.m != null ? p.m : '—') + '</td><td>' + (p.ins >= 10 ? Math.round(p.ins) : p.ins) + '</td><td>' + (p.au != null ? p.au : '—') + '</td><td>' + (p.meth || '—') + '</td><td>' + (p.yr || '—') + '</td></tr>'; }).join('');
      table.innerHTML = '<thead><tr><th>Planet</th><th>R⊕</th><th>M⊕</th><th>Starlight</th><th>AU</th><th>Method</th><th>Year</th></tr></thead><tbody>' + rows + '</tbody>' +
        '<caption style="caption-side:bottom;text-align:left;padding:10px 2px;font-size:12px;color:#5A6470">30 lowest-insolation planets shown. Real data — <a href="' + SRC_URL + '" target="_blank" rel="noopener" style="color:#1B5FAA">NASA Exoplanet Archive (pscomppars)</a>. ' + ALL.length.toLocaleString() + ' planets total.</caption>';
    }
    dataModal.hidden = false;
  });
  document.getElementById('data-close').addEventListener('click', function () { dataModal.hidden = true; });
  dataModal.addEventListener('click', function (ev) { if (ev.target === dataModal) dataModal.hidden = true; });
  document.getElementById('nav-explore').addEventListener('click', function () { document.getElementById('step-5').scrollIntoView({ behavior: 'smooth', block: 'start' }); });
  window.LESSON = { ALL: ALL, CAT: CAT, BOX_PLANETS: BOX_PLANETS, BOX_N: BOX_N, ctxs: ctxs, COL: COL };

  /* ============================================================
     PASS 2 — answer checking, gating, audio (data-agnostic)
     ============================================================ */
  var STORE_KEY = 'exo-state-v1';
  var state = { answers: {}, claim: '', notes: '', skips: {}, muted: false };
  try { var saved = JSON.parse(localStorage.getItem(STORE_KEY)); if (saved && typeof saved === 'object') { for (var sk in state) if (saved[sk] !== undefined) state[sk] = saved[sk]; } } catch (e) {}
  function saveState() { try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) {} }

  var ANSWERS = { 1: 'D', 2: 'B', 3: 'B', 4: 'B', 6: 'B', 7: 'B', 8: 'B' };
  var EXPLAIN = {
    1: 'Its size, its starlight, and the promise of thousands more like it are all reasons to look closer — real investigations stack every clue. That is why “all of these together” is the strongest answer.',
    2: 'With ' + CAT_N.toLocaleString() + ' planets plotted, clumps and empty regions appear that no single planet could reveal. The measurements don’t get less accurate — what changes is that <strong>patterns become visible</strong>.',
    3: 'Press Shuffle and the difference is unmistakable: random placement fills the chart evenly, while the real planets gather into clumps with wide empty gaps. The structure is real.',
    4: 'Each NASA record stores a radius, often a mass, an orbit, the starlight received, and the method and year of discovery. The chart draws two fields; the rest sit underneath. Blank fields were simply never measured — the lesson never fakes them.',
    6: 'Of ' + CAT_N.toLocaleString() + ' planets with measured size and starlight, only <strong>' + BOX_N + '</strong> are both rocky-sized (0.5–1.6 R⊕) and in the habitable starlight range (0.25–1.5× Earth). A small handful, clustered near Earth’s own spot.',
    7: 'The histogram peaks in the super-Earth / sub-Neptune range (around 2–4 R⊕). Earth-sized worlds near 1 R⊕ are a clear minority of the catalog — bigger planets dominate what we’ve found.',
    8: 'Each discovery method carves out its own region: transit and radial velocity find big, close planets most easily. Small, temperate worlds like Earth are the hardest to detect — so the empty corner is <strong>partly real and partly a blind spot</strong>.'
  };
  var FB = {
    1: { ok: 'Exactly — size, starlight, and the pattern to come, stacked together.', no: 'Each clue matters, but the power is in stacking all three reasons to investigate.' },
    2: { ok: 'Right: more planets, visible patterns. Watch the clumps emerge.', no: 'Watch the chart fill: one planet, then thousands. Patterns are what become visible.' },
    3: { ok: 'Yes — clumps and empty regions, not an even fill. Shuffle proves it.', no: 'Press Shuffle: random fills evenly. The real planets clump.' },
    4: { ok: 'Right — size, orbit, starlight, and how & when it was found.', no: 'Re-read the record card: many fields, not just one.' },
    6: { ok: 'Confirmed: only ' + BOX_N + ' planets sit in the Earth-like box.', no: 'Turn on the box: just ' + BOX_N + ' of ' + CAT_N.toLocaleString() + ' planets fall inside.' },
    7: { ok: 'Right — Earth-sized worlds are a minority; sub-Neptunes dominate.', no: 'Look at the bar heights: the peak is at 2–4 R⊕, not at Earth’s size.' },
    8: { ok: 'Exactly — partly rare in our sample, partly a detection blind spot.', no: 'Color by method: each finds big/close planets. Small temperate worlds are hardest to see.' }
  };

  var completed = {}, skipUnlocked = state.skips || {}, doneCount = 0, streak = 0;
  function updateProgress() { document.getElementById('progress-fill').style.width = (doneCount / 9 * 100) + '%'; document.getElementById('progress-label').textContent = doneCount + ' / 9 checks'; }
  function complete(n) { if (completed[n]) return; completed[n] = true; document.getElementById('step-' + n).dataset.done = '1'; doneCount++; updateProgress(); applyGates(); }

  var toastTimer = null;
  function showToast(msg, tone) {
    var toast = document.getElementById('celebrate-toast'); if (!toast) return;
    toast.className = 'celebrate-toast tone-' + (tone || 'good'); toast.textContent = msg; toast.hidden = false;
    toast.classList.remove('show'); void toast.offsetWidth; toast.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { toast.classList.remove('show'); setTimeout(function () { toast.hidden = true; }, 350); }, 2600);
  }
  function confettiBurst() {
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    var colors = ['#1B5FAA', '#E8704F', '#1E7D45', '#E2A33D', '#9C6FB8', '#3B82C4'];
    var wrap = document.createElement('div'); wrap.className = 'confetti-wrap';
    for (var i = 0; i < 70; i++) { var b = document.createElement('i'); b.className = 'confetti-bit'; b.style.left = (Math.random() * 100) + '%'; b.style.background = colors[i % colors.length]; b.style.animationDelay = (Math.random() * 0.3).toFixed(2) + 's'; b.style.animationDuration = (1.6 + Math.random() * 1.5).toFixed(2) + 's'; b.style.transform = 'rotate(' + Math.round(Math.random() * 360) + 'deg)'; wrap.appendChild(b); }
    document.body.appendChild(wrap); setTimeout(function () { wrap.remove(); }, 3600);
  }
  function celebrateStep(n, ok) {
    var fill = document.getElementById('progress-fill'); if (fill) { fill.classList.remove('pulse'); void fill.offsetWidth; fill.classList.add('pulse'); }
    if (ok && (n === 9 || doneCount === 9)) { showToast('Search complete — you found the shortlist for life.', 'good'); confettiBurst(); return; }
    if (!ok) { showToast('Answer revealed — Step ' + n + ' logged. Keep going.', 'muted'); return; }
    var msg;
    if (doneCount === 3) msg = 'Three down — the patterns are emerging.';
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
    if (n === 6 && (!ctxs[6] || !ctxs[6].boxSeen)) { setInst(6, 'Evidence first: turn on the Earth-like box and watch the planets inside light up, then check.', 'error'); return; }
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

  var GEO_TERMS = ['clump', 'box', 'band', 'gap', 'cluster', 'corner', 'region', 'zone', 'empty', 'handful', 'group'];
  var PATTERN_TERMS = ['most', 'many', 'majority', 'rare', 'few', 'almost all', 'percent', '%', 'minority', 'only', 'thousands', 'handful'];
  function gradeClaim(btn) {
    var t = document.getElementById('claim-text').value.toLowerCase();
    if (t.trim().length < 15) { setInst(9, 'Write your claim first — a sentence or two in the box on the right.', 'warn'); return; }
    var hasGeo = GEO_TERMS.some(function (w) { return t.indexOf(w) !== -1; });
    var hasNum = /\d/.test(t) || PATTERN_TERMS.some(function (w) { return t.indexOf(w) !== -1; });
    var fb = document.querySelector('#mcq-9 .mcq-feedback');
    if (!hasGeo || !hasNum) {
      fb.hidden = false; fb.className = 'mcq-feedback bad'; var missing = [];
      if (!hasGeo) missing.push('a <strong>shape word</strong> (clump, box, band, gap…)');
      if (!hasNum) missing.push('a <strong>number or pattern observation</strong> (a count like “' + BOX_N + ' of ' + CAT_N.toLocaleString() + '”, or a word like “rare”)');
      fb.innerHTML = 'Almost — your claim still needs ' + missing.join(' and ') + '. The Count chip gives you a real number to cite.';
      setInst(9, 'Strengthen the claim: pair a shape word with a number or pattern word, like a scientist would.', 'error'); return;
    }
    renderClaimAccepted(false);
  }
  function renderClaimAccepted(silent) {
    var fb = document.querySelector('#mcq-9 .mcq-feedback'); var btn = document.querySelector('#mcq-9 .check-btn');
    fb.hidden = false; fb.className = 'mcq-feedback good';
    fb.innerHTML = '<strong>That is a claim with evidence.</strong> You named a shape and backed it with a number — exactly how astronomers argue. In this real data: ' + BOX_N + ' of ' + CAT_N.toLocaleString() + ' planets sit in the Earth-like box, Earth-sized worlds are a minority, and small temperate planets are the hardest to detect.';
    btn.disabled = true; btn.textContent = 'Claim checked ✓';
    setInst(9, 'Claim accepted — shape word plus pattern evidence. Now spotlight the candidates.', 'success');
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
  function applyGates() {
    for (var n = 1; n <= 9; n++) { var sec = document.getElementById('step-' + n); var locked = !isUnlocked(n); sec.classList.toggle('locked', locked); if (!locked) { var pop = sec.querySelector('.gate-popup'); if (pop) pop.remove(); var note = sec.querySelector('.gate-note'); if (note) note.remove(); } }
    revealGate();
  }

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
    var RKEY = 'exo-review-v1'; var comments = {}; try { comments = JSON.parse(localStorage.getItem(RKEY) || '{}') || {}; } catch (e) { comments = {}; }
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
    panel.querySelector('#rv-export').addEventListener('click', function () { var out = { lesson: 'Are We Alone?', exported: new Date().toISOString(), comments: {} }; for (var n = 1; n <= 9; n++) { if ((comments[n] || '').trim()) out.comments['step' + n] = { title: stepTitle(n), comment: comments[n] }; } var blob = new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' }); var url = URL.createObjectURL(blob); var a = document.createElement('a'); a.href = url; a.download = 'are-we-alone-review.json'; a.click(); setTimeout(function () { URL.revokeObjectURL(url); }, 1000); });
    reviewSetStep = function (n) { if (n !== activeStep) loadStep(n); };
    loadStep(activeStep); updateBadge();
  })();

  applyGates(); revealGate(); updateScrollCue();
})();
