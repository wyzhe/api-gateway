from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .api import admin as admin_api
from .api import auth as auth_api
from .api import billing as billing_api
from .api import dashboard as dashboard_api
from .api import gateway as gateway_api
from .api import keys as keys_api
from .api import logs as logs_api
from .api import models as models_api
from .config import get_settings
from .database import SessionLocal
from .seed import run_seed

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    db = SessionLocal()
    try:
        run_seed(db)
    finally:
        db.close()
    yield


app = FastAPI(title="LLM API Gateway", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/healthz")
def healthz() -> dict[str, str]:
    return {"status": "ok"}


app.include_router(auth_api.router)
app.include_router(keys_api.router)
app.include_router(models_api.router)
app.include_router(billing_api.router)
app.include_router(logs_api.router)
app.include_router(dashboard_api.router)
app.include_router(admin_api.router)
app.include_router(gateway_api.router)
