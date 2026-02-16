from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient
import os

load_dotenv(dotenv_path="../.env")

app = FastAPI() # creating application instance

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],  # default port vite port
    allow_methods=["*"],
    allow_headers=["*"],
)
# tells server to accept reqs from my frontend (otherwise it'll be blocked)


# MongoDB connection
mongo_client = AsyncIOMotorClient(os.getenv("MONGO_URI"))
db = mongo_client["graewatch"] # default db name for this which is graewatch

@app.get("/api/health")
async def health():
    return {"status": "ok"} # health test