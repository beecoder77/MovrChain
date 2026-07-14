#!/usr/bin/env node
/**
 * Generates MovrChain achievement badge SVGs + ERC-721 metadata JSON,
 * plus on-chain data: URIs for testnet update script.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const brandDir = path.join(root, "public/brand/achievements");
const metaDir = path.join(root, "public/metadata/achievements");
const outDir = path.join(root, "contracts/metadata");

fs.mkdirSync(brandDir, { recursive: true });
fs.mkdirSync(metaDir, { recursive: true });
fs.mkdirSync(outDir, { recursive: true });

/** @type {Array<{id:number, slug:string, name:string, description:string, label:string, sub:string, criterion:string, threshold:number}>} */
const ACHIEVEMENTS = [
  {
    id: 1,
    slug: "1k",
    name: "First Kilometer",
    description: "Complete a single verified run of at least 1 km",
    label: "1K",
    sub: "SINGLE RUN",
    criterion: "SingleRunMeters",
    threshold: 1000,
  },
  {
    id: 2,
    slug: "5k",
    name: "First 5K",
    description: "Complete a single verified run of at least 5 km",
    label: "5K",
    sub: "SINGLE RUN",
    criterion: "SingleRunMeters",
    threshold: 5000,
  },
  {
    id: 3,
    slug: "10k",
    name: "First 10K",
    description: "Complete a single verified run of at least 10 km",
    label: "10K",
    sub: "SINGLE RUN",
    criterion: "SingleRunMeters",
    threshold: 10000,
  },
  {
    id: 4,
    slug: "half",
    name: "First Half Marathon",
    description: "Complete a single verified run of at least 21.0975 km",
    label: "21.1",
    sub: "HALF",
    criterion: "SingleRunMeters",
    threshold: 21098,
  },
  {
    id: 5,
    slug: "marathon",
    name: "First Marathon",
    description: "Complete a single verified run of at least 42.195 km",
    label: "42.2",
    sub: "MARATHON",
    criterion: "SingleRunMeters",
    threshold: 42195,
  },
  {
    id: 6,
    slug: "streak-7",
    name: "7-Day Streak",
    description: "Run at least 1 km per day for 7 consecutive days",
    label: "7",
    sub: "DAY STREAK",
    criterion: "StreakDays",
    threshold: 7,
  },
  {
    id: 7,
    slug: "streak-14",
    name: "14-Day Streak",
    description: "Run at least 1 km per day for 14 consecutive days",
    label: "14",
    sub: "DAY STREAK",
    criterion: "StreakDays",
    threshold: 14,
  },
  {
    id: 8,
    slug: "streak-30",
    name: "30-Day Streak",
    description: "Run at least 1 km per day for 30 consecutive days",
    label: "30",
    sub: "DAY STREAK",
    criterion: "StreakDays",
    threshold: 30,
  },
  {
    id: 9,
    slug: "total-10k",
    name: "Double Digits Total",
    description: "Accumulate 10 km across all verified runs",
    label: "10K",
    sub: "TOTAL",
    criterion: "TotalDistanceMeters",
    threshold: 10000,
  },
  {
    id: 10,
    slug: "century",
    name: "Century Club",
    description: "Accumulate 100 km across all verified runs",
    label: "100",
    sub: "TOTAL KM",
    criterion: "TotalDistanceMeters",
    threshold: 100000,
  },
];

const ORANGE = "#D83900";
const INK = "#231813";

function badgeSvg({ label, sub }) {
  const fontSize = label.length >= 4 ? 168 : label.length === 3 ? 200 : 240;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" role="img">
  <rect width="1024" height="1024" fill="#FFFFFF"/>
  <!-- outer badge ring -->
  <circle cx="512" cy="512" r="420" fill="none" stroke="${ORANGE}" stroke-width="28"/>
  <circle cx="512" cy="512" r="372" fill="none" stroke="${INK}" stroke-width="6" opacity="0.18"/>
  <!-- route arc -->
  <path d="M220 620c80-190 196-290 292-290s212 100 292 290"
        fill="none" stroke="${ORANGE}" stroke-width="36" stroke-linecap="round"/>
  <circle cx="320" cy="470" r="16" fill="${INK}"/>
  <circle cx="512" cy="330" r="20" fill="${ORANGE}"/>
  <circle cx="704" cy="470" r="16" fill="${INK}"/>
  <!-- milestone numeral -->
  <text x="512" y="700" text-anchor="middle" font-family="DM Sans, system-ui, sans-serif"
        font-size="${fontSize}" font-weight="700" fill="${INK}" letter-spacing="-0.03em">${escapeXml(label)}</text>
  <text x="512" y="780" text-anchor="middle" font-family="DM Sans, system-ui, sans-serif"
        font-size="36" font-weight="600" fill="${ORANGE}" letter-spacing="0.12em">${escapeXml(sub)}</text>
</svg>
`;
}

function escapeXml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function toDataUri(mime, content) {
  const b64 = Buffer.from(content, "utf8").toString("base64");
  return `data:${mime};base64,${b64}`;
}

const uris = [];

for (const a of ACHIEVEMENTS) {
  const svg = badgeSvg(a);
  const svgPath = path.join(brandDir, `${a.slug}.svg`);
  fs.writeFileSync(svgPath, svg);

  const imageDataUri = toDataUri("image/svg+xml", svg);
  const metadata = {
    name: a.name,
    description: a.description,
    image: imageDataUri,
    external_url: "https://movrchain.app",
    attributes: [
      { trait_type: "Criterion", value: a.criterion },
      { trait_type: "Threshold", value: a.threshold },
      { trait_type: "Achievement ID", value: a.id },
    ],
  };

  // Local file for app/docs (image as relative path for UI; wallets use data URI version)
  const localMeta = {
    ...metadata,
    image: `/brand/achievements/${a.slug}.svg`,
  };
  fs.writeFileSync(path.join(metaDir, `${a.slug}.json`), JSON.stringify(localMeta, null, 2));

  const onChainJson = JSON.stringify(metadata);
  const tokenUri = toDataUri("application/json", onChainJson);
  uris.push({ id: a.id, slug: a.slug, name: a.name, tokenUri });

  fs.writeFileSync(path.join(outDir, `${a.slug}.uri.txt`), tokenUri);
}

fs.writeFileSync(
  path.join(outDir, "uris.json"),
  JSON.stringify(
    uris.map(({ id, slug, name, tokenUri }) => ({
      id,
      slug,
      name,
      tokenUriLength: tokenUri.length,
      tokenUri,
    })),
    null,
    2,
  ),
);

// Solidity-friendly env dump for foundry script (base64 lines)
const envLines = uris.map((u) => `URI_${u.id}=${u.tokenUri}`).join("\n");
fs.writeFileSync(path.join(outDir, "uris.env"), envLines);

console.log(`Generated ${ACHIEVEMENTS.length} badges + metadata`);
console.log(`SVGs: ${brandDir}`);
console.log(`Local JSON: ${metaDir}`);
console.log(`On-chain URIs: ${outDir}/uris.json`);
