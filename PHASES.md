# Implementation Phases

### Phase 1: Knowledge Base & Vector Search (The "Discovery" Superpower)
- **Task:** Setup MongoDB Atlas with a `destinations` collection.
- **Task:** Create a 2dsphere index on location fields for proximity-based filtering.
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
- **Task:** Integrate Google Maps API for distance and traffic matrix calculations.
- **Task:** Integrate Google Places API to fetch ratings and social proof for events.
- **Tool Mapping:**
    - `create_itinerary`: Write new plans to Atlas.
    - `query_preferences`: Fetch user context.
    - `search_activities`: Semantic search via Vector Search.

### Phase 4: Multi-Step Mission Logic (The "Action")
- **Logic Flow:**
    1. **Elicitation:** Gemini asks clarifying questions to narrow down the intent.
    2. **Research:** Query MongoDB via Vector Search for destinations matching the user's "vibe."
    3. **Planning:** Sequence segments into a logical order, applying UTC normalization for all duration and buffer calculations.
    4. **Verification:** Validate planning logic against the Buffer Test Suite.
    5. **Persistence:** Save the resulting document to the `itineraries` collection via the MCP tool.
    6. **Confirmation:** Present the plan, explicitly highlighting "Top Recommendations" vs. "Budget Alternatives" for the user to review.

---
**Navigation:**
- [Main Implementation Plan](IMPLEMENTATION_PLAN.md)
- [Data Model Details](DATA_MODEL.md)
- [Why MongoDB?](WHY_MONGODB.md)