import React from 'react'
import { 
  FaChrome, 
  FaFirefox, 
  FaSafari, 
  FaEdge, 
  FaOpera, 
  FaInternetExplorer, 
  FaWindows, 
  FaApple, 
  FaLinux, 
  FaAndroid, 
  FaDesktop, 
  FaMobileAlt, 
  FaTabletAlt, 
  FaGoogle, 
  FaFacebook, 
  FaTwitter, 
  FaLinkedin, 
  FaInstagram, 
  FaGithub, 
  FaYoutube, 
  FaReddit,
  FaQuestion,
  FaGlobe
} from 'react-icons/fa'
import { SiBrave } from 'react-icons/si'
import { MdDeviceUnknown, MdSmartphone, MdTabletMac, MdDesktopWindows } from 'react-icons/md'

export function getBrowserIcon(browserName: string) {
  if (!browserName) return <FaGlobe className="text-neutral-400" />
  const lower = browserName.toLowerCase()
  if (lower.includes('chrome')) return <FaChrome className="text-blue-500" />
  if (lower.includes('firefox')) return <FaFirefox className="text-orange-500" />
  if (lower.includes('safari')) return <FaSafari className="text-blue-400" />
  if (lower.includes('edge')) return <FaEdge className="text-blue-600" />
  if (lower.includes('opera')) return <FaOpera className="text-red-500" />
  if (lower.includes('ie') || lower.includes('explorer')) return <FaInternetExplorer className="text-blue-500" />
  if (lower.includes('brave')) return <SiBrave className="text-orange-600" />
  
  return <FaGlobe className="text-neutral-400" />
}

export function getOSIcon(osName: string) {
  if (!osName) return <MdDeviceUnknown className="text-neutral-400" />
  const lower = osName.toLowerCase()
  if (lower.includes('win')) return <FaWindows className="text-blue-500" />
  if (lower.includes('mac') || lower.includes('ios')) return <FaApple className="text-neutral-800 dark:text-neutral-200" />
  if (lower.includes('linux') || lower.includes('ubuntu') || lower.includes('debian')) return <FaLinux className="text-neutral-800 dark:text-neutral-200" />
  if (lower.includes('android')) return <FaAndroid className="text-green-500" />
  
  return <MdDeviceUnknown className="text-neutral-400" />
}

export function getDeviceIcon(deviceName: string) {
  if (!deviceName) return <MdDeviceUnknown className="text-neutral-400" />
  const lower = deviceName.toLowerCase()
  if (lower.includes('mobile') || lower.includes('phone')) return <MdSmartphone className="text-neutral-500" />
  if (lower.includes('tablet') || lower.includes('ipad')) return <MdTabletMac className="text-neutral-500" />
  if (lower.includes('desktop') || lower.includes('laptop')) return <MdDesktopWindows className="text-neutral-500" />
  
  return <MdDeviceUnknown className="text-neutral-400" />
}

export function getReferrerIcon(referrerName: string) {
  if (!referrerName) return <FaGlobe className="text-neutral-400" />
  const lower = referrerName.toLowerCase()
  if (lower.includes('google')) return <FaGoogle className="text-blue-500" />
  if (lower.includes('facebook')) return <FaFacebook className="text-blue-600" />
  if (lower.includes('twitter') || lower.includes('t.co') || lower.includes('x.com')) return <FaTwitter className="text-blue-400" />
  if (lower.includes('linkedin')) return <FaLinkedin className="text-blue-700" />
  if (lower.includes('instagram')) return <FaInstagram className="text-pink-600" />
  if (lower.includes('github')) return <FaGithub className="text-neutral-800 dark:text-neutral-200" />
  if (lower.includes('youtube')) return <FaYoutube className="text-red-600" />
  if (lower.includes('reddit')) return <FaReddit className="text-orange-600" />
  
  // Try to use a generic globe or maybe check if it is a URL
  return <FaGlobe className="text-neutral-400" />
}

const REFERRER_NO_FAVICON = ['direct', 'unknown', '']

/**
 * Returns a favicon URL for the referrer's domain, or null for non-URL referrers
 * (e.g. "Direct", "Unknown") so callers can show an icon fallback instead.
 */
export function getReferrerFavicon(referrer: string): string | null {
  if (!referrer || typeof referrer !== 'string') return null
  const normalized = referrer.trim().toLowerCase()
  if (REFERRER_NO_FAVICON.includes(normalized)) return null
  try {
    const url = new URL(referrer.startsWith('http') ? referrer : `https://${referrer}`)
    return `https://www.google.com/s2/favicons?domain=${url.hostname}&sz=32`
  } catch {
    return null
  }
}
