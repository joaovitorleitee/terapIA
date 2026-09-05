import React from 'react';

const Icon = ({ children, size=18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
       strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">{children}</svg>
);
const IconHome = (p) => <Icon {...p}><path d="M4 11.5 12 4l8 7.5"/><path d="M6 10v9a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-9"/></Icon>;
const IconCalendar = (p) => <Icon {...p}><rect x="3.5" y="5" width="17" height="16" rx="3"/><path d="M8 3v4M16 3v4M3.5 10h17"/></Icon>;
const IconUsers = (p) => <Icon {...p}><circle cx="9" cy="8" r="3.2"/><path d="M2.8 20c.6-3.6 3-5.6 6.2-5.6s5.6 2 6.2 5.6"/><circle cx="17.5" cy="8.5" r="2.4"/><path d="M15.8 14.6c2.5.2 4.2 2 4.7 5.1"/></Icon>;
const IconNote = (p) => <Icon {...p}><path d="M6 3.5h9l3.5 3.5V19a1.5 1.5 0 0 1-1.5 1.5H6A1.5 1.5 0 0 1 4.5 19V5A1.5 1.5 0 0 1 6 3.5Z"/><path d="M8.5 10h7M8.5 13.5h7M8.5 17h4.5"/></Icon>;
const IconTask = (p) => <Icon {...p}><rect x="4" y="4" width="16" height="16" rx="3.5"/><path d="m8.5 12.5 2.2 2.2 4.8-5"/></Icon>;
const IconWallet = (p) => <Icon {...p}><rect x="3" y="6.5" width="18" height="12.5" rx="3"/><path d="M3 10.5h18"/><circle cx="16.5" cy="14.5" r="1.1" fill="currentColor" stroke="none"/></Icon>;
const IconLock = (p) => <Icon {...p}><rect x="5" y="10.5" width="14" height="9.5" rx="2.5"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/></Icon>;
const IconSparkle = (p) => <Icon {...p}><path d="M12 3.5c.6 3 2 4.4 5 5-3 .6-4.4 2-5 5-.6-3-2-4.4-5-5 3-.6 4.4-2 5-5Z"/></Icon>;
const IconMail = (p) => <Icon {...p}><rect x="3.5" y="5.5" width="17" height="13" rx="2.5"/><path d="m4.5 7 7.5 6 7.5-6"/></Icon>;
const IconChevronDown = (p) => <Icon {...p}><path d="m6 9 6 6 6-6"/></Icon>;
const IconLogOut = (p) => <Icon {...p}><path d="M9 4.5H6A1.5 1.5 0 0 0 4.5 6v12A1.5 1.5 0 0 0 6 19.5h3"/><path d="M14.5 8 19 12l-4.5 4M19 12H9"/></Icon>;
const IconClockRewind = (p) => <Icon {...p}><path d="M4 12a8 8 0 1 1 2.5 5.8"/><path d="M4 17v-4h4"/><path d="M12 8v4l3 1.8"/></Icon>;
const IconEyeOff = (p) => <Icon {...p}><path d="M3.5 3.5 20.5 20.5"/><path d="M10.6 5.3A9.8 9.8 0 0 1 12 5.2c5 0 8.5 4.2 9.5 6.8-.4 1-1.1 2.2-2.1 3.3M6.6 6.6C4.5 8 3 10.2 2.5 12c1 2.6 4.5 6.8 9.5 6.8 1.4 0 2.7-.3 3.8-.9"/><path d="M9.9 10a3 3 0 0 0 4.1 4.1"/></Icon>;
const IconEye = (p) => <Icon {...p}><path d="M2.5 12c1-2.6 4.5-6.8 9.5-6.8s8.5 4.2 9.5 6.8c-1 2.6-4.5 6.8-9.5 6.8S3.5 14.6 2.5 12Z"/><circle cx="12" cy="12" r="3"/></Icon>;
const IconPlus = (p) => <Icon {...p}><path d="M12 5v14M5 12h14"/></Icon>;
const IconEdit = (p) => <Icon {...p}><path d="M4 20h4L18.5 9.5a2.1 2.1 0 0 0-3-3L5 17v3Z"/><path d="M13.5 7 17 10.5"/></Icon>;
const IconArchive = (p) => <Icon {...p}><rect x="3.5" y="4.5" width="17" height="4.5" rx="1.5"/><path d="M5 9v8.5A2 2 0 0 0 7 19.5h10a2 2 0 0 0 2-2V9"/><path d="M10 13.2h4"/></Icon>;
const IconSearch = (p) => <Icon {...p}><circle cx="10.5" cy="10.5" r="6.5"/><path d="m20 20-4.5-4.5"/></Icon>;
const IconUserPlus = (p) => <Icon {...p}><circle cx="9.5" cy="8" r="3.2"/><path d="M2.8 20c.6-3.6 3-5.6 6.7-5.6s6.1 2 6.7 5.6"/><path d="M18.5 7.5v6M15.5 10.5h6"/></Icon>;
const IconTrash = (p) => <Icon {...p}><path d="M4.5 7h15M9.5 7V5a1.5 1.5 0 0 1 1.5-1.5h2A1.5 1.5 0 0 1 14.5 5v2M6.5 7l1 12.5A1.5 1.5 0 0 0 9 21h6a1.5 1.5 0 0 0 1.5-1.5L17.5 7"/></Icon>;
const IconCheckCircle = (p) => <Icon {...p}><circle cx="12" cy="12" r="8.5"/><path d="m8.5 12.3 2.3 2.3 4.7-5"/></Icon>;
const IconShield = (p) => <Icon {...p}><path d="M12 3.5 5 6v5.5c0 4.5 3 7.5 7 9 4-1.5 7-4.5 7-9V6l-7-2.5Z"/><path d="m9 12 2 2 4-4.5"/></Icon>;
const IconBarChart = (p) => <Icon {...p}><path d="M4 20V10M10 20V4M16 20v-7M4 20h16"/></Icon>;
const IconHistory = (p) => <Icon {...p}><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 5v4h4"/><path d="M12 8v4l3 2"/></Icon>;
const IconXCircle = (p) => <Icon {...p}><circle cx="12" cy="12" r="8.5"/><path d="m9 9 6 6M15 9l-6 6"/></Icon>;
const IconChevronLeft = (p) => <Icon {...p}><path d="m15 6-6 6 6 6"/></Icon>;
const IconChevronRight = (p) => <Icon {...p}><path d="m9 6 6 6-6 6"/></Icon>;
const IconBell = (p) => <Icon {...p}><path d="M6 9a6 6 0 0 1 12 0c0 4 1.5 5.5 2 6.5H4c.5-1 2-2.5 2-6.5Z"/><path d="M10 19.5a2 2 0 0 0 4 0"/></Icon>;


export {
  Icon, IconHome, IconCalendar, IconUsers, IconNote, IconTask, IconWallet,
  IconLock, IconSparkle, IconMail, IconChevronDown, IconLogOut, IconClockRewind,
  IconEyeOff, IconEye, IconPlus, IconEdit, IconArchive, IconSearch, IconUserPlus,
  IconTrash, IconCheckCircle, IconXCircle, IconChevronLeft, IconChevronRight, IconBell, IconShield, IconBarChart, IconHistory,
};
