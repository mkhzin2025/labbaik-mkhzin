import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import DashboardLayout from './components/DashboardLayout';
import DashboardHome from './pages/DashboardHome';
import ConversationsPage from './pages/ConversationsPage';
import SettingsPage from './pages/SettingsPage';
import ChannelsPage from './pages/ChannelsPage';
import ReviewsPage from './pages/ReviewsPage';
import CustomersPage from './pages/CustomersPage';
import FlowsPage from './pages/FlowsPage';
import FlowEditorPage from './pages/FlowEditorPage';
import WhatsAppTemplatesPage from './pages/WhatsAppTemplatesPage';
import BillingPage from './pages/BillingPage';
import BillingAdminPage from './pages/BillingAdminPage';
import PrivacyPolicyPage from './pages/PrivacyPolicyPage';
import TermsPage from './pages/TermsPage';
import AccountDeletionPage from './pages/AccountDeletionPage';
import AccountDeletionAdminPage from './pages/AccountDeletionAdminPage';
import { ToastProvider } from './components/Toast';
import { ThemeProvider } from './context/ThemeContext';
import './index.css';

// Simple Guard Component
const PrivateRoute = ({ children }: { children: React.ReactNode }) => {
  const isAuthenticated = !!localStorage.getItem('access_token');
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" />;
};

function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <Router>
        <Routes>
          {/* Public Routes */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/privacy" element={<PrivacyPolicyPage />} />
          <Route path="/privacy-policy" element={<PrivacyPolicyPage />} />
          <Route path="/terms" element={<TermsPage />} />
          <Route path="/terms-of-service" element={<TermsPage />} />
          <Route path="/account-deletion" element={<AccountDeletionPage />} />
          <Route path="/data-deletion" element={<AccountDeletionPage />} />

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
                    <Route path="whatsapp-templates" element={<WhatsAppTemplatesPage />} />
                    <Route path="reviews" element={<ReviewsPage />} />
                    <Route path="billing" element={<BillingPage />} />
                    <Route path="billing-admin" element={<BillingAdminPage />} />
                    <Route path="deletion-requests" element={<AccountDeletionAdminPage />} />
                    <Route path="analytics" element={<div className="p-16 text-3xl font-black text-center text-neutral-900 dark:text-white">التقارير المتقدمة <br /><span className="text-neutral-500 dark:text-neutral-400 text-sm font-bold block mt-4 italic opacity-80">قريباً في المرحلة الثانية</span></div>} />
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
  </ThemeProvider>
  );
}

export default App;


