export interface GradeCriterion {
  label: string;
  value: string;
}

export interface CocoaGradeSpec {
  id: string; // "Grade 1" | "Grade 2" | "Grade 3"
  gradeNumber: number;
  title: string; // e.g. "GRADE 1: PREMIUM COCOA"
  shortTitle: string; // e.g. "Premium Cocoa"
  tagline: string;
  badgeClass: string;
  accentColor: string;
  criteria: GradeCriterion[];
  actionNote?: string;
}

export const COCOA_GRADE_STANDARDS: CocoaGradeSpec[] = [
  {
    id: "Grade 1",
    gradeNumber: 1,
    title: "GRADE 1: PREMIUM COCOA",
    shortTitle: "Premium Cocoa",
    tagline: "Highest export tier meeting strict international confectionary specifications",
    badgeClass: "bg-[#edf7e8] text-[#2d6130] border-[#cdebc2]",
    accentColor: "#2d6130",
    criteria: [
      { label: "Moisture", value: "7.0% maximum." },
      { label: "Drying", value: "Naturally sun-dried on clean, raised drying platforms." },
      { label: "Fermentation", value: "Properly fermented; predominantly brown inside when cut." },
      { label: "Mould", value: "No visible mould." },
      { label: "Bean size", value: "Uniform, well-developed beans." },
      { label: "Cleanliness", value: "No stones, soil, plastic, or other foreign materials." },
      { label: "Smell", value: "Natural cocoa smell; no smoky or mouldy odour." },
      { label: "Condition", value: "No visible insect infestation." },
    ],
  },
  {
    id: "Grade 2",
    gradeNumber: 2,
    title: "GRADE 2: GOOD COMMERCIAL COCOA",
    shortTitle: "Good Commercial Cocoa",
    tagline: "Standard commercial grade acceptable for bulk export and grinding operations",
    badgeClass: "bg-blue-50 text-blue-900 border-blue-200",
    accentColor: "#1e40af",
    criteria: [
      { label: "Moisture", value: "Above 7.0% but not more than 7.5%." },
      { label: "Drying", value: "Properly dried naturally." },
      { label: "Fermentation", value: "Reasonably fermented; some purple beans may be present." },
      { label: "Mould", value: "No significant mould; must meet the buyer's defect limits." },
      { label: "Bean size", value: "Generally well-developed, with some variation." },
      { label: "Cleanliness", value: "Very little foreign matter." },
      { label: "Smell", value: "Normal cocoa smell, without unpleasant odours." },
      { label: "Condition", value: "Minimal insect damage." },
    ],
  },
  {
    id: "Grade 3",
    gradeNumber: 3,
    title: "GRADE 3: REQUIRES IMPROVEMENT",
    shortTitle: "Requires Improvement",
    tagline: "Sub-standard cocoa requiring remediation before export acceptance",
    badgeClass: "bg-amber-50 text-amber-900 border-amber-200",
    accentColor: "#b45309",
    criteria: [
      { label: "Moisture", value: "Above 7.5%." },
      { label: "Drying", value: "Incomplete or uneven drying." },
      { label: "Fermentation", value: "Many purple or slate-coloured beans." },
      { label: "Mould", value: "Any visible mould requires investigation and appropriate action." },
      { label: "Bean size", value: "Many flat, shrivelled, or poorly developed beans." },
      { label: "Cleanliness", value: "Excessive dirt or foreign materials." },
      { label: "Smell", value: "Smoky, mouldy, musty, or otherwise abnormal." },
    ],
    actionNote:
      "Action: Do not mix these beans with good-quality cocoa. Where appropriate, dry or clean the beans further and arrange a new inspection. Cocoa with mould or suspected contamination must be assessed before acceptance.",
  },
];

/**
 * Normalizes input grade strings such as "Grade 1", "Grade 1 — Premium", "Grade 2", "Grade 3", "Sub-standard"
 */
export function getCocoaGradeSpec(gradeStr?: string | null): CocoaGradeSpec {
  if (!gradeStr) {
    return COCOA_GRADE_STANDARDS[0];
  }

  const normalized = gradeStr.toLowerCase().trim();

  if (normalized.includes("3") || normalized.includes("sub") || normalized.includes("improvement")) {
    return COCOA_GRADE_STANDARDS[2];
  }
  if (normalized.includes("2") || normalized.includes("commercial")) {
    return COCOA_GRADE_STANDARDS[1];
  }
  return COCOA_GRADE_STANDARDS[0];
}
