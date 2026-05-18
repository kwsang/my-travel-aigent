# Test Suite: Risk Tolerance & Buffer Logic

This test suite is designed to verify that the Gemini reasoning engine correctly applies the rules defined in `DATA_MODEL.md` and `SYSTEM_PROMPT.md`.

## Calculation Reference
- **Base Buffer ($B_{base}$):** `(Estimated Transit * M) + 10 minutes` (where $M=1.2$ or $1.5$ for peak).
- **Strict Buffer:** `max($B_{base}$, 20 mins)`.
- **Relaxed Buffer:** `max($B_{base}$ + 15 mins, 40 mins)`.

---

## Scenario 1: The Short Hop (Non-Peak)
**Input:** 
- **Commute:** Hotel to nearby restaurant.
- **Transit Estimate:** 5 minutes.
- **Local Time:** 12:00 PM.

| User Profile | Expected Reasoning | Expected Buffer |
| :--- | :--- | :--- |
| **Strict** | $B_{base} = (5 \times 1.2) + 10 = 16$. Apply 20m floor. | **20 Minutes** |
| **Relaxed** | $B_{base} = 16$. Add 15m padding (31). Apply 40m floor. | **40 Minutes** |

---

## Scenario 2: Standard City Commute (Non-Peak)
**Input:** 
- **Commute:** Restaurant to Museum.
- **Transit Estimate:** 25 minutes.
- **Local Time:** 2:30 PM.

| User Profile | Expected Reasoning | Expected Buffer |
| :--- | :--- | :--- |
| **Strict** | $B_{base} = (25 \times 1.2) + 10 = 40$. No extra padding. | **40 Minutes** |
| **Relaxed** | $B_{base} = 40$. Add 15m padding. Floor is 40. | **55 Minutes** |

---

## Scenario 3: Rush Hour Risk
**Input:** 
- **Commute:** Experience to Dinner.
- **Transit Estimate:** 20 minutes.
- **Local Time:** 5:30 PM (Peak Window).

| User Profile | Expected Reasoning | Expected Buffer |
| :--- | :--- | :--- |
| **Strict** | $B_{base} = (20 \times 1.5) + 10 = 40$. No extra padding. | **40 Minutes** |
| **Relaxed** | $B_{base} = 40$. Add 15m padding. | **55 Minutes** |

---

## Scenario 4: Long Distance Transition
**Input:** 
- **Commute:** Hotel to Airport.
- **Transit Estimate:** 50 minutes.
- **Local Time:** 10:00 AM.

| User Profile | Expected Reasoning | Expected Buffer |
| :--- | :--- | :--- |
| **Strict** | $B_{base} = (50 \times 1.2) + 10 = 70$. | **70 Minutes** |
| **Relaxed** | $B_{base} = 70$. Add 15m padding. | **85 Minutes** |

---
**Verification Task:** Ensure the `applied_buffer_minutes` in the itinerary JSON matches the values above during integration testing.

## Scenario 5: Multi-Location Relaxed Night Owl (Bachelor Party)
**Input:** 
- **User Profile:** Relaxed, Night Owl.
- **Party Size:** 12 Adults.
- **Budget:** 15,000 USD.
- **Locations:** Positano (City A) and Amalfi (City B).
- **Activities (10 requested):** 
  - Positano: Brunch, Private Boat Tour (from Positano), Beach Club, Gourmet Dinner, Nightclub.
  - Amalfi: Group Lunch, Cathedral Visit, Paper Museum, Seafood Dinner, Bar Crawl.

| Target Logic | Expected Reasoning & Output |
| :--- | :--- |
| **Temporal Consistency** | **Night Owl:** Start times must be $\ge$ 10:00 AM. Dinner must be scheduled between 20:00 and 23:00 local time. |
| **Location Clustering** | **Relaxed Pace:** The agent MUST split these 10 activities into at least two days. Day 1 should cluster all Positano activities; Day 2 should cluster all Amalfi activities. |
| **The "Retreat" Rule** | **Hotel Re-centering:** A mandatory 2+ hour block must be inserted between afternoon experiences and dinner (e.g., 17:00 - 19:30) for rest. |
| **Scale & Capacity** | **12 Adults:** All prices must be scaled (12x). The agent must verify if venues (e.g., "Private Boat Tour") can accommodate a group of 12. |

**Expected Itinerary Structure:**
1. **Day 1 (Positano Hub):**
   - 11:00 AM: Brunch -> 01:30 PM: Boat Tour -> 04:00 PM: Beach Club -> **Retreat to Hotel** -> 08:30 PM: Dinner -> 11:00 PM: Nightclub.
2. **Day 2 (Amalfi Hub):**
   - 12:00 PM: Group Lunch -> 02:30 PM: Cathedral -> 04:00 PM: Museum -> **Retreat to Hotel** -> 09:00 PM: Dinner -> 11:30 PM: Bar Crawl.

---
**Verification Task:** Ensure the `applied_buffer_minutes` in the itinerary JSON matches the values above during integration testing.
