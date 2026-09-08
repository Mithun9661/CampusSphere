import admin from "firebase-admin";

import serviceAccount from "./serviceAccountKey.json" with { type: "json" };

import students from "./students.json" with { type: "json" };

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

db.settings({
  ignoreUndefinedProperties: true,
});

// Delay helper
const sleep = (ms) =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Fetch students from Maya Technical Student Info API
 */
const fetchFromMayaAPI = async () => {
  try {
    console.log("📡 Attempting to fetch from Maya Technical API...");
    const response = await fetch(
      "https://api.mayatechnical.com/students", // Replace with actual endpoint
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          // Add any required authentication headers
          // "Authorization": "Bearer YOUR_TOKEN"
        },
        timeout: 30000, // 30 second timeout
      }
    );

    if (!response.ok) {
      throw new Error(`API returned status ${response.status}`);
    }

    const data = await response.json();
    console.log(`✅ Successfully fetched ${data.length || 0} students from Maya API`);
    return data;
  } catch (error) {
    console.error("❌ Maya API failed:", error.message);
    return null;
  }
};

/**
 * Fetch students from Firestore as fallback
 */
const fetchFromFirestore = async () => {
  try {
    console.log("📚 Falling back to Firestore...");
    const snapshot = await db.collection("students").get();
    const firestoreStudents = [];

    snapshot.forEach((doc) => {
      firestoreStudents.push({
        roll_no: doc.data().rollNo,
        first_name: doc.data().name,
        gender: doc.data().gender,
        college: doc.data().college,
        branch: doc.data().branch,
        passout_year: doc.data().passoutYear,
        dob: doc.data().dob,
        section: doc.data().section,
        backlogs: doc.data().backlogs,
        btech: doc.data().btech,
      });
    });

    console.log(`✅ Successfully fetched ${firestoreStudents.length} students from Firestore`);
    return firestoreStudents;
  } catch (error) {
    console.error("❌ Firestore fetch failed:", error.message);
    return null;
  }
};

/**
 * Get student data from API with Firestore fallback
 */
const getStudentData = async () => {
  // Try Maya API first
  let studentData = await fetchFromMayaAPI();

  // If API fails, fall back to Firestore
  if (!studentData || studentData.length === 0) {
    console.log("⚠️  Using local JSON file as primary source...");
    studentData = students;

    // If local file is also empty, try Firestore
    if (!studentData || studentData.length === 0) {
      console.log("⚠️  Local JSON file is empty, attempting Firestore fallback...");
      const firestoreData = await fetchFromFirestore();
      if (firestoreData && firestoreData.length > 0) {
        studentData = firestoreData;
        console.log("✅ Using Firestore data as fallback");
      } else {
        throw new Error("All data sources failed: API, Local JSON, and Firestore are unavailable");
      }
    }
  }

  return studentData;
};

const importStudents = async () => {

  try {

    // Get student data with fallback mechanism
    const students = await getStudentData();

    if (!students || students.length === 0) {
      throw new Error("No student data available from any source");
    }

    // Process each student (only update existing ones with missing emails)
    let totalProcessed = 0;
    let totalUpdated = 0;

    for (const student of students) {

      if (!student.roll_no) continue;

      const rollNo = student.roll_no;

      const studentRef = db
        .collection("students")
        .doc(rollNo);

      // Check if student already exists
      const existingDoc = await studentRef.get();
      const existingData = existingDoc.exists ? existingDoc.data() : null;

      if (existingData) {
        // Student exists - only update if email is missing and we have email data
        if (!existingData.email && student.email) {
          console.log(`📧 Adding email to existing student ${rollNo}: ${student.email}`);
          await studentRef.update({
            email: student.email
          });
          totalUpdated++;
        } else if (!existingData.email && !student.email) {
          console.log(`⏭️  Skipping existing student ${rollNo} (no email available from API)`);
        } else {
          console.log(`⏭️  Skipping existing student ${rollNo} (already has email)`);
        }
      } else {
        // Student doesn't exist - SKIP CREATION to avoid duplicates
        console.log(`⚠️  Skipping new student ${rollNo} (not in database - manual creation required)`);
      }

      totalProcessed++;

      // Progress logging
      if (totalProcessed % 50 === 0) {
        console.log(`${totalProcessed} students processed, ${totalUpdated} updated`);
      }

      // Small delay to avoid rate limiting
      await sleep(100);
    }

    console.log(`✅ Successfully processed ${totalProcessed} students`);
    console.log(`📧 Updated ${totalUpdated} students with emails from Maya API`);
    console.log("🎯 Ready to update when Maya API is available! No fake emails generated.");

  } catch (error) {

    console.error("❌ Import Error:", error);
    process.exit(1);
  }
};

importStudents();