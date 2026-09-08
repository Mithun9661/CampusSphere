// Example: How to submit exam results from Electron app

const submitExamResult = async (resultData) => {
  try {
    const response = await fetch('https://adityastudent360.vercel.app/api/submit-result', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(resultData)
    });

    const result = await response.json();
    return result;
  } catch (error) {
    console.error('Error submitting result:', error);
    return { success: false, error: error.message };
  }
};

// Example result data structure
const sampleResultData = {
  rollNo: "12345",
  studentName: "John Doe",
  subject: "Data Structures",
  marks: 85,
  totalMarks: 100,
  examId: "exam_001",
  examTitle: "Data Structures Mid-term Exam",
  startTime: "2024-01-15T10:00:00Z",
  endTime: "2024-01-15T11:30:00Z",
  answers: [
    { questionId: "q1", answer: "A", correct: true, timeSpent: 120 },
    { questionId: "q2", answer: "B", correct: false, timeSpent: 95 },
    // ... more answers
  ],
  violations: [
    { type: "tab_switch", timestamp: "2024-01-15T10:15:00Z", description: "Switched to another tab" },
    // ... more violations
  ]
};

// Usage
submitExamResult(sampleResultData).then(result => {
  if (result.success) {
    console.log('Result submitted successfully!', result.resultId);
  } else {
    console.error('Failed to submit result:', result.error);
  }
});

// API Endpoints:
// POST /api/submit-result - Submit a single exam result
// GET /api/results/student/{rollNo} - Get all results for a student
// GET /api/results/exam/{examId} - Get all results for an exam

export { submitExamResult };