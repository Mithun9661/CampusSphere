import admin from "firebase-admin";

import serviceAccount from "./serviceAccountKey.json" with { type: "json" };

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

const deleteCollection = async () => {

  try {

    const snapshot = await db.collection("students").get();

    const batchSize = 500;

    let batch = db.batch();

    let count = 0;

    snapshot.docs.forEach((doc) => {

      batch.delete(doc.ref);

      count++;

      // Firestore batch limit
      if (count % batchSize === 0) {

        batch.commit();

        batch = db.batch();
      }
    });

    await batch.commit();

    console.log("Students collection deleted successfully");

  } catch (error) {

    console.error(error);
  }
};

deleteCollection();