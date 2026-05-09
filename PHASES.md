# Implementation Phases

### Phase 1: Knowledge Base & Vector Search (The "Discovery" Superpower)
- **Task:** Setup MongoDB Atlas with a `destinations` collection.
- **Vector Search:** Generate embeddings for destination descriptions (beaches, cities, vibes).
- **Goal:** Allow the agent to handle queries like "find me a hidden gem in Portugal for a surfing trip."

### Phase 2: Persistent Memory & Schema Design (The "Context" Superpower)
- **Task:** Define schemas for `UserProfiles` and `Itineraries`.
- **Schema Strategy:**
    - `UserProfiles`: Store preferences (budget, dietary, airline loyalty).
    - `Itineraries`: Use MongoDB's flexible document model to handle varying activity types (flights, stay, dining).
- **Goal:** Ensure the agent remembers the user's budget and past preferences across sessions.

### Phase 3: MCP Server Integration
- **Task:** Deploy the MongoDB MCP server.
- **Tool Mapping:**
    - `create_itinerary`: Write new plans to Atlas.
    - `query_preferences`: Fetch user context.
    - `search_activities`: Semantic search via Vector Search.

### Phase 4: Multi-Step Mission Logic (The "Action")
- **Logic Flow:**
    1. **Elicitation:** Gemini asks clarifying questions to narrow down the intent.
    2. **Research:** Query MongoDB via Vector Search for destinations matching the user's "vibe."
    3. **Planning:** Sequence segments (`FLIGHT`, `ACCOMMODATION`, `EXPERIENCE`) into a logical order.
    4. **Persistence:** Save the resulting document to the `itineraries` collection via the MCP tool.
    5. **Confirmation:** Present the plan to the user for final approval or iteration.

---
**Navigation:**
- [Main Implementation Plan](IMPLEMENTATION_PLAN.md)
- [Data Model Details](DATA_MODEL.md)
- [Why MongoDB?](WHY_MONGODB.md)