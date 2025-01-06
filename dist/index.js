#!/usr/bin/env node --no-deprecation
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const commander_1 = require("commander");
const resource_manager_1 = require("@google-cloud/resource-manager");
const billing_1 = require("@google-cloud/billing");
const chalk_1 = __importDefault(require("chalk"));
const ora_1 = __importDefault(require("ora"));
const program = new commander_1.Command();
const projectsClient = new resource_manager_1.ProjectsClient();
const billingClient = new billing_1.CloudBillingClient();
// Emoji constants to avoid quotes in table
const CHECKMARK = '✅';
const CROSS = '❌';
// Helper function to create raw string objects for table display
function createRawObject(obj) {
    const raw = {};
    Object.entries(obj).forEach(([key, value]) => {
        Object.defineProperty(raw, key, {
            value: value,
            enumerable: true
        });
    });
    return raw;
}
function handleApiError(error, spinner) {
    if (spinner) {
        spinner.fail('Operation failed');
    }
    if (error.code === 7 && error.reason === 'SERVICE_DISABLED') {
        console.error(chalk_1.default.red('\nError: Required GCP APIs are not enabled.'));
        console.log(chalk_1.default.yellow('\nPlease enable the following APIs in your GCP project:'));
        console.log(chalk_1.default.yellow('1. Cloud Billing API: https://console.cloud.google.com/apis/library/cloudbilling.googleapis.com'));
        console.log(chalk_1.default.yellow('2. Cloud Resource Manager API: https://console.cloud.google.com/apis/library/cloudresourcemanager.googleapis.com'));
        console.log(chalk_1.default.yellow('\nAfter enabling the APIs, wait a few minutes for the changes to propagate before trying again.'));
        console.log(chalk_1.default.blue('\nYou can also enable these APIs using the following gcloud commands:'));
        console.log('gcloud services enable cloudbilling.googleapis.com');
        console.log('gcloud services enable cloudresourcemanager.googleapis.com\n');
        return;
    }
    if (error.code === 7 && error.reason === 'PERMISSION_DENIED') {
        console.error(chalk_1.default.red('\nError: You don\'t have the required permissions to perform this action.'));
        console.log(chalk_1.default.yellow('\nRequired permissions:'));
        console.log(chalk_1.default.yellow('1. billing.accounts.list - to view billing accounts'));
        console.log(chalk_1.default.yellow('2. billing.projectBillingInfo.update - to update project billing'));
        console.log(chalk_1.default.yellow('3. resourcemanager.projects.list - to list projects'));
        console.log(chalk_1.default.yellow('\nYou need one of these roles:'));
        console.log(chalk_1.default.yellow('- Billing Account Administrator (roles/billing.admin)'));
        console.log(chalk_1.default.yellow('- Billing Account User (roles/billing.user) - for linking projects only'));
        console.log(chalk_1.default.blue('\nTo grant these roles, ask your organization admin to:'));
        console.log('1. Go to: https://console.cloud.google.com/billing');
        console.log('2. Select your billing account');
        console.log('3. Go to "Account Management" > "Permissions"');
        console.log('4. Click "Add Principal" and grant the appropriate role\n');
        return;
    }
    if (error.code === 16) {
        console.error(chalk_1.default.red('\nError: Authentication failed. Please make sure you are properly authenticated.'));
        console.log(chalk_1.default.yellow('\nRun the following command to authenticate:'));
        console.log('gcloud auth application-default login\n');
        return;
    }
    console.error(chalk_1.default.red('Error:'), error.message || error);
}
async function listBillingAccounts() {
    const spinner = (0, ora_1.default)('Fetching billing accounts...').start();
    try {
        const [billingAccounts] = await billingClient.listBillingAccounts();
        if (!billingAccounts || billingAccounts.length === 0) {
            spinner.warn('No billing accounts found. Make sure you have the necessary permissions.');
            return;
        }
        const accountInfos = billingAccounts.map(account => createRawObject({
            'Account ID': account.name?.split('/').pop() || 'N/A',
            'Display Name': account.displayName || 'N/A',
            'Open': account.open ? CHECKMARK : CROSS
        }));
        spinner.succeed('Successfully fetched billing accounts');
        console.log('\nAvailable Billing Accounts:');
        console.table(accountInfos);
        console.log(`Total Accounts: ${accountInfos.length}\n`);
    }
    catch (error) {
        handleApiError(error, spinner);
    }
}
async function listProjects(options) {
    const spinner = (0, ora_1.default)('Fetching projects...').start();
    try {
        const projects = await projectsClient.searchProjects();
        const [projectsList] = await projects;
        if (!projectsList || projectsList.length === 0) {
            spinner.warn('No projects found. Make sure you have the necessary permissions.');
            return;
        }
        // Apply filters based on options
        let filteredProjects = projectsList;
        // Apply exclude filter if provided
        if (options.exclude) {
            spinner.text = 'Applying exclusion filter...';
            filteredProjects = filteredProjects.filter(project => {
                const projectId = project.projectId;
                return projectId && !projectId.startsWith(options.exclude);
            });
        }
        // Apply include filter if provided
        if (options.filter) {
            spinner.text = 'Applying inclusion filter...';
            filteredProjects = filteredProjects.filter(project => {
                const projectId = project.projectId;
                return projectId && projectId.startsWith(options.filter);
            });
        }
        if (filteredProjects.length === 0) {
            spinner.warn('No projects found after applying filters.');
            return;
        }
        spinner.text = 'Fetching billing information...';
        const projectInfos = [];
        for (const project of filteredProjects) {
            try {
                const [billingInfo] = await billingClient.getProjectBillingInfo({
                    name: `projects/${project.projectId}`
                });
                projectInfos.push(createRawObject({
                    'Project ID': project.projectId || 'N/A',
                    'Name': project.displayName || 'N/A',
                    'Billing Enabled': billingInfo.billingEnabled ? CHECKMARK : CROSS,
                    'Billing Account': billingInfo.billingAccountName?.split('/').pop() || 'None'
                }));
            }
            catch (error) {
                projectInfos.push(createRawObject({
                    'Project ID': project.projectId || 'N/A',
                    'Name': project.displayName || 'N/A',
                    'Billing Enabled': CROSS,
                    'Billing Account': 'Error fetching info'
                }));
            }
        }
        spinner.succeed('Successfully fetched project information');
        console.log('\nGCP Projects and Billing Status:');
        console.table(projectInfos);
        console.log(`Total Projects: ${projectInfos.length}\n`);
    }
    catch (error) {
        handleApiError(error, spinner);
    }
}
async function setBillingStatus(projectId, billingAccountId, enable) {
    const spinner = (0, ora_1.default)(`${enable ? 'Enabling' : 'Disabling'} billing for project ${projectId}...`).start();
    try {
        const billingAccountName = billingAccountId ? `billingAccounts/${billingAccountId}` : '';
        await billingClient.updateProjectBillingInfo({
            name: `projects/${projectId}`,
            projectBillingInfo: {
                billingAccountName: enable ? billingAccountName : '',
                billingEnabled: enable
            }
        });
        spinner.succeed(`Successfully ${enable ? 'enabled' : 'disabled'} billing for project ${projectId}`);
        if (enable) {
            console.log(chalk_1.default.green(`Billing account ${billingAccountId} has been linked to the project`));
        }
    }
    catch (error) {
        handleApiError(error, spinner);
    }
}
program
    .name('gcp-billing')
    .description('CLI tool to manage GCP project billing')
    .version('1.0.0');
program
    .command('list')
    .description('List all GCP projects and their billing status')
    .option('-e, --exclude <prefix>', 'Exclude projects that start with this prefix')
    .option('-f, --filter <prefix>', 'Show only projects that start with this prefix')
    .addHelpText('after', `
Examples:
  $ gcp-billing list                    List all projects
  $ gcp-billing list -e ig-             Exclude projects starting with 'ig-'
  $ gcp-billing list -f prod-           Show only projects starting with 'prod-'
  $ gcp-billing list -e test- -f prod-  Show projects starting with 'prod-' but not 'test-'`)
    .action(listProjects);
program
    .command('accounts')
    .description('List available billing accounts')
    .action(listBillingAccounts);
program
    .command('enable')
    .description('Enable billing for a GCP project')
    .argument('<projectId>', 'The project ID to enable billing for')
    .argument('<billingAccountId>', 'The billing account ID to link to the project')
    .addHelpText('after', `
Example:
  $ gcp-billing enable my-project-id 0X0X0X-0X0X0X-0X0X0X
  
Tip: Use 'gcp-billing accounts' to list available billing accounts`)
    .action((projectId, billingAccountId) => setBillingStatus(projectId, billingAccountId, true));
program
    .command('disable')
    .description('Disable billing for a GCP project')
    .argument('<projectId>', 'The project ID to disable billing for')
    .action((projectId) => setBillingStatus(projectId, null, false));
program.parse();
