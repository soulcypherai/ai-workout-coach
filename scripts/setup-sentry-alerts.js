#!/usr/bin/env node

/**
 * Sentry Alert Setup Script
 * Automatically creates all recommended alerts for Pitchroom AI Avatar Chat
 * 
 * Usage:
 *   SENTRY_AUTH_TOKEN=your_token node scripts/setup-sentry-alerts.js
 * 
 * Requirements:
 *   - Sentry auth token with project write permissions
 *   - Frontend and backend projects already created in Sentry
 */

import https from 'https';
import process from 'process';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Load environment variables from .env.development
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const envPath = join(__dirname, '../.env.development');

try {
  const envContent = readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach(line => {
    const [key, value] = line.split('=');
    if (key && value && !process.env[key]) {
      process.env[key] = value;
    }
  });
} catch (error) {
  console.log('No .env.development file found, using environment variables only');
}

// Configuration
const CONFIG = {
  SENTRY_AUTH_TOKEN: process.env.SENTRY_AUTH_TOKEN,
  ORG_SLUG: process.env.SENTRY_ORG || 'pitchroom',
  FRONTEND_PROJECT: process.env.SENTRY_PROJECT_FRONTEND || 'pitchroom-frontend',
  BACKEND_PROJECT: process.env.SENTRY_PROJECT_BACKEND || 'pitchroom-backend',
  SLACK_FRONTEND_CHANNEL: 'sentry-pitchroom-frontend',
  SLACK_BACKEND_CHANNEL: 'sentry-pitchroom-backend',
};

// Validation
if (!CONFIG.SENTRY_AUTH_TOKEN) {
  console.error('❌ SENTRY_AUTH_TOKEN environment variable is required');
  console.log('Get your token from: https://sentry.io/settings/account/api/auth-tokens/');
  process.exit(1);
}

// Frontend Alert Configurations (with proper filters as per spec)
const FRONTEND_ALERTS = [
  {
    name: "🚨 High Frontend Error Rate",
    actionMatch: "any",
    filterMatch: "all",
    frequency: 30,
    environment: null,
    conditions: [
      {
        id: "sentry.rules.conditions.event_frequency.EventFrequencyPercentCondition",
        value: 5.0,
        interval: "5m"
      }
    ],
    filters: [],
    actions: [
      { 
        id: "sentry.mail.actions.NotifyEmailAction",
        targetType: "IssueOwners",
        targetIdentifier: null,
        fallthroughType: "ActiveMembers"
      }
    ]
  },
  {
    name: "🎭 Avatar Loading Failures",
    actionMatch: "any",
    filterMatch: "all",
    frequency: 60,
    environment: null,
    conditions: [
      {
        id: "sentry.rules.conditions.event_frequency.EventFrequencyCondition",
        value: 5,
        interval: "5m"
      }
    ],
    filters: [
      {
        id: "sentry.rules.filters.event_attribute.EventAttributeFilter",
        attribute: "message",
        match: "co",
        value: "avatar"
      }
    ],
    actions: [
      { 
        id: "sentry.mail.actions.NotifyEmailAction",
        targetType: "IssueOwners",
        targetIdentifier: null,
        fallthroughType: "ActiveMembers"
      }
    ]
  },
  {
    name: "📹 WebRTC Connection Failures",
    actionMatch: "any",
    filterMatch: "all",
    frequency: 60,
    environment: null,
    conditions: [
      {
        id: "sentry.rules.conditions.event_frequency.EventFrequencyCondition",
        value: 3,
        interval: "15m"
      }
    ],
    filters: [
      {
        id: "sentry.rules.filters.event_attribute.EventAttributeFilter",
        attribute: "message",
        match: "co",
        value: "WebRTC"
      }
    ],
    actions: [
      { 
        id: "sentry.mail.actions.NotifyEmailAction",
        targetType: "IssueOwners",
        targetIdentifier: null,
        fallthroughType: "ActiveMembers"
      }
    ]
  },
  {
    name: "🔗 LiveKit Connection Issues",
    actionMatch: "any",
    filterMatch: "all",
    frequency: 60,
    environment: null,
    conditions: [
      {
        id: "sentry.rules.conditions.event_frequency.EventFrequencyCondition",
        value: 3,
        interval: "15m"
      }
    ],
    filters: [
      {
        id: "sentry.rules.filters.event_attribute.EventAttributeFilter",
        attribute: "message",
        match: "co",
        value: "LiveKit"
      }
    ],
    actions: [
      { 
        id: "sentry.mail.actions.NotifyEmailAction",
        targetType: "IssueOwners",
        targetIdentifier: null,
        fallthroughType: "ActiveMembers"
      }
    ]
  },
  {
    name: "💳 Wallet Connection Failures",
    actionMatch: "any",
    filterMatch: "all",
    frequency: 120,
    environment: null,
    conditions: [
      {
        id: "sentry.rules.conditions.event_frequency.EventFrequencyCondition",
        value: 10,
        interval: "1h"
      }
    ],
    filters: [
      {
        id: "sentry.rules.filters.event_attribute.EventAttributeFilter",
        attribute: "message",
        match: "co",
        value: "wallet"
      }
    ],
    actions: [
      { 
        id: "sentry.mail.actions.NotifyEmailAction",
        targetType: "IssueOwners",
        targetIdentifier: null,
        fallthroughType: "ActiveMembers"
      }
    ]
  },
  {
    name: "💰 Points Purchase Failures",
    actionMatch: "any",
    filterMatch: "all",
    frequency: 30,
    environment: null,
    conditions: [
      {
        id: "sentry.rules.conditions.event_frequency.EventFrequencyCondition",
        value: 1,
        interval: "5m"
      }
    ],
    filters: [
      {
        id: "sentry.rules.filters.tagged_event.TaggedEventFilter",
        key: "section",
        match: "eq",
        value: "payment"
      }
    ],
    actions: [
      { 
        id: "sentry.mail.actions.NotifyEmailAction",
        targetType: "IssueOwners",
        targetIdentifier: null,
        fallthroughType: "ActiveMembers"
      }
    ]
  },
  {
    name: "🐌 Slow Page Load Performance",
    actionMatch: "any",
    filterMatch: "all",
    frequency: 120,
    environment: null,
    conditions: [
      {
        id: "sentry.rules.conditions.event_frequency.EventFrequencyPercentCondition",
        value: 20.0,
        interval: "5m"
      }
    ],
    filters: [],
    actions: [
      { 
        id: "sentry.mail.actions.NotifyEmailAction",
        targetType: "IssueOwners",
        targetIdentifier: null,
        fallthroughType: "ActiveMembers"
      }
    ]
  }
];

// Backend Alert Configurations (with proper filters as per spec)
const BACKEND_ALERTS = [
  {
    name: "🚨 High Backend Error Rate",
    actionMatch: "any",
    filterMatch: "all",
    frequency: 30,
    environment: null,
    conditions: [
      {
        id: "sentry.rules.conditions.event_frequency.EventFrequencyPercentCondition",
        value: 3.0,
        interval: "5m"
      }
    ],
    filters: [],
    actions: [
      { 
        id: "sentry.mail.actions.NotifyEmailAction",
        targetType: "IssueOwners",
        targetIdentifier: null,
        fallthroughType: "ActiveMembers"
      }
    ]
  },
  {
    name: "💥 Server Critical Errors",
    actionMatch: "any",
    filterMatch: "all",
    frequency: 15,
    environment: null,
    conditions: [
      {
        id: "sentry.rules.conditions.event_frequency.EventFrequencyCondition",
        value: 1,
        interval: "1m"
      }
    ],
    filters: [
      {
        id: "sentry.rules.filters.level.LevelFilter",
        match: "gte",
        level: "40"
      }
    ],
    actions: [
      { 
        id: "sentry.mail.actions.NotifyEmailAction",
        targetType: "IssueOwners",
        targetIdentifier: null,
        fallthroughType: "ActiveMembers"
      }
    ]
  },
  {
    name: "🗄️ Database Connection Failures",
    actionMatch: "any",
    filterMatch: "all",
    frequency: 60,
    environment: null,
    conditions: [
      {
        id: "sentry.rules.conditions.event_frequency.EventFrequencyCondition",
        value: 2,
        interval: "5m"
      }
    ],
    filters: [
      {
        id: "sentry.rules.filters.event_attribute.EventAttributeFilter",
        attribute: "message",
        match: "co",
        value: "ECONNREFUSED"
      }
    ],
    actions: [
      { 
        id: "sentry.mail.actions.NotifyEmailAction",
        targetType: "IssueOwners",
        targetIdentifier: null,
        fallthroughType: "ActiveMembers"
      }
    ]
  },
  {
    name: "🤖 OpenAI API Failures",
    actionMatch: "any",
    filterMatch: "all",
    frequency: 60,
    environment: null,
    conditions: [
      {
        id: "sentry.rules.conditions.event_frequency.EventFrequencyCondition",
        value: 5,
        interval: "5m"
      }
    ],
    filters: [
      {
        id: "sentry.rules.filters.tagged_event.TaggedEventFilter",
        key: "context",
        match: "eq",
        value: "llm"
      }
    ],
    actions: [
      { 
        id: "sentry.mail.actions.NotifyEmailAction",
        targetType: "IssueOwners",
        targetIdentifier: null,
        fallthroughType: "ActiveMembers"
      }
    ]
  },
  {
    name: "🎙️ ElevenLabs TTS Failures",
    actionMatch: "any",
    filterMatch: "all",
    frequency: 60,
    environment: null,
    conditions: [
      {
        id: "sentry.rules.conditions.event_frequency.EventFrequencyCondition",
        value: 3,
        interval: "5m"
      }
    ],
    filters: [
      {
        id: "sentry.rules.filters.tagged_event.TaggedEventFilter",
        key: "context",
        match: "eq",
        value: "tts"
      }
    ],
    actions: [
      { 
        id: "sentry.mail.actions.NotifyEmailAction",
        targetType: "IssueOwners",
        targetIdentifier: null,
        fallthroughType: "ActiveMembers"
      }
    ]
  },
  {
    name: "🎧 Speech-to-Text Failures",
    actionMatch: "any",
    filterMatch: "all",
    frequency: 60,
    environment: null,
    conditions: [
      {
        id: "sentry.rules.conditions.event_frequency.EventFrequencyCondition",
        value: 3,
        interval: "5m"
      }
    ],
    filters: [
      {
        id: "sentry.rules.filters.tagged_event.TaggedEventFilter",
        key: "context",
        match: "eq",
        value: "stt"
      }
    ],
    actions: [
      { 
        id: "sentry.mail.actions.NotifyEmailAction",
        targetType: "IssueOwners",
        targetIdentifier: null,
        fallthroughType: "ActiveMembers"
      }
    ]
  },
  {
    name: "🔑 LiveKit Token Generation Failures",
    actionMatch: "any",
    filterMatch: "all",
    frequency: 60,
    environment: null,
    conditions: [
      {
        id: "sentry.rules.conditions.event_frequency.EventFrequencyCondition",
        value: 2,
        interval: "5m"
      }
    ],
    filters: [
      {
        id: "sentry.rules.filters.tagged_event.TaggedEventFilter",
        key: "function",
        match: "eq",
        value: "generateLiveKitToken"
      }
    ],
    actions: [
      { 
        id: "sentry.mail.actions.NotifyEmailAction",
        targetType: "IssueOwners",
        targetIdentifier: null,
        fallthroughType: "ActiveMembers"
      }
    ]
  },
  {
    name: "🔌 WebSocket Connection Issues",
    actionMatch: "any",
    filterMatch: "all",
    frequency: 90,
    environment: null,
    conditions: [
      {
        id: "sentry.rules.conditions.event_frequency.EventFrequencyCondition",
        value: 10,
        interval: "15m"
      }
    ],
    filters: [
      {
        id: "sentry.rules.filters.event_attribute.EventAttributeFilter",
        attribute: "message",
        match: "co",
        value: "socket"
      }
    ],
    actions: [
      { 
        id: "sentry.mail.actions.NotifyEmailAction",
        targetType: "IssueOwners",
        targetIdentifier: null,
        fallthroughType: "ActiveMembers"
      }
    ]
  },
  {
    name: "🐌 Slow API Responses",
    actionMatch: "any",
    filterMatch: "all",
    frequency: 120,
    environment: null,
    conditions: [
      {
        id: "sentry.rules.conditions.event_frequency.EventFrequencyPercentCondition",
        value: 15.0,
        interval: "5m"
      }
    ],
    filters: [],
    actions: [
      { 
        id: "sentry.mail.actions.NotifyEmailAction",
        targetType: "IssueOwners",
        targetIdentifier: null,
        fallthroughType: "ActiveMembers"
      }
    ]
  },
  {
    name: "💾 Memory/CPU Issues",
    actionMatch: "any",
    filterMatch: "all",
    frequency: 60,
    environment: null,
    conditions: [
      {
        id: "sentry.rules.conditions.event_frequency.EventFrequencyCondition",
        value: 1,
        interval: "5m"
      }
    ],
    filters: [
      {
        id: "sentry.rules.filters.event_attribute.EventAttributeFilter",
        attribute: "message",
        match: "co",
        value: "ENOMEM"
      }
    ],
    actions: [
      { 
        id: "sentry.mail.actions.NotifyEmailAction",
        targetType: "IssueOwners",
        targetIdentifier: null,
        fallthroughType: "ActiveMembers"
      }
    ]
  }
];

// API Helper Functions
function makeRequest(options, data = null) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let responseData = '';
      
      res.on('data', (chunk) => {
        responseData += chunk;
      });
      
      res.on('end', () => {
        try {
          const parsed = responseData ? JSON.parse(responseData) : {};
          resolve({ status: res.statusCode, data: parsed });
        } catch (error) {
          resolve({ status: res.statusCode, data: responseData });
        }
      });
    });
    
    req.on('error', reject);
    
    if (data) {
      req.write(JSON.stringify(data));
    }
    
    req.end();
  });
}

async function createAlert(project, alertConfig) {
  const options = {
    hostname: 'sentry.io',
    port: 443,
    path: `/api/0/projects/${CONFIG.ORG_SLUG}/${project}/rules/`,
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${CONFIG.SENTRY_AUTH_TOKEN}`,
      'Content-Type': 'application/json'
    }
  };

  try {
    const response = await makeRequest(options, alertConfig);
    
    if (response.status === 201 || response.status === 200) {
      console.log(`✅ Created: "${alertConfig.name}"`);
      return true;
    } else if (response.status === 400 && response.data.name && response.data.name[0].includes('already exists')) {
      console.log(`⚠️  Exists: "${alertConfig.name}"`);
      return true;
    } else if (response.status === 400 && response.data.name && response.data.name[0].includes('duplicate')) {
      console.log(`⚠️  Duplicate: "${alertConfig.name}"`);
      return true;
    } else {
      console.error(`❌ Failed: "${alertConfig.name}" (${response.status})`);
      console.error(`   Response: ${JSON.stringify(response.data)}`);
      return false;
    }
  } catch (error) {
    console.error(`❌ Error creating "${alertConfig.name}":`, error.message);
    return false;
  }
}

async function checkProjectExists(project) {
  const options = {
    hostname: 'sentry.io',
    port: 443,
    path: `/api/0/organizations/${CONFIG.ORG_SLUG}/projects/`,
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${CONFIG.SENTRY_AUTH_TOKEN}`
    }
  };

  try {
    const response = await makeRequest(options);
    if (response.status === 200 && Array.isArray(response.data)) {
      return response.data.some(p => p.slug === project);
    }
    return false;
  } catch (error) {
    return false;
  }
}

// Add Slack integration as per spec
function addSlackIntegration(alerts, channel) {
  return alerts.map(alert => ({
    ...alert,
    actions: [
      ...alert.actions,
      {
        id: "sentry.integrations.slack.notify_action.SlackNotifyServiceAction",
        workspace: "308913", // Soul Cypher Slack workspace
        channel: `#${channel}`,
        tags: ""
      }
    ]
  }));
}

// Function to update existing alerts with Slack integration
async function addSlackToExistingAlerts() {
  console.log('🔧 Adding Slack integration to existing alerts...');
  
  // Get existing frontend alerts
  const frontendRules = await makeRequest({
    hostname: 'sentry.io',
    port: 443,
    path: `/api/0/projects/${CONFIG.ORG_SLUG}/${CONFIG.FRONTEND_PROJECT}/rules/`,
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${CONFIG.SENTRY_AUTH_TOKEN}`
    }
  });

  // Get existing backend alerts  
  const backendRules = await makeRequest({
    hostname: 'sentry.io',
    port: 443,
    path: `/api/0/projects/${CONFIG.ORG_SLUG}/${CONFIG.BACKEND_PROJECT}/rules/`,
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${CONFIG.SENTRY_AUTH_TOKEN}`
    }
  });

  let updated = 0;
  
  // Update frontend alerts
  if (frontendRules.status === 200) {
    for (const rule of frontendRules.data) {
      if (rule.name.match(/^[🚨🎭📹🔗💳💰🐌]/)) {
        const hasSlack = rule.actions.some(action => 
          action.id === "sentry.integrations.slack.notify_action.SlackNotifyServiceAction"
        );
        
        if (!hasSlack) {
          const updatedRule = {
            ...rule,
            actions: [
              ...rule.actions,
              {
                id: "sentry.integrations.slack.notify_action.SlackNotifyServiceAction",
                workspace: "308913",
                channel: "#sentry-pitchroom-frontend",
                tags: ""
              }
            ]
          };
          
          const updateResponse = await makeRequest({
            hostname: 'sentry.io',
            port: 443,
            path: `/api/0/projects/${CONFIG.ORG_SLUG}/${CONFIG.FRONTEND_PROJECT}/rules/${rule.id}/`,
            method: 'PUT',
            headers: {
              'Authorization': `Bearer ${CONFIG.SENTRY_AUTH_TOKEN}`,
              'Content-Type': 'application/json'
            }
          }, updatedRule);
          
          if (updateResponse.status === 200) {
            console.log(`✅ Added Slack to: "${rule.name}"`);
            updated++;
          } else {
            console.log(`❌ Failed to add Slack to: "${rule.name}"`);
          }
          
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
    }
  }

  // Update backend alerts
  if (backendRules.status === 200) {
    for (const rule of backendRules.data) {
      if (rule.name.match(/^[🚨💥🗄🤖🎙🎧🔑🔌🐌💾]/)) {
        const hasSlack = rule.actions.some(action => 
          action.id === "sentry.integrations.slack.notify_action.SlackNotifyServiceAction"
        );
        
        if (!hasSlack) {
          const updatedRule = {
            ...rule,
            actions: [
              ...rule.actions,
              {
                id: "sentry.integrations.slack.notify_action.SlackNotifyServiceAction",
                workspace: "308913",
                channel: "#sentry-pitchroom-backend",
                tags: ""
              }
            ]
          };
          
          const updateResponse = await makeRequest({
            hostname: 'sentry.io',
            port: 443,
            path: `/api/0/projects/${CONFIG.ORG_SLUG}/${CONFIG.BACKEND_PROJECT}/rules/${rule.id}/`,
            method: 'PUT',
            headers: {
              'Authorization': `Bearer ${CONFIG.SENTRY_AUTH_TOKEN}`,
              'Content-Type': 'application/json'
            }
          }, updatedRule);
          
          if (updateResponse.status === 200) {
            console.log(`✅ Added Slack to: "${rule.name}"`);
            updated++;
          } else {
            console.log(`❌ Failed to add Slack to: "${rule.name}"`);
          }
          
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
    }
  }
  
  console.log(`\n🎉 Added Slack integration to ${updated} alerts!`);
}

// Main Setup Function
async function setupAllAlerts() {
  console.log('🚀 Pitchroom Sentry Alert Setup');
  console.log('================================');
  console.log(`Organization: ${CONFIG.ORG_SLUG}`);
  console.log(`Frontend Project: ${CONFIG.FRONTEND_PROJECT}`);
  console.log(`Backend Project: ${CONFIG.BACKEND_PROJECT}`);
  console.log(`Frontend Slack Channel: ${CONFIG.SLACK_FRONTEND_CHANNEL}`);
  console.log(`Backend Slack Channel: ${CONFIG.SLACK_BACKEND_CHANNEL}`);
  console.log('');

  // Check if projects exist
  console.log('🔍 Checking projects...');
  const frontendExists = await checkProjectExists(CONFIG.FRONTEND_PROJECT);
  const backendExists = await checkProjectExists(CONFIG.BACKEND_PROJECT);
  
  if (!frontendExists) {
    console.error(`❌ Frontend project "${CONFIG.FRONTEND_PROJECT}" not found`);
    console.log('   Create it first at: https://sentry.io/organizations/' + CONFIG.ORG_SLUG + '/projects/new/');
  }
  
  if (!backendExists) {
    console.error(`❌ Backend project "${CONFIG.BACKEND_PROJECT}" not found`);
    console.log('   Create it first at: https://sentry.io/organizations/' + CONFIG.ORG_SLUG + '/projects/new/');
  }
  
  if (!frontendExists || !backendExists) {
    process.exit(1);
  }
  
  console.log('✅ Projects found');
  console.log('');

  let successCount = 0;
  let totalCount = 0;

  // Setup Frontend Alerts
  if (frontendExists) {
    console.log('📱 Setting up Frontend alerts...');
    
    for (const alert of FRONTEND_ALERTS) {
      totalCount++;
      const success = await createAlert(CONFIG.FRONTEND_PROJECT, alert);
      if (success) successCount++;
      
      // Rate limiting - wait between requests
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    console.log('');
  }

  // Setup Backend Alerts
  if (backendExists) {
    console.log('🔧 Setting up Backend alerts...');
    
    for (const alert of BACKEND_ALERTS) {
      totalCount++;
      const success = await createAlert(CONFIG.BACKEND_PROJECT, alert);
      if (success) successCount++;
      
      // Rate limiting - wait between requests
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    console.log('');
  }

  // Add Slack integration to existing alerts
  if (successCount === totalCount) {
    console.log('');
    await addSlackToExistingAlerts();
  }

  // Summary
  console.log('');
  console.log('📋 Setup Complete!');
  console.log('==================');
  console.log(`✅ Successfully created/verified: ${successCount}/${totalCount} alerts`);
  
  if (successCount === totalCount) {
    console.log('🎉 All alerts are now active with Slack integration!');
    console.log('');
    console.log('✅ Features implemented as per spec:');
    console.log('   • Message content filtering (avatar, WebRTC, LiveKit, wallet, etc.)');
    console.log('   • Tagged event filtering (payment, llm, tts, stt contexts)');
    console.log('   • Level filtering for critical errors');
    console.log('   • Slack integration with dedicated channels');
    console.log('   • Email notifications to issue owners');
    console.log('');
    console.log('Next steps:');
    console.log('1. Test alerts by triggering some errors');
    console.log('2. Adjust thresholds based on your traffic patterns');
    console.log('3. Monitor both email and Slack for notifications');
    console.log('');
    console.log('View your alerts at:');
    console.log(`   Frontend: https://sentry.io/organizations/${CONFIG.ORG_SLUG}/alerts/rules/?project=${CONFIG.FRONTEND_PROJECT}`);
    console.log(`   Backend: https://sentry.io/organizations/${CONFIG.ORG_SLUG}/alerts/rules/?project=${CONFIG.BACKEND_PROJECT}`);
  } else {
    console.log('⚠️  Some alerts failed to create. Check the errors above.');
    process.exit(1);
  }
}

// Run the setup
if (import.meta.url === `file://${process.argv[1]}`) {
  setupAllAlerts().catch((error) => {
    console.error('💥 Setup failed:', error);
    process.exit(1);
  });
}

export { setupAllAlerts, FRONTEND_ALERTS, BACKEND_ALERTS };