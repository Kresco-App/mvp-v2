# Stripe Integration Guide

## Overview
Stripe handles Pro subscription payments. Users pay monthly/yearly to unlock premium content.

---

## Step 1: Create a Stripe Account
1. Sign up at https://stripe.com
2. Go to **Developers → API Keys** and copy:
   - `STRIPE_SECRET_KEY` (starts with `sk_test_...`)
   - `STRIPE_PUBLISHABLE_KEY` (starts with `pk_test_...`)
3. Add to `.env`:
   ```
   STRIPE_SECRET_KEY=sk_test_...
   STRIPE_PUBLISHABLE_KEY=pk_test_...
   STRIPE_WEBHOOK_SECRET=whsec_...
   ```

---

## Step 2: Create Products in Stripe Dashboard
1. **Products → Add product**
2. Create two prices:
   - Monthly Pro: 99 MAD/month → copy Price ID (`price_xxx`)
   - Yearly Pro: 799 MAD/year → copy Price ID (`price_yyy`)
3. Add to `.env`:
   ```
   STRIPE_MONTHLY_PRICE_ID=price_xxx
   STRIPE_YEARLY_PRICE_ID=price_yyy
   ```

---

## Step 3: Install Stripe in Backend
```bash
cd backend
source venv/bin/activate
pip install stripe
echo "stripe" >> requirements.txt
```

---

## Step 4: Backend Subscription Endpoints
Create `backend/payments/api.py`:

```python
import stripe
from django.conf import settings
from ninja import Router
from users.auth import jwt_auth

stripe.api_key = settings.STRIPE_SECRET_KEY
router = Router(auth=jwt_auth)

@router.post("/create-checkout-session")
def create_checkout(request, plan: str):  # plan: 'monthly' | 'yearly'
    price_id = (settings.STRIPE_MONTHLY_PRICE_ID if plan == 'monthly'
                else settings.STRIPE_YEARLY_PRICE_ID)

    session = stripe.checkout.Session.create(
        payment_method_types=['card'],
        mode='subscription',
        line_items=[{'price': price_id, 'quantity': 1}],
        customer_email=request.auth.email,
        metadata={'user_id': request.auth.id},
        success_url='https://yourapp.com/pricing?success=1',
        cancel_url='https://yourapp.com/pricing?canceled=1',
    )
    return {"checkout_url": session.url}


@router.post("/webhook", auth=None)
def stripe_webhook(request):
    payload = request.body
    sig_header = request.headers.get('stripe-signature')

    try:
        event = stripe.Webhook.construct_event(
            payload, sig_header, settings.STRIPE_WEBHOOK_SECRET
        )
    except (ValueError, stripe.error.SignatureVerificationError):
        return {"error": "Invalid"}, 400

    if event['type'] == 'checkout.session.completed':
        session = event['data']['object']
        user_id = session['metadata']['user_id']
        from users.models import User
        User.objects.filter(id=user_id).update(is_pro=True)

    elif event['type'] in ('customer.subscription.deleted', 'invoice.payment_failed'):
        customer_email = event['data']['object'].get('customer_email', '')
        from users.models import User
        User.objects.filter(email=customer_email).update(is_pro=False)

    return {"ok": True}
```

Register in `core/api.py`:
```python
from payments.api import router as payments_router
api.add_router("/payments/", payments_router)
```

---

## Step 5: Frontend Checkout Button
```tsx
// In your pricing page:
async function handleSubscribe(plan: 'monthly' | 'yearly') {
  const res = await api.post('/payments/create-checkout-session', null, {
    params: { plan }
  })
  window.location.href = res.data.checkout_url  // Redirect to Stripe hosted page
}
```

---

## Step 6: Stripe Webhook (Local Testing)
```bash
# Install Stripe CLI
brew install stripe/stripe-cli/stripe

# Login
stripe login

# Forward webhooks to local backend
stripe listen --forward-to localhost:8000/api/payments/webhook
```

Copy the webhook signing secret printed and set:
```
STRIPE_WEBHOOK_SECRET=whsec_...
```

---

## Step 7: Production Webhook
1. In Stripe Dashboard → **Webhooks → Add endpoint**
2. URL: `https://api.yourapp.com/api/payments/webhook`
3. Events to listen:
   - `checkout.session.completed`
   - `customer.subscription.deleted`
   - `invoice.payment_failed`
4. Copy the signing secret → set `STRIPE_WEBHOOK_SECRET` in production env.

---

## Step 8: Customer Portal (Manage Subscription)
```python
@router.post("/customer-portal")
def customer_portal(request):
    # Find or create Stripe customer
    customers = stripe.Customer.list(email=request.auth.email).data
    if not customers:
        return {"error": "No subscription found"}, 404
    customer = customers[0]

    session = stripe.billing_portal.Session.create(
        customer=customer.id,
        return_url='https://yourapp.com/profile',
    )
    return {"portal_url": session.url}
```

---

## Testing Cards
| Card | Result |
|------|--------|
| `4242 4242 4242 4242` | Success |
| `4000 0000 0000 9995` | Declined |
| `4000 0027 6000 3184` | 3D Secure required |

Use any future expiry date, any 3-digit CVC, any ZIP.

---

## MAD Currency Note
Stripe supports Moroccan Dirham (MAD). Set currency when creating prices:
```python
stripe.Price.create(
    unit_amount=9900,  # 99.00 MAD in centimes
    currency="mad",
    recurring={"interval": "month"},
    product=product_id,
)
```
