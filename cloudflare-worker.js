// Cloudflare Worker to proxy API requests to Google Cloud Run
// This bypasses the organization policy restrictions

addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request))
})

async function handleRequest(request) {
  const url = new URL(request.url)
  
  // CORS headers for browser access
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
  }

  // Handle CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  // Route API requests to Cloud Run
  if (url.pathname.startsWith('/api/')) {
    const apiUrl = `https://dpgen-renderer-29690876826.us-central1.run.app${url.pathname}`
    
    try {
      const apiResponse = await fetch(apiUrl, {
        method: request.method,
        headers: request.headers,
        body: request.method !== 'GET' ? request.body : undefined,
      })
      
      const response = new Response(apiResponse.body, {
        status: apiResponse.status,
        statusText: apiResponse.statusText,
        headers: {
          ...Object.fromEntries(apiResponse.headers),
          ...corsHeaders
        }
      })
      
      return response
    } catch (error) {
      return new Response(JSON.stringify({ 
        error: 'API Gateway Error',
        message: error.message,
        service: 'DeepParallel Pipeline'
      }), {
        status: 502,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      })
    }
  }

  // Health check endpoint
  if (url.pathname === '/health') {
    return new Response(JSON.stringify({ 
      status: 'healthy',
      service: 'DeepParallel Cloudflare Worker',
      upstream: 'https://dpgen-renderer-29690876826.us-central1.run.app'
    }), {
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders
      }
    })
  }

  // Default response for other paths
  return new Response('DeepParallel API Gateway', {
    status: 200,
    headers: {
      'Content-Type': 'text/plain',
      ...corsHeaders
    }
  })
}