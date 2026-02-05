'use client'

import { motion } from 'framer-motion'
import { CheckCircleIcon, XIcon } from '@ciphera-net/ui'

function ComparisonTable({ title, competitors }: { title: string, competitors: { name: string, isPulse: boolean, features: Record<string, boolean | string> }[] }) {
  const allFeatures = [
    "Cookie Banner Required",
    "GDPR Compliant",
    "Script Size",
    "Data Ownership",
    "User Privacy",
    "UI Simplicity"
  ]

  return (
    <div className="mb-16">
      <h2 className="text-2xl font-bold mb-6 text-neutral-900 dark:text-white">{title}</h2>
      <div className="overflow-hidden rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white/50 dark:bg-neutral-900/50 backdrop-blur-sm">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-neutral-200 dark:border-neutral-800">
              <th className="p-4 sm:p-6 text-sm font-medium text-neutral-500">Feature</th>
              {competitors.map((comp) => (
                <th key={comp.name} className={`p-4 sm:p-6 text-sm font-bold ${comp.isPulse ? 'text-brand-orange' : 'text-neutral-900 dark:text-white'}`}>
                  {comp.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
            {allFeatures.map((feature) => (
              <tr key={feature} className="hover:bg-neutral-50/50 dark:hover:bg-neutral-800/50 transition-colors">
                <td className="p-4 sm:p-6 text-neutral-900 dark:text-white font-medium text-sm sm:text-base">{feature}</td>
                {competitors.map((comp) => {
                  const val = comp.features[feature]
                  return (
                    <td key={comp.name} className="p-4 sm:p-6 text-sm sm:text-base">
                      {val === true ? (
                        <CheckCircleIcon className="w-5 h-5 text-green-500" />
                      ) : val === false ? (
                        <XIcon className="w-5 h-5 text-red-500" />
                      ) : (
                        <span className={comp.isPulse ? 'text-green-500 font-medium' : 'text-neutral-600 dark:text-neutral-400'}>{val}</span>
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default function AboutPage() {
  return (
    <div className="relative min-h-screen flex flex-col overflow-hidden selection:bg-brand-orange/20">
      {/* * --- ATMOSPHERE (Background) --- */}
      <div className="absolute inset-0 -z-10 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-brand-orange/10 rounded-full blur-[128px] opacity-60" />
        <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] bg-neutral-500/10 dark:bg-neutral-400/10 rounded-full blur-[128px] opacity-40" />
        <div 
          className="absolute inset-0 bg-grid-pattern opacity-[0.02] dark:opacity-[0.05]"
          style={{ maskImage: 'radial-gradient(ellipse at center, black 0%, transparent 70%)' }}
        />
      </div>

      <div className="flex-grow w-full max-w-4xl mx-auto px-4 pt-20 pb-10 z-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="text-center mb-16"
        >
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-neutral-900 dark:text-white mb-6">
            Why Pulse?
          </h1>
          <p className="text-xl text-neutral-600 dark:text-neutral-400 max-w-2xl mx-auto leading-relaxed">
            We built Pulse because we were tired of complex, invasive analytics tools.
            Here is how we stack up against the giants.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="prose prose-neutral dark:prose-invert max-w-none mb-16"
        >
          <p className="text-lg text-neutral-600 dark:text-neutral-400">
            Most analytics tools are overkill. They track everything, slow down your site, and require annoying cookie banners. 
            Pulse is different. We focus on the metrics that actually matter—visitors, pageviews, and sources—while respecting user privacy.
          </p>
        </motion.div>

        {/* * Comparison: Pulse vs Google Analytics */}
        <ComparisonTable 
          title="Pulse vs. Google Analytics"
          competitors={[
            {
              name: "Pulse",
              isPulse: true,
              features: {
                "Cookie Banner Required": false,
                "GDPR Compliant": true,
                "Script Size": "< 1 KB",
                "Data Ownership": "Yours",
                "User Privacy": "100% Anonymous",
                "UI Simplicity": "Simple"
              }
            },
            {
              name: "Google Analytics 4",
              isPulse: false,
              features: {
                "Cookie Banner Required": true,
                "GDPR Compliant": "Complex",
                "Script Size": "45 KB+",
                "Data Ownership": "Google's",
                "User Privacy": "Invasive",
                "UI Simplicity": "Complex"
              }
            }
          ]}
        />

        {/* * Comparison: Pulse vs Plausible */}
        <ComparisonTable 
          title="Pulse vs. Plausible"
          competitors={[
            {
              name: "Pulse",
              isPulse: true,
              features: {
                "Cookie Banner Required": false,
                "GDPR Compliant": true,
                "Script Size": "< 1 KB",
                "Data Ownership": "Yours",
                "User Privacy": "100% Anonymous",
                "UI Simplicity": "Simple"
              }
            },
            {
              name: "Plausible",
              isPulse: false,
              features: {
                "Cookie Banner Required": false,
                "GDPR Compliant": true,
                "Script Size": "< 1 KB",
                "Data Ownership": "Yours",
                "User Privacy": "100% Anonymous",
                "UI Simplicity": "Simple"
              }
            }
          ]}
        />
        
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="mt-8 p-6 bg-neutral-100 dark:bg-neutral-800/50 rounded-xl border border-neutral-200 dark:border-neutral-800"
        >
          <h3 className="text-lg font-bold mb-2 text-neutral-900 dark:text-white">What about Plausible?</h3>
          <p className="text-neutral-600 dark:text-neutral-400 text-sm">
            We love Plausible! They paved the way for privacy-friendly analytics. 
            Pulse offers a similar philosophy but with a focus on even deeper integration with the Ciphera ecosystem 
            and more flexible pricing for developers.
          </p>
        </motion.div>

      </div>
    </div>
  )
}
