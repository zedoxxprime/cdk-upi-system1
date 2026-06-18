export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ success: false, error: 'Only POST allowed' });
    return;
  }

  try {
    const body = req.body || {};
    const accessToken = body.accessToken;

    if (!accessToken) {
      res.status(400).json({ 
        success: false, 
        error: 'Access token is required' 
      });
      return;
    }

    console.log('[API] Got accessToken:', accessToken.substring(0, 20) + '...');

    // Call ChatGPT's real API
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
        billing_details: {
          country: "IN",
          currency: "INR"
        },
        promo_code: null,
        cancel_url: "https://chatgpt.com/",
        checkout_ui_mode: "redirect"
      })
    });

    console.log('[API] ChatGPT response status:', response.status);

    // Get response as text first to debug
    const rawText = await response.text();
    console.log('[API] Raw response (first 500 chars):', rawText.substring(0, 500));

    let data;
    try {
      data = JSON.parse(rawText);
    } catch (parseError) {
      console.error('[API] JSON parse failed:', parseError.message);
      res.status(502).json({
        success: false,
        error: 'ChatGPT returned invalid response. The session token may be expired.',
        rawResponse: rawText.substring(0, 200)
      });
      return;
    }

    console.log('[API] Parsed data keys:', Object.keys(data));

    // Extract URL
    let url = data.url || data.stripe_hosted_url || data.checkout_url || data.redirect_url || '';

    if (!url && data.payment_url) {
      url = data.payment_url;
    }

    if (!url) {
      // Maybe the response has the URL nested somewhere
      url = data.charges_url || data.next_action?.redirect_to_url?.url || '';
    }

    if (url) {
      console.log('[API] SUCCESS - Got URL:', url.substring(0, 100));
      res.status(200).json({
        success: true,
        url: url,
        checkoutUrl: url,
        stripeUrl: url,
        message: 'Stripe UPI checkout URL generated'
      });
    } else {
      console.log('[API] No URL in response. Full data:', JSON.stringify(data).substring(0, 500));
      res.status(400).json({
        success: false,
        error: 'No checkout URL in response. Account may already have Plus or token is invalid.',
        details: {
          status: response.status,
          hasUrl: !!url,
          responseKeys: Object.keys(data)
        }
      });
    }

  } catch (error) {
    console.error('[API] Fatal error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error: ' + error.message
    });
  }
}
