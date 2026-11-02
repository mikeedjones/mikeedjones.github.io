// Compile-time site build. Reads Markdown/MDX posts from `content/`,
// converts each to static HTML, renders them through the Jinja-style
// Nunjucks templates, and writes the finished site to `dist/`. Also
// reads the front-matter-only entries in `content/entries/`, which
// link to work published elsewhere, and lists them on the home page.
// Run with `npm run build`.

import { readFileSync, writeFileSync, mkdirSync, readdirSync, rmSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import matter from "gray-matter";
import { compile, run, type RunOptions } from "@mdx-js/mdx";
import * as runtime from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import nunjucks from "nunjucks";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const TEMPLATES_DIR = path.join(ROOT, "templates");
const ICONS_DIR = path.join(ROOT, "assets", "icons");

const env = new nunjucks.Environment(new nunjucks.FileSystemLoader(TEMPLATES_DIR), {
  autoescape: true,
});

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Turns a YYYY, YYYY-MM or YYYY-MM-DD string into "2019", "Dec 2019" or
// "28 May 2019". With `withDay` false, it drops the day ("May 2019").
export function formatDate(value: string, withDay = true): string {
  const [year, month, day] = value.split("-");
  if (!month) return year;
  const monthYear = `${MONTHS[Number(month) - 1]} ${year}`;
  return day && withDay ? `${Number(day)} ${monthYear}` : monthYear;
}

env.addFilter("formatDate", formatDate);

const ICONS: Record<string, string> = {
  github: readFileSync(path.join(ICONS_DIR, "github.svg"), "utf8"),
  linkedin: readFileSync(path.join(ICONS_DIR, "linkedin.svg"), "utf8"),
};

env.addGlobal("icons", ICONS);

// Where the build reads content from and writes the site to. The
// defaults are the real site; tests pass temporary folders.
export interface BuildOptions {
  contentDir: string;
  outDir: string;
}

export const DEFAULT_OPTIONS: BuildOptions = {
  contentDir: path.join(ROOT, "content"),
  outDir: path.join(ROOT, "dist"),
};

// The home page sections, in display order. Every post and entry names
// one of these keys in its `section` front matter (posts default to
// "writing").
export const SECTIONS = [
  { key: "writing", heading: "Writing" },
  { key: "research", heading: "Research" },
] as const;

export type SectionKey = (typeof SECTIONS)[number]["key"];

interface PostMeta {
  title: string;
  date: string;
  description?: string;
  publish?: boolean;
  section?: SectionKey;
}

export interface Post {
  slug: string;
  meta: PostMeta;
  bodyHtml: string;
}

// An entry is a front-matter-only file in `content/entries/` that links
// to work published somewhere else, such as an article or a paper.
interface EntryLink {
  label: string;
  url: string;
}

export interface EntryMeta {
  title: string;
  date: string;
  url: string;
  section: SectionKey;
  venue?: string;
  links?: EntryLink[];
  publish?: boolean;
}

// One row of a home page list, made from a post or an entry.
export interface ListItem {
  title: string;
  date: string;
  href: string;
  section: SectionKey;
  venue?: string;
  links: EntryLink[];
  // True when `href` goes to a different site.
  external: boolean;
}

// Accepts YYYY, YYYY-MM or YYYY-MM-DD. YAML parses an unquoted
// YYYY-MM-DD as a Date, so turn that back into the same string.
export function normalizeDate(value: unknown, file: string): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "number") value = String(value);
  if (typeof value === "string" && /^\d{4}(-\d{2}(-\d{2})?)?$/.test(value)) return value;
  throw new Error(`${file}: "date" must be YYYY, YYYY-MM or YYYY-MM-DD, got ${JSON.stringify(value)}`);
}

function requireString(data: Record<string, unknown>, key: string, file: string): string {
  const value = data[key];
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${file}: front matter needs a "${key}" string`);
  }
  return value;
}

function optionalString(data: Record<string, unknown>, key: string, file: string): string | undefined {
  return data[key] === undefined ? undefined : requireString(data, key, file);
}

export function sectionKey(value: unknown, file: string): SectionKey {
  const match = SECTIONS.find((section) => section.key === value);
  if (!match) {
    const keys = SECTIONS.map((section) => section.key).join(", ");
    throw new Error(`${file}: "section" must be one of ${keys}, got ${JSON.stringify(value)}`);
  }
  return match.key;
}

async function compileBody(source: string): Promise<string> {
  const compiled = await compile(source, {
    outputFormat: "function-body",
    development: false,
  });
  const { default: Content } = await run(compiled, runtime as unknown as RunOptions);
  return renderToStaticMarkup(Content({}));
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).filter((name) => name.endsWith(".mdx") || name.endsWith(".md"));
}

async function loadPost(postsDir: string, file: string): Promise<Post> {
  const full = path.join(postsDir, file);
  const { data, content } = matter(readFileSync(full, "utf8"));
  const where = path.relative(ROOT, full);
  const slug = file.replace(/\.(mdx|md)$/, "");
  const meta: PostMeta = {
    title: requireString(data, "title", where),
    date: normalizeDate(data.date, where),
    description: data.description,
    publish: data.publish,
    section: sectionKey(data.section ?? "writing", where),
  };
  const bodyHtml = await compileBody(content);
  return { slug, meta, bodyHtml };
}

async function loadPosts(contentDir: string): Promise<Post[]> {
  const postsDir = path.join(contentDir, "posts");
  const files = existsSync(postsDir) ? sourceFiles(postsDir) : [];
  return Promise.all(files.map((file) => loadPost(postsDir, file)));
}

function loadEntry(entriesDir: string, file: string): EntryMeta {
  const full = path.join(entriesDir, file);
  const { data } = matter(readFileSync(full, "utf8"));
  const where = path.relative(ROOT, full);
  const links = (data.links ?? []) as Record<string, unknown>[];
  if (!Array.isArray(links)) throw new Error(`${where}: "links" must be a list`);
  return {
    title: requireString(data, "title", where),
    date: normalizeDate(data.date, where),
    url: requireString(data, "url", where),
    section: sectionKey(data.section, where),
    venue: optionalString(data, "venue", where),
    links: links.map((link) => ({
      label: requireString(link, "label", where),
      url: requireString(link, "url", where),
    })),
    publish: data.publish,
  };
}

function loadEntries(contentDir: string): EntryMeta[] {
  const entriesDir = path.join(contentDir, "entries");
  const files = existsSync(entriesDir) ? sourceFiles(entriesDir) : [];
  return files.map((file) => loadEntry(entriesDir, file));
}

export function listItems(posts: Post[], entries: EntryMeta[]): ListItem[] {
  const fromPosts = posts
    .filter((post) => post.meta.publish !== false)
    .map<ListItem>((post) => ({
      title: post.meta.title,
      date: post.meta.date,
      href: `posts/${post.slug}.html`,
      section: post.meta.section ?? "writing",
      links: [],
      external: false,
    }));
  const fromEntries = entries
    .filter((entry) => entry.publish !== false)
    .map<ListItem>((entry) => ({
      title: entry.title,
      date: entry.date,
      href: entry.url,
      section: entry.section,
      venue: entry.venue,
      links: entry.links ?? [],
      external: true,
    }));
  return [...fromPosts, ...fromEntries].sort((a, b) => (a.date < b.date ? 1 : -1));
}

async function buildIndex(options: BuildOptions, posts: Post[], entries: EntryMeta[]): Promise<void> {
  const raw = readFileSync(path.join(options.contentDir, "index.md"), "utf8");
  const { data, content } = matter(raw);
  const bodyHtml = await compileBody(content);

  const items = listItems(posts, entries);
  const sections = SECTIONS.map((section) => ({
    heading: section.heading,
    items: items.filter((item) => item.section === section.key),
  })).filter((section) => section.items.length > 0);

  const where = path.relative(ROOT, path.join(options.contentDir, "index.md"));
  const title = requireString(data, "title", where);
  // The icon and handle row under the name, as on the CV.
  const contact = ((data.contact ?? []) as Record<string, unknown>[]).map((link) => {
    const icon = requireString(link, "icon", where);
    if (!(icon in ICONS)) {
      throw new Error(`${where}: contact icon must be one of ${Object.keys(ICONS).join(", ")}, got "${icon}"`);
    }
    return { icon, label: requireString(link, "label", where), url: requireString(link, "url", where) };
  });

  const page = env.render("index.html", {
    title,
    root: "",
    content: bodyHtml,
    contact,
    sections,
  });
  writeFileSync(path.join(options.outDir, "index.html"), page);
}

async function buildPosts(outDir: string, posts: Post[]): Promise<void> {
  mkdirSync(path.join(outDir, "posts"), { recursive: true });
  for (const post of posts) {
    const page = env.render("post.html", {
      title: post.meta.title,
      root: "../",
      date: post.meta.date,
      content: post.bodyHtml,
    });
    writeFileSync(path.join(outDir, "posts", `${post.slug}.html`), page);
  }
}

// Builds the whole site from `options.contentDir` into `options.outDir`.
// It deletes `options.outDir` first.
export async function build(
  options: BuildOptions = DEFAULT_OPTIONS
): Promise<{ posts: Post[]; entries: EntryMeta[] }> {
  const { outDir } = options;
  if (existsSync(outDir)) rmSync(outDir, { recursive: true });
  mkdirSync(outDir, { recursive: true });

  const posts = await loadPosts(options.contentDir);
  const entries = loadEntries(options.contentDir);

  await buildPosts(outDir, posts);
  await buildIndex(options, posts, entries);

  writeFileSync(path.join(outDir, "style.css"), readFileSync(path.join(ROOT, "style.css")));
  writeFileSync(
    path.join(outDir, "favicon.svg"),
    readFileSync(path.join(ROOT, "assets", "favicon.svg"))
  );

  return { posts, entries };
}

async function main(): Promise<void> {
  const { posts, entries } = await build();
  console.log(
    `Built ${posts.length} post(s) and ${entries.length} entry(s) to ${path.relative(ROOT, DEFAULT_OPTIONS.outDir)}/`
  );
}

// Run only when started as a script, not when a test imports this file.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
