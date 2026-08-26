import { copyFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const routes = [
  "overview",
  "local-setup",
  "passenger",
  "driver",
  "dashboard",
  "maps-gis",
  "email",
  "iot-gps",
  "api-reference",
  "system-status",
  "language-guides",
  "releases",
  "deployment",
  "security",
  "internal-runbooks",
];

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const dist = path.resolve(scriptDir, "../dist");
const index = path.resolve(dist, "index.html");

await Promise.all(
  routes.map(async (route) => {
    const directory = path.resolve(dist, route);
    await mkdir(directory, { recursive: true });
    await copyFile(index, path.resolve(directory, "index.html"));
  }),
);

await copyFile(index, path.resolve(dist, "404.html"));
const publicUrl = process.env.DOCS_PUBLIC_URL?.replace(/\/$/, "");
if (publicUrl) {
  const urls = ["", ...routes].map((route) => `  <url><loc>${publicUrl}/${route}</loc></url>`).join("\n");
  await writeFile(path.resolve(dist, "sitemap.xml"), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`, "utf8");
  await writeFile(path.resolve(dist, "robots.txt"), `User-agent: *\nAllow: /\nSitemap: ${publicUrl}/sitemap.xml\n`, "utf8");
}
console.log(`Generated ${routes.length} clean static routes and a 404 fallback.`);
