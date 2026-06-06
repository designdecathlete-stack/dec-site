import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const outputFile = path.join(rootDir, "site-map", "data.js");
const baseUrl = "https://dec-site.netlify.app/";
const excludedDirs = new Set([".git", "site-map", "tools", "画像"]);

const decodeEntities = (value = "") =>
  value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();

const stripTags = (value = "") => decodeEntities(value.replace(/<[^>]*>/g, " "));

const toRoute = (filePath) =>
  path.relative(rootDir, filePath).split(path.sep).map(encodeURIComponent).join("/");

const toPublicUrl = (route) => {
  const clean = route.replace(/\/index\.html$/i, "/");
  return new URL(clean, baseUrl).href;
};

const extractGtmInfo = (source) => {
  const head = source.match(/<head[^>]*>([\s\S]*?)<\/head>/i)?.[1] || "";
  const ids = [...head.matchAll(/GTM-[A-Z0-9]+/gi)]
    .map((match) => match[0].toUpperCase())
    .filter((id, index, list) => list.indexOf(id) === index);
  const hasLoader = /googletagmanager\.com\/gtm\.js/i.test(head);

  return {
    hasHeadTag: hasLoader && ids.length > 0,
    ids,
  };
};

const readDirSafe = async (dir) => {
  try {
    return await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
};

const walk = async (dir) => {
  const entries = await readDirSafe(dir);
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (excludedDirs.has(entry.name)) continue;
      files.push(...(await walk(fullPath)));
    } else {
      files.push(fullPath);
    }
  }

  return files;
};

const extractPageInfo = async (filePath) => {
  const source = await fs.readFile(filePath, "utf8");
  const stat = await fs.stat(filePath);
  const route = toRoute(filePath);
  const title = stripTags(source.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "");
  const h1 = stripTags(source.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] || "");
  const description =
    decodeEntities(source.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["'][^>]*>/i)?.[1] || "") ||
    decodeEntities(source.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["'][^>]*>/i)?.[1] || "");
  const imageMatches = [...source.matchAll(/<(?:img|source)[^>]+(?:src|srcset)=["']([^"']+)["']/gi)];
  const links = [...source.matchAll(/href=["'](https?:\/\/[^"']+)["']/gi)]
    .map((match) => match[1])
    .filter((url, index, list) => list.indexOf(url) === index)
    .slice(0, 12);
  const gtm = extractGtmInfo(source);

  return {
    fileName: path.basename(filePath),
    route,
    publicUrl: toPublicUrl(route),
    localPath: filePath,
    title: title || h1 || path.basename(filePath),
    description,
    imageCount: imageMatches.length,
    externalLinks: links,
    gtm,
    sizeKb: Math.round(stat.size / 1024),
    updatedAt: stat.mtime.toISOString(),
  };
};

const summarizeAssets = async (dir) => {
  const allFiles = await walk(dir);
  const assets = allFiles.filter((file) => /\.(avif|webp|png|jpe?g|gif|svg|mp4|mov|pdf)$/i.test(file));
  const totalBytes = await assets.reduce(async (sumPromise, file) => {
    const sum = await sumPromise;
    const stat = await fs.stat(file);
    return sum + stat.size;
  }, Promise.resolve(0));

  return {
    count: assets.length,
    totalMb: Math.round((totalBytes / 1024 / 1024) * 10) / 10,
    samples: assets.slice(0, 8).map((file) => toRoute(file)),
  };
};

const build = async () => {
  const topLevel = await readDirSafe(rootDir);
  const clientDirs = topLevel
    .filter((entry) => entry.isDirectory() && !excludedDirs.has(entry.name))
    .map((entry) => path.join(rootDir, entry.name));

  const clients = [];

  for (const dir of clientDirs) {
    const files = await walk(dir);
    const htmlFiles = files.filter((file) => /\.html?$/i.test(file)).sort((a, b) => a.localeCompare(b));
    if (htmlFiles.length === 0) continue;

    const pages = [];
    for (const file of htmlFiles) pages.push(await extractPageInfo(file));

    const stat = await fs.stat(dir);
    const route = path.relative(rootDir, dir).split(path.sep).join("/");
    const primaryPage = pages.find((page) => /^index\.html?$/i.test(page.fileName)) || pages[0];
    const domains = [...new Set(pages.flatMap((page) => page.externalLinks.map((url) => new URL(url).hostname)))].sort();
    const gtmPageCount = pages.filter((page) => page.gtm.hasHeadTag).length;
    const gtmIds = [...new Set(pages.flatMap((page) => page.gtm.ids))].sort();

    clients.push({
      id: route,
      name: route,
      directory: route,
      publicUrl: toPublicUrl(`${route}/index.html`),
      localPath: dir,
      primaryTitle: primaryPage.title,
      pageCount: pages.length,
      assetSummary: await summarizeAssets(dir),
      externalDomains: domains,
      gtm: {
        pageCount: gtmPageCount,
        status: gtmPageCount === 0 ? "missing" : gtmPageCount === pages.length ? "complete" : "partial",
        ids: gtmIds,
      },
      updatedAt: stat.mtime.toISOString(),
      pages,
    });
  }

  clients.sort((a, b) => a.name.localeCompare(b.name));

  const payload = {
    generatedAt: new Date().toISOString(),
    repository: {
      name: "dec-site",
      localPath: rootDir,
      publicBaseUrl: baseUrl,
      remote: "https://github.com/designdecathlete-stack/dec-site",
    },
    totals: {
      clients: clients.length,
      pages: clients.reduce((sum, client) => sum + client.pageCount, 0),
      assets: clients.reduce((sum, client) => sum + client.assetSummary.count, 0),
      gtmPages: clients.reduce((sum, client) => sum + client.gtm.pageCount, 0),
    },
    clients,
  };

  await fs.mkdir(path.dirname(outputFile), { recursive: true });
  await fs.writeFile(
    outputFile,
    `window.DEC_SITE_DATA = ${JSON.stringify(payload, null, 2)};\n`,
    "utf8",
  );

  console.log(`Generated ${path.relative(rootDir, outputFile)}: ${clients.length} clients, ${payload.totals.pages} pages`);
};

build().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
