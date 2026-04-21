import logging
import time
from datetime import datetime
from motor.motor_asyncio import AsyncIOMotorDatabase

# Configure standard logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("graewatch")

async def log_event(
    db: AsyncIOMotorDatabase,
    event_type: str,
    details: dict,
    level: str = "info",
):
    """
    Log an event to the console and the MongoDB audit_logs collection.
    """
    timestamp = datetime.utcnow()
    
    # Log to console
    log_msg = f"[{event_type.upper()}] {details}"
    if level == "error":
        logger.error(log_msg)
    elif level == "warning":
        logger.warning(log_msg)
    else:
        logger.info(log_msg)

    # Log to MongoDB
    if db is not None:
        try:
            await db["audit_logs"].insert_one({
                "timestamp": timestamp,
                "event_type": event_type,
                "level": level,
                "details": details,
            })
        except Exception as e:
            logger.error(f"Failed to write to audit_logs: {e}")

async def log_performance(
    db: AsyncIOMotorDatabase,
    component: str,
    duration_ms: float,
    details: dict = None
):
    """
    Record execution timing for a component/algorithm.
    """
    if details is None:
        details = {}
    
    details.update({"component": component, "duration_ms": round(duration_ms, 2)})
    await log_event(db, "performance", details)

async def log_api_failure(
    db: AsyncIOMotorDatabase,
    provider: str,
    error: str,
    details: dict = None
):
    """
    Record an external API failure.
    """
    if details is None:
        details = {}
        
    details.update({"provider": provider, "error": error})
    await log_event(db, "api_failure", details, level="error")

async def log_fallback(
    db: AsyncIOMotorDatabase,
    activity: str,
    details: dict = None
):
    """
    Record a fallback activity (e.g., serving stale cache when API fails).
    """
    if details is None:
        details = {}
        
    details.update({"activity": activity})
    await log_event(db, "fallback", details, level="warning")
