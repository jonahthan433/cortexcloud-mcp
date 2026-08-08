import re
p = "/opt/CortexCloudAPI/app/main.py"
s = open(p).read()

# 1) import
if "from app.activity import router as activity_router" not in s:
    s = s.replace(
        "from app.admin.routes import router as admin_router",
        "from app.admin.routes import router as admin_router\nfrom app.activity import router as activity_router",
        1,
    )

# 2) include router
if "activity_router, prefix=\"/x402/v1\"" not in s:
    s = s.replace(
        'app.include_router(completions_router, prefix="/v1", tags=["OpenAI Compatible Gateway"])',
        'app.include_router(completions_router, prefix="/v1", tags=["OpenAI Compatible Gateway"])\napp.include_router(activity_router, prefix="/x402/v1", tags=["Activity Feed"])',
        1,
    )

# 3) serve static landing page at /
old_home = (
    '@app.get("/", include_in_schema=False)\n'
    "async def home():\n"
    '    """Branded HTML homepage so discovery engines (x402scan) can scrape the\n'
    "    favicon/OG image and render the CortexCloud logo on the server page.\"\"\"\n"
    "    from fastapi.responses import HTMLResponse\n"
    "    return HTMLResponse(CORTEXCLOUD_HOME_HTML)"
)
new_home = (
    '@app.get("/", include_in_schema=False)\n'
    "async def home():\n"
    '    """Branded BlockRun-style landing page (static/index.html)."""\n'
    "    from fastapi.responses import FileResponse\n"
    '    return FileResponse("/opt/CortexCloudAPI/static/index.html")'
)
assert old_home in s, "home route not found"
s = s.replace(old_home, new_home, 1)

open(p, "w").write(s)
print("PATCHED_OK")
print("activity import:", "from app.activity import" in s)
print("activity include:", 'activity_router, prefix="/x402/v1"' in s)
print("home FileResponse:", 'FileResponse("/opt/CortexCloudAPI/static/index.html")' in s)
