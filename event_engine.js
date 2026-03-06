

  function typeEnabled(type) {
    const f = features();
    const map = f.eventTypes || null;
    const t = norm(type);
    if (!map) return true;
    if (Object.prototype.hasOwnProperty.call(map, t)) return !!map[t];
    return true;
  }

  function getLotsArray() {
    try {
      if (typeof LOTS !== "undefined" && Array.isArray(LOTS)) return LOTS;
    } catch (_) {}
    if (Array.isArray(window.LOTS)) return window.LOTS;
    if (Array.isArray(window.phaseResidentsData)) return window.phaseResidentsData;
    return [];
  }

  function getMappedSites() {
    try {
      if (typeof MAPPED_SITES !== "undefined") return MAPPED_SITES;
    } catch (_) {}
    return window.MAPPED_SITES;
  }

  function centroidFromPolygon(poly) {
    if (!Array.isArray(poly) || poly.length === 0) return null;
    let sx = 0, sy = 0, n = 0;

    for (const p of poly) {
      let x, y;
      if (Array.isArray(p) && p.length >= 2) { x = Number(p[0]); y = Number(p[1]); }
      else if (p && typeof p === "object") { x = Number(p.x); y = Number(p.y); }

      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      sx += x; sy += y; n++;
    }

    if (!n) return null;
    return { x: sx / n, y: sy / n };
  }

  function getEventCoordinates(ev) {
    if (!ev) return null;

    if (Number.isFinite(Number(ev.x)) && Number.isFinite(Number(ev.y))) {
      return { x: Number(ev.x) + Number(ev.offsetX || 0), y: Number(ev.y) + Number(ev.offsetY || 0) };
    }

    if (ev.lotNumber != null) {
      const lots = getLotsArray();
      const ln = Number(ev.lotNumber);
      const lot = lots.find(l => Number(l.lotNumber) === ln || Number(l.lotnumber) === ln);
      if (lot && Number.isFinite(Number(lot.x)) && Number.isFinite(Number(lot.y))) {
        return { x: Number(lot.x) + Number(ev.offsetX || 0), y: Number(lot.y) + Number(ev.offsetY || 0) };
      }
    }

    if (ev.siteId) {
      const src = getMappedSites();

      if (Array.isArray(src)) {
        const site = src.find(s => String(s.siteId || s.id || "") === String(ev.siteId));
        if (site) {
          const poly = site.polygon || site.points || site.path || site.coords;
          const c = centroidFromPolygon(poly);
          if (c) return { x: c.x + Number(ev.offsetX || 0), y: c.y + Number(ev.offsetY || 0) };
        }
      }

      if (src && typeof src === "object" && !Array.isArray(src)) {
        const site = src[ev.siteId] || src[String(ev.siteId)];
        if (site) {
          const poly = site.polygon || site.points || site.path || site.coords;
          const c = centroidFromPolygon(poly);
          if (c) return { x: c.x + Number(ev.offsetX || 0), y: c.y + Number(ev.offsetY || 0) };
        }
      }
    }

    return null;
  }
  window.getEventCoordinates = getEventCoordinates;

  function compileEvents(rows) {
    const src = Array.isArray(rows) ? rows : [];
    const out = [];

    for (const r of src) {
      if (!r) continue;
      const t = norm(r.type);
      if (!t) continue;
      if (r.enabled === false) continue;
      if (!typeEnabled(t)) continue;

      out.push({
        ...r,
        type: t,
        isActive: (r.isActive === false) ? false : true,
        animEnabled: !!(animationsEnabled() && r.animEnabled !== false)
      });
    }

    return out;
  }

  function refreshEventsFromTable() {
    window.EVENTS = compileEvents(window.EVENTS_TABLE);
    startAnimationsIfNeeded();
  }
  window.refreshEventsFromTable = refreshEventsFromTable;

  function isVisibleGator(ev) {
    if (!ev) return false;
    if (ev.isActive === false) return false;

    const t = norm(ev.type);
    if (t !== "alligator" && t !== "gator") return false;

    const types = (window.FEATURES && window.FEATURES.eventTypes) || {};
    if (types.alligator === false && types.gator === false) return false;

    return true;
  }

  let _animRunning = false;
  let _t0 = performance.now();

  function requestRedraw() {
    if (typeof window.safeDrawLots === "function") window.safeDrawLots();
    else if (typeof window.drawLots === "function") window.drawLots();
  }

  function tick() {
    if (!_animRunning) return;
    requestRedraw();
    requestAnimationFrame(tick);
  }

  function startAnimationsIfNeeded() {
    if (!animationsEnabled()) { _animRunning = false; return; }
    const evs = Array.isArray(window.EVENTS) ? window.EVENTS : [];
    const anyAnim = evs.some(e => isVisibleGator(e) && e.animEnabled);
    _animRunning = !!anyAnim;
    if (_animRunning) {
      _t0 = performance.now();
      requestAnimationFrame(tick);
    }
  }

function drawGator(ctx, x, y, ev) {
  // No pulse, no ring, just the icon
  ctx.save();

  // Soft shadow so the gator stands out on the map
  ctx.shadowColor = "rgba(0,0,0,0.35)";
  ctx.shadowBlur = 6;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 2;

  ctx.font = "30px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#111827";
  ctx.fillText("🐊", x, y-2);
  ctx.restore();
}

  function drawEvents(ctx) {
    if (!ctx) return;
    if (!eventsEnabled()) return;

    if (!Array.isArray(window.EVENTS)) refreshEventsFromTable();

    const evs = window.EVENTS || [];
    for (const ev of evs) {
      if (!isVisibleGator(ev)) continue;
      const pos = getEventCoordinates(ev);
      if (!pos) continue;
     if (ev.type === "tiki") {
  const size = 90;
  ctx.drawImage(tikiImg, pos.x - size/2, pos.y - size/2, size, size);
} else {
  drawGator(ctx, pos.x, pos.y, ev);
}
    }
  }
  window.drawEvents = drawEvents;

  function findEventAt(x, y) {
    if (!eventsEnabled()) return null;
    if (!Array.isArray(window.EVENTS)) refreshEventsFromTable();

    const r = Number(window.EVENT_HIT_RADIUS || 40);
    const thresholdSq = r * r;

    let best = null;
    let bestDist = thresholdSq;

    (window.EVENTS || []).forEach(ev => {
      if (!isVisibleGator(ev)) return;
      const pos = getEventCoordinates(ev);
      if (!pos) return;

      const dx = x - pos.x;
      const dy = y - pos.y;
      const d2 = dx * dx + dy * dy;

      if (d2 <= bestDist) {
        bestDist = d2;
        best = ev;
      }
    });

    return best;
  }
  window.findEventAt = findEventAt;

  function buildEventPopupContent(ev) {
    if (!ev) return "";
    const title = ev.label || ev.name || "Alligator";
    const body = ev.description || ev.desc || "";
    return (
      '<div class="popup-inner">' +
        "<h3>" + title + "</h3>" +
        (body ? "<p>" + body + "</p>" : "") +
        '<button class="popup-close" type="button">Close</button>' +
      "</div>"
    );
  }
  window.buildEventPopupContent = buildEventPopupContent;

  refreshEventsFromTable();
})();