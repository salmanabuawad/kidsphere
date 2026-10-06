"""Provider adapters, by name. The only place that knows which adapters exist.

An engine's configuration names an adapter (``AI_<ENGINE>_PROVIDER``); the orchestrator looks
it up here. Today only the built-in "mock" adapter is registered: no real provider is
connected yet. To add one, see docs/ai-engines.md ("Adding a provider"): write
``providers/<name>.py`` implementing ``interfaces.ProviderAdapter`` and register it below.
Vendor-specific details (URLs, headers, payloads, model names) stay inside that file.
"""
from app.ai.engines.interfaces import ProviderAdapter
from app.ai.engines.providers.mock import MockAdapter

ADAPTERS: dict[str, ProviderAdapter] = {
    "mock": MockAdapter(),
}


def get(name: str | None) -> ProviderAdapter | None:
    return ADAPTERS.get(name) if name else None


def names() -> list[str]:
    return sorted(ADAPTERS)
