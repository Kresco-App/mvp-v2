from pydantic import BaseModel


class CheckoutCreateIn(BaseModel):
    plan: str = "pro"
    success_path: str = "/payment-success?session_id={CHECKOUT_SESSION_ID}"
    cancel_path: str = "/pricing"


class CheckoutOut(BaseModel):
    checkout_url: str


class VerifyOut(BaseModel):
    is_pro: bool
