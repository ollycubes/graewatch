from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient
import os

from routes.candles import router as candles_router
from routes import candles as candles_module

from routes.analysis import router as analysis_router
from routes import analysis as analysis_module

from routes.setup import router as setup_router
from routes import setup as setup_module

from routes.zones import router as zones_router
from routes import zones as zones_module

from routes.confluence import router as confluence_router
from routes import confluence as confluence_module

load_dotenv(dotenv_path="../.env")

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"], # Allows frontend (local:5173) to connect to backend (local:8000)
    allow_methods=["*"],
    allow_headers=["*"],
)

# MongoDB connection
mongo_client = AsyncIOMotorClient(os.getenv("MONGO_URI"))
db = mongo_client["graewatch"]

# Give the candles route access to the database
candles_module.db = db

analysis_module.db = db
app.include_router(analysis_router)

setup_module.db = db
app.include_router(setup_router)

zones_module.db = db
app.include_router(zones_router)

confluence_module.db = db
app.include_router(confluence_router)

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
