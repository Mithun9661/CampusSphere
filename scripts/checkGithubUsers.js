import admin from 'firebase-admin';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const serviceAccount = require('./serviceAccountKey.json');
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();
async function run() {
  const snapshot = await db.collection('students').get();
  console.log('Found ' + snapshot.size + ' students');
  let hasGithub = 0;
  snapshot.forEach(doc => {
    if (doc.data().githubUsername) hasGithub++;
  });
  console.log('Students with githubUsername: ' + hasGithub);
}
run().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
