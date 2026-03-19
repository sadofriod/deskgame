import fs from "fs";
import path from "path";

const repoRoot = path.resolve(import.meta.dirname, "..");
const targetRoot = path.join(repoRoot, "public", "admin", "vendor");

const assets = [
  {
    source: path.join(repoRoot, "node_modules", "react", "umd", "react.production.min.js"),
    target: path.join(targetRoot, "react", "react.production.min.js"),
  },
  {
    source: path.join(repoRoot, "node_modules", "react-dom", "umd", "react-dom.production.min.js"),
    target: path.join(targetRoot, "react-dom", "react-dom.production.min.js"),
  },
  {
    source: path.join(repoRoot, "node_modules", "@mui", "material", "umd", "material-ui.production.min.js"),
    target: path.join(targetRoot, "mui", "material-ui.production.min.js"),
  },
  {
    source: path.join(repoRoot, "node_modules", "marked", "lib", "marked.umd.js"),
    target: path.join(targetRoot, "marked", "marked.umd.js"),
  },
  {
    source: path.join(repoRoot, "node_modules", "dompurify", "dist", "purify.min.js"),
    target: path.join(targetRoot, "dompurify", "purify.min.js"),
  },
];

fs.rmSync(targetRoot, { recursive: true, force: true });
for (const asset of assets) {
  if (!fs.existsSync(asset.source)) {
    throw new Error(`Missing admin vendor asset: ${asset.source}`);
  }
  fs.mkdirSync(path.dirname(asset.target), { recursive: true });
  fs.copyFileSync(asset.source, asset.target);
}
