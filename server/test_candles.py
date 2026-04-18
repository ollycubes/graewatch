import asyncio
import httpx
import os
from dotenv import load_dotenv

load_dotenv(dotenv_path="/Users/cubo/Desktop/graewatch/server/.env")

async def test_td():
    api_key = os.getenv("TWELVE_DATA_API_KEY")
    params = { 
        "symbol": "EUR/USD",
        "interval": "4h",
        "outputsize": 5000,
        "apikey": api_key,
        "start_date": "2025-09-18 00:00:00",
        "end_date": "2025-11-18 00:00:00",
    }
    async with httpx.AsyncClient() as client:
        response = await client.get("https://api.twelvedata.com/time_series", params=params)
        data = response.json()
        if "values" in data:
            print(f"Success! Got {len(data['values'])} candles.")
            print(f"First: {data['values'][-1]['datetime']}")
            print(f"Last: {data['values'][0]['datetime']}")
        else:
            print(data)

asyncio.run(test_td())
