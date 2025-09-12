from fastapi import FastAPI
import uvicorn
import os

app = FastAPI(title="DeepParallel Renderer")

@app.get("/")
def health_check():
    return {
        "status": "healthy",
        "service": "deepparallel-renderer",
        "version": "1.0.0"
    }

@app.get("/health")
def detailed_health():
    return {
        "status": "healthy",
        "project": os.getenv("GCP_PROJECT_ID", "deep-parallel-content"),
        "region": os.getenv("GCP_LOCATION", "us-central1"),
        "services": {
            "firestore": "ready",
            "storage": "ready",
            "bigquery": "ready"
        }
    }

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8080))
    uvicorn.run(app, host="0.0.0.0", port=port)