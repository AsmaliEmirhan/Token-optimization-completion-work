import { useState } from 'react';
import { ThemeProvider } from './context/ThemeContext';
import { OuterFrame } from './components/OuterFrame';
import { Sidebar } from './components/Sidebar';
import { MainWorkspace } from './components/MainWorkspace';
import { SettingsModal } from './components/SettingsModal';

export function App() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeProfileAnchor, setActiveProfileAnchor] = useState<'top' | 'sidebar' | null>(null);
  const [isNotificationOpen, setIsNotificationOpen] = useState(false);
  const [isMetricsOpen, setIsMetricsOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const toggleNotification = () => {
    if (isSettingsOpen) return;
    setActiveProfileAnchor(null);
    setIsMetricsOpen(false);
    setIsNotificationOpen((prev) => !prev);
  };

  const closeNotification = () => {
    setIsNotificationOpen(false);
  };

  const toggleMetrics = () => {
    if (isSettingsOpen) return;
    setActiveProfileAnchor(null);
    setIsNotificationOpen(false);
    setIsMetricsOpen((prev) => !prev);
  };

  const closeMetrics = () => {
    setIsMetricsOpen(false);
  };

  const toggleTopProfile = () => {
    setIsNotificationOpen(false);
    setIsMetricsOpen(false);
    setActiveProfileAnchor((prev) => (prev === 'top' ? null : 'top'));
  };

  const toggleSidebarProfile = () => {
    setIsNotificationOpen(false);
    setIsMetricsOpen(false);
    setActiveProfileAnchor((prev) => (prev === 'sidebar' ? null : 'sidebar'));
  };

  const closeProfile = () => {
    setActiveProfileAnchor(null);
  };

  const openSettings = () => {
    setActiveProfileAnchor(null);
    setIsNotificationOpen(false);
    setIsMetricsOpen(false);
    setIsSettingsOpen(true);
  };

  const closeSettings = () => {
    setIsSettingsOpen(false);
  };

  return (
    <ThemeProvider>
      <OuterFrame>
        {/* Left Sidebar */}
        <Sidebar 
          isOpen={sidebarOpen} 
          onClose={() => setSidebarOpen(false)} 
          isProfileOpen={activeProfileAnchor === 'sidebar'}
          onToggleProfile={toggleSidebarProfile}
          onCloseProfile={closeProfile}
          onOpenSettings={openSettings}
        />

        {/* Main Spacious AI Workspace */}
        <MainWorkspace 
          onToggleSidebar={() => setSidebarOpen((prev) => !prev)} 
          isProfileOpen={activeProfileAnchor === 'top'}
          onToggleProfile={toggleTopProfile}
          onCloseProfile={closeProfile}
          isNotificationOpen={isNotificationOpen}
          onToggleNotification={toggleNotification}
          onCloseNotification={closeNotification}
          isMetricsOpen={isMetricsOpen}
          onToggleMetrics={toggleMetrics}
          onCloseMetrics={closeMetrics}
          onOpenSettings={openSettings}
        />

        {/* Floating Settings Modal */}
        <SettingsModal 
          isOpen={isSettingsOpen} 
          onClose={closeSettings} 
        />
      </OuterFrame>
    </ThemeProvider>
  );
}

export default App;
