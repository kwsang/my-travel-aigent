# 🌎 My Travel AIgent

Next-Gen Travel Planning powered by the Google Agent Development Kit (ADK) and Gemini 2.5 Flash.

## ✨ Features

- **Multi-Agent Orchestration:** A Travel Supervisor intelligently routes your natural language requests to specialized sub-agents (Architect, Pioneer, and Activity Planner) based on conversation context.
- **Interactive Visual Workspace:** A dynamic Next.js dashboard featuring a drag-and-drop chronological timeline and an integrated Google Map that dynamically plots out your journey.
- **Smart Logistics:** Leverages the Google Maps Routes and Distance Matrix APIs to automatically calculate driving times, plot flight paths, and prevent physically impossible schedules (e.g., dining in a city you haven't arrived in yet).
- **Budget & Conflict Engine:** Validates the itinerary structure in real-time, tracking per-person or group budgets, flagging temporal overlaps, and adjusting for circadian rhythms.
- **Autonomous Discovery & Caching:** Background processes autonomously search for and cache top-rated accommodations and activities using Voyage AI semantic search embeddings to reduce API latency.

## 🏗 Architecture

* **Frontend:** Next.js (React), Tailwind CSS, `@vis.gl/react-google-maps`
* **Backend:** FastAPI (Python), Motor (Async MongoDB), Google Maps API, Google Places API
* **AI Framework:** Google GenAI SDK, Google ADK (Agent Development Kit)
* **Database:** MongoDB Atlas (with Vector Search)

## 🤖 The Agents

1. **Travel Supervisor:** Evaluates the state of the conversation and dynamically invokes transfer tools to route the user to the correct specialist.
2. **Concierge:** Focuses on user profiling and data gathering to establish budgets and risk tolerances.
3. **Travel Pioneer:** Specializes in geographic anchoring, calculating transportation routes, and locking down accommodations and flights.
4. **Activity Planner:** Fills the itinerary with incredible experiences and dining that match the user's vibe, adhering strictly to operating hours.
5. **Architect:** Coordinates the overall itinerary, finalizing details and saving the drafts to the database.

## 🚀 Setup & Installation

### 1. Environment Variables
Create a `.env` file in the root directory with the following keys:
```env
GOOGLE_CLOUD_PROJECT=your-google-project-id
GOOGLE_MAPS_API_KEY=your-maps-api-key
VOYAGE_API_KEY=your-voyage-api-key
MONGODB_URI=your-mongodb-atlas-connection-string
```

### 2. Backend (FastAPI)
Make sure you have Python 3.10+ installed.
```bash
# Install dependencies
pip install -r requirements.txt

# Start the FastAPI server
uvicorn server:app --reload --port 8000
```

### 3. Frontend (Next.js)
Open a new terminal window in the `/web` directory.
```bash
cd web
npm install
npm run dev
```

Visit `http://localhost:3000` in your browser to start planning!