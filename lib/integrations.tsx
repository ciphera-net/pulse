/**
 * The integration registry — install snippets, support tiers, the
 * "unsupported ⇒ no snippet, must carry a note" invariant (D35), relatedIds —
 * lives in @ciphera-net/pulse-integrations (PULSE-158, D42), so the dashboard
 * and the marketing app (ciphera-net/pulse-website) share ONE source of the
 * support commitments instead of two copies that drift. This module keeps the
 * dashboard's import path; its surface is exactly what it exported before the
 * extraction (the package's byte-identity snapshot was taken from this file).
 * Change the registry in ciphera-net/pulse-integrations, then bump it here.
 */
export {
  categoryLabels,
  categoryOrder,
  SNIPPET_FLAG_TOKEN,
  SNIPPET_INTERACTIONS_TOKEN,
  renderSnippet,
  integrations,
  getIntegration,
  isInstallUnsupported,
  getGroupedIntegrations,
  supportTierLabels,
  supportTierDescriptions,
  getPickerIntegrations,
  integrationDocsUrl,
} from '@ciphera-net/pulse-integrations'
export type {
  IntegrationCategory,
  SupportTier,
  InstallMethod,
  FrameworkSnippet,
  InstallMeta,
  Integration,
} from '@ciphera-net/pulse-integrations'
