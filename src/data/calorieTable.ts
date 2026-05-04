/**
 * WSAVA calorie reference table + formula utilities.
 * Verbatim from design handoff: resources/design_handoff_pbt/design_files/screens/misc.jsx
 *
 * Source: 2006 NRC Daily Maintenance Energy Requirements · WSAVA Nutrition Toolkit 2020
 * Table columns: weightKg → [low kcal/day, high kcal/day] for an ideal-condition adult.
 * Formula: active adult = round(130 × kg^0.75), inactive/senior = round(95 × kg^0.75)
 */

export interface CalorieRow {
  weightKg: number;
  /** Lower bound kcal/day (inactive / sedentary) from WSAVA table */
  inactiveKcal: number;
  /** Upper bound kcal/day (active adult) from WSAVA table */
  activeKcal: number;
}

export const CAL_TABLE: CalorieRow[] = [
  { weightKg: 2,  inactiveKcal: 140,  activeKcal: 177  },
  { weightKg: 3,  inactiveKcal: 190,  activeKcal: 239  },
  { weightKg: 4,  inactiveKcal: 240,  activeKcal: 297  },
  { weightKg: 5,  inactiveKcal: 280,  activeKcal: 351  },
  { weightKg: 6,  inactiveKcal: 320,  activeKcal: 403  },
  { weightKg: 7,  inactiveKcal: 360,  activeKcal: 452  },
  { weightKg: 8,  inactiveKcal: 400,  activeKcal: 499  },
  { weightKg: 9,  inactiveKcal: 440,  activeKcal: 546  },
  { weightKg: 10, inactiveKcal: 470,  activeKcal: 590  },
  { weightKg: 11, inactiveKcal: 510,  activeKcal: 634  },
  { weightKg: 12, inactiveKcal: 540,  activeKcal: 677  },
  { weightKg: 13, inactiveKcal: 580,  activeKcal: 719  },
  { weightKg: 14, inactiveKcal: 610,  activeKcal: 760  },
  { weightKg: 15, inactiveKcal: 640,  activeKcal: 800  },
  { weightKg: 16, inactiveKcal: 670,  activeKcal: 840  },
  { weightKg: 17, inactiveKcal: 700,  activeKcal: 879  },
  { weightKg: 18, inactiveKcal: 730,  activeKcal: 918  },
  { weightKg: 19, inactiveKcal: 760,  activeKcal: 956  },
  { weightKg: 20, inactiveKcal: 790,  activeKcal: 993  },
  { weightKg: 21, inactiveKcal: 820,  activeKcal: 1030 },
  { weightKg: 22, inactiveKcal: 850,  activeKcal: 1067 },
  { weightKg: 23, inactiveKcal: 880,  activeKcal: 1103 },
  { weightKg: 24, inactiveKcal: 910,  activeKcal: 1139 },
  { weightKg: 25, inactiveKcal: 940,  activeKcal: 1174 },
  { weightKg: 26, inactiveKcal: 970,  activeKcal: 1209 },
  { weightKg: 27, inactiveKcal: 1000, activeKcal: 1244 },
  { weightKg: 28, inactiveKcal: 1020, activeKcal: 1278 },
  { weightKg: 29, inactiveKcal: 1050, activeKcal: 1312 },
  { weightKg: 30, inactiveKcal: 1080, activeKcal: 1346 },
  { weightKg: 31, inactiveKcal: 1100, activeKcal: 1397 },
  { weightKg: 32, inactiveKcal: 1130, activeKcal: 1413 },
  { weightKg: 33, inactiveKcal: 1160, activeKcal: 1446 },
  { weightKg: 34, inactiveKcal: 1180, activeKcal: 1478 },
  { weightKg: 35, inactiveKcal: 1210, activeKcal: 1511 },
  { weightKg: 36, inactiveKcal: 1240, activeKcal: 1543 },
  { weightKg: 37, inactiveKcal: 1260, activeKcal: 1575 },
  { weightKg: 38, inactiveKcal: 1290, activeKcal: 1607 },
  { weightKg: 39, inactiveKcal: 1310, activeKcal: 1639 },
  { weightKg: 40, inactiveKcal: 1340, activeKcal: 1670 },
  { weightKg: 41, inactiveKcal: 1360, activeKcal: 1701 },
  { weightKg: 42, inactiveKcal: 1390, activeKcal: 1732 },
  { weightKg: 43, inactiveKcal: 1410, activeKcal: 1763 },
  { weightKg: 44, inactiveKcal: 1440, activeKcal: 1794 },
  { weightKg: 45, inactiveKcal: 1460, activeKcal: 1824 },
  { weightKg: 46, inactiveKcal: 1480, activeKcal: 1855 },
  { weightKg: 47, inactiveKcal: 1510, activeKcal: 1885 },
  { weightKg: 48, inactiveKcal: 1530, activeKcal: 1915 },
  { weightKg: 49, inactiveKcal: 1560, activeKcal: 1945 },
];

/**
 * Calorie formula from prototype.
 * active  = round(130 × kg^0.75)
 * inactive = round(95 × kg^0.75)
 */
export function calorieFor(kg: number, activity: 'active' | 'inactive'): number {
  const exp = activity === 'active' ? 130 : 95;
  return Math.round(exp * Math.pow(kg, 0.75));
}

/** Returns the CAL_TABLE entry whose weightKg is closest to kg. */
export function closestRow(kg: number): CalorieRow {
  return CAL_TABLE.reduce((prev, curr) =>
    Math.abs(curr.weightKg - kg) < Math.abs(prev.weightKg - kg) ? curr : prev,
    CAL_TABLE[0],
  );
}
