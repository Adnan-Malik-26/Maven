import React, { Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import Navbar from './components/common/Navbar';
import ProtectedRoute from './components/common/ProtectedRoute';
import { PageLoader } from './components/common/Loader';

// Pages
import Home      from './pages/Home';
import Auth      from './pages/Auth';
import Upload    from './pages/Upload';
import Dashboard from './pages/Dashboard';
import Result    from './pages/Result';

const PageWrapper = ({ children }) => (
  <motion.div
    initial={{ opacity: 0, y: 8 }}
    animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0, y: -8 }}
    transition={{ duration: 0.25 }}
  >
    {children}
  </motion.div>
);

export default function App() {
  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-1">
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/"     element={<PageWrapper><Home /></PageWrapper>} />
            <Route path="/auth" element={<PageWrapper><Auth /></PageWrapper>} />

            <Route path="/upload" element={
              <ProtectedRoute>
                <PageWrapper><Upload /></PageWrapper>
              </ProtectedRoute>
            } />

            <Route path="/dashboard" element={
              <ProtectedRoute>
                <PageWrapper><Dashboard /></PageWrapper>
              </ProtectedRoute>
            } />

            <Route path="/result/:jobId" element={
              <ProtectedRoute>
                <PageWrapper><Result /></PageWrapper>
              </ProtectedRoute>
            } />

            {/* Fallback */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </main>
    </div>
  );
}
