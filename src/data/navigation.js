export const navigation = [
  { id: 'terminal', label: 'Terminal', icon: '⌘', path: '/' },
  { id: 'trading', label: 'Trading', icon: '◈', path: '/trading' },
  { id: 'history', label: 'History', icon: '↗', path: '/history' },
  { id: 'signals', label: 'Signals', icon: '◆', path: '/signals' },
  { id: 'track', label: 'Track record', icon: '✓', path: '/track-record' },
  { id: 'profile', label: 'Profile', icon: '●', path: '/profile' },
];

export function pageFromPath(pathname) {
  return navigation.find((item) => item.path === pathname)?.id || 'terminal';
}
