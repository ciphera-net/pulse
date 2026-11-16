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
import { EVENT_KIND, EVENT_PROPERTY_SCOPE, OUTBOUND_KIND, eventPropertyOf, propertyKeysEvent } from '@/lib/filters'

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
  // The event filter's kinds (R45): an event as the Events block marks one, an outbound link as the Outbound tab does,
  // and an event's property as the Events block's empty properties pane does.
  [EVENT_KIND]: CursorClick,
  [EVENT_PROPERTY_SCOPE]: Tag,
  [OUTBOUND_KIND]: ArrowSquareOut,
  entry_path: SignIn,
  language: Translate,
  timezone: Clock,
}

/**
 * The key of a kind's icon in DIMENSION_ICONS: its own, or for an event's keys and any property kind, the property's
 * mark. A key, never the icon, so a component draws `DIMENSION_ICONS[iconKeyOf(kind)]`, a lookup in a constant.
 */
export function iconKeyOf(dimension: string): string {
  if (DIMENSION_ICONS[dimension]) return dimension
  return propertyKeysEvent(dimension) !== null || eventPropertyOf(dimension) !== null ? EVENT_PROPERTY_SCOPE : dimension
}
