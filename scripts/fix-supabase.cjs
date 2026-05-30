/* global __dirname */
const fs = require("fs");
const path = require("path");

const PATCH_BEFORE_VERSION = "2.107.0";

function compareVersions(left, right) {
  const leftParts = left.split(".").map((part) => Number.parseInt(part, 10) || 0);
  const rightParts = right.split(".").map((part) => Number.parseInt(part, 10) || 0);
  const partCount = Math.max(leftParts.length, rightParts.length);

  for (let index = 0; index < partCount; index += 1) {
    const diff = (leftParts[index] || 0) - (rightParts[index] || 0);
    if (diff !== 0) {
      return diff;
    }
  }

  return 0;
}

const filePath = path.join(
  __dirname,
  "..",
  "node_modules",
  "@supabase",
  "supabase-js",
  "dist",
  "index.mjs"
);
const packagePath = path.join(
  __dirname,
  "..",
  "node_modules",
  "@supabase",
  "supabase-js",
  "package.json"
);

if (!fs.existsSync(filePath)) {
  process.exit(0);
}

const packageJson = fs.existsSync(packagePath)
  ? JSON.parse(fs.readFileSync(packagePath, "utf8"))
  : null;
const installedVersion = packageJson && typeof packageJson.version === "string"
  ? packageJson.version
  : null;

if (installedVersion && compareVersions(installedVersion, PATCH_BEFORE_VERSION) >= 0) {
  console.log(`✔ @supabase/supabase-js ${installedVersion}: skipping OTEL patch for ${PATCH_BEFORE_VERSION}+`);
  process.exit(0);
}

const source = fs.readFileSync(filePath, "utf8");
// React Native's Metro/Hermes build cannot safely handle this optional OTEL dynamic import
// in the known affected @supabase/supabase-js 2.106.x bundle. Remove this workaround once
// the app upgrades to a Supabase release verified to be React Native-safe.
const patched = source.replace(
  /import\([^)]*OTEL_PKG\)\.catch\(\(\)\s*=>\s*null\)/g,
  "Promise.resolve(null)"
);

if (source !== patched) {
  fs.writeFileSync(filePath, patched);
  console.log("✔ Patched @supabase/supabase-js: replaced OTEL dynamic import with Promise.resolve(null)");
} else {
  console.log("✔ @supabase/supabase-js: already patched, no change needed");
}
