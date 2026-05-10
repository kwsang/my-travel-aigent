# Phase 4: Multi-Step Mission Logic

## Overview
Phase 4 is the "Orchestration" layer. We are teaching Gemini how to use the tools integrated in Phase 3 to execute a full planning mission. This involves moving from a single prompt to a stateful conversation that ends in a persisted, validated itinerary.

## 1. The Elicitation Flow (The "Interviewer")
To satisfy complex scenarios (like the "Relaxed Night Owl Bachelor Party"), Gemini must ensure it has the following variables before research begins:
- **Core Intent**: Destination and vibe.
- **Temporal Profile**: Early Bird vs. Night Owl.
- **Risk Tolerance**: Strict vs. Relaxed (for buffer scaling).
- **Logistics**: Party size, room sharing preferences, and personal transport availability.
- **Budget**: Total limit and per-person vs. total toggle.

## 2. Research & Discovery (The "Finder")
1. **Semantic Search**: Invoke `search_activities` using Voyage AI embeddings to find venues matching the user's "vibe."
2. **Distance Anchoring**: Group venues by proximity to minimize travel (especially for "Relaxed" users).
3. **Contextual Retrieval**: Use `query_user_profile` at the start of every session to ensure logic is tailored to the user's specific circadian and risk profiles.

## 3. The Planning & Verification Loop (The "Architect")
This is where the agent applies the rules from `SYSTEM_PROMPT.md`:
1. **Sequence**: Arrange events chronologically.
2. **Buffer Injection**: Call `google_maps_matrix` to get real traffic, then apply the `calculate_buffer` logic.
3. **Venue Check**: Call `google_places_details` to verify the "Closed Door" rule.
4. **Retreat Rule**: For "Relaxed" users, ensure the 2-hour accommodation block exists before dinner.
5. **Persistence**: Invoke `save_itinerary` once the user approves the draft to ensure the mission is recorded.

## 4. Tool Specification (OpenAPI)
To ensure standardized tool definitions, we maintain OpenAPI specs for our MCP tools. All specifications are stored in `\mcp\openapi-specs` and verified using `test/validate_openapi.py`.

## 5. Success Criteria
- [x] All OpenAPI specifications pass the validation script.
- [x] Architect System Prompt drafted for the planning loop.
- [x] Mission Simulation script created to verify tool orchestration.
- [ ] Agent handles a missing preference by asking a follow-up question in the Concierge state.
- [ ] Agent correctly identifies a "Closed Door" conflict in the Architect state and suggests an alternative.
- [ ] The final JSON saved to MongoDB Atlas passes the `validate_buffers.py` script.

## Next Action: Transition to UI
Finalize the programmatic ADK agent orchestration and FastAPI exposure, then proceed to Phase 5 to build the interactive dashboard.