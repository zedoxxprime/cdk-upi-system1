export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Only POST allowed' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const accessToken = body.accessToken;

    if (!accessToken) {
      return res.status(400).json({ success: false, error: 'accessToken required' });
    }

    console.log('[API] Got token:', accessToken.substring(0, 20) + '...');

    const response = await fetch('https://chatgpt.com/backend-api/payments/checkout', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + accessToken,
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Origin': 'https://chatgpt.com',
        'Referer': 'https://chatgpt.com/'
      },
      body: JSON.stringify({
        plan_name: "chatgptplusplan",
        billing_details: { country: "IN", currency: "INR" },
        promo_code: null,
        cancel_url: "https://chatgpt.com/",
        checkout_ui_mode: "redirect"
      })
    });

    const rawText = await response.text();
    console.log('[API] Raw:', rawText.substring(0, 300));

    let data;
    try {
      data = JSON.parse(rawText);
    } catch (e) {
      return res.status(502).json({
        success: false,
        error: 'ChatGPT returned invalid JSON. Token may be expired.',
        raw: rawText.substring(0, 200)
      });
    }

    const url = data.url || data.stripe_hosted_url || data.checkout_url || data.redirect_url || data.payment_url || '';

    if (url) {
      console.log('[API] SUCCESS URL:', url.substring(0, 100));
      return res.status(200).json({
        success: true,
        url: url,
        checkoutUrl: url,
        stripeUrl: url,
        message: 'Stripe UPI checkout URL generated'
      });
    } else {
      return res.status(400).json({
        success: false,
        error: 'No checkout URL. Account may already have Plus subscription.',
        chatgptResponse: data
      });
    }

  } catch (err) {
    console.error('[API] Error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
}
