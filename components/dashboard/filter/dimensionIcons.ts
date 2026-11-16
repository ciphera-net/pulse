import {
  ArrowSquareOut,
  Broadcast,
  Buildings,
  Clock,
  Compass,
  Cpu,
  CursorClick,
  DeviceMobile,
  FileText,
  FrameCorners,
  GlobeHemisphereWest,
  MapPin,
  SignIn,
  Tag,
  Translate,
  type Icon,
} from '@phosphor-icons/react'
import { EVENT_KIND, OUTBOUND_KIND } from '@/lib/filters'

/**
 * The icon of each kind of thing a filter can be on, read by both pickers (today's DimensionStage and the new
 * dashboard's Search filter). Language and Timezone filter today but had no icon, so a value of either drew the globe
 * that stands for "anything else".
 */
export const DIMENSION_ICONS: Record<string, Icon> = {
  page: FileText,
  referrer: ArrowSquareOut,
  channel: Broadcast,
  utm_source: Tag,
  utm_medium: Tag,
  utm_campaign: Tag,
  utm_term: Tag,
  utm_content: Tag,
  browser: Compass,
  os: Cpu,
  device: DeviceMobile,
  screen_resolution: FrameCorners,
  country: GlobeHemisphereWest,
  region: MapPin,
  city: Buildings,
  event_name: CursorClick,
  // The event filter's kinds (R45): an event as the Events block marks one, an outbound link as the Outbound tab does.
  [EVENT_KIND]: CursorClick,
  [OUTBOUND_KIND]: ArrowSquareOut,
  entry_path: SignIn,
  language: Translate,
  timezone: Clock,
}
