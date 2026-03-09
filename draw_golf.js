// draw_golf.js
// Renders Shadow Golf overlays (routes + flags) on the existing Phase 7 canvas.
// Data source: window.GOLF_OVERLAY_DATA (see golf_overlay_data.js)
//
// Enhancements (2026-03-04 B):
//  - Darker, higher-contrast hole markers
//  - Selected hole flashes (no “glow” blur)
//  - Route drawn as a “road” (2-pass stroke) so it stands out against the map
//  - Smoothed route geometry (quadratic midpoint smoothing) + light RDP simplification
console.log("DRAW_GOLF LOADED MARKER", new Date().toISOString());
console.log("DRAW_GOLF VERSION STAMP: 2026-03-04 B");

(function () {
  "use strict";

  // -------------------------
  // Config (tune here)
  // -------------------------
  const RDP_EPSILON = 2.2;           // lower = more points kept; higher = more simplified
  const BASE_ROUTE_W = 8;            // base “road” width
  const INNER_ROUTE_W = 3.6;         // inner line width
  const SELECT_ROUTE_W = 10;         // selected base width
  const SELECT_INNER_W = 4.8;        // selected inner width
  const MARKER_OUTER_R = 10;
  const MARKER_INNER_R = 4.5;
  const SELECT_RING_R  = 18;
  const SELECT_RING_W  = 6;
  const FLASH_PERIOD_MS = 650;

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  // -------------------------
  // Time-based flashing
  // -------------------------
  function nowMs() {
    return (window.performance && typeof performance.now === "function") ? performance.now() : Date.now();
  }

  function flashAlpha(periodMs = FLASH_PERIOD_MS, minA = 0.12, maxA = 0.75) {
    const t = (nowMs() % periodMs) / periodMs;           // 0..1
    const s = 0.5 - 0.5 * Math.cos(t * Math.PI * 2);     // smooth 0..1
    return minA + (maxA - minA) * s;
  }

  // -------------------------
  // Edit state (web-only quick adjust)
  // -------------------------
  function getEdit() {
    if (!window.GOLF_EDIT) {
      window.GOLF_EDIT = {
        enabled: false,
        target: "flag",     // "flag" or "tee"
        hole_number: 1
      };
    }
    return window.GOLF_EDIT;
  }

  function getData() {
    return window.GOLF_OVERLAY_DATA || null;
  }

  // Selected hole comes from the main page dropdown (or other code)
  function getSelectedHoleNumber() {
    const n = Number(window.GOLF_ACTIVE_HOLE);
    return Number.isFinite(n) && n > 0 ? n : null; // null => “All holes”
  }

  // -------------------------
  // Optional edit UI in old header (safe no-op if not present)
  // -------------------------
  let _ensuringEditUI = false;

  function ensureEditUI() {
    if (_ensuringEditUI) return;
    _ensuringEditUI = true;

    try {
      const data = getData();
      if (!data || !Array.isArray(data.courses)) return;

      // Old UI hook (safe): if header isn't present, do nothing.
      const row1 = document.querySelector("header.top-bar .row1");
      if (!row1) return;

      let host = document.getElementById("golfControls");
      if (!host) {
        host = document.createElement("div");
        host.id = "golfControls";
        host.style.display = "flex";
        host.style.alignItems = "center";
        host.style.gap = "8px";
        host.style.marginLeft = "10px";
        host.style.flexWrap = "wrap";
        row1.appendChild(host);
      }

      // Label
      if (!document.getElementById("golfLabel")) {
        const lbl = document.createElement("span");
        lbl.id = "golfLabel";
        lbl.textContent = "Golf:";
        lbl.style.fontSize = "0.85rem";
        lbl.style.fontWeight = "700";
        host.appendChild(lbl);
      }

      // Course picker (old header style)
      if (typeof ensureCoursePicker === "function") {
        ensureCoursePicker();
      }

      // Adjust checkbox
      let cb = document.getElementById("golfAdjustCheckbox");
      if (!cb) {
        const wrap = document.createElement("label");
        wrap.style.display = "inline-flex";
        wrap.style.alignItems = "center";
        wrap.style.gap = "6px";
        wrap.style.fontSize = "0.82rem";
        wrap.style.color = "#e5e7eb";
        wrap.style.userSelect = "none";
        wrap.style.cursor = "pointer";

        cb = document.createElement("input");
        cb.type = "checkbox";
        cb.id = "golfAdjustCheckbox";
        cb.style.transform = "scale(1.05)";

        const txt = document.createElement("span");
        txt.textContent = "Adjust";

        wrap.appendChild(cb);
        wrap.appendChild(txt);
        host.appendChild(wrap);

        cb.addEventListener("change", function () {
          const ed = getEdit();
          ed.enabled = !!cb.checked;
          if (typeof window.safeDrawLots === "function") window.safeDrawLots();
          else if (typeof drawLots === "function") drawLots();
        });
      }

      // Hole select (adjust target hole)
      let holeSel = document.getElementById("golfHoleSelect");
      if (!holeSel) {
        holeSel = document.createElement("select");
        holeSel.id = "golfHoleSelect";
        holeSel.style.fontSize = "0.82rem";
        holeSel.style.padding = "3px 6px";
        holeSel.style.borderRadius = "8px";
        holeSel.style.border = "1px solid #9ca3af";

        for (let i = 1; i <= 18; i++) {
          const opt = document.createElement("option");
          opt.value = String(i);
          opt.textContent = "Hole " + i;
          holeSel.appendChild(opt);
        }

        holeSel.addEventListener("change", function () {
          const ed = getEdit();
          ed.hole_number = parseInt(holeSel.value, 10) || 1;
          if (typeof window.safeDrawLots === "function") window.safeDrawLots();
          else if (typeof drawLots === "function") drawLots();
        });

        host.appendChild(holeSel);
      }

      // Target select
      let targetSel = document.getElementById("golfTargetSelect");
      if (!targetSel) {
        targetSel = document.createElement("select");
        targetSel.id = "golfTargetSelect";
        targetSel.style.fontSize = "0.82rem";
        targetSel.style.padding = "3px 6px";
        targetSel.style.borderRadius = "8px";
        targetSel.style.border = "1px solid #9ca3af";

        const flagOpt = document.createElement("option");
        flagOpt.value = "flag";
        flagOpt.textContent = "Flag";

        const teeOpt = document.createElement("option");
        teeOpt.value = "tee";
        teeOpt.textContent = "Tee";

        targetSel.appendChild(flagOpt);
        targetSel.appendChild(teeOpt);

        targetSel.addEventListener("change", function () {
          const ed = getEdit();
          ed.target = targetSel.value === "tee" ? "tee" : "flag";
        });

        host.appendChild(targetSel);
      }

      // Sync UI from state
      const ed = getEdit();
      const cb2 = document.getElementById("golfAdjustCheckbox");
      const holeSel2 = document.getElementById("golfHoleSelect");
      const targetSel2 = document.getElementById("golfTargetSelect");

      if (cb2) cb2.checked = !!ed.enabled;
      if (holeSel2) holeSel2.value = String(ed.hole_number || 1);
      if (targetSel2) targetSel2.value = ed.target === "tee" ? "tee" : "flag";

    } finally {
      _ensuringEditUI = false;
    }
  }

  // -------------------------
  // RDP simplification (display-only)
  // -------------------------
  function perpDistance(p, a, b) {
    const dx = b.x - a.x, dy = b.y - a.y;
    if (dx === 0 && dy === 0) return Math.hypot(p.x - a.x, p.y - a.y);
    const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy);
    const tt = clamp(t, 0, 1);
    const proj = { x: a.x + tt * dx, y: a.y + tt * dy };
    return Math.hypot(p.x - proj.x, p.y - proj.y);
  }

  function simplifyRDP(points, epsilon) {
    if (!points || points.length < 3) return points || [];
    let maxDist = 0, index = 0;
    const a = points[0], b = points[points.length - 1];
    for (let i = 1; i < points.length - 1; i++) {
      const d = perpDistance(points[i], a, b);
      if (d > maxDist) { maxDist = d; index = i; }
    }
    if (maxDist > epsilon) {
      const left = simplifyRDP(points.slice(0, index + 1), epsilon);
      const right = simplifyRDP(points.slice(index), epsilon);
      return left.slice(0, -1).concat(right);
    }
    return [a, b];
  }

  // -------------------------
  // Smoothed path stroke (quadratic midpoint smoothing)
  // -------------------------
  function strokeSmoothPath(ctx, pts) {
    if (!Array.isArray(pts) || pts.length < 2) return;

    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);

    for (let i = 1; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      ctx.quadraticCurveTo(a.x, a.y, mx, my);
    }

    const last = pts[pts.length - 1];
    ctx.lineTo(last.x, last.y);
  }

  // -------------------------
  // Course selection
  // -------------------------
  function getActiveCourseName() {
    const data = getData();
    if (!data || !data.courses || !data.courses.length) return null;
    return window.GOLF_ACTIVE_COURSE || data.courses[0].course_name;
  }

  function setActiveCourseName(name) {
    window.GOLF_ACTIVE_COURSE = name;
    if (typeof window.safeDrawLots === "function") window.safeDrawLots();
    else if (typeof drawLots === "function") drawLots();
  }

  function ensureCoursePicker() {
    // Creates a simple course picker in the sticky header (legacy build).
    const data = getData();
    if (!data || !data.courses || !data.courses.length) return;

    if (document.getElementById("golfCoursePicker")) return;

    const headerRow = document.querySelector("header.top-bar .row1 .top-controls");
    if (!headerRow) return;

    const wrap = document.createElement("div");
    wrap.style.display = "flex";
    wrap.style.alignItems = "center";
    wrap.style.gap = "6px";

    const label = document.createElement("span");
    label.textContent = "Golf:";
    label.style.fontSize = "0.8rem";
    label.style.opacity = "0.9";

    const sel = document.createElement("select");
    sel.id = "golfCoursePicker";
    sel.style.fontSize = "0.82rem";
    sel.style.padding = "2px 6px";
    sel.style.borderRadius = "8px";
    sel.style.border = "1px solid #374151";
    sel.style.background = "#111827";
    sel.style.color = "#f9fafb";

    data.courses.forEach(c => {
      const opt = document.createElement("option");
      opt.value = c.course_name;
      opt.textContent = c.course_name;
      sel.appendChild(opt);
    });

    sel.value = getActiveCourseName();
    sel.addEventListener("change", () => setActiveCourseName(sel.value));

    wrap.appendChild(label);
    wrap.appendChild(sel);

    headerRow.insertBefore(wrap, headerRow.firstChild);
  }

  // -------------------------
  // Markers + route drawing
  // -------------------------
function drawHoleMarker(ctx, x, y, isSelected) {
  ctx.save();

  // Outer dark dot
  ctx.beginPath();
  ctx.arc(x, y, MARKER_OUTER_R, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(0,0,0,0.70)";
  ctx.fill();

  // Inner light dot
  ctx.beginPath();
  ctx.arc(x, y, MARKER_INNER_R, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(235,235,235,0.95)";
  ctx.fill();

  // Selected flashing ring (high contrast)
  if (isSelected) {
    const a = flashAlpha(FLASH_PERIOD_MS, 0.20, 0.95);

    // Dark halo ring (always visible)
    ctx.beginPath();
    ctx.arc(x, y, SELECT_RING_R, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(0,0,0,0.70)";
    ctx.lineWidth = SELECT_RING_W + 2;
    ctx.stroke();

    // Bright flashing ring (pulse)
    ctx.beginPath();
    ctx.arc(x, y, SELECT_RING_R, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(0, 210, 255, ${a})`; // turquoise/cyan pulse
    ctx.lineWidth = SELECT_RING_W;
    ctx.stroke();
  }

  ctx.restore();
}

  function strokeRouteRoadStyle(ctx, pts, isSelected) {
    // Build smoothed path
    strokeSmoothPath(ctx, pts);

    // Pass 1: dark base (reads like a road on the map)
    ctx.strokeStyle = "rgba(0,0,0,0.55)";
    ctx.lineWidth = isSelected ? SELECT_ROUTE_W : BASE_ROUTE_W;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.stroke();

    // Pass 2: inner bright line (flashes when selected)
    const innerAlpha = isSelected ? flashAlpha(FLASH_PERIOD_MS, 0.45, 0.95) : 0.65;
    ctx.strokeStyle = `rgba(255,255,255,${innerAlpha})`;
    ctx.lineWidth = isSelected ? SELECT_INNER_W : INNER_ROUTE_W;
    ctx.stroke();
  }
window.findGolfHoleAt = function (x, y) {
  try {
    const courseName = window.GOLF_ACTIVE_COURSE;
    const courses = (window.GOLF_OVERLAY_DATA && window.GOLF_OVERLAY_DATA.courses) || [];
    const course =
      courses.find(c => c.course_name === courseName || c.name === courseName) ||
      courses[0];

    if (!course) {
      console.log("GOLF HIT: no active course");
      return null;
    }

    const holes = course.holes || [];
    const hitRadius = 28;

    let bestHole = null;
    let bestDistSq = Infinity;

    console.log("GOLF HIT TEST click:", {
      x,
      y,
      course: course.course_name || course.name,
      holeCount: holes.length
    });

    for (const h of holes) {
      const hx = Number(h._hit_x);
      const hy = Number(h._hit_y);

      if (!Number.isFinite(hx) || !Number.isFinite(hy)) {
        continue;
      }

      const dx = x - hx;
      const dy = y - hy;
      const distSq = dx * dx + dy * dy;

      if (distSq <= hitRadius * hitRadius && distSq < bestDistSq) {
        bestHole = h;
        bestDistSq = distSq;
      }
    }

    console.log("GOLF HIT RESULT:", bestHole ? {
      hole: bestHole.hole_number,
      hole_name: bestHole.hole_name
    } : null);

    return bestHole;
  } catch (e) {
    console.warn("Golf hole hit test failed:", e);
  }

  return null;
};

  window.drawGolfOverlay = function (ctx) {
    const data = getData();
    if (!data || !data.courses || !data.courses.length) return;
    if (!ctx) return;

    // These are safe no-ops in the new toolbar build.
    ensureCoursePicker();
    ensureEditUI();

    const activeName = getActiveCourseName();
    const course = data.courses.find(c => c.course_name === activeName) || data.courses[0];
    if (!course) return;

    const selectedHole = getSelectedHoleNumber();

    // Main route (smoothed + simplified display)
    const ptsRaw = (course.paths && course.paths.main) ? course.paths.main : [];
    const pts = simplifyRDP(ptsRaw, RDP_EPSILON);

    ctx.save();
    ctx.globalAlpha = 1;

    // Route as road (always visible)
    strokeRouteRoadStyle(ctx, pts, false);

    // Hole markers (tee + flag) — selected hole flashes
    const holes = (course.holes || []);
    for (const h of holes) {
      const hn = Number(h.hole_number);
      if (!Number.isFinite(hn)) continue;

      const isSel = (selectedHole != null) ? (hn === selectedHole) : false;

      // Tee
      const tx = Number(h.tee_x);
      const ty = Number(h.tee_y);
      if (Number.isFinite(tx) && Number.isFinite(ty)) {
        ctx.globalAlpha = (selectedHole && !isSel) ? 0.55 : 1;
        drawHoleMarker(ctx, tx, ty, isSel);
      }

      // Flag
      const fx = Number(h.flag_x);
      const fy = Number(h.flag_y);
      if (Number.isFinite(fx) && Number.isFinite(fy)) {
        ctx.globalAlpha = (selectedHole && !isSel) ? 0.55 : 1;
        drawHoleMarker(ctx, fx, fy, isSel);

        // Label near flag (dark, readable)
        ctx.save();

let alpha = 1;

// Dim non-selected holes when one is selected
if (selectedHole && !isSel) {
  alpha = 0.55;
}

// Make selected hole label pulse
if (isSel) {
  alpha = flashAlpha(FLASH_PERIOD_MS, 0.75, 1);
}

ctx.globalAlpha = alpha;

ctx.font = "bold 20px system-ui, sans-serif";
ctx.textAlign = "center";
ctx.textBaseline = "middle";

const label = String(h.hole_number);
const lx = fx + 12;
const ly = fy;

// Save exact label position for tap hit testing
h._hit_x = lx;
h._hit_y = ly;

// White outline for readability
ctx.lineWidth = 3;
ctx.strokeStyle = "rgba(255,255,255,0.85)";
ctx.strokeText(label, lx, ly);

// Solid black text
ctx.fillStyle = "rgba(0,0,0,1)";
ctx.fillText(label, lx, ly);
ctx.restore();
      }

      // Keep existing “Adjust mode” ring (blue) so editing still works
      try {
        const ed = (window.GOLF_EDIT || {});
        if (ed.enabled && Number(ed.hole_number) === hn && Number.isFinite(fx) && Number.isFinite(fy)) {
          ctx.save();
          ctx.strokeStyle = "#2563eb";
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(fx, fy, 14, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
        }
      } catch (_) {}
    }

    ctx.restore();
  };

  window.addEventListener("load", function () {
    const data = getData();
    if (data && data.courses && data.courses.length && !window.GOLF_ACTIVE_COURSE) {
      window.GOLF_ACTIVE_COURSE = data.courses[0].course_name;
    }
    ensureCoursePicker();
    ensureEditUI();
  });
})();