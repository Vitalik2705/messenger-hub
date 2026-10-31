import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext.jsx';
import { ThemeModeProvider } from './context/ThemeModeContext.jsx';
import LoginPage from './pages/auth/LoginPage.jsx';
import RegisterPage from './pages/auth/RegisterPage.jsx';
import DashboardPage from './pages/DashboardPage';
import AnalyticsPage from './pages/AnalyticsPage';
import { Box, CircularProgress } from '@mui/material';

const PrivateRoute = ({ children }) => {
    const { isAuthenticated, loading } = useAuth();

    if (loading) {
        // A bare "Loading..." string flashed unstyled text before the theme existed.
        return (
            <Box sx={{ height: '100vh', display: 'grid', placeItems: 'center' }}>
                <CircularProgress size={22} />
            </Box>
        );
    }

    return isAuthenticated ? children : <Navigate to="/login" />;
};

function App() {
    return (
        <ThemeModeProvider>
            <AuthProvider>
                <Router>
                    <Routes>
                        <Route path="/login" element={<LoginPage />} />
                        <Route path="/register" element={<RegisterPage />} />
                        <Route
                            path="/dashboard"
                            element={
                                <PrivateRoute>
                                    <DashboardPage />
                                </PrivateRoute>
                            }
                        />
                        <Route
                            path="/analytics"
                            element={
                                <PrivateRoute>
                                    <AnalyticsPage />
                                </PrivateRoute>
                            }
                        />
                        <Route path="/" element={<Navigate to="/dashboard" />} />
                    </Routes>
                </Router>
            </AuthProvider>
        </ThemeModeProvider>
    );
}

export default App;
