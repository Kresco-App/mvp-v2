# AWS Deployment Guide (Zappa + RDS + CloudFront)

## Architecture
```
CloudFront CDN → S3 (Next.js static) + API Gateway → Lambda (Django/Zappa) → RDS PostgreSQL
```

---

## Prerequisites
- AWS account with IAM user (AdministratorAccess for setup)
- `aws configure` with your credentials
- `pip install zappa` in your virtualenv

---

## Part 1: RDS PostgreSQL

### 1.1 Create the database
```bash
# Via AWS Console:
# RDS → Create database → PostgreSQL 16
# Template: Free tier / Production
# DB identifier: kresco-db
# Master username: postgres
# Master password: <strong password>
# DB instance class: db.t3.micro (free tier) or db.t3.small (prod)
# Storage: 20 GB gp2
# VPC: default VPC
# Public access: Yes (for initial setup; disable later)
# VPC security group: Create new → allow port 5432
```

### 1.2 Allow your IP (dev only)
In EC2 → Security Groups → your RDS security group:
- Add inbound rule: PostgreSQL (5432) → My IP

### 1.3 Allow Lambda access (production)
Add inbound rule: PostgreSQL (5432) → your Lambda security group (created in 2.x below).

### 1.4 Update .env
```
DATABASE_URL=postgresql://postgres:<password>@<rds-endpoint>:5432/postgres
```

### 1.5 Run migrations
```bash
cd backend
source venv/bin/activate
python manage.py migrate
python manage.py createsuperuser
python manage.py seed_data
```

---

## Part 2: Django on AWS Lambda with Zappa

### 2.1 Install Zappa
```bash
cd backend
source venv/bin/activate
pip install zappa
```

### 2.2 Create `zappa_settings.json`
```json
{
  "production": {
    "django_settings": "core.settings",
    "project_name": "kresco",
    "runtime": "python3.11",
    "s3_bucket": "kresco-zappa-deployments",
    "aws_region": "eu-north-1",
    "environment_variables": {
      "DATABASE_URL": "postgresql://postgres:<pass>@<rds-endpoint>:5432/postgres",
      "JWT_SECRET_KEY": "your-secret-key",
      "GOOGLE_CLIENT_ID": "your-google-client-id",
      "VDOCIPHER_API_SECRET": "your-vdocipher-secret",
      "DJANGO_SETTINGS_MODULE": "core.settings"
    },
    "cors": true,
    "timeout_seconds": 30,
    "memory_size": 512,
    "vpc_config": {
      "SubnetIds": ["subnet-xxxxxxxx"],
      "SecurityGroupIds": ["sg-xxxxxxxx"]
    }
  }
}
```

### 2.3 Deploy
```bash
# First deployment:
zappa deploy production

# Subsequent updates:
zappa update production

# Run management commands on Lambda:
zappa manage production migrate
zappa manage production "seed_data"
```

### 2.4 Set custom domain
```bash
# In API Gateway → Custom domain names → create domain
# Point your DNS CNAME to the API Gateway URL
# Example: api.kresco.ma → xyz.execute-api.eu-north-1.amazonaws.com
```

---

## Part 3: Next.js Frontend on Vercel (recommended)

### 3.1 Deploy to Vercel
```bash
cd frontend
npm i -g vercel
vercel
```

### 3.2 Set environment variables in Vercel dashboard
```
NEXT_PUBLIC_API_BASE_URL=https://api.kresco.ma/api/
NEXT_PUBLIC_GOOGLE_CLIENT_ID=your-google-client-id
```

---

## Part 3b: Frontend on S3 + CloudFront (alternative)

### 3b.1 Build
```bash
cd frontend
npm run build
```

### 3b.2 Create S3 bucket
```bash
aws s3 mb s3://kresco-frontend --region eu-north-1
aws s3 website s3://kresco-frontend --index-document index.html --error-document index.html
```

### 3b.3 Upload build
```bash
aws s3 sync out/ s3://kresco-frontend --delete
```

### 3b.4 Create CloudFront distribution
- Origin: your S3 bucket website endpoint
- Default root object: `index.html`
- Error pages: 404 → /index.html (for SPA routing)
- Enable HTTPS

---

## Part 4: S3 for Media (optional)
```bash
aws s3 mb s3://kresco-media --region eu-north-1

# In settings.py:
DEFAULT_FILE_STORAGE = 'storages.backends.s3boto3.S3Boto3Storage'
AWS_STORAGE_BUCKET_NAME = 'kresco-media'
AWS_S3_REGION_NAME = 'eu-north-1'
```

---

## Monitoring
- CloudWatch Logs: `/aws/lambda/kresco-production`
- Zappa tail logs: `zappa tail production`
- RDS Performance Insights: enabled in AWS Console

---

## Cost Estimate (light traffic)
| Service | Monthly |
|---------|---------|
| Lambda (1M invocations) | ~$0.20 |
| RDS db.t3.micro | ~$15 |
| CloudFront 10GB | ~$0.85 |
| API Gateway | ~$3.50 |
| **Total** | **~$20/mo** |
