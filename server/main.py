from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient
import os
import time
from fastapi import Request
from utils.audit import log_performance, logger

from routes.candles import router as candles_router
from routes import candles as candles_module

from routes.analysis import router as analysis_router
from routes import analysis as analysis_module

from routes.setup import router as setup_router
from routes import setup as setup_module

from routes.confluence import router as confluence_router
from routes import confluence as confluence_module

from routes.snapshots import router as snapshots_router
from routes import snapshots as snapshots_module

from routes.auth import router as auth_router
from routes import auth as auth_module

load_dotenv(dotenv_path="../.env")

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.middleware("http")
async def audit_middleware(request: Request, call_next):
    start_time = time.time()
    response = await call_next(request)
    process_time = (time.time() - start_time) * 1000
    
    # Log all API requests
    if request.url.path.startswith("/api"):
        await log_performance(
            db, 
            f"http_{request.method}", 
            process_time, 
            {"path": request.url.path, "status": response.status_code}
        )
    
    return response

# MongoDB connection
mongo_client = AsyncIOMotorClient(os.getenv("MONGO_URI"))
db = mongo_client["graewatch"]

# Give the candles route access to the database
candles_module.db = db

analysis_module.db = db
app.include_router(analysis_router)

setup_module.db = db
app.include_router(setup_router)

confluence_module.db = db
app.include_router(confluence_router)

snapshots_module.db = db
app.include_router(snapshots_router)

auth_module.db = db
app.include_router(auth_router)

app.include_router(candles_router)


@app.get("/api/health")
async def health():
    return {"status": "ok"}


@app.on_event("startup")
async def create_indexes():
    # Create unique indexes for the database
    await db["candles"].create_index(
        [("pair", 1), ("interval", 1), ("timestamp", 1)],
        unique=True,
    )
    # Index for efficient querying of the most recent candles
    await db["candles"].create_index(
        [("pair", 1), ("interval", 1), ("fetched_at", -1)],
    )
    # Creates indexes for the analysis
    await db["analysis"].create_index(
        [("component", 1), ("pair", 1), ("interval", 1)],
        unique=True,
    )
    # Index for efficient querying of the most recent analysis
    await db["analysis"].create_index(
        [("component", 1), ("pair", 1), ("interval", 1), ("candles_fetched_at", -1)],
    )
    await db["snapshots"].create_index([("saved_at", -1)])
    await db["snapshots"].create_index([("user_id", 1), ("saved_at", -1)])
    await db["users"].create_index("email", unique=True)
    
    # TTL Index for audit logs: 30 days
    await db["audit_logs"].create_index("timestamp", expireAfterSeconds=2592000)
    logger.info("Startup complete: Indexes created.")
