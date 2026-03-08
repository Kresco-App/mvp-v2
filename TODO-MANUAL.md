# Kresco — Manual Action Items (Owner: Taha)

These items require your credentials, assets, or admin access and cannot be fixed programmatically.

---

## 1. Add Stripe Keys to Backend .env

**File:** `/backend/.env`

Add these 3 lines (get values from https://dashboard.stripe.com/test/apikeys):

```
STRIPE_SK=sk_test_XXXXXXXXXXXXXXXXXXXXXXXX
STRIPE_PK=pk_test_XXXXXXXXXXXXXXXXXXXXXXXX
STRIPE_PRODUCT_ID=prod_XXXXXXXXXXXXXXXX
```

To get the Product ID:
1. Go to https://dashboard.stripe.com/test/products
2. Click "Add product" -> Name: "Kresco Pro", Price: 99 MAD/month
3. Copy the `prod_XXXX` ID from the URL

After adding, restart the backend: `cd backend && source venv/bin/activate && python manage.py runserver`

---

## 2. Add Subject Thumbnails

All 6 subjects have `thumbnail_url = ""`. You need to either:

**Option A — Upload images:**
1. Place 6 images in `frontend/public/subjects/` (e.g. `maths.jpg`, `physique.jpg`, etc.)
2. Go to Django admin: http://localhost:8000/admin/courses/subject/
3. Set each subject's thumbnail_url to `/subjects/maths.jpg` etc.

**Option B — Use external URLs:**
1. Upload images to any CDN/S3
2. Set the thumbnail_url in Django admin

---

## 3. Add Course Content via Django Admin

The following content types have 0 entries in the database:

### Activities (interactive exercises per lesson)
1. http://localhost:8000/admin/courses/activity/
2. Add activities linked to specific lessons
3. Choose type: drag_and_drop, matching, fill_in_blank, true_false, ordering, simulator
4. Fill `config_json` with the exercise data (see format below)

**Config JSON formats:**

```json
// true_false
{"statement": "La derivee de x^2 est 2x", "correct": true, "explanation": "Par la regle de puissance"}

// fill_in_blank
{"sentence": "La derivee de sin(x) est {{blank}}", "answer": "cos(x)", "hint": "Fonction trigonometrique"}

// matching
{"pairs": [{"id": "1", "left": "sin(0)", "right": "0"}, {"id": "2", "left": "cos(0)", "right": "1"}]}

// ordering
{"items": [{"id": "1", "text": "Etape 1"}, {"id": "2", "text": "Etape 2"}], "correctOrder": ["1", "2"]}

// drag_and_drop
{"items": [{"id": "1", "text": "2x", "zone": "Derivees"}], "zones": ["Derivees", "Integrales"]}

// simulator
{"simulator_type": "wave"}  // or "prism" or "diffraction"
```

### Course PDFs (downloadable supports per lesson)
1. http://localhost:8000/admin/courses/coursepdf/
2. Upload PDF files or set S3 URLs
3. Link each PDF to a lesson

### Video Quiz Triggers (mid-video quiz popups)
1. http://localhost:8000/admin/gamification/videoquiztrigger/
2. Set: lesson, timestamp_seconds, quiz, is_blocking
3. Example: Quiz at 300 seconds into Lesson 1

### More Quizzes
Currently only 3 quizzes for 39 lessons. Add quizzes for more lessons via:
1. http://localhost:8000/admin/quizzes/quiz/
2. Add quiz -> link to lesson -> add questions with options

---

## 4. Create Django Superuser (if you don't have one)

```bash
cd backend && source venv/bin/activate
python manage.py createsuperuser
# Enter: admin email, password
```

Then access admin at http://localhost:8000/admin/

---

## 5. Production Deployment Checklist (Later)

- [ ] Swap Stripe test keys to live keys
- [ ] Set `DEBUG=False` in .env
- [ ] Set proper `ALLOWED_HOSTS`
- [ ] Set proper `CORS_ALLOWED_ORIGINS` (your domain)
- [ ] Configure real VdoCipher API secret
- [ ] Set up Stripe webhook for subscription management
- [ ] Open RDS security group to your server IP
- [ ] Set up proper domain + HTTPS
