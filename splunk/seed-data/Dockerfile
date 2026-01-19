FROM python:3.11-slim

WORKDIR /app

# Copy and install shared package first
COPY shared/ /app/shared/
RUN pip install --no-cache-dir /app/shared/

# Install additional dependencies (if any beyond shared package)
COPY seed-data/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy seeder code
COPY seed-data/*.py .

# Run the seeder
CMD ["python", "-u", "seed_splunk.py"]
