import time
import logging
from typing import Any
from google.adk.plugins.base_plugin import BasePlugin
from google.adk.agents.invocation_context import InvocationContext

logger = logging.getLogger(__name__)

class ExecutionTimingPlugin(BasePlugin):
    """
    Custom ADK Plugin to trace and print the execution duration
    of LLM reasoning hops and tool calls directly in the terminal.
    """
    def __init__(self):
        super().__init__(name="execution_timing")
        # Dictionary to store start timestamps for concurrent calls
        self._timers = {}

    async def before_model_call(self, ctx: InvocationContext, **kwargs: Any) -> None:
        self._timers["model_call"] = time.time()

    async def after_model_call(self, ctx: InvocationContext, **kwargs: Any) -> None:
        start = self._timers.get("model_call")
        if start:
            logger.info(f"⏱️ [TIMING] Agent LLM Reasoning took {time.time() - start:.2f}s")

    async def before_tool_call(self, ctx: InvocationContext, tool_name: str, **kwargs: Any) -> None:
        self._timers[f"tool_{tool_name}"] = time.time()

    async def after_tool_call(self, ctx: InvocationContext, tool_name: str, **kwargs: Any) -> None:
        start = self._timers.get(f"tool_{tool_name}")
        if start:
            logger.info(f"⏱️ [TIMING] Tool '{tool_name}' execution took {time.time() - start:.2f}s")