## Arize

Arize is the single platform built to help you accelerate development of AI apps and agents – then perfect them in production. Arize AX is an AI engineering platform focused on evaluation and observability. It helps AI engineers and AI product managers develop, evaluate, iterate and observe and monitor AI applications and agents. Arize helps enterprises increase their speed in building AI agents and ensure effectiveness for those outcomes that they can trust in production environments.

Build Gemini Agents with Full Observability and Self-Introspection via MCP
Ship agents that do more than run.  Ship agents that can self improve. With Arize Phoenix, your Gemini-powered agent gets production-grade tracing from day one, plus the ability to query its own traces, prompts, datasets, and experiments as tools at runtime via the Phoenix MCP server. Every decision your agent makes becomes inspectable, evaluable, and improvable.

We'll evaluate submissions based on technical implementation, meaningful use of tracing and MCP, quality of the agent's self-improvement loop, and overall impact.

Here are some guidelines to get you started:

The Arize track requires a code-owned agent runtime — Gemini CLI, Gemini Enterprise Agent Platform SDK, Google ADK, Agent Runtime, or Cloud Run. The visual Agent Builder alone is not supported for tracing integration. You must be able to instrument your code directly.
Instrument your agent with OpenInference. Auto-instrumentors exist for Google ADK, Agent Platform, Google GenAI, LangChain, LlamaIndex and many other frameworks.
Send traces to Phoenix Cloud (free SAAS) or self-hosted Phoenix
Configure the Phoenix MCP server in your agent so it can introspect its own operational data at runtime
Run evaluations on your traces with LLM-as-a-Judge or code evals to demonstrate quality
Bonus points for agents that use their own observability data to improve over time