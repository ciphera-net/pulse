export default function SecurityPage() {
  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <h1 className="text-3xl font-bold mb-6 text-neutral-900 dark:text-white">
        Security & Privacy
      </h1>
      
      <div className="prose prose-neutral dark:prose-invert max-w-none">
        <h2 className="text-2xl font-semibold mt-8 mb-4 text-neutral-900 dark:text-white">
          Data Protection
        </h2>
        <p className="text-neutral-600 dark:text-neutral-400 mb-4">
          Ciphera Analytics is built with security and privacy as core principles:
        </p>
        <ul className="list-disc list-inside space-y-2 text-neutral-600 dark:text-neutral-400 mb-6">
          <li>All data is encrypted in transit using TLS/SSL</li>
          <li>No personal data is collected or stored</li>
          <li>IP addresses are hashed immediately and not stored</li>
          <li>No cookies or persistent identifiers are used</li>
          <li>Data is processed anonymously</li>
        </ul>
        
        <h2 className="text-2xl font-semibold mt-8 mb-4 text-neutral-900 dark:text-white">
          Compliance
        </h2>
        <p className="text-neutral-600 dark:text-neutral-400 mb-4">
          Ciphera Analytics is compliant with:
        </p>
        <ul className="list-disc list-inside space-y-2 text-neutral-600 dark:text-neutral-400 mb-6">
          <li>GDPR (General Data Protection Regulation)</li>
          <li>CCPA (California Consumer Privacy Act)</li>
          <li>PECR (Privacy and Electronic Communications Regulations)</li>
        </ul>
        
        <h2 className="text-2xl font-semibold mt-8 mb-4 text-neutral-900 dark:text-white">
          Infrastructure Security
        </h2>
        <p className="text-neutral-600 dark:text-neutral-400 mb-4">
          Our infrastructure follows security best practices:
        </p>
        <ul className="list-disc list-inside space-y-2 text-neutral-600 dark:text-neutral-400 mb-6">
          <li>Regular security audits and updates</li>
          <li>Secure data centers with physical security</li>
          <li>Automated backups and disaster recovery</li>
          <li>Rate limiting and DDoS protection</li>
          <li>Secure authentication and authorization</li>
        </ul>
        
        <h2 className="text-2xl font-semibold mt-8 mb-4 text-neutral-900 dark:text-white">
          Your Data, Your Control
        </h2>
        <p className="text-neutral-600 dark:text-neutral-400 mb-4">
          You have full control over your analytics data. You can delete sites and all 
          associated data at any time. We never share your data with third parties.
        </p>
      </div>
    </div>
  )
}
