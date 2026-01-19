export default function AboutPage() {
  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <h1 className="text-3xl font-bold mb-6 text-neutral-900 dark:text-white">
        About Ciphera Pulse
      </h1>
      
      <div className="prose prose-neutral dark:prose-invert max-w-none">
        <p className="text-lg text-neutral-600 dark:text-neutral-400 mb-4">
          Ciphera Pulse is a privacy-first web analytics platform that provides simple, 
          intuitive insights without compromising your visitors' privacy.
        </p>
        
        <h2 className="text-2xl font-semibold mt-8 mb-4 text-neutral-900 dark:text-white">
          Privacy-First Design
        </h2>
        <p className="text-neutral-600 dark:text-neutral-400 mb-4">
          We believe in privacy by design. Our analytics platform:
        </p>
        <ul className="list-disc list-inside space-y-2 text-neutral-600 dark:text-neutral-400 mb-6">
          <li>Uses no cookies or cross-session identifiers; sessionStorage is used only to group events within a single visit</li>
          <li>Respects Do Not Track preferences</li>
          <li>Complies with GDPR and CCPA regulations</li>
          <li>Does not collect personal data</li>
          <li>Processes data anonymously</li>
        </ul>
        
        <h2 className="text-2xl font-semibold mt-8 mb-4 text-neutral-900 dark:text-white">
          Simple & Lightweight
        </h2>
        <p className="text-neutral-600 dark:text-neutral-400 mb-4">
          Our tracking script is lightweight and won't slow down your website. 
          Get the insights you need without the bloat.
        </p>
      </div>
    </div>
  )
}
