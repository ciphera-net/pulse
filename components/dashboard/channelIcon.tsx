import {
  ArrowSquareOut,
  Link as LinkIcon,
  MagnifyingGlass,
  UsersThree,
  CurrencyCircleDollar,
  Megaphone,
  Robot,
  Envelope,
  PlayCircle,
  Monitor,
  Handshake,
  ChatCircle,
  Question,
} from '@phosphor-icons/react'

/**
 * The icon for a traffic channel, as the dashboard's Sources card draws it.
 * Its own module so the shared report's slides (components/reports) draw the
 * same icon for the same channel without importing the dashboard card.
 */
export function getChannelIcon(channel: string) {
  const cls = 'w-5 h-5 text-neutral-500'
  switch (channel) {
    case 'Direct': return <LinkIcon className={cls} />
    case 'Organic Search': return <MagnifyingGlass className={cls} />
    case 'Organic Social': return <UsersThree className={cls} />
    case 'Paid Search': return <CurrencyCircleDollar className={cls} />
    case 'Paid Social': return <Megaphone className={cls} />
    case 'AI': return <Robot className={cls} />
    case 'Email': return <Envelope className={cls} />
    case 'Referral': return <ArrowSquareOut className={cls} />
    case 'Organic Video': return <PlayCircle className={cls} />
    case 'Display': return <Monitor className={cls} />
    case 'Affiliate': return <Handshake className={cls} />
    case 'SMS': return <ChatCircle className={cls} />
    default: return <Question className={cls} />
  }
}
