import time
from collections import OrderedDict
from typing import Any, Optional

class LRUTTLCache:
    """A Least Recently Used (LRU) cache with Time-To-Live (TTL) expiration."""
    
    def __init__(self, ttl_seconds: int = 3600, max_size: int = 1000):
        self.ttl_seconds = ttl_seconds
        self.max_size = max_size
        self._cache = OrderedDict()

    def get(self, key: Any) -> Optional[Any]:
        if key in self._cache:
            timestamp, cached_data = self._cache[key]
            if time.time() - timestamp < self.ttl_seconds:
                self._cache.move_to_end(key)
                return cached_data
            del self._cache[key]
        return None

    def set(self, key: Any, value: Any) -> None:
        self._cache[key] = (time.time(), value)
        if len(self._cache) > self.max_size:
            self._cache.popitem(last=False)