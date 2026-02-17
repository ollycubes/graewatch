from fastapi import APIRouter, Query, HTTPException
from motor.motor_asyncio import AsyncIOMotorDatabase
from engine import COMPONENTS

router = APIRouter()

db: AsyncIOMotorDatabase = None


@router.get("/api/analysis/{component}")
async def get_analysis(
    component: str,
    pair: str = Query(...),
    interval: str = Query("daily"),
):
    # Check the component exists
    if component not in COMPONENTS:
        raise HTTPException(
            status_code=404,
            detail=f"Unknown component: {component}. Available: {list(COMPONENTS.keys())}",
        )

    # Get candles from MongoDB
    collection = db["candles"]
    cursor = collection.find(
        {"pair": pair, "interval": interval},
        {"_id": 0},
    ).sort("timestamp", 1)
    candles = await cursor.to_list(length=5000)

    if not candles:
        raise HTTPException(
            status_code=404,
            detail=f"No candle data found for {pair} {interval}. Fetch candles first.",
        )

    # Run the algorithm
    detect_fn = COMPONENTS[component]
    results = detect_fn(candles)

    # Store results in the analysis collection
    analysis_collection = db["analysis"]
    await analysis_collection.update_one(
        {"component": component, "pair": pair, "interval": interval},
        {"$set": {
            "component": component,
            "pair": pair,
            "interval": interval,
            "count": len(results),
            "signals": results,
        }},
        upsert=True,
    )

    return {
        "component": component,
        "pair": pair,
        "interval": interval,
        "count": len(results),
        "signals": results,
    }