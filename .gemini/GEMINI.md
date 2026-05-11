## About the Challenge
Look at CHALLENGE.md for more information on the challenge.

## MY TRAVEL AIGENT
We are building a custom agent with Gemini 3 (and the **ADK Visual Builder**) to solve the real-world challenge of planning a trip, integrating with a partner's Model Context Protocol (MCP) server to give our agent the necessary abilities to do the job.

## Choosing a Partner
For the My Travel AIgent project, MongoDB is the ideal choice for our agent's database and persistent memory layer.

## Targeted Problems
As a user, I want to see how several trips might be planned before choosing a particular trip.

As a user, I want to limit my expenses while maximizing my enjoyment. For example, I would prefer to drive to a destination if it's in reasonable driving distance, but would prefer to fly otherwise. If I can drive there in the morning, check in at a reasonable time, I would feel like I got my money's worth with the hotel stay. If I'm driving all day to get there, just to sleep, it's not as enjoyable. Likewise, if I can drive there, do activites, and drive back at a reasonable time, I won't need to find accommodations, which would save me money.

As a user, I want to either choose between luxury or budget, or find a balance. This is especially true for accommodations. I generally prefer accommodations with the nicest possible amenities and good reviews but still within my budget.

As a user, I want to avoid wasting time, like in heavy commute traffic or spending too much time at the airport during layovers.

As a user, I want to plan trips for large parties, like bachelors parties in another town, sharing rooms to lower costs while being able to specify costs per person.

As a user, I usually want to plan trips for my significant other and myself, traveling as a party of 2 but accommodated by 1 bed. In this case, we prefer seeing the total price, not per person.

As a user, I want to interact with the travel AI agent through a responsive and visual website, not through a chat.

As a user, I want to view different potential trip ideas, making modifications and changes to the drafts to improve the trips towards my liking before deciding on any given trip.

## Out of Scope
International Travel
Currency Conversion

## Enforce Restrictions
Do not hallucinate that the module agents is in 'vertexai.preview.'
Do not hallucinate that the module agents is in 'google.cloud.aiplatform.preview'

## Samples
Use the /samples folder for samples on google adk. Rely on these instead of hallucinating.

## Best Practices

### Context
- Use the Right Context: Always use the most specific context object provided (ToolContext in tools/tool-callbacks, CallbackContext in agent/model-callbacks, ReadonlyContext where applicable). Use the full InvocationContext (ctx) directly in _run_async_impl / _run_live_impl only when necessary.
- State for Data Flow: context.state is the primary way to share data, remember preferences, and manage conversational memory within an invocation. Use prefixes (app:, user:, temp:) thoughtfully when using persistent storage.
- Artifacts for Files: Use context.save_artifact and context.load_artifact for managing file references (like paths or URIs) or larger data blobs. Store references, load content on demand.
- Tracked Changes: Modifications to state or artifacts made via context methods are automatically linked to the current step's EventActions and handled by the SessionService.
- Start Simple: Focus on state and basic artifact usage first. Explore authentication, memory, and advanced InvocationContext fields (like those for live streaming) as your needs become more complex.

### Events

- Clear Authorship: When building custom agents, ensure correct attribution for agent actions in the history. The framework generally handles authorship correctly for LLM/tool events.


Python
Use yield Event(author=self.name, ...) in BaseAgent subclasses.


- Semantic Content & Actions: Use event.content for the core message/data (text, function call/response). Use event.actions specifically for signaling side effects (state/artifact deltas) or control flow (transfer, escalate, skip_summarization).

- Idempotency Awareness: Understand that the SessionService is responsible for applying the state/artifact changes signaled in event.actions. While ADK services aim for consistency, consider potential downstream effects if your application logic re-processes events.
- Use is_final_response(): Rely on this helper method in your application/UI layer to identify complete, user-facing text responses. Avoid manually replicating its logic.
- Leverage History: The session's event list is your primary debugging tool. Examine the sequence of authors, content, and actions to trace execution and diagnose issues.
- Use Metadata: Use invocation_id to correlate all events within a single user interaction. Use event.id to reference specific, unique occurrences.

### Function Tools

- Fewer Parameters are Better: Minimize the number of parameters to reduce complexity.
Simple Data Types: Favor primitive data types like str and int over custom classes whenever possible.
- Meaningful Names: The function's name and parameter names significantly influence how the LLM interprets and utilizes the tool. Choose names that clearly reflect the function's purpose and the meaning of its inputs. Avoid generic names like do_stuff() or beAgent().
- Build for Parallel Execution: Improve function calling performance when multiple tools are run by building for asynchronous operation. For information on enabling parallel execution for tools, see Increase tool performance with parallel execution.

## Models
Generally use gemini-2.5-flash for moderate tasks.
Use gemini-2.5-flash-lite for high throughput low intensity tasks.
DO NOT USE gemini-1.5-flash, that is a hallucination (it does not exist)

## Package Structure
The backend (agent) is in /gemini_agent
The frontend is in /web