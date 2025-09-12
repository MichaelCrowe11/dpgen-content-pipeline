import os
import json
import subprocess
import tempfile
import uuid
from typing import List, Dict, Optional, Any
from datetime import datetime
import asyncio
from pathlib import Path
import time

from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from google.cloud import storage
from google.cloud import firestore
import ffmpeg
import webvtt
from logging_utils import get_logger

app = FastAPI(title="DeepParallel Video Renderer", version="1.0.0")
storage_client = storage.Client()
db = firestore.Client()
logger = get_logger()

# Quota configuration
MAX_DAILY_VIDEOS_PER_CHANNEL = int(os.getenv("MAX_DAILY_VIDEOS_PER_CHANNEL", "2"))

# Models
class Segment(BaseModel):
    clip_uri: str
    start_time: float
    end_time: float
    transition: Optional[str] = "cut"
    overlay_text: Optional[str] = None
    overlay_position: Optional[str] = "bottom"

class RenderRequest(BaseModel):
    job_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    channel_slug: str
    edl: List[Segment]
    voiceover_uri: str
    background_music_uri: Optional[str] = None
    captions_uri: Optional[str] = None
    output_bucket: str
    output_path: str
    aspect_ratio: str = "9:16"
    resolution: str = "1080p"
    fps: int = 30
    enable_captions: bool = True
    caption_style: Optional[Dict] = None
    watermark_uri: Optional[str] = None
    metadata: Optional[Dict] = None

class RenderStatus(BaseModel):
    job_id: str
    status: str  # pending, processing, completed, failed
    progress: float
    output_uri: Optional[str] = None
    error: Optional[str] = None
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    metadata: Optional[Dict] = None

# In-memory job tracker (use Redis in production)
jobs: Dict[str, RenderStatus] = {}
MAX_CONCURRENT = int(os.getenv("MAX_CONCURRENT_RENDERS", "3"))
_semaphore = asyncio.Semaphore(MAX_CONCURRENT)

def persist_job_status(job: RenderStatus):
    """Persist job status snapshot to Firestore (idempotent)."""
    try:
        doc_ref = db.collection("renders").document(job.job_id)
        payload = {
            "job_id": job.job_id,
            "status": job.status,
            "progress": job.progress,
            "output_uri": job.output_uri,
            "error": job.error,
            "channel_slug": job.metadata.get("channel_slug") if job.metadata else None,
            "updated_at": datetime.utcnow()
        }
        # Remove None values
        payload = {k: v for k, v in payload.items() if v is not None}
        doc_ref.set(payload, merge=True)
    except Exception as e:
        logger.error("persist_failed", extra={"job_id": job.job_id, "error": str(e)})

def update_session_status(session_id: str, status: str, output_uri: Optional[str] = None, error: Optional[str] = None):
    """Update production session document status if it exists."""
    try:
        doc_ref = db.collection("production_sessions").document(session_id)
        payload: Dict[str, Any] = {"status": status, "updated_at": datetime.utcnow()}
        if output_uri:
            payload["output_uri"] = output_uri
        if error:
            payload["error"] = error
        doc_ref.set(payload, merge=True)
    except Exception as e:
        logger.error("session_status_update_failed", extra={"session_id": session_id, "error": str(e)})

def count_channel_renders_today(channel_slug: str) -> Optional[int]:
    """Return count of renders started today for this channel (best-effort)."""
    try:
        utc_now = datetime.utcnow()
        start_day = utc_now.replace(hour=0, minute=0, second=0, microsecond=0)
        # Query renders collection (may need composite index in Firestore).
        query = (
            db.collection("renders")
              .where("channel_slug", "==", channel_slug)
              .where("created_at", ">=", start_day)
        )
        return len(list(query.stream()))
    except Exception as e:
        logger.error("quota_query_failed", extra={"channel": channel_slug, "error": str(e)})
        return None

def download_from_gcs(uri: str, local_path: str):
    """Download file from GCS URI to local path"""
    if not uri.startswith("gs://"):
        raise ValueError(f"Invalid GCS URI: {uri}")
    
    parts = uri[5:].split("/", 1)
    bucket_name = parts[0]
    blob_name = parts[1] if len(parts) > 1 else ""
    
    bucket = storage_client.bucket(bucket_name)
    blob = bucket.blob(blob_name)
    blob.download_to_filename(local_path)
    return local_path

def upload_to_gcs(local_path: str, bucket_name: str, blob_name: str) -> str:
    """Upload file to GCS and return URI"""
    bucket = storage_client.bucket(bucket_name)
    blob = bucket.blob(blob_name)
    blob.upload_from_filename(local_path)
    return f"gs://{bucket_name}/{blob_name}"

def get_resolution_params(resolution: str, aspect_ratio: str) -> Dict:
    """Get FFmpeg resolution parameters"""
    res_map = {
        "1080p": {"9:16": (1080, 1920), "16:9": (1920, 1080), "1:1": (1080, 1080)},
        "720p": {"9:16": (720, 1280), "16:9": (1280, 720), "1:1": (720, 720)},
        "480p": {"9:16": (480, 854), "16:9": (854, 480), "1:1": (480, 480)},
    }
    
    if resolution not in res_map:
        resolution = "1080p"
    if aspect_ratio not in res_map[resolution]:
        aspect_ratio = "9:16"
    
    width, height = res_map[resolution][aspect_ratio]
    return {"width": width, "height": height, "scale": f"{width}:{height}"}

def create_concat_filter(segments: List[Segment], fps: int) -> str:
    """Create FFmpeg concat filter complex"""
    filter_parts = []
    
    for i, seg in enumerate(segments):
        # Trim and scale each input
        filter_parts.append(f"[{i}:v]trim=start={seg.start_time}:end={seg.end_time},setpts=PTS-STARTPTS,fps={fps}[v{i}];")
        
        # Add text overlay if specified
        if seg.overlay_text:
            y_pos = "h-th-50" if seg.overlay_position == "bottom" else "50"
            filter_parts.append(
                f"[v{i}]drawtext=text='{seg.overlay_text}':fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf:"
                f"fontsize=48:fontcolor=white:borderw=2:bordercolor=black:x=(w-tw)/2:y={y_pos}[v{i}t];"
            )
    
    # Concatenate all video streams
    concat_inputs = "".join([f"[v{i}{'t' if s.overlay_text else ''}]" for i, s in enumerate(segments)])
    filter_parts.append(f"{concat_inputs}concat=n={len(segments)}:v=1:a=0[outv]")
    
    return "".join(filter_parts)

async def process_render(request: RenderRequest):
    """Main rendering pipeline with structured logging."""
    job_id = request.job_id
    jobs[job_id].status = "processing"
    jobs[job_id].started_at = datetime.utcnow()
    start_time = time.time()
    logger.info("render_start", extra={"job_id": job_id, "channel": request.channel_slug, "segments": len(request.edl)})

    async with _semaphore:
        with tempfile.TemporaryDirectory() as tmpdir:
            try:
                persist_job_status(jobs[job_id])
                # Download all assets
                clips = []
                for i, seg in enumerate(request.edl):
                    clip_path = os.path.join(tmpdir, f"clip_{i}.mp4")
                    download_from_gcs(seg.clip_uri, clip_path)
                    clips.append(clip_path)
                logger.info("assets_downloaded", extra={"job_id": job_id, "clip_count": len(clips)})

                vo_path = os.path.join(tmpdir, "voiceover.wav")
                download_from_gcs(request.voiceover_uri, vo_path)

                res_params = get_resolution_params(request.resolution, request.aspect_ratio)
                output_path = os.path.join(tmpdir, "output.mp4")

                filter_complex = create_concat_filter(request.edl, request.fps)
                cmd = ["ffmpeg", "-y"]
                for clip in clips:
                    cmd.extend(["-i", clip])
                cmd.extend(["-i", vo_path])
                cmd.extend(["-filter_complex", filter_complex])
                cmd.extend(["-map", "[outv]", "-map", f"{len(clips)}:a"])
                cmd.extend([
                    "-c:v", "libx264",
                    "-preset", "fast",
                    "-crf", "23",
                    "-pix_fmt", "yuv420p",
                    "-r", str(request.fps),
                ])
                cmd.extend([
                    "-c:a", "aac",
                    "-b:a", "128k",
                    "-ar", "44100",
                ])
                if request.metadata:
                    for key, value in request.metadata.items():
                        cmd.extend(["-metadata", f"{key}={value}"])
                cmd.append(output_path)

                jobs[job_id].progress = 0.3
                persist_job_status(jobs[job_id])
                logger.info("ffmpeg_invoke", extra={"job_id": job_id, "args": cmd})
                subprocess.run(cmd, capture_output=True, text=True, check=True)

                if request.enable_captions and request.captions_uri:
                    jobs[job_id].progress = 0.6
                    persist_job_status(jobs[job_id])
                    caption_path = os.path.join(tmpdir, "captions.vtt")
                    download_from_gcs(request.captions_uri, caption_path)
                    output_with_captions = os.path.join(tmpdir, "output_captioned.mp4")
                    subtitle_style = request.caption_style or {
                        "FontName": "Arial",
                        "FontSize": "24",
                        "PrimaryColour": "&H00FFFFFF",
                        "OutlineColour": "&H00000000",
                        "BorderStyle": "1",
                        "Outline": "2",
                        "Shadow": "0",
                        "MarginV": "20"
                    }
                    subtitle_filter = f"subtitles={caption_path}:force_style='" + ",".join([f"{k}={v}" for k, v in subtitle_style.items()]) + "'"
                    caption_cmd = [
                        "ffmpeg", "-y",
                        "-i", output_path,
                        "-vf", subtitle_filter,
                        "-c:a", "copy",
                        output_with_captions
                    ]
                    logger.info("ffmpeg_captions", extra={"job_id": job_id})
                    subprocess.run(caption_cmd, capture_output=True, text=True, check=True)
                    output_path = output_with_captions

                jobs[job_id].progress = 0.9
                persist_job_status(jobs[job_id])
                output_uri = upload_to_gcs(output_path, request.output_bucket, request.output_path)
                logger.info("upload_complete", extra={"job_id": job_id, "output_uri": output_uri})

                jobs[job_id].status = "completed"
                jobs[job_id].output_uri = output_uri
                jobs[job_id].progress = 1.0
                jobs[job_id].completed_at = datetime.utcnow()

                render_doc = {
                    "job_id": job_id,
                    "channel_slug": request.channel_slug,
                    "status": "completed",
                    "output_uri": output_uri,
                    "aspect_ratio": request.aspect_ratio,
                    "resolution": request.resolution,
                    "duration": sum(seg.end_time - seg.start_time for seg in request.edl),
                    "created_at": jobs[job_id].started_at,
                    "completed_at": jobs[job_id].completed_at,
                    "metadata": request.metadata or {}
                }
                db.collection("renders").document(job_id).set(render_doc, merge=True)
                persist_job_status(jobs[job_id])
                update_session_status(job_id, "completed", output_uri=output_uri)
                logger.info("render_complete", extra={"job_id": job_id, "elapsed_s": round(time.time() - start_time, 2)})
            except subprocess.CalledProcessError as e:
                jobs[job_id].status = "failed"
                jobs[job_id].error = f"FFmpeg error: {e.stderr}"
                persist_job_status(jobs[job_id])
                update_session_status(job_id, "failed", error=jobs[job_id].error)
                logger.error("ffmpeg_error", extra={"job_id": job_id, "stderr": e.stderr})
                raise
            except Exception as e:
                jobs[job_id].status = "failed"
                jobs[job_id].error = str(e)
                persist_job_status(jobs[job_id])
                update_session_status(job_id, "failed", error=jobs[job_id].error)
                logger.error("render_failed", extra={"job_id": job_id, "error": str(e)})
                raise

@app.get("/")
async def health():
    return {"status": "healthy", "service": "deepparallel-renderer", "version": "1.0.0"}

@app.post("/render", response_model=RenderStatus)
async def create_render(request: RenderRequest, background_tasks: BackgroundTasks):
    """Create a new render job"""
    # Quota check
    render_count = count_channel_renders_today(request.channel_slug)
    if render_count is not None and render_count >= MAX_DAILY_VIDEOS_PER_CHANNEL:
        logger.warning("quota_exceeded", extra={"channel": request.channel_slug, "count": render_count})
        raise HTTPException(status_code=429, detail=f"Daily render quota reached for channel {request.channel_slug}")
    
    # Initialize job status
    job_status = RenderStatus(
        job_id=request.job_id,
        status="pending",
        progress=0.0,
        metadata={**(request.metadata or {}), "channel_slug": request.channel_slug}
    )
    jobs[request.job_id] = job_status
    # Persist initial pending status
    persist_job_status(job_status)
    
    # Start background processing
    background_tasks.add_task(process_render, request)
    
    return job_status

@app.get("/render/{job_id}", response_model=RenderStatus)
async def get_render_status(job_id: str):
    """Get render job status"""
    if job_id not in jobs:
        # Try to fetch from Firestore
        doc = db.collection("renders").document(job_id).get()
        if doc.exists:
            data = doc.to_dict()
            return RenderStatus(
                job_id=job_id,
                status=data.get("status", "unknown"),
                progress=1.0 if data.get("status") == "completed" else 0.0,
                output_uri=data.get("output_uri"),
                started_at=data.get("created_at"),
                completed_at=data.get("completed_at"),
                metadata=data.get("metadata")
            )
        raise HTTPException(status_code=404, detail="Job not found")
    
    return jobs[job_id]

@app.post("/render/{job_id}/cancel")
async def cancel_render(job_id: str):
    """Cancel a render job"""
    if job_id not in jobs:
        raise HTTPException(status_code=404, detail="Job not found")
    
    if jobs[job_id].status in ["completed", "failed"]:
        return {"message": "Job already finished"}
    
    jobs[job_id].status = "cancelled"
    return {"message": "Job cancelled"}

@app.get("/jobs")
async def list_jobs(limit: int = 10, offset: int = 0):
    """List recent render jobs"""
    job_list = list(jobs.values())[offset:offset + limit]
    return {
        "jobs": job_list,
        "total": len(jobs),
        "limit": limit,
        "offset": offset
    }

@app.post("/batch-render")
async def batch_render(requests: List[RenderRequest], background_tasks: BackgroundTasks):
    """Create multiple render jobs"""
    job_ids = []
    
    for request in requests:
        render_count = count_channel_renders_today(request.channel_slug)
        if render_count is not None and render_count >= MAX_DAILY_VIDEOS_PER_CHANNEL:
            logger.warning("quota_exceeded_batch", extra={"channel": request.channel_slug, "count": render_count})
            continue
        job_status = RenderStatus(
            job_id=request.job_id,
            status="pending",
            progress=0.0,
            metadata={**(request.metadata or {}), "channel_slug": request.channel_slug}
        )
        jobs[request.job_id] = job_status
        persist_job_status(job_status)
        background_tasks.add_task(process_render, request)
        job_ids.append(request.job_id)
    
    return {"job_ids": job_ids, "count": len(job_ids)}

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8080))
    uvicorn.run(app, host="0.0.0.0", port=port)