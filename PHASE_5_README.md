# Phase 5: Visual Planning Dashboard

## Overview
Phase 5 transitions the user experience from a chat-centric interface to a high-fidelity visual workspace. The dashboard allows users to see their itinerary as a living document, providing map-based visualization and timeline-based direct manipulation.

## 1. Visual Components
- **The Timeline (Gantt View)**:
    - Render itinerary segments chronologically.
    - Visually highlight **Overlap Warnings** (from `validate_buffers.py`).
    - Drag-and-drop to adjust start times (triggering re-validation on the backend).
- **The Map Hub**:
    - Display markers for all venues.
    - Draw polyline routes between segments.
    - Visualize "Proximity Clusters" for Relaxed trips.
- **Budget Control Panel**:
    - Toggle between "Total" and "Per-Person" views.
    - Highlighting segments marked as "Budget Alternatives."

## 2. API Contract (FastAPI Bridge)
The `server.py` must support the following for the Next.js client:
- `POST /chat`: Multi-turn conversation with state-syncing.
- `GET /itinerary/{session_id}`: Fetch the structured JSON for the timeline/map.
- `PATCH /itinerary/{session_id}/event/{event_id}`: Direct manipulation update (e.g., changing a time).

## 3. Success Criteria
- [ ] User can view a 3-day itinerary on a map without scrolling through chat history.
- [ ] Changing an event time in the UI triggers an automatic buffer check and displays an error if a conflict occurs.
- [ ] The "Retreat Rule" is visually represented as a distinct block on the timeline.

## Next Action
Initialize the Next.js project and implement the `GET /itinerary` endpoint in `server.py`.