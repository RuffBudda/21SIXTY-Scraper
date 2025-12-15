#!/bin/bash

# Script to create DigitalOcean droplet via doctl CLI
# Requires: doctl installed and authenticated
# Install: https://docs.digitalocean.com/reference/doctl/how-to/install/

set -e

DROPLET_NAME="2160 tools"
REGION="sgp1"
SIZE="s-1vcpu-1gb"
IMAGE="ubuntu-22-04-x64"
PROJECT_NAME="2160"

echo "Creating DigitalOcean droplet: $DROPLET_NAME"
echo "Region: $REGION"
echo "Size: $SIZE"

# Check if doctl is installed
if ! command -v doctl &> /dev/null; then
    echo "Error: doctl is not installed"
    echo "Install from: https://docs.digitalocean.com/reference/doctl/how-to/install/"
    exit 1
fi

# Create droplet
DROPLET_ID=$(doctl compute droplet create "$DROPLET_NAME" \
    --region $REGION \
    --size $SIZE \
    --image $IMAGE \
    --wait \
    --format ID \
    --no-header)

if [ -z "$DROPLET_ID" ]; then
    echo "Error: Failed to create droplet"
    exit 1
fi

echo "Droplet created successfully!"
echo "Droplet ID: $DROPLET_ID"

# Get droplet IP
DROPLET_IP=$(doctl compute droplet get $DROPLET_ID --format PublicIPv4 --no-header)
echo "Droplet IP: $DROPLET_IP"

# Get project ID (if project exists)
PROJECT_ID=$(doctl projects list --format ID,Name --no-header | grep "$PROJECT_NAME" | awk '{print $1}' | head -n1)

if [ ! -z "$PROJECT_ID" ]; then
    echo "Assigning droplet to project: $PROJECT_NAME"
    doctl projects resources assign $PROJECT_ID --resource "do:droplet:$DROPLET_ID"
    echo "Droplet assigned to project"
else
    echo "Warning: Project '$PROJECT_NAME' not found. Create it manually or skip project assignment."
fi

echo ""
echo "=========================================="
echo "Droplet created successfully!"
echo "=========================================="
echo "Name: $DROPLET_NAME"
echo "ID: $DROPLET_ID"
echo "IP: $DROPLET_IP"
echo ""
echo "Next steps:"
echo "1. Add DNS A record: scrape.2160.media -> $DROPLET_IP"
echo "2. SSH into droplet: ssh root@$DROPLET_IP"
echo "3. Run server setup: ./scripts/server-setup.sh"
echo "4. Deploy application files"

