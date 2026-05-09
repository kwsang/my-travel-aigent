# Phase 3: MCP Server & API Integration

## Overview
Phase 3 focuses on transforming the "My Travel Aigent" from a local reasoning engine into a functional agent. We are bridging the gap between our validated planning logic and real-world data by integrating the **Model Context Protocol (MCP)** for MongoDB Atlas and external Google Maps/Places APIs.

## 1. MongoDB MCP Server Integration
The MCP server acts as the persistent memory layer for Gemini, allowing it to read user context and write finalized missions.

### Tool Definitions
- **`query_user_profile`**: Fetches the User Document from the `UserProfiles` collection. 
    - **Input Schema**: `{ "user_id": "string" }`
    - **Logic**: Retrieves preferences like `circadian_preference`, `risk_tolerance`, and `budget` to seed the temporal and financial reasoning.
- **`save_itinerary`**: Persists the generated JSON to the `Itineraries` collection.
    - **Input Schema**: An `itinerary` object following the schema in `DATA_MODEL.md`.
    - **Logic**: Ensures the "mission" is saved for cross-session retrieval.
- **`search_activities`**: Executes Atlas Vector Search queries against the `destinations` collection to find venues matching the user's "vibe" tags.
    - **Input Schema**: `{ "query": "string", "limit": number, "min_rating": number }`
    - **Logic**: Uses semantic similarity via the `vector_index` to find venues that match the user's requested "vibe" and minimum quality threshold.

### 1.1 Embedding Strategy
To ensure semantic consistency with the Gemini "Brain":
- **Model**: Use Google's `text-embedding-004`.
- **Vector Size**: 768 dimensions (matches `vector_index` configuration).

### 1.1 Technical Implementation (MCP Config)
To enable these tools, the MCP server configuration (typically `mcp-config.json`) should map these functions to specific Atlas collections:
```json
{
  "mcpServers": {
    "mongodb": {
      "command": "npx",
      "args": ["-y", "@mongodb-js/mcp-server-mongodb"],
      "env": {
        "MONGODB_URI": "mongodb+srv://<user>:<password>@cluster.mongodb.net/my-travel-aigent"
      }
    }
  }
}
```

## 2. Google Maps API (Traffic-Aware Transit)
We are replacing the mock buffer estimates with ground-truth data to satisfy the **Traffic-Aware Transparency** requirement.

### Implementation Steps
1. **Distance Matrix API**: Use the `geo` coordinates from the itinerary segments to request `duration_in_traffic`.
2. **Buffer Calculation**: Pass the real-time traffic duration into our validated `calculate_buffer` function.
3. **Driving vs. Flying Logic**:
    - If `duration_in_traffic` < 360 mins (6 hours), the agent must propose a `TRANSPORT (Driving)` segment to maximize hotel value, per `SYSTEM_PROMPT.md`.

## 3. Google Places API (Operating Hours & Social Proof)
This integration enforces the **"Closed Door" Rule** and the **Transparency Rule**.

### Functional Requirements
- **Operating Window Validation**: Cross-reference the `local_start_time` of `DINING` and `EXPERIENCE` segments with the venue's `opening_hours`.
- **Rating Thresholds**: 
    - If `rating` < `min_rating`, the agent must flag the event as a **"Budget Alternative"**.
    - Use the `user_ratings_total` to verify the credibility of the recommendation.
- **Amenity Verification**: For `ACCOMMODATION`, verify that requested amenities (e.g., "pool", "gym") exist before confirming the selection.

## 4. Integration Checklist (Agent Builder)
To finalize this phase, the following tools must be mapped in the Google Cloud Agent Builder console:

| Tool Name | Provider | Purpose |
| :--- | :--- | :--- |
| `mcp_query_profile` | MongoDB MCP | Fetch user constraints and budget. |
| `mcp_save_plan` | MongoDB MCP | Persist the final validated itinerary. |
| `google_maps_matrix` | Google Maps API | Get real-time traffic durations between `geo` points. |
| `google_places_details` | Google Places API | Validate venue hours and ratings. |

## 5. Success Criteria
- [ ] Gemini can correctly identify if a Night Owl's dinner at 10:00 PM is possible based on real Places API data.
- [ ] Itineraries are successfully saved to MongoDB Atlas and are retrievable by `user_id`.
- [ ] Budget warnings (90% threshold) trigger based on actual estimated costs from API-provided price levels.

---
**Navigation:**
- Back to Implementation Plan
- Review Phase 2 Logic