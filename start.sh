#!/bin/bash
# Kresco Platform - Start both servers

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "=== Kresco E-Learning Platform ==="
echo ""

# Start Django backend
echo "Starting Django backend on http://localhost:8000 ..."
cd "$SCRIPT_DIR/backend"
venv/bin/python manage.py migrate --run-syncdb 2>/dev/null || true
venv/bin/python manage.py runserver 0.0.0.0:8000 &
BACKEND_PID=$!

echo "Backend PID: $BACKEND_PID"
echo ""

# Start Next.js frontend
echo "Starting Next.js frontend on http://localhost:3000 ..."
cd "$SCRIPT_DIR/frontend"
npm run dev &
FRONTEND_PID=$!

echo "Frontend PID: $FRONTEND_PID"
echo ""
echo "=== Platform running ==="
echo "  Frontend: http://localhost:3000"
echo "  Backend:  http://localhost:8000"
echo "  API Docs: http://localhost:8000/api/docs"
echo "  Admin:    http://localhost:8000/admin"
echo ""
echo "Press Ctrl+C to stop all servers."

# Wait and cleanup on exit
trap "echo 'Stopping...'; kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit 0" INT TERM
wait
