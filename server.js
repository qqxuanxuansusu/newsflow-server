// ============================================
// NEWSFLOW SERVER - SUPABASE EDITION
// ============================================

const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM_EMAIL = process.env.FROM_EMAIL || 'newsletter@craftbrewingsolutions.com.au';
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function sendEmail(to, subject, html) {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM_EMAIL, to, subject, html })
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || 'Failed to send email');
  return data;
}

function wait(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

app.get('/', (req, res) => res.json({ status: 'ok', app: 'NewsFlow Server', version: '3.2.0' }));
app.get('/health', (req, res) => res.json({ status: 'healthy' }));

// ============================================
// SUBSCRIBERS
// ============================================

app.get('/subscribers', async (req, res) => {
  try {
    const { data, error } = await supabase.from('subscribers').select('*').order('joined', { ascending: false });
    if (error) throw error;
    res.json(data);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

app.post('/subscribers', async (req, res) => {
  const { subscribers } = req.body;
  if (!subscribers) return res.status(400).json({ success: false, error: 'No subscribers provided' });
  try {
    const { error } = await supabase.from('subscribers').upsert(
      subscribers.map(s => ({ id: s.id, email: s.email, name: s.name || '', status: s.status || 'active', joined: s.joined || new Date().toISOString().split('T')[0], tags: s.tags || [], source: s.source || 'manual' })),
      { onConflict: 'email' }
    );
    if (error) throw error;
    res.json({ success: true, count: subscribers.length });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// ============================================
// CAMPAIGNS
// ============================================

app.get('/campaigns', async (req, res) => {
  try {
    const { data, error } = await supabase.from('campaigns').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    res.json(data);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

app.post('/campaigns', async (req, res) => {
  const { campaigns } = req.body;
  if (!campaigns) return res.status(400).json({ success: false, error: 'No campaigns provided' });
  try {
    const { error } = await supabase.from('campaigns').upsert(
      campaigns.map(c => ({ id: String(c.id), subject: c.subject || '', status: c.status || 'draft', sent: c.sent || 0, opened: c.opened || 0, clicked: c.clicked || 0, recipients: c.recipients || [], html: c.html || '', created_at: c.createdAt || c.created_at || new Date().toISOString() })),
      { onConflict: 'id' }
    );
    if (error) throw error;
    res.json({ success: true, count: campaigns.length });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

app.get('/campaigns/:id', async (req, res) => {
  try {
    const { data, error } = await supabase.from('campaigns').select('*').eq('id', req.params.id).single();
    if (error) { if (error.code === 'PGRST116') return res.status(404).json({ error: 'Not found' }); throw error; }
    res.json(data);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

// ============================================
// DRAFT (saved to Supabase — works across all browsers)
// ============================================

app.get('/draft', async (req, res) => {
  try {
    const { data, error } = await supabase.from('drafts').select('*').eq('id', 'main-draft').single();
    if (error && error.code === 'PGRST116') return res.json(null);
    if (error) throw error;
    res.json(data);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

app.post('/draft', async (req, res) => {
  const { subject, preheader, blocks } = req.body;
  try {
    const { error } = await supabase.from('drafts').upsert(
      { id: 'main-draft', subject: subject || '', preheader: preheader || '', blocks: blocks || [], updated_at: new Date().toISOString() },
      { onConflict: 'id' }
    );
    if (error) throw error;
    res.json({ success: true });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

app.delete('/draft', async (req, res) => {
  try {
    await supabase.from('drafts').delete().eq('id', 'main-draft');
    res.json({ success: true });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// ============================================
// PENDING BATCHES
// ============================================

app.get('/pending-batches', async (req, res) => {
  try {
    const { data, error } = await supabase.from('pending_batches').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    const mappedData = data.map(row => ({ id: row.id, subject: row.subject, html: row.html, batches: row.subscribers || [], createdAt: row.created_at, totalBatches: (row.subscribers || []).length, sentBatches: 0 }));
    res.json(mappedData);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

app.post('/pending-batches', async (req, res) => {
  const { batches } = req.body;
  if (!batches) return res.status(400).json({ success: false, error: 'No batches provided' });
  try {
    await supabase.from('pending_batches').delete().not('id', 'is', null);
    if (batches.length > 0) {
      const { error } = await supabase.from('pending_batches').insert(
        batches.map(b => ({ id: String(b.id), campaign_id: String(b.id), subscribers: b.batches || [], subject: b.subject || '', html: b.html || '', status: 'pending', created_at: b.createdAt || new Date().toISOString() }))
      );
      if (error) throw error;
    }
    res.json({ success: true, count: batches.length });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// ============================================
// TRACKING
// ============================================

app.get('/track/open/:campaignId/:recipientEmail', async (req, res) => {
  const email = decodeURIComponent(req.params.recipientEmail);
  recordTrackingEvent('open', req.params.campaignId, email).catch(console.error);
  updateCampaignStats(req.params.campaignId, email, 'open').catch(console.error);
  const pixel = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
  res.writeHead(200, { 'Content-Type': 'image/gif', 'Content-Length': pixel.length, 'Cache-Control': 'no-store' });
  res.end(pixel);
});

app.get('/track/click/:campaignId/:recipientEmail', async (req, res) => {
  const email = decodeURIComponent(req.params.recipientEmail);
  const { url } = req.query;
  recordTrackingEvent('click', req.params.campaignId, email, url).catch(console.error);
  updateCampaignStats(req.params.campaignId, email, 'click').catch(console.error);
  res.redirect(url ? decodeURIComponent(url) : '/');
});

async function recordTrackingEvent(type, campaignId, email, url = null) {
  try {
    await supabase.from('tracking_events').insert({ type, campaign_id: campaignId, email, url, timestamp: new Date().toISOString() });
  } catch (error) { console.log('⚠️ Tracking error:', error.message); }
}

async function updateCampaignStats(campaignId, email, eventType) {
  try {
    const { data: campaign, error } = await supabase.from('campaigns').select('*').eq('id', campaignId).single();
    if (error || !campaign) return;
    const recipients = campaign.recipients || [];
    const recipient = recipients.find(r => r.email && r.email.toLowerCase() === email.toLowerCase());
    if (recipient) {
      if (eventType === 'open' && !recipient.openedAt) {
        recipient.openedAt = new Date().toISOString();
        await supabase.from('campaigns').update({ opened: (campaign.opened || 0) + 1, recipients }).eq('id', campaignId);
      }
      if (eventType === 'click' && !recipient.clickedAt) {
        recipient.clickedAt = new Date().toISOString();
        await supabase.from('campaigns').update({ clicked: (campaign.clicked || 0) + 1, recipients }).eq('id', campaignId);
      }
    }
  } catch (error) { console.log('⚠️ Stats error:', error.message); }
}

// ============================================
// EMAIL SENDING
// ============================================

app.post('/send-email', async (req, res) => {
  const { to, subject, html } = req.body;
  try {
    const data = await sendEmail(to, subject, html);
    res.json({ success: true, data });
  } catch (error) { res.json({ success: false, error: error.message }); }
});

app.post('/send-newsletter', async (req, res) => {
  const { subscribers, subject, html, campaignId, serverUrl } = req.body;
  console.log(`\n📧 Sending to ${subscribers.length} subscribers | Campaign: ${campaignId}`);
  let successCount = 0, failCount = 0;
  const errors = [];
  for (let i = 0; i < subscribers.length; i++) {
    const subscriber = subscribers[i];
    try {
      const trackedHtml = addTrackingToEmail(html, campaignId, subscriber.email, serverUrl);
      await sendEmail(subscriber.email, subject, trackedHtml);
      successCount++;
      console.log(`✅ [${i + 1}/${subscribers.length}] ${subscriber.email}`);
    } catch (error) {
      failCount++;
      errors.push({ email: subscriber.email, error: error.message });
      console.log(`❌ [${i + 1}/${subscribers.length}] ${subscriber.email}`);
    }
    if (i < subscribers.length - 1) await wait(600);
  }
  console.log(`\n📊 Done! Sent: ${successCount}, Failed: ${failCount}\n`);
  res.json({ success: true, sent: successCount, failed: failCount, errors });
});

function addTrackingToEmail(html, campaignId, recipientEmail, serverUrl) {
  const encodedEmail = encodeURIComponent(recipientEmail);
  const baseUrl = serverUrl || process.env.SERVER_URL || 'http://localhost:3001';
  const pixel = `<img src="${baseUrl}/track/open/${campaignId}/${encodedEmail}" width="1" height="1" style="display:none;" alt="" />`;
  let tracked = html.includes('</body>') ? html.replace('</body>', `${pixel}</body>`) : html + pixel;
  tracked = tracked.replace(/href="(https?:\/\/[^"]+)"/g, (match, url) => {
    if (url.startsWith('mailto:') || url.startsWith('tel:')) return match;
    return `href="${baseUrl}/track/click/${campaignId}/${encodedEmail}?url=${encodeURIComponent(url)}"`;
  });
  return tracked;
}

// ============================================
// IMAGE UPLOAD
// ============================================

app.post('/upload-image', async (req, res) => {
  const { base64, filename } = req.body;
  if (!base64 || !filename) return res.status(400).json({ error: 'Missing base64 or filename' });
  try {
    const matches = base64.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
    if (!matches) return res.status(400).json({ error: 'Invalid base64 format' });
    const buffer = Buffer.from(matches[2], 'base64');
    const uniqueFilename = `${Date.now()}-${filename.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const { error } = await supabase.storage.from('newsletter-images').upload(uniqueFilename, buffer, { contentType: matches[1], upsert: false });
    if (error) throw error;
    const { data: { publicUrl } } = supabase.storage.from('newsletter-images').getPublicUrl(uniqueFilename);
    res.json({ success: true, url: publicUrl });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

// ============================================
// CAMPAIGN STATS
// ============================================

app.get('/campaign-stats/:campaignId', async (req, res) => {
  try {
    const { data: events, error } = await supabase.from('tracking_events').select('*').eq('campaign_id', req.params.campaignId);
    if (error) throw error;
    const opens = events.filter(e => e.type === 'open');
    const clicks = events.filter(e => e.type === 'click');
    res.json({ campaignId: req.params.campaignId, totalOpens: opens.length, uniqueOpens: [...new Set(opens.map(e => e.email))].length, totalClicks: clicks.length, uniqueClicks: [...new Set(clicks.map(e => e.email))].length, openedBy: [...new Set(opens.map(e => e.email))], clickedBy: [...new Set(clicks.map(e => e.email))] });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

app.post('/webhook/resend', (req, res) => res.json({ received: true }));

// ============================================
// START SERVER
// ============================================

const PORT = process.env.PORT || 3001;
app.listen(PORT, '0.0.0.0', async () => {
  console.log(`\n🚀 NewsFlow Server v3.2 running on port ${PORT}`);
  try {
    const { error } = await supabase.from('subscribers').select('count');
    if (error) throw error;
    console.log('✅ Supabase connected!\n');
  } catch (error) {
    console.log('❌ Supabase connection failed:', error.message);
  }
});
