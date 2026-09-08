import admin from 'firebase-admin';

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

// Initialize Firebase Admin (Make sure your serviceAccountKey.json is in the scripts folder)
try {
  const serviceAccount = require('./serviceAccountKey.json');
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
  }
} catch (err) {
  console.error("❌ Error: Could not load serviceAccountKey.json");
  console.error("Please place your Firebase Admin SDK private key in the scripts folder as 'serviceAccountKey.json'");
  process.exit(1);
}

const db = admin.firestore();
db.settings({ ignoreUndefinedProperties: true });

const GITHUB_TOKEN = process.env.GITHUB_TOKEN || ''; // Optional: Add a Personal Access Token to increase GitHub rate limit

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function fetchGitHubData(username) {
  const headers = {};
  if (GITHUB_TOKEN) {
    headers['Authorization'] = `token ${GITHUB_TOKEN}`;
  }

  try {
    const [profileRes, reposRes] = await Promise.all([
      fetch(`https://api.github.com/users/${username}`, { headers }),
      fetch(`https://api.github.com/users/${username}/repos?per_page=100&sort=updated`, { headers })
    ]);

    if (!profileRes.ok || !reposRes.ok) {
      if (profileRes.status === 403 || reposRes.status === 403) {
        console.warn(`⚠️ GitHub API rate limit hit for ${username}.`);
      }
      return null;
    }

    const profile = await profileRes.json();
    const repos = await reposRes.json();

    // Calculate metrics
    let totalStars = 0;
    const languages = {};

    repos.forEach(repo => {
      totalStars += repo.stargazers_count;
      if (repo.language) {
        languages[repo.language] = (languages[repo.language] || 0) + 1;
      }
    });

    const topLanguages = Object.entries(languages)
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({ name, count }))
      .slice(0, 5);

    return {
      followers: profile.followers,
      following: profile.following,
      publicRepos: profile.public_repos,
      totalStars,
      topLanguages,
      avatarUrl: profile.avatar_url,
      lastSynced: new Date().toISOString()
    };
  } catch (error) {
    console.error(`Error fetching GitHub data for ${username}:`, error.message);
    return null;
  }
}

async function syncAllStudents() {
  console.log(`\n🚀 Starting Daily GitHub Sync at ${new Date().toLocaleString()}`);
  
  try {
    const snapshot = await db.collection('students').get();
    
    let processed = 0;
    let updated = 0;

    for (const doc of snapshot.docs) {
      const student = doc.data();
      processed++;

      if (student.githubUsername) {
        console.log(`[${processed}/${snapshot.size}] Fetching GitHub data for ${student.githubUsername}...`);
        
        const githubStats = await fetchGitHubData(student.githubUsername);
        
        if (githubStats) {
          try {
            await db.collection('students').doc(doc.id).update({
              githubStats: githubStats
            });
            updated++;
            console.log(`✅ Updated ${student.githubUsername}`);
          } catch (firebaseErr) {
            console.error(`❌ Failed to update Firestore for ${student.githubUsername}:`, firebaseErr.message);
            if (firebaseErr.message.includes('resource-exhausted')) {
              console.error('🚨 FIREBASE QUOTA EXCEEDED! Stopping sync.');
              return;
            }
          }
        }
        
        // Sleep for 2 seconds between GitHub API calls to prevent rate limiting
        await sleep(2000);
      }
    }
    
    console.log(`\n🎉 Sync Complete! Processed ${processed} students, updated ${updated} GitHub profiles.`);
  } catch (error) {
    console.error('❌ Error fetching students from Firestore:', error.message);
  }
}

// Run the sync process daily
async function startDailyCron() {
  console.log("==========================================");
  console.log("🐙 GitHub Auto-Sync Service Started");
  console.log("==========================================");
  if (!GITHUB_TOKEN) {
    console.log("⚠️ WARNING: No GITHUB_TOKEN provided. You are limited to 60 requests/hour by GitHub.");
  } else {
    console.log("✅ GITHUB_TOKEN loaded. High rate limit enabled.");
  }
  
  // Infinite loop with 24 hour sleep
  while (true) {
    await syncAllStudents();
    
    const oneDayInMs = 24 * 60 * 60 * 1000;
    console.log(`\n💤 Sleeping for 24 hours. Next sync at ${new Date(Date.now() + oneDayInMs).toLocaleString()}...`);
    await sleep(oneDayInMs);
  }
}

// Start the process
startDailyCron();
