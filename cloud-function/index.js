const { CloudBillingClient } = require('@google-cloud/billing');

const client = new CloudBillingClient();

/**
 * HTTP Cloud Function to manage GCP project billing
 * @param {Object} req Cloud Function request context
 * @param {Object} res Cloud Function response context
 */
exports.manageBilling = async (req, res) => {
  // Enable CORS
  res.set('Access-Control-Allow-Origin', '*');
  
  if (req.method === 'OPTIONS') {
    res.set('Access-Control-Allow-Methods', 'POST');
    res.set('Access-Control-Allow-Headers', 'Content-Type');
    res.status(204).send('');
    return;
  }

  // Verify request method
  if (req.method !== 'POST') {
    res.status(405).json({
      error: 'Method not allowed',
      message: 'Only POST requests are accepted'
    });
    return;
  }

  // Verify content type
  if (req.get('content-type') !== 'application/json') {
    res.status(400).json({
      error: 'Invalid content type',
      message: 'Content-Type must be application/json'
    });
    return;
  }

  try {
    const { projectId, billingAccountId, enable } = req.body;

    // Validate required parameters
    if (!projectId) {
      res.status(400).json({
        error: 'Missing parameter',
        message: 'Project ID is required'
      });
      return;
    }

    if (enable && !billingAccountId) {
      res.status(400).json({
        error: 'Missing parameter',
        message: 'Billing Account ID is required when enabling billing'
      });
      return;
    }

    // Format billing account name
    const billingAccountName = billingAccountId ? `billingAccounts/${billingAccountId}` : '';

    // Update billing info
    await client.updateProjectBillingInfo({
      name: `projects/${projectId}`,
      projectBillingInfo: {
        billingAccountName: enable ? billingAccountName : '',
        billingEnabled: enable
      }
    });

    // Send success response
    res.status(200).json({
      success: true,
      message: `Successfully ${enable ? 'enabled' : 'disabled'} billing for project ${projectId}`,
      projectId,
      billingAccountId: billingAccountId || 'None',
      enable
    });
  } catch (error) {
    console.error('Error:', error);

    // Handle specific error types
    if (error.code === 7) {
      res.status(403).json({
        error: 'Permission denied',
        message: 'The caller does not have required permissions',
        details: error.message
      });
      return;
    }

    if (error.code === 5) {
      res.status(404).json({
        error: 'Not found',
        message: 'The specified project or billing account was not found',
        details: error.message
      });
      return;
    }

    // Generic error response
    res.status(500).json({
      error: 'Internal error',
      message: 'Failed to update billing',
      details: error.message
    });
  }
}; 