// draw_sites.js
// Handles drawing mapped parks & ponds using MAPPED_SITES from mapped_sites.js.

const DEBUG_POLYGONS = false;

function orderPolygonPoints(points) {
  if (!points || points.length < 3) return points;

  let cx = 0, cy = 0;
  for (const p of points) {
    cx += p[0];
    cy += p[1];
  }
  cx /= points.length;
  cy /= points.length;

  return points
    .map(p => ({
      x: p[0],
      y: p[1],
      angle: Math.atan2(p[1] - cy, p[0] - cx)
    }))
    .sort((a, b) => a.angle - b.angle)
    .map(p => [p.x, p.y]);
}

function debugPolygonVertices(ctx, points) {
  points.forEach((p, i) => {
    ctx.beginPath();
    ctx.arc(p[0], p[1], 3, 0, Math.PI * 2);
    ctx.fillStyle = "red";
    ctx.fill();

    ctx.font = "10px system-ui, sans-serif";
    ctx.fillStyle = "black";
    ctx.fillText(i.toString(), p[0] + 4, p[1] - 4);
  });
}

// ------- special handling for Blue Guitar Park -------

function getPolygonBounds(points) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of points) {
    const x = p[0];
    const y = p[1];
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  return { minX, minY, maxX, maxY };
}

// MAPPED_SITES uses siteId: "BlueGuitarPark" for this polygon.
function isBlueGuitarPark(site) {
  return !!site && site.siteId === "BlueGuitarPark";
}

function drawGuitarIcon(ctx, x, y) {
  ctx.save();

  // Guitar body (two ellipses)
  ctx.beginPath();
  ctx.ellipse(x, y + 6, 22, 18, 0, 0, Math.PI * 2);
  ctx.ellipse(x, y - 10, 16, 12, 0, 0, Math.PI * 2);
ctx.fillStyle = "#3b82f6";  // Margaritaville blue
  ctx.fill();
ctx.strokeStyle = "#1e40af";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Sound hole
  ctx.beginPath();
  ctx.arc(x, y - 4, 4, 0, Math.PI * 2);
  ctx.fillStyle = "#111827";
  ctx.fill();

  // Neck
  ctx.beginPath();
  ctx.moveTo(x - 4, y - 26);
  ctx.lineTo(x + 4, y - 26);
  ctx.lineTo(x + 4, y - 42);
  ctx.lineTo(x - 4, y - 42);
  ctx.closePath();
  ctx.fillStyle = "#78350f";
  ctx.fill();

  // Strings
  ctx.strokeStyle = "#f9fafb";
  ctx.lineWidth = 0.6;
  for (let i = -2; i <= 2; i++) {
    ctx.beginPath();
    ctx.moveTo(x + i, y - 40);
    ctx.lineTo(x + i, y + 14);
    ctx.stroke();
  }

  ctx.restore();
}

function drawBeachBarIcon(ctx, x, y) {
  ctx.save();

  // TEMP DEBUG: big magenta dot so we KNOW it's drawing
  ctx.beginPath();
  ctx.arc(x, y, 10, 0, Math.PI * 2);
  ctx.fillStyle = "magenta";
  ctx.fill();



  // Icon
  ctx.font = "28px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
ctx.fillText("🍹", x, y);

  // Label (black text with white outline, consistent with your hole labels)
  const label = "19th Hole";
  ctx.font = "bold 16px system-ui, sans-serif";
  ctx.lineWidth = 4;
  ctx.strokeStyle = "white";
  ctx.strokeText(label, x, y + 22);

  ctx.fillStyle = "black";
  ctx.fillText(label, x, y + 22);

  ctx.restore();
}
function drawBlueGuitarPark(ctx, points) {
  const ordered = orderPolygonPoints(points);
  if (!ordered || ordered.length < 3) return;

  const bounds = getPolygonBounds(ordered);

  ctx.save();

  // Path
  ctx.beginPath();
  ctx.moveTo(ordered[0][0], ordered[0][1]);
  for (let i = 1; i < ordered.length; i++) {
    ctx.lineTo(ordered[i][0], ordered[i][1]);
  }
  ctx.closePath();

  // Blue gradient fill
  const grad = ctx.createLinearGradient(
    bounds.minX,
    bounds.minY,
    bounds.maxX,
    bounds.maxY
  );
  grad.addColorStop(0, "#bfdbfe");
  grad.addColorStop(1, "#1e40af");

  ctx.fillStyle = grad;
  ctx.strokeStyle = "rgba(15,23,42,0.9)";
  ctx.lineWidth = 2;

  ctx.fill();
  ctx.stroke();

  // Centered guitar icon
  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerY = (bounds.minY + bounds.maxY) / 2;
  drawGuitarIcon(ctx, centerX, centerY);

// 19th Hole Beach Bar

drawBeachBarIcon(ctx, centerX, centerY + 85);

  // Label above park
  ctx.fillStyle = "#0f172a";
  ctx.font = "bold 14px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";
  ctx.fillText("Blue Guitar Park", centerX, bounds.minY - 4);

  if (DEBUG_POLYGONS) {
    debugPolygonVertices(ctx, ordered);
  }

  ctx.restore();
}

// ------- generic polygon drawing -------

function drawPolygon(ctx, points, type) {
  if (!points || points.length < 3) return;

  const ordered = orderPolygonPoints(points);

  let stroke = "rgba(0,255,255,0.9)";
  let fill = "rgba(0,255,255,0.15)";

  if (type === "park") {
    stroke = "rgba(0,200,0,0.9)";
    fill = "rgba(0,200,0,0.15)";
  }

  ctx.beginPath();
  ctx.moveTo(ordered[0][0], ordered[0][1]);
  for (let i = 1; i < ordered.length; i++) {
    ctx.lineTo(ordered[i][0], ordered[i][1]);
  }
  ctx.closePath();

  ctx.fillStyle = fill;
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 2;

  ctx.fill();
  ctx.stroke();

  if (DEBUG_POLYGONS) {
    debugPolygonVertices(ctx, ordered);
  }
}

function drawSite(ctx, site) {
  if (!site || !site.polygon) return;

  // Do NOT draw ponds (still keep them for hit detection)
  if (site.type === "pond") return;

  if (isBlueGuitarPark(site)) {
    drawBlueGuitarPark(ctx, site.polygon);
  } else {
    drawPolygon(ctx, site.polygon, site.type);
  }
}

function drawAllMappedSites(ctx) {
  if (typeof MAPPED_SITES === "undefined" || !Array.isArray(MAPPED_SITES)) return;

  // Expose for event_engine siteId resolution (one-time)
  if (!window.MAPPED_SITES) window.MAPPED_SITES = MAPPED_SITES;

  if (!window.SITES_BY_ID) window.SITES_BY_ID = {};
  MAPPED_SITES.forEach(site => {
    const key = String(site.id || site.siteId || site.name || "").trim();
    if (!key) return;
    window.SITES_BY_ID[key] = site; // keep full site object (expects site.x/site.y)
  });

  MAPPED_SITES.forEach(site => {
    drawSite(ctx, site);
  });
}
