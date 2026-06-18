// This is a Serverless Function - it MUST export a handler
// No external dependencies needed

module.exports = async (req, res) => {
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Handle preflight OPTIONS request
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // Only allow POST
    if (req.method !== 'POST') {
        return res.status(405).json({ 
            success: false, 
            error: 'Method not allowed. Use POST.' 
        });
    }

    try {
        const { accessToken } = req.body;

        // Validate input
        if (!accessToken) {
            return res.status(400).json({
                success: false,
                error: 'accessToken required. Get from chatgpt.com/api/auth/session'
            });
        }

        console.log('[API] Generating UPI QR...');

        // ChatGPT's UPI payment API
        const payload = {
            plan_name: 'chatgptplusplan',
            billing_details: {
                country: 'IN',
                currency: 'INR'
            },
            promo_code: null,
            cancel_url: 'https://chatgpt.com/',
            checkout_ui_mode: 'redirect',
            payment_methods: ['upi']
        };

        // Try both ChatGPT endpoints
        const endpoints = [
            'https://chatgpt.com/backend-api/payments/checkout',
            'https://chat.openai.com/backend-api/payments/checkout'
        ];

        let checkoutUrl = '';
        let paymentId = '';

        for (const endpoint of endpoints) {
            try {
                const response = await fetch(endpoint, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${accessToken}`,
                        'Content-Type': 'application/json',
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                        'Origin': 'https://chatgpt.com',
                        'Referer': 'https://chatgpt.com/'
                    },
                    body: JSON.stringify(payload)
                });

                const data = await response.json();

                if (response.ok && data) {
                    checkoutUrl = data.url || data.checkout_url || data.redirect_url || data.stripe_hosted_url || '';
                    paymentId = data.id || data.payment_id || data.checkout_id || '';
                    if (checkoutUrl) {
                        console.log('[API] Got URL from', endpoint);
                        break;
                    }
                }
            } catch (e) {
                console.log('[API] Endpoint failed:', e.message);
            }
        }

        // If no URL found, return error
        if (!checkoutUrl) {
            return res.status(500).json({
                success: false,
                error: 'Could not generate UPI QR. Try refreshing your session.'
            });
        }

        // Success - return JSON
        return res.status(200).json({
            success: true,
            paymentId: paymentId || 'CHK-' + Date.now().toString(36).toUpperCase(),
            url: checkoutUrl,
            checkoutUrl: checkoutUrl,
            message: 'UPI QR generated successfully'
        });

    } catch (error) {
        console.error('[API] Error:', error);
        return res.status(500).json({
            success: false,
            error: error.message || 'Internal server error'
        });
    }
};
