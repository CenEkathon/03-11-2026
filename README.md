# cenEkathon: Strategy Compiler (MOCK hackathon demo)

Decision support prototype. It turns a mock CEO goal into a workforce and financial execution plan.

**All data here is mock or synthetic.** Northwind Bank is fictional. The goal, roadmap, employees and cost figures are demo inputs. Vacancy evidence is an external 2021 observation. Nothing describes a real company or real people.

Start with `CLAUDE.md`, `docs/ARCHITECTURE.md` and `docs/PRODUCT_SPEC.md`.

## Backend

```bash
cd backend
uv sync
uv run pytest                                     # tests
uv run python tools/gen_workforce.py              # regenerate the synthetic workforce (seeded)
uv run uvicorn strategy_compiler.api:app --port 8000
```

The vacancy ETL reads `data/vacancies_2021.parquet`, which is not committed:

```bash
cd backend
uv run python -m strategy_compiler.etl.vacancies_etl --input ../data/vacancies_2021.parquet --out-dir ../data/derived
```

## Frontend

```bash
cd frontend
npm install
npm run dev        # http://localhost:5173, expects the API on port 8000
npm test
npm run typecheck
npm run build
```

## Live narrative (optional, opt-in)

The CEO brief uses a deterministic template by default. To draft it with Claude:

```bash
export STRATEGY_COMPILER_LLM=live
export ANTHROPIC_API_KEY=...          # never commit this; keep it in .env (git-ignored)
```

Usage is logged to `backend/.cache/usage.jsonl`.
