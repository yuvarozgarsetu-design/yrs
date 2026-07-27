import crypto from "crypto";

export const config = { api: { bodyParser: false } };

async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", chunk => { data += chunk; });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

async function getToken() {
  const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({
    iss: sa.client_email, sub: sa.client_email,
    aud: "https://oauth2.googleapis.com/token",
    iat: now, exp: now + 3600,
    scope: "https://www.googleapis.com/auth/datastore"
  })).toString("base64url");
  const sign = crypto.createSign("RSA-SHA256");
  sign.update(header + "." + payload);
  const sig = sign.sign(sa.private_key, "base64url");
  const jwt = header + "." + payload + "." + sig;
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=" + jwt
  });
  const d = await r.json();
  return d.access_token;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  try {
    const rawBody = await getRawBody(req);
    const sig = req.headers["x-razorpay-signature"];
    const expected = crypto.createHmac("sha256", process.env.RAZORPAY_WEBHOOK_SECRET)
      .update(rawBody).digest("hex");
    if (expected !== sig) return res.status(400).json({ error: "Invalid signature" });
    const event = JSON.parse(rawBody);
    if (event.event === "payment.captured") {
      const payment = event.payload.payment.entity;
      const uid = payment.notes && payment.notes.uid;
      const credits = parseInt((payment.notes && payment.notes.credits) || "10");
      if (!uid) return res.status(400).json({ error: "No UID" });
      const token = await getToken();
      const pid = process.env.FIREBASE_PROJECT_ID;
      const url = "https://firestore.googleapis.com/v1/projects/" + pid + "/databases/(default)/documents/users/" + uid;
      const getRes = await fetch(url, { headers: { "Authorization": "Bearer " + token } });
      const userData = await getRes.json();
      const cur = parseInt((userData.fields && userData.fields.credits && userData.fields.credits.integerValue) || "0");
      await fetch(url + "?updateMask.fieldPaths=credits&updateMask.fieldPaths=lastPayment&updateMask.fieldPaths=lastPaymentId", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + token },
        body: JSON.stringify({
          fields: {
            credits: { integerValue: cur + credits },
            lastPayment: { stringValue: new Date().toISOString() },
            lastPaymentId: { stringValue: payment.id }
          }
        })
      });
    }
    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
