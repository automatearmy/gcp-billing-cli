#!/usr/bin/env node --no-deprecation

import { Command } from 'commander';
import { ProjectsClient } from '@google-cloud/resource-manager';
import { CloudBillingClient } from '@google-cloud/billing';
import { CloudSchedulerClient } from '@google-cloud/scheduler';
import chalk from 'chalk';
import ora from 'ora';
import { readFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

const program = new Command();
const projectsClient = new ProjectsClient();
const billingClient = new CloudBillingClient();
const schedulerClient = new CloudSchedulerClient();

// Emoji constants to avoid quotes in table
const CHECKMARK = '✅' as const;
const CROSS = '❌' as const;

interface ProjectInfo {
  'Project ID': string;
  'Name': string;
  'Billing Enabled': typeof CHECKMARK | typeof CROSS;
  'Billing Account': string;
}

interface BillingAccountInfo {
  'Account ID': string;
  'Display Name': string;
  'Open': typeof CHECKMARK | typeof CROSS;
}

interface ScheduleOptions {
  time?: string;
  cron?: string;
  timezone?: string;
}

// Helper function to create raw string objects for table display
function createRawObject<T extends Record<string, any>>(obj: T): T {
  const raw = {} as T;
  Object.entries(obj).forEach(([key, value]) => {
    Object.defineProperty(raw, key, {
      value: value,
      enumerable: true
    });
  });
  return raw;
}

function handleApiError(error: any, spinner?: ora.Ora) {
  if (spinner) {
    spinner.fail('Operation failed');
  }

  if (error.code === 7 && error.reason === 'SERVICE_DISABLED') {
    console.error(chalk.red('\nError: Required GCP APIs are not enabled.'));
    console.log(chalk.yellow('\nPlease enable the following APIs in your GCP project:'));
    console.log(chalk.yellow('1. Cloud Billing API: https://console.cloud.google.com/apis/library/cloudbilling.googleapis.com'));
    console.log(chalk.yellow('2. Cloud Resource Manager API: https://console.cloud.google.com/apis/library/cloudresourcemanager.googleapis.com'));
    console.log(chalk.yellow('3. Cloud Scheduler API: https://console.cloud.google.com/apis/library/cloudscheduler.googleapis.com'));
    console.log(chalk.yellow('\nAfter enabling the APIs, wait a few minutes for the changes to propagate before trying again.'));
    console.log(chalk.blue('\nYou can also enable these APIs using the following gcloud commands:'));
    console.log('gcloud services enable cloudbilling.googleapis.com');
    console.log('gcloud services enable cloudresourcemanager.googleapis.com');
    console.log('gcloud services enable cloudscheduler.googleapis.com\n');
    return;
  }
  
  if (error.code === 7 && error.reason === 'PERMISSION_DENIED') {
    console.error(chalk.red('\nError: You don\'t have the required permissions to perform this action.'));
    console.log(chalk.yellow('\nRequired permissions:'));
    console.log(chalk.yellow('1. billing.accounts.list - to view billing accounts'));
    console.log(chalk.yellow('2. billing.projectBillingInfo.update - to update project billing'));
    console.log(chalk.yellow('3. resourcemanager.projects.list - to list projects'));
    console.log(chalk.yellow('\nYou need one of these roles:'));
    console.log(chalk.yellow('- Billing Account Administrator (roles/billing.admin)'));
    console.log(chalk.yellow('- Billing Account User (roles/billing.user) - for linking projects only'));
    console.log(chalk.blue('\nTo grant these roles, ask your organization admin to:'));
    console.log('1. Go to: https://console.cloud.google.com/billing');
    console.log('2. Select your billing account');
    console.log('3. Go to "Account Management" > "Permissions"');
    console.log('4. Click "Add Principal" and grant the appropriate role\n');
    return;
  }
  
  if (error.code === 16) {
    console.error(chalk.red('\nError: Authentication failed. Please make sure you are properly authenticated.'));
    console.log(chalk.yellow('\nRun the following command to authenticate:'));
    console.log('gcloud auth application-default login\n');
    return;
  }

  console.error(chalk.red('Error:'), error.message || error);
}

async function listBillingAccounts() {
  const spinner = ora('Fetching billing accounts...').start();
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
  } catch (error) {
    handleApiError(error, spinner);
  }
}

interface ListOptions {
  exclude?: string;
  filter?: string;
}

async function listProjects(options: ListOptions) {
  const spinner = ora('Fetching projects...').start();
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
        return projectId && !projectId.startsWith(options.exclude as string);
      });
    }

    // Apply include filter if provided
    if (options.filter) {
      spinner.text = 'Applying inclusion filter...';
      filteredProjects = filteredProjects.filter(project => {
        const projectId = project.projectId;
        return projectId && projectId.startsWith(options.filter as string);
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
      } catch (error: unknown) {
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

  } catch (error) {
    handleApiError(error, spinner);
  }
}

async function setBillingStatus(projectId: string, billingAccountId: string | null, enable: boolean) {
  const spinner = ora(`${enable ? 'Enabling' : 'Disabling'} billing for project ${projectId}...`).start();
  try {
    const billingAccountName = billingAccountId ? `billingAccounts/${billingAccountId}` : '';

    await billingClient.updateProjectBillingInfo({
      name: `projects/${projectId}`,
      projectBillingInfo: {
        billingAccountName: enable ? billingAccountName : '',
        billingEnabled: enable
      }
    });

    spinner.succeed(
      `Successfully ${enable ? 'enabled' : 'disabled'} billing for project ${projectId}`
    );
    
    if (enable) {
      console.log(chalk.green(`Billing account ${billingAccountId} has been linked to the project`));
    }
  } catch (error) {
    handleApiError(error, spinner);
  }
}

// Add this function to get the current project ID from gcloud config
function getCurrentProjectId(): string {
  try {
    const configPath = join(homedir(), '.config', 'gcloud', 'configurations', 'config_default');
    const config = readFileSync(configPath, 'utf8');
    const match = config.match(/project = (.+)/);
    if (match && match[1]) {
      return match[1].trim();
    }
    throw new Error('Project ID not found in gcloud config');
  } catch (error) {
    throw new Error('Failed to read project ID from gcloud config. Make sure you have run: gcloud config set project PROJECT_ID');
  }
}

async function scheduleOperation(
  targetProjectId: string,
  billingAccountId: string | null,
  enable: boolean,
  options: ScheduleOptions,
  functionUrl: string
) {
  const spinner = ora(`Scheduling billing ${enable ? 'enablement' : 'disablement'}...`).start();
  
  try {
    // Get the current project ID from gcloud config
    const currentProjectId = getCurrentProjectId();
    spinner.text = `Using project ${currentProjectId} for Cloud Scheduler`;

    const parent = `projects/${currentProjectId}/locations/us-central1`;
    const jobName = `billing-${enable ? 'enable' : 'disable'}-${targetProjectId}-${Date.now()}`;
    const fullJobName = `${parent}/jobs/${jobName}`;

    let schedule: string;
    if (options.cron) {
      schedule = options.cron;
    } else if (options.time) {
      const [hours, minutes] = options.time.split(':');
      schedule = `${minutes} ${hours} * * *`;
    } else {
      throw new Error('Either --time or --cron must be specified');
    }

    const job = {
      name: fullJobName,
      schedule,
      timeZone: options.timezone || 'UTC',
      httpTarget: {
        uri: functionUrl,
        httpMethod: 'POST' as const,
        body: Buffer.from(JSON.stringify({
          projectId: targetProjectId,
          billingAccountId,
          enable
        })).toString('base64'),
        headers: {
          'Content-Type': 'application/json'
        }
      }
    };

    const response = (await schedulerClient.createJob({
      parent,
      job
    }))[0];

    spinner.succeed(`Successfully scheduled billing ${enable ? 'enablement' : 'disablement'}`);
    console.log(chalk.green('\nSchedule details:'));
    console.log(`Job name: ${response.name}`);
    console.log(`Schedule: ${response.schedule}`);
    console.log(`Timezone: ${response.timeZone}`);
    console.log(`Scheduler project: ${currentProjectId}`);
    console.log(`Target project: ${targetProjectId}`);
    
    // Get the next execution time
    const [nextRun] = await schedulerClient.getJob({ name: response.name });
    if (nextRun.scheduleTime) {
      const nextRunTime = new Date(Number(nextRun.scheduleTime.seconds) * 1000);
      console.log(`Next run: ${nextRunTime.toLocaleString()} ${options.timezone || 'UTC'}`);
    } else {
      console.log('Next run time not available yet. Check Cloud Console for details.');
    }
    console.log();
  } catch (error) {
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

program
  .command('schedule-enable')
  .description('Schedule billing to be enabled at a specific time')
  .argument('<projectId>', 'The project ID to enable billing for')
  .argument('<billingAccountId>', 'The billing account ID to link to the project')
  .option('--time <HH:MM>', 'Time in 24-hour format (HH:MM)')
  .option('--cron <expression>', 'Cron expression (e.g. "0 9 * * 1" for every Monday at 9 AM)')
  .option('--timezone <timezone>', 'Timezone (default: UTC)', 'UTC')
  .addHelpText('after', `
Examples:
  $ gcp-billing schedule-enable my-project-id 0X0X0X-0X0X0X-0X0X0X --time 09:00
  $ gcp-billing schedule-enable my-project-id 0X0X0X-0X0X0X-0X0X0X --cron "0 9 * * 1" --timezone America/Los_Angeles
  
Note: You need to set up a Cloud Function first and provide its URL via BILLING_FUNCTION_URL environment variable.`)
  .action((projectId, billingAccountId, options) => {
    if (!options.time && !options.cron) {
      console.error(chalk.red('Error: Either --time or --cron must be specified'));
      return;
    }
    const functionUrl = process.env.BILLING_FUNCTION_URL;
    if (!functionUrl) {
      console.error(chalk.red('Error: BILLING_FUNCTION_URL environment variable is not set'));
      console.log(chalk.yellow('\nPlease set it to your Cloud Function URL:'));
      console.log('export BILLING_FUNCTION_URL=https://your-function-url');
      return;
    }
    scheduleOperation(projectId, billingAccountId, true, options, functionUrl);
  });

program
  .command('schedule-disable')
  .description('Schedule billing to be disabled at a specific time')
  .argument('<projectId>', 'The project ID to disable billing for')
  .option('--time <HH:MM>', 'Time in 24-hour format (HH:MM)')
  .option('--cron <expression>', 'Cron expression (e.g. "0 18 * * 1-5" for weekdays at 6 PM)')
  .option('--timezone <timezone>', 'Timezone (default: UTC)', 'UTC')
  .addHelpText('after', `
Examples:
  $ gcp-billing schedule-disable my-project-id --time 18:00
  $ gcp-billing schedule-disable my-project-id --cron "0 18 * * 1-5" --timezone America/New_York
  
Note: You need to set up a Cloud Function first and provide its URL via BILLING_FUNCTION_URL environment variable.`)
  .action((projectId, options) => {
    if (!options.time && !options.cron) {
      console.error(chalk.red('Error: Either --time or --cron must be specified'));
      return;
    }
    const functionUrl = process.env.BILLING_FUNCTION_URL;
    if (!functionUrl) {
      console.error(chalk.red('Error: BILLING_FUNCTION_URL environment variable is not set'));
      console.log(chalk.yellow('\nPlease set it to your Cloud Function URL:'));
      console.log('export BILLING_FUNCTION_URL=https://your-function-url');
      return;
    }
    scheduleOperation(projectId, null, false, options, functionUrl);
  });

program.parse(); 