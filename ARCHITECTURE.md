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
        Agent[Gemini AI Agent Logic]
    end

    subgraph Database [MongoDB]
        DB_Itineraries[(Itineraries Collection)]
        DB_Profiles[(User Profiles Collection)]
    end

    GoogleMaps[Google Maps API]

    %% Connections
    Client --> Dashboard
    Map <-->|External API| GoogleMaps
    
    Context <-->|REST API /itinerary| API_Itinerary
    Context <-->|REST API /profile| API_Profile
    Chat <-->|REST API /chat| API_Chat

    API_Itinerary <--> DB_Itineraries
    API_Profile <--> DB_Profiles
    
    API_Chat <--> Agent
    API_Itinerary <--> Agent
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