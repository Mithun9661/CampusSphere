# CampusSphere

**Smart Student Academic & Placement Management System**

CampusSphere is a full-stack student and admin platform for bringing academic records, coding activity, achievements, exam information, student analytics, and placement-readiness insights into one dashboard.

## 🌐 Live Project

**CampusSphere:** https://campussphere-mithun9661s-projects.vercel.app

## ✨ Main Features

### 🎓 Student Portal
- Academic dashboard with CGPA/SGPA trend visualization
- Exam Section result synchronization
- E-CAP attendance integration workstream
- Results and subject-performance views
- Student profile and college information
- GitHub and coding-platform analysis
- Achievement/badge tracking
- Placement Index and readiness insights
- Upcoming exam information

### 🛡️ Admin Portal
- Student management and filtering
- Academic profile overview
- Exam and result management
- Reports and analytics
- Student violations management
- GitHub analysis
- Badge/achievement management
- Notifications

## 🧰 Tech Stack

- **Frontend:** React, Vite
- **Authentication:** Firebase Authentication
- **Database:** Cloud Firestore
- **UI:** Tailwind CSS / Custom CSS
- **Animations:** Framer Motion
- **Charts:** Recharts
- **Icons:** Lucide React
- **Routing:** React Router
- **Deployment:** Vercel

## 🚀 Getting Started

```bash
git clone https://github.com/Mithun9661/CampusSphere.git
cd CampusSphere
npm install
npm run dev
```

Create a local `.env` file from `.env.example` and add your own Firebase web configuration. Do not commit passwords, private tokens, service-account files, or student portal credentials.

## 🔐 Security Notes

- Student and admin access is role-protected.
- Portal passwords are used only for the current sync request and are not intended to be persisted in Firestore or local storage.
- Sensitive college-profile responses are sanitized before being returned to the frontend.
- Firebase security rules should be deployed in production before public use.
- Private tokens and credentials must never be stored in `VITE_*` variables if they need to remain secret.

## 📁 Main Project Structure

```text
src/
├── components/
├── context/
├── firebase/
├── layouts/
├── pages/
│   ├── admin/
│   ├── auth/
│   └── student/
├── routes/
└── utils/

api/
├── exam-results.js
├── ecap-connect.js
├── ecap-attendance.js
└── gateway.js
```

## 🎯 Current Focus

CampusSphere is being improved toward a real-data-first production build. Current priorities include:

- Stable live E-CAP attendance synchronization
- Real semester-wise academic graphs
- Removal of remaining placeholder/demo values
- Better placement-readiness analytics
- Production Firebase security hardening
- Mobile/PWA improvements

## 🔭 Future Scope

Future versions can include AI-based academic analysis, low-attendance alerts, company eligibility matching, personalized placement recommendations, automated notifications, advanced admin analytics, mobile/PWA support, and multi-college support.

## 👨‍💻 Repository

GitHub: https://github.com/Mithun9661/CampusSphere

---

**CampusSphere — academics, skills, and placement readiness in one place.**
