import ProfileSettings from '@/components/settings/ProfileSettings'

export const metadata = {
  title: 'Settings - Pulse',
  description: 'Manage your account settings',
}

export default function SettingsPage() {
  return (
    <div className="w-full max-w-6xl mx-auto px-4 sm:px-6 py-8">
      <ProfileSettings />
    </div>
  )
}
