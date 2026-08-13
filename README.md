# shinwar.se

A lab. Small interactive things — arcade games, quizzes, trainers, and toys — each one its own
self-contained page. Nothing is saved between visits: no accounts, no scores, no tracking.

## Run it

Double-click `index.html`.

No install, no server, no build step. The site is plain HTML, CSS, and JavaScript.

## Deploy it

```bash
git push
```

Cloudflare Pages picks it up and the change is live in about 20 seconds.

## Add an experiment

Create `x/<slug>/index.html`, then add one entry to `experiments.js`. The homepage updates itself.

Full conventions and the copy-paste skeleton are in [CLAUDE.md](CLAUDE.md).
