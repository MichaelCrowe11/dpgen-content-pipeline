from fastapi import FastAPI
from fastapi.responses import HTMLResponse
import os

app = FastAPI(title="DPGen Content Pipeline")

@app.get("/", response_class=HTMLResponse)
async def root():
    return """
    <!DOCTYPE html>
    <html>
    <head>
        <title>DeepParallel - AI Content Pipeline</title>
        <style>
            body {
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                display: flex;
                align-items: center;
                justify-content: center;
                height: 100vh;
                margin: 0;
            }
            .container {
                text-align: center;
                padding: 2rem;
                background: rgba(0,0,0,0.2);
                border-radius: 20px;
                backdrop-filter: blur(10px);
            }
            h1 { font-size: 3rem; margin-bottom: 1rem; }
            p { font-size: 1.2rem; opacity: 0.9; }
            .status { 
                background: #00d084; 
                display: inline-block;
                padding: 0.5rem 1rem;
                border-radius: 25px;
                margin-top: 1rem;
            }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>🚀 DeepParallel</h1>
            <p>AI-Powered Content Generation Pipeline</p>
            <div class="status">✅ System Online</div>
            <p style="margin-top: 2rem; font-size: 0.9rem;">
                API Endpoints: /health | /api/generate | /docs
            </p>
        </div>
    </body>
    </html>
    """

@app.get("/health")
async def health():
    return {"status": "healthy", "service": "dpgen-renderer"}

@app.get("/api/info")
async def info():
    return {
        "name": "DPGen Content Pipeline",
        "version": "1.0.0",
        "domain": "deepparallel.org",
        "status": "operational"
    }

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8080))
    uvicorn.run(app, host="0.0.0.0", port=port)