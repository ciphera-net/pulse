import fs from 'fs'
import path from 'path'
import matter from 'gray-matter'

const CONTENT_DIR = path.join(process.cwd(), 'content', 'integrations')
const OUTPUT_PATH = path.join(process.cwd(), 'lib', 'integration-guides.gen.ts')

const files = fs.existsSync(CONTENT_DIR)
  ? fs.readdirSync(CONTENT_DIR).filter((f) => f.endsWith('.mdx'))
  : []

const guides: { slug: string; title: string; description: string; category: string; date: string }[] = []

for (const filename of files) {
  const slug = filename.replace(/\.mdx$/, '')
  const raw = fs.readFileSync(path.join(CONTENT_DIR, filename), 'utf-8')
  const { data } = matter(raw)
  guides.push({
    slug,
    title: data.title as string,
    description: data.description as string,
    category: data.category as string,
    date: data.date as string,
  })
}

guides.sort((a, b) => a.title.localeCompare(b.title))

const output = `// Auto-generated from content/integrations/*.mdx — do not edit manually
// Run: npm run generate:integrations

export interface IntegrationGuideSummary {
  slug: string
  title: string
  description: string
  category: string
  date: string
}

export const integrationGuides: IntegrationGuideSummary[] = ${JSON.stringify(guides, null, 2)}
`

fs.writeFileSync(OUTPUT_PATH, output, 'utf-8')
console.log(`Generated ${guides.length} integration guides → lib/integration-guides.gen.ts`)
