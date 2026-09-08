import admin from "firebase-admin";
import serviceAccount from "./serviceAccountKey.json" with { type: "json" };

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

// Update existing students to add email addresses
const updateStudentEmails = async () => {
  try {
    console.log("🔄 Updating existing students with email addresses...");

    const studentsRef = db.collection("students");
    const snapshot = await studentsRef.get();

    let updatedCount = 0;

    for (const doc of snapshot.docs) {
      const studentData = doc.data();

      // Check if email is missing
      if (!studentData.email && studentData.rollNo) {
        const email = `${studentData.rollNo.toLowerCase()}@s360.edu`;

        await doc.ref.update({
          email: email
        });

        updatedCount++;
        console.log(`✅ Updated ${studentData.rollNo} with email: ${email}`);
      }
    }

    console.log(`🎯 Successfully updated ${updatedCount} students with email addresses`);

  } catch (error) {
    console.error("❌ Update failed:", error);
  }
};

updateStudentEmails();