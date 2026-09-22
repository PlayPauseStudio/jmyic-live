import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

admin.initializeApp();

// Health check endpoint
export const health = functions.https.onRequest((req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '3.0'
  });
});

// Keep existing CSV upload function if you have one
// or create a simple one for backup
export const uploadCSV = functions.https.onRequest(async (req, res) => {
  // Enable CORS
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    // This is a backup function - main upload is handled by Next.js API routes
    res.json({ 
      message: 'CSV upload is handled by Next.js API routes',
      success: false 
    });
  } catch (error) {
    console.error('Error in uploadCSV function:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});