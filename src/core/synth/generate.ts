import { Applicant } from "../engine/evaluate";

/**
 * Deterministic synthetic application generator.
 *
 * Same seed → same dataset → reproducible impact numbers in the demo.
 * All data is fictional; distributions are chosen to be plausible for a
 * national student-scholarship applicant pool.
 */

// mulberry32 — small, fast, deterministic PRNG.
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FIRST_NAMES = [
  "Aarav", "Ananya", "Arjun", "Diya", "Ishaan", "Kavya", "Rohan", "Priya",
  "Vihaan", "Meera", "Aditya", "Sneha", "Karan", "Pooja", "Rahul", "Nisha",
  "Siddharth", "Riya", "Manish", "Divya", "Harsh", "Anjali", "Nikhil", "Shreya",
  "Vikram", "Neha", "Amit", "Lakshmi", "Suresh", "Fatima", "Imran", "Zoya",
  "Gurpreet", "Simran", "Joseph", "Mary", "Arnav", "Tanvi", "Dev", "Sakshi",
];

const LAST_NAMES = [
  "Sharma", "Verma", "Patel", "Reddy", "Nair", "Iyer", "Singh", "Kaur",
  "Das", "Bose", "Mukherjee", "Chatterjee", "Kumar", "Yadav", "Gupta", "Mehta",
  "Joshi", "Desai", "Rao", "Naidu", "Pillai", "Menon", "Khan", "Ansari",
  "Fernandes", "D'Souza", "Choudhury", "Mishra", "Pandey", "Thakur",
];

const STATES = [
  { value: "UP", weight: 14 }, { value: "MH", weight: 11 }, { value: "BR", weight: 9 },
  { value: "WB", weight: 8 }, { value: "TN", weight: 7 }, { value: "RJ", weight: 7 },
  { value: "KA", weight: 7 }, { value: "GJ", weight: 6 }, { value: "AP", weight: 6 },
  { value: "KL", weight: 5 }, { value: "PB", weight: 5 }, { value: "DL", weight: 5 },
];

function pickWeighted<T extends { value: string; weight: number }>(
  rng: () => number,
  items: T[],
): string {
  const total = items.reduce((s, i) => s + i.weight, 0);
  let r = rng() * total;
  for (const i of items) {
    r -= i.weight;
    if (r <= 0) return i.value;
  }
  return items[items.length - 1].value;
}

export interface SyntheticApplication {
  appNumber: string;
  data: Applicant;
  submittedAt: string;
}

export function generateApplications(
  count = 1500,
  seed = 20260828,
): SyntheticApplication[] {
  const rng = mulberry32(seed);
  const apps: SyntheticApplication[] = [];

  for (let i = 0; i < count; i++) {
    // Age: student pool concentrated at 18–24, tail to 29, few 17-year-olds.
    const ageRoll = rng();
    const age =
      ageRoll < 0.05 ? 17
        : ageRoll < 0.45 ? 18 + Math.floor(rng() * 3)      // 18–20
        : ageRoll < 0.85 ? 21 + Math.floor(rng() * 4)      // 21–24
        : 25 + Math.floor(rng() * 5);                      // 25–29

    // Income: log-ish spread 40k–650k with real mass in the 3.0–3.5L band.
    const incomeRoll = rng();
    const annualHouseholdIncome = Math.round(
      (incomeRoll < 0.55
        ? 40000 + rng() * 260000            // below 3L
        : incomeRoll < 0.75
          ? 300000 + rng() * 50000          // the 3.0–3.5L band the 2026 change opens
          : 350000 + rng() * 300000         // above the new threshold
      ) / 1000,
    ) * 1000;

    const courseRoll = rng();
    const courseLevel =
      courseRoll < 0.58 ? "undergraduate" : courseRoll < 0.84 ? "postgraduate" : "diploma";

    const hasDisabilityCertificate = rng() < 0.07;
    const enrolled = rng() < 0.96;

    const first = FIRST_NAMES[Math.floor(rng() * FIRST_NAMES.length)];
    const last = LAST_NAMES[Math.floor(rng() * LAST_NAMES.length)];

    const data: Applicant = {
      fullName: `${first} ${last}`,
      age,
      state: pickWeighted(rng, STATES),
      hasDisabilityCertificate,
      enrolled,
      institutionType: rng() < 0.45 ? "government" : rng() < 0.5 ? "aided" : "private",
      courseLevel,
      yearOfStudy: 1 + Math.floor(rng() * (courseLevel === "postgraduate" ? 2 : 4)),
      annualHouseholdIncome,
      doc_identity: rng() < 0.97,
      doc_address: rng() < 0.95,
      doc_income: rng() < 0.9,
      doc_enrolment: rng() < 0.85,
      doc_disability: hasDisabilityCertificate ? rng() < 0.7 : false,
    };

    const day = 1 + Math.floor(rng() * 28);
    const month = 1 + Math.floor(rng() * 6);
    apps.push({
      appNumber: `2026-${String(40000 + i)}`,
      data,
      submittedAt: `2026-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
    });
  }
  return apps;
}
