# My Travel Aigent 🗺️✈️

My Travel Aigent is an intelligent, multi-agent travel planning assistant built natively on Google Cloud. It leverages the **Google Agent Development Kit (ADK)**, **Gemini 2.5 Flash**, **Voyage AI**, and **MongoDB Atlas** to create highly personalized, context-aware travel itineraries.

## Features ✨

*   **Multi-Agent Orchestration**: Specialized agents handle distinct parts of the travel planning lifecycle:
    *   **Supervisor**: Intelligently routes user requests based on state and context.
    *   **Concierge**: Welcomes the user, gathers travel preferences, and proactively suggests local events.
    *   **Architect**: Builds high-fidelity itineraries, schedules events, and handles logistical constraints.
*   **Semantic Hybrid Search**: Combines Voyage AI vector embeddings (`$vectorSearch`) with exact-match text search (BM25) using **Reciprocal Rank Fusion (RRF)** in MongoDB Atlas to find the perfect hotels, restaurants, and activities based on user vibes.
*   **Proactive Discovery**: Background cron jobs automatically discover and cache top-rated Google Places for destinations, pre-computing embeddings to eliminate latency during live agent chats.
*   **Constraint Validation**: The Architect agent dynamically respects user budgets, circadian preferences, and logistical proximity (powered by Google Maps APIs).
*   **Cloud Native CI/CD**: Fully containerized and deployed on Google Cloud Run, orchestrated via Cloud Build, with background jobs triggered by Cloud Scheduler.

## Architecture & Tech Stack 🏗️

*   **Agent Framework**: Google ADK
*   **LLM**: Google Gemini 2.5 Flash (`google-genai`)
*   **Embeddings**: Voyage AI (`voyage-4`)
*   **Database**: MongoDB Atlas (Vector Search, GeoJSON, TTL Indexes)
*   **Backend**: FastAPI, Motor (Async MongoDB Driver)
*   **External APIs**: Google Maps API, Google Places API

## Project Structure 📁

*   `/api`: FastAPI web server and routing (`chat.py`, `itinerary.py`, `destinations.py`, `profile.py`).
*   `/gemini_agent`: Core Google ADK agent logic.
    *   `agent_definition.py`: Defines the Multi-Agent App and routes.
    *   `/tools`: Tools exposed to the agents (Discovery, Itinerary Management, Geo Tools).
    *   `/prompts`: System and Agent-specific markdown prompts.
*   `/docs`: Architecture and data modeling documentation.
*   `/web`: Next.js frontend web application.
*   `server.py`: FastAPI application entry point.
*   `Dockerfile` & `Dockerfile.sync`: Container definitions for the API and the background sync cron job.
*   `cloudbuild.yaml`: CI/CD pipeline definition for Google Cloud Build.

## Documentation 📚

*   MongoDB Data Modeling Patterns

## Setup & Deployment 🚀

### 1. Environment Variables
Ensure the following are set in your `.env` or Google Cloud Secret Manager:
*   `GOOGLE_CLOUD_PROJECT`
*   `VOYAGE_API_KEY`
*   `GOOGLE_MAPS_API_KEY`
*   `MONGODB_URI`

### 2. Database Indexes
Requires MongoDB Atlas with standard collection indexes (including a TTL index on `sessions.updated_at`) and specific Atlas Search indexes (`vector_index` for semantic search and `text_index` for keyword search on the `places` collection).

### 3. Local Development
*   **Interactive Terminal**: Run `python gemini_agent/main.py` for a fast, terminal-based MVP session.
*   **REST API**: Run `uvicorn server:app --reload` to start the FastAPI backend locally.

### 4. Cloud Deployment
Push to your configured repository branch to trigger Google Cloud Build (`cloudbuild.yaml`). This pipeline automatically builds and deploys the FastAPI backend, the Next.js frontend, and the Cloud Run Job for background syncing.