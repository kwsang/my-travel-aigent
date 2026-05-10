from google.adk.agents import Agent
from google import adk

async def auto_save_session_to_memory_callback(callback_context):
    await callback_context.add_session_to_memory()

agent = Agent(
    model=MODEL,
    name="Generic_QA_Agent",
    instruction="Answer the user's questions",
    tools=[adk.tools.preload_memory_tool.PreloadMemoryTool()],
    after_agent_callback=auto_save_session_to_memory_callback,
)