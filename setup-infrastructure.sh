#!/bin/bash
# My Travel Aigent - Infrastructure Automation Script

set -e # Exit on error

# 1. Configuration
PROJECT_ID=$(gcloud config get-value project)
if [ -z "$PROJECT_ID" ]; then
    echo "❌ Error: No Google Cloud project ID found. Run 'gcloud config set project [PROJECT_ID]' first."
    exit 1
fi

REGION="us-central1"
PROJECT_NUMBER=$(gcloud projects describe $PROJECT_ID --format='value(projectNumber)')
RUNNER_SA="travel-aigent-runner@${PROJECT_ID}.iam.gserviceaccount.com"
COMPUTE_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"

echo "🚀 Automating Infrastructure for project: $PROJECT_ID (Number: $PROJECT_NUMBER)"

# 2. Enable Services
echo "📌 Enabling Google Cloud APIs..."
gcloud services enable \
    run.googleapis.com \
    artifactregistry.googleapis.com \
    cloudbuild.googleapis.com \
    secretmanager.googleapis.com \
    aiplatform.googleapis.com

# 3. Create Artifact Registry
echo "📌 Creating Artifact Registry..."
gcloud artifacts repositories create travel-aigent \
    --repository-format=docker \
    --location=$REGION \
    --description="Docker repository for My Travel Aigent" || true

# 4. Setup Service Account & IAM
echo "📌 Configuring Service Accounts and IAM Roles..."
if ! gcloud iam service-accounts describe $RUNNER_SA &>/dev/null; then
    gcloud iam service-accounts create travel-aigent-runner --display-name="Travel Aigent Runner"
fi

# Grant roles to the Runner SA (The account that runs the containers)
ROLES=("roles/aiplatform.user" "roles/secretmanager.secretAccessor" "roles/logging.logWriter")
for role in "${ROLES[@]}"; do
    gcloud projects add-iam-policy-binding $PROJECT_ID --member="serviceAccount:$RUNNER_SA" --role="$role"
done

# Grant roles to the Compute SA (The account that builds the containers)
# This fixes the 'storage.objects.get' error you encountered
COMPUTE_ROLES=("roles/storage.admin" "roles/artifactregistry.admin" "roles/logging.logWriter" "roles/run.admin" "roles/iam.serviceAccountTokenCreator")
for role in "${COMPUTE_ROLES[@]}"; do
    gcloud projects add-iam-policy-binding $PROJECT_ID --member="serviceAccount:$COMPUTE_SA" --role="$role"
done

# Allow the Build SA to act as the Runner SA for deployment
gcloud iam service-accounts add-iam-policy-binding $RUNNER_SA \
    --member="serviceAccount:$COMPUTE_SA" \
    --role="roles/iam.serviceAccountUser"

# 5. Enable Public Access (Essential for Browser Access)
echo "📌 Configuring Public Access (Allow Unauthenticated)..."
gcloud run services add-iam-policy-binding travel-aigent-api \
    --member="allUsers" --role="roles/run.invoker" --region=$REGION || true

gcloud run services add-iam-policy-binding travel-aigent-web \
    --member="allUsers" --role="roles/run.invoker" --region=$REGION || true

# 5. Setup Required Secrets (Scenario 5 & Phase 5)
echo "📌 Verifying required secrets..."
REQUIRED_SECRETS=("NEXTAUTH_SECRET" "VOYAGE_API_KEY" "GOOGLE_MAPS_API_KEY" "MONGODB_URI")
for secret in "${REQUIRED_SECRETS[@]}"; do
    if ! gcloud secrets describe "$secret" &>/dev/null; then
        echo "🔑 Creating $secret..."
        gcloud secrets create "$secret" --replication-policy="automatic"
        if [ "$secret" == "NEXTAUTH_SECRET" ]; then
            VALUE=$(openssl rand -base64 32)
        else
            VALUE="REPLACE_ME_IN_CONSOLE"
        fi
        echo -n "$VALUE" | gcloud secrets versions add "$secret" --data-file=-
    fi
done

echo "✅ Infrastructure Automation Complete!"
echo "👉 Now run 'gcloud builds submit' to deploy."
