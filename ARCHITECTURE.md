# Architecture Overview

This document outlines the high-level architecture of the **My Travel AIgent** application. It details the interactions between the client-side Next.js frontend, the FastAPI Python backend, the Gemini AI Agent, and the MongoDB database.

## High-Level Architecture Diagram

```mermaid
graph TD
    Client[Web Browser / Traveler]

    subgraph Frontend [Next.js React Frontend]
        Dashboard[Dashboard Page]
        Context[Itinerary Context & State]
        Map[MapHub / Google Maps]
        Timeline[Timeline View]
        Budget[Budget Panel]
        Chat[Chat Interface]
        Profile[Profile Modal]
        
        Dashboard --> Context
        Map --> Context
        Timeline --> Context
        Budget --> Context
        Chat --> Context
        Profile --> Context
    end

    subgraph Backend [FastAPI Backend]
        API_Itinerary[Itinerary Router]
        API_Profile[Profile Router]
        API_Chat[Chat Router]
        API_Destinations[Destinations/SSE Router]
        Agent[Google ADK Multi-Agent System]
    end

    subgraph Database [MongoDB]
        DB_Itineraries[(Itineraries Collection)]
        DB_Profiles[(User Profiles Collection)]
        DB_Destinations[(Destinations / Vector Search)]
    end

    GoogleMaps[Google Maps API]
    VoyageAI[Voyage AI Embeddings]
    CloudScheduler[Cloud Scheduler / Cron]

    %% Connections
    Client --> Dashboard
    Map <-->|External API| GoogleMaps
    Map <-->|Server-Sent Events| API_Destinations
    
    Context <-->|REST API /itinerary| API_Itinerary
    Context <-->|REST API /profile| API_Profile
    Chat <-->|REST API /chat| API_Chat

    API_Itinerary <--> DB_Itineraries
    API_Profile <--> DB_Profiles
    API_Destinations <--> DB_Destinations
    
    API_Chat <--> Agent
    API_Itinerary <--> Agent
    Agent <--> VoyageAI
    CloudScheduler -->|Triggers Background Sync| DB_Destinations
```

## Core Components

### 1. Frontend (Next.js / React)
* **ItineraryContext:** Acts as the single source of truth for the application's state, managing the active itinerary, traveler profile, and global view mode (Total vs. Per Person).
* **Visual Planning Dashboard:** Provides a drag-and-drop chronological timeline (`TimelineView`), dynamic budgeting constraints (`BudgetPanel`), and a geographic workspace (`MapHub`).
* **Chat Interface:** Connects directly to the Gemini Agent to iteratively build and refine the travel plans via natural language.

### 2. Backend (FastAPI / Python)
* **Routers:** Modular endpoints mapping to Profiles (`/profile`), Itineraries (`/itinerary`), and Chat (`/chat`).
* **Pydantic Models:** Validates incoming payloads strictly against schemas like `TravelerProfile`, `Event`, and `Itinerary`.

### 3. AI Agent (Gemini)
* Resolves user intents, performs logic routing, handles schedule constraints, calculates transit buffers, and returns strictly typed JSON data back to the application.

### 4. Database (MongoDB)
* Stores documents utilizing `Motor` (Async MongoDB driver). Ensures that users can retrieve and sync asynchronous trip data or their global constraints independently.

## Real-Time State Flow (Server-Sent Events)

To provide a seamless, non-blocking user experience, the application uses **Server-Sent Events (SSE)** to sync the backend AI's asynchronous discovery process with the frontend state.

1. **Trigger:** The user selects a destination on the map. The frontend optimistically updates the `ItineraryContext` and opens a persistent SSE connection via `GET /destinations/{name}/stream`.
2. **Background Processing:** The AI Agents (or background cron jobs) asynchronously query Google Places and Voyage AI to discover localized lodgings and activities, saving the newly discovered results to the MongoDB `destinations` collection.
3. **Push Updates:** The FastAPI backend monitors the database document for that destination. The moment it detects a change, it streams the updated JSON payload down the open SSE connection.
4. **State Reconciliation:** The `MapHub` component receives the event, parses the new suggestions, and instantly populates the map markers and suggestion windows without requiring the user to refresh or the frontend to aggressively poll the API.