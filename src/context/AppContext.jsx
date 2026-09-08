import { createContext, useContext, useState } from 'react';

const AppContext = createContext(null);

export function AppProvider({ children }) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [notifications, setNotifications] = useState([]);

  const toggleSidebar = () => setSidebarCollapsed(p => !p);

  const addNotification = (notif) => {
    setNotifications(prev => [{ id: Date.now(), ...notif }, ...prev]);
  };

  return (
    <AppContext.Provider value={{ sidebarCollapsed, toggleSidebar, notifications, addNotification }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
