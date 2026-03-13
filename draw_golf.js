// draw_golf.js
// Renders Shadow Golf overlays (routes + flags) on the existing Phase 7 canvas.
// Data source: window.GOLF_OVERLAY_DATA (see golf_overlay_data.js)
console.log("DRAW_GOLF LOADED MARKER", new Date().toISOString());
console.log("DRAW_GOLF VERSION STAMP: 2026-03-13 FIX C");

(function () {
  "use strict";

  const RDP_EPSILON = 2.2;
  const BASE_ROUTE_W = 8;
  const INNER_ROUTE_W = 3.6;
  const SELECT_ROUTE_W = 10;
  const SELECT_INNER_W = 4.8;
  const MARKER_OUTER_R = 10;
  const MARKER_INNER_R = 4.5;
  const SELECT_RING_R = 18;
  const SELECT_RING_W = 6;
  const FLASH_PERIOD_MS = 650;

  function clamp(v, a, b) {
    return Math.max(a, Math.min(b, v));
  }

  function nowMs() {
    return (window.performance && typeof performance.now === "function") ? performance.now() : Date.now();
  }

  function flashAlpha(periodMs = FLASH_PERIOD_MS, minA = 0.12, maxA = 0.75) {
    const t = (nowMs() % periodMs) / periodMs;
    const s = 0.5 - 0.5 * Math.cos(t * Math.PI * 2);
    return minA + (maxA - minA) * s;
  }

  function getEdit() {
    if (!window.GOLF_EDIT) {
      window.GOLF_EDIT = {
        enabled: false,
        target: "flag",
        hole_number: 1
      };
    }
    return window.GOLF_EDIT;
  }

  function getData() {
    return window.GOLF_OVERLAY_DATA || null;
  }

  function getActiveCourseName() {
    const data = getData();
    if (!data || !Array.isArray(data.courses) || !data.courses.length) return null;
    return window.GOLF_ACTIVE_COURSE || data.courses[0].course_name;
  }

  function getActiveCourse() {
    const data = getData();
    if (!data || !Array.isArray(data.courses) || !data.courses.length) return null;
    const activeName = getActiveCourseName();
    return data.courses.find(c => c.course_name === activeName) || data.courses[0];
  }

  function setActiveCourseName(name) {
    window.GOLF_ACTIVE_COURSE = name;
    if (typeof window.safeDrawLots === "function") window.safeDrawLots();
    else if (typeof window.drawLots === "function") window.drawLots();
  }

  let _ensuringEditUI = false;

  function ensureEditUI() {
    if (_ensuringEditUI) return;
    _ensuringEditUI = true;

    try {
      const data = getData();
      if (!data || !Array.isArray(data.courses) || !data.courses.length) return;

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

      if (!document.getElementById("golfLabel")) {
        const lbl = document.createElement("span");
        lbl.id = "golfLabel";
        lbl.textContent = "Golf:";
        lbl.style.fontSize = "0.85rem";
        lbl.style.fontWeight = "700";
        host.appendChild(lbl);
      }

      if (typeof ensureCoursePicker === "function") {
        ensureCoursePicker();
      }

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
          else if (typeof window.drawLots === "function") window.drawLots();
        });
      }

      let holeSel = document.getElementById("golfHoleSelect");
      if (!holeSel) {
        holeSel = document.createElement("select");
        holeSel.id = "golfHoleSelect";
        holeSel.style.fontSize = "0.82rem";
        holeSel.style.padding = "3px 6px";
        holeSel.style.borderRadius = "8px";
        holeSel.style.border = "1px solid #9ca3af";
        host.appendChild(holeSel);

        holeSel.addEventListener("change", function () {
          const hn = parseInt(holeSel.value, 10) || 1;
          const ed = getEdit();
          ed.hole_number = hn;
          window.GOLF_SELECTED_HOLE = hn;

          const course = getActiveCourse();
          const hole = course && Array.isArray(course.holes)
            ? course.holes.find(h => Number(h.hole_number) === hn)
            : null;

          if (hole) {
            if (typeof window.centerMapOn === "function") {
              const fx = Number(hole.flag_x);
              const fy = Number(hole.flag_y);
              if (Number.isFinite(fx) && Number.isFinite(fy)) {
                window.centerMapOn(fx, fy);
              }
            }
            if (typeof window.showHolePopup === "function") {
              window.showHolePopup(hole);
            }
          }

          if (typeof window.safeDrawLots === "function") {
            window.safeDrawLots();
          } else if (typeof window.drawLots === "function") {
            window.drawLots();
          }
        });
      }

      const activeCourse = getActiveCourse();
      const activeHoles = (activeCourse && Array.isArray(activeCourse.holes)) ? activeCourse.holes : [];
      const currentOptions = Array.from(holeSel.options).map(o => o.value).join(",");
      const desiredOptions = activeHoles.map(h => String(Number(h.hole_number))).join(",");
      if (currentOptions !== desiredOptions) {
        holeSel.innerHTML = "";
        activeHoles.forEach(h => {
          const opt = document.createElement("option");
          opt.value = String(Number(h.hole_number));
          opt.textContent = "Hole " + String(Number(h.hole_number));
          holeSel.appendChild(opt);
        });
      }

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

      const ed = getEdit();
      const cb2 = document.getElementById("golfAdjustCheckbox");
      const holeSel2 = document.getElementById("golfHoleSelect");
      const targetSel2 = document.getElementById("golfTargetSelect");
      const selectedHole = Number(window.GOLF_SELECTED_HOLE);

      if (cb2) cb2.checked = !!ed.enabled;
      if (holeSel2 && holeSel2.options.length) {
        const selectedValue = Number.isFinite(selectedHole) ? String(selectedHole) : String(ed.hole_number || 1);
        holeSel2.value = selectedValue;
      }
      if (targetSel2) targetSel2.value = ed.target === "tee" ? "tee" : "flag";

    } finally {
      _ensuringEditUI = false;
    }
  }

  function perpDistance(p, a, b) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    if (dx === 0 && dy === 0) return Math.hypot(p.x - a.x, p.y - a.y);
    const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy);
    const tt = clamp(t, 0, 1);
    const proj = { x: a.x + tt * dx, y: a.y + tt * dy };
    return Math.hypot(p.x - proj.x, p.y - proj.y);
  }

  function simplifyRDP(points, epsilon) {
    if (!points || points.length < 3) return points || [];
    let maxDist = 0;
    let index = 0;
    const a = points[0];
    const b = points[points.length - 1];
    for (let i = 1; i < points.length - 1; i++) {
      const d = perpDistance(points[i], a, b);
      if (d > maxDist) {
        maxDist = d;
        index = i;
      }
    }
    if (maxDist > epsilon) {
      const left = simplifyRDP(points.slice(0, index + 1), epsilon);
      const right = simplifyRDP(points.slice(index), epsilon);
      return left.slice(0, -1).concat(right);
    }
    return [a, b];
  }

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

  function ensureCoursePicker() {
    const data = getData();
    if (!data || !Array.isArray(data.courses) || !data.courses.length) return;
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
    sel.addEventListener("change", function () {
      setActiveCourseName(sel.value);
    });

    wrap.appendChild(label);
    wrap.appendChild(sel);
    headerRow.insertBefore(wrap, headerRow.firstChild);
  }

  function drawHoleMarker(ctx, x, y, isSelected) {
    ctx.save();

    ctx.beginPath();
    ctx.arc(x, y, MARKER_OUTER_R, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(0,0,0,0.70)";
    ctx.fill();

    ctx.beginPath();
    ctx.arc(x, y, MARKER_INNER_R, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(235,235,235,0.95)";
    ctx.fill();

    if (isSelected) {
      const a = flashAlpha(FLASH_PERIOD_MS, 0.20, 0.95);

      ctx.beginPath();
      ctx.arc(x, y, SELECT_RING_R, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(0,0,0,0.70)";
      ctx.lineWidth = SELECT_RING_W + 2;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(x, y, SELECT_RING_R, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(0, 210, 255, ${a})`;
      ctx.lineWidth = SELECT_RING_W;
      ctx.stroke();
    }

    ctx.restore();
  }

  function strokeRouteRoadStyle(ctx, pts, isSelected) {
    if (!Array.isArray(pts) || pts.length < 2) return;

    strokeSmoothPath(ctx, pts);

    ctx.strokeStyle = "rgba(0,0,0,0.45)";
    ctx.lineWidth = isSelected ? SELECT_ROUTE_W : BASE_ROUTE_W;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.stroke();

    const innerAlpha = isSelected ? flashAlpha(FLASH_PERIOD_MS, 0.80, 1.00) : 0.95;
    ctx.strokeStyle = `rgba(255,255,0,${innerAlpha})`;
    ctx.lineWidth = isSelected ? (SELECT_INNER_W + 1) : (INNER_ROUTE_W + 1);
    ctx.stroke();
  }

  window.findGolfHoleAt = function (x, y) {
    try {
      const course = getActiveCourse();
      if (!course) {
        console.log("GOLF HIT: no active course");
        return null;
      }

      const holes = course.holes || [];
      const hitRadius = 36;
      let bestHole = null;
      let bestDistSq = Infinity;

      console.log("GOLF HIT TEST click:", {
        x,
        y,
        course: course.course_name,
        holeCount: holes.length
      });

      for (const h of holes) {
        const hx = Number(h._hit_x);
        const hy = Number(h._hit_y);
        if (!Number.isFinite(hx) || !Number.isFinite(hy)) continue;

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
        hole_name: bestHole.holename
      } : null);

      return bestHole;
    } catch (e) {
      console.warn("Golf hole hit test failed:", e);
    }

    return null;
  };

  window.drawGolfOverlay = function (ctx) {
    const data = getData();
    if (!data || !Array.isArray(data.courses) || !data.courses.length) return;
    if (!ctx) return;

    ensureCoursePicker();
    ensureEditUI();

    const course = getActiveCourse();
    if (!course) return;

    const ptsRaw = (course.paths && course.paths.main) ? course.paths.main : [];
    const pts = ptsRaw; // keep raw points while debugging mobile/selection behavior

    ctx.save();
    ctx.globalAlpha = 1;

    strokeRouteRoadStyle(ctx, pts, false);

    const holes = course.holes || [];
    const selectedHole = Number(window.GOLF_SELECTED_HOLE);
    const hasSelectedHole = Number.isFinite(selectedHole);

    for (const h of holes) {
      const hn = Number(h.hole_number);
      if (!Number.isFinite(hn)) continue;

      const isSel = hasSelectedHole && hn === selectedHole;

      const tx = Number(h.tee_x);
      const ty = Number(h.tee_y);
      if (Number.isFinite(tx) && Number.isFinite(ty)) {
        ctx.globalAlpha = (hasSelectedHole && !isSel) ? 0.55 : 1;
        drawHoleMarker(ctx, tx, ty, isSel);
      }

      const fx = Number(h.flag_x);
      const fy = Number(h.flag_y);
      if (Number.isFinite(fx) && Number.isFinite(fy)) {
        ctx.globalAlpha = (hasSelectedHole && !isSel) ? 0.55 : 1;
        drawHoleMarker(ctx, fx, fy, isSel);

        ctx.save();

        let alpha = 1;
        if (hasSelectedHole && !isSel) alpha = 0.55;
        if (isSel) alpha = flashAlpha(FLASH_PERIOD_MS, 0.75, 1);

        ctx.globalAlpha = alpha;
        ctx.font = "bold 20px system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        const label = String(h.hole_number);
        const lx = fx + 12;
        const ly = fy;

        h._hit_x = lx;
        h._hit_y = ly;

        ctx.lineWidth = 3;
        ctx.strokeStyle = "rgba(255,255,255,0.85)";
        ctx.strokeText(label, lx, ly);

        ctx.fillStyle = "#ffff00";
        ctx.fillText(label, lx, ly);
        ctx.restore();
      }

      try {
        const ed = window.GOLF_EDIT || {};
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
    if (data && Array.isArray(data.courses) && data.courses.length && !window.GOLF_ACTIVE_COURSE) {
      window.GOLF_ACTIVE_COURSE = data.courses[0].course_name;
    }
    ensureCoursePicker();
    ensureEditUI();
  });
})();
