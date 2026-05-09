# Test Suite: Risk Tolerance & Buffer Logic

This test suite is designed to verify that the Gemini reasoning engine correctly applies the rules defined in `DATA_MODEL.md` and `SYSTEM_PROMPT.md`.

## Calculation Reference
- **Base Buffer ($B_{base}$):** `(Traffic * M) + 10 minutes` (where $M=1.2$ or $1.5$ for peak).
- **Strict Buffer:** `max($B_{base}$, 20 mins)`.
- **Relaxed Buffer:** `max($B_{base}$ + 15 mins, 40 mins)`.

---

## Scenario 1: The Short Hop (Non-Peak)
**Input:** 
- **Commute:** Hotel to nearby restaurant.
- **Traffic Estimate:** 5 minutes.
- **Local Time:** 12:00 PM.

| User Profile | Expected Reasoning | Expected Buffer |
| :--- | :--- | :--- |
| **Strict** | $B_{base} = (5 \times 1.2) + 10 = 16$. Apply 20m floor. | **20 Minutes** |
| **Relaxed** | $B_{base} = 16$. Add 15m padding (31). Apply 40m floor. | **40 Minutes** |

---

## Scenario 2: Standard City Commute (Non-Peak)
**Input:** 
- **Commute:** Restaurant to Museum.
- **Traffic Estimate:** 25 minutes.
- **Local Time:** 2:30 PM.

| User Profile | Expected Reasoning | Expected Buffer |
| :--- | :--- | :--- |
| **Strict** | $B_{base} = (25 \times 1.2) + 10 = 40$. No extra padding. | **40 Minutes** |
| **Relaxed** | $B_{base} = 40$. Add 15m padding. Floor is 40. | **55 Minutes** |

---

## Scenario 3: Rush Hour Risk
**Input:** 
- **Commute:** Experience to Dinner.
- **Traffic Estimate:** 20 minutes.
- **Local Time:** 5:30 PM (Peak Window).

| User Profile | Expected Reasoning | Expected Buffer |
| :--- | :--- | :--- |
| **Strict** | $B_{base} = (20 \times 1.5) + 10 = 40$. No extra padding. | **40 Minutes** |
| **Relaxed** | $B_{base} = 40$. Add 15m padding. | **55 Minutes** |

---

## Scenario 4: Long Distance Transition
**Input:** 
- **Commute:** Hotel to Airport.
- **Traffic Estimate:** 50 minutes.
- **Local Time:** 10:00 AM.

| User Profile | Expected Reasoning | Expected Buffer |
| :--- | :--- | :--- |
| **Strict** | $B_{base} = (50 \times 1.2) + 10 = 70$. | **70 Minutes** |
| **Relaxed** | $B_{base} = 70$. Add 15m padding. | **85 Minutes** |

---
**Verification Task:** Ensure the `applied_buffer_minutes` in the itinerary JSON matches the values above during integration testing.