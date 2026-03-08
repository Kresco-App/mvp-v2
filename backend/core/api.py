from ninja import NinjaAPI
from ninja.errors import HttpError

api = NinjaAPI(
    title="Kresco API",
    version="1.0.0",
    description="Kresco E-Learning Platform API",
    docs_url="/docs",
)

# ── Import and register all routers ──────────────────────────────────────────
from users.api import router as users_router
from courses.api import router as courses_router
from quizzes.api import router as quizzes_router
from gamification.api import router as gamification_router
from interactions.api import router as interactions_router
from payments.api import router as payments_router

api.add_router("/", users_router, tags=["Auth & Users"])
api.add_router("/courses/", courses_router, tags=["Courses"])
api.add_router("/quizzes/", quizzes_router, tags=["Quizzes"])
api.add_router("/progress/", gamification_router, tags=["Progress"])
api.add_router("/interactions/", interactions_router, tags=["Interactions"])
api.add_router("/payments/", payments_router, tags=["Payments"])
