import { Spinner } from '@ciphera-net/facet'

export default function SettingsLoadingState() {
  return (
    <div className="flex items-center justify-center py-12">
      <Spinner className="w-6 h-6 text-neutral-500" />
    </div>
  )
}
