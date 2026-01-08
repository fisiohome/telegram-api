# use the official Bun image
FROM oven/bun:1 AS base
WORKDIR /app

# install all dependencies (dev and prod) in one go
COPY package.json bun.lockb ./
RUN bun install --frozen-lockfile

# copy project files
COPY . .

# build the application
ENV NODE_ENV=production
RUN bun run build

# expose port
EXPOSE 5000/tcp

# run the app
CMD [ "bun", "run", "dist/main.js" ]
