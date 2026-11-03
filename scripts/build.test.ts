// Tests for scripts/build.ts. Run with `npm test`.
//
// The unit tests cover the front matter checks and the list order. The
// build tests write a small site from fixture files in a temporary
// folder, so they never touch `content/` or `dist/`.

import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  build,
  DEFAULT_OPTIONS,
  formatDate,
  listItems,
  normalizeDate,
  sectionKey,
  type BuildOptions,
  type EntryMeta,
  type Post,
} from "./build";

describe("normalizeDate", () => {
  test("turns a YAML date back into YYYY-MM-DD", () => {
    assert.equal(normalizeDate(new Date("2019-05-28"), "f.md"), "2019-05-28");
  });

  test("keeps YYYY and YYYY-MM strings", () => {
    assert.equal(normalizeDate("2019", "f.md"), "2019");
    assert.equal(normalizeDate("2019-12", "f.md"), "2019-12");
  });

  test("accepts a bare year that YAML reads as a number", () => {
    assert.equal(normalizeDate(2019, "f.md"), "2019");
  });

  test("rejects a missing or free-text date", () => {
    assert.throws(() => normalizeDate(undefined, "f.md"), /f\.md: "date" must be/);
    assert.throws(() => normalizeDate("Dec 2019", "f.md"), /f\.md: "date" must be/);
  });
});

describe("formatDate", () => {
  test("shows a year, a month or a full date", () => {
    assert.equal(formatDate("2019"), "2019");
    assert.equal(formatDate("2019-12"), "Dec 2019");
    assert.equal(formatDate("2019-05-08"), "8 May 2019");
  });

  test("drops the day when asked", () => {
    assert.equal(formatDate("2026-01-22", false), "Jan 2026");
  });
});

describe("sectionKey", () => {
  test("accepts a known section", () => {
    assert.equal(sectionKey("research", "f.md"), "research");
  });

  test("rejects an unknown section and names the allowed ones", () => {
    assert.throws(() => sectionKey("talks", "f.md"), /must be one of projects, writing, research/);
  });
});

describe("listItems", () => {
  const post = (slug: string, date: string, publish?: boolean): Post => ({
    slug,
    meta: { title: slug, date, publish, section: "writing" },
    bodyHtml: "",
  });
  const entry = (title: string, date: string, publish?: boolean): EntryMeta => ({
    title,
    date,
    url: `https://example.com/${title}`,
    section: "writing",
    publish,
  });

  test("merges posts and entries, newest first", () => {
    const items = listItems(
      [post("mid", "2024-06-01"), post("old", "2020")],
      [entry("new", "2025-01-01"), entry("month", "2024-07")]
    );
    assert.deepEqual(
      items.map((item) => item.title),
      ["new", "month", "mid", "old"]
    );
  });

  test("links a post to its own page and an entry to its url", () => {
    const [a, b] = listItems([post("a", "2024")], [entry("b", "2023")]);
    assert.equal(a.href, "posts/a.html");
    assert.equal(b.href, "https://example.com/b");
  });

  test("leaves out anything with publish: false", () => {
    const items = listItems([post("draft", "2024", false)], [entry("hidden", "2024", false)]);
    assert.deepEqual(items, []);
  });
});

describe("build", () => {
  let tmp: string;
  let options: BuildOptions;

  const write = (relative: string, text: string) => {
    const full = path.join(options.contentDir, relative);
    mkdirSync(path.dirname(full), { recursive: true });
    writeFileSync(full, text);
  };
  const output = (relative: string) => readFileSync(path.join(options.outDir, relative), "utf8");

  beforeEach(() => {
    tmp = mkdtempSync(path.join(tmpdir(), "site-build-test-"));
    options = { contentDir: path.join(tmp, "content"), outDir: path.join(tmp, "dist") };
    write("index.md", "---\ntitle: Test Site\n---\n\n# Test Site\n");
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  test("renders posts and entries into their sections", async () => {
    write("posts/hello.md", "---\ntitle: Hello post\ndate: 2024-01-01\n---\n\nHello **world**.\n");
    write(
      "entries/paper.md",
      [
        "---",
        "title: A paper",
        "date: 2019-12",
        "url: https://example.com/paper",
        "section: research",
        "venue: Some Journal, 1(2)",
        "links:",
        "  - label: arXiv",
        "    url: https://arxiv.org/abs/0000.00000",
        "---",
        "",
      ].join("\n")
    );
    write(
      "entries/article.md",
      "---\ntitle: An article\ndate: 2025-04-17\nurl: https://example.com/article\nsection: writing\n---\n"
    );

    const { posts, entries } = await build(options);
    assert.equal(posts.length, 1);
    assert.equal(entries.length, 2);

    const index = output("index.html");
    assert.ok(index.indexOf("<h2>Writing</h2>") < index.indexOf("<h2>Research</h2>"));
    assert.ok(index.indexOf("An article") < index.indexOf("Hello post"), "newest first");
    assert.match(index, /<a class="entry-title" href="posts\/hello\.html">Hello post<\/a>/);
    assert.match(
      index,
      /<a class="entry-title external" href="https:\/\/example\.com\/paper">A paper<\/a>/
    );
    assert.match(index, /<span class="venue">Some Journal, 1\(2\)<\/span>/);
    assert.match(index, /<a class="tag" href="https:\/\/arxiv\.org\/abs\/0000\.00000">arXiv<\/a>/);
    assert.match(index, /<time datetime="2019-12">Dec 2019<\/time>/);
    assert.match(index, /<time datetime="2024-01-01">Jan 2024<\/time>/);

    const postPage = output("posts/hello.html");
    assert.match(postPage, /<strong>world<\/strong>/);
    assert.match(postPage, /<time datetime="2024-01-01">1 Jan 2024<\/time>/);

    assert.ok(existsSync(path.join(options.outDir, "style.css")));
    assert.ok(existsSync(path.join(options.outDir, "favicon.svg")));
  });

  test("leaves out a section with nothing in it", async () => {
    write(
      "entries/article.md",
      "---\ntitle: An article\ndate: 2025\nurl: https://example.com/article\nsection: writing\n---\n"
    );
    await build(options);
    assert.doesNotMatch(output("index.html"), /<h2>Research<\/h2>/);
  });

  test("hides an entry with publish: false", async () => {
    write(
      "entries/hidden.md",
      "---\ntitle: Secret\ndate: 2025\nurl: https://example.com/x\nsection: writing\npublish: false\n---\n"
    );
    await build(options);
    assert.doesNotMatch(output("index.html"), /Secret/);
  });

  test("escapes HTML in front matter", async () => {
    write(
      "entries/x.md",
      '---\ntitle: "<script>alert(1)</script>"\ndate: 2025\nurl: https://example.com/x\nsection: writing\n---\n'
    );
    await build(options);
    assert.doesNotMatch(output("index.html"), /<script>/);
    assert.match(output("index.html"), /&lt;script&gt;/);
  });

  test("stops on an entry with no url", async () => {
    write("entries/bad.md", "---\ntitle: No link\ndate: 2025\nsection: writing\n---\n");
    await assert.rejects(build(options), /bad\.md: front matter needs a "url" string/);
  });

  test("stops on an empty post file", async () => {
    write("posts/empty.mdx", "");
    await assert.rejects(build(options), /empty\.mdx: front matter needs a "title" string/);
  });
});

test("the real content builds", async () => {
  const outDir = mkdtempSync(path.join(tmpdir(), "site-build-real-"));
  try {
    const { entries } = await build({ contentDir: DEFAULT_OPTIONS.contentDir, outDir });
    assert.ok(entries.length > 0);
    assert.match(readFileSync(path.join(outDir, "index.html"), "utf8"), /<h2>Writing<\/h2>/);
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
});
