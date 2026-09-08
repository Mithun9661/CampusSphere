import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AppProvider } from './context/AppContext';
import { ProtectedRoute } from './routes/ProtectedRoute';
import DashboardLayout from './layouts/DashboardLayout';
import LoginPage from './pages/auth/LoginPage';
import RegisterPage from './pages/auth/RegisterPage';
import { ErrorBoundary } from './components/shared/ErrorBoundary';
import LoadingScreen from './components/shared/LoadingScreen';

// Student pages
import StudentDashboard from './pages/student/Dashboard';
import UpcomingExamsPage from './pages/student/UpcomingExams';
import ResultsPage from './pages/student/Results';
import ProfilePage from './pages/student/Profile';
import GitHubAnalysisPage from './pages/student/GitHubAnalysis';
import ViolationsPage from './pages/student/Violations';
import AchievementsPage from './pages/student/Achievements';

// Admin pages
import AdminDashboard from './pages/admin/Dashboard';
import AdminStudents from './pages/admin/Students';
import AdminExams from './pages/admin/Exams';
import AdminResults from './pages/admin/Results';
import AdminReports from './pages/admin/Reports';
import AdminViolations from './pages/admin/Violations';
import AdminGitHub from './pages/admin/GitHubAnalysis';
import AdminBadges from './pages/admin/Badges';
import AdminNotifications from './pages/admin/Notifications';

function AppContent() {
  const { loading } = useAuth();

  if (loading) {
    return <LoadingScreen />;
  }

  return (
    <Routes>
      {/* Public */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/" element={<Navigate to="/login" replace />} />

      {/* Student routes */}
      <Route
        path="/student"
        element={
          <ProtectedRoute allowedRole="student">
            <DashboardLayout title="Student Portal" />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="dashboard" replace />} />
        <Route path="dashboard" element={<StudentDashboard />} />
        <Route path="exams" element={<UpcomingExamsPage />} />
        <Route path="results" element={<ResultsPage />} />
        <Route path="profile" element={<ErrorBoundary><ProfilePage /></ErrorBoundary>} />
        <Route path="github" element={<GitHubAnalysisPage />} />
        <Route path="violations" element={<ViolationsPage />} />
        <Route path="achievements" element={<AchievementsPage />} />
      </Route>

      {/* Admin routes */}
      <Route
        path="/admin"
        element={
          <ProtectedRoute allowedRole="admin">
            <DashboardLayout title="Admin Portal" />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="dashboard" replace />} />
        <Route path="dashboard" element={<AdminDashboard />} />
        <Route path="students" element={<AdminStudents />} />
        <Route path="exams" element={<AdminExams />} />
        <Route path="results" element={<AdminResults />} />
        <Route path="reports" element={<AdminReports />} />
        <Route path="violations" element={<AdminViolations />} />
        <Route path="github" element={<AdminGitHub />} />
        <Route path="badges" element={<AdminBadges />} />
        <Route path="achievements" element={<AdminBadges />} />
        <Route path="notifications" element={<AdminNotifications />} />
      </Route>

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppProvider>
          <Toaster
            position="top-right"
            toastOptions={{
              duration: 3000,
              style: {
                background: '#121212',
                color: '#fafafa',
                border: '1px solid #27272a',
                borderRadius: '12px',
                fontSize: '13px',
                fontFamily: 'Inter, sans-serif',
              },
              success: {
                iconTheme: { primary: '#10b981', secondary: '#121212' },
              },
              error: {
                iconTheme: { primary: '#ef4444', secondary: '#121212' },
              },
            }}
          />
          <AppContent />
        </AppProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
