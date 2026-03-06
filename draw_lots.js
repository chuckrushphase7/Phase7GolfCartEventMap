// draw_lots.js
// Restoration Orchestrator – 2026-03-04
//
// Goals:
// - Keep ALL lots clickable (even lots formerly marked as seasonal stations)
// - When ENABLE_SEASON_STATIONS=false, suppress station DOTS (but do not hide the lot for hit testing)
// - Preserve existing render order: base map -> sites -> lots -> golf overlay -> events -> snow overlay

function isSeasonStation(lot) {
  return !!(lot && lot.isChristmasStation);
}

// map_core.js calls this (e.g., findLotAt). Must exist globally.
// Contract:
// - seasonOnly mode: ONLY stations, ONLY if stations enabled
// - normal mode: never hide stations (keep clickable)
function shouldShowLot(lot) {
  if (!lot) return false;

  const seasonOnly = !!window.isSeasonOnly;
  const showSeasonStations = !!window.ENABLE_SEASON_STATIONS;

  if (seasonOnly) {
    if (!isSeasonStation(lot)) return false;
    if (!showSeasonStations) return false;
    return true;
  }

  // Normal mode: keep all lots eligible for hit testing.
  return true;
}

function drawLots() {
  // ctx/canvas/mapImg are created in map_core.js.
  // If drawLots is called before initMap finishes, just skip quietly.

  if (typeof ctx === "undefined" || typeof canvas === "undefined" || typeof mapImg === "undefined") {
    return;
  }

  if (!ctx || !canvas || !mapImg || !mapImg.complete) {
    return;
  }

  const showSeasonStations = !!window.ENABLE_SEASON_STATIONS;
if (typeof window.drawGolfOverlay === "function") {
  window.drawGolfOverlay(ctx);
}
  // 1) Base map (force raw canvas coordinate space)
  if (typeof ctx.resetTransform === "function") {
    ctx.resetTransform();
  } else {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(mapImg, 0, 0, canvas.width, canvas.height);

  // 2) Sites (ponds/parks)
  if (typeof drawAllMappedSites === "function") {
    drawAllMappedSites(ctx);
  }

  // 3) Lots (dots)
if (Array.isArray(LOTS)) {
  LOTS.forEach(lot => {
    if (!shouldShowLot(lot)) return;

    const x = Number(lot.x);
    const y = Number(lot.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;

    const station = isSeasonStation(lot);

    // Only draw dots for season stations
    if (!station || !showSeasonStations) return;

    ctx.beginPath();
    ctx.arc(x, y, 5, 0, Math.PI * 2);
    ctx.fillStyle = "#2563eb";
    ctx.fill();
    ctx.closePath();
  });
}

  // 4) Golf overlay
  if (typeof drawGolfOverlay === "function") {
    drawGolfOverlay(ctx);
  }

  // 5) Events (table-driven via event_engine.js)
  if (typeof window.drawEvents === "function") {
    window.drawEvents(ctx);
  } else if (typeof drawEvents === "function") {
    drawEvents(ctx);
  }

  // 6) Snow overlay (no-op in event_engine.js)
    if (typeof window.drawSnowOverlay === "function") {
    window.drawSnowOverlay(ctx);
  }

  // Draw events LAST so they appear on top (in raw canvas coords)
  if (window.ENABLE_EVENTS !== false && typeof window.drawEvents === "function") {
    ctx.save();

    // Reset any leaked transforms from earlier drawing (zoom/translate/etc.)
    if (typeof ctx.resetTransform === "function") {
      ctx.resetTransform();
    } else {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    }

    window.drawEvents(ctx);

    ctx.restore();
  }
}

function getSeasonDetails(lot) {
  return (lot && (lot.christmasStationDetails || lot.seasonDetails)) || "";
}

// Expose for map_core.js
window.drawLots = drawLots;
window.shouldShowLot = shouldShowLot;
window.isSeasonStation = isSeasonStation;
window.getSeasonDetails = getSeasonDetails;
