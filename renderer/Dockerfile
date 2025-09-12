FROM python:3.11-slim

WORKDIR /app

# Install dependencies
RUN pip install fastapi uvicorn

# Copy application
COPY app_simple.py app.py

# Set environment
ENV PORT=8080

# Run the application
CMD ["python", "app.py"]