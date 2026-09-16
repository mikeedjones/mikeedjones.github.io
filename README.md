# mikeedjones.github.io

A paper-thin personal blog. The final site is plain HTML and CSS, with
no client-side JavaScript. A TypeScript build step compiles the
Markdown and MDX source, then renders it through Jinja-style
templates, into that final site.

## Structure

- `content/index.md` — the home page source. It has the name and bio.
- `content/posts/*.md` or `*.mdx` — post source files. Each file starts
  with front matter (`title`, `date`, `description`, and an optional
  `publish: false` to hide a draft from the home page).
- `templates/page.html` — the base layout. Every page fills in its
  `{% block body %}`.
- `templates/index.html` — the home page template. It extends
  `page.html` and loops over the post list with `{% for post in posts %}`.
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

## Build locally

```
npm install
npm run build
```

This writes the finished site to `dist/`.
