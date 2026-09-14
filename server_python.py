"""
Locate Go - Backend Server (Python / FastAPI)
خادم المعالجة والتحقق الجغرافي الحقيقي لمناديب التوصيل
جاهز للرفع المباشر على Render, Railway, أو أي استضافة مجانية
"""

import math
from datetime import datetime
from typing import Optional, List, Dict, Any
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

app = FastAPI(
    title="Locate Go - Courier Assistant API",
    description="نظام معالجة الطلبات والتحقق الجغرافي الحقيقي لمناديب التوصيل",
    version="2.0.0"
)

# Enable CORS for frontend connection
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ----------------------------------------------------
# 1. Haversine Formula for Real Geodesic Distance
# ----------------------------------------------------
def calculate_haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """
    حساب المسافة الجغرافية الدقيقة بين نقطتين على سطح الأرض بالكيلومتر
    """
    R = 6371.0  # Earth radius in kilometers
    d_lat = math.radians(lat2 - lat1)
    d_lon = math.radians(lon2 - lon1)
    
    a = (math.sin(d_lat / 2) ** 2 +
         math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) *
         math.sin(d_lon / 2) ** 2)
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    distance = R * c
    return round(distance, 1)

# ----------------------------------------------------
# 2. Pydantic Models for Data Validation
# ----------------------------------------------------
class SettingsModel(BaseModel):
    maxDistanceKm: float = Field(default=2.0, ge=0.5, le=50.0)
    autoAccept: bool = True
    soundAlerts: bool = True
    minPayoutSar: float = 15.0
    vibrationFeedback: bool = True

class LocationModel(BaseModel):
    lat: float
    lng: float
    accuracy: Optional[float] = None

class EvaluateOrderRequest(BaseModel):
    appName: str = "جاهز"
    storeName: str = "مطعم غير محدد"
    customerDistrict: str = "منطقة العميل"
    payoutSar: float = 18.0
    storeLat: Optional[float] = None
    storeLng: Optional[float] = None
    customerLat: Optional[float] = None
    customerLng: Optional[float] = None
    distanceKm: Optional[float] = None

class OrderRecord(BaseModel):
    id: str
    appName: str
    storeName: str
    customerDistrict: str
    distanceKm: float
    payoutSar: float
    detectedAt: str
    status: str
    rejectionReason: Optional[str] = None
    autoAccepted: bool

# ----------------------------------------------------
# 3. Server In-Memory State
# ----------------------------------------------------
server_state: Dict[str, Any] = {
    "isRunning": True,
    "settings": {
        "maxDistanceKm": 2.0,
        "autoAccept": True,
        "soundAlerts": True,
        "minPayoutSar": 15.0,
        "vibrationFeedback": True,
    },
    "driverLocation": None,
    "orders": [],
}

# ----------------------------------------------------
# 4. API Endpoints
# ----------------------------------------------------
@app.get("/api/health")
def health_check():
    return {
        "status": "online",
        "service": "Locate Go Python FastAPI Server",
        "timestamp": datetime.utcnow().isoformat(),
    }

@app.get("/api/status")
def get_status():
    orders = server_state["orders"]
    accepted = len([o for o in orders if o["status"] == "accepted"])
    rejected = len([o for o in orders if o["status"] == "rejected"])
    
    return {
        "isRunning": server_state["isRunning"],
        "settings": server_state["settings"],
        "driverLocation": server_state["driverLocation"],
        "stats": {
            "totalScanned": len(orders),
            "acceptedCount": accepted,
            "rejectedCount": rejected,
            "acceptanceRate": round((accepted / len(orders)) * 100) if orders else 0,
        }
    }

@app.post("/api/status/toggle")
def toggle_status():
    server_state["isRunning"] = not server_state["isRunning"]
    status_text = "يعمل" if server_state["isRunning"] else "متوقف"
    return {
        "success": True,
        "isRunning": server_state["isRunning"],
        "message": f"تم تغيير حالة السيرفر إلى: {status_text}"
    }

@app.post("/api/settings")
def update_settings(settings: SettingsModel):
    server_state["settings"] = settings.dict()
    return {
        "success": True,
        "settings": server_state["settings"],
        "message": "تم تحديث إعدادات المسافة والشروط بنجاح"
    }

@app.post("/api/location")
def update_driver_location(loc: LocationModel):
    server_state["driverLocation"] = {
        "lat": loc.lat,
        "lng": loc.lng,
        "accuracy": loc.accuracy,
        "updatedAt": datetime.utcnow().isoformat(),
    }
    return {
        "success": True,
        "driverLocation": server_state["driverLocation"],
        "message": "تم استلام وتحديث موقع المندوب الحقيقي"
    }

@app.post("/api/orders/evaluate")
def evaluate_order(req: EvaluateOrderRequest):
    if not server_state["isRunning"]:
        raise HTTPException(status_code=403, detail="الأداة متوقفة حالياً عن استقبال الطلبات")

    # حساب المسافة الحقيقية
    computed_distance = 0.0
    if req.storeLat is not None and req.storeLng is not None and req.customerLat is not None and req.customerLng is not None:
        computed_distance = calculate_haversine_distance(req.storeLat, req.storeLng, req.customerLat, req.customerLng)
    elif server_state["driverLocation"] and req.storeLat is not None and req.storeLng is not None:
        d_loc = server_state["driverLocation"]
        computed_distance = calculate_haversine_distance(d_loc["lat"], d_loc["lng"], req.storeLat, req.storeLng)
    elif req.distanceKm is not None and req.distanceKm > 0:
        computed_distance = round(req.distanceKm, 1)
    else:
        raise HTTPException(status_code=400, detail="بيانات المسافة مفقودة: يجب إرسال distanceKm أو إحداثيات المتجر والعميل.")

    max_dist = server_state["settings"]["maxDistanceKm"]
    min_payout = server_state["settings"]["minPayoutSar"]

    dist_ok = computed_distance <= max_dist
    payout_ok = req.payoutSar >= min_payout
    is_accepted = dist_ok and payout_ok

    rejection_reason = None
    if not dist_ok:
        rejection_reason = f"المسافة ({computed_distance} كم) تتجاوز الحد الأقصى المسموح ({max_dist} كم)"
    elif not payout_ok:
        rejection_reason = f"قيمة التوصيل ({req.payoutSar} ر.س) أقل من الحد الأدنى ({min_payout} ر.س)"

    order_id = f"ord-{int(datetime.utcnow().timestamp() * 1000) % 10000}"
    order_record = {
        "id": order_id,
        "appName": req.appName,
        "storeName": req.storeName,
        "customerDistrict": req.customerDistrict,
        "distanceKm": computed_distance,
        "payoutSar": req.payoutSar,
        "detectedAt": datetime.utcnow().isoformat(),
        "status": "accepted" if is_accepted else "rejected",
        "rejectionReason": rejection_reason,
        "autoAccepted": is_accepted and server_state["settings"]["autoAccept"],
    }

    # حفظ في السجل
    server_state["orders"].insert(0, order_record)
    if len(server_state["orders"]) > 100:
        server_state["orders"].pop()

    return {
        "success": True,
        "decision": "accepted" if is_accepted else "rejected",
        "order": order_record,
        "evaluation": {
            "computedDistanceKm": computed_distance,
            "maxAllowedKm": max_dist,
            "isAccepted": is_accepted,
            "rejectionReason": rejection_reason,
        }
    }

@app.get("/api/orders")
def get_orders():
    return {
        "orders": server_state["orders"],
        "count": len(server_state["orders"])
    }

@app.delete("/api/orders")
def clear_orders():
    server_state["orders"] = []
    return {"success": True, "message": "تم تفريغ السجل بنجاح"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=3000)
