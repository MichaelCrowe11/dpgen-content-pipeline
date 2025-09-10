import os
import json
import subprocess
import tempfile
import uuid
from typing import List, Dict, Optional, Any
from datetime import datetime
import asyncio
from pathlib import Path

from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from google.cloud import storage
from google.cloud import firestore
import ffmpeg
import webvtt

app = FastAPI(title="DPGen Video Renderer", version="1.0.0")
storage_client = storage.Client()
db = firestore.Client()

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
    """Main rendering pipeline"""
    job_id = request.job_id
    jobs[job_id].status = "processing"
    jobs[job_id].started_at = datetime.utcnow()
    
    with tempfile.TemporaryDirectory() as tmpdir:
        try:
            # Download all assets
            clips = []
            for i, seg in enumerate(request.edl):
                clip_path = os.path.join(tmpdir, f"clip_{i}.mp4")
                download_from_gcs(seg.clip_uri, clip_path)
                clips.append(clip_path)
            
            vo_path = os.path.join(tmpdir, "voiceover.wav")
            download_from_gcs(request.voiceover_uri, vo_path)
            
            # Build FFmpeg command
            res_params = get_resolution_params(request.resolution, request.aspect_ratio)
            output_path = os.path.join(tmpdir, "output.mp4")
            
            # Create filter complex
            filter_complex = create_concat_filter(request.edl, request.fps)
            
            # Build FFmpeg command
            cmd = ["ffmpeg", "-y"]
            
            # Add video inputs
            for clip in clips:
                cmd.extend(["-i", clip])
            
            # Add audio input
            cmd.extend(["-i", vo_path])
            
            # Add filter complex
            cmd.extend(["-filter_complex", filter_complex])
            
            # Map outputs
            cmd.extend(["-map", "[outv]", "-map", f"{len(clips)}:a"])
            
            # Video encoding settings
            cmd.extend([
                "-c:v", "libx264",
                "-preset", "fast",
                "-crf", "23",
                "-pix_fmt", "yuv420p",
                "-r", str(request.fps),
            ])
            
            # Audio encoding settings
            cmd.extend([
                "-c:a", "aac",
                "-b:a", "128k",
                "-ar", "44100",
            ])
            
            # Add metadata
            if request.metadata:
                for key, value in request.metadata.items():
                    cmd.extend(["-metadata", f"{key}={value}"])
            
            # Output file
            cmd.append(output_path)
            
            # Execute FFmpeg
            jobs[job_id].progress = 0.3
            result = subprocess.run(cmd, capture_output=True, text=True, check=True)
            
            # Add captions if enabled
            if request.enable_captions and request.captions_uri:
                jobs[job_id].progress = 0.6
                caption_path = os.path.join(tmpdir, "captions.vtt")
                download_from_gcs(request.captions_uri, caption_path)
                
                # Burn in subtitles
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
                
                subtitle_filter = f"subtitles={caption_path}:force_style='"
                subtitle_filter += ",".join([f"{k}={v}" for k, v in subtitle_style.items()])
                subtitle_filter += "'"
                
                caption_cmd = [
                    "ffmpeg", "-y",
                    "-i", output_path,
                    "-vf", subtitle_filter,
                    "-c:a", "copy",
                    output_with_captions
                ]
                
                subprocess.run(caption_cmd, capture_output=True, text=True, check=True)
                output_path = output_with_captions
            
            # Upload to GCS
            jobs[job_id].progress = 0.9
            output_uri = upload_to_gcs(
                output_path,
                request.output_bucket,
                request.output_path
            )
            
            # Update job status
            jobs[job_id].status = "completed"
            jobs[job_id].output_uri = output_uri
            jobs[job_id].progress = 1.0
            jobs[job_id].completed_at = datetime.utcnow()
            
            # Save to Firestore
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
            
            db.collection("renders").document(job_id).set(render_doc)
            
        except subprocess.CalledProcessError as e:
            jobs[job_id].status = "failed"
            jobs[job_id].error = f"FFmpeg error: {e.stderr}"
            raise
        except Exception as e:
            jobs[job_id].status = "failed"
            jobs[job_id].error = str(e)
            raise

@app.get("/")
async def health():
    return {"status": "healthy", "service": "dpgen-renderer", "version": "1.0.0"}

@app.post("/render", response_model=RenderStatus)
async def create_render(request: RenderRequest, background_tasks: BackgroundTasks):
    """Create a new render job"""
    
    # Initialize job status
    job_status = RenderStatus(
        job_id=request.job_id,
        status="pending",
        progress=0.0,
        metadata=request.metadata
    )
    jobs[request.job_id] = job_status
    
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
        job_status = RenderStatus(
            job_id=request.job_id,
            status="pending",
            progress=0.0,
            metadata=request.metadata
        )
        jobs[request.job_id] = job_status
        background_tasks.add_task(process_render, request)
        job_ids.append(request.job_id)
    
    return {"job_ids": job_ids, "count": len(job_ids)}

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8080))
    uvicorn.run(app, host="0.0.0.0", port=port)