import sys
# 1) mount pricing router in main.py
mp = "/opt/CortexCloudAPI/app/main.py"
s = open(mp).read()
if "from app.pricing_route import router as pricing_router" not in s:
    s = s.replace(
        "from app.activity import router as activity_router",
        "from app.activity import router as activity_router\nfrom app.pricing_route import router as pricing_router",
        1,
    )
if 'pricing_router, prefix="/x402/v1"' not in s:
    s = s.replace(
        'app.include_router(activity_router, prefix="/x402/v1", tags=["Activity Feed"])',
        'app.include_router(activity_router, prefix="/x402/v1", tags=["Activity Feed"])\napp.include_router(pricing_router, prefix="/x402/v1", tags=["Pricing"])',
        1,
    )
open(mp, "w").write(s)
print("MAIN_PATCHED activity:", 'from app.activity import' in s)
print("MAIN_PATCHED pricing:", 'from app.pricing_route import' in s)
print("MAIN_PATCHED pricing_include:", 'pricing_router, prefix="/x402/v1"' in s)
