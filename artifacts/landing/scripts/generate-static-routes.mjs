import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const dist = join(process.cwd(), "dist");
const source = await readFile(join(dist, "index.html"), "utf8");

const routes = [
  {
    path: "delete-account",
    title: "Delete your account | MOVE Apayao",
    description: "Request deletion of your MOVE Apayao account and personal data, and check a private deletion request.",
    noindex: true,
  },
  {
    path: "terms",
    title: "Terms of Service | MOVE Apayao",
    description:
      "The rules that apply when passengers and drivers use MOVE Apayao.",
  },
  {
    path: "privacy",
    title: "Privacy Notice | MOVE Apayao",
    description:
      "How MOVE Apayao collects, uses, shares, retains, and protects personal data.",
  },
  {
    path: "reset-password",
    title: "Reset password | MOVE Apayao",
    description: "Securely set a new password for a MOVE Apayao account.",
    noindex: true,
  },
];

for (const route of routes) {
  const url = new URL(
    route.path,
    source.match(/<link rel="canonical" href="([^"]+)"/)?.[1],
  );
  let html = source
    .replace(/<title>.*?<\/title>/s, `<title>${route.title}</title>`)
    .replace(
      /(<meta\s+name="description"\s+content=")[^"]*("\s*\/?>)/s,
      `$1${route.description}$2`,
    )
    .replace(
      /(<link\s+rel="canonical"\s+href=")[^"]*("\s*\/?>)/s,
      `$1${url.href}$2`,
    )
    .replace(
      /(<meta\s+property="og:title"\s+content=")[^"]*("\s*\/?>)/s,
      `$1${route.title}$2`,
    )
    .replace(
      /(<meta\s+property="og:description"\s+content=")[^"]*("\s*\/?>)/s,
      `$1${route.description}$2`,
    )
    .replace(
      /(<meta\s+property="og:url"\s+content=")[^"]*("\s*\/?>)/s,
      `$1${url.href}$2`,
    )
    .replace(
      /(<meta\s+name="twitter:title"\s+content=")[^"]*("\s*\/?>)/s,
      `$1${route.title}$2`,
    )
    .replace(
      /(<meta\s+name="twitter:description"\s+content=")[^"]*("\s*\/?>)/s,
      `$1${route.description}$2`,
    );

  if (route.noindex)
    html = html.replace(
      "</head>",
      '    <meta name="robots" content="noindex, nofollow" />\n  </head>',
    );
  const output = join(dist, route.path);
  await mkdir(output, { recursive: true });
  await writeFile(join(output, "index.html"), html, "utf8");
}

console.log(`Generated ${routes.length} direct public routes.`);
