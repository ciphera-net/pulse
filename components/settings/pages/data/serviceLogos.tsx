'use client'

// The three services' own marks (R9: a platform's own logo, in its own colours), drawn by the kit's row at 16 px.
// Copied from today's Integrations tab, which goes when the routes move to this page.

export function GoogleIcon() {
  return (
    <svg className="w-5 h-5" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
  )
}

export function BunnyIcon() {
  return (
    <svg className="w-5 h-5" viewBox="0 0 23 26" fill="none" aria-hidden="true">
      <path fillRule="evenodd" clipRule="evenodd" d="M9.94 7.77l5.106.883c-3.83-.663-4.065-3.85-9.218-6.653-.562 1.859.603 5.21 4.112 5.77z" fill="url(#data-bunny-b1)"/>
      <path fillRule="evenodd" clipRule="evenodd" d="M5.828 2c5.153 2.803 5.388 5.99 9.218 6.653 1.922.332.186 3.612-1.864 3.266 3.684 1.252 7.044-2.085 5.122-3.132L5.828 2z" fill="url(#data-bunny-b2)"/>
      <path fillRule="evenodd" clipRule="evenodd" d="M13.186 11.92c-.241-.041-.486-.131-.731-.284-1.542-.959-3.093-1.269-4.496-1.118 2.93.359 5.716 4.196 5.37 7.036.06.97-.281 1.958-1.021 2.699l-1.69 1.69c1.303.858 3.284-.037 3.889-1.281l3.41-7.014c.836-.198 6.176-1.583 3.767-3.024l-3.37-1.833c1.907 1.05-1.449 4.378-5.125 3.129z" fill="url(#data-bunny-b3)"/>
      <path fillRule="evenodd" clipRule="evenodd" d="M7.953 10.518c-4.585.499-7.589 5.94-3.506 9.873l3.42 3.42c-2.243-2.243-2.458-5.525-1.073-7.806.149-.255.333-.495.551-.713 1.37-1.37 3.59-1.37 4.96 0 .629.628.969 1.436 1.02 2.26.346-2.84-2.439-6.675-5.367-7.035h-.005z" fill="url(#data-bunny-b4)"/>
      <path fillRule="evenodd" clipRule="evenodd" d="M7.868 23.812l1.925 1.925c.643-.511 1.028-2.01.031-3.006l-2.48-2.48c-1.151-1.151-1.334-2.903-.55-4.246-1.385 2.281-1.17 5.563 1.074 7.807z" fill="url(#data-bunny-b5)"/>
      <path fillRule="evenodd" clipRule="evenodd" d="M12.504 4.54l5.739 3.122L12.925.6c-.728.829-1.08 2.472-.421 3.94z" fill="url(#data-bunny-b6)"/>
      <circle cx="9.825" cy="17.772" r="1.306" fill="url(#data-bunny-b7)"/>
      <circle cx="1.507" cy="11.458" r="1.306" fill="url(#data-bunny-b8)"/>
      <defs>
        <linearGradient id="data-bunny-b1" x1="5.69" y1="8.5" x2="15.04" y2="8.5" gradientUnits="userSpaceOnUse"><stop stopColor="#FFA600"/><stop offset=".34" stopColor="#FF9F00"/><stop offset=".69" stopColor="#FF7300"/><stop offset="1" stopColor="#F52900"/></linearGradient>
        <linearGradient id="data-bunny-b2" x1="5.83" y1="12.65" x2="18.87" y2="12.65" gradientUnits="userSpaceOnUse"><stop stopColor="#FFA600"/><stop offset=".34" stopColor="#FF9F00"/><stop offset=".69" stopColor="#FF7300"/><stop offset="1" stopColor="#F52900"/></linearGradient>
        <linearGradient id="data-bunny-b3" x1="7.95" y1="22.04" x2="22.3" y2="22.04" gradientUnits="userSpaceOnUse"><stop stopColor="#FFA600"/><stop offset=".34" stopColor="#FF9F00"/><stop offset="1" stopColor="#FF6200"/></linearGradient>
        <linearGradient id="data-bunny-b4" x1="2.51" y1="22.59" x2="13.35" y2="22.59" gradientUnits="userSpaceOnUse"><stop stopColor="#FFA600"/><stop offset=".34" stopColor="#FF9F00"/><stop offset=".69" stopColor="#FF7300"/><stop offset="1" stopColor="#F52900"/></linearGradient>
        <linearGradient id="data-bunny-b5" x1="11.35" y1="20.74" x2="7.98" y2="17.71" gradientUnits="userSpaceOnUse"><stop stopColor="#FFA600"/><stop offset=".34" stopColor="#FF9F00"/><stop offset=".69" stopColor="#FF7300"/><stop offset="1" stopColor="#F52900"/></linearGradient>
        <linearGradient id="data-bunny-b6" x1="12.16" y1="7.48" x2="18.24" y2="7.48" gradientUnits="userSpaceOnUse"><stop stopColor="#FFA600"/><stop offset=".34" stopColor="#FF9F00"/><stop offset="1" stopColor="#FF6200"/></linearGradient>
        <linearGradient id="data-bunny-b7" x1="8.52" y1="19.08" x2="11.13" y2="19.08" gradientUnits="userSpaceOnUse"><stop stopColor="#FFA600"/><stop offset=".34" stopColor="#FF9F00"/><stop offset="1" stopColor="#FF6200"/></linearGradient>
        <linearGradient id="data-bunny-b8" x1=".2" y1="12.76" x2="2.81" y2="12.76" gradientUnits="userSpaceOnUse"><stop stopColor="#FFA600"/><stop offset=".34" stopColor="#FF9F00"/><stop offset="1" stopColor="#FF6200"/></linearGradient>
      </defs>
    </svg>
  )
}

/** The Microsoft Bing mark (simple-icons), single colour: it takes the row's ink. */
export function BingIcon() {
  return (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M20.176 15.406a6.48 6.48 0 01-1.736 4.414c1.338-1.47.803-3.869-1.003-4.635-.862-.305-2.488-.85-3.367-1.158a1.834 1.834 0 01-.932-.818c-.381-.975-1.163-2.968-1.548-3.948-.095-.285-.31-.625-.265-.938.046-.598.724-1.003 1.276-.754l3.682 1.888c.621.292 1.305.692 1.796 1.172a6.486 6.486 0 012.097 4.777zm-1.44 1.888c-.264-1.194-1.135-1.744-2.216-2.028-1.527.902-4.853 2.878-6.952 4.13-1.103.68-2.13 1.35-2.919 1.242a2.866 2.866 0 01-2.77-2.325c-.012-.048-.008-.03-.001.01a6.4 6.4 0 00.947 2.653 6.498 6.498 0 005.486 3.022c1.908.062 3.536-1.153 5.099-2.096.292-.188.804-.496 1.332-.831l1.423-1.51c.553-.577.764-1.426.571-2.267zm-12.04 2.97c.422 0 .822-.1 1.173-.29.355-.215.964-.579 1.7-1.018L9.57 4.502c0-.99-.497-1.864-1.257-2.382-.08-.059-2.91-1.901-2.99-1.956-.605-.432-1.523.045-1.5.797v14.887l.417 2.36a2.488 2.488 0 002.455 2.056z" />
    </svg>
  )
}
