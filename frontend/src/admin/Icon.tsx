type IconName =
  | 'chat'
  | 'settings'
  | 'sparkles'
  | 'user'
  | 'arrow'
  | 'plus'
  | 'logout'
  | 'chevron'
  | 'close'
  | 'external'
  | 'lock'
  | 'check'
  | 'projects'
  | 'career'
  | 'services'
  | 'writing'
  | 'quote'
  | 'library'
  | 'image'
  | 'menu'

const paths: Record<IconName, string> = {
  projects: 'M3 7h7l2 2h9v11H3V7Zm0 0V4h7l2 3',
  career: 'M3 7h18v13H3V7Zm5 0V4h8v3M3 12h18m-11 0v3h4v-3',
  services: 'm12 3 9 5-9 5-9-5 9-5Zm-9 9 9 5 9-5M3 16l9 5 9-5',
  writing: 'M5 3h11l4 4v14H5V3Zm11 0v5h4M8 12h9m-9 4h7',
  quote: 'M3 5h7v7H6v4H3V5Zm11 0h7v7h-4v4h-3V5Z',
  library: 'M4 4h4v16H4V4Zm7 0h4v16h-4V4Zm7 0 4 15-3 1-4-15 3-1Z',
  image: 'M3 3h18v18H3V3Zm0 13 6-6 5 5 3-3 4 4M17 7h.01',
  menu: 'M4 6h16M4 12h16M4 18h16',
  chat: 'M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9H13a8.5 8.5 0 0 1 8 8v.5Z',
  settings:
    'M9 4 10 2h4l1 2 2 1 2 .1 2 3.5-1 1.8v3.2l1 1.8-2 3.5-2 .1-2 1-1 2h-4l-1-2-2-1-2-.1-2-3.5 1-1.8v-3.2L3 8.6l2-3.5L7 5l2-1ZM15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z',
  sparkles: 'm12 3 2.4 6.6L21 12l-6.6 2.4L12 21l-2.4-6.6L3 12l6.6-2.4L12 3ZM20 2v4m-2-2h4',
  user: 'M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM4 21v-2a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v2',
  arrow: 'M12 19V5m-6 6 6-6 6 6',
  plus: 'M12 5v14M5 12h14',
  logout: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4m7 14 5-5-5-5m5 5H9',
  chevron: 'm9 5 7 7-7 7',
  close: 'm6 6 12 12M6 18 18 6',
  external: 'M14 3h7v7m0-7L10 14m0-11H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5',
  lock: 'M6 10h12v11H6V10Zm2 0V6a4 4 0 0 1 8 0v4m-4 4v3',
  check: 'm5 12 4 4L19 6',
}

export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name]} />
    </svg>
  )
}
