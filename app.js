/* ============================================================
   Map Earth's Anger — Savvas Data Show classroom prototype
   Pass 1: lesson shell + all 9 D3 visualizations
   Earthquake dots are REAL USGS catalog records: a seeded
   random sample of 800 M5.5+ events (2000–2025) plus the
   1995 Kobe mainshock, vendored locally in data/quakes.js.
   ============================================================ */
(function () {
  'use strict';

  /* ---------- design tokens ---------- */
  var COL = {
    ocean: '#0F406C',
    land: '#C5D4AD',
    landStroke: '#97A883',
    quake: '#E8704F',
    quakeDeepStroke: '#8C3B24',
    ring: '#F5B57E',
    hazard: '#E2A33D',
    primary: '#1B5FAA',
    ink: '#1F2933',
    depthShallow: '#3B82C4',
    depthMid: '#E2A33D',
    depthDeep: '#8E5BA6'
  };

  /* ---------- deterministic PRNG (seeded with the Kobe date) ---------- */
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  var rand = mulberry32(19950117);

  /* ---------- geography: Ring of Fire + hazard zones (simplified) ---------- */
  var RING_COORDS = [
    [167, -46], [175, -40], [179, -33], [-176, -24], [-173, -17],
    [-178, -13], [170, -14], [165, -11], [160, -9], [155, -7], [151, -5],
    [147, -4], [140, -2], [134, -1], [128, 0], [126, 5], [124, 9],
    [122, 14], [121, 19], [122, 24], [125, 27], [129, 30], [132, 32],
    [135, 33.5], [138, 34.5], [141, 36.5], [143, 39], [145, 43],
    [149, 45.5], [153, 48], [157, 51], [161, 54], [164, 56],
    [170, 54], [176, 52.5], [-178, 51.5], [-172, 52], [-166, 53.5],
    [-160, 55.5], [-153, 58], [-147, 60.5], [-141, 59.8], [-136, 57.5],
    [-132, 54], [-129, 51], [-126, 48], [-124.7, 44.5], [-124.4, 40.5],
    [-121.5, 36.5], [-118, 33.5], [-114, 29.5], [-110, 25], [-106, 20.5],
    [-102, 17.5], [-97, 15.5], [-92, 13.5], [-88, 12], [-85, 9.5],
    [-82, 7], [-80, 3], [-79, -2], [-78.5, -7], [-76, -12], [-73.5, -17],
    [-71.5, -22], [-70.8, -27], [-71.5, -33], [-73, -38], [-74, -43],
    [-75, -48], [-74.5, -52]
  ];
  var RING_GEO = { type: 'LineString', coordinates: RING_COORDS };

  var HAZARD_ZONES = [
    { name: 'Nankai zone (Japan)', coords: [[131, 30.5], [133.5, 31.8], [136, 33], [138.5, 34.3]], label: [136.5, 30.2] },
    { name: 'Cascadia', coords: [[-128, 50], [-126, 47.5], [-124.8, 44.5], [-124.4, 41]], label: [-122.5, 51.5] },
    { name: 'Chile–Peru', coords: [[-80, -3], [-78, -10], [-75, -16], [-72, -24], [-71.5, -33], [-73.5, -42]], label: [-66, -28] },
    { name: 'Aleutians', coords: [[163, 55], [170, 52.5], [178, 51.5], [-172, 52], [-165, 54], [-158, 56]], label: [-178, 46.5] },
    { name: 'Philippines–Indonesia', coords: [[120, 18], [124, 12], [126, 7], [127, 2], [122, -3], [116, -7], [106, -9], [98, -2], [95, 4]], label: [104, -16] }
  ];

  var ALPIDE_COORDS = [
    [27, 38], [35, 38], [44, 38], [52, 34], [60, 32], [70, 36],
    [78, 34], [86, 28], [95, 24], [97, 18]
  ];

  var KOBE = { lon: 135.19, lat: 34.69 };

  /* ---------- dataset: real USGS records (vendored) ---------- */
  function segLengths(coords) {
    var lens = [], total = 0;
    for (var i = 0; i < coords.length - 1; i++) {
      var a = coords[i], b = coords[i + 1];
      var lon2 = b[0];
      if (lon2 - a[0] > 180) lon2 -= 360;
      if (lon2 - a[0] < -180) lon2 += 360;
      var dx = (lon2 - a[0]) * Math.cos((a[1] + b[1]) / 2 * Math.PI / 180);
      var dy = b[1] - a[1];
      var L = Math.sqrt(dx * dx + dy * dy);
      lens.push(L); total += L;
    }
    return { lens: lens, total: total };
  }

  function pointAlong(coords, lens, t) {
    var target = t * lens.total, acc = 0;
    for (var i = 0; i < lens.lens.length; i++) {
      if (acc + lens.lens[i] >= target) {
        var f = (target - acc) / lens.lens[i];
        var a = coords[i], b = coords[i + 1];
        var lon2 = b[0];
        if (lon2 - a[0] > 180) lon2 -= 360;
        if (lon2 - a[0] < -180) lon2 += 360;
        var lon = a[0] + (lon2 - a[0]) * f;
        var lat = a[1] + (b[1] - a[1]) * f;
        if (lon > 180) lon -= 360;
        if (lon < -180) lon += 360;
        return [lon, lat];
      }
      acc += lens.lens[i];
    }
    return coords[coords.length - 1];
  }

  function depthGroup(depth) {
    return depth < 70 ? 'shallow' : depth < 300 ? 'intermediate' : 'deep';
  }

  /* densely resample the Ring path once, so each quake can be
     classified as on/off the Ring by great-circle distance */
  var RING_DENSE = (function () {
    var lens = segLengths(RING_COORDS), pts = [];
    for (var t = 0; t <= 1; t += 0.002) pts.push(pointAlong(RING_COORDS, lens, t));
    return pts;
  })();
  function gcDistDeg(a, b) {
    return d3.geoDistance(a, b) * 180 / Math.PI;
  }
  function nearRing(lon, lat) {
    for (var i = 0; i < RING_DENSE.length; i++) {
      if (gcDistDeg([lon, lat], RING_DENSE[i]) < 7) return true;
    }
    return false;
  }

  var QUAKES = window.QUAKE_DATA.map(function (d, i) {
    return {
      id: i, lon: d.lon, lat: d.lat, mag: d.mag, depth: d.depth,
      date: d.date, place: d.place, name: d.name || null,
      src: nearRing(d.lon, d.lat) ? 'ring' : 'other',
      // a random alternate position, used by the “Compare” chip (random vs real)
      rlon: -175 + rand() * 350,
      rlat: -55 + rand() * 118
    };
  });

  var KOBE_Q = QUAKES[0];
  var M6 = QUAKES.filter(function (d) { return d.mag >= 6; });
  var M6_ON_RING = M6.filter(function (d) { return d.src === 'ring'; });

  /* ---------- tiny DOM helpers ---------- */
  var tooltip = document.getElementById('map-tooltip');
  function showTip(event, html) {
    tooltip.innerHTML = html;
    tooltip.hidden = false;
    var x = event.clientX + 14, y = event.clientY + 10;
    if (x + 230 > window.innerWidth) x = event.clientX - 235;
    tooltip.style.left = x + 'px';
    tooltip.style.top = y + 'px';
  }
  function hideTip() { tooltip.hidden = true; }

  function setInst(n, html, tone) {
    var bar = document.getElementById('inst-' + n);
    if (!bar) return;
    bar.innerHTML = html;
    bar.className = 'instruction-bar' + (tone ? ' tone-' + tone : '');
  }
  function stepDone(n) {
    var sec = document.getElementById('step-' + n);
    return !!(sec && sec.dataset.done);
  }

  function frameOf(n) { return document.querySelector('#viz-' + n).closest('.viz-frame'); }

  function ensureBadge(n) {
    var frame = frameOf(n);
    var b = frame.querySelector('.viz-badge');
    if (!b) {
      b = document.createElement('div');
      b.className = 'viz-badge';
      b.textContent = 'Real data — USGS earthquake catalog (sample of 800, M5.5+, 2000–2025)';
      frame.appendChild(b);
    }
    return b;
  }
  function ensureBanner(n) {
    var frame = frameOf(n);
    var b = frame.querySelector('.freq-banner');
    if (!b) {
      b = document.createElement('div');
      b.className = 'freq-banner';
      frame.appendChild(b);
    }
    return b;
  }

  function fmtQuake(d) {
    return '<strong>' + (d.name ? d.name + ' — ' : '') + 'M' + d.mag.toFixed(1) + '</strong><br>' +
      (d.place ? d.place + '<br>' : '') +
      Math.abs(d.lat).toFixed(1) + '°' + (d.lat >= 0 ? 'N' : 'S') + ', ' +
      Math.abs(d.lon).toFixed(1) + '°' + (d.lon >= 0 ? 'E' : 'W') + '<br>' +
      'Depth ' + d.depth + ' km · ' + d.date + '<br>' +
      '<em>USGS catalog record</em>';
  }

  function rOf(d) { return 1.8 + (d.mag - 5.5) * 1.15; }

  /* ---------- shared map machinery ---------- */
  var LAND110 = topojson.feature(window.LAND_110M, window.LAND_110M.objects.land);
  var LAND50 = topojson.feature(window.LAND_50M, window.LAND_50M.objects.land);

  var ctxs = {};          // per-step viz context
  var chipActions = {};   // chipActions[step][key] = fn(btn)
  var utilActions = {};   // utilActions[step][util] = fn(btn)

  function attachDotTips(sel) {
    sel.on('mouseover', function (event, d) { showTip(event, fmtQuake(d.d || d)); })
      .on('mousemove', function (event, d) { showTip(event, fmtQuake(d.d || d)); })
      .on('mouseout', hideTip)
      .on('click', function (event, d) {       // touch devices have no hover
        event.stopPropagation();
        showTip(event, fmtQuake(d.d || d));
      });
  }
  document.addEventListener('click', hideTip);

  function makeFlatMap(n, opts) {
    opts = opts || {};
    var W = 760, H = 470;
    var container = d3.select('#viz-' + n);
    var svg = container.append('svg').attr('viewBox', '0 0 ' + W + ' ' + H)
      .attr('role', 'img');
    var projection = d3.geoNaturalEarth1();
    projection.fitSize([W, H], { type: 'Sphere' });
    var path = d3.geoPath(projection);
    var root = svg.append('g').attr('class', 'zoom-root');

    root.append('path').attr('d', path({ type: 'Sphere' }))
      .attr('fill', COL.ocean);
    var grat = root.append('path')
      .attr('d', path(d3.geoGraticule10()))
      .attr('fill', 'none').attr('stroke', '#fff').attr('stroke-opacity', 0.07)
      .attr('stroke-width', 0.6);
    root.append('path').datum(LAND110)
      .attr('d', path)
      .attr('fill', COL.land).attr('stroke', COL.landStroke).attr('stroke-width', 0.7);

    var overlay = root.append('g');
    var dotsG = root.append('g');
    var fxG = root.append('g');

    var zoom = d3.zoom().scaleExtent([1, 8])
      .translateExtent([[0, 0], [W, H]])
      .filter(function (ev) { return ev.type !== 'wheel' && ev.type !== 'dblclick'; })
      .on('zoom', function (ev) { root.attr('transform', ev.transform); });
    svg.call(zoom);

    var ctx = {
      n: n, W: W, H: H, svg: svg, root: root, projection: projection, path: path,
      grat: grat, overlay: overlay, dotsG: dotsG, fxG: fxG, zoom: zoom
    };

    utilActions[n] = utilActions[n] || {};
    utilActions[n]['zoom-in'] = function () { svg.transition().duration(350).call(zoom.scaleBy, 1.6); };
    utilActions[n]['zoom-out'] = function () { svg.transition().duration(350).call(zoom.scaleBy, 1 / 1.6); };
    utilActions[n]['reset'] = function () { svg.transition().duration(450).call(zoom.transform, d3.zoomIdentity); };
    return ctx;
  }

  function drawQuakeDots(ctx, data, opts) {
    opts = opts || {};
    var sel = ctx.dotsG.selectAll('circle.quake')
      .data(data, function (d) { return d.id; })
      .join('circle')
      .attr('class', 'quake')
      .attr('cx', function (d) { return ctx.projection([d.lon, d.lat])[0]; })
      .attr('cy', function (d) { return ctx.projection([d.lon, d.lat])[1]; })
      .attr('r', opts.r || rOf)
      .attr('fill', COL.quake)
      .attr('fill-opacity', opts.opacity != null ? opts.opacity : 0.78)
      .attr('stroke', 'rgba(255,255,255,0.55)')
      .attr('stroke-width', 0.5);
    attachDotTips(sel);
    return sel;
  }

  function drawRingPath(ctx, opts) {
    opts = opts || {};
    var p = ctx.overlay.append('path').datum(RING_GEO)
      .attr('d', ctx.path)
      .attr('fill', 'none')
      .attr('stroke', COL.ring)
      .attr('stroke-width', opts.width || 3)
      .attr('stroke-linecap', 'round')
      .attr('stroke-opacity', opts.opacity != null ? opts.opacity : 0.9)
      .style('filter', 'drop-shadow(0 0 2px rgba(15,28,40,0.9))');
    if (opts.animate) {
      var node = p.node(), L = node.getTotalLength();
      p.attr('stroke-dasharray', L + ' ' + L).attr('stroke-dashoffset', L)
        .transition().duration(opts.duration || 2200).ease(d3.easeCubicInOut)
        .attr('stroke-dashoffset', 0)
        .on('end', function () { p.attr('stroke-dasharray', opts.dash || null); });
    } else if (opts.dash) {
      p.attr('stroke-dasharray', opts.dash);
    }
    return p;
  }

  function drawHazardZones(ctx) {
    var g = ctx.overlay.append('g');
    // real plate boundaries (PB2002, Bird 2003) as the base layer
    if (window.PLATE_BOUNDARIES) {
      g.append('path').datum(window.PLATE_BOUNDARIES)
        .attr('d', ctx.path)
        .attr('fill', 'none')
        .attr('stroke', COL.hazard)
        .attr('stroke-width', 1.1)
        .attr('stroke-opacity', 0.65);
    }
    HAZARD_ZONES.forEach(function (z) {
      g.append('path').datum({ type: 'LineString', coordinates: z.coords })
        .attr('d', ctx.path)
        .attr('fill', 'none')
        .attr('stroke', COL.hazard)
        .attr('stroke-width', 7)
        .attr('stroke-opacity', 0.45)
        .attr('stroke-linecap', 'round');
      var lp = ctx.projection(z.label);
      g.append('text')
        .attr('x', lp[0]).attr('y', lp[1])
        .attr('text-anchor', 'middle')
        .attr('font-size', 9.5)
        .attr('font-weight', 600)
        .attr('fill', '#FCE8CF')
        .attr('stroke', 'rgba(15,64,108,0.85)')
        .attr('stroke-width', 2.6)
        .attr('paint-order', 'stroke')
        .text(z.name);
    });
    return g;
  }

  /* chip toggle helper: keeps .active in sync with on/off callbacks */
  function toggleChip(btn, onFn, offFn) {
    var on = btn.classList.toggle('active');
    if (on) onFn(); else offFn();
    return on;
  }
  function flashChip(btn, fn) {
    btn.classList.add('active');
    fn();
    setTimeout(function () { btn.classList.remove('active'); }, 1300);
  }

  /* pulse rings effect at a projected point */
  function pulseAt(ctx, lonlat, color, times) {
    var p = ctx.projection(lonlat);
    if (!p) return;
    for (var i = 0; i < (times || 2); i++) {
      ctx.fxG.append('circle')
        .attr('cx', p[0]).attr('cy', p[1]).attr('r', 4)
        .attr('fill', 'none').attr('stroke', color || '#fff').attr('stroke-width', 2)
        .attr('opacity', 0.9)
        .transition().delay(i * 450).duration(1100).ease(d3.easeCubicOut)
        .attr('r', 26).attr('opacity', 0)
        .remove();
    }
  }

  /* ============================================================
     STEP 1 — Japan close-up (Mercator)
     ============================================================ */
  function initStep1() {
    var n = 1, W = 760, H = 470;
    var svg = d3.select('#viz-1').append('svg').attr('viewBox', '0 0 ' + W + ' ' + H);
    var region = { type: 'MultiPoint', coordinates: [[126, 27], [149, 27], [149, 44.5], [126, 44.5]] };
    var projection = d3.geoMercator().fitSize([W, H], region);
    var path = d3.geoPath(projection);
    var root = svg.append('g');

    root.append('rect').attr('width', W).attr('height', H).attr('fill', COL.ocean);
    var grat = root.append('path')
      .attr('d', path(d3.geoGraticule().step([2, 2])()))
      .attr('fill', 'none').attr('stroke', '#fff').attr('stroke-opacity', 0.08).attr('stroke-width', 0.6);
    root.append('path').datum(LAND50)
      .attr('d', path)
      .attr('fill', COL.land).attr('stroke', COL.landStroke).attr('stroke-width', 0.8);

    var overlay = root.append('g');
    var dotsG = root.append('g');
    var fxG = root.append('g');

    // simplified Nankai boundary zone: wide soft band + dashed centreline
    var nankai = { type: 'LineString', coordinates: [[130.5, 30.2], [133, 31.4], [135.5, 32.6], [138, 33.6], [140.5, 34.4]] };
    var band = overlay.append('path').datum(nankai).attr('d', path)
      .attr('fill', 'none').attr('stroke', COL.hazard).attr('stroke-width', 18)
      .attr('stroke-opacity', 0.20).attr('stroke-linecap', 'round');
    var bandLine = overlay.append('path').datum(nankai).attr('d', path)
      .attr('fill', 'none').attr('stroke', COL.hazard).attr('stroke-width', 1.6)
      .attr('stroke-dasharray', '6 5').attr('stroke-opacity', 0.85);
    var bandLabelP = projection([139.5, 32.6]);
    var bandLabel = overlay.append('text')
      .attr('x', bandLabelP[0]).attr('y', bandLabelP[1])
      .attr('font-size', 11).attr('font-weight', 600)
      .attr('fill', '#FCE8CF')
      .attr('stroke', 'rgba(15,64,108,0.85)').attr('stroke-width', 3).attr('paint-order', 'stroke')
      .text('simplified boundary zone');

    // real recent quakes near Japan
    var nearJapan = QUAKES.filter(function (d) {
      return d.id !== 0 && d.lon > 127 && d.lon < 148 && d.lat > 28 && d.lat < 44 && d.mag >= 6.0;
    }).slice(0, 14);
    var dots = dotsG.selectAll('circle').data(nearJapan).join('circle')
      .attr('cx', function (d) { return projection([d.lon, d.lat])[0]; })
      .attr('cy', function (d) { return projection([d.lon, d.lat])[1]; })
      .attr('r', function (d) { return rOf(d) + 1; })
      .attr('fill', COL.quake).attr('fill-opacity', 0.75)
      .attr('stroke', 'rgba(255,255,255,0.55)').attr('stroke-width', 0.5);
    attachDotTips(dots);

    // Kobe marker with a slow repeating pulse
    var kp = projection([KOBE.lon, KOBE.lat]);
    var kobeG = root.append('g');
    kobeG.append('circle').attr('cx', kp[0]).attr('cy', kp[1]).attr('r', 6)
      .attr('fill', COL.quake).attr('stroke', '#fff').attr('stroke-width', 1.8);
    var pulse = kobeG.append('circle').attr('cx', kp[0]).attr('cy', kp[1]).attr('r', 6)
      .attr('fill', 'none').attr('stroke', COL.quake).attr('stroke-width', 2);
    (function loop() {
      pulse.attr('r', 6).attr('opacity', 0.9)
        .transition().duration(1800).ease(d3.easeCubicOut)
        .attr('r', 24).attr('opacity', 0)
        .on('end', loop);
    })();
    kobeG.append('text').attr('x', kp[0] + 12).attr('y', kp[1] - 10)
      .attr('font-size', 13).attr('font-weight', 600).attr('fill', '#fff')
      .attr('stroke', 'rgba(15,64,108,0.9)').attr('stroke-width', 3.4).attr('paint-order', 'stroke')
      .text('Kobe');
    kobeG.append('text').attr('x', kp[0] + 12).attr('y', kp[1] + 5)
      .attr('font-size', 10.5).attr('fill', '#E7EEF5')
      .attr('stroke', 'rgba(15,64,108,0.9)').attr('stroke-width', 3).attr('paint-order', 'stroke')
      .text('135.19°E, 34.69°N');

    var zoom = d3.zoom().scaleExtent([1, 8])
      .translateExtent([[0, 0], [W, H]])
      .filter(function (ev) { return ev.type !== 'wheel' && ev.type !== 'dblclick'; })
      .on('zoom', function (ev) { root.attr('transform', ev.transform); });
    svg.call(zoom);

    var ctx = { n: n, W: W, H: H, svg: svg, root: root, projection: projection, path: path, overlay: overlay, dotsG: dotsG, fxG: fxG, zoom: zoom };
    ctxs[1] = ctx;

    utilActions[1] = {
      'zoom-in': function () { svg.transition().duration(350).call(zoom.scaleBy, 1.6); },
      'zoom-out': function () { svg.transition().duration(350).call(zoom.scaleBy, 1 / 1.6); },
      'reset': function () { svg.transition().duration(450).call(zoom.transform, d3.zoomIdentity); }
    };

    // entry moment: the ground moves, then a seismogram draws itself
    var entryPlayed = false;
    ctx.entryAnimation = function () {
      if (entryPlayed) return; entryPlayed = true;
      var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      var frame = frameOf(1);
      if (!reduced) {
        frame.classList.add('quake-shake');
        setTimeout(function () { frame.classList.remove('quake-shake'); }, 950);
      }
      var sg = fxG.append('g').attr('transform', 'translate(14,14)');
      sg.append('rect').attr('width', 190).attr('height', 50).attr('rx', 6)
        .attr('fill', 'rgba(255,255,255,0.93)').attr('stroke', '#C9D1DA');
      sg.append('text').attr('x', 9).attr('y', 14)
        .attr('font-size', 9).attr('font-weight', 600).attr('fill', '#52606D')
        .text('SEISMOGRAM · KOBE · 05:46:52');
      var pts = [];
      for (var x = 0; x <= 172; x += 2) {
        var a = x < 56 ? 1.3 : x < 74 ? 14 * (x - 56) / 18 : 14 * Math.exp(-(x - 74) / 26);
        pts.push([x + 9, 33 + Math.sin(x * 1.9) * a * 0.6 + Math.sin(x * 0.7) * a * 0.4]);
      }
      var trace = sg.append('path')
        .attr('d', 'M' + pts.map(function (p) { return p.join(','); }).join('L'))
        .attr('fill', 'none').attr('stroke', COL.quake).attr('stroke-width', 1.4);
      var L = trace.node().getTotalLength();
      trace.attr('stroke-dasharray', L + ' ' + L).attr('stroke-dashoffset', L)
        .transition().duration(reduced ? 0 : 2400).ease(d3.easeLinear)
        .attr('stroke-dashoffset', 0);
    };

    // evidence highlight when the step-1 check is submitted
    ctx.evidenceFx = function () {
      band.transition().duration(450).attr('stroke-opacity', 0.5).attr('stroke-width', 26)
        .transition().duration(1000).attr('stroke-opacity', 0.20).attr('stroke-width', 18);
      pulseAt(ctx, [KOBE.lon, KOBE.lat], '#fff', 3);
      dots.transition().duration(350).attr('r', function (d) { return rOf(d) + 4; })
        .transition().duration(700).attr('r', function (d) { return rOf(d) + 1; });
    };

    // --- chips ---
    var crossG = null;
    chipActions[1] = {
      coordinates: function (btn) {
        toggleChip(btn, function () {
          crossG = fxG.append('g');
          crossG.append('line').attr('x1', kp[0]).attr('y1', kp[1]).attr('x2', kp[0]).attr('y2', 0)
            .attr('stroke', '#fff').attr('stroke-width', 1.2).attr('stroke-dasharray', '4 4').attr('opacity', 0)
            .transition().duration(500).attr('opacity', 0.85);
          crossG.append('line').attr('x1', kp[0]).attr('y1', kp[1]).attr('x2', 0).attr('y2', kp[1])
            .attr('stroke', '#fff').attr('stroke-width', 1.2).attr('stroke-dasharray', '4 4').attr('opacity', 0)
            .transition().duration(500).attr('opacity', 0.85);
          crossG.append('text').attr('x', kp[0] + 5).attr('y', 16)
            .attr('font-size', 11.5).attr('font-weight', 600).attr('fill', '#fff')
            .attr('stroke', 'rgba(15,64,108,0.9)').attr('stroke-width', 3).attr('paint-order', 'stroke')
            .text('longitude 135.19°E');
          crossG.append('text').attr('x', 8).attr('y', kp[1] - 7)
            .attr('font-size', 11.5).attr('font-weight', 600).attr('fill', '#fff')
            .attr('stroke', 'rgba(15,64,108,0.9)').attr('stroke-width', 3).attr('paint-order', 'stroke')
            .text('latitude 34.69°N');
          setInst(1, 'Two numbers, one point: longitude runs east–west, latitude north–south. Together they pin Kobe to one spot.', 'info');
        }, function () {
          if (crossG) { crossG.remove(); crossG = null; }
          setInst(1, 'Find the labeled dot. That is Kobe — 135.19°E, 34.69°N.');
        });
      },
      grid: function (btn) {
        toggleChip(btn, function () {
          grat.transition().duration(400).attr('stroke-opacity', 0.35).attr('stroke-width', 1);
          setInst(1, 'The grid is the coordinate system itself — every 2° of longitude and latitude.', 'info');
        }, function () {
          grat.transition().duration(400).attr('stroke-opacity', 0.08).attr('stroke-width', 0.6);
          setInst(1, 'Find the labeled dot. That is Kobe — 135.19°E, 34.69°N.');
        });
      },
      boundary: function (btn) {
        flashChip(btn, function () {
          band.transition().duration(500).attr('stroke-opacity', 0.5).attr('stroke-width', 26)
            .transition().duration(900).attr('stroke-opacity', 0.20).attr('stroke-width', 18);
          bandLabel.transition().duration(300).attr('font-size', 14)
            .transition().duration(900).attr('font-size', 11);
          setInst(1, 'Kobe sits beside a simplified boundary zone — a place where huge blocks of crust meet and strain builds up.', 'info');
        });
      },
      sample: function (btn) {
        flashChip(btn, function () {
          ensureBadge(1).classList.add('show');
          setTimeout(function () { ensureBadge(1).classList.remove('show'); }, 3500);
          dots.transition().duration(350).attr('r', function (d) { return rOf(d) + 4; })
            .transition().duration(600).attr('r', function (d) { return rOf(d) + 1; });
          nearJapan.forEach(function (d, i) {
            setTimeout(function () { pulseAt(ctx, [d.lon, d.lat], COL.quake, 1); }, i * 120);
          });
          setInst(1, 'These dots are real M6+ earthquakes near Japan from the USGS catalog, 2000–2025. Hover any dot to read its record.', 'info');
        });
      }
    };
  }

  /* ============================================================
     STEP 2 — draggable orthographic globe
     ============================================================ */
  function initStep2() {
    var n = 2, W = 760, H = 520;
    var svg = d3.select('#viz-2').append('svg').attr('viewBox', '0 0 ' + W + ' ' + H);
    var baseScale = Math.min(W, H) / 2 - 14;
    var homeRotate = [-140, 5];
    var projection = d3.geoOrthographic()
      .translate([W / 2, H / 2])
      .clipAngle(90)
      .rotate([-KOBE.lon, -KOBE.lat])      // start zoomed on Japan
      .scale(baseScale * 3.4);
    var path = d3.geoPath(projection);
    var root = svg.append('g');

    var sphere = root.append('path').attr('fill', COL.ocean).attr('stroke', '#0A2E4E').attr('stroke-width', 1.5);
    var grat = root.append('path')
      .attr('fill', 'none').attr('stroke', '#fff').attr('stroke-opacity', 0.10).attr('stroke-width', 0.6);
    var land = root.append('path').datum(LAND110)
      .attr('fill', COL.land).attr('stroke', COL.landStroke).attr('stroke-width', 0.7);
    var coordG = root.append('g');   // coordinate chip lines
    var dotsG = root.append('g');
    var kobeMarkG = root.append('g');

    var graticule = d3.geoGraticule10();
    var kobeMeridian = { type: 'LineString', coordinates: d3.range(-85, 86, 5).map(function (la) { return [KOBE.lon, la]; }) };
    var kobeParallel = { type: 'LineString', coordinates: d3.range(-180, 181, 5).map(function (lo) { return [lo, KOBE.lat]; }) };

    var dotData = QUAKES.map(function (d) { return { type: 'Point', coordinates: [d.lon, d.lat], d: d }; });
    var dotsVisible = false, manyMode = true, coordsOn = false;

    function redraw() {
      sphere.attr('d', path({ type: 'Sphere' }));
      grat.attr('d', path(graticule));
      land.attr('d', path);
      if (dotsVisible) {
        path.pointRadius(function (p) { return rOf(p.d); });
        dotsG.selectAll('path.gdot').attr('d', path);
        path.pointRadius(4.5);
      }
      if (coordsOn) {
        coordG.selectAll('path').attr('d', path);
      }
      // Kobe marker: hide when on the far side
      var r = projection.rotate();
      var visible = d3.geoDistance([KOBE.lon, KOBE.lat], [-r[0], -r[1]]) < Math.PI / 2 - 0.02;
      var p = projection([KOBE.lon, KOBE.lat]);
      kobeMarkG.attr('display', visible && p ? null : 'none');
      if (visible && p) {
        kobeMarkG.select('circle').attr('cx', p[0]).attr('cy', p[1]);
        kobeMarkG.selectAll('text').attr('x', p[0] + 11).each(function (d, i) {
          d3.select(this).attr('y', p[1] + (i === 0 ? -8 : 6));
        });
      }
    }

    kobeMarkG.append('circle').attr('r', 5.5)
      .attr('fill', COL.quake).attr('stroke', '#fff').attr('stroke-width', 1.6);
    kobeMarkG.append('text')
      .attr('font-size', 12.5).attr('font-weight', 600).attr('fill', '#fff')
      .attr('stroke', 'rgba(10,46,78,0.9)').attr('stroke-width', 3.2).attr('paint-order', 'stroke')
      .text('Kobe');
    kobeMarkG.append('text')
      .attr('font-size', 10).attr('fill', '#E7EEF5')
      .attr('stroke', 'rgba(10,46,78,0.9)').attr('stroke-width', 3).attr('paint-order', 'stroke')
      .text('135.19°E, 34.69°N');

    redraw();

    // drag to rotate
    var drag = d3.drag()
      .on('drag', function (event) {
        var r = projection.rotate();
        var sens = 75 / projection.scale();
        projection.rotate([r[0] + event.dx * sens, Math.max(-88, Math.min(88, r[1] - event.dy * sens)), r[2]]);
        redraw();
      });
    svg.call(drag).style('cursor', 'grab');

    function showDots() {
      if (dotsVisible) return;
      dotsVisible = true;
      path.pointRadius(function (p) { return rOf(p.d); });
      var sel = dotsG.selectAll('path.gdot').data(dotData).join('path')
        .attr('class', 'gdot')
        .attr('fill', COL.quake).attr('fill-opacity', 0)
        .attr('stroke', 'rgba(255,255,255,0.4)').attr('stroke-width', 0.4)
        .attr('d', path);
      path.pointRadius(4.5);
      sel.transition().delay(function (d, i) { return i * 2.5; }).duration(500)
        .attr('fill-opacity', 0.8);
      attachDotTips(sel);
    }

    var entered = false;
    function entryAnimation() {
      if (entered) return; entered = true;
      var ri = d3.interpolate(projection.rotate(), [homeRotate[0], homeRotate[1], 0]);
      var si = d3.interpolate(projection.scale(), baseScale);
      d3.transition('globe-entry').duration(2600).ease(d3.easeCubicInOut)
        .tween('zoomout', function () {
          return function (t) {
            projection.rotate(ri(t)).scale(si(t));
            redraw();
          };
        })
        .on('end', function () {
          showDots();
          if (!stepDone(2)) setInst(2, 'One dot became ' + QUAKES.length + '. Drag the globe — the dots follow the planet, not the screen.', 'info');
        });
    }

    var ctx = { n: n, entryAnimation: entryAnimation, projection: projection, redraw: redraw };
    ctx.evidenceFx = function () {
      showDots();
      dotsG.selectAll('path.gdot').transition().duration(600)
        .attr('fill-opacity', function (p) { return p.d.id === 0 ? 0.95 : 0.04; })
        .transition().delay(500).duration(1100)
        .attr('fill-opacity', 0.8);
    };
    ctxs[2] = ctx;

    utilActions[2] = {
      'reset': function () {
        var ri = d3.interpolate(projection.rotate(), [homeRotate[0], homeRotate[1], 0]);
        var si = d3.interpolate(projection.scale(), baseScale);
        d3.transition('globe-reset').duration(900).ease(d3.easeCubicInOut)
          .tween('r', function () { return function (t) { projection.rotate(ri(t)).scale(si(t)); redraw(); }; });
      }
    };

    chipActions[2] = {
      coordinates: function (btn) {
        toggleChip(btn, function () {
          coordsOn = true;
          coordG.append('path').datum(kobeMeridian).attr('d', path)
            .attr('fill', 'none').attr('stroke', '#fff').attr('stroke-width', 1.4).attr('stroke-dasharray', '5 4').attr('opacity', 0.9);
          coordG.append('path').datum(kobeParallel).attr('d', path)
            .attr('fill', 'none').attr('stroke', '#fff').attr('stroke-width', 1.4).attr('stroke-dasharray', '5 4').attr('opacity', 0.9);
          setInst(2, 'The dashed circles are Kobe’s meridian (135.19°E) and parallel (34.69°N) — coordinates drawn on the sphere itself.', 'info');
        }, function () {
          coordsOn = false;
          coordG.selectAll('*').remove();
          setInst(2, 'Drag the globe to spin it. Watch one point become a dataset.');
        });
      },
      grid: function (btn) {
        toggleChip(btn, function () {
          grat.transition().duration(400).attr('stroke-opacity', 0.32).attr('stroke-width', 0.9);
          setInst(2, 'A real graticule: meridians and parallels every 10°, curving with the sphere.', 'info');
        }, function () {
          grat.transition().duration(400).attr('stroke-opacity', 0.10).attr('stroke-width', 0.6);
          setInst(2, 'Drag the globe to spin it. Watch one point become a dataset.');
        });
      },
      compare: function (btn) {
        showDots();
        toggleChip(btn, function () {
          manyMode = false;
          dotsG.selectAll('path.gdot').transition().duration(700)
            .attr('fill-opacity', function (p) { return p.d.id === 0 ? 0.9 : 0; });
          setInst(2, 'One point only: Kobe. Can you tell from this alone whether its location is unusual? Click Compare again.', 'warn');
        }, function () {
          manyMode = true;
          dotsG.selectAll('path.gdot').transition().duration(700).attr('fill-opacity', 0.8);
          setInst(2, 'Now the dataset is back. Kobe stops being a lonely fact and becomes part of a shape.', 'success');
        });
      },
      sample: function (btn) {
        flashChip(btn, function () {
          showDots();
          ensureBadge(2).classList.add('show');
          setTimeout(function () { ensureBadge(2).classList.remove('show'); }, 3500);
          dotsG.selectAll('path.gdot').transition().duration(300).attr('fill-opacity', 1)
            .transition().duration(700).attr('fill-opacity', 0.8);
          setInst(2, 'Every dot is a real earthquake from the USGS catalog — a random sample of 800 M5.5+ events, 2000–2025.', 'info');
        });
      }
    };
  }

  /* ============================================================
     STEP 3 — flat world reveal
     ============================================================ */
  function initStep3() {
    var ctx = makeFlatMap(3);
    ctxs[3] = ctx;
    var dots = ctx.dotsG.selectAll('circle.quake')
      .data(QUAKES, function (d) { return d.id; })
      .join('circle')
      .attr('class', 'quake')
      .attr('cx', function (d) { return ctx.projection([d.lon, d.lat])[0]; })
      .attr('cy', function (d) { return ctx.projection([d.lon, d.lat])[1]; })
      .attr('r', 0)
      .attr('fill', COL.quake).attr('fill-opacity', 0.78)
      .attr('stroke', 'rgba(255,255,255,0.55)').attr('stroke-width', 0.5);
    attachDotTips(dots);

    var animated = false;
    ctx.entryAnimation = function () {
      if (animated) return; animated = true;
      dots.transition()
        .delay(function (d, i) { return 200 + i * 3.5; })
        .duration(450).ease(d3.easeBackOut)
        .attr('r', rOf);
      setTimeout(function () {
        if (!stepDone(3)) setInst(3, QUAKES.length + ' real earthquakes (USGS, 2000–2025) — and almost all of them crowd the same edges.', 'info');
      }, 3200);
    };

    ctx.evidenceFx = function () {
      var p = drawRingPath(ctx, { animate: true, width: 4, duration: 1800 });
      setTimeout(function () { p.transition().duration(900).attr('stroke-opacity', 0).remove(); }, 4500);
    };

    // time-lapse: replay the 25-year sample in date order
    var playing = false;
    utilActions[3].play = function (btn) {
      if (playing) return;
      playing = true; animated = true;
      btn.classList.add('active');
      var sorted = QUAKES.slice().sort(function (a, b) { return a.date < b.date ? -1 : 1; });
      var order = {};
      sorted.forEach(function (d, i) { order[d.id] = i; });
      var frame = frameOf(3);
      var badge = frame.querySelector('.year-badge');
      if (!badge) {
        badge = document.createElement('div');
        badge.className = 'year-badge';
        frame.appendChild(badge);
      }
      var T = 13000;
      dots.interrupt().transition('timeplay').duration(250).attr('r', 0);
      dots.transition('timeplay-in')
        .delay(function (d) { return 400 + order[d.id] / sorted.length * T; })
        .duration(380).ease(d3.easeBackOut)
        .attr('r', rOf);
      badge.textContent = sorted[0].date.slice(0, 4);
      badge.classList.add('show');
      var t0 = Date.now();
      var tick = d3.interval(function () {
        var f = Math.min(1, (Date.now() - t0 - 400) / T);
        if (f >= 0) {
          var idx = Math.min(sorted.length - 1, Math.floor(f * sorted.length));
          badge.textContent = sorted[idx].date.slice(0, 4);
        }
        if (f >= 1) {
          tick.stop();
          playing = false;
          btn.classList.remove('active');
          setTimeout(function () { badge.classList.remove('show'); }, 1800);
          if (!stepDone(3)) setInst(3, '25 years, one pattern: the same edges light up again and again. That stability is the evidence.', 'info');
        }
      }, 90);
      setInst(3, 'Replaying 2000 → 2025 in date order. Watch where the years land.', 'info');
    };

    var ringP = null, hazardG = null, randomMode = false;
    chipActions[3] = {
      pattern: function (btn) {
        toggleChip(btn, function () {
          ringP = drawRingPath(ctx, { animate: true, width: 3.5 });
          setInst(3, 'A single path — part line, part arc — threads through the densest dots, all the way around the Pacific.', 'info');
        }, function () {
          if (ringP) { ringP.remove(); ringP = null; }
          setInst(3, 'Watch the dots arrive. Do they land everywhere — or somewhere?');
        });
      },
      compare: function (btn) {
        toggleChip(btn, function () {
          randomMode = true;
          dots.transition().duration(900).ease(d3.easeCubicInOut)
            .attr('cx', function (d) { return ctx.projection([d.rlon, d.rlat])[0]; })
            .attr('cy', function (d) { return ctx.projection([d.rlon, d.rlat])[1]; });
          setInst(3, 'This is what RANDOM would look like — the same ' + QUAKES.length + ' dots, scattered by chance. Click Compare again to restore reality.', 'warn');
        }, function () {
          randomMode = false;
          dots.transition().duration(900).ease(d3.easeCubicInOut)
            .attr('cx', function (d) { return ctx.projection([d.lon, d.lat])[0]; })
            .attr('cy', function (d) { return ctx.projection([d.lon, d.lat])[1]; });
          setInst(3, 'Back to the real arrangement. The difference between random scatter and this pattern IS the finding.', 'success');
        });
      },
      boundary: function (btn) {
        toggleChip(btn, function () {
          hazardG = drawHazardZones(ctx);
          setInst(3, 'Real plate boundaries (PB2002 dataset) in amber, with five named hazard zones. The dots sit on the seams of the planet.', 'info');
        }, function () {
          if (hazardG) { hazardG.remove(); hazardG = null; }
          setInst(3, 'Watch the dots arrive. Do they land everywhere — or somewhere?');
        });
      },
      grid: function (btn) {
        toggleChip(btn, function () {
          ctx.grat.transition().duration(400).attr('stroke-opacity', 0.28).attr('stroke-width', 0.9);
          setInst(3, 'The graticule reminds you: this flat map is a projection of a sphere.', 'info');
        }, function () {
          ctx.grat.transition().duration(400).attr('stroke-opacity', 0.07).attr('stroke-width', 0.6);
          setInst(3, 'Watch the dots arrive. Do they land everywhere — or somewhere?');
        });
      }
    };
  }

  /* ============================================================
     STEP 4 — one dot expanded into a data card
     ============================================================ */
  function initStep4() {
    var ctx = makeFlatMap(4);
    ctxs[4] = ctx;
    var dots = drawQuakeDots(ctx, QUAKES, { opacity: 0.45 });

    // expand the Kobe dot
    var kp = ctx.projection([KOBE.lon, KOBE.lat]);
    var focus = ctx.fxG.append('circle')
      .attr('cx', kp[0]).attr('cy', kp[1]).attr('r', rOf(KOBE_Q))
      .attr('fill', COL.quake).attr('stroke', '#fff').attr('stroke-width', 1.5);
    focus.transition().delay(400).duration(700).ease(d3.easeBackOut).attr('r', 9);

    // leader line + HTML data card
    var cardX = kp[0] - 250, cardY = kp[1] - 60;
    ctx.fxG.append('line')
      .attr('x1', kp[0] - 9).attr('y1', kp[1])
      .attr('x2', cardX + 215).attr('y2', cardY + 55)
      .attr('stroke', COL.ink).attr('stroke-width', 1.2).attr('stroke-dasharray', '3 3').attr('opacity', 0.75);

    var frame = frameOf(4);
    var card = document.createElement('div');
    card.className = 'dot-card';
    card.style.left = (cardX / ctx.W * 100) + '%';
    card.style.top = (cardY / ctx.H * 100) + '%';
    card.innerHTML =
      '<h4>Quake record · Kobe 1995</h4>' +
      '<table>' +
      '<tr><td>Longitude</td><td>' + KOBE_Q.lon.toFixed(2) + '°E</td></tr>' +
      '<tr><td>Latitude</td><td>' + KOBE_Q.lat.toFixed(2) + '°N</td></tr>' +
      '<tr><td>Magnitude</td><td>M' + KOBE_Q.mag.toFixed(1) + '</td></tr>' +
      '<tr><td>Depth</td><td>' + KOBE_Q.depth + ' km</td></tr>' +
      '<tr><td>Time</td><td>1995-01-17 05:46 JST</td></tr>' +
      '</table>' +
      '<span class="proto-tag">real USGS catalog record</span>';
    frame.appendChild(card);

    ctx.evidenceFx = function () {
      pulseAt(ctx, [KOBE.lon, KOBE.lat], '#fff', 3);
      card.style.transition = 'box-shadow 0.3s';
      card.style.boxShadow = '0 0 0 3px #1B5FAA';
      setTimeout(function () { card.style.boxShadow = ''; }, 2200);
    };

    var depthMode = false;
    chipActions[4] = {
      coordinates: function (btn) {
        flashChip(btn, function () {
          pulseAt(ctx, [KOBE.lon, KOBE.lat], '#fff', 3);
          var rows = card.querySelectorAll('tr');
          [rows[0], rows[1]].forEach(function (r) { r.style.background = '#EAF1F9'; r.style.fontWeight = '600'; });
          setTimeout(function () { rows.forEach(function (r) { r.style.background = ''; r.style.fontWeight = ''; }); }, 2200);
          setInst(4, 'The first two fields are the coordinates — they place the record in space.', 'info');
        });
      },
      magnitude: function (btn) {
        flashChip(btn, function () {
          dots.transition().duration(500).attr('r', function (d) { return rOf(d) * 2.1; }).attr('fill-opacity', 0.75)
            .transition().duration(800).attr('r', rOf).attr('fill-opacity', 0.45);
          var rows = card.querySelectorAll('tr');
          rows[2].style.background = '#FBEDEB'; rows[2].style.fontWeight = '600';
          setTimeout(function () { rows[2].style.background = ''; rows[2].style.fontWeight = ''; }, 2200);
          setInst(4, 'Magnitude is encoded as dot size: bigger circle, bigger quake. Watch every dot announce its magnitude.', 'info');
        });
      },
      depth: function (btn) {
        toggleChip(btn, function () {
          depthMode = true;
          dots.transition().duration(700)
            .attr('fill', function (d) {
              var g = depthGroup(d.depth);
              return g === 'shallow' ? COL.depthShallow : g === 'intermediate' ? COL.depthMid : COL.depthDeep;
            })
            .attr('fill-opacity', 0.8);
          var rows = card.querySelectorAll('tr');
          rows[3].style.background = '#F3ECF7'; rows[3].style.fontWeight = '600';
          setInst(4, '<span style="color:' + COL.depthShallow + '">■ shallow</span> · <span style="color:' + COL.depthMid + '">■ intermediate</span> · <span style="color:' + COL.depthDeep + '">■ deep</span> — the hidden third dimension of every dot.', 'info');
        }, function () {
          depthMode = false;
          dots.transition().duration(700).attr('fill', COL.quake).attr('fill-opacity', 0.45);
          var rows = card.querySelectorAll('tr');
          rows[3].style.background = ''; rows[3].style.fontWeight = '';
          setInst(4, 'Every dot is a measurement. Open one up and read its fields.');
        });
      },
      sample: function (btn) {
        flashChip(btn, function () {
          ensureBadge(4).classList.add('show');
          setTimeout(function () { ensureBadge(4).classList.remove('show'); }, 3500);
          var tag = card.querySelector('.proto-tag');
          tag.style.transform = 'scale(1.15)'; tag.style.transition = 'transform 0.25s';
          setTimeout(function () { tag.style.transform = ''; }, 1500);
          setInst(4, 'Dr. Chen’s reminder: these are real USGS catalog records — a sample of 800 events, 2000–2025, plus Kobe 1995.', 'info');
        });
      }
    };
  }

  /* ============================================================
     STEP 5 — free exploration
     ============================================================ */
  function initStep5() {
    var ctx = makeFlatMap(5);
    ctxs[5] = ctx;
    var dots = drawQuakeDots(ctx, QUAKES);

    ctx.evidenceFx = function () {
      dots.transition().duration(450).attr('r', function (d) { return rOf(d) * 1.9; })
        .transition().duration(800).attr('r', rOf);
    };

    var ringP = null, hazardG = null;
    chipActions[5] = {
      pattern: function (btn) {
        toggleChip(btn, function () {
          ringP = drawRingPath(ctx, { animate: true, width: 3 });
          setInst(5, 'One candidate shape: a closed-ish path around the Pacific. Do the dots agree with it everywhere?', 'info');
        }, function () {
          if (ringP) { ringP.remove(); ringP = null; }
          setInst(5, 'Pan, zoom, hover. Explore freely — there is no wrong observation here.');
        });
      },
      compare: function (btn) {
        toggleChip(btn, function () {
          dots.transition().duration(900).ease(d3.easeCubicInOut)
            .attr('cx', function (d) { return ctx.projection([d.rlon, d.rlat])[0]; })
            .attr('cy', function (d) { return ctx.projection([d.rlon, d.rlat])[1]; });
          setInst(5, 'Shuffled at random. Which geometric words would you use NOW? Probably just “scattered”.', 'warn');
        }, function () {
          dots.transition().duration(900).ease(d3.easeCubicInOut)
            .attr('cx', function (d) { return ctx.projection([d.lon, d.lat])[0]; })
            .attr('cy', function (d) { return ctx.projection([d.lon, d.lat])[1]; });
          setInst(5, 'The real data is back — lines, arcs, bands, clusters. Tag what you see.', 'success');
        });
      },
      grid: function (btn) {
        toggleChip(btn, function () {
          ctx.grat.transition().duration(400).attr('stroke-opacity', 0.28).attr('stroke-width', 0.9);
          setInst(5, 'Grid on — useful for describing WHERE a shape sits (e.g., “a band near 35°N”).', 'info');
        }, function () {
          ctx.grat.transition().duration(400).attr('stroke-opacity', 0.07).attr('stroke-width', 0.6);
          setInst(5, 'Pan, zoom, hover. Explore freely — there is no wrong observation here.');
        });
      },
      boundary: function (btn) {
        toggleChip(btn, function () {
          hazardG = drawHazardZones(ctx);
          setInst(5, 'Real plate boundaries overlaid. Notice how each shape you tagged follows one of the planet’s seams.', 'info');
        }, function () {
          if (hazardG) { hazardG.remove(); hazardG = null; }
          setInst(5, 'Pan, zoom, hover. Explore freely — there is no wrong observation here.');
        });
      }
    };
  }

  /* ============================================================
     STEP 6 — magnitude slider + Ring overlay
     ============================================================ */
  function initStep6() {
    var ctx = makeFlatMap(6);
    ctxs[6] = ctx;
    var data = QUAKES;
    var threshold = 6.0;
    var compareGhosts = false, binMode = false;

    var binColor = function (d) {
      return d.mag >= 8 ? '#9E2B16' : d.mag >= 7 ? '#C74B2C' : d.mag >= 6.5 ? '#E8704F' : '#F0936F';
    };

    var dots = ctx.dotsG.selectAll('circle.quake')
      .data(data, function (d) { return d.id; })
      .join('circle')
      .attr('class', 'quake')
      .attr('cx', function (d) { return ctx.projection([d.lon, d.lat])[0]; })
      .attr('cy', function (d) { return ctx.projection([d.lon, d.lat])[1]; })
      .attr('fill', COL.quake)
      .attr('stroke', 'rgba(255,255,255,0.55)').attr('stroke-width', 0.5);
    attachDotTips(dots);

    function update(animate) {
      var count = 0;
      var t = animate === false ? dots : dots.transition().duration(450);
      t.attr('r', function (d) {
        if (d.mag >= threshold) { count++; return rOf(d) + 0.6; }
        return compareGhosts ? 2 : 0;
      })
        .attr('fill', function (d) {
          if (d.mag < threshold) return '#9AA7B4';
          return binMode ? binColor(d) : COL.quake;
        })
        .attr('fill-opacity', function (d) { return d.mag >= threshold ? 0.85 : (compareGhosts ? 0.25 : 0); });
      var countEl = document.getElementById('mag-count');
      countEl.innerHTML = '<strong>' + count + '</strong> of ' + data.length + ' USGS quakes shown';
      return count;
    }

    var slider = document.getElementById('mag-slider');
    var readout = document.getElementById('mag-readout');
    slider.addEventListener('input', function () {
      threshold = +slider.value;
      readout.textContent = 'M' + threshold.toFixed(1);
      var c = update();
      ctx.sliderMax = Math.max(ctx.sliderMax || 6, threshold);
      if (threshold >= 7.5) setInst(6, 'Only ' + c + ' quakes are this strong — and look where they are. Not one of them strays far from the path.', 'info');
      else if (threshold >= 7.0) setInst(6, c + ' quakes at M' + threshold.toFixed(1) + '+. The weaker noise is gone; the band is unmistakable.', 'info');
      else setInst(6, 'Slide the magnitude filter. Watch which dots survive — and where they live.');
    });
    update(false);

    var ringP = null;
    function setRing(on, btn) {
      if (on && !ringP) {
        ringP = drawRingPath(ctx, { animate: true, width: 3, duration: 1500 });
      } else if (!on && ringP) { ringP.remove(); ringP = null; }
      var layerBtn = document.querySelector('#step-6 .util-btn[data-util="layer"]');
      if (layerBtn) layerBtn.classList.toggle('active', on);
      var chipBtn = document.querySelector('#step-6 .chip[data-chip="pattern"]');
      if (chipBtn) chipBtn.classList.toggle('active', on);
    }

    utilActions[6].layer = function () { setRing(!ringP); };

    ctx.sliderMax = 6.0;
    ctx.evidenceFx = function () {
      setRing(true);
      dots.filter(function (d) { return d.mag >= threshold; })
        .transition().duration(450).attr('r', function (d) { return rOf(d) + 5; })
        .transition().duration(900).attr('r', function (d) { return rOf(d) + 0.6; });
    };

    chipActions[6] = {
      bins: function (btn) {
        toggleChip(btn, function () {
          binMode = true; update();
          setInst(6, 'Dots tinted by magnitude bin: <span style="color:#F0936F">■ 6.0–6.4</span> · <span style="color:#E8704F">■ 6.5–6.9</span> · <span style="color:#C74B2C">■ 7.0–7.9</span> · <span style="color:#9E2B16">■ 8.0+</span>. Grouping by bins is the same move the slider makes.', 'info');
        }, function () {
          binMode = false; update();
          setInst(6, 'Slide the magnitude filter. Watch which dots survive — and where they live.');
        });
      },
      frequency: function (btn) {
        toggleChip(btn, function () {
          var c = data.filter(function (d) { return d.mag >= threshold; }).length;
          var banner = ensureBanner(6);
          banner.innerHTML = '<strong>' + c + '</strong> of ' + data.length + ' quakes in this USGS sample are ≥ M' + threshold.toFixed(1);
          banner.classList.add('show');
          setInst(6, 'Frequency = how many. ' + c + ' of ' + data.length + ' make the cut at M' + threshold.toFixed(1) + '+ — counts are evidence too.', 'info');
        }, function () {
          ensureBanner(6).classList.remove('show');
          setInst(6, 'Slide the magnitude filter. Watch which dots survive — and where they live.');
        });
      },
      pattern: function (btn) {
        var on = !ringP;
        setRing(on);
        window.__step6RingSeen = true;
        if (on) setInst(6, 'The Ring overlay is on. Compare it with the surviving dots as you slide.', 'info');
        else setInst(6, 'Slide the magnitude filter. Watch which dots survive — and where they live.');
      },
      compare: function (btn) {
        toggleChip(btn, function () {
          compareGhosts = true; update();
          setInst(6, 'Grey ghosts mark the filtered-out quakes. The strong ones aren’t in new places — they’re the same places, distilled.', 'info');
        }, function () {
          compareGhosts = false; update();
          setInst(6, 'Slide the magnitude filter. Watch which dots survive — and where they live.');
        });
      }
    };
  }

  /* ============================================================
     STEP 7 — histogram of magnitudes
     ============================================================ */
  function initStep7() {
    var W = 760, H = 460;
    var margin = { top: 28, right: 24, bottom: 52, left: 58 };
    var iw = W - margin.left - margin.right, ih = H - margin.top - margin.bottom;
    var svg = d3.select('#viz-7').append('svg').attr('viewBox', '0 0 ' + W + ' ' + H);
    svg.append('rect').attr('width', W).attr('height', H).attr('fill', '#FFFFFF');
    var g = svg.append('g').attr('transform', 'translate(' + margin.left + ',' + margin.top + ')');

    var thresholds = d3.range(5.5, 9.51, 0.5);
    var bins = d3.bin().domain([5.5, 9.5]).thresholds(thresholds.slice(0, -1))(
      QUAKES.map(function (d) { return d.mag; })
    );
    var labels = bins.map(function (b) { return b.x0.toFixed(1) + '–' + b.x1.toFixed(1); });

    var x = d3.scaleBand().domain(labels).range([0, iw]).padding(0.14);
    var y = d3.scaleLinear().domain([0, d3.max(bins, function (b) { return b.length; })]).nice().range([ih, 0]);

    var xAxisG = g.append('g').attr('class', 'x-axis')
      .attr('transform', 'translate(0,' + ih + ')')
      .call(d3.axisBottom(x));
    var yAxisG = g.append('g').attr('class', 'y-axis').call(d3.axisLeft(y).ticks(7));
    g.selectAll('.tick text').attr('font-size', 11).attr('font-family', 'Inter, sans-serif');

    var xTitle = g.append('text').attr('x', iw / 2).attr('y', ih + 42)
      .attr('text-anchor', 'middle').attr('font-size', 12.5).attr('fill', '#52606D')
      .text('Magnitude (USGS catalog sample, 2000–2025)');
    var yTitle = g.append('text')
      .attr('transform', 'rotate(-90)')
      .attr('x', -ih / 2).attr('y', -42)
      .attr('text-anchor', 'middle').attr('font-size', 12.5).attr('fill', '#52606D')
      .text('Number of quakes');

    var bars = g.selectAll('rect.bar').data(bins).join('rect')
      .attr('class', 'bar')
      .attr('x', function (b, i) { return x(labels[i]); })
      .attr('width', x.bandwidth())
      .attr('y', ih).attr('height', 0)
      .attr('fill', COL.primary).attr('rx', 2);

    var counts = g.selectAll('text.count').data(bins).join('text')
      .attr('class', 'count')
      .attr('x', function (b, i) { return x(labels[i]) + x.bandwidth() / 2; })
      .attr('y', function (b) { return y(b.length) - 6; })
      .attr('text-anchor', 'middle').attr('font-size', 11).attr('font-weight', 600)
      .attr('fill', '#52606D').attr('opacity', 0)
      .text(function (b) { return b.length; });

    var animated = false;
    var ctx = {
      n: 7,
      entryAnimation: function () {
        if (animated) return; animated = true;
        bars.transition().delay(function (b, i) { return i * 110; }).duration(650).ease(d3.easeCubicOut)
          .attr('y', function (b) { return y(b.length); })
          .attr('height', function (b) { return ih - y(b.length); });
      }
    };
    ctx.evidenceFx = function () {
      bars.transition().duration(500).attr('fill', function (b) { return b.x0 >= 7.0 ? '#D95F44' : COL.primary; });
      counts.transition().duration(400).attr('opacity', 1);
    };
    ctxs[7] = ctx;

    var tailG = null;
    chipActions[7] = {
      axes: function (btn) {
        toggleChip(btn, function () {
          [xAxisG, yAxisG].forEach(function (ax) {
            ax.selectAll('path.domain, line').transition().duration(350).attr('stroke', COL.primary).attr('stroke-width', 2);
            ax.selectAll('text').transition().duration(350).attr('fill', COL.primary).attr('font-weight', 600);
          });
          [xTitle, yTitle].forEach(function (t) { t.transition().duration(350).attr('fill', COL.primary).attr('font-weight', 600).attr('font-size', 14); });
          setInst(7, 'X-axis: magnitude bins of width 0.5. Y-axis: how many quakes fall in each bin. Axes first, always.', 'info');
        }, function () {
          [xAxisG, yAxisG].forEach(function (ax) {
            ax.selectAll('path.domain, line').transition().duration(350).attr('stroke', '#000').attr('stroke-width', 1);
            ax.selectAll('text').transition().duration(350).attr('fill', '#000').attr('font-weight', null);
          });
          [xTitle, yTitle].forEach(function (t) { t.transition().duration(350).attr('fill', '#52606D').attr('font-weight', null).attr('font-size', 12.5); });
          setInst(7, 'Read the histogram left to right. Where do the bars tower — and where do they shrink?');
        });
      },
      bars: function (btn) {
        flashChip(btn, function () {
          bars.transition().delay(function (b, i) { return i * 130; }).duration(280)
            .attr('fill', '#134878').attr('y', function (b) { return y(b.length) - 8; })
            .transition().duration(380)
            .attr('fill', COL.primary).attr('y', function (b) { return y(b.length); });
          setInst(7, 'Each bar = one bin. Bar height is a count, not a measurement of any single quake.', 'info');
        });
      },
      tail: function (btn) {
        toggleChip(btn, function () {
          var startIdx = labels.indexOf('7.0–7.5');
          var x0 = x(labels[startIdx]) - 4;
          tailG = g.append('g');
          tailG.append('rect').attr('x', x0).attr('y', 0).attr('width', iw - x0).attr('height', ih)
            .attr('fill', '#D95F44').attr('opacity', 0)
            .transition().duration(500).attr('opacity', 0.10);
          tailG.append('line').attr('x1', x0).attr('x2', x0).attr('y1', 0).attr('y2', ih)
            .attr('stroke', '#D95F44').attr('stroke-width', 1.5).attr('stroke-dasharray', '5 4');
          tailG.append('text').attr('x', x0 + (iw - x0) / 2).attr('y', 22)
            .attr('text-anchor', 'middle').attr('font-size', 13).attr('font-weight', 600).attr('fill', '#B3372B')
            .text('the long right tail');
          tailG.append('text').attr('x', x0 + (iw - x0) / 2).attr('y', 40)
            .attr('text-anchor', 'middle').attr('font-size', 11.5).attr('fill', '#B3372B')
            .text('tiny bars: strong quakes are rare');
          bars.transition().duration(500).attr('fill', function (b) { return b.x0 >= 7.0 ? '#D95F44' : COL.primary; });
          setInst(7, 'The tail stretches right: each step up in magnitude is rarer than the last — but never impossible.', 'info');
        }, function () {
          if (tailG) { tailG.remove(); tailG = null; }
          bars.transition().duration(500).attr('fill', COL.primary);
          setInst(7, 'Read the histogram left to right. Where do the bars tower — and where do they shrink?');
        });
      },
      frequency: function (btn) {
        toggleChip(btn, function () {
          counts.transition().delay(function (b, i) { return i * 60; }).duration(350).attr('opacity', 1);
          var m8plus = QUAKES.filter(function (d) { return d.mag >= 8; }).length;
          setInst(7, 'Exact frequencies on every bar. Say it with numbers: ' + bins[0].length + ' quakes at M5.5–6.0, only ' + m8plus + ' at M8.0 or above.', 'info');
        }, function () {
          counts.transition().duration(350).attr('opacity', 0);
          setInst(7, 'Read the histogram left to right. Where do the bars tower — and where do they shrink?');
        });
      }
    };
  }

  /* ============================================================
     STEP 8 — scatter: depth vs magnitude
     ============================================================ */
  function initStep8() {
    var W = 760, H = 460;
    var margin = { top: 30, right: 26, bottom: 52, left: 58 };
    var iw = W - margin.left - margin.right, ih = H - margin.top - margin.bottom;
    var svg = d3.select('#viz-8').append('svg').attr('viewBox', '0 0 ' + W + ' ' + H);
    svg.append('rect').attr('width', W).attr('height', H).attr('fill', '#FFFFFF');
    var g = svg.append('g').attr('transform', 'translate(' + margin.left + ',' + margin.top + ')');

    var x = d3.scaleLinear().domain([0, 700]).range([0, iw]);
    var y = d3.scaleLinear().domain([5.3, 9.0]).range([ih, 0]);

    var xAxisG = g.append('g').attr('transform', 'translate(0,' + ih + ')').call(d3.axisBottom(x).ticks(8));
    var yAxisG = g.append('g').call(d3.axisLeft(y).ticks(8));
    g.selectAll('.tick text').attr('font-size', 11);

    var xTitle = g.append('text').attr('x', iw / 2).attr('y', ih + 42)
      .attr('text-anchor', 'middle').attr('font-size', 12.5).attr('fill', '#52606D')
      .text('Depth below surface (km)');
    var yTitle = g.append('text').attr('transform', 'rotate(-90)')
      .attr('x', -ih / 2).attr('y', -40)
      .attr('text-anchor', 'middle').attr('font-size', 12.5).attr('fill', '#52606D')
      .text('Magnitude');

    var groupColor = { shallow: COL.depthShallow, intermediate: COL.depthMid, deep: COL.depthDeep };
    var pts = g.selectAll('circle.pt').data(QUAKES).join('circle')
      .attr('class', 'pt')
      .attr('cx', function (d) { return x(d.depth); })
      .attr('cy', function (d) { return y(d.mag); })
      .attr('r', 3.6)
      .attr('fill', function (d) { return groupColor[depthGroup(d.depth)]; })
      .attr('fill-opacity', 0.72)
      .attr('stroke', '#fff').attr('stroke-width', 0.5);
    attachDotTips(pts);

    // legend (top-right, inside plot)
    var legend = g.append('g').attr('transform', 'translate(' + (iw - 178) + ', 4)');
    legend.append('rect').attr('x', -10).attr('y', -8).attr('width', 188).attr('height', 64)
      .attr('fill', 'rgba(255,255,255,0.9)').attr('stroke', '#DDE2E8').attr('rx', 6);
    var legendItems = [
      { key: 'shallow', label: 'Shallow (< 70 km)' },
      { key: 'intermediate', label: 'Intermediate (70–300 km)' },
      { key: 'deep', label: 'Deep (> 300 km)' }
    ];
    var legendRows = legend.selectAll('g.lrow').data(legendItems).join('g')
      .attr('class', 'lrow')
      .attr('transform', function (d, i) { return 'translate(0,' + (i * 18 + 4) + ')'; });
    legendRows.append('circle').attr('r', 5).attr('cx', 4).attr('cy', 0)
      .attr('fill', function (d) { return groupColor[d.key]; });
    legendRows.append('text').attr('x', 14).attr('y', 4)
      .attr('font-size', 11.5).attr('fill', '#52606D')
      .text(function (d) { return d.label; });

    // least-squares fit (computed, nearly flat)
    var n = QUAKES.length, sx = 0, sy = 0, sxy = 0, sxx = 0;
    QUAKES.forEach(function (d) { sx += d.depth; sy += d.mag; sxy += d.depth * d.mag; sxx += d.depth * d.depth; });
    var slope = (n * sxy - sx * sy) / (n * sxx - sx * sx);
    var icept = sy / n - slope * sx / n;

    ctxs[8] = {
      n: 8,
      evidenceFx: function () {
        var chipBtn = document.querySelector('#step-8 .chip[data-chip="trend"]');
        if (!trendG && chipBtn) chipActions[8].trend(chipBtn);
        pts.transition().duration(450).attr('r', 5)
          .transition().duration(800).attr('r', 3.6);
      }
    };

    var trendG = null, ghostG = null;
    chipActions[8] = {
      axes: function (btn) {
        toggleChip(btn, function () {
          [xAxisG, yAxisG].forEach(function (ax) {
            ax.selectAll('path.domain, line').transition().duration(350).attr('stroke', COL.primary).attr('stroke-width', 2);
            ax.selectAll('text').transition().duration(350).attr('fill', COL.primary).attr('font-weight', 600);
          });
          [xTitle, yTitle].forEach(function (t) { t.transition().duration(350).attr('fill', COL.primary).attr('font-weight', 600).attr('font-size', 14); });
          setInst(8, 'Depth runs across (0–660 km); magnitude runs up. Every dot answers both questions at once.', 'info');
        }, function () {
          [xAxisG, yAxisG].forEach(function (ax) {
            ax.selectAll('path.domain, line').transition().duration(350).attr('stroke', '#000').attr('stroke-width', 1);
            ax.selectAll('text').transition().duration(350).attr('fill', '#000').attr('font-weight', null);
          });
          [xTitle, yTitle].forEach(function (t) { t.transition().duration(350).attr('fill', '#52606D').attr('font-weight', null).attr('font-size', 12.5); });
          setInst(8, 'Each dot is one quake: depth across, magnitude up. Hunt for a trend — honestly.');
        });
      },
      depth: function (btn) {
        flashChip(btn, function () {
          var seq = ['shallow', 'intermediate', 'deep'];
          seq.forEach(function (grp, i) {
            setTimeout(function () {
              pts.transition().duration(330)
                .attr('fill-opacity', function (d) { return depthGroup(d.depth) === grp ? 1 : 0.08; })
                .attr('r', function (d) { return depthGroup(d.depth) === grp ? 5.2 : 2.6; });
              legendRows.select('text').attr('font-weight', function (d) { return d.key === grp ? 700 : 400; });
              setInst(8, 'Now watching only <strong>' + grp + '</strong> quakes — notice they still span the whole magnitude range.', 'info');
            }, i * 1100);
          });
          setTimeout(function () {
            pts.transition().duration(400).attr('fill-opacity', 0.72).attr('r', 3.6);
            legendRows.select('text').attr('font-weight', 400);
            setInst(8, 'All three depth groups cover the same vertical spread. Depth changes the color — not the height.', 'success');
          }, 3500);
        });
      },
      trend: function (btn) {
        toggleChip(btn, function () {
          trendG = g.append('g');
          var x1 = 0, x2 = 700;
          trendG.append('line')
            .attr('x1', x(x1)).attr('y1', y(icept + slope * x1))
            .attr('x2', x(x1)).attr('y2', y(icept + slope * x1))
            .attr('stroke', '#1F2933').attr('stroke-width', 2.5).attr('stroke-dasharray', '8 5')
            .transition().duration(900)
            .attr('x2', x(x2)).attr('y2', y(icept + slope * x2));
          trendG.append('text')
            .attr('x', x(330)).attr('y', y(icept + slope * 330) - 14)
            .attr('text-anchor', 'middle').attr('font-size', 12.5).attr('font-weight', 600).attr('fill', '#1F2933')
            .attr('opacity', 0)
            .text('best-fit line: nearly flat → no clear relationship')
            .transition().delay(700).duration(400).attr('opacity', 1);
          setInst(8, 'The fitted line barely tilts. If depth drove magnitude, it would climb steeply. It doesn’t.', 'info');
        }, function () {
          if (trendG) { trendG.remove(); trendG = null; }
          setInst(8, 'Each dot is one quake: depth across, magnitude up. Hunt for a trend — honestly.');
        });
      },
      compare: function (btn) {
        toggleChip(btn, function () {
          ghostG = g.append('g');
          var ghostRand = mulberry32(777);
          var ghosts = d3.range(120).map(function () {
            var depth = ghostRand() * 700;
            return { depth: depth, mag: 5.6 + depth / 700 * 3.0 + (ghostRand() - 0.5) * 0.6 };
          });
          ghostG.selectAll('circle').data(ghosts).join('circle')
            .attr('cx', function (d) { return x(d.depth); })
            .attr('cy', function (d) { return y(d.mag); })
            .attr('r', 0)
            .attr('fill', 'none').attr('stroke', '#7B8794').attr('stroke-width', 1.2)
            .transition().delay(function (d, i) { return i * 6; }).duration(300)
            .attr('r', 3.4);
          ghostG.append('text').attr('x', x(440)).attr('y', y(8.85))
            .attr('font-size', 12.5).attr('font-weight', 600).attr('fill', '#52606D')
            .text('⬡ what a REAL trend would look like');
          pts.transition().duration(500).attr('fill-opacity', 0.35);
          setInst(8, 'Hollow grey dots: an invented dataset where depth DOES drive magnitude. Compare its climb with your flat cloud.', 'warn');
        }, function () {
          if (ghostG) { ghostG.remove(); ghostG = null; }
          pts.transition().duration(500).attr('fill-opacity', 0.72);
          setInst(8, 'Each dot is one quake: depth across, magnitude up. Hunt for a trend — honestly.');
        });
      }
    };
  }

  /* ============================================================
     STEP 9 — Ring of Fire named + claim
     ============================================================ */
  function initStep9() {
    var ctx = makeFlatMap(9);
    ctxs[9] = ctx;

    var dots = ctx.dotsG.selectAll('circle.quake')
      .data(QUAKES, function (d) { return d.id; })
      .join('circle')
      .attr('class', 'quake')
      .attr('cx', function (d) { return ctx.projection([d.lon, d.lat])[0]; })
      .attr('cy', function (d) { return ctx.projection([d.lon, d.lat])[1]; })
      .attr('r', function (d) { return d.mag >= 6 ? rOf(d) + 1 : Math.max(1.4, rOf(d) - 0.6); })
      .attr('fill', function (d) { return d.mag >= 6 ? COL.quake : '#8FA0AE'; })
      .attr('fill-opacity', function (d) { return d.mag >= 6 ? 0.92 : 0.25; })
      .attr('stroke', function (d) { return d.mag >= 6 ? '#fff' : 'none'; })
      .attr('stroke-width', 0.6);
    attachDotTips(dots);

    var ringP = drawRingPath(ctx, { width: 4, opacity: 0 });
    var ringLabelP = ctx.projection([-103, -38]);
    var ringLabel = ctx.overlay.append('text')
      .attr('x', ringLabelP[0]).attr('y', ringLabelP[1])
      .attr('text-anchor', 'middle')
      .attr('font-size', 15).attr('font-weight', 600)
      .attr('fill', '#FCE8CF')
      .attr('stroke', 'rgba(15,64,108,0.9)').attr('stroke-width', 3.6).attr('paint-order', 'stroke')
      .attr('opacity', 0)
      .text('the Pacific Ring of Fire');

    var animated = false;
    ctx.entryAnimation = function () {
      if (animated) return; animated = true;
      var node = ringP.node(), L = node.getTotalLength();
      ringP.attr('stroke-opacity', 0.95)
        .attr('stroke-dasharray', L + ' ' + L).attr('stroke-dashoffset', L)
        .transition().duration(2600).ease(d3.easeCubicInOut)
        .attr('stroke-dashoffset', 0)
        .on('end', function () {
          ringLabel.transition().duration(600).attr('opacity', 1);
        });
    };

    function ringOn() { return +ringP.attr('stroke-opacity') > 0; }
    function setRing(on) {
      ringP.transition().duration(400).attr('stroke-opacity', on ? 0.95 : 0).attr('stroke-dasharray', null).attr('stroke-dashoffset', null);
      ringLabel.transition().duration(400).attr('opacity', on ? 1 : 0);
      var layerBtn = document.querySelector('#step-9 .util-btn[data-util="layer"]');
      if (layerBtn) layerBtn.classList.toggle('active', on);
    }
    utilActions[9].layer = function () { setRing(!ringOn()); };

    // live USGS feed: real quakes from the past 7 days (online only)
    var liveG = null, liveCache = null;
    function renderLive(events, btn) {
      liveG = ctx.fxG.append('g');
      events.forEach(function (q, i) {
        var p = ctx.projection([q.lon, q.lat]);
        if (!p) return;
        liveG.append('circle')
          .attr('class', 'live-dot')
          .attr('cx', p[0]).attr('cy', p[1])
          .attr('r', 2 + (q.mag - 4.5) * 1.3)
          .attr('fill', 'none').attr('stroke', '#FFFFFF').attr('stroke-width', 1.6)
          .style('animation-delay', (i % 10) * 0.22 + 's');
        setTimeout(function () { pulseAt(ctx, [q.lon, q.lat], '#fff', 1); }, i * 90);
      });
      var banner = ensureBanner(9);
      banner.innerHTML = '<strong>' + events.length + '</strong> real M4.5+ earthquakes in the past 7 days — USGS live feed';
      banner.classList.add('show');
      setInst(9, 'White rings are this week’s real earthquakes. The Ring of Fire is not history — it is happening now.', 'info');
      if (btn) btn.classList.add('active');
    }
    utilActions[9].live = function (btn) {
      if (liveG) {
        liveG.remove(); liveG = null;
        ensureBanner(9).classList.remove('show');
        btn.classList.remove('active');
        if (!stepDone(9)) setInst(9, 'The path has a name. Use the map as evidence for your claim.');
        return;
      }
      if (liveCache) { renderLive(liveCache, btn); return; }
      setInst(9, 'Contacting the USGS live feed…', 'info');
      fetch('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_week.geojson')
        .then(function (r) { return r.json(); })
        .then(function (j) {
          liveCache = j.features.map(function (f) {
            return { lon: f.geometry.coordinates[0], lat: f.geometry.coordinates[1], mag: f.properties.mag || 4.5 };
          });
          renderLive(liveCache, btn);
        })
        .catch(function () {
          setInst(9, 'Live feed unavailable (offline) — the 25-year sample still tells the story.', 'warn');
        });
    };

    ctx.evidenceFx = function () {
      setRing(true);
      var banner = ensureBanner(9);
      banner.innerHTML = '<strong>' + M6_ON_RING.length + '</strong> of the <strong>' + M6.length + '</strong> M6+ quakes in this USGS sample sit on the Ring of Fire';
      banner.classList.add('show');
      dots.filter(function (d) { return d.mag >= 6; })
        .transition().duration(450).attr('r', function (d) { return rOf(d) + 4; })
        .transition().duration(900).attr('r', function (d) { return rOf(d) + 1; });
    };

    var hazardG = null;
    chipActions[9] = {
      pattern: function (btn) {
        flashChip(btn, function () {
          setRing(true);
          var node = ringP.node(), L = node.getTotalLength();
          ringP.attr('stroke-dasharray', L + ' ' + L).attr('stroke-dashoffset', L).attr('stroke-opacity', 0.95)
            .transition().duration(2000).ease(d3.easeCubicInOut)
            .attr('stroke-dashoffset', 0)
            .on('end', function () { ringP.attr('stroke-dasharray', null); });
          setInst(9, 'Trace it: down the Americas, under the Pacific, up past New Zealand, Japan, and Alaska. One continuous geometric path.', 'info');
        });
      },
      bins: function (btn) {
        flashChip(btn, function () {
          dots.filter(function (d) { return d.mag >= 6; })
            .transition().duration(400).attr('r', function (d) { return rOf(d) + 5; })
            .transition().duration(700).attr('r', function (d) { return rOf(d) + 1; });
          setInst(9, 'Highlighted: the ' + M6.length + ' quakes at M6.0 or above. The faint grey dots are the weaker rest of the sample.', 'info');
        });
      },
      frequency: function (btn) {
        toggleChip(btn, function () {
          var banner = ensureBanner(9);
          banner.innerHTML = '<strong>' + M6_ON_RING.length + '</strong> of the <strong>' + M6.length + '</strong> M6+ quakes in this USGS sample sit on the Ring of Fire';
          banner.classList.add('show');
          setInst(9, M6_ON_RING.length + ' of ' + M6.length + ' M6+ dots fall along the Ring — that’s a number you can put in your claim.', 'info');
        }, function () {
          ensureBanner(9).classList.remove('show');
          setInst(9, 'The path has a name. Use the map as evidence for your claim.');
        });
      },
      boundary: function (btn) {
        toggleChip(btn, function () {
          hazardG = drawHazardZones(ctx);
          setInst(9, 'The Ring is not one fault but a chain of real plate boundaries — each named segment is its own hazard story.', 'info');
        }, function () {
          if (hazardG) { hazardG.remove(); hazardG = null; }
          setInst(9, 'The path has a name. Use the map as evidence for your claim.');
        });
      }
    };

    // hint pills insert words into the claim textarea
    document.querySelectorAll('#mcq-9 .hint-pill').forEach(function (pill) {
      pill.addEventListener('click', function () {
        var ta = document.getElementById('claim-text');
        var w = pill.dataset.hint;
        ta.value = ta.value ? ta.value.replace(/\s*$/, ' ') + w : w;
        ta.focus();
      });
    });
  }

  /* ============================================================
     wiring: chips, utils, lazy init, nav
     ============================================================ */
  document.querySelectorAll('.step').forEach(function (sec) {
    var n = +sec.dataset.step;
    sec.addEventListener('click', function (ev) {
      var chip = ev.target.closest('.chip');
      if (chip && chipActions[n] && chipActions[n][chip.dataset.chip]) {
        chipActions[n][chip.dataset.chip](chip);
        return;
      }
      var util = ev.target.closest('.util-btn');
      if (util && utilActions[n] && utilActions[n][util.dataset.util]) {
        utilActions[n][util.dataset.util](util);
      }
    });
  });

  var initFns = {
    1: initStep1, 2: initStep2, 3: initStep3, 4: initStep4, 5: initStep5,
    6: initStep6, 7: initStep7, 8: initStep8, 9: initStep9
  };

  // lazy init when a section approaches the viewport
  var initIO = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (!e.isIntersecting) return;
      var n = +e.target.dataset.step;
      if (initFns[n]) { initFns[n](); initFns[n] = null; }
    });
  }, { rootMargin: '400px 0px' });

  // entry animations when a section is actually visible
  var animIO = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (!e.isIntersecting) return;
      var n = +e.target.dataset.step;
      if (ctxs[n] && ctxs[n].entryAnimation) { ctxs[n].entryAnimation(); }
    });
  }, { threshold: 0.35 });

  document.querySelectorAll('.step').forEach(function (sec) {
    initIO.observe(sec);
    animIO.observe(sec);
  });
  // init step 1 immediately so the page never looks empty
  if (initFns[1]) { initFns[1](); initFns[1] = null; }

  /* ---------- top-nav: notes / data / explore ---------- */
  var notesPanel = document.getElementById('notes-panel');
  document.getElementById('nav-notes').addEventListener('click', function () {
    notesPanel.hidden = !notesPanel.hidden;
  });
  document.getElementById('notes-close').addEventListener('click', function () { notesPanel.hidden = true; });

  var dataModal = document.getElementById('data-modal');
  document.getElementById('nav-data').addEventListener('click', function () {
    var table = document.getElementById('data-table');
    if (!table.innerHTML) {
      var rows = QUAKES.slice(0, 30).map(function (d) {
        return '<tr><td>' + d.id + '</td><td>' + (d.place || '—') + '</td><td>' + d.lon.toFixed(2) + '</td><td>' + d.lat.toFixed(2) +
          '</td><td>M' + d.mag.toFixed(1) + '</td><td>' + d.depth + ' km</td><td>' + d.date + '</td></tr>';
      }).join('');
      table.innerHTML = '<thead><tr><th>#</th><th>Place (USGS)</th><th>Lon</th><th>Lat</th><th>Mag</th><th>Depth</th><th>Date</th></tr></thead><tbody>' + rows + '</tbody>';
    }
    dataModal.hidden = false;
  });
  document.getElementById('data-close').addEventListener('click', function () { dataModal.hidden = true; });
  dataModal.addEventListener('click', function (ev) { if (ev.target === dataModal) dataModal.hidden = true; });

  document.getElementById('nav-explore').addEventListener('click', function () {
    document.getElementById('step-5').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  // expose internals for debugging
  window.LESSON = {
    QUAKES: QUAKES, M6: M6, M6_ON_RING: M6_ON_RING,
    ctxs: ctxs, chipActions: chipActions, setInst: setInst,
    drawRingPath: drawRingPath, COL: COL, pulseAt: pulseAt
  };

  /* ============================================================
     PASS 2 — answer checking, soft gating, audio narration
     ============================================================ */

  /* persisted student state (survives refresh) */
  var STORE_KEY = 'dataquest-state-v1';
  var state = { answers: {}, claim: '', notes: '', skips: {}, muted: false };
  try {
    var saved = JSON.parse(localStorage.getItem(STORE_KEY));
    if (saved && typeof saved === 'object') {
      for (var sk in state) if (saved[sk] !== undefined) state[sk] = saved[sk];
    }
  } catch (e) { /* fresh start */ }
  function saveState() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { /* private mode */ }
  }

  var ANSWERS = { 1: 'D', 2: 'B', 3: 'B', 4: 'B', 6: 'B', 7: 'B', 8: 'C' };

  var nLow = QUAKES.filter(function (d) { return d.mag < 6; }).length;
  var n8 = QUAKES.filter(function (d) { return d.mag >= 8; }).length;

  var EXPLAIN = {
    1: 'Coordinates pin the point, the boundary zone explains the mechanism, and the surrounding dots supply the pattern. Real investigations stack all three clues — that is why “all of these together” is the strongest answer.',
    2: 'With 800 real quakes on the globe, arcs and bands appear that no single point could ever reveal. The dots don’t get less accurate and the map stays readable — what changes is that the <strong>pattern becomes visible</strong>.',
    3: 'Use the Compare chip to shuffle the dots at random and the difference is unmistakable: the real dots hug lines, arcs, and clusters along the Pacific rim. Earthquakes are anything but evenly spread.',
    4: 'Every USGS record stores a longitude, a latitude, a magnitude, a depth, and a time — the map draws two of those numbers and keeps the rest underneath. No field stores “the nearest city”; the place label is added afterwards for humans.',
    6: 'Raising the cutoff removes weak quakes <em>everywhere</em>, so if the pattern were an accident it would dissolve. Instead the survivors stay glued to the Pacific edge: the band sharpens. Filtering by groups is evidence, not decoration.',
    7: 'In this real sample, ' + nLow + ' of 800 quakes sit below M6.0, while only ' + n8 + ' reach M8.0 or above. Tall bars on the left, tiny bars far to the right — a long right tail means high-magnitude quakes are rare, not absent.',
    8: 'The best-fit line is nearly flat (correlation ≈ 0.1 in this sample), and shallow, intermediate, and deep quakes all span the same magnitude range. Depth does <strong>not</strong> predict magnitude here — and reporting “no clear relationship” is doing science correctly.'
  };

  var FB = {
    1: { ok: 'Exactly — point, zone, and pattern, stacked together. Watch them pulse on the map.', no: 'Each clue helps, but the power is in stacking all three — watch the map: point, zone, pattern.' },
    2: { ok: 'Right: more points, clearer shape. Watch Kobe stand alone — then rejoin the pattern.', no: 'Watch the globe: one lonely dot, then 800. The pattern is what changes.' },
    3: { ok: 'Yes — lines, arcs, clusters. Geometry just became evidence.', no: 'Follow the highlighted path: the dots hug it. That is not random scatter.' },
    4: { ok: 'Right — location, magnitude, depth, and time, in every dot.', no: 'Read the record card again: four kinds of fields, not one.' },
    6: { ok: 'Confirmed: the band sharpens as the weak quakes drop away.', no: 'Watch the survivors: they cling to the Pacific edge. The band stands out more, not less.' },
    7: { ok: 'Right — the long right tail means giants are rare.', no: 'Compare the bars: ' + nLow + ' small quakes vs ' + n8 + ' at M8+. Rare, not common.' },
    8: { ok: 'Exactly — no clear relationship, and that IS the finding.', no: 'Check the flat best-fit line: depth does not predict magnitude in this sample.' }
  };

  var completed = {}, skipUnlocked = state.skips || {}, doneCount = 0;

  function updateProgress() {
    document.getElementById('progress-fill').style.width = (doneCount / 9 * 100) + '%';
    document.getElementById('progress-label').textContent = doneCount + ' / 9 checks';
  }

  function complete(n) {
    if (completed[n]) return;
    completed[n] = true;
    document.getElementById('step-' + n).dataset.done = '1';
    doneCount++;
    updateProgress();
    applyGates();
  }

  function runEvidenceFx(n) {
    if (ctxs[n] && ctxs[n].evidenceFx) ctxs[n].evidenceFx();
  }

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
    fb.hidden = false;
    fb.className = 'mcq-feedback ' + (ok ? 'good' : 'bad');
    fb.innerHTML = (ok ? '<strong>Correct.</strong> ' : '<strong>Not quite — the correct answer is marked in green.</strong> ') + EXPLAIN[n];
    btn.disabled = true;
    btn.textContent = ok ? 'Correct ✓' : 'Answer revealed';
    if (!silent) runEvidenceFx(n);
    setInst(n, FB[n][ok ? 'ok' : 'no'], ok ? 'success' : 'error');
    complete(n);
  }

  function gradeRadio(n, btn) {
    var mcq = document.getElementById('mcq-' + n);
    var sel = mcq.querySelector('input:checked');
    if (!sel) { setInst(n, 'Pick an answer first, then check it.', 'warn'); return; }
    if (n === 6 && (!ctxs[6] || ctxs[6].sliderMax < 7)) {
      setInst(6, 'Evidence first: move the slider to M7.0 or higher and watch the map, then check your answer.', 'error');
      return;
    }
    state.answers[n] = sel.value;
    saveState();
    renderGradeRadio(n, sel.value, false);
  }

  function renderTags(values, silent) {
    var fb = document.querySelector('#mcq-5 .mcq-feedback');
    document.querySelectorAll('#mcq-5 input').forEach(function (i) {
      if (values.indexOf(i.value) !== -1) i.checked = true;
      i.disabled = true;
    });
    fb.hidden = false;
    fb.className = 'mcq-feedback good';
    fb.innerHTML = '<strong>Observations saved:</strong> ' + values.join(', ') +
      '. At the notice-and-wonder stage every honest observation counts — scientists collect descriptions first and argue about explanations later. Keep these words: you will need one of them for your final claim in Step 9.';
    var btn = document.querySelector('#mcq-5 .check-btn');
    btn.disabled = true;
    btn.textContent = 'Observations saved ✓';
    setInst(5, 'Saved: ' + values.join(', ') + ' — good noticing. The dots pulse to salute you.', 'success');
    if (!silent) runEvidenceFx(5);
    complete(5);
  }

  function gradeTags(btn) {
    var checked = Array.prototype.slice.call(document.querySelectorAll('#mcq-5 input:checked'))
      .map(function (i) { return i.value; });
    if (!checked.length) { setInst(5, 'Tag at least one shape you can honestly say you see.', 'warn'); return; }
    state.answers[5] = checked;
    saveState();
    renderTags(checked, false);
  }

  var GEO_TERMS = ['band', 'arc', 'line', 'cluster', 'curve', 'ring', 'path', 'loop', 'circle'];
  var PATTERN_TERMS = ['most', 'many', 'majority', 'rare', 'few', 'almost all', 'percent', 'half', 'nearly all'];

  function gradeClaim(btn) {
    var t = document.getElementById('claim-text').value.toLowerCase();
    if (t.trim().length < 15) {
      setInst(9, 'Write your claim first — a sentence or two in the box on the right.', 'warn');
      return;
    }
    var hasGeo = GEO_TERMS.some(function (w) { return t.indexOf(w) !== -1; });
    var hasNum = /\d/.test(t) || PATTERN_TERMS.some(function (w) { return t.indexOf(w) !== -1; });
    var fb = document.querySelector('#mcq-9 .mcq-feedback');
    if (!hasGeo || !hasNum) {
      fb.hidden = false;
      fb.className = 'mcq-feedback bad';
      var missing = [];
      if (!hasGeo) missing.push('a <strong>geometry term</strong> (band, arc, line, cluster…)');
      if (!hasNum) missing.push('a <strong>number or pattern observation</strong> (a count like “' + M6_ON_RING.length + ' of ' + M6.length + '”, or a word like “most” / “rare”)');
      fb.innerHTML = 'Almost — your claim still needs ' + missing.join(' and ') + '. The Frequency chip on the left gives you a real count to cite.';
      setInst(9, 'Strengthen the claim: pair a geometry word with a number or pattern word, like a scientist would.', 'error');
      return;
    }
    renderClaimAccepted(false);
  }

  function renderClaimAccepted(silent) {
    var fb = document.querySelector('#mcq-9 .mcq-feedback');
    var btn = document.querySelector('#mcq-9 .check-btn');
    fb.hidden = false;
    fb.className = 'mcq-feedback good';
    fb.innerHTML = '<strong>That is a claim with evidence.</strong> You named a geometric shape and backed it with a quantitative observation — exactly how the Ring of Fire was argued into textbooks. In this USGS sample: ' +
      M6_ON_RING.length + ' of ' + M6.length + ' M6+ quakes sit on the Ring, magnitudes show a long right tail, and depth does not predict magnitude.';
    btn.disabled = true;
    btn.textContent = 'Claim checked ✓';
    setInst(9, 'Claim accepted — geometry term plus pattern evidence. The Ring lights up for you.', 'success');
    if (!silent) runEvidenceFx(9);
    if (!silent) { state.answers[9] = true; saveState(); }
    complete(9);
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
      var pop = document.createElement('div');
      pop.className = 'gate-popup';
      pop.innerHTML =
        '<div class="gate-popup-inner">' +
        '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.4"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>' +
        '<span>Answer Step ' + (n - 1) + ' to continue</span>' +
        '<button class="gate-skip">Skip for now →</button>' +
        '</div>';
      frame.appendChild(pop);
      pop.querySelector('.gate-skip').addEventListener('click', function () {
        skipUnlocked[n] = true;   // unlocks this step WITHOUT marking step n-1 correct
        state.skips[n] = true;
        saveState();
        applyGates();
        if (currentStep === n) playStep(n);
      });
    }
    var col = sec.querySelector('.card-col');
    if (!col.querySelector('.gate-note')) {
      var note = document.createElement('div');
      note.className = 'gate-note';
      note.textContent = 'Locked: answer Step ' + (n - 1) + ' first, or use “Skip for now” on the left. Skipping won’t mark Step ' + (n - 1) + ' correct.';
      col.appendChild(note);
    }
    pauseAllAudio();   // a gate popup pauses audio immediately
  }

  function applyGates() {
    for (var n = 1; n <= 9; n++) {
      var sec = document.getElementById('step-' + n);
      var locked = !isUnlocked(n);
      sec.classList.toggle('locked', locked);
      if (!locked) {
        var pop = sec.querySelector('.gate-popup');
        if (pop) pop.remove();
        var note = sec.querySelector('.gate-note');
        if (note) note.remove();
      }
    }
  }
  applyGates();

  /* ---------- audio narration ---------- */
  var audios = {};
  for (var an = 1; an <= 9; an++) audios[an] = document.getElementById('audio-' + an);
  var audioUnlocked = false;
  var currentStep = 1;

  function pauseAllAudio(except) {
    for (var k in audios) { if (+k !== except && !audios[k].paused) audios[k].pause(); }
  }
  function playStep(n) {
    if (!audioUnlocked || state.muted || !isUnlocked(n)) return;
    pauseAllAudio(n);
    var a = audios[n];
    if (a && a.paused) {
      a.currentTime = 0;
      var pr = a.play();
      if (pr && pr.catch) pr.catch(function () { /* autoplay blocked; ignore */ });
    }
  }

  document.addEventListener('pointerdown', function unlockAudio() {
    var intro = document.getElementById('intro-screen');
    if (intro && !intro.hidden) return;   // wait for the deliberate "Begin" click
    audioUnlocked = true;
    document.removeEventListener('pointerdown', unlockAudio);
    playStep(currentStep);
  });

  var stepWatchIO = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (!e.isIntersecting) return;
      var n = +e.target.dataset.step;
      currentStep = n;
      if (!isUnlocked(n)) showGate(n);
      else playStep(n);
    });
  }, { threshold: 0.3 });
  document.querySelectorAll('.step').forEach(function (sec) { stepWatchIO.observe(sec); });

  /* ---------- mute toggle ---------- */
  var soundBtn = document.getElementById('nav-sound');
  function syncSoundBtn() {
    soundBtn.textContent = state.muted ? 'Sound: off' : 'Sound: on';
    soundBtn.style.background = state.muted ? '#52606D' : '';
  }
  soundBtn.addEventListener('click', function () {
    state.muted = !state.muted;
    saveState();
    syncSoundBtn();
    if (state.muted) pauseAllAudio();
    else playStep(currentStep);
  });
  syncSoundBtn();

  /* ---------- intro / start screen ---------- */
  var introScreen = document.getElementById('intro-screen');
  var introBegin = document.getElementById('intro-begin');
  var introMute = document.getElementById('intro-mute');
  if (introScreen && introBegin) {
    document.body.style.overflow = 'hidden';     // lock scroll behind the overlay
    if (introMute) introMute.checked = !!state.muted;
    introBegin.addEventListener('click', function () {
      if (introMute && introMute.checked) { state.muted = true; saveState(); syncSoundBtn(); }
      audioUnlocked = true;                       // this click is the user gesture that unlocks audio
      introScreen.classList.add('is-leaving');
      document.body.style.overflow = '';
      setTimeout(function () { introScreen.hidden = true; }, 500);
      var s1 = document.getElementById('step-1');
      if (s1) s1.scrollIntoView({ behavior: 'smooth' });
      currentStep = 1;
      playStep(1);
    });
  }

  /* ---------- restore persisted progress ---------- */
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
    else renderGradeRadio(rn, v, true);
  }
  applyGates();
})();
