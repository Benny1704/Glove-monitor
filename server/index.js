// Node.js server for handling uploads and push notifications
require('dotenv').config();
const express = require('express');
const multer = require('multer');
const webpush = require('web-push');
const cors = require('cors');
const fs = require('fs').promises;
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB max file size
  },
});

// CORS configuration
app.use(cors());
app.use(express.json());

// Storage directory for uploaded files
const UPLOAD_DIR = path.join(__dirname, 'uploads');

// Ensure upload directory exists
async function ensureUploadDir() {
  try {
    await fs.mkdir(UPLOAD_DIR, { recursive: true });
  } catch (error) {
    console.error('Failed to create upload directory:', error);
  }
}

ensureUploadDir();

// VAPID keys for push notifications
// Generate these with: npx web-push generate-vapid-keys
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || 'YOUR_PUBLIC_KEY';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || 'YOUR_PRIVATE_KEY';
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:your-email@example.com';

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

// In-memory storage for push subscriptions (use database in production)
const pushSubscriptions = new Map();

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

// Get VAPID public key
app.get('/api/push/public-key', (req, res) => {
  res.json({ publicKey: VAPID_PUBLIC_KEY });
});

// Subscribe to push notifications
app.post('/api/push/subscribe', (req, res) => {
  const subscription = req.body;
  
  if (!subscription || !subscription.endpoint) {
    return res.status(400).json({ error: 'Invalid subscription' });
  }

  // Store subscription (use database in production)
  pushSubscriptions.set(subscription.endpoint, subscription);

  console.log('New push subscription:', subscription.endpoint);
  
  res.json({ success: true, message: 'Subscribed successfully' });
});

// Unsubscribe from push notifications
app.delete('/api/push/subscribe', (req, res) => {
  const { endpoint } = req.body;

  if (!endpoint) {
    return res.status(400).json({ error: 'Endpoint required' });
  }

  pushSubscriptions.delete(endpoint);
  
  console.log('Unsubscribed:', endpoint);
  
  res.json({ success: true, message: 'Unsubscribed successfully' });
});

// Send push notification to all subscribers
async function sendPushNotification(payload) {
  const notifications = [];

  for (const [endpoint, subscription] of pushSubscriptions) {
    try {
      await webpush.sendNotification(subscription, JSON.stringify(payload));
      console.log('Push sent to:', endpoint);
    } catch (error) {
      console.error('Failed to send push to:', endpoint, error);
      
      // Remove invalid subscriptions
      if (error.statusCode === 410) {
        pushSubscriptions.delete(endpoint);
      }
    }
  }

  return notifications;
}

// Upload endpoint
app.post('/api/upload', upload.fields([
  { name: 'media', maxCount: 10 },
  { name: 'thumbnails', maxCount: 10 }
]), async (req, res) => {
  try {
    const { recordId, timestamp, form, location } = req.body;

    if (!recordId) {
      return res.status(400).json({ error: 'Record ID required' });
    }

    console.log('Receiving upload for record:', recordId);

    // Create directory for this record
    const recordDir = path.join(UPLOAD_DIR, recordId);
    await fs.mkdir(recordDir, { recursive: true });

    // Save media files
    const mediaFiles = req.files.media || [];
    const thumbnails = req.files.thumbnails || [];

    for (let i = 0; i < mediaFiles.length; i++) {
      const media = mediaFiles[i];
      const filePath = path.join(recordDir, media.originalname);
      await fs.writeFile(filePath, media.buffer);
      console.log('Saved media:', media.originalname);
    }

    // Save thumbnails
    for (let i = 0; i < thumbnails.length; i++) {
      const thumb = thumbnails[i];
      const filePath = path.join(recordDir, thumb.originalname);
      await fs.writeFile(filePath, thumb.buffer);
      console.log('Saved thumbnail:', thumb.originalname);
    }

    // Save metadata
    const metadata = {
      recordId,
      timestamp: parseInt(timestamp),
      form: JSON.parse(form || '{}'),
      location: location ? JSON.parse(location) : null,
      uploadedAt: Date.now(),
      mediaCount: mediaFiles.length,
    };

    const metadataPath = path.join(recordDir, 'metadata.json');
    await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2));

    // Send push notification
    await sendPushNotification({
      title: 'Record Synced',
      body: `Record ${recordId.slice(0, 8)} uploaded successfully`,
      data: { recordId },
    });

    res.json({
      success: true,
      recordId,
      message: 'Upload successful',
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Test push notification endpoint
app.post('/api/push/test', async (req, res) => {
  const { title, body } = req.body;

  try {
    await sendPushNotification({
      title: title || 'Test Notification',
      body: body || 'This is a test push notification',
    });

    res.json({ success: true, message: 'Push notification sent' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// List uploaded records
app.get('/api/records', async (req, res) => {
  try {
    const records = [];
    const dirs = await fs.readdir(UPLOAD_DIR);

    for (const dir of dirs) {
      const metadataPath = path.join(UPLOAD_DIR, dir, 'metadata.json');
      try {
        const metadata = await fs.readFile(metadataPath, 'utf-8');
        records.push(JSON.parse(metadata));
      } catch (error) {
        // Skip if metadata doesn't exist
      }
    }

    res.json({ records });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Upload endpoint: http://localhost:${PORT}/api/upload`);
  console.log(`Push endpoint: http://localhost:${PORT}/api/push/subscribe`);
  console.log('\nVAPID Keys:');
  console.log('Public:', VAPID_PUBLIC_KEY);
  console.log('Private:', VAPID_PRIVATE_KEY);
  console.log('\nTo generate new VAPID keys, run:');
  console.log('npx web-push generate-vapid-keys');
});