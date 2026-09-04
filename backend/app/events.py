"""
AeroCPI Pipeline Event Bus.
Provides a publish-subscribe mechanism for streaming pipeline events
to SSE clients. Thread-safe for sync pipeline code pushing events
to async SSE consumers.
"""
import asyncio
import datetime as dt
import json
import threading
from dataclasses import dataclass, field, asdict
from typing import Any, Dict, Optional, Set
from enum import Enum


class EventType(str, Enum):
    CONNECTED = "connected"
    PIPELINE_START = "pipeline_start"
    PIPELINE_END = "pipeline_end"
    SCRAPE_START = "scrape_start"
    SCRAPE_OK = "scrape_ok"
    SCRAPE_WARN = "scrape_warn"
    SCRAPE_ERROR = "scrape_error"
    CLEAN_STEP = "clean_step"
    INDEX_RECOMPUTED = "index_recomputed"
    BACKTEST_UPDATE = "backtest_update"
    SURGE_DETECTED = "surge_detected"
    PIPELINE_IDLE = "pipeline_idle"


@dataclass
class PipelineEvent:
    event_type: EventType
    message: str
    route: str = ""
    source: str = ""
    window: str = ""
    data: Dict[str, Any] = field(default_factory=dict)
    timestamp: str = field(default_factory=lambda: dt.datetime.now(dt.timezone.utc).strftime("%H:%M:%S"))

    def to_sse(self) -> str:
        payload = asdict(self)
        payload["event_type"] = self.event_type.value
        return f"data: {json.dumps(payload)}\n\n"


class EventBus:
    """
    Thread-safe event bus. Pipeline code (sync) publishes events;
    SSE endpoint (async) subscribes and yields them.
    """

    def __init__(self):
        self._subscribers: Set[asyncio.Queue] = set()
        self._lock = threading.Lock()
        self._is_running = False

    @property
    def is_running(self) -> bool:
        return self._is_running

    def set_running(self, running: bool):
        self._is_running = running

    def subscribe(self) -> asyncio.Queue:
        queue: asyncio.Queue = asyncio.Queue(maxsize=500)
        with self._lock:
            self._subscribers.add(queue)
        return queue

    def unsubscribe(self, queue: asyncio.Queue):
        with self._lock:
            self._subscribers.discard(queue)

    def publish(self, event: PipelineEvent):
        with self._lock:
            dead_queues = []
            for q in self._subscribers:
                try:
                    q.put_nowait(event)
                except asyncio.QueueFull:
                    dead_queues.append(q)
            for dq in dead_queues:
                self._subscribers.discard(dq)


# Module-level singleton
event_bus = EventBus()
