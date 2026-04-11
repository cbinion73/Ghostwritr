export const STAGE_LINKS = [
  { key: "LIBRARY", label: "Library", href: (_slug: string) => "/" },
  { key: "DASHBOARD", label: "Dashboard", href: (slug: string) => `/books/${slug}/dashboard` },
  { key: "BOOK_SETUP", label: "Book Setup", href: (slug: string) => `/books/${slug}/setup` },
  { key: "PROMISE", label: "Promise", href: (slug: string) => `/books/${slug}/promise` },
  { key: "OUTLINE", label: "Outline", href: (slug: string) => `/books/${slug}/outline` },
  { key: "BASE_STORY", label: "Base Story", href: (slug: string) => `/books/${slug}/base-story` },
  { key: "RESEARCH", label: "Research", href: (slug: string) => `/books/${slug}/research` },
  {
    key: "EXTERNAL_STORIES",
    label: "External Stories",
    href: (slug: string) => `/books/${slug}/external-stories`,
  },
  {
    key: "PERSONAL_STORIES",
    label: "Personal Stories",
    href: (slug: string) => `/books/${slug}/personal-stories`,
  },
  {
    key: "CHAPTER_DRAFT",
    label: "Chapter Draft",
    href: (slug: string) => `/books/${slug}/chapter-draft`,
  },
  { key: "EDITING", label: "Editing", href: (slug: string) => `/books/${slug}/outline` },
] as const;
