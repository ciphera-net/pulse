declare module 'iso-3166-2' {
  interface SubdivisionInfo {
    name: string
    type: string
    parent?: string
  }

  interface CountryInfo {
    name: string
    sub: Record<string, SubdivisionInfo>
  }

  const iso3166: {
    data: Record<string, CountryInfo>
    country(code: string): CountryInfo | undefined
    subdivision(code: string): SubdivisionInfo | undefined
    codes: string[]
  }

  export default iso3166
}
