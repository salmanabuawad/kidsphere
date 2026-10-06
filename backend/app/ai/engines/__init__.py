"""KidSphere AI engines: provider-agnostic capabilities behind one orchestrator.

    UI → API (routers/ai_engines.py) → orchestrator → engine contracts → provider adapters
                                                                         (configured later)

The core knows engines ("Story Engine", "Video Animator Engine", ...), never vendors:

    catalog.py       the 21 engines: input/output contracts, tasks, child-facing, long jobs
    contracts.py     EngineRequest, EngineCall, ProviderResponse, AIResult, every engine's shapes
    interfaces.py    ReasoningEngine, StoryEngine, ... (what the app calls) and ProviderAdapter
    facade.py        engines(db, user, ...) → typed objects implementing those interfaces
    config.py        per-engine configuration (AI_<ENGINE>_* + admin overrides; secrets by reference)
    orchestrator.py  validate → configure → execute (retry, fallback) → validate → trace
    validation.py    contract, sanitize and safety checks on every output
    pipelines.py     multi-engine flows (activity for a goal, personalized cartoon)
    assets.py        produced files (UPLOAD_DIR/ai, served after the access check)
    providers/       adapters by name; "mock" is built in (AI_MOCK_MODE)

Child data reaches an engine only as ``app.ai.context.engine_child_context`` (a pseudonymous
reference, age, labels and masked texts). See docs/ai-engines.md.
"""
from app.ai.engines.catalog import ENGINE_KEYS, ENGINES, EngineSpec
from app.ai.engines.contracts import AIResult, EngineRequest, LanguageSpec
from app.ai.engines.facade import Engines, engines
from app.ai.engines.orchestrator import poll, run
from app.ai.engines.pipelines import PIPELINES, run_pipeline

__all__ = [
    "AIResult", "ENGINES", "ENGINE_KEYS", "EngineRequest", "EngineSpec", "Engines", "LanguageSpec", "PIPELINES",
    "engines", "poll", "run", "run_pipeline",
]
