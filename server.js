// ============================================
// NEWSFLOW SERVER - PRODUCTION READY
// ============================================
// Works locally AND on Render.com
// Data persists between restarts
// ============================================

const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// ============================================
// CONFIGURATION
// ============================================

// Resend API Key
const RESEND_API_KEY = process.env.RESEND_API_KEY || 're_PmCdY2sj_J4C62R2H7GkYVjYu3tf9NwQL';
const FROM_EMAIL = process.env.FROM_EMAIL || 'newsletter@craftbrewingsolutions.com.au';

// Data files - saved directly in the app folder (not a subfolder)
// This ensures they persist and are easy to find
const SUBSCRIBERS_FILE = path.join(__dirname, 'subscribers.json');
const CAMPAIGNS_FILE = path.join(__dirname, 'campaigns.json');
const PENDING_BATCHES_FILE = path.join(__dirname, 'pending-batches.json');
const TRACKING_EVENTS_FILE = path.join(__dirname, 'tracking-events.json');

// ============================================
// INITIALIZE DATA FILES IF THEY DON'T EXIST
// ============================================

function initializeDataFiles() {
  const files = [
    { path: SUBSCRIBERS_FILE, default: [] },
    { path: CAMPAIGNS_FILE, default: [] },
    { path: PENDING_BATCHES_FILE, default: [] },
    { path: TRACKING_EVENTS_FILE, default: [] }
  ];

  files.forEach(file => {
    if (!fs.existsSync(file.path)) {
      fs.writeFileSync(file.path, JSON.stringify(file.default, null, 2));
      console.log(`📁 Created: ${path.basename(file.path)}`);
    }
  });
}

// Initialize on startup
initializeDataFiles();

// ============================================
// RESEND API CLIENT
// ============================================

async function sendEmail(to, subject, html) {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to: to,
      subject: subject,
      html: html
    })
  });
  
  const data = await response.json();
  
  if (!response.ok) {
    throw new Error(data.message || 'Failed to send email');
  }
  
  return data;
}

// ============================================
// HELPER FUNCTIONS
// ============================================

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function loadFromFile(filepath, defaultValue = []) {
  try {
    if (fs.existsSync(filepath)) {
      const data = fs.readFileSync(filepath, 'utf8');
      const parsed = JSON.parse(data);
      return parsed;
    }
  } catch (error) {
    console.log('⚠️ Could not load file:', path.basename(filepath), error.message);
  }
  return defaultValue;
}

function saveToFile(filepath, data) {
  try {
    fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
    console.log(`💾 Saved: ${path.basename(filepath)} (${Array.isArray(data) ? data.length + ' items' : 'object'})`);
    return true;
  } catch (error) {
    console.log('❌ Could not save file:', path.basename(filepath), error.message);
    return false;
  }
}

// ============================================
// HEALTH CHECK (Required for Render)
// ============================================

app.get('/', (req, res) => {
  res.json({ 
    status: 'ok', 
    app: 'NewsFlow Server',
    version: '2.0.0',
    timestamp: new Date().toISOString()
  });
});

app.get('/health', (req, res) => {
  res.json({ status: 'healthy' });
});

// ============================================
// SUBSCRIBER ENDPOINTS
// ============================================

app.get('/subscribers', (req, res) => {
  const subscribers = loadFromFile(SUBSCRIBERS_FILE, []);
  console.log(`📋 GET /subscribers - Loaded ${subscribers.length} subscribers`);
  res.json(subscribers);
});

app.post('/subscribers', (req, res) => {
  const { subscribers } = req.body;
  if (!subscribers) {
    return res.status(400).json({ success: false, error: 'No subscribers provided' });
  }
  saveToFile(SUBSCRIBERS_FILE, subscribers);
  res.json({ success: true, count: subscribers.length });
});

// ============================================
// CAMPAIGN ENDPOINTS
// ============================================

app.get('/campaigns', (req, res) => {
  const campaigns = loadFromFile(CAMPAIGNS_FILE, []);
  console.log(`📊 GET /campaigns - Loaded ${campaigns.length} campaigns`);
  res.json(campaigns);
});

app.post('/campaigns', (req, res) => {
  const { campaigns } = req.body;
  if (!campaigns) {
    return res.status(400).json({ success: false, error: 'No campaigns provided' });
  }
  saveToFile(CAMPAIGNS_FILE, campaigns);
  res.json({ success: true, count: campaigns.length });
});

app.get('/campaigns/:id', (req, res) => {
  const campaigns = loadFromFile(CAMPAIGNS_FILE, []);
  const campaign = campaigns.find(c => String(c.id) === String(req.params.id));
  if (campaign) {
    res.json(campaign);
  } else {
    res.status(404).json({ error: 'Campaign not found' });
  }
});

// ============================================
// PENDING BATCHES ENDPOINTS
// ============================================

app.get('/pending-batches', (req, res) => {
  const batches = loadFromFile(PENDING_BATCHES_FILE, []);
  console.log(`⏳ GET /pending-batches - Loaded ${batches.length} batches`);
  res.json(batches);
});

app.post('/pending-batches', (req, res) => {
  const { batches } = req.body;
  if (!batches) {
    return res.status(400).json({ success: false, error: 'No batches provided' });
  }
  saveToFile(PENDING_BATCHES_FILE, batches);
  res.json({ success: true, count: batches.length });
});

// ============================================
// TRACKING PIXEL & CLICK TRACKING
// ============================================

// Serve tracking pixel (1x1 transparent GIF)
app.get('/track/open/:campaignId/:recipientEmail', (req, res) => {
  const { campaignId, recipientEmail } = req.params;
  const email = decodeURIComponent(recipientEmail);
  
  console.log(`👁️ EMAIL OPENED: ${email} (Campaign: ${campaignId})`);
  
  // Record the open event
  recordTrackingEvent('open', campaignId, email);
  
  // Update campaign stats
  updateCampaignStats(campaignId, email, 'open');
  
  // Return 1x1 transparent GIF
  const pixel = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
  res.writeHead(200, {
    'Content-Type': 'image/gif',
    'Content-Length': pixel.length,
    'Cache-Control': 'no-store, no-cache, must-revalidate, private'
  });
  res.end(pixel);
});

// Track link clicks
app.get('/track/click/:campaignId/:recipientEmail', (req, res) => {
  const { campaignId, recipientEmail } = req.params;
  const { url } = req.query;
  const email = decodeURIComponent(recipientEmail);
  
  console.log(`🔗 LINK CLICKED: ${email} clicked ${url} (Campaign: ${campaignId})`);
  
  // Record the click event
  recordTrackingEvent('click', campaignId, email, url);
  
  // Update campaign stats
  updateCampaignStats(campaignId, email, 'click');
  
  // Redirect to actual URL
  if (url) {
    res.redirect(decodeURIComponent(url));
  } else {
    res.redirect('/');
  }
});

function recordTrackingEvent(type, campaignId, email, url = null) {
  const events = loadFromFile(TRACKING_EVENTS_FILE, []);
  events.push({
    type,
    campaignId,
    email,
    url,
    timestamp: new Date().toISOString()
  });
  // Keep last 10000 events
  if (events.length > 10000) {
    events.splice(0, events.length - 10000);
  }
  saveToFile(TRACKING_EVENTS_FILE, events);
}

function updateCampaignStats(campaignId, email, eventType) {
  const campaigns = loadFromFile(CAMPAIGNS_FILE, []);
  const campaign = campaigns.find(c => String(c.id) === String(campaignId));
  
  if (campaign && campaign.recipients) {
    const recipient = campaign.recipients.find(r => r.email.toLowerCase() === email.toLowerCase());
    
    if (recipient) {
      if (eventType === 'open' && !recipient.openedAt) {
        recipient.openedAt = new Date().toISOString();
        campaign.opened = (campaign.opened || 0) + 1;
        console.log(`   ✅ Updated open count: ${campaign.opened}`);
        saveToFile(CAMPAIGNS_FILE, campaigns);
      }
      if (eventType === 'click' && !recipient.clickedAt) {
        recipient.clickedAt = new Date().toISOString();
        campaign.clicked = (campaign.clicked || 0) + 1;
        console.log(`   ✅ Updated click count: ${campaign.clicked}`);
        saveToFile(CAMPAIGNS_FILE, campaigns);
      }
    }
  }
}

// ============================================
// RESEND WEBHOOK (Backup tracking)
// ============================================

app.post('/webhook/resend', (req, res) => {
  const event = req.body;
  console.log('📡 Resend Webhook:', event.type);
  res.json({ received: true });
});

// ============================================
// EMAIL SENDING WITH TRACKING
// ============================================

app.post('/send-email', async (req, res) => {
  const { to, subject, html } = req.body;
  
  console.log('📧 Sending test email to:', to);
  
  try {
    const data = await sendEmail(to, subject, html);
    console.log('✅ Test email sent!');
    res.json({ success: true, data });
  } catch (error) {
    console.log('❌ Error:', error.message);
    res.json({ success: false, error: error.message });
  }
});

app.post('/send-newsletter', async (req, res) => {
  const { subscribers, subject, html, campaignId, serverUrl } = req.body;
  
  console.log('');
  console.log('📧 ====================================');
  console.log(`📧 Sending to ${subscribers.length} subscribers`);
  console.log(`📧 Campaign ID: ${campaignId}`);
  console.log('📧 ====================================');
  
  let successCount = 0;
  let failCount = 0;
  const errors = [];
  
  for (let i = 0; i < subscribers.length; i++) {
    const subscriber = subscribers[i];
    
    try {
      // Add tracking to email
      const trackedHtml = addTrackingToEmail(html, campaignId, subscriber.email, serverUrl);
      
      await sendEmail(subscriber.email, subject, trackedHtml);
      successCount++;
      console.log(`✅ [${i + 1}/${subscribers.length}] Sent to: ${subscriber.email}`);
    } catch (error) {
      failCount++;
      errors.push({ email: subscriber.email, error: error.message });
      console.log(`❌ [${i + 1}/${subscribers.length}] Failed: ${subscriber.email} - ${error.message}`);
    }
    
    // Rate limit protection
    if (i < subscribers.length - 1) {
      await wait(600);
    }
  }
  
  console.log('');
  console.log(`📊 DONE! Sent: ${successCount}, Failed: ${failCount}`);
  console.log('');
  
  res.json({ success: true, sent: successCount, failed: failCount, errors });
});

// Add tracking pixel and wrap links
function addTrackingToEmail(html, campaignId, recipientEmail, serverUrl) {
  const encodedEmail = encodeURIComponent(recipientEmail);
  const baseUrl = serverUrl || process.env.SERVER_URL || 'http://localhost:3001';
  
  // Tracking pixel
  const trackingPixel = `<img src="${baseUrl}/track/open/${campaignId}/${encodedEmail}" width="1" height="1" style="display:none;" alt="" />`;
  
  let trackedHtml = html;
  
  // Insert tracking pixel
  if (trackedHtml.includes('</body>')) {
    trackedHtml = trackedHtml.replace('</body>', `${trackingPixel}</body>`);
  } else {
    trackedHtml = trackedHtml + trackingPixel;
  }
  
  // Wrap links for click tracking
  trackedHtml = trackedHtml.replace(
    /href="(https?:\/\/[^"]+)"/g,
    (match, url) => {
      if (url.startsWith('mailto:') || url.startsWith('tel:') || url === '#') {
        return match;
      }
      const encodedUrl = encodeURIComponent(url);
      return `href="${baseUrl}/track/click/${campaignId}/${encodedEmail}?url=${encodedUrl}"`;
    }
  );
  
  return trackedHtml;
}

// ============================================
// TRACKING STATS ENDPOINT
// ============================================

app.get('/campaign-stats/:campaignId', (req, res) => {
  const { campaignId } = req.params;
  const events = loadFromFile(TRACKING_EVENTS_FILE, []);
  
  const campaignEvents = events.filter(e => String(e.campaignId) === String(campaignId));
  
  const opens = campaignEvents.filter(e => e.type === 'open');
  const clicks = campaignEvents.filter(e => e.type === 'click');
  
  const uniqueOpens = [...new Set(opens.map(e => e.email))];
  const uniqueClicks = [...new Set(clicks.map(e => e.email))];
  
  res.json({
    campaignId,
    totalOpens: opens.length,
    uniqueOpens: uniqueOpens.length,
    totalClicks: clicks.length,
    uniqueClicks: uniqueClicks.length,
    openedBy: uniqueOpens,
    clickedBy: uniqueClicks
  });
});

// ============================================
// START SERVER
// ============================================

const PORT = process.env.PORT || 3001;
app.listen(PORT, '0.0.0.0', () => {
  console.log('');
  console.log('🚀 ====================================');
  console.log('🚀 NEWSFLOW SERVER v2.0 RUNNING!');
  console.log('🚀 ====================================');
  console.log(`📍 http://localhost:${PORT}`);
  console.log('');
  
  // Show data file status
  const subs = loadFromFile(SUBSCRIBERS_FILE, []);
  const camps = loadFromFile(CAMPAIGNS_FILE, []);
  const batches = loadFromFile(PENDING_BATCHES_FILE, []);
  
  console.log('📁 Data Files:');
  console.log(`   ✅ subscribers.json: ${subs.length} subscribers`);
  console.log(`   ✅ campaigns.json: ${camps.length} campaigns`);
  console.log(`   ✅ pending-batches.json: ${batches.length} pending`);
  console.log(`   ✅ tracking-events.json: ready`);
  console.log('');
  
  if (batches.length > 0) {
    console.log('⚠️  You have pending batches to send!');
    console.log('');
  }
  
  console.log('✅ All systems ready!');
  console.log('');
});
