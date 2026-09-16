// Compile-time site build. Reads Markdown/MDX posts from `content/`,
// converts each to static HTML, renders them through the Jinja-style
// Nunjucks templates, and writes the finished site to `dist/`.
// Run with `npm run build`.

import { readFileSync, writeFileSync, mkdirSync, readdirSync, rmSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import matter from "gray-matter";
import { compile, run, type RunOptions } from "@mdx-js/mdx";
import * as runtime from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import nunjucks from "nunjucks";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const CONTENT_DIR = path.join(ROOT, "content");
const POSTS_DIR = path.join(CONTENT_DIR, "posts");
const OUT_DIR = path.join(ROOT, "dist");
const TEMPLATES_DIR = path.join(ROOT, "templates");
const ICONS_DIR = path.join(ROOT, "assets", "icons");

const env = new nunjucks.Environment(new nunjucks.FileSystemLoader(TEMPLATES_DIR), {
  autoescape: true,
});

env.addGlobal("icons", {
  github: readFileSync(path.join(ICONS_DIR, "github.svg"), "utf8"),
  linkedin: readFileSync(path.join(ICONS_DIR, "linkedin.svg"), "utf8"),
});

interface PostMeta {
  title: string;
  date: string;
  description?: string;
  publish?: boolean;
}

interface Post {
  slug: string;
  meta: PostMeta;
  bodyHtml: string;
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

async function loadPost(file: string): Promise<Post> {
  const raw = readFileSync(path.join(POSTS_DIR, file), "utf8");
  const { data, content } = matter(raw);
  const slug = file.replace(/\.(mdx|md)$/, "");
  const bodyHtml = await compileBody(content);
  return { slug, meta: data as PostMeta, bodyHtml };
}

async function loadPosts(): Promise<Post[]> {
  const files = existsSync(POSTS_DIR) ? sourceFiles(POSTS_DIR) : [];
  const posts = await Promise.all(files.map(loadPost));
  return posts.sort((a, b) => (a.meta.date < b.meta.date ? 1 : -1));
}

async function buildIndex(posts: Post[]): Promise<void> {
  const raw = readFileSync(path.join(CONTENT_DIR, "index.md"), "utf8");
  const { data, content } = matter(raw);
  const bodyHtml = await compileBody(content);

  const visiblePosts = posts
    .filter((post) => post.meta.publish !== false)
    .map((post) => ({ slug: post.slug, title: post.meta.title, date: post.meta.date }));

  const page = env.render("index.html", {
    title: (data.title as string) ?? "",
    root: "",
    content: bodyHtml,
    posts: visiblePosts,
  });
  writeFileSync(path.join(OUT_DIR, "index.html"), page);
}

async function buildPosts(posts: Post[]): Promise<void> {
  mkdirSync(path.join(OUT_DIR, "posts"), { recursive: true });
  for (const post of posts) {
    const page = env.render("post.html", {
      title: post.meta.title,
      root: "../",
      date: post.meta.date,
      content: post.bodyHtml,
    });
    writeFileSync(path.join(OUT_DIR, "posts", `${post.slug}.html`), page);
  }
}

async function main(): Promise<void> {
  if (existsSync(OUT_DIR)) rmSync(OUT_DIR, { recursive: true });
  mkdirSync(OUT_DIR, { recursive: true });

  const posts = await loadPosts();

  await buildPosts(posts);
  await buildIndex(posts);

  writeFileSync(path.join(OUT_DIR, "style.css"), readFileSync(path.join(ROOT, "style.css")));
  writeFileSync(
    path.join(OUT_DIR, "favicon.svg"),
    readFileSync(path.join(ROOT, "assets", "favicon.svg"))
  );

  console.log(`Built ${posts.length} post(s) to ${path.relative(ROOT, OUT_DIR)}/`);
}

main();
