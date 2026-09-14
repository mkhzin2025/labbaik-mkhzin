import { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import LoginPage from './pages/LoginPage';
import DashboardLayout from './components/DashboardLayout';
import DashboardHome from './pages/DashboardHome';
import ConversationsPage from './pages/ConversationsPage';
import SettingsPage from './pages/SettingsPage';
import ChannelsPage from './pages/ChannelsPage';
import ReviewsPage from './pages/ReviewsPage';
import CustomersPage from './pages/CustomersPage';
import FlowsPage from './pages/FlowsPage';
import FlowEditorPage from './pages/FlowEditorPage';
import { ToastProvider } from './components/Toast';
import './index.css';

// Simple Guard Component
const PrivateRoute = ({ children }: { children: React.ReactNode }) => {
  const isAuthenticated = !!localStorage.getItem('access_token');
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" />;
};

function App() {
  useEffect(() => {
    const savedTheme = localStorage.getItem('theme') || 'dark';
    document.documentElement.setAttribute('data-theme', savedTheme);
  }, []);
  return (
    <ToastProvider>
      <Router>
        <Routes>
          {/* Public Routes */}
          <Route path="/login" element={<LoginPage />} />

          {/* Protected Dashboard Routes */}
          <Route
            path="/dashboard/*"
            element={
              <PrivateRoute>
                <DashboardLayout>
                  <Routes>
                    <Route index element={<DashboardHome />} />
                    <Route path="conversations" element={<ConversationsPage />} />
                    <Route path="customers" element={<CustomersPage />} />
                    <Route path="flows" element={<FlowsPage />} />
                    <Route path="flows/:id" element={<FlowEditorPage />} />
                    <Route path="channels" element={<ChannelsPage />} />
                    <Route path="reviews" element={<ReviewsPage />} />
                    <Route path="analytics" element={<div className="p-16 text-3xl font-black text-center text-white">التقارير المتقدمة <br /><span className="text-gray-500 text-sm font-bold block mt-4 italic opacity-50">قريباً في المرحلة الثانية</span></div>} />
                    <Route path="settings" element={<SettingsPage />} />
                  </Routes>
                </DashboardLayout>
              </PrivateRoute>
            }
          />

          {/* Default Redirect */}
          <Route path="/" element={<Navigate to="/login" replace />} />
        </Routes>
      </Router>
    </ToastProvider>
  );
}

export default App;


