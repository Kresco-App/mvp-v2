from pydantic import BaseModel


class CheckoutOut(BaseModel):
    checkout_url: str


class VerifyOut(BaseModel):
    is_pro: bool
