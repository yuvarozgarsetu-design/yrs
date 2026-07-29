export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).end();
  try {
    const { uid, email } = req.body;
    if (!uid) return res.status(400).json({ error: "User ID required" });
    const auth = Buffer.from(
      process.env.RAZORPAYKEYID + ":" + process.env.RAZORPAYKEYSECRET
    ).toString("base64");
    const orderRes = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Basic " + auth },
      body: JSON.stringify({
        amount: 9900,
        currency: "INR",
        receipt: "yrs_" + uid + "_" + Date.now(),
        notes: { uid: uid, email: email || "", credits: "10" }
      })
    });
    const order = await orderRes.json();
    console.log("RAZORPAY_KEY_ID present:", !!process.env.RAZORPAY_KEY_ID);
    console.log("RAZORPAY_KEY_SECRET present:", !!process.env.RAZORPAY_KEY_SECRET);
    console.log("Razorpay raw response:", JSON.stringify(order));
    if (order.error) return res.status(400).json({ error: order.error.description, raw: order.error });
    return res.status(200).json({ orderId: order.id, amount: order.amount });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
