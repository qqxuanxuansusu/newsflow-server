// ============================================
// NEWSFLOW SERVER - SUPABASE EDITION
// ============================================
// Data stored permanently in Supabase
// Works locally AND on Render.com
// ============================================

const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// ============================================
// CONFIGURATION
// ============================================

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM_EMAIL = process.env.FROM_EMAIL || 'newsletter@craftbrewingsolutions.com.au';

// Supabase credentials (set these in Render's Environment settings)
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

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

// ============================================
// HEALTH CHECK (Required for Render)
// ============================================

app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    app: 'NewsFlow Server',
    version: '3.0.0-supabase',
    timestamp: new Date().toISOString()
  });
});

app.get('/health', (req, res) => {
  res.json({ status: 'healthy' });
});

// ============================================
// SUBSCRIBER ENDPOINTS
// ============================================

// GET all subscribers
app.get('/subscribers', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('subscribers')
      .select('*')
      .order('joined', { ascending: false });

    if (error) throw error;

    console.log(`📋 GET /subscribers - Loaded ${data.length} subscribers from Supabase`);
    res.json(data);
  } catch (error) {
    console.log('❌ Error loading subscribers:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// POST (save/replace all subscribers)
app.post('/subscribers', async (req, res) => {
  const { subscribers } = req.body;
  if (!subscribers) {
    return res.status(400).json({ success: false, error: 'No subscribers provided' });
  }

  try {
    // Upsert all subscribers (insert or update based on email)
    const { error } = await supabase
      .from('subscribers')
      .upsert(
        subscribers.map(s => ({
          id: s.id,
          email: s.email,
          name: s.name || '',
          status: s.status || 'active',
          joined: s.joined || new Date().toISOString().split('T')[0],
          tags: s.tags || [],
          source: s.source || 'manual'
        })),
        { onConflict: 'email' }
      );

    if (error) throw error;

    console.log(`💾 Saved ${subscribers.length} subscribers to Supabase`);
    res.json({ success: true, count: subscribers.length });
  } catch (error) {
    console.log('❌ Error saving subscribers:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// CAMPAIGN ENDPOINTS
// ============================================

// GET all campaigns
app.get('/campaigns', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('campaigns')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    console.log(`📊 GET /campaigns - Loaded ${data.length} campaigns from Supabase`);
    res.json(data);
  } catch (error) {
    console.log('❌ Error loading campaigns:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// POST (save/replace all campaigns)
app.post('/campaigns', async (req, res) => {
  const { campaigns } = req.body;
  if (!campaigns) {
    return res.status(400).json({ success: false, error: 'No campaigns provided' });
  }

  try {
    // Upsert all campaigns
    const { error } = await supabase
      .from('campaigns')
      .upsert(
        campaigns.map(c => ({
          id: c.id,
          subject: c.subject || '',
          status: c.status || 'draft',
          sent: c.sent || 0,
          opened: c.opened || 0,
          clicked: c.clicked || 0,
          recipients: c.recipients || [],
          html: c.html || '',
          created_at: c.createdAt || c.created_at || new Date().toISOString()
        })),
        { onConflict: 'id' }
      );

    if (error) throw error;

    console.log(`💾 Saved ${campaigns.length} campaigns to Supabase`);
    res.json({ success: true, count: campaigns.length });
  } catch (error) {
    console.log('❌ Error saving campaigns:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET single campaign by ID
app.get('/campaigns/:id', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('campaigns')
      .select('*')
      .eq('id', req.params.id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: 'Campaign not found' });
      }
      throw error;
    }

    res.json(data);
  } catch (error) {
    console.log('❌ Error loading campaign:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// PENDING BATCHES ENDPOINTS
// ============================================

// GET all pending batches
app.get('/pending-batches', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('pending_batches')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    console.log(`⏳ GET /pending-batches - Loaded ${data.length} batches from Supabase`);
    res.json(data);
  } catch (error) {
    console.log('❌ Error loading pending batches:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// POST (save/replace all pending batches)
app.post('/pending-batches', async (req, res) => {
  const { batches } = req.body;
  if (!batches) {
    return res.status(400).json({ success: false, error: 'No batches provided' });
  }

  try {
    // Delete all existing batches and replace with new ones
    await supabase.from('pending_batches').delete().neq('id', 0);

    if (batches.length > 0) {
      const { error } = await supabase
        .from('pending_batches')
        .insert(batches.map(b => ({
          id: b.id,
          campaign_id: b.campaignId || b.campaign_id,
          subscribers: b.subscribers || [],
          subject: b.subject || '',
          html: b.html || '',
          status: b.status || 'pending',
          created_at: b.createdAt || b.created_at || new Date().toISOString()
        })));

      if (error) throw error;
    }

    console.log(`💾 Saved ${batches.length} pending batches to Supabase`);
    res.json({ success: true, count: batches.length });
  } catch (error) {
    console.log('❌ Error saving pending batches:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// TRACKING PIXEL & CLICK TRACKING
// ============================================

// Serve tracking pixel (1x1 transparent GIF)
app.get('/track/open/:campaignId/:recipientEmail', async (req, res) => {
  const { campaignId, recipientEmail } = req.params;
  const email = decodeURIComponent(recipientEmail);

  console.log(`👁️ EMAIL OPENED: ${email} (Campaign: ${campaignId})`);

  // Record the open event (fire and forget - don't block the response)
  recordTrackingEvent('open', campaignId, email).catch(console.error);
  updateCampaignStats(campaignId, email, 'open').catch(console.error);

  // Return 1x1 transparent GIF immediately
  const pixel = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
  res.writeHead(200, {
    'Content-Type': 'image/gif',
    'Content-Length': pixel.length,
    'Cache-Control': 'no-store, no-cache, must-revalidate, private'
  });
  res.end(pixel);
});

// Track link clicks
app.get('/track/click/:campaignId/:recipientEmail', async (req, res) => {
  const { campaignId, recipientEmail } = req.params;
  const { url } = req.query;
  const email = decodeURIComponent(recipientEmail);

  console.log(`🔗 LINK CLICKED: ${email} clicked ${url} (Campaign: ${campaignId})`);

  // Record the click event (fire and forget - don't block the redirect)
  recordTrackingEvent('click', campaignId, email, url).catch(console.error);
  updateCampaignStats(campaignId, email, 'click').catch(console.error);

  // Redirect to actual URL immediately
  if (url) {
    res.redirect(decodeURIComponent(url));
  } else {
    res.redirect('/');
  }
});

async function recordTrackingEvent(type, campaignId, email, url = null) {
  try {
    await supabase
      .from('tracking_events')
      .insert({
        type,
        campaign_id: campaignId,
        email,
        url,
        timestamp: new Date().toISOString()
      });
  } catch (error) {
    console.log('⚠️ Could not record tracking event:', error.message);
  }
}

async function updateCampaignStats(campaignId, email, eventType) {
  try {
    const { data: campaign, error } = await supabase
      .from('campaigns')
      .select('*')
      .eq('id', campaignId)
      .single();

    if (error || !campaign) return;

    const recipients = campaign.recipients || [];
    const recipient = recipients.find(r => r.email && r.email.toLowerCase() === email.toLowerCase());

    if (recipient) {
      if (eventType === 'open' && !recipient.openedAt) {
        recipient.openedAt = new Date().toISOString();
        await supabase
          .from('campaigns')
          .update({
            opened: (campaign.opened || 0) + 1,
            recipients: recipients
          })
          .eq('id', campaignId);
        console.log(`   ✅ Updated open count for campaign ${campaignId}`);
      }
      if (eventType === 'click' && !recipient.clickedAt) {
        recipient.clickedAt = new Date().toISOString();
        await supabase
          .from('campaigns')
          .update({
            clicked: (campaign.clicked || 0) + 1,
            recipients: recipients
          })
          .eq('id', campaignId);
        console.log(`   ✅ Updated click count for campaign ${campaignId}`);
      }
    }
  } catch (error) {
    console.log('⚠️ Could not update campaign stats:', error.message);
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

app.get('/campaign-stats/:campaignId', async (req, res) => {
  const { campaignId } = req.params;

  try {
    const { data: events, error } = await supabase
      .from('tracking_events')
      .select('*')
      .eq('campaign_id', campaignId);

    if (error) throw error;

    const opens = events.filter(e => e.type === 'open');
    const clicks = events.filter(e => e.type === 'click');

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
  } catch (error) {
    console.log('❌ Error loading campaign stats:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// START SERVER
// ============================================

const PORT = process.env.PORT || 3001;
app.listen(PORT, '0.0.0.0', async () => {
  console.log('');
  console.log('🚀 ====================================');
  console.log('🚀 NEWSFLOW SERVER v3.0 - SUPABASE EDITION!');
  console.log('🚀 ====================================');
  console.log(`📍 http://localhost:${PORT}`);
  console.log('');
  console.log('🔌 Connecting to Supabase...');

  // Test Supabase connection
  try {
    const { data, error } = await supabase.from('subscribers').select('count');
    if (error) throw error;
    console.log('✅ Supabase connected! Data is now permanent.');
  } catch (error) {
    console.log('❌ Supabase connection failed:', error.message);
    console.log('   Check your SUPABASE_URL and SUPABASE_KEY settings');
  }

  console.log('');
  console.log('✅ All systems ready!');
  console.log('');
});
