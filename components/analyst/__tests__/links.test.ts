import { describe, expect, it } from 'vitest'
import { answerLinkAllowed, webResultURLs } from '../links'

const BASE = 'https://pulse.ciphera.net'

// * Plan §4c: an answer that read the web may link to the site's own pages, Ciphera's hosts and the exact pages its own
// * web searches returned, so a page cannot make Analyst write a link that carries the site's figures somewhere else.
describe('the links an answer may carry', () => {
  const web = new Set(
    webResultURLs([
      {
        type: 'tool-call',
        toolName: 'search_web',
        result: {
          tool: 'search_web',
          result: { results: [{ url: 'https://news.example.org/story-1/' }, { url: 'https://news.example.org/a?b=1#top' }, { url: 'javascript:alert(1)' }, { url: 7 }] },
        },
      },
      { type: 'tool-call', toolName: 'get_stats', result: { result: { results: [{ url: 'https://stats.example/' }] } } },
      { type: 'tool-call', toolName: 'search_web' },
      { type: 'text', text: 'https://text.example/' },
      null,
    ]),
  )

  it("reads the addresses of the web searches' results only, without a trailing slash or a fragment", () => {
    expect([...web]).toEqual(['https://news.example.org/story-1', 'https://news.example.org/a?b=1'])
  })

  it("allows the site's own pages, Ciphera's hosts and the exact pages the web searches returned", () => {
    for (const href of [
      'https://example.com/pricing',
      'https://www.example.com/',
      'https://blog.example.com/post',
      'https://pulse.ciphera.net/sites/s1/pages',
      'https://ciphera.net',
      '/sites/s1/pages',
      'https://news.example.org/story-1',
      'https://news.example.org/story-1#section',
      'https://news.example.org/a?b=1',
    ]) {
      expect(answerLinkAllowed(href, 'www.example.com', web, BASE), href).toBe(true)
    }
  })

  it('draws anything else as words, an address that adds data to a page the search returned included', () => {
    for (const href of [
      undefined,
      '',
      'https://news.example.org/story-1?d=56',
      'https://news.example.org/other',
      'https://evil.example/collect?d=56',
      'https://example.com.evil.example/',
      'https://notexample.com/',
      'https://ciphera.net.evil.example/',
      'javascript:alert(1)',
      'mailto:someone@example.com',
      'data:text/html,hello',
      'ftp://example.com/file',
      'http://[bad',
    ]) {
      expect(answerLinkAllowed(href, 'www.example.com', web, BASE), String(href)).toBe(false)
    }
  })

  it("links no site page while the site's domain is unknown, and Ciphera's hosts still", () => {
    expect(answerLinkAllowed('https://example.com/', null, new Set(), BASE)).toBe(false)
    expect(answerLinkAllowed('https://pulse.ciphera.net/', null, new Set(), BASE)).toBe(true)
  })
})
