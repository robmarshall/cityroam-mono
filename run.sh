#!/bin/bash
# Usage: ./run.sh [plan] [max_iterations]
# Builds and starts the Docker container, then runs the loop with any arguments passed through.

docker compose up -d --build && docker compose exec dev bash -c "./loop.sh $*"
