export default function robots() {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
    },
    sitemap: 'https://dropr.pradum.dev/sitemap.xml',
  };
}
