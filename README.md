# GCP Billing CLI

A command-line tool to manage Google Cloud Platform (GCP) project billing with advanced scheduling capabilities. This tool allows you to:

- List and manage project billing status
- Enable/disable billing for projects
- Schedule billing operations using:
  - Simple daily time-based scheduling
  - Advanced cron-based scheduling for complex patterns
  - Timezone-aware scheduling
  - Flexible scheduling patterns (e.g., weekdays only, specific days of the month)

## Prerequisites

1. Node.js (v14 or higher)
2. GCP account with appropriate permissions
3. Google Cloud SDK installed and a project selected
4. Authentication set up (run `gcloud auth application-default login`)
5. Required GCP APIs enabled in your project:
   - Cloud Billing API
   - Cloud Resource Manager API
   - Cloud Functions API
   - Cloud Build API
   - Cloud Scheduler API
   - Artifact Registry API

## Setup

### 1. Enable Required APIs
```bash
# Enable all necessary APIs
gcloud services enable \
  cloudfunctions.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  cloudscheduler.googleapis.com \
  cloudbilling.googleapis.com \
  cloudresourcemanager.googleapis.com
```

### 2. Deploy the Cloud Function

```bash
# Navigate to the cloud function directory
cd cloud-function

# Create a service account for the Cloud Function
gcloud iam service-accounts create billing-function-sa \
  --display-name="Billing Function Service Account"

# Get your project ID
PROJECT_ID=$(gcloud config get-value project)

# Get the service account email
SA_EMAIL="billing-function-sa@${PROJECT_ID}.iam.gserviceaccount.com"

# Grant necessary permissions
# Note: You need org-level access for some of these commands
# For org-level permissions (if you have access):
gcloud organizations add-iam-policy-binding $(gcloud organizations list --format='value(ID)') \
  --member="serviceAccount:${SA_EMAIL}" \
  --role="roles/billing.admin"

# For project-level permissions:
# gcloud projects add-iam-policy-binding ${PROJECT_ID} \
#   --member="serviceAccount:${SA_EMAIL}" \
#   --role="roles/billing.admin"

# For billing account permissions:
gcloud beta billing accounts add-iam-policy-binding YOUR_BILLING_ACCOUNT_ID \
  --member="serviceAccount:${SA_EMAIL}" \
  --role="roles/billing.user"

# Deploy the Cloud Function (anser y to any prompt for enabling APIs)
gcloud functions deploy billing-manager \
  --runtime nodejs18 \
  --trigger-http \
  --allow-unauthenticated \
  --entry-point manageBilling \
  --region us-central1 \
  --memory 256MB \
  --timeout 60s \
  --min-instances 0 \
  --max-instances 1 \
  --service-account="${SA_EMAIL}"

# Get the Cloud Function URL and set it as an environment variable
export BILLING_FUNCTION_URL=$(gcloud functions describe billing-manager --region us-central1 --format='value(url)')
```

### 3. Install CLI Dependencies
```bash
# In the main project directory
npm install
```

### 4. Build the CLI
```bash
npm run build
```

### 5. Link the CLI globally
```bash
npm link
```

### 6. Add executable permissions
You may need to add executable permissions to the build before using:
```bash
chmod +x dist/index.js
``` 

## Usage

### List all projects and their billing status
```bash
# List all projects
gcp-billing list

# Exclude projects starting with a prefix
gcp-billing list -e prod-
# or
gcp-billing list --exclude prod-

# Show only projects starting with a prefix
gcp-billing list -f prod-
# or
gcp-billing list --filter prod-
```

### Enable billing for a project
```bash
gcp-billing enable <projectId> <billingAccountId>
```

### Disable billing for a project
```bash
gcp-billing disable <projectId>
```

### Schedule billing operations
```bash
# Schedule billing to be enabled
gcp-billing schedule-enable my-project-id billing-account-id --time 09:00 --timezone America/Los_Angeles

# Schedule billing to be disabled
gcp-billing schedule-disable my-project-id --time 18:00 --timezone America/New_York
```

## Options

### List Command Options
- `-e, --exclude <prefix>` - Exclude projects that start with the specified prefix
- `-f, --filter <prefix>` - Show only projects that start with the specified prefix
- `-h, --help` - Display help information

### Schedule Command Options
- `--time <HH:MM>` - Time in 24-hour format (e.g., "09:00" for 9 AM)
- `--cron <expression>` - Cron expression for more flexible scheduling
- `--timezone <timezone>` - Timezone (default: UTC)

#### Cron Expression Format
The cron expression consists of 5 fields separated by spaces:
```
* * * * *
│ │ │ │ │
│ │ │ │ └─ Day of week (0-6) (Sunday=0)
│ │ │ └─── Month (1-12)
│ │ └───── Day of month (1-31)
│ └─────── Hour (0-23)
└───────── Minute (0-59)
```

Examples:
- `"0 9 * * 1"` - Every Monday at 9 AM
- `"0 18 * * 1-5"` - Every weekday at 6 PM
- `"0 0 1 * *"` - First day of every month at midnight
- `"0 8-18 * * *"` - Every hour from 8 AM to 6 PM
- `"0/30 9-17 * * 1-5"` - Every 30 minutes during business hours (9 AM - 5 PM) on weekdays

Example commands:
```bash
# Schedule billing enablement every Monday at 9 AM Pacific time
gcp-billing schedule-enable my-project-id 0X0X0X-0X0X0X-0X0X0X --cron "0 9 * * 1" --timezone America/Los_Angeles

# Schedule billing disablement every weekday at 6 PM Eastern time
gcp-billing schedule-disable my-project-id --cron "0 18 * * 1-5" --timezone America/New_York

# Simple daily schedule at specific time
gcp-billing schedule-enable my-project-id 0X0X0X-0X0X0X-0X0X0X --time 09:00
gcp-billing schedule-disable my-project-id --time 18:00
```

Common timezones:
- `UTC` (default)
- `America/New_York`
- `America/Los_Angeles`
- `America/Chicago`
- `Europe/London`
- `Asia/Tokyo`

## Troubleshooting

### API Not Enabled
If you see an error about APIs not being enabled, make sure to run the setup commands in the Setup section above. After enabling the APIs, wait a few minutes for the changes to propagate before trying again.

### Authentication Issues
If you encounter authentication errors, run:
```bash
gcloud auth application-default login
```

### Permission Issues
If you encounter permission denied errors:
1. Verify that all required APIs are enabled
2. Ensure your account or service account has the following roles:
   - Billing Account Administrator (roles/billing.admin)
   - Billing Account User (roles/billing.user)
3. For organization-level operations, you need org-level access
4. For project-level operations, you need project-level access

### Cloud Function Issues
If the Cloud Function deployment fails:
1. Verify all required APIs are enabled
2. Check if the service account has necessary permissions
3. Wait a few minutes after enabling APIs before deploying
4. Check the Cloud Build logs for detailed error messages

To test the Cloud Function directly:
```bash
curl -X POST "${BILLING_FUNCTION_URL}" \
  -H "Content-Type: application/json" \
  -d '{"projectId":"your-project-id","billingAccountId":"your-billing-account","enable":true}'
``` 