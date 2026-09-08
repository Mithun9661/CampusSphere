# STUDENT 360 - Academic Intelligence Platform

STUDENT 360 is a modern, premium web application designed to monitor and analyze student performance, behavior, and extracurricular activities (like GitHub contributions) at an institutional level. Built with React and Vite, the platform features a sleek, futuristic dark-and-orange UI with fluid animations and rich data visualization.

## 🚀 Features

### 🎓 Student Portal
- **Dashboard:** At-a-glance view of academic standing, recent scores, and upcoming exams.
- **GitHub Analysis:** Deep dive into individual coding activity, language distribution, and commit heatmaps.
- **Academic Records:** Detailed tracking of test scores, historical results, and GPA.
- **Behavior & Gamification:** Monitor rule violations and earn achievement badges for academic and extracurricular excellence.

### 🛡️ Admin Portal
- **Institution Overview:** High-level metrics on total students, average scores, and active alerts.
- **Student Management:** Detailed directory of all enrolled students with search and filtering.
- **GitHub Leaderboard:** Track and compare the coding contributions of all linked students across the institution.
- **Exam & Result Management:** Oversee upcoming test schedules and publish results.
- **Disciplinary Action:** Log and monitor student violations with severity tracking.

## 💻 Tech Stack
- **Frontend Framework:** React, Vite
- **Styling:** Tailwind CSS v4, Custom CSS Variables
- **Animations:** Framer Motion
- **Data Visualization:** Recharts
- **Icons:** Lucide React
- **Routing:** React Router DOM

## 🛠️ Getting Started

### Prerequisites
- Node.js (v18 or higher recommended)
- npm or yarn
- Firebase project with Firestore database
- (Optional) Power Automate webhook URL for email notifications
- (Optional) GitHub personal access token for higher API rate limits

### Installation

1. Clone the repository and navigate to the project folder:
   ```bash
   git clone https://github.com/kedhar7781/STUDENT-360.git
   cd STUDENT-360
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Configure environment variables:
   ```bash
   cp .env.example .env.local
   ```

4. Add your Firebase credentials to `.env.local`:
   ```env
   VITE_FIREBASE_API_KEY=your_api_key
   VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
   VITE_FIREBASE_PROJECT_ID=your_project_id
   VITE_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
   VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
   VITE_FIREBASE_APP_ID=your_app_id
   VITE_FIREBASE_MEASUREMENT_ID=your_measurement_id
   VITE_POWER_AUTOMATE_URL=https://prod-xx.centralindia.logic.azure.com/...
   VITE_GITHUB_TOKEN=ghp_your_token (optional)
   ```

5. Start the development server:
   ```bash
   npm run dev
   ```

6. Open your browser and navigate to `http://localhost:5173`.

## 🎨 UI/UX Philosophy
The UI was explicitly designed to break away from traditional, sterile educational software. It utilizes a **Premium Dark/Orange Theme** featuring:
- Glassmorphism effects and ambient glowing backgrounds.
- Pill-shaped components and smooth hover micro-interactions.
- Standardized, spacious grid layouts to ensure dense data readability without cognitive overload.

## 🔥 Firebase Setup

### Creating a Firestore Database

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Create a new project or select an existing one
3. Enable Firestore Database:
   - Click "Firestore Database" in the sidebar
   - Click "Create Database"
   - Choose "Start in production mode"
4. Get your credentials:
   - Go to Project Settings (⚙️ icon)
   - Click "Service Accounts"
   - Download JSON key for backend operations
   - Go to "General" tab and find your web app config

### Firestore Collections

The app expects the following collections:

- **students** - Student profiles with GitHub usernames
- **results** - Exam results and scores
- **exams** - Exam information and schedules
- **examInvites** - Unique exam invitation codes (for preventing duplicates)
- **violations** - Student behavior violations
- **achievements** - Student achievement badges

## � Result Submission API (Electron App Integration)

The platform supports result submission from Electron-based exam applications. Results are automatically stored in Firestore and made available in the admin and student portals.

### API Endpoints

- **POST** `/api/submit-result` - Submit exam results from Electron app
- **GET** `/api/results/student/{rollNo}` - Get results for a specific student
- **GET** `/api/results/exam/{examId}` - Get results for a specific exam

### Result Data Structure

```javascript
{
  rollNo: "12345",           // Student roll number
  studentName: "John Doe",   // Student full name
  subject: "Data Structures", // Exam subject
  marks: 85,                 // Marks obtained
  totalMarks: 100,           // Total marks
  examId: "exam_001",        // Unique exam identifier
  examTitle: "DS Mid-term",  // Exam title
  startTime: "2024-01-15T10:00:00Z", // ISO timestamp
  endTime: "2024-01-15T11:30:00Z",   // ISO timestamp
  answers: [                 // Array of question answers
    {
      questionId: "q1",
      answer: "A",
      correct: true,
      timeSpent: 120
    }
  ],
  violations: [              // Array of exam violations
    {
      type: "tab_switch",
      timestamp: "2024-01-15T10:15:00Z",
      description: "Switched to another tab"
    }
  ]
}
```

### Electron App Integration Example

```javascript
// Submit result from Electron app
const submitResult = async (resultData) => {
  const response = await fetch('https://your-domain.vercel.app/api/submit-result', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(resultData)
  });
  
  const result = await response.json();
  return result; // { success: true, resultId: "..." }
};
```

### Result Processing

- **Automatic Grading:** Grades (A+, A, B+, etc.) are calculated based on percentage
- **Status Calculation:** Pass/Fail status based on 40% threshold
- **Student History:** Results are added to student's exam history
- **Source Tracking:** Results from Electron apps are marked with `source: 'electron_app'`

## �🚀 Deployment

### Deploy to Vercel

1. Connect your GitHub repository to Vercel
2. In Vercel project settings, add environment variables:
   - `VITE_FIREBASE_API_KEY`
   - `VITE_FIREBASE_AUTH_DOMAIN`
   - `VITE_FIREBASE_PROJECT_ID`
   - `VITE_FIREBASE_STORAGE_BUCKET`
   - `VITE_FIREBASE_MESSAGING_SENDER_ID`
   - `VITE_FIREBASE_APP_ID`
   - `VITE_FIREBASE_MEASUREMENT_ID`
   - `VITE_POWER_AUTOMATE_URL` (optional)
   - `VITE_GITHUB_TOKEN` (optional)

3. Push to `main` branch to trigger automatic deployment
4. Vercel will build and deploy your app automatically

## 🔐 Security Features

- **Environment Variables:** Sensitive credentials stored in environment variables, not hardcoded
- **Firebase Security Rules:** Production database requires proper authentication
- **API Security:** Removed insecure SSL bypass, uses standard HTTPS
- **GitHub Token:** Optional token support for higher GitHub API rate limits
- **Power Automate Integration:** Secure webhook-based email notifications

## 📦 Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build locally
- `npm run lint` - Run ESLint

## 📂 Project Structure

```
src/
├── components/
│   ├── shared/          # Reusable components
│   └── ...
├── pages/
│   ├── admin/           # Admin-only pages
│   ├── student/         # Student-only pages
│   └── auth/            # Authentication pages
├── firebase/            # Firebase configuration
├── context/             # React Context (Auth, App state)
├── routes/              # Protected routes
└── utils/               # Helper functions
```

## 🤝 Contributing

Contributions are welcome! Please follow these steps:

1. Create a new branch: `git checkout -b feature/your-feature`
2. Make your changes and commit: `git commit -m 'Add your feature'`
3. Push to the branch: `git push origin feature/your-feature`
4. Open a Pull Request

## 📝 License

This project is licensed under the MIT License.

## 🎯 Future Enhancements

- [ ] Advanced analytics dashboard
- [ ] Machine learning-based student performance predictions
- [ ] Mobile app (React Native)
- [ ] Real-time notifications
- [ ] Custom report generation
- [ ] Multi-language support

## Demo Video
[Go to Video Demo](./Documentation%20%26%20Demo/Video%20Demo)

---

## 💻 Integrated Exam Client (Electron App)

The Student 360 platform integrates seamlessly with a desktop-based exam application. This client application is used by students to securely take exams, while automatically logging violations and submitting grades directly to the database.

* **🎮 Desktop Exam Client Repository:** [STUDENT-360-ELECTRON-APP](https://github.com/kedhar7781/STUDENT-360-ELECTRON-APP)
  *Features include a distraction-free exam window, voice and camera checks, tab-switch proctor alerts, and automatic result submission via HTTP POST endpoints.*

---
