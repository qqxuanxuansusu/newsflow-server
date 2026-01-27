// ============================================
// NEWSFLOW SERVER - PRODUCTION READY
// ============================================
// Deploy this to Render.com for free hosting
// with permanent webhook URL for tracking
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

// Resend API Key (set this in Render environment variables)
const RESEND_API_KEY = process.env.RESEND_API_KEY || 're_PmCdY2sj_J4C62R2H7GkYVjYu3tf9NwQL';
const FROM_EMAIL = process.env.FROM_EMAIL || 'newsletter@craftbrewingsolutions.com.au';

// Data directory (use /tmp for Render free tier, or persistent disk for paid)
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// File paths
const SUBSCRIBERS_FILE = path.join(DATA_DIR, 'subscribers.json');
const CAMPAIGNS_FILE = path.join(DATA_DIR, 'campaigns.json');
const PENDING_BATCHES_FILE = path.join(DATA_DIR, 'pending-batches.json');
const TRACKING_EVENTS_FILE = path.join(DATA_DIR, 'tracking-events.json');

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
      return JSON.parse(data);
    }
  } catch (error) {
    console.log('Could not load file:', filepath, error.message);
  }
  return defaultValue;
}

function saveToFile(filepath, data) {
  try {
    fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
    return true;
  } catch (error) {
    console.log('Could not save file:', filepath, error.message);
    return false;
  }
}

// Generate unique tracking ID for each email
function generateTrackingId() {
  return 'trk_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}

// ============================================
// HEALTH CHECK (Required for Render)
// ============================================

app.get('/', (req, res) => {
  res.json({ 
    status: 'ok', 
    app: 'NewsFlow Server',
    version: '1.0.0',
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
  console.log('📋 Loaded', subscribers.length, 'subscribers');
  res.json(subscribers);
});

app.post('/subscribers', (req, res) => {
  const { subscribers } = req.body;
  saveToFile(SUBSCRIBERS_FILE, subscribers);
  console.log('✅ Saved', subscribers.length, 'subscribers');
  res.json({ success: true, count: subscribers.length });
});

// ============================================
// CAMPAIGN ENDPOINTS
// ============================================

app.get('/campaigns', (req, res) => {
  const campaigns = loadFromFile(CAMPAIGNS_FILE, []);
  console.log('📊 Loaded', campaigns.length, 'campaigns');
  res.json(campaigns);
});

app.post('/campaigns', (req, res) => {
  const { campaigns } = req.body;
  saveToFile(CAMPAIGNS_FILE, campaigns);
  console.log('✅ Saved', campaigns.length, 'campaigns');
  res.json({ success: true, count: campaigns.length });
});

app.get('/campaigns/:id', (req, res) => {
  const campaigns = loadFromFile(CAMPAIGNS_FILE, []);
  const campaign = campaigns.find(c => c.id === parseInt(req.params.id) || c.id === req.params.id);
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
  console.log('⏳ Loaded', batches.length, 'pending batches');
  res.json(batches);
});

app.post('/pending-batches', (req, res) => {
  const { batches } = req.body;
  saveToFile(PENDING_BATCHES_FILE, batches);
  console.log('✅ Saved', batches.length, 'pending batches');
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
    events.shift();
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
        console.log(`   ✅ Updated open count for campaign: ${campaign.opened}`);
      }
      if (eventType === 'click' && !recipient.clickedAt) {
        recipient.clickedAt = new Date().toISOString();
        campaign.clicked = (campaign.clicked || 0) + 1;
        console.log(`   ✅ Updated click count for campaign: ${campaign.clicked}`);
      }
      saveToFile(CAMPAIGNS_FILE, campaigns);
    }
  }
}

// ============================================
// RESEND WEBHOOK (Backup tracking method)
// ============================================

app.post('/webhook/resend', (req, res) => {
  const event = req.body;
  
  console.log('📡 Resend Webhook received:', event.type);
  
  try {
    const email = event.data?.email || event.data?.to;
    const eventType = event.type;
    
    if (email) {
      if (eventType === 'email.opened') {
        console.log(`👁️ [Webhook] Email opened by: ${email}`);
      }
      if (eventType === 'email.clicked') {
        console.log(`🔗 [Webhook] Link clicked by: ${email}`);
      }
    }
  } catch (error) {
    console.log('❌ Webhook error:', error.message);
  }
  
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
  console.log(`📧 Sending newsletter to ${subscribers.length} subscribers`);
  console.log(`📧 Campaign ID: ${campaignId}`);
  console.log('📧 ====================================');
  console.log('');
  
  let successCount = 0;
  let failCount = 0;
  const errors = [];
  const sentRecipients = [];
  
  for (let i = 0; i < subscribers.length; i++) {
    const subscriber = subscribers[i];
    
    try {
      // Add tracking pixel and wrap links for this recipient
      const trackedHtml = addTrackingToEmail(html, campaignId, subscriber.email, serverUrl);
      
      await sendEmail(subscriber.email, subject, trackedHtml);
      successCount++;
      sentRecipients.push({
        email: subscriber.email,
        name: subscriber.name,
        sentAt: new Date().toISOString()
      });
      console.log(`✅ [${i + 1}/${subscribers.length}] Sent to: ${subscriber.email}`);
    } catch (error) {
      failCount++;
      errors.push({ email: subscriber.email, error: error.message });
      console.log(`❌ [${i + 1}/${subscribers.length}] Failed: ${subscriber.email} - ${error.message}`);
    }
    
    // Rate limit protection - wait 600ms between emails
    if (i < subscribers.length - 1) {
      await wait(600);
    }
  }
  
  console.log('');
  console.log('📊 ====================================');
  console.log(`📊 DONE! Sent: ${successCount}, Failed: ${failCount}`);
  console.log('📊 ====================================');
  console.log('');
  
  res.json({ 
    success: true, 
    sent: successCount, 
    failed: failCount, 
    errors,
    sentRecipients
  });
});

// Add tracking pixel and wrap links
function addTrackingToEmail(html, campaignId, recipientEmail, serverUrl) {
  const encodedEmail = encodeURIComponent(recipientEmail);
  const baseUrl = serverUrl || process.env.SERVER_URL || 'http://localhost:3001';
  
  // Add tracking pixel before closing </body> or at end
  const trackingPixel = `<img src="${baseUrl}/track/open/${campaignId}/${encodedEmail}" width="1" height="1" style="display:none;" alt="" />`;
  
  let trackedHtml = html;
  
  // Insert tracking pixel
  if (trackedHtml.includes('</body>')) {
    trackedHtml = trackedHtml.replace('</body>', `${trackingPixel}</body>`);
  } else {
    trackedHtml = trackedHtml + trackingPixel;
  }
  
  // Wrap links for click tracking (except unsubscribe and mailto links)
  trackedHtml = trackedHtml.replace(
    /href="(https?:\/\/[^"]+)"/g,
    (match, url) => {
      // Don't track mailto, tel, or # links
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

app.get('/tracking-events', (req, res) => {
  const events = loadFromFile(TRACKING_EVENTS_FILE, []);
  res.json(events);
});

app.get('/campaign-stats/:campaignId', (req, res) => {
  const { campaignId } = req.params;
  const events = loadFromFile(TRACKING_EVENTS_FILE, []);
  
  const campaignEvents = events.filter(e => String(e.campaignId) === String(campaignId));
  
  const opens = campaignEvents.filter(e => e.type === 'open');
  const clicks = campaignEvents.filter(e => e.type === 'click');
  
  // Get unique opens and clicks
  const uniqueOpens = [...new Set(opens.map(e => e.email))];
  const uniqueClicks = [...new Set(clicks.map(e => e.email))];
  
  res.json({
    campaignId,
    totalOpens: opens.length,
    uniqueOpens: uniqueOpens.length,
    totalClicks: clicks.length,
    uniqueClicks: uniqueClicks.length,
    openedBy: uniqueOpens,
    clickedBy: uniqueClicks,
    events: campaignEvents
  });
});

// ============================================
// START SERVER
// ============================================

const PORT = process.env.PORT || 3001;
app.listen(PORT, '0.0.0.0', () => {
  console.log('');
  console.log('🚀 ====================================');
  console.log('🚀 NEWSFLOW SERVER IS RUNNING!');
  console.log('🚀 ====================================');
  console.log(`📍 Server: http://localhost:${PORT}`);
  console.log(`📍 Health: http://localhost:${PORT}/health`);
  console.log('');
  console.log('✅ Subscriber management: ENABLED');
  console.log('✅ Campaign management: ENABLED');
  console.log('✅ Email sending: ENABLED');
  console.log('✅ Open tracking: ENABLED');
  console.log('✅ Click tracking: ENABLED');
  console.log('✅ Resend webhook: ENABLED');
  console.log('');
  
  const subs = loadFromFile(SUBSCRIBERS_FILE, []);
  const camps = loadFromFile(CAMPAIGNS_FILE, []);
  const batches = loadFromFile(PENDING_BATCHES_FILE, []);
  
  console.log(`📋 Subscribers: ${subs.length}`);
  console.log(`📊 Campaigns: ${camps.length}`);
  console.log(`⏳ Pending batches: ${batches.length}`);
  console.log('');
  
  if (batches.length > 0) {
    console.log('⚠️  You have pending batches to send!');
    console.log('');
  }
  
  console.log('📡 Webhook URL: [YOUR_RENDER_URL]/webhook/resend');
  console.log('   Set this in Resend dashboard for backup tracking');
  console.log('');
});
