import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import Navbar from "./components/Navbar";
import Hero from "./components/Hero";
import Dashboard from "./pages/Dashboard";
import Portfolio from "./pages/Portfolio";
import Portfolios from "./pages/Portfolios";
import PortfolioView from "./pages/PortfolioView";
import AuthCallback from "./pages/AuthCallback";
import NotFound from "./pages/NotFound";
import "./App.css";
import GlobalGrid from "./components/GlobalGrid";
const REVIEWER_ROLES = [
  "1519094379141398558",
  "1519094454265450506",
];
function RequireReviewer({ isReviewer, children }) {
  const { isAuthenticated } = useAuth();
  if (!isAuthenticated) return children;
  return isReviewer ? children : <Navigate to="/portfolio" replace />;
}
function RequireUser({ isReviewer, children }) {
  const { isAuthenticated } = useAuth();
  if (!isAuthenticated) return children;
  return !isReviewer ? children : <Navigate to="/portfolios" replace />;
}
function AppRoutes() {
  const { user } = useAuth();
  const roleIds = user?.roles || [];
  const userId = user?.discord_id || "";
  const isReviewer = Array.isArray(roleIds)
    ? roleIds.some((id) => REVIEWER_ROLES.includes(String(id))) || REVIEWER_ROLES.includes(userId)
    : REVIEWER_ROLES.includes(userId);
  return (
    <>
      <GlobalGrid />
      <div className="app-shell">
        <Navbar />
        <Routes>
          <Route path="/" element={<Hero />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route
            path="/portfolio"
            element={
              <RequireUser isReviewer={isReviewer}>
                <Portfolio />
              </RequireUser>
            }
          />
          <Route
            path="/portfolios"
            element={
              <RequireReviewer isReviewer={isReviewer}>
                <Portfolios />
              </RequireReviewer>
            }
          />
          <Route path="/portfolios/:userId" element={<PortfolioView />} />
          <Route path="/auth/callback" element={<AuthCallback />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </div>
    </>
  );
}
export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}
