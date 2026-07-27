# kaist.run

Official website for KAIST RUN, the algorithmic problem-solving club (Next.js).

## Development

```bash
npm install
npm run dev
npm run build
npm run lint
```

## Adding a notice

Add a `.md` file with the same filename to both `content/notices/ko/` and `content/notices/en/`, then commit — the notice list updates automatically.

```md
---
title: "Title"
date: "YYYY-MM-DD"
pinned: false
---

Body content
```

- If either the ko or en file is missing, the `check-content` script fails the build.

## Adding a contest archive entry

Create a folder at `content/archive/{spring|fall}/{year}-{spring|fall}/` containing `ko.md` and `en.md`.

```md
---
title: "20XX KAIST RUN Spring Contest"
season: spring
year: 20XX
date: "YYYY-MM-DD"
resources:
  - file: editorial.pdf
    label: "Editorial"
judges:
  - name: "oj.uz"
    url: "https://oj.uz/problems/..."
---

Body content
```

- Files listed under `resources` should be placed in the same folder; they'll appear as download links.

## Editing the contact page

Edit `content/contact/ko.md` and `content/contact/en.md`.
