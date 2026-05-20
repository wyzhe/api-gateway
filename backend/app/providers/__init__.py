from .apimart import APIMartProvider
from .apimart import close_client as _close_apimart
from .base import BaseProvider, ProviderResponse, ProviderStreamChunk
from .deepseek import DeepSeekProvider
from .deepseek import close_client as _close_deepseek


async def close_all_clients() -> None:
    """Close every provider's module-global httpx client. Called on app/worker shutdown."""
    await _close_apimart()
    await _close_deepseek()


__all__ = [
    "APIMartProvider",
    "DeepSeekProvider",
    "BaseProvider",
    "ProviderResponse",
    "ProviderStreamChunk",
    "close_all_clients",
]
