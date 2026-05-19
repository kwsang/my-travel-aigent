# MongoDB Data Modeling: My Travel Aigent

This document outlines the schema design and data modeling patterns used in the **My Travel Aigent** application, aligning with official MongoDB best practices.

## 1. Schema Design Principles

In MongoDB, data that is accessed together should be stored together. Our schema is optimized heavily around the agent's read/write workloads:

*   **The Planning Loop:** The agent rapidly reads and updates the trip's state (adding events, checking budgets). This requires fast, atomic, document-level updates.
*   **The Dashboard:** The frontend UI needs to render the entire trip at a glance without executing expensive database joins.
*   **Context Window Optimization:** The agent needs immediate access to semantic venue data without exceeding the Gemini context window token limits.

## 2. Applied Design Patterns

### The Polymorphic Pattern
Because MongoDB does not enforce rigid schemas, we store wildly different event types (`FLIGHT`, `LODGING`, `DINING`, `EXPERIENCE`) inside the same `events` array within a single `itineraries` document. 
*   **Benefit:** The agent can update an event, validate the budget, and flag conflicts in a single atomic `$set` operation.

### Strategic Data Duplication (Subset Pattern)
A user's profile dictates party size, preferences, and budget. If we referenced the profile via a document ID, the agent would have to perform an expensive `$lookup` every time it validates the budget during a chat. 
*   **Implementation:** We embed a snapshot of the `traveler_profile` directly into the `itineraries` document. 
*   **Benefit:** Queries retrieve all relevant constraints in a single read. Additionally, if the user updates their default party size next year, their historical trip plans will not retroactively break.

### Bounded Growth Pattern
The agent autonomously discovers and caches great lodging and activities for cities so it doesn't have to hit external Google APIs constantly. To prevent the destination documents from growing infinitely:
*   **Implementation:** We cap the `suggested_lodging` and `suggested_activities` arrays in the `destinations` collection to the top 50 items using the `$slice` update operator.

### Time-To-Live (TTL) Pattern
The Google ADK needs a database collection to store short-term conversational memory for active chats. Because users will abandon many chat sessions without finishing a trip:
*   **Implementation:** We attach an `updated_at` timestamp to the `sessions` collection and rely on a TTL index (`expireAfterSeconds: 2592000`) to automatically purge stale conversations after 30 days of inactivity.

### Geospatial Standardization
To enable spatial and proximity-based tools (e.g., "Find restaurants within 2 miles of my hotel"):
*   **Implementation:** All location data hydrated from Google Places is sanitized and strictly stored as native MongoDB GeoJSON (`{"type": "Point", "coordinates": [longitude, latitude]}`). This allows us to leverage high-performance `$geoNear` aggregations.

## 3. Database Interactions

### Atomic Updates
We rely exclusively on targeted modifiers like `$set` and `$push` for document updates (e.g., in `chat.py` and `discovery.py`), which perfectly aligns with the best practice that *"a write operation is atomic on the level of a single document."*

### Semantic Retrieval (Vector Search)
By converting rich venue descriptions into 1024-dimension vectors using Voyage AI and storing them alongside operational data in the `destinations` and `places` collections, the agent can run semantic queries natively using the `$vectorSearch` pipeline stage without moving data into a disjointed standalone vector database.