"""
Nook 3D Tour Worker — runs on Modal.com GPU cloud.

Deploy:  modal deploy modal/worker.py
Test:    modal run modal/worker.py::run_pipeline --video-url <url> --tour-id test --callback-url https://nook-lime.vercel.app/api/webhooks/modal

The web endpoint accepts:
  POST {MODAL_WEBHOOK_URL}
  Body: { video_url, tour_id, callback_url }

It spawns the GPU pipeline immediately and returns { status: "queued" }.
On completion the pipeline POSTs to callback_url with:
  { tour_id, ply_url, status: "complete" | "failed", error?: string }

Environment variables (set via `modal secret create nook-secrets`):
  BLOB_READ_WRITE_TOKEN  (Vercel Blob token for PLY file storage)
  NOOK_APP_URL           (e.g. https://nook-lime.vercel.app)
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
# Container image — Nerfstudio + FFmpeg
# ---------------------------------------------------------------------------
image = (
    modal.Image.from_registry(
        "dromni/nerfstudio:1.1.0",
        add_python="3.11",
    )
    .pip_install(
        "fastapi[standard]==0.115.12",
        "requests==2.32.3",
        "httpx==0.27.2",
    )
    .apt_install("ffmpeg")
)

app = modal.App("nook-3dgs", image=image)

nook_secrets = modal.Secret.from_name("nook-secrets")


# ---------------------------------------------------------------------------
# Helper: run a shell command and stream output to Modal logs
# ---------------------------------------------------------------------------
def run(cmd: str, cwd: str | None = None) -> None:
    print(f"$ {cmd}")
    # nerfstudio is a per-user install under /home/user/.local; the ns-* scripts
    # (shebang /usr/bin/python3.10) only resolve it when HOME=/home/user. Modal
    # runs with a different HOME by default, so set it explicitly here.
    #
    # gsplat 0.1.11 JIT-compiles its CUDA kernels at runtime and passes no arch to
    # torch's load(); without TORCH_CUDA_ARCH_LIST it builds with no target arch →
    # "no kernel image is available for execution on the device". Match the arch to
    # the GPU below: T4 is sm_75. (We run on T4 because the dromni/nerfstudio image's
    # *precompiled* PyTorch doesn't ship sm_86 kernels — TORCH_CUDA_ARCH_LIST only
    # affects JIT extensions like gsplat, not torch's own ops, so A10G/sm_86 fails at
    # plain tensor math. sm_75 is in every PyTorch wheel.)
    env = {
        **os.environ,
        "HOME": "/home/user",
        "TORCH_CUDA_ARCH_LIST": "7.5+PTX",
    }
    result = subprocess.run(
        cmd,
        shell=True,
        cwd=cwd,
        env=env,
        capture_output=False,
        text=True,
    )
    if result.returncode != 0:
        raise RuntimeError(f"Command failed (exit {result.returncode}): {cmd}")


# ---------------------------------------------------------------------------
# Helper: upload a local file to Vercel Blob, return public URL
# ---------------------------------------------------------------------------
def upload_to_blob(local_path: str, remote_filename: str) -> str:
    token = os.environ["BLOB_READ_WRITE_TOKEN"]
    import requests as req_lib
    with open(local_path, "rb") as f:
        r = req_lib.put(
            f"https://blob.vercel-storage.com/{remote_filename}",
            headers={
                "Authorization": f"Bearer {token}",
                "x-content-type": "model/vnd.ply",
                "x-cache-control-max-age": "31536000",
            },
            data=f,
            timeout=300,
        )
    r.raise_for_status()
    return r.json()["url"]


# ---------------------------------------------------------------------------
# Helper: send completion callback to Next.js
# ---------------------------------------------------------------------------
def send_callback(callback_url: str, payload: dict) -> None:
    import json
    import requests

    secret = os.environ.get("MODAL_WEBHOOK_SECRET", "")
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
# GPU pipeline — runs Nerfstudio end-to-end, then fires callback
# ---------------------------------------------------------------------------
@app.function(
    gpu="T4",
    timeout=7200,
    secrets=[nook_secrets],
)
def run_pipeline(video_url: str, tour_id: str, callback_url: str) -> None:
    print(f"Starting 3DGS pipeline for tour {tour_id}")
    print(f"Video: {video_url}")

    with tempfile.TemporaryDirectory() as tmpdir:
        video_path = os.path.join(tmpdir, "input.mp4")
        data_dir = os.path.join(tmpdir, "data")
        output_dir = os.path.join(tmpdir, "output")
        os.makedirs(data_dir, exist_ok=True)
        os.makedirs(output_dir, exist_ok=True)

        try:
            # 1. Download video
            print("Downloading video...")
            import requests
            r = requests.get(video_url, stream=True, timeout=120)
            r.raise_for_status()
            with open(video_path, "wb") as f:
                for chunk in r.iter_content(chunk_size=8192):
                    f.write(chunk)
            size_mb = os.path.getsize(video_path) / 1024 / 1024
            print(f"Downloaded {size_mb:.1f} MB")

            # 1b. Compress to 1080p/30fps H.264 before Nerfstudio
            # Strips audio, caps resolution and bitrate — has no effect on 3DGS quality
            compressed_path = os.path.join(tmpdir, "input_compressed.mp4")
            print("Compressing video...")
            run(
                f"ffmpeg -i {video_path} "
                f"-vf 'scale=1920:1080:force_original_aspect_ratio=decrease,"
                f"scale=trunc(iw/2)*2:trunc(ih/2)*2' "
                f"-c:v libx264 -crf 18 -preset fast -an "
                f"-y {compressed_path}"
            )
            compressed_mb = os.path.getsize(compressed_path) / 1024 / 1024
            print(f"Compressed {size_mb:.1f} MB → {compressed_mb:.1f} MB")
            video_path = compressed_path

            # 2. Process video → COLMAP data
            print("Running ns-process-data...")
            run(
                f"ns-process-data video "
                f"--data {video_path} "
                f"--output-dir {data_dir} "
                f"--num-frames-target 400 "
                f"--verbose"
            )

            # 3. Train splatfacto
            print("Training splatfacto...")
            splat_dir = os.path.join(tmpdir, "splat")
            # Clear any stale JIT extension cache from prior failed compiles so
            # gsplat rebuilds its kernels cleanly for the current GPU arch.
            run("rm -rf /home/user/.cache/torch_extensions")

            # Trainer options (--max-num-iterations, --viewer.*) must come BEFORE
            # the `nerfstudio-data` dataparser subcommand, or tyro rejects them.
            run(
                f"ns-train splatfacto "
                f"--data {data_dir} "
                f"--output-dir {splat_dir} "
                f"--max-num-iterations 30000 "
                f"--viewer.quit-on-train-completion True "
                f"nerfstudio-data"
            )

            config_files = list(Path(splat_dir).rglob("config.yml"))
            if not config_files:
                raise RuntimeError("No config.yml found after training")
            config_path = str(config_files[0])
            print(f"Config: {config_path}")

            # 4. Export PLY
            print("Exporting PLY...")
            ply_path = os.path.join(output_dir, "splat.ply")
            run(
                f"ns-export gaussian-splat "
                f"--load-config {config_path} "
                f"--output-dir {output_dir}"
            )

            if not os.path.exists(ply_path):
                plys = list(Path(output_dir).rglob("*.ply"))
                if not plys:
                    raise RuntimeError("No PLY file found after export")
                ply_path = str(plys[0])

            ply_size_mb = os.path.getsize(ply_path) / 1024 / 1024
            print(f"PLY size: {ply_size_mb:.1f} MB")

            # 5. Upload PLY to Vercel Blob
            remote_filename = f"tours/{tour_id}/splat.ply"
            print(f"Uploading PLY to Vercel Blob: {remote_filename}")
            ply_url = upload_to_blob(ply_path, remote_filename)
            print(f"PLY URL: {ply_url}")

            # 6. Send success callback
            send_callback(callback_url, {
                "tour_id": tour_id,
                "ply_url": ply_url,
                "status": "complete",
            })

        except Exception as e:
            error_msg = str(e)
            print(f"Pipeline failed: {error_msg}")
            send_callback(callback_url, {
                "tour_id": tour_id,
                "status": "failed",
                "error": error_msg,
            })


# ---------------------------------------------------------------------------
# Web endpoint — lightweight, returns immediately after spawning GPU job
# ---------------------------------------------------------------------------
@app.function(secrets=[nook_secrets])
@modal.fastapi_endpoint(method="POST")
def process_video(body: dict) -> dict:
    """
    Accepts: { video_url, tour_id, callback_url }
    Spawns the GPU pipeline and returns { status: "queued" } immediately.
    """
    video_url: str = body.get("video_url", "")
    tour_id: str = body.get("tour_id", "")
    callback_url: str = body.get("callback_url", "")

    if not video_url or not tour_id or not callback_url:
        return {"error": "video_url, tour_id, callback_url are required"}

    print(f"Queuing 3DGS pipeline for tour {tour_id}")
    run_pipeline.spawn(video_url, tour_id, callback_url)
    return {"status": "queued", "tour_id": tour_id}
