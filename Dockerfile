FROM ubuntu:24.04

# Ensure UTC timezone for consistent date handling (defense-in-depth)
ENV TZ=UTC

RUN apt-get update && apt-get install -y \
    curl \
    git \
    build-essential \
    sudo \
    jq \
    bc

# Install Node.js
RUN curl -fsSL https://deb.nodesource.com/setup_lts.x | bash - \
    && apt-get install -y nodejs

# Install Claude Code
RUN npm install -g @anthropic-ai/claude-code

# Delete existing user with UID 1000, then create dev user
RUN userdel -r ubuntu 2>/dev/null || true && \
    useradd -m -s /bin/bash -u 1000 dev && \
    echo 'dev ALL=(ALL) NOPASSWD:ALL' >> /etc/sudoers

USER dev
WORKDIR /workspace

CMD ["bash"]