import logging
from typing import Any
from google.adk.plugins.base_plugin import BasePlugin
from google.adk.agents.invocation_context import InvocationContext

class InterAgentLoggingPlugin(BasePlugin):
    """
    Custom ADK Plugin to intercept and clearly log the inner monologue, 
    tool requests, and handoffs between specialized agents.
    """
    def __init__(self):
        super().__init__(name="inter_agent_logger")

    async def after_model_call(self, ctx: InvocationContext, **kwargs: Any) -> None:
        model_response = kwargs.get("model_response") or kwargs.get("response")
        
        if model_response and hasattr(model_response, "candidates") and model_response.candidates:
            parts = model_response.candidates[0].content.parts
        elif ctx.session.events:
            last_event = ctx.session.events[-1]
            parts = getattr(last_event.content, "parts", []) if getattr(last_event, "content", None) else []
        else:
            return
            
        for part in parts:
            if getattr(part, "function_call", None):
                fc = part.function_call
                args = dict(fc.args) if hasattr(fc, "args") else {}
                print(f"\n🛠️  [AGENT TOOL INVOCATION] {fc.name}")
                for k, v in args.items():
                    print(f"    - {k}: {v}")
            elif getattr(part, "text", None):
                text = part.text.strip()
                if text:
                    print(f"\n💬  [AGENT MONOLOGUE/RESPONSE]\n{text}")