import { createContext, useContext, useEffect, useState } from 'react';
import { settingsAPI } from '../services/api';
import { useAuth } from './AuthContext';

const DEFAULTS = {
  gracePeriodMinutes: 15, earlyCheckInMinutes: 10, noShowFine: 50, overstayFine: 100,
  maxDurationHours: 3, maxActiveBookings: 3, maxBookingsPerDay: 3, advanceBookingDays: 7, requireQrCheckIn: false,
};

const SettingsContext = createContext({ settings: DEFAULTS, reload: () => {} });

export const SettingsProvider = ({ children }) => {
  const { user } = useAuth();
  const [settings, setSettings] = useState(DEFAULTS);

  const reload = () => settingsAPI.get().then((r) => setSettings({ ...DEFAULTS, ...r.data.settings })).catch(() => {});

  useEffect(() => { if (user) reload(); }, [user?._id]); // eslint-disable-line react-hooks/exhaustive-deps

  return <SettingsContext.Provider value={{ settings, reload }}>{children}</SettingsContext.Provider>;
};

// eslint-disable-next-line react-refresh/only-export-components
export const useSettings = () => useContext(SettingsContext);
