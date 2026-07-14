#!/usr/bin/env node
/**
 * Generates 20 stylized athletic avatar SVGs (10 male, 10 female).
 * Finish Line Pulse: white plate, ink lines, orange accents — flat illustration, not photo-real.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(__dirname, "../public/brand/avatars");
fs.mkdirSync(outDir, { recursive: true });

const ORANGE = "#D83900";
const INK = "#231813";
const SKINS = ["#F3D2B5", "#E8B992", "#C68642", "#8D5524", "#F6C8A0"];
const HAIRS = ["#231813", "#3D2914", "#5C4033", "#1A1A1A", "#6B4423", "#D83900"];

/** @type {Array<{id:number, gender:'male'|'female', label:string, sport:string}>} */
const AVATARS = [
  { id: 0, gender: "male", label: "Stride", sport: "road" },
  { id: 1, gender: "male", label: "Tempo", sport: "track" },
  { id: 2, gender: "male", label: "Trail", sport: "trail" },
  { id: 3, gender: "male", label: "Relay", sport: "relay" },
  { id: 4, gender: "male", label: "Dawn", sport: "sunrise" },
  { id: 5, gender: "male", label: "Pulse", sport: "interval" },
  { id: 6, gender: "male", label: "Hill", sport: "climb" },
  { id: 7, gender: "male", label: "Pack", sport: "crew" },
  { id: 8, gender: "male", label: "Finish", sport: "race" },
  { id: 9, gender: "male", label: "Steady", sport: "easy" },
  { id: 10, gender: "female", label: "Stride", sport: "road" },
  { id: 11, gender: "female", label: "Tempo", sport: "track" },
  { id: 12, gender: "female", label: "Trail", sport: "trail" },
  { id: 13, gender: "female", label: "Relay", sport: "relay" },
  { id: 14, gender: "female", label: "Dawn", sport: "sunrise" },
  { id: 15, gender: "female", label: "Pulse", sport: "interval" },
  { id: 16, gender: "female", label: "Hill", sport: "climb" },
  { id: 17, gender: "female", label: "Pack", sport: "crew" },
  { id: 18, gender: "female", label: "Finish", sport: "race" },
  { id: 19, gender: "female", label: "Steady", sport: "easy" },
];

function svgFor(a) {
  const skin = SKINS[a.id % SKINS.length];
  const hair = HAIRS[(a.id * 3) % HAIRS.length];
  const male = a.gender === "male";
  const accent = a.id % 2 === 0 ? ORANGE : INK;

  // Bust circle crop on white square
  const shoulders = male
    ? `<path d="M120 520c40-80 120-120 200-120s160 40 200 120v120H120z" fill="${skin}"/>
       <path d="M160 500c60-40 140-40 200 0" fill="none" stroke="${accent}" stroke-width="14" stroke-linecap="round"/>`
    : `<path d="M140 520c36-90 110-140 180-140s144 50 180 140v120H140z" fill="${skin}"/>
       <path d="M180 490c50-36 130-36 180 0" fill="none" stroke="${accent}" stroke-width="12" stroke-linecap="round"/>`;

  const head = `<circle cx="320" cy="300" r="${male ? 118 : 112}" fill="${skin}"/>`;

  let hairPath;
  if (male) {
    const styles = [
      // short crop
      `<path d="M210 280c10-90 70-130 110-130s100 40 110 130c-30-50-70-70-110-70s-80 20-110 70z" fill="${hair}"/>`,
      // fade
      `<path d="M205 290c20-100 80-140 115-140s95 40 115 140c-35-40-75-55-115-55s-80 15-115 55z" fill="${hair}"/>`,
      // buzz + line
      `<circle cx="320" cy="300" r="118" fill="none" stroke="${hair}" stroke-width="28"/>
       <path d="M220 250h200" stroke="${hair}" stroke-width="10" stroke-linecap="round"/>`,
      // wavy top
      `<path d="M208 300c0-100 50-145 112-145s112 45 112 145c-25-55-70-80-112-80s-87 25-112 80z" fill="${hair}"/>`,
      // side part
      `<path d="M215 310c15-110 60-150 105-150 55 0 100 55 115 150H215z" fill="${hair}"/>`,
    ];
    hairPath = styles[a.id % styles.length];
  } else {
    const styles = [
      // pony
      `<path d="M210 300c10-110 70-155 110-155s100 45 110 155c-20-60-70-90-110-90s-90 30-110 90z" fill="${hair}"/>
       <path d="M400 280c40 20 55 80 45 140" fill="none" stroke="${hair}" stroke-width="36" stroke-linecap="round"/>`,
      // bob
      `<path d="M200 250c20-90 80-130 120-130s100 40 120 130v80c-30 40-80 55-120 55s-90-15-120-55v-80z" fill="${hair}"/>`,
      // high puff
      `<circle cx="320" cy="175" r="55" fill="${hair}"/>
       <path d="M215 310c15-90 70-130 105-130s90 40 105 130H215z" fill="${hair}"/>`,
      // long waves
      `<path d="M205 280c20-100 75-145 115-145s95 45 115 145v140c-40 20-90 30-115 30s-75-10-115-30V280z" fill="${hair}"/>`,
      // headband look
      `<path d="M210 300c10-100 70-145 110-145s100 45 110 145H210z" fill="${hair}"/>
       <path d="M210 255h220" stroke="${ORANGE}" stroke-width="16" stroke-linecap="round"/>`,
    ];
    hairPath = styles[a.id % styles.length];
  }

  // Face (minimal athletic — focused, friendly)
  const face = `
    <circle cx="280" cy="295" r="10" fill="${INK}"/>
    <circle cx="360" cy="295" r="10" fill="${INK}"/>
    <path d="M295 345c15 18 35 18 50 0" fill="none" stroke="${INK}" stroke-width="8" stroke-linecap="round"/>
  `;

  // Sport accessory (badge on jersey / cap mark)
  const accessory =
    a.sport === "track"
      ? `<text x="320" y="560" text-anchor="middle" font-family="DM Sans,system-ui,sans-serif" font-size="36" font-weight="700" fill="${ORANGE}">#${(a.id % 9) + 1}</text>`
      : a.sport === "trail"
        ? `<path d="M280 545h80" stroke="${ORANGE}" stroke-width="10" stroke-linecap="round"/><path d="M300 560h40" stroke="${INK}" stroke-width="8" stroke-linecap="round"/>`
        : `<circle cx="320" cy="550" r="18" fill="${ORANGE}"/>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" role="img" aria-label="${a.label} ${a.gender}">
  <rect width="640" height="640" rx="96" fill="#FFFFFF"/>
  <!-- soft plate -->
  <circle cx="320" cy="340" r="250" fill="#F7F4F2"/>
  ${shoulders}
  ${head}
  ${hairPath}
  ${face}
  ${accessory}
</svg>
`;
}

const index = [];

for (const a of AVATARS) {
  const file = `avatar-${String(a.id).padStart(2, "0")}.svg`;
  fs.writeFileSync(path.join(outDir, file), svgFor(a));
  index.push({
    id: a.id,
    gender: a.gender,
    label: a.label,
    sport: a.sport,
    src: `/brand/avatars/${file}`,
  });
}

fs.writeFileSync(
  path.join(outDir, "index.json"),
  JSON.stringify({ avatars: index, count: index.length }, null, 2),
);

console.log(`Wrote ${AVATARS.length} avatars → ${outDir}`);
