import {
  FaDiscord, FaEnvelope, FaFacebook, FaGlobe, FaInstagram, FaLink, FaLinkedin, FaLocationDot,
  FaPhone, FaPinterest, FaSnapchat, FaSpotify, FaTelegram, FaThreads, FaTiktok, FaWhatsapp,
  FaXTwitter, FaYoutube,
} from 'react-icons/fa6';

// Keep the keys in sync with server/src/platforms.js
export const PLATFORMS = [
  { key: 'website', label: 'Website', Icon: FaGlobe, color: '#2563eb', placeholder: 'https://yourwebsite.com' },
  { key: 'facebook', label: 'Facebook', Icon: FaFacebook, color: '#1877f2', placeholder: 'https://facebook.com/yourpage' },
  { key: 'instagram', label: 'Instagram', Icon: FaInstagram, color: '#e4405f', placeholder: 'https://instagram.com/yourhandle' },
  { key: 'x', label: 'X (Twitter)', Icon: FaXTwitter, color: '#111111', placeholder: 'https://x.com/yourhandle' },
  { key: 'tiktok', label: 'TikTok', Icon: FaTiktok, color: '#111111', placeholder: 'https://tiktok.com/@yourhandle' },
  { key: 'youtube', label: 'YouTube', Icon: FaYoutube, color: '#ff0000', placeholder: 'https://youtube.com/@yourchannel' },
  { key: 'linkedin', label: 'LinkedIn', Icon: FaLinkedin, color: '#0a66c2', placeholder: 'https://linkedin.com/company/yourcompany' },
  { key: 'whatsapp', label: 'WhatsApp', Icon: FaWhatsapp, color: '#25d366', placeholder: 'Phone number with country code, e.g. +1 416 555 0123', hint: 'Enter a phone number (we build the wa.me link) or paste a WhatsApp link.' },
  { key: 'telegram', label: 'Telegram', Icon: FaTelegram, color: '#229ed9', placeholder: 'https://t.me/yourhandle' },
  { key: 'snapchat', label: 'Snapchat', Icon: FaSnapchat, color: '#fffc00', placeholder: 'https://snapchat.com/add/yourhandle' },
  { key: 'pinterest', label: 'Pinterest', Icon: FaPinterest, color: '#e60023', placeholder: 'https://pinterest.com/yourhandle' },
  { key: 'threads', label: 'Threads', Icon: FaThreads, color: '#111111', placeholder: 'https://threads.net/@yourhandle' },
  { key: 'discord', label: 'Discord', Icon: FaDiscord, color: '#5865f2', placeholder: 'https://discord.gg/yourinvite' },
  { key: 'spotify', label: 'Spotify', Icon: FaSpotify, color: '#1db954', placeholder: 'https://open.spotify.com/...' },
  { key: 'google_maps', label: 'Location / Maps', Icon: FaLocationDot, color: '#ea4335', placeholder: 'https://maps.google.com/?q=...' },
  { key: 'email', label: 'Email', Icon: FaEnvelope, color: '#475569', placeholder: 'hello@yourbusiness.com', inputLabel: 'Email address', inputType: 'email' },
  { key: 'phone', label: 'Phone', Icon: FaPhone, color: '#475569', placeholder: '+1 416 555 0123', inputLabel: 'Phone number', inputType: 'tel' },
  { key: 'other', label: 'Other link', Icon: FaLink, color: '#475569', placeholder: 'https://...' },
];

const BY_KEY = Object.fromEntries(PLATFORMS.map((p) => [p.key, p]));

export function platformOf(key) {
  return BY_KEY[key] || BY_KEY.other;
}

export function PlatformIcon({ platform, ...props }) {
  const { Icon } = platformOf(platform);
  return <Icon aria-hidden="true" {...props} />;
}
