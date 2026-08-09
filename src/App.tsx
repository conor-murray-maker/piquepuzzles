import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate, useLocation } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { GuestProvider } from "@/contexts/GuestContext";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { BottomNav } from "@/components/BottomNav";
import { WelcomeScreen } from "@/components/onboarding/WelcomeScreen";
import { AddToHomeScreen } from "@/components/onboarding/AddToHomeScreen";
import { GuestBanner, GuestSignInModal } from "@/components/onboarding/GuestSignInPrompt";
import { Suspense, lazy, useState } from "react";
import { PiqueLoader } from "@/components/PiqueLoader";

// Eager load landing/auth (critical path)
import Landing from "./pages/Landing.tsx";
import Auth from "./pages/Auth.tsx";
import ResetPassword from "./pages/ResetPassword.tsx";

// Lazy load heavy game components
const Index = lazy(() => import("./pages/Index.tsx"));
const Play = lazy(() => import("./pages/Play.tsx"));
const Stats = lazy(() => import("./pages/Stats.tsx"));
const Profile = lazy(() => import("./pages/Profile.tsx"));
const Challenge = lazy(() => import("./pages/Challenge.tsx"));
const Daily = lazy(() => import("./pages/Daily.tsx"));
const Privacy = lazy(() => import("./pages/Privacy.tsx"));
const NotFound = lazy(() => import("./pages/NotFound.tsx"));
const Admin = lazy(() => import("./pages/Admin.tsx"));
const OAuthConsent = lazy(() => import("./pages/OAuthConsent.tsx"));


const queryClient = new QueryClient();

function LoadingFallback() {
  return <PiqueLoader variant="fullscreen" message="Loading..." />;
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <LoadingFallback />;
  if (!user) return <Navigate to="/landing" replace />;
  return <>{children}</>;
}

function PublicOnlyRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (user) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function GuestOrAuthRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <LoadingFallback />;
  // Allow both authenticated and guest users
  const isGuest = localStorage.getItem('pique-guest-mode') === 'true';
  if (!user && !isGuest) return <Navigate to="/landing" replace />;
  return <>{children}</>;
}

function AppContent() {
  const location = useLocation();
  const { user } = useAuth();
  const [isGameActive, setIsGameActive] = useState(false);

  const hideNav = (location.pathname === '/play' && isGameActive) ||
    location.pathname === '/auth' ||
    location.pathname === '/reset-password' ||
    location.pathname === '/landing' ||
    location.pathname === '/.lovable/oauth/consent' ||
    location.pathname === '/welcome-test';


  return (
    <>
      <Suspense fallback={<LoadingFallback />}>
        <Routes>
          <Route path="/landing" element={<PublicOnlyRoute><Landing /></PublicOnlyRoute>} />
          <Route path="/auth" element={<PublicOnlyRoute><Auth /></PublicOnlyRoute>} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/.lovable/oauth/consent" element={<OAuthConsent />} />

          <Route path="/welcome-test" element={<WelcomeScreen testMode />} />
          <Route path="/challenge/:id" element={<Challenge />} />
          <Route path="/" element={<ProtectedRoute><Index /></ProtectedRoute>} />
          <Route path="/play" element={<GuestOrAuthRoute><Play onActiveGameChange={setIsGameActive} /></GuestOrAuthRoute>} />
          <Route path="/daily" element={<ProtectedRoute><Daily /></ProtectedRoute>} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/stats" element={<ProtectedRoute><Stats /></ProtectedRoute>} />
          <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
          <Route path="/admin" element={<ProtectedRoute><Admin /></ProtectedRoute>} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
      <BottomNav hidden={hideNav} />
      {user && <AddToHomeScreen />}
      {!user && <GuestBanner />}
      {!user && <GuestSignInModal />}
    </>
  );
}

const App = () => (
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AuthProvider>
            <GuestProvider>
              <AppContent />
            </GuestProvider>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </ErrorBoundary>
);

export default App;
