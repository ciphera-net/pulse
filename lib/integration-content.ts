import fs from 'fs'
import path from 'path'
import matter from 'gray-matter'

const CONTENT_DIR = path.join(process.cwd(), 'content', 'integrations')

export interface IntegrationGuideMeta {
  slug: string
  title: string
  description: string
  category: string
  brandColor: string
  officialUrl: string
  relatedIds: string[]
  date: string
}

export interface IntegrationGuideArticle extends IntegrationGuideMeta {
  content: string
}

export function getIntegrationGuides(): IntegrationGuideMeta[] {
  if (!fs.existsSync(CONTENT_DIR)) return []

  const files = fs.readdirSync(CONTENT_DIR).filter((f) => f.endsWith('.mdx'))

  return files.map((filename) => {
    const slug = filename.replace(/\.mdx$/, '')
    const raw = fs.readFileSync(path.join(CONTENT_DIR, filename), 'utf-8')
    const { data } = matter(raw)

    return {
      slug,
      title: data.title,
      description: data.description,
      category: data.category,
      brandColor: data.brandColor,
      officialUrl: data.officialUrl,
      relatedIds: data.relatedIds || [],
      date: data.date,
    }
  })
}

export function getIntegrationGuide(slug: string): IntegrationGuideArticle | null {
  const filePath = path.join(CONTENT_DIR, `${slug}.mdx`)
  if (!fs.existsSync(filePath)) return null

  const raw = fs.readFileSync(filePath, 'utf-8')
  const { data, content } = matter(raw)

  return {
    slug,
    title: data.title,
    description: data.description,
    category: data.category,
    brandColor: data.brandColor,
    officialUrl: data.officialUrl,
    relatedIds: data.relatedIds || [],
    date: data.date,
    content,
  }
}
