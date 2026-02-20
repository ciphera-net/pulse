import ProfileSettings from '@/components/settings/ProfileSettings'

export const metadata = {
  title: 'Settings - Pulse',
  description: 'Manage your account settings',
}

export default function SettingsPage() {
  return (
    <div className="min-h-screen pt-12 pb-12 px-4 sm:px-6">
      <ProfileSettings />
    </div>
  )
}
