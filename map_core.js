// map_core.js
// Core Phase 7 app logic: state, popups, map init, APK button.
"use strict";
console.log("========== LMHH MAP BUILD ==========");
console.log("Build loaded:", new Date().toLocaleString());
console.log("====================================");
console.log("MAP_CORE LOADED MARKER v3", new Date().toISOString());
const RESIDENT_PASSWORD = "parrotHead";
// Default events ON unless explicitly set to false somewhere else BEFORE this file loads
window.ENABLE_EVENTS = (window.ENABLE_EVENTS !== false);
window.setAppMode = function(mode) {

  window.MODE = mode;

  // Resident mode = unlocked
  if (mode === "resident") {
    isUnlocked = true;
    isSeasonOnly = false;
  }
  // Event mode = locked
  else {
    isUnlocked = false;
    isSeasonOnly = true;
  }

  updateLockStatusUI();

  if (typeof safeDrawLots === "function") safeDrawLots();
  else if (typeof drawLots === "function") drawLots();
};
function safeInit() {
  try {
    initMap();
  } catch (e) {
    console.error("initMap failed:", e);
  }
}

let PASSWORD = "Rudolf122025";
let currentSeasonName = "Special Event";

let isSeasonOnly = true;
let isUnlocked = false;
window.ENABLE_SEASON_STATIONS = false;

let canvas, ctx, mapImg, mapWrapper;

document.addEventListener(
  "click",
  function (e) {
    const el = document.elementFromPoint(e.clientX, e.clientY);
    if (e.target.closest && e.target.closest(".popup-close")) {
      console.log("CLICK TARGET is popup-close ✅", e.target);
    } else if (el && el.closest && el.closest(".popup-close")) {
      console.log("elementFromPoint is popup-close ✅", el);
    } else {
      console.log("CLICK landed on:", e.target, " elementFromPoint:", el);
    }
  },
  true
);
function pointInPolygon(x, y, polygon) {
  if (!Array.isArray(polygon) || polygon.length < 3) return false;

  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i][0], yi = polygon[i][1];
    const xj = polygon[j][0], yj = polygon[j][1];

    const intersect =
      ((yi > y) !== (yj > y)) &&
      (x < ((xj - xi) * (y - yi)) / ((yj - yi) || 1e-9) + xi);

    if (intersect) inside = !inside;
  }
  return inside;
}

function findMappedSiteAt(x, y) {
  const sites =
    window.MAPPED_SITES ||
    window.mapped_sites ||
    window.MappedSites ||
    [];

  for (const site of sites) {
    if (site.polygon && pointInPolygon(x, y, site.polygon)) {
      return site;
    }

    if (site.bounds) {
      if (
        x >= site.bounds.minX &&
        x <= site.bounds.maxX &&
        y >= site.bounds.minY &&
        y <= site.bounds.maxY
      ) {
        return site;
      }
    }
  }

  return null;
}

function findEventForSite(siteId) {
  const events =
    window.EVENTS ||
    [];

  return events.find(function (ev) {
    return ev && ev.isActive && ev.siteId === siteId;
  }) || null;
}
function safeDrawLots() {
  if (!ctx || !mapImg || !mapImg.complete || !mapImg.width) return;
  try {
    drawLots();
  } catch (e) {
    console.warn("safeDrawLots drawLots failed", e);
  }
}

let zoomScale = 1;

// LOTS from phase7_merged_lots.js
const LOTS = typeof phaseResidentsData !== "undefined" ? phaseResidentsData : [];

// ===============================
// Shadow Golf Digitizer (holes + boundary + cart paths)
// ===============================
let DIGITIZE_MODE = false;
let digitizeCourseId = null;

let digitizeBoundary = [];
let digitizeHoles = {};
let digitizeNextHole = 1;

let digitizePaths = {};
let digitizeCurrentPath = null;

// -----------------------------------
// Popup/canvas click suppression (SINGLE source of truth)
// -----------------------------------
let suppressNextCanvasClickUntil = 0;

function suppressCanvasClicks(ms = 800) {
  suppressNextCanvasClickUntil = Date.now() + ms;
}

function isCanvasClickSuppressed() {
  const suppressed = Date.now() < suppressNextCanvasClickUntil;
  console.log("isCanvasClickSuppressed", {
    now: Date.now(),
    until: suppressNextCanvasClickUntil,
    suppressed
  });
  return suppressed;
}

// -----------------------------------
// Popup hide (clean: just close + focus management)
// -----------------------------------
function hidePopup() {
  const popup = document.getElementById("popup");
  if (!popup) {
    console.warn("hidePopup(): popup not found");
    return;
  }

  if (document.activeElement && document.activeElement.blur) {
    document.activeElement.blur();
  }

  popup.classList.add("hidden");
  popup.setAttribute("aria-hidden", "true");
  popup.style.display = "none";
  popup.style.visibility = "hidden";
  popup.style.pointerEvents = "none";

  console.log("hidePopup(): forced hidden; display=", getComputedStyle(popup).display);
}
window.hidePopup = hidePopup;

window.setDigitizeMode = function (on, opts = {}) {
  DIGITIZE_MODE = !!on;
  digitizeCourseId = opts.courseId != null ? opts.courseId : digitizeCourseId;
  console.log("Digitize mode:", DIGITIZE_MODE ? "ON" : "OFF");
};

window.digitizeReset = function () {
  digitizeBoundary = [];
  digitizeHoles = {};
  digitizeNextHole = 1;
  digitizePaths = {};
  digitizeCurrentPath = null;
  console.log("Digitizer reset.");
};

window.digitizeSetNextHole = function (n) {
  digitizeCurrentPath = null;
  digitizeNextHole = Number(n) || 1;
  console.log("Next hole:", digitizeNextHole);
};

window.digitizeStartPath = function (name) {
  const nm = String(name || "").trim();
  if (!nm) return;
  digitizeCurrentPath = nm;
  if (!digitizePaths[nm]) digitizePaths[nm] = [];
  console.log("Digitizing path:", nm);
};

window.digitizeStopPath = function () {
  digitizeCurrentPath = null;
  console.log("Stopped path digitizing.");
};

window.digitizeExport = function () {
  const payload = {
    courseId: digitizeCourseId,
    boundary: digitizeBoundary,
    holes: digitizeHoles,
    paths: digitizePaths,
  };
  console.log(JSON.stringify(payload, null, 2));
  return payload;
};

// Map-wrapper aware coordinate conversion (preserves 1500x1500 pixel space)
function getCanvasXYFromClient(clientX, clientY) {
  const wrapRect = mapWrapper.getBoundingClientRect();
  const xInWrap = clientX - wrapRect.left;
  const yInWrap = clientY - wrapRect.top;

  const xContent = (xInWrap + mapWrapper.scrollLeft) / zoomScale;
  const yContent = (yInWrap + mapWrapper.scrollTop) / zoomScale;

  return { x: xContent, y: yContent };
}

// Layout-based zoom: resize canvas via CSS; keep canvas pixel space constant
function setZoom(scale) {
  zoomScale = Math.max(0.25, Math.min(2.5, scale));
  const c = document.getElementById("mapCanvas");
  if (!c || !c.width || !c.height) return;
  c.style.width = c.width * zoomScale + "px";
  c.style.height = c.height * zoomScale + "px";
}
window.setZoom = setZoom;

// ------------------------
// Season + lock UI
// ------------------------
function getSeasonIcon(name) {
  const lower = (name || "").toLowerCase();
  if (lower.indexOf("halloween") >= 0) return "🎃";
  if (lower.indexOf("christmas") >= 0) return "🎄";
  if (lower.indexOf("holiday") >= 0) return "🎉";
  if (lower.indexOf("light") >= 0) return "✨";
  if (lower.indexOf("spring") >= 0) return "🌸";
  if (lower.indexOf("summer") >= 0) return "☀️";
  if (lower.indexOf("fall") >= 0 || lower.indexOf("autumn") >= 0) return "🍂";
  return "⭐";
}

function updateSeasonToggleLabel() {
  const span = document.getElementById("seasonOnlyLabel");
  if (!span) return;
  const icon = getSeasonIcon(currentSeasonName);
  // You currently force "Event Only" — keeping your intent, but leaving icon unused
  span.textContent = "Event Only";
}

function updateLockStatusUI() {
  const el = document.getElementById("lockStatus");
  if (!el) return;
  el.textContent = isUnlocked ? "Full map unlocked (session only)" : "Season view only (privacy mode)";
}

// ------------------------
// Fetch season + password (web only)
// ------------------------
function fetchSeasonName() {
  fetch("season_name.txt")
    .then(function (r) {
      return r.text();
    })
    .then(function (text) {
      const trimmed = text.trim();
      if (trimmed) currentSeasonName = trimmed;
      updateSeasonToggleLabel();
    })
    .catch(function () {
      updateSeasonToggleLabel();
    });
}

function fetchPassword() {
  // Password now hardcoded in UI prompt
}

// ------------------------
// APK label + download
// ------------------------
function updateApkButtonLabel() {
  if (typeof APK_LAST_UPDATED === "undefined") return;
  const btn = document.getElementById("apkDownloadButton");
  if (!btn) return;
  btn.textContent = "Download Android App (" + APK_LAST_UPDATED + ")";
}

function handleAndroidDownloadClick() {
  window.location.href = "https://chuckrushphase7.github.io/Phase7Data/Phase7Residents.apk";
}
window.handleAndroidDownloadClick = handleAndroidDownloadClick;

// ------------------------
// Privacy panel
// ------------------------
function setupPrivacyPanel() {
  const btn = document.getElementById("privacyButton");
  const panel = document.getElementById("privacyPanel");
  const closeBtn = document.getElementById("privacyCloseButton");

  if (!btn || !panel || !closeBtn) return;

  btn.addEventListener("click", function () {
    panel.classList.remove("hidden");
  });

  closeBtn.addEventListener("click", function () {
    panel.classList.add("hidden");
  });

  panel.addEventListener("click", function (e) {
    if (e.target === panel) panel.classList.add("hidden");
  });
}

// ------------------------
// Lot popup helpers
// (these use helpers from draw_lots.js: isSeasonStation, getSeasonDetails, shouldShowLot)
// ------------------------
function buildPopupContent(lot) {
  const seasonDetails = getSeasonDetails(lot);
const mode = window.MODE || "resident";

if (mode === "event") {
  return `
    <div class="popup-inner">
      <h3>Lot ${lot.lotNumber}</h3>
      <button class="popup-close" type="button">Close</button>
    </div>
  `;
}
  // Locked view
  if (!isUnlocked) {
    if (window.ENABLE_SEASON_STATIONS && isSeasonStation(lot)) {
      return (
        '<div class="popup-inner">' +
        "<h3>" +
        currentSeasonName +
        " Station</h3>" +
        (seasonDetails ? "<p>" + seasonDetails + "</p>" : "") +
        '<button class="popup-close" type="button">Close</button>' +
        "</div>"
      );
    }
    return (
      '<div class="popup-inner">' +
      "<h3>" +
      currentSeasonName +
      " Map</h3>" +
      '<button class="popup-close" type="button">Close</button>' +
      "</div>"
    );
  }

  // Full details view
  const parts = [];

  parts.push("<h3>Lot " + lot.lotNumber + "</h3>");

  var pName = lot.primaryName || "";
  var sName = lot.secondaryName || "";
  if (pName) {
    parts.push("<p><strong>" + (sName ? pName + " & " + sName : pName) + "</strong></p>");
  }

  if (lot.address) parts.push("<p>" + lot.address + "</p>");
  if (lot.homeTypeStyle) parts.push("<p>Home: " + lot.homeTypeStyle + "</p>");
  if (lot.contractStatus) parts.push("<p>Status: " + lot.contractStatus + "</p>");

  if (lot.isSensitive) {
    parts.push("<p><em>Details limited for privacy.</em></p>");
  } else {
    if (lot.originCityState) parts.push("<p>From: " + lot.originCityState + "</p>");
    if (lot.phone) parts.push("<p>Phone: " + lot.phone + "</p>");
    if (lot.notes) parts.push("<p>Notes: " + lot.notes + "</p>");
  }

  if (window.ENABLE_SEASON_STATIONS && isSeasonStation(lot) && seasonDetails) {
    parts.push("<p><strong>" + currentSeasonName + " Station:</strong> " + seasonDetails + "</p>");
  }

  parts.push('<button class="popup-close" type="button">Close</button>');

  return '<div class="popup-inner">' + parts.join("") + "</div>";
}

// ------------------------
// Hit testing + tap handling
// ------------------------
function findLotAt(x, y) {
  const threshold = 25;
  const thresholdSq = threshold * threshold;
  let best = null;
  let bestDist = thresholdSq;

  if (!Array.isArray(LOTS)) return null;

  LOTS.forEach(function (lot) {
    if (!shouldShowLot(lot)) return;

    const lx = Number(lot.x);
    const ly = Number(lot.y);
    if (!Number.isFinite(lx) || !Number.isFinite(ly)) return;

    const dx = x - lx;
    const dy = y - ly;
    const d2 = dx * dx + dy * dy;

    if (d2 <= bestDist) {
      bestDist = d2;
      best = lot;
    }
  });

  return best;
}

function wirePopupInterceptionAndClose(popup) {
  if (!popup) return;

  popup.onpointerdown = function (e) {
    e.stopPropagation();
  };
  popup.onclick = function (e) {
    e.stopPropagation();
  };

  const closeBtn = popup.querySelector(".popup-close");
  if (closeBtn) {
    closeBtn.onpointerdown = function (e) {
      e.preventDefault();
      e.stopPropagation();
      if (e.stopImmediatePropagation) e.stopImmediatePropagation();
      suppressCanvasClicks(350);
    };

    closeBtn.onclick = function (e) {
      e.preventDefault();
      e.stopPropagation();
      if (e.stopImmediatePropagation) e.stopImmediatePropagation();
      suppressCanvasClicks(350);
      hidePopup();
    };
  }
}

function showpopup(lot, clientX, clientY) {
  const popup = document.getElementById("popup");
  if (!popup || !canvas || !mapWrapper) return;

  const wrapperRect = mapWrapper.getBoundingClientRect();
  const canvasRect = canvas.getBoundingClientRect();

  popup.innerHTML = buildPopupContent(lot);
  popup.classList.remove("hidden");
  popup.setAttribute("aria-hidden", "false");
  popup.style.display = "block";
  popup.style.visibility = "visible";
  popup.style.pointerEvents = "auto";
  enforcePopupTopLayer();

  console.log("SHOW LOT POPUP FIRED for lot:", lot && lot.lotNumber);
  console.log(
    "POPUP DEBUG:",
    "closeBtn=",
    !!popup.querySelector(".popup-close"),
    "pointerEvents=",
    getComputedStyle(popup).pointerEvents,
    "zIndex=",
    getComputedStyle(popup).zIndex
  );

  wirePopupInterceptionAndClose(popup);

  const offsetX = canvasRect.left - wrapperRect.left;
  const offsetY = canvasRect.top - wrapperRect.top;

  let left = clientX - canvasRect.left + offsetX + 12;
  let top = clientY - canvasRect.top + offsetY + 12;

  popup.style.left = left + "px";
  popup.style.top = top + "px";

  const popupRect = popup.getBoundingClientRect();

  if (window.innerWidth <= 768) {
    left = (wrapperRect.width - popupRect.width) / 2;
  }

  const maxLeft = wrapperRect.width - popupRect.width - 8;
  const maxTop = wrapperRect.height - popupRect.height - 8;

  if (left < 8) left = 8;
  if (left > maxLeft) left = maxLeft;
  if (top < 8) top = 8;
  if (top > maxTop) top = maxTop;

  popup.style.left = left + "px";
  popup.style.top = top + "px";
}

function showEventPopup(ev, clientX, clientY) {
  const popup = document.getElementById("popup");
  if (!popup || !canvas || !mapWrapper) return;

  popup.innerHTML = buildEventPopupContent(ev);
  
  console.log("showEventPopup fired", ev);
console.log("popup HTML:", popup.innerHTML);

  popup.classList.remove("hidden");
  popup.setAttribute("aria-hidden", "false");
  popup.style.display = "block";
  popup.style.visibility = "visible";
  popup.style.pointerEvents = "auto";
  enforcePopupTopLayer();
  wirePopupInterceptionAndClose(popup);

// Mobile: show popup as fixed overlay
if (window.innerWidth <= 768) {
  popup.style.position = "fixed";
  popup.style.left = "8px";
  popup.style.right = "8px";
  popup.style.top = "120px";
  popup.style.width = "auto";
  popup.style.maxWidth = "none";
  popup.style.maxHeight = "34vh";
  popup.style.overflow = "auto";
  popup.style.zIndex = "20000";
  return;
}

const popupRect = popup.getBoundingClientRect();

  // Desktop: keep existing map-relative placement
  popup.style.position = "absolute";
  popup.style.right = "";
  popup.style.width = "";
  popup.style.maxHeight = "";
  popup.style.overflow = "";

  const wrapperRect = mapWrapper.getBoundingClientRect();
  const canvasRect = canvas.getBoundingClientRect();

  const offsetX = canvasRect.left - wrapperRect.left;
  const offsetY = canvasRect.top - wrapperRect.top;

  let left = clientX - canvasRect.left + offsetX + 12;
  let top = clientY - canvasRect.top + offsetY + 12;

  popup.style.left = left + "px";
  popup.style.top = top + "px";



  const maxLeft = wrapperRect.width - popupRect.width - 8;
  const maxTop = wrapperRect.height - popupRect.height - 8;

  if (left < 8) left = 8;
  if (left > maxLeft) left = maxLeft;
  if (top < 8) top = 8;
  if (top > maxTop) top = maxTop;

  popup.style.left = left + "px";
  popup.style.top = top + "px";
}

function hideHolePopup() {
  const popup = document.getElementById("holePopup");
  if (!popup) return;

  popup.classList.add("hidden");
  popup.style.display = "none";
  popup.style.visibility = "hidden";
  popup.style.pointerEvents = "none";
}
window.hideHolePopup = hideHolePopup;

function showHolePopup(hole) {
  const popup = document.getElementById("holePopup");
  console.log("SHOW HOLE POPUP", hole);
  if (!popup) {
    console.warn("showHolePopup(): missing holePopup");
    return;
  }

  const courseName = window.GOLF_ACTIVE_COURSE || "Golf Course";
  const holeNumber = hole?.hole_number ?? "";
  const holeDisplay = holeNumber ? "Hole " + holeNumber : "Hole";

  const actualHoleName =
    hole?.holename ||
    hole?.hole_name ||
    hole?.name ||
    holeDisplay;

  const parText = "Par " + (hole?.par ?? "?");
  const handicapText = "Handicap " + (hole?.handicap ?? 0);

  popup.innerHTML = `
    <div class="hole-popup-inner">
      <div class="hole-line hole-line-1">${courseName} -- ${holeDisplay}</div>
      <div class="hole-line hole-line-2">${actualHoleName}</div>
      <div class="hole-line hole-line-3">${parText}&nbsp;&nbsp;&nbsp;&nbsp;${handicapText}</div>
    </div>
  `;

  popup.classList.remove("hidden");
  popup.style.display = "block";
  popup.style.visibility = "visible";
  popup.style.pointerEvents = "auto";
}

window.showHolePopup = showHolePopup;

function handleMapTapAtCanvasPoint(cx, cy, clientX = null, clientY = null) {
  console.log("handleMapTapAtCanvasPoint entered", cx, cy);
  if (typeof window.findGolfHoleAt === "function") {
    const hole = window.findGolfHoleAt(cx, cy);
    if (hole) {
	window.GOLF_SELECTED_HOLE = Number(hole.hole_number);
      hidePopup();
      if (typeof window.centerMapOn === "function") {
        window.centerMapOn(hole.flag_x, hole.flag_y);
      }
      showHolePopup(hole);
      if (typeof window.safeDrawGolf === "function") {
        window.safeDrawGolf();
      }
      console.log("GOLF HOLE HIT RESULT:", { hole: hole.hole_number, hole_name: hole.holename });
      return true;
    }
  }

  if (window.ENABLE_EVENTS && clientX != null && clientY != null) {
    const ev = findEventAt(cx, cy);
	console.log("EVENT HIT", ev);
    if (ev) {
      hideHolePopup();
      showEventPopup(ev, clientX, clientY);
	  console.log("SHOW EVENT POPUP", ev);
      return true;
    }

    const site = findMappedSiteAt(cx, cy);
	console.log("MAPPED SITE HIT", site);
    if (site) {
      const siteId = site.siteId || site.id || site.name;
      const siteEvent = findEventForSite(siteId);
      if (siteEvent) {
        hideHolePopup();
        showEventPopup(siteEvent, clientX, clientY);
        return true;
      }
    }
  }

if (clientX != null && clientY != null) {
  if (window.RESIDENT_MODE) {
    const lot = findLotAt(Math.round(cx), Math.round(cy));
    if (lot) {
      hideHolePopup();
      showpopup(lot, clientX, clientY);
      return true;
    }
  }
}

  hidePopup();
  hideHolePopup();
  return false;
}

function handleCanvasTap(clientX, clientY, shiftLike = false) {
  


  const pt = getCanvasXYFromClient(clientX, clientY);
  const cx = pt.x;
  const cy = pt.y;
  
  console.log("HANDLE CANVAS TAP", {
  clientX,
  clientY,
  zoomScale,
  scrollLeft: mapWrapper ? mapWrapper.scrollLeft : null,
  scrollTop: mapWrapper ? mapWrapper.scrollTop : null
});

  try {
    if (window.GOLF_EDIT && window.GOLF_EDIT.enabled && window.GOLF_OVERLAY_DATA) {
      const courseName = window.GOLF_ACTIVE_COURSE;
      const courses = window.GOLF_OVERLAY_DATA.courses || [];
      const course = courses.find((c) => c.course_name === courseName) || courses[0];
      if (course) {
        const hn = Number(window.GOLF_EDIT.hole_number || 1);
        const target = window.GOLF_EDIT.target === "tee" ? "tee" : "flag";
        const hole = (course.holes || []).find((h) => Number(h.hole_number) === hn);
        if (hole) {
          if (target === "tee") {
            hole.tee_x = Math.round(cx);
            hole.tee_y = Math.round(cy);
            console.log("Set TEE for", course.course_name, "hole", hn, "=>", hole.tee_x, hole.tee_y);
          } else {
            hole.flag_x = Math.round(cx);
            hole.flag_y = Math.round(cy);
            console.log("Set FLAG for", course.course_name, "hole", hn, "=>", hole.flag_x, hole.flag_y);
          }
          safeDrawLots();
          return;
        }
      }
    }
  } catch (e) {
    console.warn("Golf adjust failed:", e);
  }

  if (DIGITIZE_MODE) {
    if (shiftLike) {
      digitizeBoundary.push({ x: cx, y: cy });
      console.log("Boundary:", { x: cx, y: cy });
      return;
    }

    if (digitizeCurrentPath) {
      digitizePaths[digitizeCurrentPath].push({ x: cx, y: cy });
      console.log("Path point:", { x: cx, y: cy });
      return;
    }

    const hn = String(digitizeNextHole);
    digitizeHoles[hn] = { x: cx, y: cy };
    console.log("Hole", hn, { x: cx, y: cy });
    digitizeNextHole++;
    return;
  }
console.log("MAP TAP AT CANVAS POINT", { cx, cy, clientX, clientY });
  handleMapTapAtCanvasPoint(cx, cy, clientX, clientY);
}
console.trace("CALLING setupCanvasEvents");
function setupCanvasEvents() {
  const target = document.getElementById("mapWrapper") || canvas;
  if (!target) return;

  if (target.dataset.eventsBound === "1") {
    console.log("setupCanvasEvents: already bound, skipping");
    return;
  }
  target.dataset.eventsBound = "1";

  let touchStartX = 0;
  let touchStartY = 0;
  let touchStartTime = 0;
  let touchTracking = false;
  let twoFinger = false;

  target.addEventListener(
    "click",
    function (e) {
      console.log("TARGET CLICK HANDLER FIRED", {
        suppressed: isCanvasClickSuppressed(),
        x: e.clientX,
        y: e.clientY,
        target: e.target && e.target.id
      });

      if (isCanvasClickSuppressed()) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }

      handleCanvasTap(e.clientX, e.clientY, !!e.shiftKey);
    },
    { passive: false }
  );

  target.addEventListener(
    "touchstart",
    function (e) {
      twoFinger = !!(e.touches && e.touches.length >= 2);

      if (e.touches && e.touches.length === 1) {
        const t = e.touches[0];
        touchStartX = t.clientX;
        touchStartY = t.clientY;
        touchStartTime = Date.now();
        touchTracking = true;
      } else {
        touchTracking = false;
      }
    },
    { passive: true }
  );

  target.addEventListener(
    "touchmove",
    function (e) {
      if (!touchTracking || !e.touches || e.touches.length !== 1) {
        touchTracking = false;
        return;
      }

      const t = e.touches[0];
      const dx = t.clientX - touchStartX;
      const dy = t.clientY - touchStartY;

      if (Math.hypot(dx, dy) > 24) {
        touchTracking = false;
      }
    },
    { passive: true }
  );

  target.addEventListener(
    "touchend",
    function (e) {
      if (!touchTracking) {
        twoFinger = false;
        return;
      }

      const dt = Date.now() - touchStartTime;
      if (dt > 350) {
        touchTracking = false;
        twoFinger = false;
        return;
      }

      if (!e.changedTouches || !e.changedTouches.length) {
        touchTracking = false;
        twoFinger = false;
        return;
      }

      const t = e.changedTouches[0];
      suppressCanvasClicks(800);
      handleCanvasTap(t.clientX, t.clientY, twoFinger);

      touchTracking = false;
      twoFinger = false;
    },
    { passive: true }
  );

  target.addEventListener(
    "touchcancel",
    function () {
      touchTracking = false;
      twoFinger = false;
    },
    { passive: true }
  );
}

// ------------------------
// Season-only toggle
// ------------------------
function setupSeasonToggle() {
  const checkbox = document.getElementById("seasonOnlyCheckbox");
  if (!checkbox) return;

  if (checkbox.dataset.bound === "1") return;
  checkbox.dataset.bound = "1";

  checkbox.checked = true;
  isSeasonOnly = true;
  updateLockStatusUI();
  safeDrawLots();

  checkbox.addEventListener("change", function () {
    if (!isUnlocked && !checkbox.checked) {
      const entered = window.prompt("Enter password to unlock full map:");
      if (entered === PASSWORD) {
        isUnlocked = true;
        isSeasonOnly = false;
      } else {
        alert("Incorrect password. Staying in seasonal privacy mode.");
        checkbox.checked = true;
        isSeasonOnly = true;
      }
      updateLockStatusUI();
      safeDrawLots();
      return;
    }

    isSeasonOnly = checkbox.checked;
    updateLockStatusUI();
    safeDrawLots();
  });
}

function enforcePopupTopLayer() {
  const popup = document.getElementById("popup");
  const wrap = document.getElementById("mapWrapper");
  const canv = document.getElementById("mapCanvas");
  if (!popup || !wrap || !canv) return;

  const wrapStyle = getComputedStyle(wrap);
  if (wrapStyle.position === "static") wrap.style.position = "relative";

  canv.style.position = canv.style.position || "relative";
  canv.style.zIndex = "1";

  popup.style.position = "absolute";
  popup.style.zIndex = "999999";
  popup.style.pointerEvents = "auto";

  const inner = popup.querySelector(".popup-inner");
  if (inner) inner.style.pointerEvents = "auto";
  const btn = popup.querySelector(".popup-close");
  if (btn) btn.style.pointerEvents = "auto";
}

function setuppopupHandlersOnce() {
  const popup = document.getElementById("popup");
  if (!popup) return;

  if (popup.dataset.bound === "1") return;
  popup.dataset.bound = "1";

  popup.style.pointerEvents = "auto";
  popup.style.zIndex = popup.style.zIndex || "9999";

  popup.addEventListener(
    "pointerdown",
    function (e) {
      e.stopPropagation();

      const btn = e.target.closest(".popup-close");
      if (btn) {
        e.preventDefault();
        if (e.stopImmediatePropagation) e.stopImmediatePropagation();
        suppressCanvasClicks(800);
        console.log("POPUP CLOSE pointerdown fired");
      }
    },
    true
  );

  popup.addEventListener(
    "click",
    function (e) {
      e.stopPropagation();

      const btn = e.target.closest(".popup-close");
      if (btn) {
        e.preventDefault();
        if (e.stopImmediatePropagation) e.stopImmediatePropagation();
        suppressCanvasClicks(800);
        hidePopup();
        console.log("POPUP CLOSE click fired");
      }
    },
    true
  );
}

// ------------------------
// Map init
// ------------------------
function initMap() {
  canvas = document.getElementById("mapCanvas");
mapWrapper = document.getElementById("mapWrapper") || document.getElementById("wrap");
  if (!canvas || !mapWrapper) {
    console.error("Canvas or mapWrapper not found in DOM.");
    return;
  }

  enforcePopupTopLayer();
  setuppopupHandlersOnce();

  ctx = canvas.getContext("2d");
  mapImg = new Image();
  mapImg.src = "Phase7Org.png";

  mapImg.onload = function () {
    console.log("Map image loaded:", mapImg.width, "x", mapImg.height);
canvas.width = mapImg.width;
canvas.height = mapImg.height;

const fitScale = Math.min(
  mapWrapper.clientWidth / mapImg.width,
  mapWrapper.clientHeight / mapImg.height
);

setZoom(Math.max(0.25, Math.min(2.5, fitScale)));
safeDrawLots();
  };

  mapImg.onerror = function (e) {
    console.error("FAILED to load map image Phase7Org.png", e);
  };

  setupCanvasEvents();
}
function centerMapOn(x, y) {
  const wrapper = document.getElementById("mapWrapper");
  if (!wrapper) return;
        console.log("Center Map On Function");
  const rect = wrapper.getBoundingClientRect();

  wrapper.scrollLeft = Math.max(0, x * zoomScale - rect.width / 2);
  wrapper.scrollTop = Math.max(0, y * zoomScale - rect.height / 2);
}
// ------------------------
// Startup (SINGLE PATH)
// ------------------------
function boot() {
  updateLockStatusUI();
  updateApkButtonLabel();

  const isWeb = location.protocol === "http:" || location.protocol === "https:";

  if (isWeb) {
    fetchSeasonName();
    fetchPassword();
  } else {
    updateSeasonToggleLabel();
    console.warn("Running from file:// - skipping season/password fetch.");
  }

  setupPrivacyPanel();
  setupSeasonToggle();

  // Ensure events default ON (and don't get disabled by undefined checks elsewhere)
  if (typeof window.ENABLE_EVENTS === "undefined") window.ENABLE_EVENTS = true;

  safeInit();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}
