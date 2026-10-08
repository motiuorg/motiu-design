/**
 * Canonical hero Voronoi default — captured from hero-lab session 2026-07-14.
 * Geometry + transform + default nested sub-cells for cells 0 and 1.
 */
export var HERO_VORONOI_DEFAULT = {
  sites: [
    [1095.4, -166.34],
    [142.58, -96.53],
    [1404.28, 555.1],
    [164.56, 319.34],
    [637.18, -302.36],
    [1297.51, -204.79],
    [420.05, 744.84],
    [1502.45, 551.27],
    [774.88, 89.72],
    [1577.6, 922.52],
  ],
  cornerRadius: 25,
  strokeWidth: 4,
  transform: {
    scale: 1,
    stretchX: 0.93,
    stretchY: 1,
    rotation: 0,
    offsetX: 34,
    offsetY: 185,
  },
  seedSubDefaults: false,
  subDefaultCells: [0, 1],
  subCells: {
    0: {
      enabled: true,
      sites: [
        [25, -50.88],
        [-234.09, -261.62],
        [315.51, -223.95],
        [-212.49, 217.89],
        [337.11, 255.56],
      ],
      cornerRadius: 20,
      strokeWidth: 4,
      children: {},
    },
    1: {
      enabled: true,
      sites: [
        [869.2, -134],
        [620.57, -276.2],
        [991.12, -241.44],
        [635.13, 166.2],
        [1005.68, 201.96],
      ],
      cornerRadius: 20,
      strokeWidth: 4,
      children: {},
    },
  },
};
