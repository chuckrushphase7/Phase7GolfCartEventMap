// events.js
// Data-only config for Phase 7 events.

const EVENTS = [
  // BLUE GUITAR PARK – single clear icon with rich popup text
  {
    id: "blue_guitar_scene",
    type: "tiki",
    label: "19th Hole Gathering",
    siteId: "BlueGuitarPark",     // must match mapped_sites.js
    phaseNumber: 7,
    isActive: true,
    requiresUnlock: false,
    seasons: [],                   // [] = all seasons, always visible
      description: "Join us at Blue Guitar Park for the Phase 7 Golf Event. Visit the Tiki Bar and enjoy the festivities."
  },

  // Global snow overlay tied to the same scene
  {
    id: "blue_guitar_snow",
    type: "snow",
    label: "Snow at the Park",
    siteId: "BlueGuitarPark",
    phaseNumber: 7,
    isActive: true,
    requiresUnlock: false,
    seasons: [],                   // all seasons (you can tighten later)
    snowOverlay: true,
    description: " "
  },

  // Example lot-based event (currently off)
  {
    id: "lot_1906_special",
    type: "santa",
    label: "Santa Stop (Lot 1906)",
    lotNumber: 1906,
    phaseNumber: 7,
    isActive: false,               // turn on when needed
    requiresUnlock: false,
    seasons: [],
    description: "Santa makes a special stop at Lot 1906."
  },

  // ALLIGATOR / WILDLIFE AT POND4
  {
    id: "alligator_pond4",
    type: "alligator",
    label: "Alligator Warning",
    siteId: "Pond4",
    phaseNumber: 7,
    isActive: true,
    requiresUnlock: false,
    seasons: [],                   // all seasons
    description: "Wildlife reminder: use caution around water."
  },
   // ALLIGATOR / WILDLIFE AT POND1
  {
    id: "alligator_pond1",
    type: "alligator",
    label: "Alligator Warning",
    siteId: "Pond1",
    phaseNumber: 7,
    isActive: true,
    requiresUnlock: false,
    seasons: [],                   // all seasons
    description: "Wildlife reminder: use caution around water."
  },
   // ALLIGATOR / WILDLIFE AT POND2
  {
    id: "alligator_pond2",
    type: "alligator",
    label: "Alligator Warning",
    siteId: "Pond2",
    phaseNumber: 7,
    isActive: true,
    requiresUnlock: false,
    seasons: [],                   // all seasons
    description: "Wildlife reminder: use caution around water."
  },
   // ALLIGATOR / WILDLIFE AT POND3
  {
    id: "alligator_pond3",
    type: "alligator",
    label: "Alligator Warning",
    siteId: "Pond3",
    phaseNumber: 7,
    isActive: true,
    requiresUnlock: false,
    seasons: [],                   // all seasons
    description: "Wildlife reminder: use caution around water."
  },
];
// Expose to the engine
];

const tikiImg = new Image();
tikiImg.src = "tikibar.png";
window.EVENTS_TABLE = EVENTS;
window.EVENTS = EVENTS; // optional, but harmless