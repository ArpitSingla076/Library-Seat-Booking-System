import { createContext, useCallback, useContext, useState } from 'react';

// Lightweight translations for navigation and the main screens (English / Hindi / Punjabi).
// Any key missing in a language falls back to English.
const dict = {
  en: {
    seatMap: 'Seat Map', myBookings: 'My Bookings', qrCheckin: 'QR Check-in', fines: 'Fines', profile: 'Profile', notifications: 'Notifications',
    dashboard: 'Dashboard', bookings: 'Bookings', seats: 'Seats', sections: 'Sections', qrCodes: 'QR Codes', users: 'Users', settings: 'Settings', audit: 'Audit Log',
    logout: 'Logout', bookSeat: 'Book a seat', checkIn: 'Check in', checkOut: 'Check out', cancel: 'Cancel', extend: 'Extend',
    seatMapTitle: 'Seat Map', seatMapSub: 'Pick a date and time, then click a green seat to book it',
    myBookingsTitle: 'My Bookings', finesTitle: 'Violations & Fines', available: 'Available', booked: 'Booked', yourSeat: 'Your seat', maintenance: 'Maintenance',
    date: 'Date', startTime: 'Start time', duration: 'Duration', language: 'Language', darkMode: 'Dark mode', studentPortal: 'Student Portal', adminPanel: 'Admin Panel',
    markAllRead: 'Mark all read', noNotifications: 'No notifications yet',
  },
  hi: {
    seatMap: 'सीट मानचित्र', myBookings: 'मेरी बुकिंग', qrCheckin: 'QR चेक-इन', fines: 'जुर्माना', profile: 'प्रोफ़ाइल', notifications: 'सूचनाएँ',
    dashboard: 'डैशबोर्ड', bookings: 'बुकिंग', seats: 'सीटें', sections: 'सेक्शन', qrCodes: 'QR कोड', users: 'उपयोगकर्ता', settings: 'सेटिंग्स', audit: 'ऑडिट लॉग',
    logout: 'लॉग आउट', bookSeat: 'सीट बुक करें', checkIn: 'चेक-इन', checkOut: 'चेक-आउट', cancel: 'रद्द करें', extend: 'बढ़ाएँ',
    seatMapTitle: 'सीट मानचित्र', seatMapSub: 'तारीख और समय चुनें, फिर हरी सीट पर क्लिक करके बुक करें',
    myBookingsTitle: 'मेरी बुकिंग', finesTitle: 'उल्लंघन और जुर्माना', available: 'उपलब्ध', booked: 'बुक', yourSeat: 'आपकी सीट', maintenance: 'मरम्मत',
    date: 'तारीख', startTime: 'शुरू समय', duration: 'अवधि', language: 'भाषा', darkMode: 'डार्क मोड', studentPortal: 'छात्र पोर्टल', adminPanel: 'एडमिन पैनल',
    markAllRead: 'सभी पढ़ा हुआ करें', noNotifications: 'अभी कोई सूचना नहीं',
  },
  pa: {
    seatMap: 'ਸੀਟ ਨਕਸ਼ਾ', myBookings: 'ਮੇਰੀ ਬੁਕਿੰਗ', qrCheckin: 'QR ਚੈੱਕ-ਇਨ', fines: 'ਜੁਰਮਾਨਾ', profile: 'ਪ੍ਰੋਫਾਈਲ', notifications: 'ਸੂਚਨਾਵਾਂ',
    dashboard: 'ਡੈਸ਼ਬੋਰਡ', bookings: 'ਬੁਕਿੰਗ', seats: 'ਸੀਟਾਂ', sections: 'ਸੈਕਸ਼ਨ', qrCodes: 'QR ਕੋਡ', users: 'ਵਰਤੋਂਕਾਰ', settings: 'ਸੈਟਿੰਗਾਂ', audit: 'ਆਡਿਟ ਲੌਗ',
    logout: 'ਲੌਗ ਆਊਟ', bookSeat: 'ਸੀਟ ਬੁੱਕ ਕਰੋ', checkIn: 'ਚੈੱਕ-ਇਨ', checkOut: 'ਚੈੱਕ-ਆਊਟ', cancel: 'ਰੱਦ ਕਰੋ', extend: 'ਵਧਾਓ',
    seatMapTitle: 'ਸੀਟ ਨਕਸ਼ਾ', seatMapSub: 'ਤਾਰੀਖ ਅਤੇ ਸਮਾਂ ਚੁਣੋ, ਫਿਰ ਹਰੀ ਸੀਟ ਤੇ ਕਲਿੱਕ ਕਰਕੇ ਬੁੱਕ ਕਰੋ',
    myBookingsTitle: 'ਮੇਰੀ ਬੁਕਿੰਗ', finesTitle: 'ਉਲੰਘਣਾਵਾਂ ਅਤੇ ਜੁਰਮਾਨੇ', available: 'ਉਪਲਬਧ', booked: 'ਬੁੱਕ', yourSeat: 'ਤੁਹਾਡੀ ਸੀਟ', maintenance: 'ਮੁਰੰਮਤ',
    date: 'ਤਾਰੀਖ', startTime: 'ਸ਼ੁਰੂ ਸਮਾਂ', duration: 'ਮਿਆਦ', language: 'ਭਾਸ਼ਾ', darkMode: 'ਡਾਰਕ ਮੋਡ', studentPortal: 'ਵਿਦਿਆਰਥੀ ਪੋਰਟਲ', adminPanel: 'ਐਡਮਿਨ ਪੈਨਲ',
    markAllRead: 'ਸਭ ਪੜ੍ਹੇ ਮਾਰਕ ਕਰੋ', noNotifications: 'ਹਾਲੇ ਕੋਈ ਸੂਚਨਾ ਨਹੀਂ',
  },
};

export const LANGUAGES = [['en', 'English'], ['hi', 'हिन्दी'], ['pa', 'ਪੰਜਾਬੀ']];

const I18nContext = createContext({ lang: 'en', setLang: () => {}, t: (k) => k });

export const I18nProvider = ({ children }) => {
  const [lang, setLangState] = useState(() => localStorage.getItem('lang') || 'en');
  const setLang = useCallback((l) => { localStorage.setItem('lang', l); setLangState(l); }, []);
  const t = useCallback((key) => dict[lang]?.[key] || dict.en[key] || key, [lang]);
  return <I18nContext.Provider value={{ lang, setLang, t }}>{children}</I18nContext.Provider>;
};

// eslint-disable-next-line react-refresh/only-export-components
export const useT = () => useContext(I18nContext);
