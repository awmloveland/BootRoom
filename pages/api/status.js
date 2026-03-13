// Pages Router API - backup to test if API routes work on Vercel
export default function handler(req, res) {
  res.status(200).json({ ok: true, source: 'pages', ts: Date.now() })
}
