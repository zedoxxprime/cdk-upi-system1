export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept');
  res.setHeader('Access-Control-Max-Age', '86400');

  // Handle preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Only POST allowed
  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      error: 'Only POST method is allowed'
    });
  }

  try {
    const { accessToken, cdkKey, sessionData } = req.body || {};

    // Validate access token
    if (!accessToken) {
      return res.status(400).json({
        success: false,
        error: 'Access token is required. Get it from: https://chatgpt.com/api/auth/session'
      });
    }

    console.log('[Zedox API] Processing checkout request...');
    console.log('[Zedox API] User:', sessionData?.user?.email || 'unknown');

    // Exact payload that works with ChatGPT's backend API
    const checkoutPayload = {
      plan_name: "chatgptplusplan",
      billing_details: {
        country: "IN",
        currency: "INR"
      },
      promo_code: null,
      cancel_url: "https://chatgpt.com/",
      checkout_ui_mode: "redirect"
    };

    let checkoutUrl = '';
    let lastError = null;
    let lastResponse = null;

    // Try multiple endpoints with different header combinations
    const endpoints = [
      {
        url: 'https://chatgpt.com/backend-api/payments/checkout',
        origin: 'https://chatgpt.com',
        referer: 'https://chatgpt.com/'
      },
      {
        url: 'https://chat.openai.com/backend-api/payments/checkout',
        origin: 'https://chat.openai.com',
        referer: 'https://chat.openai.com/'
      }
    ];

    for (const endpoint of endpoints) {
      try {
        console.log(`[Zedox API] Trying: ${endpoint.url}`);

        const response = await fetch(endpoint.url, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
            'Origin': endpoint.origin,
            'Referer': endpoint.referer,
            'Accept': 'application/json, text/plain, */*',
            'Accept-Language': 'en-US,en;q=0.9',
            'sec-ch-ua': '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
            'sec-ch-ua-mobile': '?0',
            'sec-ch-ua-platform': '"Windows"'
          },
          body: JSON.stringify(checkoutPayload)
        });

        const responseData = await response.json().catch(() => ({}));
        
        console.log(`[Zedox API] Response status: ${response.status}`);
        console.log(`[Zedox API] Response keys:`, Object.keys(responseData));
        
        lastResponse = responseData;

        // Check for URL in response
        if (response.ok || response.status === 200 || response.status === 201) {
          checkoutUrl = responseData.url 
            || responseData.stripe_hosted_url 
            || responseData.checkout_url 
            || responseData.redirect_url
            || responseData.payment_url
            || responseData.charges_url
            || '';

          if (checkoutUrl) {
            console.log(`[Zedox API] ✅ Got checkout URL from ${endpoint.url}`);
            break;
          }
        }

        // Handle specific error cases
        if (responseData.error) {
          lastError = responseData.error;
          console.log(`[Zedox API] Error from ${endpoint.url}:`, responseData.error);
        }

        // Check if user already has subscription
        if (response.status === 409 || responseData.code === 'already_subscribed') {
          return res.status(400).json({
            success: false,
            error: 'This account already has an active ChatGPT Plus subscription.',
            alreadySubscribed: true
          });
        }

      } catch (fetchError) {
        console.log(`[Zedox API] Network error for ${endpoint.url}:`, fetchError.message);
        lastError = fetchError.message;
      }
    }

    // If no URL found
    if (!checkoutUrl) {
      console.log('[Zedox API] ❌ Failed to get checkout URL');
      console.log('[Zedox API] Last response:', JSON.stringify(lastResponse).substring(0, 500));
      console.log('[Zedox API] Last error:', lastError);

      return res.status(400).json({
        success: false,
        error: 'Could not generate Stripe checkout URL. ' + 
               'Possible reasons: account already has Plus, invalid session token, or region restriction. ' +
               'Please ensure you are logged into ChatGPT and the session is fresh.',
        details: {
          lastError: lastError || 'Unknown error',
          lastResponse: lastResponse || null
        }
      });
    }

    // Generate checkout ID
    const checkoutId = 'CHK-' + Date.now().toString(36).toUpperCase() + 
                       '-' + Math.random().toString(36).substring(2, 6).toUpperCase();

    console.log(`[Zedox API] ✅ Success! Checkout URL generated`);
    console.log(`[Zedox API] Checkout ID: ${checkoutId}`);

    return res.status(200).json({
      success: true,
      checkoutId: checkoutId,
      url: checkoutUrl,
      checkoutUrl: checkoutUrl,
      stripeUrl: checkoutUrl,
      message: '✅ Stripe UPI checkout URL generated successfully! Scan the QR code with any UPI app.',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('[Zedox API] Fatal error:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error: ' + error.message,
      timestamp: new Date().toISOString()
    });
  }
}
