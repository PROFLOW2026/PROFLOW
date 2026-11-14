FROM python:3.12-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends git build-essential ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY tools/install_libredwg.sh tools/install_libredwg.sh
RUN bash tools/install_libredwg.sh /usr/local
COPY requirements.txt requirements-dwg.txt ./
RUN pip install --no-cache-dir -r requirements.txt && if [ -f requirements-dwg.txt ]; then pip install --no-cache-dir -r requirements-dwg.txt; fi
COPY takeoff_worker takeoff_worker
COPY pyproject.toml .

FROM python:3.12-slim
RUN useradd -m -u 10001 worker
WORKDIR /app
COPY --from=build /usr/local /usr/local
COPY --from=build /app /app
ENV PYTHONUNBUFFERED=1 TAKEOFF_WORKER_CONCURRENCY=2
USER worker
EXPOSE 8765
CMD ["python", "-m", "takeoff_worker.server", "--host", "0.0.0.0", "--port", "8765"]