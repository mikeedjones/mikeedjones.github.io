# mikeedjones.github.io

A paper-thin personal blog. The final site is plain HTML and CSS, with
no client-side JavaScript. A TypeScript build step compiles the
Markdown and MDX source, then renders it through Jinja-style
templates, into that final site.

## Structure

- `content/index.md` — the home page source. Its `title` is your name.
  The page shows the last word in bold blue. Its `contact` list makes the
  row of links under the name. Each link has an `icon` (`github` or
  `linkedin`, from `assets/icons/`), a `label` and a `url`. The text
  below the front matter is the bio.
- `content/posts/*.md` or `*.mdx` — post source files. Each file starts
  with front matter (`title`, `date`, `description`, and an optional
  `publish: false` to hide a draft from the home page).
- `content/entries/*.md` — entry files. An entry links to work that is
  published on a different site, such as an article or a paper. An
  entry file has front matter only, with no text below it. See
  "Add an entry" below.
- `templates/page.html` — the base layout. Every page fills in its
  `{% block body %}`.
- `templates/index.html` — the home page template. It extends
  `page.html`. It shows one list for each home page section. Each list
  holds the posts and entries for that section, with the newest first.
- `templates/post.html` — the post page template. It also extends
  `page.html`.

  These templates use [Nunjucks](https://mozilla.github.io/nunjucks/),
  a JavaScript template engine with the same syntax as Python's Jinja2
  (`{{ }}`, `{% if %}`, `{% for %}`, `{% extends %}`).
- `style.css` — the one stylesheet for the whole site.
- `scripts/build.ts` — the build script. It reads `content/`, compiles
  each Markdown or MDX file to HTML, renders it through the matching
  Nunjucks template, and writes the finished site to `dist/`.
- `.github/workflows/deploy.yml` — builds the site and publishes
  `dist/` to GitHub Pages on every push to `main`.

## Add a post

1. Add a new file to `content/posts/`, as `.md` or `.mdx`.
2. Give it front matter (`title`, `date`, `description`) and text
   below it.
3. Leave out `publish: false` when the post is ready to show on the
   home page. Set it to hide a draft.
4. Push to `main`. The workflow builds and publishes the site.

A post goes in the "Writing" section. To put it in a different
section, set `section` in its front matter.

## Add an entry

1. Add a new `.md` file to `content/entries/`.
2. Give it front matter only, as in this example:

   ```yaml
   ---
   title: Measuring the Gain of a Microchannel Plate/Phosphor Assembly Using a Convolutional Neural Network
   date: 2019-12
   url: https://ieeexplore.ieee.org/document/8886588
   section: research
   venue: IEEE Transactions on Nuclear Science, 66(12)
   links:
     - label: arXiv
       url: https://arxiv.org/abs/1906.05481
   ---
   ```

3. Push to `main`.

The fields are:

- `title`, `url` — required. The title links to the URL.
- `date` — required. Use `YYYY`, `YYYY-MM` or `YYYY-MM-DD`.
- `section` — required. Use `writing`, `research` or `projects`. The `SECTIONS`
  list in `scripts/build.ts` sets the section names and their order.
  Add a new section there.
- `venue` — optional. This text shows in brackets after the title.
- `links` — optional. Each extra link shows in the brackets too.
- `publish: false` — optional. This hides the entry.

The build stops with an error when a post or an entry has a missing
or incorrect field.

## Build locally

```
npm install
npm run build
```

This writes the finished site to `dist/`.

## Test

```
npm test
```

This runs `scripts/build.test.ts`. The tests build small fixture sites
in a temporary folder. They also build the real `content/` into a
temporary folder, so a bad post or entry makes a test fail.
