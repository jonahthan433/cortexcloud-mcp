P = "/opt/CortexCloudAPI/app/main.py"
src = open(P, encoding="utf-8").read()
orig = src

# Add a route that serves root-level static assets from site/ (logo, svgs, images, txt)
# Placed via decorator; registered at import time. Restricted to a single path segment
# with a known safe extension so it can't shadow API routers.
route = '''

@app.get("/{asset}", include_in_schema=False)
async def _site_asset(asset: str):
    """Serve root-level static assets from the Next export (logo, images, etc.)."""
    import os
    from fastapi.responses import FileResponse
    from fastapi import HTTPException
    allowed = (".png", ".jpg", ".jpeg", ".svg", ".ico", ".webp", ".txt", ".xml", ".json", ".woff2", ".woff")
    if not asset.lower().endswith(allowed):
        raise HTTPException(status_code=404)
    path = os.path.join("/opt/CortexCloudAPI/site", asset)
    if not os.path.isfile(path):
        raise HTTPException(status_code=404)
    return FileResponse(path)
'''

marker = 'app.mount("/_next", StaticFiles(directory="/opt/CortexCloudAPI/site/_next"), name="next-assets")'
if "_site_asset" not in src:
    # insert the route BEFORE the mount line (mounts should be last; route decorators fine here)
    src = src.replace(marker, route.strip() + "\n\n" + marker, 1)

open(P, "w", encoding="utf-8").write(src)
print("PATCHED" if src != orig else "NO_CHANGE")
print("has_site_asset:", "_site_asset" in src)
