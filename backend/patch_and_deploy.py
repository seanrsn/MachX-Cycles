"""
patch_and_deploy.py — Download current Lambda zip, patch source file, re-upload.
Usage: python patch_and_deploy.py
"""
import io
import os
import sys
import zipfile
import urllib.request
import subprocess
import json

REGION = "us-east-1"
BASE   = r"C:\Users\super\Projects\machx-cycles\backend"
SHARED = os.path.join(BASE, "shared")

TARGETS = [
    {
        "function_name": "admin-api",
        "source_file":   os.path.join(BASE, "functions", "admin_api.py"),
        "zip_entry":     "admin_api.py",
    },
    {
        "function_name": "bikes-public",
        "source_file":   os.path.join(BASE, "functions", "bikes_public.py"),
        "zip_entry":     "bikes_public.py",
    },
    {
        "function_name": "stripe-webhook",
        "source_file":   os.path.join(BASE, "functions", "stripe_webhook.py"),
        "zip_entry":     "stripe_webhook.py",
    },
]


def get_download_url(function_name):
    result = subprocess.run(
        ["aws", "lambda", "get-function",
         "--function-name", function_name,
         "--query", "Code.Location",
         "--output", "text",
         "--region", REGION],
        capture_output=True, text=True, check=True
    )
    return result.stdout.strip()


def download_zip(url):
    with urllib.request.urlopen(url) as resp:
        return io.BytesIO(resp.read())


def patch_zip(zip_bytes_io, source_file, zip_entry):
    """Replace zip_entry in zip with contents of source_file.
    Also update shared/*.py files."""
    out = io.BytesIO()
    with zipfile.ZipFile(zip_bytes_io, 'r') as zin:
        with zipfile.ZipFile(out, 'w', compression=zipfile.ZIP_DEFLATED) as zout:
            for item in zin.infolist():
                name = item.filename
                # Skip old version of our target file and shared files
                if name == zip_entry or name.startswith("shared/"):
                    continue
                zout.writestr(item, zin.read(name))
            
            # Add updated source file
            with open(source_file, 'rb') as f:
                zout.writestr(zip_entry, f.read())
            
            # Add updated shared files
            for fname in os.listdir(SHARED):
                fpath = os.path.join(SHARED, fname)
                if os.path.isfile(fpath) and fname.endswith('.py'):
                    with open(fpath, 'rb') as f:
                        zout.writestr(f"shared/{fname}", f.read())
    
    out.seek(0)
    return out


def deploy_zip(function_name, zip_bytes_io):
    import tempfile
    tmp_path = os.path.join(tempfile.gettempdir(), f"{function_name}-patched.zip")
    with open(tmp_path, 'wb') as f:
        f.write(zip_bytes_io.read())
    result = subprocess.run(
        ["aws", "lambda", "update-function-code",
         "--function-name", function_name,
         "--zip-file", f"fileb://{tmp_path}",
         "--region", REGION,
         "--query", "CodeSize",
         "--output", "text"],
        capture_output=True, text=True, check=True
    )
    os.remove(tmp_path)
    return result.stdout.strip()


def main():
    for t in TARGETS:
        name = t["function_name"]
        print(f"\n[DEPLOY] {name}...")
        
        print(f"   Fetching download URL...")
        url = get_download_url(name)
        
        print(f"   Downloading current zip...")
        original = download_zip(url)
        
        print(f"   Patching {t['zip_entry']} + shared/...")
        patched = patch_zip(original, t["source_file"], t["zip_entry"])
        
        print(f"   Uploading to Lambda...")
        size = deploy_zip(name, patched)
        print(f"   [OK] {name} deployed -- {size} bytes")
    
    print("\n[DONE] All Lambdas deployed!")


if __name__ == "__main__":
    main()
