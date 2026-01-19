FROM python:3.11-slim

WORKDIR /app

# Copy and install shared package first
COPY shared/ /app/shared/
RUN pip install --no-cache-dir /app/shared/

# Install additional dependencies
COPY log-generator/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy generator code
COPY log-generator/*.py .

# Run the generator
CMD ["python", "-u", "generator.py"]
