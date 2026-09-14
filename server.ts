import express, { Request, Response } from "express";
import path from "path";
import { createServer as createViteServer } from "vite";

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
  appName: string;
  storeName: string;
  customerDistrict: string;
  distanceKm: number;
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

// In-Memory Real State (can be connected to SQLite, Postgres, or MongoDB in production)
const state = {
  isRunning: true,
  settings: {
    maxDistanceKm: 2.0,
    autoAccept: true,
    soundAlerts: true,
    minPayoutSar: 15.0,
    vibrationFeedback: true,
  },
  driverLocation: null as {
    lat: number;
    lng: number;
    accuracy?: number;
    updatedAt: string;
  } | null,
  orders: [] as RealOrder[],
  scanCount: 0,
};

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // ==========================================
  // 1. HEALTH & SYSTEM DIAGNOSTICS
  // ==========================================
  app.get("/api/health", (_req: Request, res: Response) => {
    res.json({
      status: "online",
      service: "Locate Go Backend Server",
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
    });
  });

  // ==========================================
  // 2. GET CURRENT SYSTEM STATUS & SETTINGS
  // ==========================================
  app.get("/api/status", (_req: Request, res: Response) => {
    const acceptedCount = state.orders.filter((o) => o.status === "accepted").length;
    const rejectedCount = state.orders.filter((o) => o.status === "rejected").length;

    res.json({
      isRunning: state.isRunning,
      settings: state.settings,
      driverLocation: state.driverLocation,
      stats: {
        totalScanned: state.orders.length,
        acceptedCount,
        rejectedCount,
        acceptanceRate:
          state.orders.length > 0
            ? Math.round((acceptedCount / state.orders.length) * 100)
            : 0,
      },
    });
  });

  // ==========================================
  // 3. MASTER START/STOP TOGGLE
  // ==========================================
  app.post("/api/status/toggle", (req: Request, res: Response) => {
    if (typeof req.body.isRunning === "boolean") {
      state.isRunning = req.body.isRunning;
    } else {
      state.isRunning = !state.isRunning;
    }

    res.json({
      success: true,
      isRunning: state.isRunning,
      message: state.isRunning ? "تم تشغيل الأداة والمراقبة بنجاح" : "تم إيقاف الأداة مؤقتاً",
    });
  });

  // ==========================================
  // 4. UPDATE SETTINGS (Max Distance, etc.)
  // ==========================================
  app.post("/api/settings", (req: Request, res: Response) => {
    const { maxDistanceKm, autoAccept, soundAlerts, minPayoutSar, vibrationFeedback } = req.body;

    if (typeof maxDistanceKm === "number" && maxDistanceKm > 0) {
      state.settings.maxDistanceKm = Math.round(maxDistanceKm * 10) / 10;
    }
    if (typeof autoAccept === "boolean") {
      state.settings.autoAccept = autoAccept;
    }
    if (typeof soundAlerts === "boolean") {
      state.settings.soundAlerts = soundAlerts;
    }
    if (typeof minPayoutSar === "number" && minPayoutSar >= 0) {
      state.settings.minPayoutSar = minPayoutSar;
    }
    if (typeof vibrationFeedback === "boolean") {
      state.settings.vibrationFeedback = vibrationFeedback;
    }

    res.json({
      success: true,
      settings: state.settings,
      message: "تم حفظ الإعدادات بنجاح في السيرفر",
    });
  });

  // ==========================================
  // 5. UPDATE DRIVER'S REAL LIVE GPS LOCATION
  // ==========================================
  app.post("/api/location", (req: Request, res: Response) => {
    const { lat, lng, accuracy } = req.body;

    if (typeof lat !== "number" || typeof lng !== "number") {
      return res.status(400).json({ error: "الإحداثيات غير صحيحة (lat and lng required)" });
    }

    state.driverLocation = {
      lat,
      lng,
      accuracy: accuracy || undefined,
      updatedAt: new Date().toISOString(),
    };

    res.json({
      success: true,
      driverLocation: state.driverLocation,
      message: "تم تحديث موقع المندوب الحقيقي بنجاح",
    });
  });

  // ==========================================
  // 6. REAL GEOGRAPHIC & DISTANCE EVALUATION ENDPOINT
  // Webhook or App trigger sends the incoming order details here
  // ==========================================
  app.post("/api/orders/evaluate", (req: Request, res: Response) => {
    if (!state.isRunning) {
      return res.status(403).json({
        decision: "ignored",
        reason: "الأداة في وضع الإيقاف (Offline)",
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
    } else if (
      state.driverLocation &&
      typeof storeLat === "number" &&
      typeof storeLng === "number"
    ) {
      // Driver to store pickup distance
      computedDistance = calculateHaversineDistanceKm(
        state.driverLocation.lat,
        state.driverLocation.lng,
        storeLat,
        storeLng
      );
    } else if (typeof inputDistance === "number" && inputDistance > 0) {
      // Direct distance extracted by Accessibility Service / OCR
      computedDistance = Math.round(inputDistance * 10) / 10;
    } else {
      return res.status(400).json({
        error: "بيانات المسافة مفقودة: يجب إرسال distanceKm أو إحداثيات المتجر والعميل.",
      });
    }

    const maxAllowed = state.settings.maxDistanceKm;
    const minPayout = state.settings.minPayoutSar;

    const isDistanceAcceptable = computedDistance <= maxAllowed;
    const isPayoutAcceptable = payoutSar >= minPayout;
    const isAccepted = isDistanceAcceptable && isPayoutAcceptable;

    let rejectionReason: string | undefined = undefined;
    if (!isDistanceAcceptable) {
      rejectionReason = `المسافة (${computedDistance} كم) تتجاوز الحد الأقصى المسموح (${maxAllowed} كم)`;
    } else if (!isPayoutAcceptable) {
      rejectionReason = `قيمة التوصيل (${payoutSar} ر.س) أقل من الحد الأدنى (${minPayout} ر.س)`;
    }

    const newOrder: RealOrder = {
      id: `ord-${Date.now().toString().slice(-4)}`,
      appName,
      storeName,
      customerDistrict,
      distanceKm: computedDistance,
      payoutSar: Number(payoutSar) || 18,
      detectedAt: new Date().toISOString(),
      status: isAccepted ? "accepted" : "rejected",
      rejectionReason,
      autoAccepted: isAccepted && state.settings.autoAccept,
      coordinates: {
        store: storeLat && storeLng ? { lat: storeLat, lng: storeLng } : undefined,
        customer: customerLat && customerLng ? { lat: customerLat, lng: customerLng } : undefined,
        driver: state.driverLocation
          ? { lat: state.driverLocation.lat, lng: state.driverLocation.lng }
          : undefined,
      },
    };

    // Keep up to 100 recent orders in history
    state.orders.unshift(newOrder);
    if (state.orders.length > 100) {
      state.orders.pop();
    }

    res.status(201).json({
      success: true,
      decision: isAccepted ? "accepted" : "rejected",
      order: newOrder,
      evaluation: {
        computedDistanceKm: computedDistance,
        maxAllowedKm: maxAllowed,
        isAccepted,
        rejectionReason,
      },
    });
  });

  // ==========================================
  // 7. GET ALL ORDERS HISTORY
  // ==========================================
  app.get("/api/orders", (_req: Request, res: Response) => {
    res.json({
      orders: state.orders,
      count: state.orders.length,
    });
  });

  // ==========================================
  // 8. CLEAR ORDERS HISTORY
  // ==========================================
  app.delete("/api/orders", (_req: Request, res: Response) => {
    state.orders = [];
    res.json({ success: true, message: "تم مسح سجل الطلبات بنجاح" });
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
    console.log(`[Locate Go Server] Running on http://localhost:${PORT}`);
  });
}

startServer();
