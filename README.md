# dpgen-content-pipeline

Video content pipeline scaffold for eight YouTube channels: a FastAPI renderer for Cloud Run, Google Cloud Workflows and Pipedream definitions that call Gemini, Veo, Imagen and Cloud Text-to-Speech, Firestore seed data, and a Cloudflare Worker proxy for deepparallel.org; only the renderer runs locally today.

## Status

experimental

Six commits between 2025-09-10 and 2025-09-12 (`git log`), nothing since. On 2026-09-11 the renderer installed from its own `requirements.txt`, passed its one test and served its health route, and the `seeds/` and `scripts/` packages installed from their lockfiles. Nothing that touches Google Cloud, YouTube or Cloudflare was run.

What does not work:

- CI (`.github/workflows/ci.yml`) failed on all three runs, including the only push to `master` (2025-09-12, job `build-and-test`); the `deploy` job is an `echo` placeholder.
- Root `package.json` scripts point at files that do not exist: `test:pipeline` calls `scripts/test_pipeline.js` (the file is `scripts/test-pipeline.js`) and `monitor` calls `scripts/monitor.js` (absent). The root `package-lock.json` lists no packages.
- `deepparallel.org` answers every path with a Cloudflare managed challenge (HTTP 403, `cf-mitigated: challenge`), so `/health` and `/api/*` from `wrangler.toml` cannot be reached with curl. `deepparallel.pages.dev` does not resolve. The Cloud Run renderer URL in the guides (`dpgen-renderer-29690876826.us-central1.run.app`) returns HTTP 403 to a browser agent and a Google 503 error page to a plain GET.
- Two Dependabot PRs (#1 pip, #2 npm) are open and unmerged.
- No LICENSE file.

## Install and first run

Run on 2026-09-11 (macOS, uv, Python 3.11.15, Node 26.5.0, npm 11.17.0):

    cd renderer
    uv venv --python 3.11 .venv
    uv pip install --python .venv/bin/python -r requirements.txt
    (exit 0)

    .venv/bin/python -m pytest -q
    1 passed, 2 warnings in 5.23s

    .venv/bin/python -m uvicorn app:app --host 127.0.0.1 --port 3972
    curl http://127.0.0.1:3972/
    {"status":"healthy","service":"deepparallel-renderer","version":"1.0.0"}
    curl http://127.0.0.1:3972/jobs
    {"jobs":[],"total":0,"limit":10,"offset":0}

    cd seeds && npm ci
    added 110 packages in 1s
    cd scripts && npm ci
    added 46 packages in 1s

Not run, and why:

- `node seeds/seed_channels.js`: writes to Firestore; needs `GCP_PROJECT_ID` and Google credentials.
- `scripts/test-pipeline.js`: calls the Vertex `gemini-2.5-flash` endpoint for project `content-pipeline-7dd4f`; paid and keyed.
- `POST /render`: needs Cloud Storage, Firestore and ffmpeg; not exercised.
- `docker build` (three renderer Dockerfiles), `gcloud run deploy`, `wrangler deploy`, `firebase deploy`, and every script under `scripts/` and `monetization/`: they create or change cloud resources.

## What runs today

- `renderer/app.py`: FastAPI app with `GET /`, `GET /jobs`, `POST /render`, `GET /render/{job_id}`, `POST /render/{job_id}/cancel`, `POST /batch-render`. `GET /` and `GET /jobs` were probed; `renderer/test_smoke.py` covers `GET /`.
- `seeds/seed_channels.js`: defines eight channels (`circuit-myth`, `deeptime-microhistory`, `zero-view-science`, `map-oddities`, `space-minute`, `design-details`, `pattern-language`, `econ-snack`) for Firestore. Installs; not run.
- `workflows-gcp/main.yaml` (generated from `main.yaml.tmpl`): a Google Cloud Workflows definition. `workflows/*.js`: three Pipedream workflow objects (parent, publish, analytics). `agents/quality-validator.js`, `monitoring/*.js`, `enhancements/viral-predictor.js`, `monetization/*.js`: Node scripts that parse (`node --check`) and were not run.
- `cloudflare-worker.js` with `wrangler.toml`: proxies `deepparallel.org/api/*` and `/health` to Cloud Run with CORS headers. Parses; not deployed today.
- Nine markdown guides in the root, plus `docs/` and `public/` static pages for the domain.

## Roadmap

- Point the root `test:pipeline` script at `scripts/test-pipeline.js`; add or delete `monitor`.
- Make `ci.yml` pass once, or remove it.
- Decide whether `deepparallel.org` and the Cloud Run renderer stay up; both fail from outside today.
- Add a LICENSE file that matches the `MIT` field in `package.json`.

## Limits

- Not a product. The repository holds no rendered video, run log or published output; whether a video was ever produced from this code cannot be shown from the tree.
- The old README's cost estimate (about $0.20 per video) and `MONETIZATION_STRATEGY.md`'s revenue projections ($20,000 to 100,000+ monthly, per-stream ranges, percentage confidence) have no invoice, analytics export or data behind them in this repository. Treat them as withdrawn.
- `enhancements/viral-predictor.js`, `monetization/revenue-optimizer.js`, `sponsorship-matcher.js`, `affiliate-engine.js`, `course-creator.js` and `merch-generator.js` are scripts without data, models or tests. Do not use their output for decisions.
- Placeholders: `REPLACE_ME` for `CSE_CX` and `CSE_API_KEY` in `seeds/seed_channels.js`; `deepparallel-renderer-xxx.run.app` in the guides. The old README's line "Your credentials are already configured in config/" is false; `config/` holds only `.env.example`.
- `wrangler.toml` carries a Cloudflare account ID and zone ID, and `scripts/test-pipeline.js` hard-codes the GCP project `content-pipeline-7dd4f`. These are identifiers, not secrets, but they tie the code to one account.
- `renderer/app.py` constructs Cloud Storage and Firestore clients at import time. The routes probed today did not use them.
- Where credentials are supplied, prompts, scripts and media go to Google Cloud and uploads go to YouTube. No data handling promise is made.

## License and contact

No license file. `package.json` says `MIT`; no `LICENSE` file backs it.

Contact: michael@crowelogic.com
