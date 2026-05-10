# Phase 5: Visual Planning Dashboard

## Overview
Phase 5 transforms "My Travel Aigent" into a high-fidelity web application. It moves the user from a conversational interface to a visual dashboard where they can manage multiple trip ideas, modify drafts in real-time, and visualize the logistical rules (buffers, clustering, and budget) built in previous phases.

## 1. Technical Stack & Architecture
- **Framework:** Next.js (App Router) for high-performance itinerary rendering.
- **Styling:** Tailwind CSS for a responsive, mobile-first design.
- **Maps:** Google Maps JavaScript API (`@googlemaps/react-wrapper`) for route visualization.
- **UI Components:** Shadcn/UI for timelines, budget progress bars, and interactive toggles.

## 1.1 Implementation Sequence
1. **Scaffolding:** Initialize the Next.js project and configure the theme (Tailwind + Shadcn).
2. **Data Fetching Layer:** Create API routes to proxy requests between the UI and your MongoDB/Agent Builder tools.
3. **The Timeline Builder:** Map the `itinerary.events` array to a chronological vertical list.
4. **Map Orchestration:** Synchronize the Map markers with the Timeline selection.
5. **Validation Hook:** Integrate the logic from `validate_buffers.py` into a client-side validator to show real-time "Conflict" warnings.
6. **Budget Engine:** Implement the "Per-Person" vs "Total" switch logic in the UI state.

## 2. Core Dashboard Components

### A. The Interactive Timeline
- **Visualization:** Render itinerary events as vertical cards or a Gantt-style timeline.
- **Conflict Highlighting:** Use a visual indicator (red border/shading) if `validate_buffers.py` logic detects an overlap or a missing "Retreat Rule" block.
- **Direct Manipulation:** Support drag-and-drop to reorder events, which triggers the "Architect" logic to recalculate transit buffers.

### B. Geospatial Route View
- **Integration:** Plot the `geo` coordinates of every segment on a live map.
- **Clustering Feedback:** Visually group markers by "Travel Zone" to show the user how the "Relaxed" clustering rule is being applied.
- **Discovery:** Allow users to click "Find Nearby" on the map to trigger the `search_activities` vector search tool for alternatives.

### C. Budget & Preference Control Center
- **Price View Switch:** A global toggle for `group_planning_per_person`. When switched, every price on the dashboard updates (e.g., $1,200 Total -> $600 Per-Person).
- **Budget Meter:** A radial or linear gauge showing current cost vs. limit. It must turn yellow at 90% and red if the limit is exceeded.
- **Risk/Density Sliders:** Allow users to adjust `activity_density` (Low/Med/High) and `risk_tolerance` (Relaxed/Strict) with immediate timeline updates.

## 3. Integration & Persistence
- **API Layer:** Use the official `@google-cloud/adk` client or Vertex AI SDKs in your Next.js API routes to communicate with the session orchestrated by the **ADK Visual Builder**.
- **Session Management:** Maintain `sessionId` in the browser to ensure Gemini remembers the Elicitation context during the visual planning phase.
- **Mission Save:** A "Commit to Atlas" button that invokes the `save_itinerary` tool once the user is satisfied with the visual draft.
- **Version Control:** Allow users to "Clone" a trip to create a new "Draft" variant for comparison.

## 4. Success Criteria
- [ ] User can toggle between "Per-Person" and "Total" pricing with zero latency in UI update.
- [ ] Itinerary overlaps are visually distinct and provide tooltips explaining the buffer violation.
- [ ] Map routes dynamically redraw when an event's location is swapped.
- [ ] Final visual itineraries pass all `validate_buffers.py` and `validate_itinerary_budget` checks before saving.

---
**Navigation:**
- Main Roadmap
- Phase 4: Mission Logic