import { lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Box, CircularProgress } from '@mui/material';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeModeProvider } from './context/ThemeModeContext';
import { ToastProvider } from './context/ToastContext';
import { PresentationProvider } from './context/PresentationContext';

// Each page is its own chunk, so the sign-in screen does not download the chat window first.
const LoginPage = lazy(() => import('./pages/auth/LoginPage'));
const RegisterPage = lazy(() => import('./pages/auth/RegisterPage'));
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const AnalyticsPage = lazy(() => import('./pages/AnalyticsPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));

function PageLoader() {
    return (
        <Box sx={{ height: '100vh', display: 'grid', placeItems: 'center' }}>
            <CircularProgress size={22} />
        </Box>
    );
}

/** Pages behind sign-in. */
function PrivateRoute({ children }) {
    const { isAuthenticated } = useAuth();
    return isAuthenticated ? children : <Navigate to="/login" replace />;
}

/** The sign-in pages, which a signed-in user has no reason to see. */
function PublicRoute({ children }) {
    const { isAuthenticated } = useAuth();
    return isAuthenticated ? <Navigate to="/dashboard" replace /> : children;
}

export default function App() {
    return (
        <ThemeModeProvider>
            <ToastProvider>
                <AuthProvider>
                    <PresentationProvider>
                        <Router>
                            <Suspense fallback={<PageLoader />}>
                                <Routes>
                                    <Route path="/login" element={<PublicRoute><LoginPage /></PublicRoute>} />
                                    <Route path="/register" element={<PublicRoute><RegisterPage /></PublicRoute>} />
                                    <Route path="/dashboard" element={<PrivateRoute><DashboardPage /></PrivateRoute>} />
                                    <Route path="/analytics" element={<PrivateRoute><AnalyticsPage /></PrivateRoute>} />
                                    <Route path="/settings" element={<PrivateRoute><SettingsPage /></PrivateRoute>} />
                                    <Route path="*" element={<Navigate to="/dashboard" replace />} />
                                </Routes>
                            </Suspense>
                        </Router>
                    </PresentationProvider>
                </AuthProvider>
            </ToastProvider>
        </ThemeModeProvider>
    );
}
