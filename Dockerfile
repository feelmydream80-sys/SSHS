FROM python:3.11-slim-bookworm

WORKDIR /app

RUN apt-get update && apt-get install -y \
    libgl1 libglib2.0-0 curl && \
    rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY server.py analyzer.py config.json .
COPY sangsan_meal/ sangsan_meal/

RUN curl -L -o best.pt \
    https://raw.githubusercontent.com/feelmydream80-sys/SSHS/master/best.pt

ENV PORT=7860
ENV CUDA_VISIBLE_DEVICES="-1"
ENV OMP_NUM_THREADS="1"
ENV MKL_NUM_THREADS="1"
ENV OPENBLAS_NUM_THREADS="1"

EXPOSE 7860

CMD gunicorn server:app --bind 0.0.0.0:$PORT --workers 1 --timeout 600
