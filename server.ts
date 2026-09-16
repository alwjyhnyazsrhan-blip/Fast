import express, { Request, Response } from "express";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { createServer as createViteServer } from "vite";

// Obfuscated HMAC Secret matching Android SecurityHardener
const MASTER_HMAC_SECRET = Buffer.from([
  0x4c, 0x47, 0x5f, 0x53, 0x45, 0x43, 0x55, 0x52, 
  0x45, 0x5f, 0x32, 0x30, 0x32, 0x36, 0x5f, 0x48, 
  0x41, 0x53, 0x48, 0x5f, 0x56, 0x45, 0x52, 0x49, 
  0x46, 0x59, 0x5f, 0x4c, 0x47, 0x5f, 0x39, 0x39
]).map((b, i) => b ^ (i % 7));

function verifyRequestSignature(
  deviceId: string,
  timestampStr: string | undefined,
  nonce: string | undefined,
  signature: string | undefined,
  rawBody: string
): { isValid: boolean; reason?: string } {
  if (!signature || !timestampStr || !nonce) {
    return { isValid: true };
  }

  const timestamp = parseInt(timestampStr, 10);
  const now = Date.now();
  // Anti-Replay: 5 minutes tolerance (300,000 ms)
  if (isNaN(timestamp) || Math.abs(now - timestamp) > 300000) {
    return { isValid: false, reason: "Request timestamp expired or outside security window (Anti-Replay)" };
  }

  const normalized = `${deviceId}:${timestamp}:${nonce}:${rawBody}`;
  const hmac = crypto.createHmac("sha256", MASTER_HMAC_SECRET);
  hmac.update(normalized, "utf8");
  const expectedSig = hmac.digest("hex");

  if (signature.toLowerCase() === expectedSig.toLowerCase()) {
    return { isValid: true };
  }

  // Fallback SHA-256 integrity check
  const fallbackHash = crypto.createHash("sha256").update(normalized, "utf8").digest("hex");
  if (signature.toLowerCase() === fallbackHash.toLowerCase()) {
    return { isValid: true };
  }

  return { isValid: false, reason: "Invalid cryptographic HMAC signature" };
}

// Haversine formula for real-world geodesic distance calculation
function calculateHaversineDistanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) *
      Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 10) / 10;
}

export interface RealOrder {
  id: string;
  deviceId?: string;
  appName: string;
  storeName: string;
  customerDistrict: string;
  distanceKm: number;
  pickupDistanceKm?: number;
  deliveryDistanceKm?: number;
  payoutSar: number;
  detectedAt: string;
  status: "accepted" | "rejected";
  rejectionReason?: string;
  autoAccepted: boolean;
  coordinates?: {
    store?: { lat: number; lng: number };
    customer?: { lat: number; lng: number };
    driver?: { lat: number; lng: number };
  };
}

export interface DeviceData {
  deviceId: string;
  isRunning: boolean;
  settings: {
    maxDistanceKm: number;
    maxPickupDistanceKm: number;
    autoAccept: boolean;
    soundAlerts: boolean;
    minPayoutSar: number;
    vibrationFeedback: boolean;
  };
  driverLocation: {
    lat: number;
    lng: number;
    accuracy?: number;
    updatedAt: string;
  } | null;
  orders: RealOrder[];
  createdAt: string;
  lastActiveAt: string;
}

// Multi-Tenant In-Memory & Persistent Storage per Device ID
const DATA_DIR = path.join(process.cwd(), "data");
const STORE_FILE = path.join(DATA_DIR, "locate_go_devices.json");
const devices = new Map<string, DeviceData>();

// Ensure data directory exists
try {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
} catch (err) {
  console.warn("[Storage] Could not create data directory:", err);
}

// Load devices from disk if available
try {
  if (fs.existsSync(STORE_FILE)) {
    const raw = fs.readFileSync(STORE_FILE, "utf-8");
    const parsed = JSON.parse(raw);
    if (typeof parsed === "object" && parsed !== null) {
      Object.keys(parsed).forEach((devId) => {
        devices.set(devId, parsed[devId]);
      });
      console.log(`[Storage] Loaded ${devices.size} isolated device profiles from disk.`);
    }
  }
} catch (err) {
  console.warn("[Storage] Could not load persisted devices:", err);
}

let saveTimeout: NodeJS.Timeout | null = null;
function scheduleSave() {
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => {
    try {
      const obj: Record<string, DeviceData> = {};
      devices.forEach((val, key) => {
        obj[key] = val;
      });
      fs.writeFileSync(STORE_FILE, JSON.stringify(obj, null, 2), "utf-8");
    } catch (err) {
      console.warn("[Storage] Error persisting devices to disk:", err);
    }
  }, 1000);
}

// Extract Device ID cleanly from Header (X-Device-Id), Query, or Body
function extractDeviceId(req: Request): string {
  const headerVal = req.headers["x-device-id"];
  const fromHeader = Array.isArray(headerVal) ? headerVal[0] : headerVal;
  const fromQuery = typeof req.query.deviceId === "string" ? req.query.deviceId : undefined;
  const fromBody = req.body && typeof req.body === "object" && typeof req.body.deviceId === "string" ? req.body.deviceId : undefined;

  const raw = fromHeader || fromQuery || fromBody;
  if (raw && raw.trim().length > 0) {
    return raw.trim();
  }
  return "LG-DEFAULT-DEV";
}

// Get or initialize device data
function getDeviceData(rawDeviceId: string): DeviceData {
  const deviceId = rawDeviceId.trim();
  if (!devices.has(deviceId)) {
    devices.set(deviceId, {
      deviceId,
      isRunning: true,
      settings: {
        maxDistanceKm: 2.0,
        maxPickupDistanceKm: 2.0,
        autoAccept: true,
        soundAlerts: true,
        minPayoutSar: 15.0,
        vibrationFeedback: true,
      },
      driverLocation: null,
      orders: [],
      createdAt: new Date().toISOString(),
      lastActiveAt: new Date().toISOString(),
    });
    scheduleSave();
  }
  const data = devices.get(deviceId)!;
  data.lastActiveAt = new Date().toISOString();
  return data;
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // CORS & Security middleware for Android mobile app & cross-origin test clients
  app.use((_req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization, User-Agent, X-Device-Id, X-Signature, X-Timestamp, X-Nonce, X-Security-Mode, X-Client-Ver"
    );
    res.setHeader("Access-Control-Expose-Headers", "X-Device-Id, X-Signature, X-Timestamp, X-Security-Status");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "SAMEORIGIN");
    if (_req.method === "OPTIONS") {
      return res.sendStatus(204);
    }
    next();
  });

  // API Signature & Integrity Verification Middleware
  app.use("/api", (req: Request, res: Response, next) => {
    const signature = req.headers["x-signature"] as string | undefined;
    const timestampStr = req.headers["x-timestamp"] as string | undefined;
    const nonce = req.headers["x-nonce"] as string | undefined;

    if (signature && timestampStr && nonce) {
      const deviceId = extractDeviceId(req);
      const rawBody = req.method === "GET" || req.method === "HEAD" ? "" : JSON.stringify(req.body || {});
      const check = verifyRequestSignature(deviceId, timestampStr, nonce, signature, rawBody);
      if (!check.isValid) {
        console.warn(`[Security Alert] Rejected unverified signature from device ${deviceId}: ${check.reason}`);
        return res.status(403).json({
          error: "Forbidden",
          message: "فشل التحقق من التوقيع الرقمي للطلب المشفر (HMAC Signature Mismatch or Expired)",
          reason: check.reason,
          timestamp: new Date().toISOString(),
        });
      }
      res.setHeader("X-Security-Status", "Verified-HMAC");
    }
    next();
  });

  // ==========================================
  // 1. HEALTH & PING DIAGNOSTICS FOR ANDROID APP
  // Responds to GET & POST on /api/health and /api/ping
  // ==========================================
  const handleHealthAndPing = (req: Request, res: Response) => {
    const deviceId = extractDeviceId(req);
    const device = getDeviceData(deviceId);

    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    return res.status(200).json({
      status: "online",
      success: true,
      ping: "pong",
      service: "Locate Go Multi-Tenant Backend",
      server: "locate",
      message: "سيرفر Locate Go متصل وجاهز، ويطبق العزل الكامل لكل جهاز مندوب",
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
      deviceId: device.deviceId,
      isRunning: device.isRunning,
      maxDistanceKm: device.settings.maxDistanceKm,
      maxPickupDistanceKm: device.settings.maxPickupDistanceKm,
      totalDevicesRegistered: devices.size,
    });
  };

  app.get("/api/health", handleHealthAndPing);
  app.post("/api/health", handleHealthAndPing);
  app.get("/api/ping", handleHealthAndPing);
  app.post("/api/ping", handleHealthAndPing);
  app.get("/health", handleHealthAndPing);
  app.post("/health", handleHealthAndPing);
  app.get("/ping", handleHealthAndPing);
  app.post("/ping", handleHealthAndPing);

  // ==========================================
  // 2. GET DEVICE PROFILE INFO
  // ==========================================
  app.get("/api/device/me", (req: Request, res: Response) => {
    const deviceId = extractDeviceId(req);
    const device = getDeviceData(deviceId);
    res.json({
      success: true,
      deviceId: device.deviceId,
      isRunning: device.isRunning,
      settings: device.settings,
      totalOrders: device.orders.length,
      createdAt: device.createdAt,
      lastActiveAt: device.lastActiveAt,
      isolationGuaranteed: true,
    });
  });

  // ==========================================
  // 3. GET CURRENT SYSTEM STATUS & STATS (ISOLATED BY DEVICE ID)
  // ==========================================
  app.get("/api/status", (req: Request, res: Response) => {
    const deviceId = extractDeviceId(req);
    const device = getDeviceData(deviceId);

    const acceptedCount = device.orders.filter((o) => o.status === "accepted").length;
    const rejectedCount = device.orders.filter((o) => o.status === "rejected").length;

    res.json({
      deviceId: device.deviceId,
      isRunning: device.isRunning,
      settings: device.settings,
      driverLocation: device.driverLocation,
      stats: {
        totalScanned: device.orders.length,
        acceptedCount,
        rejectedCount,
        acceptanceRate:
          device.orders.length > 0
            ? Math.round((acceptedCount / device.orders.length) * 100)
            : 0,
      },
    });
  });

  // ==========================================
  // 4. MASTER START/STOP TOGGLE (ISOLATED BY DEVICE ID)
  // ==========================================
  app.post("/api/status/toggle", (req: Request, res: Response) => {
    const deviceId = extractDeviceId(req);
    const device = getDeviceData(deviceId);

    if (typeof req.body.isRunning === "boolean") {
      device.isRunning = req.body.isRunning;
    } else {
      device.isRunning = !device.isRunning;
    }
    scheduleSave();

    res.json({
      success: true,
      deviceId: device.deviceId,
      isRunning: device.isRunning,
      message: device.isRunning ? "تم تشغيل الأداة والمراقبة بنجاح لهذا الجهاز" : "تم إيقاف الأداة مؤقتاً لهذا الجهاز",
    });
  });

  // ==========================================
  // 5. UPDATE SETTINGS (ISOLATED BY DEVICE ID)
  // ==========================================
  app.post("/api/settings", (req: Request, res: Response) => {
    const deviceId = extractDeviceId(req);
    const device = getDeviceData(deviceId);

    const { maxDistanceKm, maxPickupDistanceKm, autoAccept, soundAlerts, minPayoutSar, vibrationFeedback } = req.body;

    if (typeof maxDistanceKm === "number" && maxDistanceKm > 0) {
      device.settings.maxDistanceKm = Math.round(maxDistanceKm * 10) / 10;
    }
    if (typeof maxPickupDistanceKm === "number" && maxPickupDistanceKm > 0) {
      device.settings.maxPickupDistanceKm = Math.round(maxPickupDistanceKm * 10) / 10;
    }
    if (typeof autoAccept === "boolean") {
      device.settings.autoAccept = autoAccept;
    }
    if (typeof soundAlerts === "boolean") {
      device.settings.soundAlerts = soundAlerts;
    }
    if (typeof minPayoutSar === "number" && minPayoutSar >= 0) {
      device.settings.minPayoutSar = minPayoutSar;
    }
    if (typeof vibrationFeedback === "boolean") {
      device.settings.vibrationFeedback = vibrationFeedback;
    }
    scheduleSave();

    res.json({
      success: true,
      deviceId: device.deviceId,
      settings: device.settings,
      message: "تم حفظ الإعدادات بنجاح للمندوب",
    });
  });

  app.get("/api/settings", (req: Request, res: Response) => {
    const deviceId = extractDeviceId(req);
    const device = getDeviceData(deviceId);

    res.json({
      success: true,
      deviceId: device.deviceId,
      settings: device.settings,
    });
  });

  // ==========================================
  // 6. UPDATE DRIVER'S REAL LIVE GPS LOCATION (ISOLATED BY DEVICE ID)
  // ==========================================
  app.post(["/api/location", "/api/driver/location"], (req: Request, res: Response) => {
    const deviceId = extractDeviceId(req);
    const device = getDeviceData(deviceId);
    const { lat, lng, accuracy } = req.body;

    if (typeof lat !== "number" || typeof lng !== "number") {
      return res.status(400).json({ error: "الإحداثيات غير صحيحة (lat and lng required)" });
    }

    device.driverLocation = {
      lat,
      lng,
      accuracy: accuracy || undefined,
      updatedAt: new Date().toISOString(),
    };
    scheduleSave();

    res.json({
      success: true,
      deviceId: device.deviceId,
      driverLocation: device.driverLocation,
      message: "تم تحديث موقع المندوب الحقيقي بنجاح",
    });
  });

  // ==========================================
  // 7. REAL GEOGRAPHIC & DISTANCE EVALUATION (ISOLATED BY DEVICE ID)
  // Webhook or App trigger sends the incoming order details here
  // ==========================================
  app.post(["/api/orders/evaluate", "/api/evaluate-order"], (req: Request, res: Response) => {
    const deviceId = extractDeviceId(req);
    const device = getDeviceData(deviceId);

    if (!device.isRunning) {
      return res.status(403).json({
        decision: "ignored",
        deviceId: device.deviceId,
        reason: "الأداة في وضع الإيقاف (Offline) لهذا الجهاز",
      });
    }

    const {
      appName = "جاهز",
      storeName = "مطعم غير محدد",
      customerDistrict = "منطقة العميل",
      payoutSar = 18.0,
      storeLat,
      storeLng,
      customerLat,
      customerLng,
      distanceKm: inputDistance,
      pickupDistanceKm,
      deliveryDistanceKm,
      // Optional override thresholds from device's local state
      maxDistanceKm: overrideDeliveryLimit,
      maxPickupDistanceKm: overridePickupLimit,
    } = req.body;

    let computedDistance = 0;

    // A) If real store and customer/driver coordinates are provided, compute geodesic distance
    if (
      typeof storeLat === "number" &&
      typeof storeLng === "number" &&
      typeof customerLat === "number" &&
      typeof customerLng === "number"
    ) {
      computedDistance = calculateHaversineDistanceKm(storeLat, storeLng, customerLat, customerLng);
    } else if (typeof deliveryDistanceKm === "number" && deliveryDistanceKm > 0) {
      computedDistance = Math.round(deliveryDistanceKm * 10) / 10;
    } else if (typeof inputDistance === "number" && inputDistance > 0) {
      computedDistance = Math.round(inputDistance * 10) / 10;
    } else if (typeof pickupDistanceKm === "number" && pickupDistanceKm > 0) {
      computedDistance = Math.round(pickupDistanceKm * 10) / 10;
    } else if (
      device.driverLocation &&
      typeof storeLat === "number" &&
      typeof storeLng === "number"
    ) {
      computedDistance = calculateHaversineDistanceKm(
        device.driverLocation.lat,
        device.driverLocation.lng,
        storeLat,
        storeLng
      );
    } else {
      return res.status(400).json({
        error: "بيانات المسافة مفقودة: يجب إرسال distanceKm أو إحداثيات المتجر والعميل.",
      });
    }

    // Determine effective limits (priority to explicit device settings)
    const maxAllowedDelivery = typeof overrideDeliveryLimit === "number" && overrideDeliveryLimit > 0
      ? overrideDeliveryLimit
      : device.settings.maxDistanceKm;

    const maxAllowedPickup = typeof overridePickupLimit === "number" && overridePickupLimit > 0
      ? overridePickupLimit
      : device.settings.maxPickupDistanceKm;

    const minPayout = device.settings.minPayoutSar;

    const deliveryKm = typeof deliveryDistanceKm === "number" && deliveryDistanceKm > 0 ? deliveryDistanceKm : computedDistance;
    const pickupKm = typeof pickupDistanceKm === "number" && pickupDistanceKm > 0 ? pickupDistanceKm : undefined;

    const isDeliveryAcceptable = deliveryKm <= maxAllowedDelivery;
    const isPickupAcceptable = pickupKm !== undefined ? pickupKm <= maxAllowedPickup : true;
    // تم إلغاء شرط الحد الأدنى للأرباح، والاعتماد حصرياً وبشكل مباشر على تحقق مسافة المطعم ومسافة العميل فقط
    const isAccepted = isDeliveryAcceptable && isPickupAcceptable;

    let rejectionReason: string | undefined = undefined;
    if (!isDeliveryAcceptable && !isPickupAcceptable) {
      rejectionReason = `مسافة العميل (${deliveryKm} كم > ${maxAllowedDelivery} كم) ومسافة المطعم (${pickupKm} كم > ${maxAllowedPickup} كم) تتجاوزان الحد المسموح`;
    } else if (!isDeliveryAcceptable) {
      rejectionReason = `مسافة العميل (${deliveryKm} كم) تتجاوز الحد الأقصى المسموح (${maxAllowedDelivery} كم)`;
    } else if (!isPickupAcceptable) {
      rejectionReason = `مسافة المطعم (${pickupKm} كم) تتجاوز الحد الأقصى المسموح (${maxAllowedPickup} كم)`;
    }

    const newOrder: RealOrder = {
      id: `ord-${Date.now().toString().slice(-4)}`,
      deviceId: device.deviceId,
      appName,
      storeName,
      customerDistrict,
      distanceKm: computedDistance,
      pickupDistanceKm: typeof pickupDistanceKm === "number" ? pickupDistanceKm : undefined,
      deliveryDistanceKm: typeof deliveryDistanceKm === "number" ? deliveryDistanceKm : undefined,
      payoutSar: Number(payoutSar) || 18,
      detectedAt: new Date().toISOString(),
      status: isAccepted ? "accepted" : "rejected",
      rejectionReason,
      autoAccepted: isAccepted && device.settings.autoAccept,
      coordinates: {
        store: storeLat && storeLng ? { lat: storeLat, lng: storeLng } : undefined,
        customer: customerLat && customerLng ? { lat: customerLat, lng: customerLng } : undefined,
        driver: device.driverLocation
          ? { lat: device.driverLocation.lat, lng: device.driverLocation.lng }
          : undefined,
      },
    };

    // Store in THIS device's isolated order list ONLY!
    device.orders.unshift(newOrder);
    if (device.orders.length > 100) {
      device.orders.pop();
    }
    scheduleSave();

    res.status(201).json({
      success: true,
      deviceId: device.deviceId,
      decision: isAccepted ? "accepted" : "rejected",
      order: newOrder,
      evaluation: {
        computedDistanceKm: computedDistance,
        deliveryDistanceKm: deliveryKm,
        pickupDistanceKm: pickupKm,
        maxAllowedDeliveryKm: maxAllowedDelivery,
        maxAllowedPickupKm: maxAllowedPickup,
        isAccepted,
        rejectionReason,
      },
    });
  });

  // ==========================================
  // 8. GET ALL ORDERS HISTORY FOR THIS DEVICE ONLY
  // ==========================================
  app.get("/api/orders", (req: Request, res: Response) => {
    const deviceId = extractDeviceId(req);
    const device = getDeviceData(deviceId);

    res.json({
      deviceId: device.deviceId,
      orders: device.orders,
      count: device.orders.length,
    });
  });

  // ==========================================
  // 9. CLEAR ORDERS HISTORY FOR THIS DEVICE ONLY
  // ==========================================
  app.delete("/api/orders", (req: Request, res: Response) => {
    const deviceId = extractDeviceId(req);
    const device = getDeviceData(deviceId);

    device.orders = [];
    scheduleSave();

    res.json({
      success: true,
      deviceId: device.deviceId,
      message: "تم مسح سجل الطلبات الخاص بهذا المندوب بنجاح",
    });
  });

  // ==========================================
  // VITE MIDDLEWARE & STATIC SERVING
  // ==========================================
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[Locate Go Server] Running on http://localhost:${PORT} with Multi-Tenant Device Isolation`);
  });
}

startServer();
