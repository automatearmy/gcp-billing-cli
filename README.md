# GCP Billing CLI

A command-line tool to manage Google Cloud Platform (GCP) project billing.

## Prerequisites

1. Node.js (v14 or higher)
2. GCP account with appropriate permissions
3. Google Cloud SDK installed and configured
4. Authentication set up (run `gcloud auth application-default login`)
5. Required GCP APIs enabled in your project:
   - Cloud Billing API
   - Cloud Resource Manager API

## Setup

1. Enable required GCP APIs:
```bash
# Enable Cloud Billing API
gcloud services enable cloudbilling.googleapis.com

# Enable Cloud Resource Manager API
gcloud services enable cloudresourcemanager.googleapis.com
```

2. Authenticate with GCP:
```bash
gcloud auth application-default login
```

## Installation

1. Clone this repository
2. Install dependencies:
```bash
npm install
```
3. Build the project:
```bash
npm run build
```
4. Link the CLI tool globally:
```bash
npm link
```

## Usage

### List all projects and their billing status
```bash
# List all projects
gcp-billing list

# Exclude projects starting with a prefix
gcp-billing list -e ig-
# or
gcp-billing list --exclude ig-

# Show only projects starting with a prefix
gcp-billing list -f prod-
# or
gcp-billing list --filter prod-
```

### Enable billing for a project
```bash
gcp-billing enable <projectId>
```

### Disable billing for a project
```bash
gcp-billing disable <projectId>
```

## Options

### List Command Options
- `-e, --exclude <prefix>` - Exclude projects that start with the specified prefix
- `-f, --filter <prefix>` - Show only projects that start with the specified prefix
- `-h, --help` - Display help information

## Development

To run the CLI in development mode:
```bash
npm run dev
```

## Troubleshooting

### API Not Enabled
If you see an error about APIs not being enabled, make sure to run the setup commands in the Setup section above. After enabling the APIs, wait a few minutes for the changes to propagate before trying again.

### Authentication Issues
If you encounter authentication errors, run:
```bash
gcloud auth application-default login
``` 