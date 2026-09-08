import admin from "firebase-admin";

import serviceAccount from "./serviceAccountKey.json" with { type: "json" };

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
 * Calculate grade based on percentage
 */
const calculateGrade = (percentage) => {
  if (percentage >= 90) return 'A+';
  if (percentage >= 80) return 'A';
  if (percentage >= 70) return 'B+';
  if (percentage >= 60) return 'B';
  if (percentage >= 50) return 'C';
  if (percentage >= 40) return 'D';
  return 'F';
};

/**
 * Calculate status based on percentage
 */
const calculateStatus = (percentage) => {
  return percentage >= 40 ? 'passed' : 'failed';
};

/**
 * Submit exam result for a student
 */
const submitExamResult = async (resultData) => {
  try {
    const {
      rollNo,
      studentName,
      subject,
      marks,
      totalMarks,
      examId,
      examTitle,
      startTime,
      endTime,
      answers = [],
      violations = []
    } = resultData;

    // Calculate percentage and grade
    const percentage = ((marks / totalMarks) * 100).toFixed(2);
    const grade = calculateGrade(parseFloat(percentage));
    const status = calculateStatus(parseFloat(percentage));

    // Create result document
    const resultDoc = {
      rollNo: rollNo.toUpperCase(),
      studentName,
      subject,
      marks: parseInt(marks),
      totalMarks: parseInt(totalMarks),
      percentage: parseFloat(percentage),
      grade,
      status,
      examId,
      examTitle,
      startTime: new Date(startTime),
      endTime: new Date(endTime),
      submittedAt: admin.firestore.FieldValue.serverTimestamp(),
      answers,
      violations,
      source: 'electron_app'
    };

    // Add to results collection
    const docRef = await db.collection('results').add(resultDoc);

    // Update student's exam history
    const studentRef = db.collection('students').doc(rollNo.toUpperCase());
    const studentDoc = await studentRef.get();

    if (studentDoc.exists) {
      const currentHistory = studentDoc.data().examHistory || [];
      currentHistory.push({
        examId,
        examTitle,
        subject,
        marks: parseInt(marks),
        totalMarks: parseInt(totalMarks),
        percentage: parseFloat(percentage),
        grade,
        status,
        submittedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      await studentRef.update({
        examHistory: currentHistory,
        lastExamDate: admin.firestore.FieldValue.serverTimestamp()
      });
    }

    console.log(`✅ Result submitted for ${rollNo} - ${subject}: ${marks}/${totalMarks} (${percentage}%)`);
    return { success: true, resultId: docRef.id };

  } catch (error) {
    console.error('❌ Error submitting result:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Batch submit multiple results
 */
const submitBatchResults = async (resultsArray) => {
  const results = [];

  for (const result of resultsArray) {
    const result = await submitExamResult(result);
    results.push(result);

    // Small delay to avoid overwhelming Firestore
    await sleep(100);
  }

  return results;
};

/**
 * Get results for a specific student
 */
const getStudentResults = async (rollNo) => {
  try {
    const snapshot = await db.collection('results')
      .where('rollNo', '==', rollNo.toUpperCase())
      .orderBy('submittedAt', 'desc')
      .get();

    const results = [];
    snapshot.forEach(doc => {
      results.push({ id: doc.id, ...doc.data() });
    });

    return results;
  } catch (error) {
    console.error('❌ Error fetching student results:', error);
    return [];
  }
};

/**
 * Get results for a specific exam
 */
const getExamResults = async (examId) => {
  try {
    const snapshot = await db.collection('results')
      .where('examId', '==', examId)
      .orderBy('submittedAt', 'desc')
      .get();

    const results = [];
    snapshot.forEach(doc => {
      results.push({ id: doc.id, ...doc.data() });
    });

    return results;
  } catch (error) {
    console.error('❌ Error fetching exam results:', error);
    return [];
  }
};

// Export functions for use in other scripts or as a module
export {
  submitExamResult,
  submitBatchResults,
  getStudentResults,
  getExamResults,
  calculateGrade,
  calculateStatus
};

// If run directly, expect command line arguments
if (import.meta.url === `file://${process.argv[1]}`) {
  const command = process.argv[2];

  if (command === 'submit-result') {
    // Example: node importResults.js submit-result '{"rollNo":"12345","studentName":"John Doe","subject":"Data Structures","marks":85,"totalMarks":100,"examId":"exam001","examTitle":"DS Exam","startTime":"2024-01-01T10:00:00Z","endTime":"2024-01-01T11:00:00Z"}'
    const resultData = JSON.parse(process.argv[3]);
    submitExamResult(resultData).then(result => {
      console.log('Result:', result);
      process.exit(0);
    });
  } else if (command === 'get-student-results') {
    // Example: node importResults.js get-student-results "12345"
    const rollNo = process.argv[3];
    getStudentResults(rollNo).then(results => {
      console.log(`Results for ${rollNo}:`, results);
      process.exit(0);
    });
  } else if (command === 'get-exam-results') {
    // Example: node importResults.js get-exam-results "exam001"
    const examId = process.argv[3];
    getExamResults(examId).then(results => {
      console.log(`Results for exam ${examId}:`, results);
      process.exit(0);
    });
  } else {
    console.log('Usage:');
    console.log('  node importResults.js submit-result <json_result_data>');
    console.log('  node importResults.js get-student-results <rollNo>');
    console.log('  node importResults.js get-exam-results <examId>');
    process.exit(1);
  }
}