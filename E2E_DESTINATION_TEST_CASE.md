# End-to-End Test Case: Destination Selection Data Flow

This document traces the data flow across the My-Travel-Aigent stack when a user selects a destination. It specifically maps the sequence of events to debug the "Infinite Loading / Duplicate Destination" bug, reflecting actual application logs.

## The Scenario
**Trigger:** The user searches for a new city (e.g., `"Richmond, VA, USA"`) using the Map Search Bar or clicks the map, selecting a destination that **does not currently exist** in the MongoDB `destinations` collection.

---

## Phase 1: Frontend Dispatch (The Split)
When the user selects `"Richmond, VA, USA"` in `MapHub.tsx`:

1. **Local State Update:** `setItinerary` updates the React Context immediately.
2. **Database Patch:** A synchronous `PATCH /itinerary/{session_id}` request is sent to save the destination string.
3. **Event Dispatch:** `window.dispatchEvent('travel_aigent_set_destination')` fires.

At this exact millisecond, the application state splits into **Two Parallel Processes**:

### Process A: The MapHub Poller
`MapHub.tsx` immediately fires `fetchDestInfo()` to the FastAPI backend, requesting `GET /destinations/Richmond, VA, USA`.

### Process B: The Agent Chat
`ChatInterface.tsx` catches the event and sends a message to `POST /chat`. The Supervisor routes to the `travel_pioneer`, which calls the `get_cached_lodging` tool with the argument `{'destination_name': 'Richmond, VA, USA'}`.

---

## Phase 2: The Race Condition & The Lock
Both processes hit the backend.

1. **Process A (Poller)** reaches `discover_new_destination` first. It creates a future, adds `"richmond, va, usa"` to `_IN_FLIGHT_DISCOVERY`, and begins the 10-15 second process of querying Google Places and Voyage AI.
2. **Process B (Agent)** reaches `discover_new_destination` shortly after. It checks `_IN_FLIGHT_DISCOVERY`, finds the lock, and safely waits.
   *Log Output:* `"Auto-seeding for 'Richmond, VA, USA' is already in progress. Waiting for it to finish to prevent duplicates..."*

Process A finishes, inserts **Copy 1** into MongoDB, and pops the lock. Process B wakes up and continues. 
**At this point, the deduplication lock successfully prevented a concurrent duplicate!**

---

## Phase 3: The Bug (Why Duplicates Still Happen)
If the lock worked, why are there two copies in the database? There are two primary culprits that bypass in-memory locks:

### Culprit 1: The UI Polling Interval & Regex Mismatch
Because the UI hasn't received lodging data yet, `MapHub.tsx` polls `GET /destinations/...` every 10 seconds.
When the next poll hits the backend, the original lock is gone. The API calls `find_one(_build_destination_query("Richmond, VA, USA"))`.
- The query builds a strict regex looking for a state starting with `^VA`.
- If Google Places saved the state as `"Virginia"` instead of `"VA"`, `find_one` **fails to find the document that was just inserted.**
- The backend assumes the destination still doesn't exist, acquires a *new* lock, and inserts **Copy 2** into MongoDB!

### Culprit 2: Multi-Worker Process Isolation
If your FastAPI backend is running with multiple workers (e.g., `uvicorn --workers 4`), the `_IN_FLIGHT_DISCOVERY` python dictionary is isolated per-process. 
- The Agent hits Worker 1 and acquires the lock.
- The UI Poller hits Worker 2. Worker 2's lock dictionary is empty! 
- Both workers concurrently seed the destination and insert duplicate documents.

---

## Phase 4: The Infinite Load (Data Loss)
With two identical documents in the database:
1. **Agent Updates Copy A:** The Pioneer agent finishes `search_places`, finds 3 hotels, and calls `save_destination_lodging`. It looks up the destination and appends the hotels to the *first* document it finds (**Copy A**).
2. **UI Reads Copy B:** Meanwhile, `MapHub.tsx` continues to poll. Due to how MongoDB resolves the regex query, the API retrieves the *other* document (**Copy B**), which has an empty `suggested_lodging` array.
3. The UI loader spins indefinitely, waiting for data that was successfully saved to the phantom twin.

---

## The Fix
To fix this permanently, we must relax the regex query so it reliably finds newly inserted documents, and rely on MongoDB to enforce uniqueness.

1. **Relax `_build_destination_query`:** Modify `discovery.py` to match strictly on the primary city name rather than fragile state abbreviations.
2. **Database Constraint:** Add a **Unique Compound Index** to the MongoDB `destinations` collection on `{"name": 1, "state": 1, "country": 1}`. This guarantees that even if a multi-worker cache stampede occurs, MongoDB will block the duplicate insertion.