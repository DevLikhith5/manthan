import asyncio
import logging

logger = logging.getLogger(__name__)


async def retry_with_backoff(
    fn,
    *args,
    max_retries: int = 3,
    base_delay: float = 0.5,
    max_delay: float = 10.0,
    retryable_exceptions: tuple = (Exception,),
    **kw,
):
    last_exc = None
    for attempt in range(max_retries + 1):
        try:
            return await fn(*args, **kw)
        except retryable_exceptions as e:
            last_exc = e
            if attempt < max_retries:
                delay = min(base_delay * (2 ** attempt), max_delay)
                logger.warning(
                    "retry %s/%s after %.1fs: %s",
                    attempt + 1, max_retries, delay, e,
                )
                await asyncio.sleep(delay)
            else:
                logger.error("all %d retries exhausted: %s", max_retries + 1, e)
    raise last_exc
