# MongoDB MCP Server Utilization Plan

> **Architecture Note (Custom Tools vs. Generic MCP Server):**
> While we could use the Google ADK's `McpToolset` to connect to a generic MongoDB MCP server, we are intentionally implementing these as custom Python `FunctionTool`s wrapping `motor`. 
> *   **Why?** A generic MCP server exposes raw database query capabilities. If the LLM generates a broad query, it could return massive payloads, blowing out the Gemini context window and exhausting the 512MB Free Tier limits. 
> *   **Benefit:** Custom tools (like `get_top_items_from_scratchpad`) act as a strict API boundary. They enforce business logic (like budget calculation), prevent destructive operations, and guarantee that the LLM only receives highly-optimized JSON fragments.

## Phase 1: Multi-Turn State Management & The "Scratchpad"
- [x] **Active Itinerary State:** Store the active `Itinerary` (with its `status: 'draft' | 'final'`) in MongoDB.
- [x] **Expose MCP Tools:** Implement tools for the agent to `read_draft_itinerary`, `update_event`, or `calculate_budget`.
- [x] **Agent Scratchpad:** Create a `planning_scratchpad` collection for temporary JIT data (e.g., 20 restaurants from Google Places API).
- [x] **Scratchpad Query Tools:** Create MCP tools to query the scratchpad (e.g., `get_top_3_restaurants_from_scratchpad`).
- [x] **Free Tier Optimization:** Implement **TTL (Time-To-Live) Indexes** on the scratchpad collection (e.g., `expireAfterSeconds: 86400` for 24 hours).

## Phase 2: JIT Geospatial Caching (The "Local Guide")
- [x] **Location Data Caching:** Save Google API responses (`SuggestionPlace` or `EventDetails`) to a `places_cache` collection with a GeoJSON `location` field.
- [x] **Index Creation:** Create a `2dsphere` index on the `location` field via Atlas or code.
- [x] **Geospatial MCP Tool:** Expose a MongoDB MCP tool like `find_nearby_cached_places(lat, lng, radius, category)`.
- [x] **Agent Integration:** Update agent prompts/logic to use `$near` operator queries via the MCP tool before hitting external Google APIs.

## Phase 3: Contextual Memory & Semantic Caching
- [x] **Traveler Profile Persistence:** Store the `TravelerProfile` (budget limits, circadian preference, etc.) in a `users` collection.
- [x] **Profile Fetching:** Ensure the MCP server fetches this context automatically upon `chat_session` initialization.
- [x] **Past Trip "Success" Caching:** Save final, highly-rated `Itinerary` documents to a `successful_trips` collection.
- [x] **Semantic Search (Atlas Vector Search):** Generate and store vector embeddings for `Itinerary.trip_name` or `Destination.vibe_tags`.
- [x] **Vector Search MCP Tool:** Expose an MCP tool allowing the agent to retrieve past itineraries as highly-contextual few-shot examples.

## Phase 4: Schema-less JIT Payload Normalization
- [x] **The "Raw + Normalized" Pattern:** Update insertion logic to store documents containing both strict TypeScript types (e.g., `EventDetails`) and a `raw_google_data` object.
- [x] **Raw Data Queries:** Create tools enabling the MCP server to query nested `raw_google_data` using dot notation to answer ad-hoc agent questions (saving redundant API calls).

## Phase 5: Event-Driven Triggers (Lightweight)
- [x] **Atlas Database Triggers:** Set up basic triggers (supported on Free Tier M0) in the MongoDB Atlas console.
- [x] **Async Validation:** Trigger a background Serverless Function when a draft `Itinerary` is updated to run budget and scheduling conflict validation.
- [x] **Update Validation Fields:** Update the `is_conflict` boolean and populate `validation_errors` in the database asynchronously.
- [x] **Agent Notification:** Ensure the agent checks validation fields on the next conversational turn to proactively warn the user.

## Free Tier Rules of Engagement Checklist
- [x] **Aggressive TTL:** Verify auto-delete is working for JIT Google API responses and chat scratchpads after 48 hours to protect the 512MB limit.
- [x] **Connection Pooling:** Verify the MCP server aggressively pools MongoDB connections (M0 limit: 500 connections).
- [x] **Targeted Vector Search:** Verify embeddings are kept small (e.g., embedding only destination vibes and user interests).