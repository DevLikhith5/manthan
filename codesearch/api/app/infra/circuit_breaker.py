import time
import asyncio
import logging

logger = logging.getLogger(__name__)


class CircuitBreaker:
    def __init__(
        self,
        name: str,
        failure_threshold: int = 5,
        recovery_timeout: float = 30.0,
        half_open_max_requests: int = 1,
    ):
        self.name = name
        self.failure_threshold = failure_threshold
        self.recovery_timeout = recovery_timeout
        self.half_open_max_requests = half_open_max_requests

        self.state = "closed"
        self.failure_count = 0
        self.last_failure_time = 0.0
        self.half_open_requests = 0
        self._lock = asyncio.Lock()

    async def call(self, fn, *args, **kw):
        await self._check_state()
        try:
            result = await fn(*args, **kw)
            await self._on_success()
            return result
        except Exception as e:
            await self._on_failure()
            raise

    async def _check_state(self):
        async with self._lock:
            if self.state == "open":
                if time.monotonic() - self.last_failure_time >= self.recovery_timeout:
                    logger.info("circuit %s: open -> half-open", self.name)
                    self.state = "half-open"
                    self.half_open_requests = 0
                else:
                    raise CircuitBreakerOpenError(
                        f"circuit {self.name} is open"
                    )
            if self.state == "half-open":
                if self.half_open_requests >= self.half_open_max_requests:
                    raise CircuitBreakerOpenError(
                        f"circuit {self.name} half-open at max probes"
                    )
                self.half_open_requests += 1

    async def _on_success(self):
        async with self._lock:
            if self.state == "half-open":
                logger.info("circuit %s: half-open -> closed (probe ok)", self.name)
                self.state = "closed"
                self.failure_count = 0

    async def _on_failure(self):
        async with self._lock:
            self.failure_count += 1
            self.last_failure_time = time.monotonic()
            if self.state == "half-open":
                logger.warning("circuit %s: half-open probe failed -> open", self.name)
                self.state = "open"
            elif self.failure_count >= self.failure_threshold:
                logger.warning(
                    "circuit %s: %d failures -> open",
                    self.name,
                    self.failure_count,
                )
                self.state = "open"


class CircuitBreakerOpenError(Exception):
    pass
