FROM python:3.11-slim

WORKDIR /app

RUN apt-get update -y \
  && apt-get install -y --no-install-recommends build-essential libglib2.0-0 libgl1 \
  && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app

ENV FACE_AI_MODEL_NAME=buffalo_l
ENV FACE_AI_DETECTION_SIZE=640
ENV FACE_AI_DEVICE=cpu

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
