import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.gateway import router

app = FastAPI(title="Clara API")

_default_origins = ["http://localhost:5173"]
_extra = os.getenv("CORS_ORIGINS", "")
if _extra:
    _default_origins += [o.strip() for o in _extra.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_default_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory state store — attached directly to the app instance so gateway
# can access it via request.app.presentations
app.presentations: dict = {}  # type: ignore[attr-defined]

app.include_router(router)
