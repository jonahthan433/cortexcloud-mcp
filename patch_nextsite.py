import re, io

P = "/opt/CortexCloudAPI/app/main.py"
src = open(P, encoding="utf-8").read()
orig = src

# 1) Ensure StaticFiles import
if "from fastapi.staticfiles import StaticFiles" not in src:
    src = src.replace(
        "from fastapi.responses import JSONResponse, Response",
        "from fastapi.responses import JSONResponse, Response\nfrom fastapi.staticfiles import StaticFiles",
    )

# 2) Repoint the home() route to the Next export index
src = src.replace(
    'return FileResponse("/opt/CortexCloudAPI/static/index.html")',
    'return FileResponse("/opt/CortexCloudAPI/site/index.html")',
)

# 3) Add root static-file routes + /_next mount, injected right after home()
marker = 'return FileResponse("/opt/CortexCloudAPI/site/index.html")\n'
inject = marker + '''

@app.get("/og.svg", include_in_schema=False)
async def _og():
    from fastapi.responses import FileResponse
    return FileResponse("/opt/CortexCloudAPI/site/og.svg", media_type="image/svg+xml")


@app.get("/robots.txt", include_in_schema=False)
async def _robots():
    from fastapi.responses import FileResponse
    return FileResponse("/opt/CortexCloudAPI/site/robots.txt", media_type="text/plain")


@app.get("/sitemap.xml", include_in_schema=False)
async def _sitemap():
    from fastapi.responses import FileResponse
    return FileResponse("/opt/CortexCloudAPI/site/sitemap.xml", media_type="application/xml")
'''
if "/og.svg" not in orig:
    src = src.replace(marker, inject, 1)

# 4) Mount /_next static assets (append at end of file, after app is fully built)
mount_line = 'app.mount("/_next", StaticFiles(directory="/opt/CortexCloudAPI/site/_next"), name="next-assets")'
if mount_line not in src:
    src = src.rstrip() + "\n\n# Next.js static export assets\n" + mount_line + "\n"

open(P, "w", encoding="utf-8").write(src)
print("PATCHED" if src != orig else "NO_CHANGE")
print("has_mount:", mount_line in src)
print("has_next_index:", "site/index.html" in src)
print("has_staticfiles_import:", "from fastapi.staticfiles import StaticFiles" in src)
