'use client'

function Toggle({ on = true }: { on?: boolean }) {
  return (
    <div
      className={`relative w-9 h-5 rounded-full shrink-0 transition-colors ${
        on ? 'bg-brand-orange' : 'bg-neutral-700'
      }`}
    >
      <div
        className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
          on ? 'translate-x-[18px]' : 'translate-x-0.5'
        }`}
      />
    </div>
  )
}

export function ModularScriptMockup() {
  return (
    <div className="relative w-full max-w-[460px] mx-auto">
      <div className="rounded-xl border border-white/[0.08] bg-neutral-900/90 shadow-2xl overflow-hidden px-6 py-5 space-y-5">
        {/* Features heading */}
        <h4 className="text-sm font-bold text-white">Features</h4>

        {/* Feature toggles — 2 column grid */}
        <div className="grid grid-cols-2 gap-2.5">
          {[
            { name: 'Scroll depth', desc: 'Track 25 / 50 / 75 / 100%', on: true },
            { name: '404 detection', desc: 'Auto-detect error pages', on: true },
            { name: 'Outbound links', desc: 'Track external link clicks', on: true },
            { name: 'File downloads', desc: 'Track PDF, ZIP, and more', on: true },
          ].map((feature) => (
            <div
              key={feature.name}
              className="rounded-lg border border-neutral-800 bg-neutral-800/40 px-3.5 py-3 flex items-center justify-between gap-2"
            >
              <div className="min-w-0">
                <p className="text-xs font-semibold text-white leading-tight">{feature.name}</p>
                <p className="text-[10px] text-neutral-500 leading-tight mt-0.5 truncate">{feature.desc}</p>
              </div>
              <Toggle on={feature.on} />
            </div>
          ))}
        </div>

        {/* Frustration tracking — full width, disabled */}
        <div className="rounded-lg border border-dashed border-neutral-700 bg-neutral-800/20 px-3.5 py-3 flex items-center justify-between gap-2">
          <div>
            <p className="text-xs font-semibold text-white leading-tight">Frustration tracking</p>
            <p className="text-[10px] text-neutral-500 leading-tight mt-0.5">Rage clicks &amp; dead clicks &middot; Loads separate add-on script</p>
          </div>
          <Toggle on={false} />
        </div>

        {/* Visitor identity */}
        <div>
          <h4 className="text-sm font-bold text-white mb-1">Visitor identity</h4>
          <p className="text-[10px] text-neutral-500 mb-3 leading-relaxed">
            How returning visitors are recognized. Stricter settings increase privacy but may raise unique visitor counts.
          </p>
          <div className="flex items-center gap-3">
            <div>
              <p className="text-[10px] text-neutral-400 mb-1">Recognition</p>
              <div className="flex items-center gap-1.5 rounded-lg border border-neutral-700 bg-neutral-800/60 px-3 py-1.5 text-xs text-white">
                Across all tabs
                <svg className="w-3 h-3 text-neutral-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
              </div>
            </div>
            <div>
              <p className="text-[10px] text-neutral-400 mb-1">Reset after</p>
              <div className="flex items-center gap-1.5 rounded-lg border border-neutral-700 bg-neutral-800/60 px-3 py-1.5 text-xs text-white">
                24 hours
                <svg className="w-3 h-3 text-neutral-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
              </div>
            </div>
          </div>
        </div>

        {/* Setup guide */}
        <div>
          <div className="flex items-center justify-between mb-2.5">
            <h4 className="text-sm font-bold text-white">Setup guide</h4>
            <span className="text-[10px] text-neutral-500">All integrations &rarr;</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {[
              { name: 'Next.js', icon: <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-current invert"><path d="M18.665 21.978C16.758 23.255 14.465 24 12 24 5.377 24 0 18.623 0 12S5.377 0 12 0s12 5.377 12 12c0 3.583-1.574 6.801-4.067 9.001L9.219 7.2H7.2v9.596h1.615V9.251l9.85 12.727Zm-3.332-8.533 1.6 2.061V7.2h-1.6v6.245Z" /></svg> },
              { name: 'React', icon: <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" style={{ fill: '#61DAFB' }}><path d="M14.23 12.004a2.236 2.236 0 0 1-2.235 2.236 2.236 2.236 0 0 1-2.236-2.236 2.236 2.236 0 0 1 2.235-2.236 2.236 2.236 0 0 1 2.236 2.236zm2.648-10.69c-1.346 0-3.107.96-4.888 2.622-1.78-1.653-3.542-2.602-4.887-2.602-.31 0-.592.068-.846.182a1.993 1.993 0 0 0-.909.916C4.78 3.522 5.1 5.18 6.138 7.11 4.257 8.17 3 9.733 3 11.1c0 2.176 2.714 3.757 6.528 4.025-.172.583-.264 1.197-.264 1.833 0 3.235 2.33 5.862 5.204 5.862.876 0 1.699-.249 2.404-.68l-.766-1.289a3.268 3.268 0 0 1-1.638.44c-1.834 0-3.318-1.786-3.318-3.99 0-.42.05-.828.143-1.218 3.61-.179 6.373-1.664 6.573-3.842.685 1.56 1.057 3.024 1.057 4.168 0 .756-.165 1.344-.5 1.708l1.195 1.164c.694-.74 1.048-1.732 1.048-2.872 0-1.504-.536-3.346-1.487-5.294C20.836 8.794 22 7.482 22 5.862c0-2.393-2.272-4.548-5.122-4.548zM7.632 3.19c.395-.193.893-.29 1.478-.29.873 0 1.928.402 3.083 1.136-1.072 1.096-2.06 2.37-2.907 3.765a21.872 21.872 0 0 0-2.36.488c-.888-1.585-1.253-2.978-1.087-3.84a.91.91 0 0 1 .282-.517c.14-.132.308-.204.511-.204v-.538zm12.736 2.672c0 1.076-.897 2.142-2.347 3.007a22.076 22.076 0 0 0-2.377-3.3c1.225-.857 2.333-1.36 3.228-1.36.268 0 .502.047.706.135.288.124.504.337.605.612.076.207.185.525.185.906zM12 15.9c-2.14 0-4.028-.362-5.49-.943a9.09 9.09 0 0 1-.53-.235C4.949 14.068 4.2 13.27 4.2 12.3c0-1.14 1.268-2.498 3.3-3.39.287.81.626 1.647 1.015 2.494a21.27 21.27 0 0 0 1.534 2.682 20.258 20.258 0 0 0 3.902.057 21.27 21.27 0 0 0 1.535-2.682c.388-.847.727-1.684 1.015-2.494 2.032.892 3.3 2.25 3.3 3.39 0 .97-.75 1.769-1.78 2.422a9.09 9.09 0 0 1-.53.235c-1.462.581-3.35.943-5.49.943z" /></svg> },
              { name: 'Vue.js', icon: <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" style={{ fill: '#4FC08D' }}><path d="M24,1.61H14.06L12,5.16,9.94,1.61H0L12,22.39ZM12,14.08,5.16,2.23H9.59L12,6.41l2.41-4.18h4.43Z" /></svg> },
              { name: 'Angular', icon: <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-current invert"><path d="M16.712 17.711H7.288l-1.204 2.916L12 24l5.916-3.373-1.204-2.916ZM14.692 0l7.832 16.855.814-12.856L14.692 0ZM9.308 0 .662 3.999l.814 12.856L9.308 0Zm-.405 13.93h6.198L12 6.396 8.903 13.93Z" /></svg> },
              { name: 'Svelte', icon: <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" style={{ fill: '#FF3E00' }}><path d="M20.68 3.17a7.3 7.3 0 0 0-9.8-2.1L6.17 4.38A5.81 5.81 0 0 0 3.5 8.29a6 6 0 0 0 .62 3.77 5.7 5.7 0 0 0-.86 2.13 6.14 6.14 0 0 0 1.06 4.64 7.3 7.3 0 0 0 9.8 2.1l4.71-3.31a5.81 5.81 0 0 0 2.67-3.91 6 6 0 0 0-.62-3.77 5.7 5.7 0 0 0 .86-2.13 6.14 6.14 0 0 0-1.06-4.64z" /></svg> },
              { name: 'Nuxt', icon: <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" style={{ fill: '#00DC82' }}><path d="M13.464 20.48H2.182a1.49 1.49 0 0 1-1.288-.746 1.49 1.49 0 0 1 0-1.49L7.537 6.584a1.49 1.49 0 0 1 2.576 0l1.635 2.835.002.004 3.005 5.21a.4.4 0 0 1-.345.597H8.862a.4.4 0 0 0-.346.598l2.158 3.749a.4.4 0 0 0 .693 0l5.78-10.028a.4.4 0 0 1 .693 0l6.287 10.903a.4.4 0 0 1-.347.598h-3.49" /></svg> },
              { name: 'Remix', icon: <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-current invert"><path d="M21.511 18.508c.216 2.773.216 4.073.216 5.492H15.31c0-.309.006-.592.011-.878.018-.892.036-1.821-.109-3.698-.19-2.747-1.374-3.358-3.55-3.358H1.574v-5h10.396c2.748 0 4.122-.835 4.122-3.049 0-1.946-1.374-3.125-4.122-3.125H1.573V0h11.541c6.221 0 9.313 2.938 9.313 7.632 0 3.511-2.176 5.8-5.114 6.182 2.48.497 3.93 1.909 4.198 4.694ZM1.573 24v-3.727h6.784c1.133 0 1.379.84 1.379 1.342V24Z" /></svg> },
              { name: 'Astro', icon: <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" style={{ fill: '#BC52EE' }}><path d="M8.358 20.162c-1.186-1.07-1.532-3.316-1.038-4.944.71 1.12 1.74 1.846 2.9 2.13 1.79.438 3.638.423 5.39-.152.198-.065.384-.156.6-.246-.032.846-.241 1.62-.72 2.313-.717 1.04-1.722 1.627-2.945 1.795-1.414.194-2.697-.126-3.886-1.048-.107-.088-.2-.191-.3-.29v.442Z" /></svg> },
            ].map((fw) => (
              <span
                key={fw.name}
                className="flex items-center gap-1.5 rounded-lg border border-neutral-700 bg-neutral-800/60 px-2.5 py-1.5 text-[10px] text-neutral-300"
              >
                {fw.icon}
                {fw.name}
              </span>
            ))}
          </div>
        </div>

        {/* Verified status */}
        <div className="flex items-center gap-2 pt-1">
          <span className="flex items-center gap-1.5 rounded-lg border border-green-500/20 bg-green-500/5 px-2.5 py-1 text-[10px] text-green-400 font-medium">
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
            Verified
          </span>
          <span className="text-[10px] text-neutral-500">Your site is sending data correctly.</span>
        </div>
      </div>
    </div>
  )
}
