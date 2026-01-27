# NewsFlow Server

Email newsletter server with open/click tracking. Deploy to Render.com for free!

## Features

- ✅ Send emails via Resend
- ✅ Track email opens (pixel tracking)
- ✅ Track link clicks
- ✅ Save campaigns with full history
- ✅ Batch sending (100/day free tier)
- ✅ Subscriber management

## Deploy to Render (Free)

### Step 1: Push to GitHub

1. Create a new GitHub repository called `newsflow-server`
2. Upload these files to the repository

### Step 2: Deploy on Render

1. Go to [render.com](https://render.com) and sign up (free)
2. Click "New +" → "Web Service"
3. Connect your GitHub account
4. Select your `newsflow-server` repository
5. Settings:
   - **Name:** newsflow-server
   - **Environment:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Plan:** Free
6. Click "Create Web Service"

### Step 3: Add Environment Variables

In Render dashboard → Your service → Environment:

| Key | Value |
|-----|-------|
| `RESEND_API_KEY` | `re_PmCdY2sj_J4C62R2H7GkYVjYu3tf9NwQL` |
| `FROM_EMAIL` | `newsletter@craftbrewingsolutions.com.au` |

### Step 4: Get Your Server URL

After deployment, Render gives you a URL like:
```
https://newsflow-server-xxxx.onrender.com
```

This is your permanent server URL!

## Update NewsFlow App

In your NewsFlow app (App.js), change the server URL from:
```
http://localhost:3001
```
to:
```
https://newsflow-server-xxxx.onrender.com
```

## How Tracking Works

### Open Tracking
- Each email contains a tiny invisible image (1x1 pixel)
- When someone opens the email, their email client loads the image
- Our server records who opened it

### Click Tracking
- All links in emails are wrapped with tracking URLs
- When clicked, our server records it then redirects to the actual link

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | GET | Health check |
| `/subscribers` | GET/POST | Manage subscribers |
| `/campaigns` | GET/POST | Manage campaigns |
| `/send-newsletter` | POST | Send emails with tracking |
| `/track/open/:id/:email` | GET | Track opens (auto) |
| `/track/click/:id/:email` | GET | Track clicks (auto) |
| `/campaign-stats/:id` | GET | Get tracking stats |

## Local Development

```bash
npm install
npm start
```

Server runs at http://localhost:3001
