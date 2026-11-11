// Server-side Netlify scheduled function. This file does not run in the browser.
// Requires optional-scheduled-backups.sql and a server-only service-role key.
export const config = { schedule: '0 2 * * *' } // Daily 02:00 UTC

export default async function () {
  const base = (process.env.SUPABASE_URL || '').replace(/\/+$/,'')
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!base || !/^https:\/\/[^/]+\.supabase\.co$/.test(base) || !secret) {
    console.error('Nightly backups are not configured; set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in Netlify server environment settings.')
    return new Response('Backup configuration missing', {status:503})
  }
  try {
    const result = await fetch(`${base}/rest/v1/rpc/agency_backup_all`, {
      method:'POST',
      headers:{apikey:secret,Authorization:`Bearer ${secret}`,'Content-Type':'application/json'},
      body:'{}',
      signal:AbortSignal.timeout(25000)
    })
    if (!result.ok) {
      console.error('Nightly backup failed; check the Supabase function and server configuration. HTTP status:',result.status)
      return new Response('Backup failed',{status:502})
    }
    console.info('Nightly backup completed successfully.')
    return new Response('Backup complete',{status:200})
  } catch (error) {
    console.error('Nightly backup connection failed:',error instanceof Error?error.name:'Unknown error')
    return new Response('Backup unavailable',{status:502})
  }
}
