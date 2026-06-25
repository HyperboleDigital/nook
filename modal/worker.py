"""
Nook 3D Tour Worker — runs on Modal.com GPU cloud.

Deploy:  modal deploy modal/worker.py
Test:    modal run modal/worker.py::process_video --video-url <url> --tour-id test --callback-url http://localhost:3000/api/webhooks/modal

The function is exposed as a web endpoint. Next.js calls it with:
  POST {MODAL_WEBHOOK_URL}
  Body: { video_url, tour_id, callback_url }

On completion it POSTs back to callback_url with:
  { tour_id, ply_url, status: "complete" | "failed", error?: string }

Environment variables (set via `modal secret create nook-secrets`):
  SUPABASE_URL
  SUPABASE_SERVICE_ROLE_KEY
  NOOK_APP_URL  (e.g. https://nook-lime.vercel.app)
  MODAL_WEBHOOK_SECRET
"""

import hashlib
import hmac
import os
import subprocess
import tempfile
import time
from pathlib import Path

import modal

# ---------------------------------------------------------------------------
# Container image — Nerfstudio + FFmpeg + supabase-py
# ---------------------------------------------------------------------------
image = (
    modal.Image.from_registry(
        "dromni/nerfstudio:1.1.0",
        add_python="3.11",
    )
    .pip_install(
        "fastapi[standard]==0.115.12",
        "supabase==2.10.0",
        "requests==2.32.3",
        "httpx==0.27.2",
    )
    .apt_install("ffmpeg")
)

app = modal.App("nook-3dgs", image=image)

# Secrets stored in Modal — run once:
#   modal secret create nook-secrets \
#     SUPABASE_URL=... \
#     SUPABASE_SERVICE_ROLE_KEY=... \
#     MODAL_WEBHOOK_SECRET=... \
#     NOOK_APP_URL=...
nook_secrets = modal.Secret.from_name("nook-secrets")


# ---------------------------------------------------------------------------
# Helper: run a shell command and stream output to Modal logs
# ---------------------------------------------------------------------------
def run(cmd: str, cwd: str | None = None) -> None:
    print(f"$ {cmd}")
    result = subprocess.run(
        cmd,
        shell=True,
        cwd=cwd,
        capture_output=False,
        text=True,
    )
    if result.returncode != 0:
        raise RuntimeError(f"Command failed (exit {result.returncode}): {cmd}")


# ---------------------------------------------------------------------------
# Helper: upload a local file to Supabase Storage, return public URL
# ---------------------------------------------------------------------------
def upload_to_supabase(local_path: str, storage_path: str) -> str:
    from supabase import create_client

    sb = create_client(
        os.environ["SUPABASE_URL"],
        os.environ["SUPABASE_SERVICE_ROLE_KEY"],
    )
    with open(local_path, "rb") as f:
        sb.storage.from_("nook-uploads").upload(
            path=storage_path,
            file=f,
            file_options={"content-type": "application/octet-stream", "upsert": "true"},
        )
    result = sb.storage.from_("nook-uploads").get_public_url(storage_path)
    return result


# ---------------------------------------------------------------------------
# Helper: send completion callback to Next.js
# ---------------------------------------------------------------------------
def send_callback(callback_url: str, payload: dict) -> None:
    import requests

    secret = os.environ.get("MODAL_WEBHOOK_SECRET", "")
    import json
    body = json.dumps(payload)
    sig = hmac.new(secret.encode(), body.encode(), hashlib.sha256).hexdigest()

    for attempt in range(3):
        try:
            r = requests.post(
                callback_url,
                data=body,
                headers={
                    "Content-Type": "application/json",
                    "X-Modal-Secret": sig,
                },
                timeout=15,
            )
            print(f"Callback {r.status_code}: {r.text[:200]}")
            return
        except Exception as e:
            print(f"Callback attempt {attempt + 1} failed: {e}")
            time.sleep(5)


# ---------------------------------------------------------------------------
# Main processing function — exposed as a web endpoint
# ---------------------------------------------------------------------------
@app.function(
    gpu="A10",
    timeout=7200,  # 2 hours max
    secrets=[nook_secrets],
)
@modal.fastapi_endpoint(method="POST")
def process_video(body: dict) -> dict:
    """
    Accepts: { video_url, tour_id, callback_url }
    Returns immediately with { status: "queued" }.
    Sends completion to callback_url when done.
    """
    video_url: str = body.get("video_url", "")
    tour_id: str = body.get("tour_id", "")
    callback_url: str = body.get("callback_url", "")

    if not video_url or not tour_id or not callback_url:
        return {"error": "video_url, tour_id, callback_url are required"}

    print(f"Starting 3DGS for tour {tour_id}")
    print(f"Video: {video_url}")

    with tempfile.TemporaryDirectory() as tmpdir:
        video_path = os.path.join(tmpdir, "input.mp4")
        data_dir = os.path.join(tmpdir, "data")
        output_dir = os.path.join(tmpdir, "output")
        os.makedirs(data_dir, exist_ok=True)
        os.makedirs(output_dir, exist_ok=True)

        try:
            # ------------------------------------------------------------------
            # 1. Download video
            # ------------------------------------------------------------------
            print("Downloading video...")
            import requests
            r = requests.get(video_url, stream=True, timeout=120)
            r.raise_for_status()
            with open(video_path, "wb") as f:
                for chunk in r.iter_content(chunk_size=8192):
                    f.write(chunk)
            size_mb = os.path.getsize(video_path) / 1024 / 1024
            print(f"Downloaded {size_mb:.1f} MB")

            # ------------------------------------------------------------------
            # 2. Process video → COLMAP data (ns-process-data handles FFmpeg)
            # ------------------------------------------------------------------
            print("Running ns-process-data...")
            run(
                f"ns-process-data video "
                f"--data {video_path} "
                f"--output-dir {data_dir} "
                f"--num-frames-target 300 "
                f"--verbose"
            )

            # ------------------------------------------------------------------
            # 3. Train splatfacto (Gaussian Splatting)
            # ------------------------------------------------------------------
            print("Training splatfacto...")
            splat_dir = os.path.join(tmpdir, "splat")
            run(
                f"ns-train splatfacto "
                f"--data {data_dir} "
                f"--output-dir {splat_dir} "
                f"--viewer.quit-on-train-completion True "
                f"nerfstudio-data "
                f"--max-num-iterations 7000"
            )

            # Find the config file produced by training
            config_files = list(Path(splat_dir).rglob("config.yml"))
            if not config_files:
                raise RuntimeError("No config.yml found after training")
            config_path = str(config_files[0])
            print(f"Config: {config_path}")

            # ------------------------------------------------------------------
            # 4. Export PLY
            # ------------------------------------------------------------------
            print("Exporting PLY...")
            ply_path = os.path.join(output_dir, "splat.ply")
            run(
                f"ns-export gaussian-splat "
                f"--load-config {config_path} "
                f"--output-dir {output_dir}"
            )

            # ns-export writes splat.ply into output_dir
            if not os.path.exists(ply_path):
                # Some versions write to a subdirectory
                plys = list(Path(output_dir).rglob("*.ply"))
                if not plys:
                    raise RuntimeError("No PLY file found after export")
                ply_path = str(plys[0])

            ply_size_mb = os.path.getsize(ply_path) / 1024 / 1024
            print(f"PLY size: {ply_size_mb:.1f} MB")

            # ------------------------------------------------------------------
            # 5. Upload PLY to Supabase Storage
            # ------------------------------------------------------------------
            storage_path = f"tours/{tour_id}/splat.ply"
            print(f"Uploading PLY to Supabase Storage: {storage_path}")
            ply_url = upload_to_supabase(ply_path, storage_path)
            print(f"PLY URL: {ply_url}")

            # ------------------------------------------------------------------
            # 6. Send success callback
            # ------------------------------------------------------------------
            send_callback(callback_url, {
                "tour_id": tour_id,
                "ply_url": ply_url,
                "status": "complete",
            })

            return {"status": "complete", "tour_id": tour_id, "ply_url": ply_url}

        except Exception as e:
            error_msg = str(e)
            print(f"Processing failed: {error_msg}")
            send_callback(callback_url, {
                "tour_id": tour_id,
                "status": "failed",
                "error": error_msg,
            })
            return {"status": "failed", "tour_id": tour_id, "error": error_msg}
