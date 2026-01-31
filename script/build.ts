import { build as esbuild } from "esbuild";
import { build as viteBuild } from "vite";
import { rm, readFile } from "fs/promises";

// Minimal allowlist - only critical dependencies that benefit from bundling
// Keep this list small to prevent build timeouts
const allowlist = [
  "express",
  "drizzle-orm",
  "zod",
  "nanoid",
];

async function buildAll() {
  await rm("dist", { recursive: true, force: true });

  console.log("building client...");
  await viteBuild();

  console.log("building server...");
  const pkg = JSON.parse(await readFile("package.json", "utf-8"));
  const allDeps = [
    ...Object.keys(pkg.dependencies || {}),
    ...Object.keys(pkg.devDependencies || {}),
  ];
  const externals = allDeps.filter((dep) => !allowlist.includes(dep));

  await esbuild({
    entryPoints: ["server/index.ts"],
    platform: "node",
    bundle: true,
    format: "cjs",
    outfile: "dist/index.cjs",
    define: {
      "process.env.NODE_ENV": '"production"',
    },
    minify: false,
    minifyWhitespace: true,
    external: externals,
    logLevel: "info",
    treeShaking: true,
  });
}

buildAll().catch((err) => {
  console.error(err);
  process.exit(1);
});
