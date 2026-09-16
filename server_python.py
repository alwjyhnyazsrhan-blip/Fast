"""
Locate Go - Multi-Tenant Backend Server (Python / FastAPI)
خادم المعالجة والتحقق الجغرافي الحقيقي لمناديب التوصيل مع عزل كامل للبيانات لكل جهاز (Device ID)
جاهز للرفع المباشر على Render, Railway, أو أي استضافة سحابية
"""

import math
from datetime import datetime
from typing import Optional, List, Dict, Any
from fastapi import FastAPI, HTTPException, Header, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

app = FastAPI(
    title="Locate Go - Courier Multi-Tenant API",
    description="نظام معالجة الطلبات والتحقق الجغرافي الحقيقي مع عزل البيانات لكل مندوب عبر Device ID",
    version="2.5.0"
)

# Enable CORS for frontend & Android WebView connection
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Device-Id"]
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
    maxPickupDistanceKm: float = Field(default=2.0, ge=0.5, le=50.0)
    autoAccept: bool = True
    soundAlerts: bool = True
    minPayoutSar: float = 15.0
    vibrationFeedback: bool = True

class LocationModel(BaseModel):
    lat: float
    lng: float
    accuracy: Optional[float] = None

class EvaluateOrderRequest(BaseModel):
    deviceId: Optional[str] = None
    appName: str = "جاهز"
    storeName: str = "مطعم غير محدد"
    customerDistrict: str = "منطقة العميل"
    payoutSar: float = 18.0
    storeLat: Optional[float] = None
    storeLng: Optional[float] = None
    customerLat: Optional[float] = None
    customerLng: Optional[float] = None
    distanceKm: Optional[float] = None
    pickupDistanceKm: Optional[float] = None
    deliveryDistanceKm: Optional[float] = None
    maxDistanceKm: Optional[float] = None
    maxPickupDistanceKm: Optional[float] = None

# ----------------------------------------------------
# 3. Multi-Tenant Device Store (Partitioned by Device ID)
# ----------------------------------------------------
devices_store: Dict[str, Dict[str, Any]] = {}

def get_device_data(device_id: Optional[str] = None) -> Dict[str, Any]:
    dev_id = (device_id or "").strip() or "LG-DEFAULT-DEV"
    if dev_id not in devices_store:
        devices_store[dev_id] = {
            "deviceId": dev_id,
            "isRunning": True,
            "settings": {
                "maxDistanceKm": 2.0,
                "maxPickupDistanceKm": 2.0,
                "autoAccept": True,
                "soundAlerts": True,
                "minPayoutSar": 15.0,
                "vibrationFeedback": True,
            },
            "driverLocation": None,
            "orders": [],
            "createdAt": datetime.utcnow().isoformat(),
            "lastActiveAt": datetime.utcnow().isoformat(),
        }
    device = devices_store[dev_id]
    device["lastActiveAt"] = datetime.utcnow().isoformat()
    return device

def resolve_device_id(x_device_id: Optional[str], deviceId: Optional[str]) -> str:
    return (x_device_id or deviceId or "LG-DEFAULT-DEV").strip()

# ----------------------------------------------------
# 4. API Endpoints
# ----------------------------------------------------
@app.get("/api/health")
def health_check(x_device_id: Optional[str] = Header(None), deviceId: Optional[str] = Query(None)):
    dev_id = resolve_device_id(x_device_id, deviceId)
    device = get_device_data(dev_id)
    return {
        "status": "online",
        "service": "Locate Go Python FastAPI Server (Multi-Tenant)",
        "deviceId": device["deviceId"],
        "isRunning": device["isRunning"],
        "maxDistanceKm": device["settings"]["maxDistanceKm"],
        "maxPickupDistanceKm": device["settings"]["maxPickupDistanceKm"],
        "totalDevicesRegistered": len(devices_store),
        "timestamp": datetime.utcnow().isoformat(),
    }

@app.get("/api/status")
def get_status(x_device_id: Optional[str] = Header(None), deviceId: Optional[str] = Query(None)):
    dev_id = resolve_device_id(x_device_id, deviceId)
    device = get_device_data(dev_id)
    orders = device["orders"]
    accepted = len([o for o in orders if o["status"] == "accepted"])
    rejected = len([o for o in orders if o["status"] == "rejected"])
    
    return {
        "deviceId": device["deviceId"],
        "isRunning": device["isRunning"],
        "settings": device["settings"],
        "driverLocation": device["driverLocation"],
        "stats": {
            "totalScanned": len(orders),
            "acceptedCount": accepted,
            "rejectedCount": rejected,
            "acceptanceRate": round((accepted / len(orders)) * 100) if orders else 0,
        }
    }

@app.post("/api/status/toggle")
def toggle_status(x_device_id: Optional[str] = Header(None), deviceId: Optional[str] = Query(None)):
    dev_id = resolve_device_id(x_device_id, deviceId)
    device = get_device_data(dev_id)
    device["isRunning"] = not device["isRunning"]
    status_text = "يعمل" if device["isRunning"] else "متوقف"
    return {
        "success": True,
        "deviceId": device["deviceId"],
        "isRunning": device["isRunning"],
        "message": f"تم تغيير حالة الجهاز إلى: {status_text}"
    }

@app.post("/api/settings")
def update_settings(settings: SettingsModel, x_device_id: Optional[str] = Header(None), deviceId: Optional[str] = Query(None)):
    dev_id = resolve_device_id(x_device_id, deviceId)
    device = get_device_data(dev_id)
    device["settings"] = settings.dict()
    return {
        "success": True,
        "deviceId": device["deviceId"],
        "settings": device["settings"],
        "message": "تم تحديث إعدادات المسافة والشروط بنجاح لهذا الجهاز"
    }

@app.get("/api/settings")
def get_settings(x_device_id: Optional[str] = Header(None), deviceId: Optional[str] = Query(None)):
    dev_id = resolve_device_id(x_device_id, deviceId)
    device = get_device_data(dev_id)
    return {
        "success": True,
        "deviceId": device["deviceId"],
        "settings": device["settings"],
    }

@app.post("/api/location")
def update_driver_location(loc: LocationModel, x_device_id: Optional[str] = Header(None), deviceId: Optional[str] = Query(None)):
    dev_id = resolve_device_id(x_device_id, deviceId)
    device = get_device_data(dev_id)
    device["driverLocation"] = {
        "lat": loc.lat,
        "lng": loc.lng,
        "accuracy": loc.accuracy,
        "updatedAt": datetime.utcnow().isoformat(),
    }
    return {
        "success": True,
        "deviceId": device["deviceId"],
        "driverLocation": device["driverLocation"],
        "message": "تم استلام وتحديث موقع المندوب الحقيقي لهذا الجهاز"
    }

@app.post("/api/orders/evaluate")
@app.post("/api/evaluate-order")
def evaluate_order(req: EvaluateOrderRequest, x_device_id: Optional[str] = Header(None)):
    dev_id = resolve_device_id(x_device_id, req.deviceId)
    device = get_device_data(dev_id)

    if not device["isRunning"]:
        raise HTTPException(status_code=403, detail="الأداة متوقفة حالياً عن استقبال الطلبات لهذا الجهاز")

    # حساب المسافة الحقيقية
    computed_distance = 0.0
    if req.storeLat is not None and req.storeLng is not None and req.customerLat is not None and req.customerLng is not None:
        computed_distance = calculate_haversine_distance(req.storeLat, req.storeLng, req.customerLat, req.customerLng)
    elif req.deliveryDistanceKm is not None and req.deliveryDistanceKm > 0:
        computed_distance = round(req.deliveryDistanceKm, 1)
    elif req.distanceKm is not None and req.distanceKm > 0:
        computed_distance = round(req.distanceKm, 1)
    elif req.pickupDistanceKm is not None and req.pickupDistanceKm > 0:
        computed_distance = round(req.pickupDistanceKm, 1)
    elif device["driverLocation"] and req.storeLat is not None and req.storeLng is not None:
        d_loc = device["driverLocation"]
        computed_distance = calculate_haversine_distance(d_loc["lat"], d_loc["lng"], req.storeLat, req.storeLng)
    else:
        raise HTTPException(status_code=400, detail="بيانات المسافة مفقودة: يجب إرسال distanceKm أو إحداثيات المتجر والعميل.")

    max_dist = req.maxDistanceKm or device["settings"]["maxDistanceKm"]
    max_pickup = req.maxPickupDistanceKm or device["settings"]["maxPickupDistanceKm"]
    min_payout = device["settings"]["minPayoutSar"]

    delivery_km = req.deliveryDistanceKm if req.deliveryDistanceKm is not None and req.deliveryDistanceKm > 0 else computed_distance
    pickup_km = req.pickupDistanceKm if req.pickupDistanceKm is not None and req.pickupDistanceKm > 0 else None

    is_delivery_ok = delivery_km <= max_dist
    is_pickup_ok = (pickup_km <= max_pickup) if pickup_km is not None else True
    is_payout_ok = req.payoutSar >= min_payout
    is_accepted = is_delivery_ok and is_pickup_ok and is_payout_ok

    rejection_reason = None
    if not is_delivery_ok and not is_pickup_ok:
        rejection_reason = f"مسافة العميل ({delivery_km} كم > {max_dist} كم) ومسافة المطعم ({pickup_km} كم > {max_pickup} كم) تتجاوزان الحد"
    elif not is_delivery_ok:
        rejection_reason = f"مسافة العميل ({delivery_km} كم) تتجاوز الحد الأقصى ({max_dist} كم)"
    elif not is_pickup_ok:
        rejection_reason = f"مسافة المطعم ({pickup_km} كم) تتجاوز الحد الأقصى ({max_pickup} كم)"
    elif not is_payout_ok:
        rejection_reason = f"قيمة التوصيل ({req.payoutSar} ر.س) أقل من الحد الأدنى ({min_payout} ر.س)"

    order_id = f"ord-{int(datetime.utcnow().timestamp() * 1000) % 10000}"
    order_record = {
        "id": order_id,
        "deviceId": device["deviceId"],
        "appName": req.appName,
        "storeName": req.storeName,
        "customerDistrict": req.customerDistrict,
        "distanceKm": computed_distance,
        "pickupDistanceKm": pickup_km,
        "deliveryDistanceKm": delivery_km,
        "payoutSar": req.payoutSar,
        "detectedAt": datetime.utcnow().isoformat(),
        "status": "accepted" if is_accepted else "rejected",
        "rejectionReason": rejection_reason,
        "autoAccepted": is_accepted and device["settings"]["autoAccept"],
    }

    # حفظ في سجل هذا الجهاز المعزول فقط
    device["orders"].insert(0, order_record)
    if len(device["orders"]) > 100:
        device["orders"].pop()

    return {
        "success": True,
        "deviceId": device["deviceId"],
        "decision": "accepted" if is_accepted else "rejected",
        "order": order_record,
        "evaluation": {
            "computedDistanceKm": computed_distance,
            "deliveryDistanceKm": delivery_km,
            "pickupDistanceKm": pickup_km,
            "maxAllowedDeliveryKm": max_dist,
            "maxAllowedPickupKm": max_pickup,
            "isAccepted": is_accepted,
            "rejectionReason": rejection_reason,
        }
    }

@app.get("/api/orders")
def get_orders(x_device_id: Optional[str] = Header(None), deviceId: Optional[str] = Query(None)):
    dev_id = resolve_device_id(x_device_id, deviceId)
    device = get_device_data(dev_id)
    return {
        "deviceId": device["deviceId"],
        "orders": device["orders"],
        "count": len(device["orders"])
    }

@app.delete("/api/orders")
def clear_orders(x_device_id: Optional[str] = Header(None), deviceId: Optional[str] = Query(None)):
    dev_id = resolve_device_id(x_device_id, deviceId)
    device = get_device_data(dev_id)
    device["orders"] = []
    return {
        "success": True,
        "deviceId": device["deviceId"],
        "message": "تم تفريغ سجل الطلبات لهذا الجهاز بنجاح"
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=3000)
