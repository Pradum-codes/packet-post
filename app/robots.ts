export default function robots() {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
    },
    sitemap: 'https://packet-post.pradum.dev/sitemap.xml',
  };
}