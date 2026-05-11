# My Travel Aigent: Getting Started

This project is a multi-agent travel assistant powered by the Google Cloud ADK and Gemini. It features a FastAPI backend and a Next.js visual dashboard.

---

## 1. Running Locally (Development)

The local environment uses docker-compose to orchestrate the API, the Web Dashboard, and connectivity to your MongoDB Atlas cluster.

### Prerequisites
- **Google Cloud SDK**: Installed and initialized (`gcloud auth login`).
- **Application Default Credentials (ADC)**: Required for the agent to use Vertex AI locally:
```bash
gcloud auth application-default login
```
- **Environment Variables**: Create a `.env` file in the root directory:
```env
MONGODB_URI=your_mongodb_atlas_connection_string
GOOGLE_MAPS_API_KEY=your_google_maps_key
VOYAGE_API_KEY=your_voyage_ai_key
GOOGLE_CLOUD_PROJECT=your_project_id
GOOGLE_CLOUD_LOCATION=us-central1
```

### Launching the Stack

From the project root, run:
```bash
docker-compose up --build
```
- **Web Dashboard**: http://localhost:3000
- **API Documentation (Swagger)**: http://localhost:8000/docs
- **Mission Simulation**: To test agent logic without the UI, run `python simulate_mission.py`.

---

## 2. Deploying to Google Cloud Run (Production)

Deployment is fully automated via Cloud Build and utilizes a "Linking" strategy to handle circular dependencies between the Frontend and Backend URLs.

### Step 1: Initialize Infrastructure

Run the automation script to set up IAM roles, the Artifact Registry, and placeholder secrets in Secret Manager:
```bash
# Fix line endings if on Windows
sed -i 's/\r$//' setup-infrastructure.sh
# Execute setup
bash setup-infrastructure.sh
```

### Step 2: Configure Production Secrets

Navigate to the Google Cloud Console > Secret Manager and update the following secrets with your production keys:
- `MONGODB_URI`
- `GOOGLE_MAPS_API_KEY`
- `VOYAGE_API_KEY`

### Step 3: Trigger the Build & Deploy

Execute the unified build pipeline. This script dynamically discovers the service URLs, bakes the API_URL into the Next.js bundle, and configures the Backend CORS automatically:
```bash
gcloud builds submit --config cloudbuild.yaml
```

### Step 4: Validation

Once complete, verify the production health:
- **Check the API Health**: `https://travel-aigent-api-[hash].a.run.app/health`
- **Launch the Dashboard**: `https://travel-aigent-web-[hash].a.run.app`